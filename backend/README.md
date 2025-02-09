# Roami Backend

FastAPI backend for Roami, providing AI-powered roadtrip assistance and various travel-related features.

## Features

- 🤖 AI Chat with Cerebras (llama3.1-8b)
- 📸 Image Analysis with Moondream
- 🎵 Music Streaming with YT-dlp
- 🗺️ Location Services with OpenStreetMap
- 📸 Historical Photos from Wikimedia Commons
- 🔒 Firebase Authentication & Data Storage

## Setup

1. Create a virtual environment:
```bash
python -m venv venv
.\venv\Scripts\activate  # Windows
source venv/bin/activate  # Unix/macOS
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Copy `.env.example` to `.env` and fill in your credentials:
```bash
cp .env.example .env
```

4. Run the development server:
```bash
uvicorn main:app --reload --port 8000
```

## API Documentation

Once running, visit:
- http://localhost:8000/docs - Swagger UI
- http://localhost:8000/redoc - ReDoc UI

## Deployment

This backend is configured for deployment on Render. Make sure to:

1. Set all environment variables in Render dashboard
2. Use Python 3.11 or later
3. Set the build command: `pip install -r requirements.txt`
4. Set the start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`

## Project Structure

```
backend/
├── main.py              # FastAPI application entry point
├── requirements.txt     # Python dependencies
├── .env                # Environment variables (create from .env.example)
└── routers/            # API route modules (to be implemented)
    ├── ai.py           # AI/ML endpoints
    ├── location.py     # Location services
    ├── media.py        # Music and photos
    └── auth.py         # Authentication
``` 