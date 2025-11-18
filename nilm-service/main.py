"""
NILM Microservice - Main FastAPI Application
Provides energy disaggregation using multiple algorithms
"""

from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum
import logging

from database import get_db, init_db
from algorithms import (
    CombinatorioOptimization,
    FactorialHMM,
    Seq2PointModel,
    Seq2SeqModel,
    BERT4NILMModel
)
from disaggregator import RealTimeDisaggregator, HistoricalDisaggregator
from dataset_loader import DatasetLoader

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="VATA NILM Service",
    description="Energy Disaggregation Microservice with Multiple Algorithms",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Enums
class AlgorithmType(str, Enum):
    CO = "CO"
    FHMM = "FHMM"
    SEQ2POINT = "Seq2Point"
    SEQ2SEQ = "Seq2Seq"
    BERT4NILM = "BERT4NILM"

class JobStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"

# Request/Response Models
class PowerReading(BaseModel):
    timestamp: datetime
    device_id: str
    site_type: str
    voltage_l1: float
    voltage_l2: float
    voltage_l3: float
    current_l1: float
    current_l2: float
    current_l3: float
    power_l1: float
    power_l2: float
    power_l3: float
    power_total: float

class DisaggregationRequest(BaseModel):
    reading: PowerReading
    algorithms: List[AlgorithmType] = [AlgorithmType.SEQ2POINT]
    user_id: Optional[int] = None

class ApplianceResult(BaseModel):
    appliance_id: int
    appliance_name: str
    category: str
    power_watts: float
    state: str
    confidence: float

class DisaggregationResponse(BaseModel):
    timestamp: datetime
    device_id: str
    algorithm: str
    total_power: float
    appliances: List[ApplianceResult]
    processing_time_ms: float
    unassigned_power: float

class HistoricalDisaggregationRequest(BaseModel):
    device_id: str
    site_type: str
    start_timestamp: datetime
    end_timestamp: datetime
    algorithms: List[AlgorithmType] = [AlgorithmType.SEQ2POINT]
    user_id: Optional[int] = None

class ApplianceLabel(BaseModel):
    user_id: int
    device_id: str
    site_type: str
    appliance_id: int
    start_timestamp: datetime
    end_timestamp: datetime
    state: str
    power_watts: Optional[float] = None
    notes: Optional[str] = None
    confidence: str = "certain"

class TrainingRequest(BaseModel):
    algorithm: AlgorithmType
    dataset_name: str = "REDD"  # REDD, UK-DALE, USER_DATA
    user_id: Optional[int] = None
    appliance_ids: Optional[List[int]] = None
    epochs: int = 50
    batch_size: int = 32

class ModelInfo(BaseModel):
    id: int
    name: str
    algorithm: str
    version: str
    accuracy: Optional[float] = None
    f1_score: Optional[float] = None
    is_active: bool
    is_default: bool
    appliance_count: int

# Global instances
real_time_disaggregator = None
historical_disaggregator = None
dataset_loader = None

@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    global real_time_disaggregator, historical_disaggregator, dataset_loader

    logger.info("Initializing NILM Service...")

    # Initialize database
    init_db()

    # Initialize disaggregators
    real_time_disaggregator = RealTimeDisaggregator()
    historical_disaggregator = HistoricalDisaggregator()
    dataset_loader = DatasetLoader()

    # Load pre-trained models
    try:
        real_time_disaggregator.load_models()
        logger.info("Pre-trained models loaded successfully")
    except Exception as e:
        logger.warning(f"Could not load pre-trained models: {e}")

    logger.info("NILM Service initialized successfully")

@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "service": "VATA NILM",
        "status": "running",
        "version": "1.0.0",
        "algorithms": [alg.value for alg in AlgorithmType]
    }

@app.get("/health")
async def health_check():
    """Detailed health check"""
    return {
        "status": "healthy",
        "models_loaded": real_time_disaggregator.models_loaded if real_time_disaggregator else False,
        "available_algorithms": [alg.value for alg in AlgorithmType]
    }

# ============================================================================
# Real-time Disaggregation Endpoints
# ============================================================================

@app.post("/api/disaggregate/realtime", response_model=List[DisaggregationResponse])
async def disaggregate_realtime(request: DisaggregationRequest):
    """
    Perform real-time disaggregation on a single power reading
    Returns appliance-level breakdown for each selected algorithm
    """
    try:
        results = []

        for algorithm in request.algorithms:
            result = await real_time_disaggregator.disaggregate(
                reading=request.reading.dict(),
                algorithm=algorithm.value,
                user_id=request.user_id
            )
            results.append(result)

        return results

    except Exception as e:
        logger.error(f"Real-time disaggregation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/disaggregate/historical")
async def disaggregate_historical(
    request: HistoricalDisaggregationRequest,
    background_tasks: BackgroundTasks,
    db=Depends(get_db)
):
    """
    Start a batch disaggregation job for historical data
    Processes data in the background and stores results in database
    """
    try:
        # Create job record
        job_id = await historical_disaggregator.create_job(
            db=db,
            device_id=request.device_id,
            site_type=request.site_type,
            start_timestamp=request.start_timestamp,
            end_timestamp=request.end_timestamp,
            algorithms=request.algorithms,
            user_id=request.user_id
        )

        # Queue background task
        background_tasks.add_task(
            historical_disaggregator.process_job,
            job_id=job_id,
            db=db
        )

        return {
            "job_id": job_id,
            "status": "queued",
            "message": "Historical disaggregation job started"
        }

    except Exception as e:
        logger.error(f"Historical disaggregation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/disaggregate/job/{job_id}")
