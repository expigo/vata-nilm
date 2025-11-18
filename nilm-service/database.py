"""
Database connection and operations for NILM service
"""

import os
from typing import Optional, List, Dict, Any
from datetime import datetime
from contextlib import contextmanager
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:password@localhost:5432/vata_nilm"
)

def get_connection():
    """Get database connection"""
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)

@contextmanager
def get_db():
    """Context manager for database connections"""
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

def init_db():
    """Initialize database (check connection)"""
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
        print("✅ Database connection established")
    except Exception as e:
        print(f"❌ Database connection failed: {e}")
        raise

# ============================================================================
# Appliance Operations
# ============================================================================

async def get_appliances_from_db(
    db,
    user_id: Optional[int] = None,
    site_type: Optional[str] = None,
    is_global: bool = False
):
    """Get appliances from database"""
    with db.cursor() as cur:
        query = """
            SELECT
                a.id, a.user_id, a.site_type, a.device_id,
                a.name, a.brand, a.model,
                a.nominal_power, a.min_power, a.max_power, a.standby_power,
                a.signature_features, a.trained_on_dataset,
                a.training_samples, a.confidence_score,
                a.is_active, a.is_global,
                ac.name as category_name, ac.icon as category_icon
            FROM appliances a
            JOIN appliance_categories ac ON a.category_id = ac.id
            WHERE 1=1
        """
        params = []

        if is_global:
            query += " AND a.is_global = true"
        elif user_id is not None:
            query += " AND (a.user_id = %s OR a.is_global = true)"
            params.append(user_id)

        if site_type:
            query += " AND (a.site_type = %s OR a.site_type IS NULL)"
            params.append(site_type)

        query += " ORDER BY a.is_global DESC, a.name"

        cur.execute(query, params)
        return cur.fetchall()

async def get_categories_from_db(db):
    """Get all appliance categories"""
    with db.cursor() as cur:
        cur.execute("""
            SELECT id, name, description, icon, color
            FROM appliance_categories
            ORDER BY name
        """)
        return cur.fetchall()

# ============================================================================
# Label Operations
# ============================================================================

async def save_label_to_db(db, label_data: Dict[str, Any]):
    """Save an appliance label"""
    with db.cursor() as cur:
        cur.execute("""
            INSERT INTO appliance_labels (
                user_id, device_id, site_type, appliance_id,
                start_timestamp, end_timestamp, state, power_watts,
                notes, confidence
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
        """, (
            label_data['user_id'],
            label_data['device_id'],
            label_data['site_type'],
            label_data['appliance_id'],
            label_data['start_timestamp'],
            label_data['end_timestamp'],
            label_data['state'],
            label_data.get('power_watts'),
            label_data.get('notes'),
            label_data.get('confidence', 'certain')
        ))
        return cur.fetchone()['id']

async def get_labels_from_db(
    db,
    user_id: int,
    device_id: Optional[str] = None,
    appliance_id: Optional[int] = None
):
    """Get labels by user"""
    with db.cursor() as cur:
        query = """
            SELECT
                l.id, l.user_id, l.device_id, l.site_type,
                l.appliance_id, l.start_timestamp, l.end_timestamp,
                l.state, l.power_watts, l.notes, l.confidence, l.verified,
                a.name as appliance_name
            FROM appliance_labels l
            JOIN appliances a ON l.appliance_id = a.id
            WHERE l.user_id = %s
        """
        params = [user_id]

        if device_id:
            query += " AND l.device_id = %s"
            params.append(device_id)

        if appliance_id:
            query += " AND l.appliance_id = %s"
            params.append(appliance_id)

        query += " ORDER BY l.created_at DESC"

        cur.execute(query, params)
        return cur.fetchall()

# ============================================================================
# Disaggregation Results Operations
# ============================================================================

async def save_disaggregation_result(
    db,
    timestamp: datetime,
    device_id: str,
    site_type: str,
    appliance_id: int,
    algorithm: str,
    power_watts: float,
    state: str,
    state_confidence: float,
    processing_time_ms: int,
    model_version: str = None,
    energy_kwh: float = None
):
    """Save a disaggregation result"""
    with db.cursor() as cur:
        cur.execute("""
            INSERT INTO disaggregation_results (
                timestamp, device_id, site_type, appliance_id, algorithm,
                power_watts, energy_kwh, state, state_confidence,
                processing_time_ms, model_version
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
        """, (
            timestamp, device_id, site_type, appliance_id, algorithm,
            power_watts, energy_kwh, state, state_confidence,
            processing_time_ms, model_version
        ))
        return cur.fetchone()['id']

