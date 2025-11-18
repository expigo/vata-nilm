"""
Real-time and Historical Disaggregation Engines
"""

import numpy as np
import time
from datetime import datetime
from typing import Dict, List, Any
import logging

from algorithms import get_algorithm
from database import (
    get_appliances_from_db,
    save_disaggregation_result,
    get_models_from_db,
    create_job,
    update_job_status,
    get_job_by_id
)

logger = logging.getLogger(__name__)


class RealTimeDisaggregator:
    """Handles real-time disaggregation of power readings"""

    def __init__(self):
        self.algorithms = {}
        self.appliances_cache = {}
        self.models_loaded = False

    def load_models(self):
        """Load pre-trained models for all algorithms"""
        try:
            # Initialize all algorithms
            self.algorithms = {
                "CO": get_algorithm("CO"),
                "FHMM": get_algorithm("FHMM"),
                "Seq2Point": get_algorithm("Seq2Point"),
                "Seq2Seq": get_algorithm("Seq2Seq"),
                "BERT4NILM": get_algorithm("BERT4NILM")
            }

            logger.info("Algorithms initialized")
            self.models_loaded = True

        except Exception as e:
            logger.error(f"Error loading models: {e}")
            raise

    async def disaggregate(
        self,
        reading: Dict[str, Any],
        algorithm: str,
        user_id: int = None
    ) -> Dict[str, Any]:
        """
        Perform real-time disaggregation on a single reading

        Args:
            reading: Power reading data
            algorithm: Algorithm to use
            user_id: Optional user ID for user-specific models

        Returns:
            Disaggregation results with appliance breakdown
        """
        start_time = time.time()

        try:
            # Get appliances for this device
            from database import get_db

            with get_db() as db:
                appliances = await get_appliances_from_db(
                    db=db,
                    user_id=user_id,
                    site_type=reading['site_type'],
                    is_global=user_id is None
                )

            if not appliances:
                logger.warning(f"No appliances found for {reading['site_type']}")
                return {
                    "timestamp": reading['timestamp'],
                    "device_id": reading['device_id'],
                    "algorithm": algorithm,
                    "total_power": reading['power_total'],
                    "appliances": [],
                    "processing_time_ms": (time.time() - start_time) * 1000,
                    "unassigned_power": reading['power_total']
                }

            # Get or initialize algorithm
            algo = self.algorithms.get(algorithm)
            if not algo:
                raise ValueError(f"Algorithm {algorithm} not initialized")

            # Train if not trained (using appliance signatures)
            if not algo.is_trained:
                algo.train({}, appliances)

            # Prepare data for prediction
            aggregate_power = np.array([reading['power_total']])

            # Perform disaggregation
            power_predictions = algo.predict(aggregate_power)
            state_predictions = algo.predict_states(aggregate_power)

            # Build response
            appliance_results = []
            total_disaggregated = 0

            for appliance in appliances:
                app_id = appliance['id']

                if app_id in power_predictions:
                    power = float(power_predictions[app_id][0])
                    state = state_predictions[app_id][0]

                    # Only include if significant power
                    if power > 5:  # watts threshold
                        confidence = self._calculate_confidence(
                            power,
                            appliance,
                            reading['power_total']
                        )

                        appliance_results.append({
                            "appliance_id": app_id,
                            "appliance_name": appliance['name'],
                            "category": appliance['category_name'],
                            "power_watts": round(power, 2),
                            "state": state,
                            "confidence": round(confidence, 4)
                        })

                        total_disaggregated += power

                        # Save to database (async)
                        try:
                            with get_db() as db:
                                await save_disaggregation_result(
                                    db=db,
                                    timestamp=reading['timestamp'],
                                    device_id=reading['device_id'],
                                    site_type=reading['site_type'],
                                    appliance_id=app_id,
                                    algorithm=algorithm,
                                    power_watts=power,
                                    state=state,
                                    state_confidence=confidence,
                                    processing_time_ms=int((time.time() - start_time) * 1000)
                                )
                        except Exception as e:
                            logger.error(f"Error saving result: {e}")

            processing_time = (time.time() - start_time) * 1000

            return {
                "timestamp": reading['timestamp'],
                "device_id": reading['device_id'],
                "algorithm": algorithm,
                "total_power": reading['power_total'],
                "appliances": appliance_results,
                "processing_time_ms": round(processing_time, 2),
                "unassigned_power": round(reading['power_total'] - total_disaggregated, 2)
            }

        except Exception as e:
            logger.error(f"Disaggregation error: {e}")
            raise

    def _calculate_confidence(
        self,
        predicted_power: float,
        appliance: Dict,
        total_power: float
    ) -> float:
        """Calculate confidence score for prediction"""

        # Base confidence from appliance signature
        base_confidence = appliance.get('confidence_score', 0.7)

        # Adjust based on power match
        nominal_power = appliance.get('nominal_power', 0)
        if nominal_power > 0:
            power_ratio = predicted_power / nominal_power
            if 0.8 <= power_ratio <= 1.2:
                power_confidence = 0.95
            elif 0.5 <= power_ratio <= 1.5:
                power_confidence = 0.75
            else:
                power_confidence = 0.5
        else:
            power_confidence = 0.6

        # Adjust based on relative contribution
        if total_power > 0:
            contribution = predicted_power / total_power
            if contribution > 0.5:
                contribution_confidence = 0.9
            elif contribution > 0.2:
                contribution_confidence = 0.8
            else:
                contribution_confidence = 0.7
        else:
            contribution_confidence = 0.5

        # Weighted average
        confidence = (
            base_confidence * 0.4 +
            power_confidence * 0.4 +
            contribution_confidence * 0.2
        )

        return min(max(confidence, 0.0), 1.0)