async def get_job_status(job_id: int, db=Depends(get_db)):
    """Get status of a disaggregation job"""
    try:
        job = await historical_disaggregator.get_job_status(db, job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        return job
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching job status: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# Appliance Management Endpoints
# ============================================================================

@app.get("/api/appliances")
async def get_appliances(
    user_id: Optional[int] = None,
    site_type: Optional[str] = None,
    is_global: bool = False,
    db=Depends(get_db)
):
    """Get appliances (global signatures or user-specific)"""
    try:
        from database import get_appliances_from_db

        appliances = await get_appliances_from_db(
            db=db,
            user_id=user_id,
            site_type=site_type,
            is_global=is_global
        )

        return {"success": True, "count": len(appliances), "appliances": appliances}

    except Exception as e:
        logger.error(f"Error fetching appliances: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/appliances/categories")
async def get_appliance_categories(db=Depends(get_db)):
    """Get all appliance categories"""
    try:
        from database import get_categories_from_db

        categories = await get_categories_from_db(db)
        return {"success": True, "categories": categories}

    except Exception as e:
        logger.error(f"Error fetching categories: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# Labeling Endpoints
# ============================================================================

@app.post("/api/labels")
async def create_label(label: ApplianceLabel, db=Depends(get_db)):
    """Create a new appliance label (ground truth)"""
    try:
        from database import save_label_to_db

        label_id = await save_label_to_db(db, label.dict())

        return {
            "success": True,
            "label_id": label_id,
            "message": "Label created successfully"
        }

    except Exception as e:
        logger.error(f"Error creating label: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/labels/{user_id}")
async def get_user_labels(
    user_id: int,
    device_id: Optional[str] = None,
    appliance_id: Optional[int] = None,
    db=Depends(get_db)
):
    """Get labels created by a specific user"""
    try:
        from database import get_labels_from_db

        labels = await get_labels_from_db(
            db=db,
            user_id=user_id,
            device_id=device_id,
            appliance_id=appliance_id
        )

        return {"success": True, "count": len(labels), "labels": labels}

    except Exception as e:
        logger.error(f"Error fetching labels: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# Model Training Endpoints
# ============================================================================

@app.post("/api/models/train")
async def train_model(
    request: TrainingRequest,
    background_tasks: BackgroundTasks,
    db=Depends(get_db)
):
    """
    Train a new NILM model
    Uses public datasets (REDD, UK-DALE) or user-labeled data
    """
    try:
        from trainer import ModelTrainer

        trainer = ModelTrainer(dataset_loader)

        # Create job
        job_id = await trainer.create_training_job(
            db=db,
            algorithm=request.algorithm.value,
            dataset_name=request.dataset_name,
            user_id=request.user_id,
            appliance_ids=request.appliance_ids,
            epochs=request.epochs,
            batch_size=request.batch_size
        )

        # Queue training task
        background_tasks.add_task(
            trainer.train,
            job_id=job_id,
            db=db
        )

        return {
            "job_id": job_id,
            "status": "queued",
            "message": f"Training job for {request.algorithm.value} started"
        }

    except Exception as e:
        logger.error(f"Training error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/models", response_model=List[ModelInfo])
async def get_models(
    algorithm: Optional[AlgorithmType] = None,
    user_id: Optional[int] = None,
    db=Depends(get_db)
):
    """Get available NILM models"""
    try:
        from database import get_models_from_db

        models = await get_models_from_db(
            db=db,
            algorithm=algorithm.value if algorithm else None,
            user_id=user_id
        )

        return models

    except Exception as e:
        logger.error(f"Error fetching models: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/models/{model_id}")
async def get_model_details(model_id: int, db=Depends(get_db)):
    """Get detailed information about a specific model"""
    try:
        from database import get_model_by_id

        model = await get_model_by_id(db, model_id)
        if not model:
            raise HTTPException(status_code=404, detail="Model not found")

        return model

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching model: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# Dataset Endpoints
# ============================================================================

@app.get("/api/datasets")
async def get_available_datasets():
    """Get list of available public datasets"""
    return {
        "datasets": dataset_loader.available_datasets() if dataset_loader else []
    }

@app.post("/api/datasets/download")
async def download_dataset(
    dataset_name: str,
    background_tasks: BackgroundTasks
):
    """Download a public NILM dataset"""
    try:
        background_tasks.add_task(
            dataset_loader.download_dataset,
            dataset_name
        )

        return {
            "message": f"Downloading {dataset_name} in background",
            "dataset": dataset_name
        }

    except Exception as e:
        logger.error(f"Dataset download error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# Statistics Endpoints
# ============================================================================

@app.get("/api/stats/appliances/{device_id}")
async def get_appliance_stats(
    device_id: str,
    site_type: str,
    days: int = 30,
    algorithm: Optional[AlgorithmType] = None,
    db=Depends(get_db)
):
    """Get appliance usage statistics for a device"""
    try:
        from database import get_appliance_stats_from_db

        stats = await get_appliance_stats_from_db(
            db=db,
            device_id=device_id,
            site_type=site_type,
            days=days,
            algorithm=algorithm.value if algorithm else None
        )

        return {"success": True, "stats": stats}

    except Exception as e:
        logger.error(f"Error fetching stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/stats/algorithms")
async def get_algorithm_performance(db=Depends(get_db)):
    """Compare performance of different algorithms"""
    try:
        from database import get_algorithm_performance_from_db

        performance = await get_algorithm_performance_from_db(db)
        return {"success": True, "performance": performance}

    except Exception as e:
        logger.error(f"Error fetching algorithm performance: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