async def get_disaggregation_results(
    db,
    device_id: str,
    site_type: str,
    start_timestamp: datetime,
    end_timestamp: datetime,
    algorithm: Optional[str] = None,
    appliance_id: Optional[int] = None
):
    """Get disaggregation results for a time range"""
    with db.cursor() as cur:
        query = """
            SELECT
                dr.id, dr.timestamp, dr.device_id, dr.site_type,
                dr.appliance_id, dr.algorithm, dr.power_watts,
                dr.energy_kwh, dr.state, dr.state_confidence,
                dr.processing_time_ms, dr.model_version,
                a.name as appliance_name,
                ac.name as category_name, ac.icon as category_icon
            FROM disaggregation_results dr
            JOIN appliances a ON dr.appliance_id = a.id
            JOIN appliance_categories ac ON a.category_id = ac.id
            WHERE dr.device_id = %s
              AND dr.site_type = %s
              AND dr.timestamp BETWEEN %s AND %s
        """
        params = [device_id, site_type, start_timestamp, end_timestamp]

        if algorithm:
            query += " AND dr.algorithm = %s"
            params.append(algorithm)

        if appliance_id:
            query += " AND dr.appliance_id = %s"
            params.append(appliance_id)

        query += " ORDER BY dr.timestamp DESC"

        cur.execute(query, params)
        return cur.fetchall()

# ============================================================================
# Model Operations
# ============================================================================

async def get_models_from_db(
    db,
    algorithm: Optional[str] = None,
    user_id: Optional[int] = None
):
    """Get NILM models"""
    with db.cursor() as cur:
        query = """
            SELECT
                id, name, algorithm, version, description,
                trained_on_dataset, training_samples,
                accuracy, precision_score, recall_score, f1_score, mae,
                array_length(appliance_ids, 1) as appliance_count,
                model_path, model_size_mb,
                is_active, is_default,
                created_at, updated_at
            FROM nilm_models
            WHERE 1=1
        """
        params = []

        if algorithm:
            query += " AND algorithm = %s"
            params.append(algorithm)

        if user_id is not None:
            query += " AND (user_id = %s OR user_id IS NULL)"
            params.append(user_id)

        query += " ORDER BY is_default DESC, created_at DESC"

        cur.execute(query, params)
        return cur.fetchall()

async def get_model_by_id(db, model_id: int):
    """Get model by ID"""
    with db.cursor() as cur:
        cur.execute("""
            SELECT
                id, user_id, name, algorithm, version, description,
                trained_on_dataset, training_samples, training_duration_seconds,
                accuracy, precision_score, recall_score, f1_score, mae,
                appliance_ids, model_path, model_size_mb,
                hyperparameters, is_active, is_default,
                created_at, updated_at
            FROM nilm_models
            WHERE id = %s
        """, (model_id,))
        return cur.fetchone()

async def save_model_to_db(
    db,
    user_id: Optional[int],
    name: str,
    algorithm: str,
    version: str,
    trained_on_dataset: str,
    training_samples: int,
    training_duration_seconds: int,
    metrics: Dict[str, float],
    appliance_ids: List[int],
    model_path: str,
    model_size_mb: float,
    hyperparameters: Dict[str, Any],
    is_default: bool = False
):
    """Save a trained model"""
    with db.cursor() as cur:
        cur.execute("""
            INSERT INTO nilm_models (
                user_id, name, algorithm, version, description,
                trained_on_dataset, training_samples, training_duration_seconds,
                accuracy, precision_score, recall_score, f1_score, mae,
                appliance_ids, model_path, model_size_mb,
                hyperparameters, is_active, is_default
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
            )
            RETURNING id
        """, (
            user_id, name, algorithm, version,
            f"Trained on {trained_on_dataset}",
            trained_on_dataset, training_samples, training_duration_seconds,
            metrics.get('accuracy'), metrics.get('precision'),
            metrics.get('recall'), metrics.get('f1'), metrics.get('mae'),
            appliance_ids, model_path, model_size_mb,
            hyperparameters, True, is_default
        ))
        return cur.fetchone()['id']

