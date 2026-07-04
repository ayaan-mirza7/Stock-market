# StockSense AI

StockSense AI is a production-oriented full-stack stock prediction and investment analysis platform.

## Overview
- FastAPI backend with live market and portfolio endpoints
- React + TypeScript dashboard for market monitoring
- Docker support for local development

## Run locally

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Docker Compose
```bash
docker compose up --build
```

### News API configuration
For live news explanations, set `NEWS_API_KEY` in your environment before starting the backend.

On Windows PowerShell:
```powershell
$env:NEWS_API_KEY="your_api_key_here"
```

On macOS / Linux:
```bash
export NEWS_API_KEY="your_api_key_here"
```

## Notes
This scaffold includes the core architecture and live-market integration hooks for future expansion into retraining, NLP sentiment, portfolio persistence, and model monitoring.
