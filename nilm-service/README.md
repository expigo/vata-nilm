# VATA NILM Microservice

Python-based energy disaggregation service with multiple algorithms.

## Features

- **Multiple Algorithms**: CO, FHMM, Seq2Point, Seq2Seq, BERT4NILM
- **Real-time Disaggregation**: Process live power readings
- **Historical Analysis**: Batch processing of stored data
- **Dataset Support**: REDD, UK-DALE, REFIT
- **User Labeling**: Manual labeling interface for training
- **Model Training**: Train custom models on user data

## Installation

### Using Virtual Environment

```bash
cd nilm-service

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### Using Docker

```bash
docker build -t vata-nilm-service .
docker run -p 8000:8000 vata-nilm-service
```

## Configuration

Create `.env` file:

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/vata_nilm
HOST=0.0.0.0
PORT=8000
```

## Running

```bash
# Development
python main.py

# Or with uvicorn directly
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## API Endpoints

### Real-time Disaggregation

```bash
POST /api/disaggregate/realtime
Content-Type: application/json

{
  "reading": {
    "timestamp": "2025-01-18T10:00:00Z",
    "device_id": "KROL_01",
    "site_type": "KROL",
    "voltage_l1": 230,
    "voltage_l2": 230,
    "voltage_l3": 230,
    "current_l1": 10,
    "current_l2": 8,
    "current_l3": 9,
    "power_l1": 2300,
    "power_l2": 1840,
    "power_l3": 2070,
    "power_total": 6210
  },
  "algorithms": ["Seq2Point", "CO"],
  "user_id": 1
}
```

### Historical Disaggregation

```bash
POST /api/disaggregate/historical
Content-Type: application/json

{
  "device_id": "KROL_01",
  "site_type": "KROL",
  "start_timestamp": "2025-01-01T00:00:00Z",
  "end_timestamp": "2025-01-07T23:59:59Z",
  "algorithms": ["Seq2Point"],
  "user_id": 1
}
```

### Create Label

```bash
POST /api/labels
Content-Type: application/json

{
  "user_id": 1,
  "device_id": "KROL_01",
  "site_type": "KROL",
  "appliance_id": 1,
  "start_timestamp": "2025-01-18T10:00:00Z",
  "end_timestamp": "2025-01-18T10:05:00Z",
  "state": "ON",
  "power_watts": 1200,
  "notes": "Microwave heating",
  "confidence": "certain"
}
```

### Train Model

```bash
POST /api/models/train
Content-Type: application/json

{
  "algorithm": "Seq2Point",
  "dataset_name": "REDD",
  "user_id": null,
  "appliance_ids": [1, 2, 3],
  "epochs": 50,
  "batch_size": 32
}
```

## Architecture

```
┌─────────────────────────────────────┐
│         FastAPI Server              │
│  (Real-time & Historical Endpoints) │
└──────────────┬──────────────────────┘
               │
       ┌───────┴───────┐
       │               │
┌──────▼─────┐  ┌─────▼──────┐
│ Classical  │  │Deep Learning│
│ Algorithms │  │   Models    │
│  - CO      │  │ - Seq2Point │
│  - FHMM    │  │ - Seq2Seq   │
└────────────┘  │ - BERT4NILM │
                └─────────────┘
                       │
               ┌───────┴────────┐
               │                │
        ┌──────▼─────┐   ┌─────▼──────┐
        │ PostgreSQL │   │  Datasets  │
        │  Database  │   │REDD/UK-DALE│
        └────────────┘   └────────────┘
```

## Algorithms

### Combinatorial Optimization (CO)
- Fast, rule-based disaggregation
- Best for high-power appliances
- No training required

### Factorial HMM (FHMM)
- Probabilistic state modeling
- Good for appliances with distinct states
- Requires minimal training

### Seq2Point (CNN)
- Deep learning, point-wise prediction
- Good accuracy with moderate training
- Fast inference

### Seq2Seq (LSTM)
- Sequence-to-sequence modeling
- Best for temporal patterns
- Higher accuracy, slower inference

### BERT4NILM (Transformer)
- State-of-the-art performance
- Attention mechanism
- Best accuracy, requires more data

## Development

### Run Tests

```bash
pytest
```

### Code Formatting

```bash
black .
flake8 .
```

## License

MIT