class HistoricalDisaggregator:
    """Handles batch disaggregation of historical data"""

    def __init__(self):
        self.algorithms = {}

    async def create_job(
        self,
        db,
        device_id: str,
        site_type: str,
        start_timestamp: datetime,
        end_timestamp: datetime,
        algorithms: List[str],
        user_id: int = None
    ) -> int:
        """Create a disaggregation job"""

        job_id = await create_job(
            db=db,
            user_id=user_id,
            job_type="HISTORICAL",
            algorithm=",".join(algorithms),
            device_id=device_id,
            site_type=site_type,
            start_timestamp=start_timestamp,
            end_timestamp=end_timestamp
        )

        logger.info(f"Created disaggregation job {job_id}")
        return job_id

    async def process_job(self, job_id: int, db):
        """Process a batch disaggregation job"""

        try:
            # Update status to running
            await update_job_status(db, job_id, "running", progress=0)

            # Get job details
            job = await get_job_by_id(db, job_id)

            if not job:
                raise ValueError(f"Job {job_id} not found")

            # Get historical data from database
            from database import get_connection

            with get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        SELECT
                            timestamp,
                            device_id,
                            site_type,
                            raw_json
                        FROM mqtt_messages
                        WHERE device_id = %s
                          AND site_type = %s
                          AND timestamp BETWEEN %s AND %s
                        ORDER BY timestamp
                    """, (
                        job['device_id'],
                        job['site_type'],
                        job['start_timestamp'],
                        job['end_timestamp']
                    ))

                    data = cur.fetchall()

            if not data:
                await update_job_status(
                    db, job_id, "completed", progress=100,
                    error_message="No data found for specified time range"
                )
                return

            total_samples = len(data)
            logger.info(f"Processing {total_samples} samples for job {job_id}")

            # Get appliances
            appliances = await get_appliances_from_db(
                db=db,
                user_id=job['user_id'],
                site_type=job['site_type']
            )

            # Process each algorithm
            algorithms = job['algorithm'].split(',')

            for algo_name in algorithms:
                algo = get_algorithm(algo_name)

                # Train if needed
                if not algo.is_trained:
                    algo.train({}, appliances)

                # Process in batches
                batch_size = 1000
                processed = 0

                for i in range(0, total_samples, batch_size):
                    batch = data[i:i + batch_size]

                    # Extract power values
                    aggregate_power = []
                    timestamps = []

                    for row in batch:
                        raw_json = row['raw_json']
                        nmid_data = raw_json.get('NMID_1-18', [])

                        if len(nmid_data) >= 9:
                            power_total = sum(nmid_data[6:9])  # L1 + L2 + L3
                            aggregate_power.append(power_total)
                            timestamps.append(row['timestamp'])

                    if not aggregate_power:
                        continue

                    # Disaggregate batch
                    power_array = np.array(aggregate_power)
                    predictions = algo.predict(power_array)
                    states = algo.predict_states(power_array)

                    # Save results
                    for j, timestamp in enumerate(timestamps):
                        for app_id in predictions:
                            power = float(predictions[app_id][j])
                            state = states[app_id][j]

                            if power > 5:  # threshold
                                await save_disaggregation_result(
                                    db=db,
                                    timestamp=timestamp,
                                    device_id=job['device_id'],
                                    site_type=job['site_type'],
                                    appliance_id=app_id,
                                    algorithm=algo_name,
                                    power_watts=power,
                                    state=state,
                                    state_confidence=0.8,
                                    processing_time_ms=0
                                )

                    processed += len(batch)
                    progress = int((processed / total_samples) * 100)

                    # Update progress
                    await update_job_status(db, job_id, "running", progress=progress)

                    logger.info(f"Job {job_id}: {progress}% complete")

            # Mark as completed
            await update_job_status(db, job_id, "completed", progress=100)
            logger.info(f"Job {job_id} completed successfully")

        except Exception as e:
            logger.error(f"Job {job_id} failed: {e}")
            await update_job_status(
                db, job_id, "failed",
                error_message=str(e)
            )

    async def get_job_status(self, db, job_id: int):
        """Get job status"""
        return await get_job_by_id(db, job_id)
