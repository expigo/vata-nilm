"""
Dataset Loader for Public NILM Datasets
Supports REDD, UK-DALE, REFIT, etc.
"""

import os
import numpy as np
import pandas as pd
from typing import Dict, List, Tuple, Any
import logging

logger = logging.getLogger(__name__)


class DatasetLoader:
    """Loads and preprocesses public NILM datasets"""

    def __init__(self, data_dir: str = "./datasets"):
        self.data_dir = data_dir
        os.makedirs(data_dir, exist_ok=True)

    def available_datasets(self) -> List[Dict[str, str]]:
        """Get list of available datasets"""
        return [
            {
                "name": "REDD",
                "description": "Reference Energy Disaggregation Dataset",
                "houses": 6,
                "appliances": ["Refrigerator", "Dishwasher", "Microwave", "Washer Dryer", "Lighting"],
                "url": "http://redd.csail.mit.edu/"
            },
            {
                "name": "UK-DALE",
                "description": "UK Domestic Appliance-Level Electricity Dataset",
                "houses": 5,
                "appliances": ["Kettle", "Fridge", "Washing Machine", "Microwave", "Dishwasher"],
                "url": "https://jack-kelly.com/data/"
            },
            {
                "name": "REFIT",
                "description": "Personalised Retrofit Decision Support Tools for UK Homes",
                "houses": 20,
                "appliances": ["Fridge", "Freezer", "Washer Dryer", "Washing Machine", "Dishwasher"],
                "url": "https://pureportal.strath.ac.uk/en/datasets/refit-electrical-load-measurements"
            }
        ]

    async def download_dataset(self, dataset_name: str):
        """
        Download a public dataset
        Note: This is a placeholder - actual implementation would use NILMTK or direct downloads
        """
        logger.info(f"Downloading {dataset_name}...")

        if dataset_name == "REDD":
            await self._download_redd()
        elif dataset_name == "UK-DALE":
            await self._download_ukdale()
        elif dataset_name == "REFIT":
            await self._download_refit()
        else:
            raise ValueError(f"Unknown dataset: {dataset_name}")

        logger.info(f"{dataset_name} download complete")

    async def _download_redd(self):
        """Download REDD dataset"""
        # In practice, use NILMTK or direct download
        # For now, create placeholder
        dataset_path = os.path.join(self.data_dir, "REDD")
        os.makedirs(dataset_path, exist_ok=True)

        logger.info("REDD dataset prepared (placeholder)")

    async def _download_ukdale(self):
        """Download UK-DALE dataset"""
        dataset_path = os.path.join(self.data_dir, "UK-DALE")
        os.makedirs(dataset_path, exist_ok=True)

        logger.info("UK-DALE dataset prepared (placeholder)")

    async def _download_refit(self):
        """Download REFIT dataset"""
        dataset_path = os.path.join(self.data_dir, "REFIT")
        os.makedirs(dataset_path, exist_ok=True)

        logger.info("REFIT dataset prepared (placeholder)")

    def load_dataset(
        self,
        dataset_name: str,
        house_id: int = 1,
        appliances: List[str] = None
    ) -> Dict[str, Any]:
        """
        Load dataset for training
        Returns: {
            'aggregate': np.ndarray,
            'appliances': {appliance_name: np.ndarray},
            'sampling_rate': int,
            'timestamps': pd.DatetimeIndex
        }
        """
        logger.info(f"Loading {dataset_name} house {house_id}")

        if dataset_name == "REDD":
            return self._load_redd(house_id, appliances)
        elif dataset_name == "UK-DALE":
            return self._load_ukdale(house_id, appliances)
        elif dataset_name == "REFIT":
            return self._load_refit(house_id, appliances)
        else:
            raise ValueError(f"Unknown dataset: {dataset_name}")

    def _load_redd(self, house_id: int, appliances: List[str]) -> Dict[str, Any]:
        """
        Load REDD dataset
        This is a simplified version - in production, use NILMTK
        """
        # Placeholder - return synthetic data for now
        logger.warning("Using synthetic data for REDD (NILMTK not integrated)")

        # Generate synthetic aggregate and appliance data
        duration_hours = 24
        sampling_rate = 60  # seconds
        num_samples = duration_hours * 3600 // sampling_rate

        timestamps = pd.date_range('2024-01-01', periods=num_samples, freq=f'{sampling_rate}S')

        # Synthetic aggregate (realistic pattern)
        base_load = 300  # watts
        time_of_day = np.linspace(0, 24, num_samples)
        daily_pattern = 200 * (1 + np.sin(2 * np.pi * time_of_day / 24 - np.pi/2))
        noise = np.random.normal(0, 50, num_samples)
        aggregate = base_load + daily_pattern + noise

        # Synthetic appliances
        appliance_data = {}

        # Refrigerator (cyclic)
        fridge = np.zeros(num_samples)
        cycle_duration = 20  # minutes
        on_duration = 10
        cycle_samples = cycle_duration * 60 // sampling_rate
        on_samples = on_duration * 60 // sampling_rate

        for i in range(0, num_samples, cycle_samples):
            fridge[i:i+on_samples] = 150

        appliance_data['Refrigerator'] = fridge + np.random.normal(0, 5, num_samples)

        # Microwave (intermittent)
        microwave = np.zeros(num_samples)
        usage_times = [300, 720, 1080]  # morning, noon, evening
        for t in usage_times:
            if t < num_samples:
                microwave[t:t+5] = 1200  # 5 minutes at 1200W

        appliance_data['Microwave'] = microwave

        # Dishwasher (cycles)
        dishwasher = np.zeros(num_samples)
        start_idx = 400
        if start_idx + 60 < num_samples:
            # Heating phase
            dishwasher[start_idx:start_idx+20] = 1800
            # Wash phase
            dishwasher[start_idx+20:start_idx+40] = 500
            # Rinse
            dishwasher[start_idx+40:start_idx+60] = 300

        appliance_data['Dishwasher'] = dishwasher

        return {
            'aggregate': aggregate,
            'appliances': appliance_data,
            'sampling_rate': sampling_rate,
            'timestamps': timestamps,
            'metadata': {
                'dataset': 'REDD',
                'house': house_id,
                'synthetic': True
            }
        }

    def _load_ukdale(self, house_id: int, appliances: List[str]) -> Dict[str, Any]:
        """Load UK-DALE dataset (placeholder)"""
        logger.warning("Using synthetic data for UK-DALE")
        return self._load_redd(house_id, appliances)  # Use same synthetic data for now

    def _load_refit(self, house_id: int, appliances: List[str]) -> Dict[str, Any]:
        """Load REFIT dataset (placeholder)"""
        logger.warning("Using synthetic data for REFIT")
        return self._load_redd(house_id, appliances)

    def extract_appliance_signatures(
        self,
        dataset: Dict[str, Any]
    ) -> Dict[str, Dict[str, Any]]:
        """
        Extract appliance power signatures from dataset
        Returns signature features for each appliance
        """
        signatures = {}

        for appliance_name, power_data in dataset['appliances'].items():
            # Calculate signature features
            on_power = power_data[power_data > 10]  # Active periods

            if len(on_power) > 0:
                signatures[appliance_name] = {
                    'nominal_power': float(np.median(on_power)),
                    'min_power': float(np.min(on_power)),
                    'max_power': float(np.max(on_power)),
                    'standby_power': float(np.median(power_data[power_data < 10])),
                    'std_power': float(np.std(on_power)),
                    'duty_cycle': float(len(on_power) / len(power_data)),
                    'power_states': list(self._find_power_states(power_data))
                }
            else:
                signatures[appliance_name] = {
                    'nominal_power': 0,
                    'min_power': 0,
                    'max_power': 0,
                    'standby_power': 0
                }

        return signatures

    def _find_power_states(self, power_data: np.ndarray) -> List[float]:
        """Find discrete power states using clustering"""
        from sklearn.cluster import KMeans

        # Filter out zeros
        active_power = power_data[power_data > 5]

        if len(active_power) < 10:
            return []

        # Cluster into discrete states
        n_states = min(5, len(np.unique(active_power)))
        kmeans = KMeans(n_clusters=n_states, random_state=42, n_init=10)
        kmeans.fit(active_power.reshape(-1, 1))

        states = sorted(kmeans.cluster_centers_.flatten())
        return [float(s) for s in states]
