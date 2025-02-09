import os

import firebase_admin
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from firebase_admin import credentials
from routers import (ai, auth, challenges, cultural, location, media, music_ai,
                     serendipity)

# Load environment variables
load_dotenv()

# Initialize Firebase Admin
cred = credentials.Certificate({
    "type": "service_account",
    "project_id": os.getenv("FIREBASE_PROJECT_ID"),
    "private_key": os.getenv("FIREBASE_PRIVATE_KEY").replace("\\n", "\n"),
    "client_email": os.getenv("FIREBASE_CLIENT_EMAIL"),
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_x509_cert_url": f"https://www.googleapis.com/robot/v1/metadata/x509/{os.getenv('FIREBASE_CLIENT_EMAIL').replace('@', '%40')}"
})
firebase_admin.initialize_app(cred)

app = FastAPI(
    title="Roami API",
    description="Backend API for Roami - Your Roadtrip Companion",
    version="1.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Specific origin instead of wildcard
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

# Include routers
app.include_router(auth.router)
app.include_router(ai.router)
app.include_router(location.router)
app.include_router(media.router)
app.include_router(music_ai.router)
app.include_router(serendipity.router)
app.include_router(challenges.router)
app.include_router(cultural.router)

@app.get("/")
async def root():
    return {
        "status": "ok",
        "message": "Welcome to Roami API! 🚗",
        "version": "1.0.0"
    }

@app.get("/health")
async def health_check():
    return {"status": "healthy"} 