# ============================================================================
# Job Operations
# ============================================================================

async def create_job(
    db,
    user_id: Optional[int],
    job_type: str,
    algorithm: str,
    device_id: str = None,
    site_type: str = None,
    start_timestamp: datetime = None,
    end_timestamp: datetime = None
):
    """Create a disaggregation job"""
    with db.cursor() as cur:
        cur.execute("""
            INSERT INTO disaggregation_jobs (
                user_id, job_type, algorithm, device_id, site_type,
                start_timestamp, end_timestamp, status
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, 'pending')
            RETURNING id
        """, (
            user_id, job_type, algorithm, device_id, site_type,
            start_timestamp, end_timestamp
        ))
        return cur.fetchone()['id']

async def update_job_status(
    db,
    job_id: int,
    status: str,
    progress: int = None,
    error_message: str = None
):
    """Update job status"""
    with db.cursor() as cur:
        updates = ["status = %s"]
        params = [status]

        if progress is not None:
            updates.append("progress = %s")
            params.append(progress)

        if error_message:
            updates.append("error_message = %s")
            params.append(error_message)

        if status == "running" and progress == 0:
            updates.append("started_at = NOW()")
        elif status in ["completed", "failed"]:
            updates.append("completed_at = NOW()")

        params.append(job_id)
        query = f"UPDATE disaggregation_jobs SET {', '.join(updates)} WHERE id = %s"

        cur.execute(query, params)

async def get_job_by_id(db, job_id: int):
    """Get job by ID"""
    with db.cursor() as cur:
        cur.execute("""
            SELECT
                id, user_id, job_type, algorithm, model_id,
                device_id, site_type, start_timestamp, end_timestamp,
                status, progress, total_samples, processed_samples,
                error_message, started_at, completed_at, created_at
            FROM disaggregation_jobs
            WHERE id = %s
        """, (job_id,))
        return cur.fetchone()

# ============================================================================
# Statistics Operations
# ============================================================================

async def get_appliance_stats_from_db(
    db,
    device_id: str,
    site_type: str,
    days: int = 30,
    algorithm: str = None
):
    """Get appliance usage statistics"""
    with db.cursor() as cur:
        query = """
            SELECT
                a.id as appliance_id,
                a.name as appliance_name,
                ac.name as category_name,
                ac.icon as category_icon,
                COUNT(*) as detection_count,
                SUM(dr.energy_kwh) as total_energy_kwh,
                AVG(dr.power_watts) as avg_power_watts,
                MAX(dr.power_watts) as max_power_watts,
                MIN(dr.timestamp) as first_seen,
                MAX(dr.timestamp) as last_seen
            FROM disaggregation_results dr
            JOIN appliances a ON dr.appliance_id = a.id
            JOIN appliance_categories ac ON a.category_id = ac.id
            WHERE dr.device_id = %s
              AND dr.site_type = %s
              AND dr.timestamp > NOW() - INTERVAL '%s days'
        """
        params = [device_id, site_type, days]

        if algorithm:
            query += " AND dr.algorithm = %s"
            params.append(algorithm)

        query += """
            GROUP BY a.id, a.name, ac.name, ac.icon
            ORDER BY total_energy_kwh DESC NULLS LAST
        """

        cur.execute(query, params)
        return cur.fetchall()

async def get_algorithm_performance_from_db(db):
    """Get algorithm performance comparison"""
    with db.cursor() as cur:
        cur.execute("""
            SELECT
                algorithm,
                COUNT(DISTINCT appliance_id) as appliances_detected,
                COUNT(*) as total_predictions,
                AVG(state_confidence) as avg_confidence,
                AVG(processing_time_ms) as avg_processing_time_ms,
                date_trunc('day', timestamp) as day
            FROM disaggregation_results
            WHERE timestamp > NOW() - INTERVAL '7 days'
            GROUP BY algorithm, day
            ORDER BY day DESC, algorithm
        """)
        return cur.fetchall()
