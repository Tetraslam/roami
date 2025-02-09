import json
import logging
import os
from datetime import datetime, timedelta
from random import choice
from typing import List, Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(
    prefix="/challenges",
    tags=["Time Capsule Challenges"]
)

class ChallengeRequest(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    radius: Optional[int] = Field(default=5000, ge=1000, le=20000)  # 1km to 20km
    completed_challenges: Optional[List[str]] = Field(default_factory=list)

class Challenge(BaseModel):
    id: str
    title: str
    description: str
    type: str  # "photo", "location", "historical", "cultural", "observation"
    difficulty: str  # "easy", "medium", "hard"
    points: int
    time_limit: Optional[int] = None  # minutes to complete
    location_required: bool = False
    target_location: Optional[dict] = None
    completion_criteria: str
    tags: List[str]

CHALLENGE_TYPES = [
    "Take a photo of a unique architectural detail you spot",
    "Find and document a local historical marker",
    "Capture a candid moment of daily life",
    "Locate a viewpoint mentioned in historical records",
    "Find a building that's over 50 years old",
    "Document a piece of public art",
    "Photograph a local cultural symbol",
    "Find evidence of the area's main industry/trade",
    "Capture the most interesting doorway/entrance",
    "Find a hidden garden or green space"
]

async def generate_challenge(location_name: str, completed: List[str]) -> dict:
    """Generate a location-specific challenge using Cerebras AI"""
    try:
        api_key = os.getenv("CEREBRAS_API_KEY")
        if not api_key:
            raise ValueError("CEREBRAS_API_KEY environment variable not set")

        # Select a challenge type that hasn't been completed
        available_types = [t for t in CHALLENGE_TYPES if t not in completed]
        if not available_types:
            available_types = CHALLENGE_TYPES  # Reset if all completed
        
        challenge_type = choice(available_types)

        messages = [
            {
                "role": "system",
                "content": """You are a creative challenge designer for a road trip app. Create engaging, location-specific challenges that help travelers discover and document interesting aspects of their surroundings.

                Return ONLY a valid JSON object with no additional text, in this format:
                {
                  "id": "unique_string",
                  "title": "Challenge title",
                  "description": "Detailed challenge description",
                  "type": "photo|location|historical|cultural|observation",
                  "difficulty": "easy|medium|hard",
                  "points": points_as_number,
                  "time_limit": minutes_as_number,
                  "completion_criteria": "What user needs to do to complete",
                  "tags": ["relevant", "tags"]
                }"""
            },
            {
                "role": "user",
                "content": f"Create a challenge for {location_name} based on this prompt: {challenge_type}"
            }
        ]

        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.cerebras.ai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "llama3.3-70b",
                    "messages": messages,
                    "temperature": 0.7,
                    "max_tokens": 1000
                },
                timeout=30.0
            )

            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Failed to generate challenge: {response.text}"
                )

            data = response.json()
            if "choices" in data and len(data["choices"]) > 0:
                content = data["choices"][0]["message"]["content"]
                try:
                    # Clean up the content
                    json_start = content.find('{')
                    json_end = content.rfind('}') + 1
                    if json_start != -1 and json_end > json_start:
                        json_content = content[json_start:json_end]
                        challenge = json.loads(json_content)
                        # Ensure challenge has required fields
                        required_fields = ["title", "description", "type", "difficulty", "points", "completion_criteria", "tags"]
                        if all(field in challenge for field in required_fields):
                            return challenge
                except json.JSONDecodeError as e:
                    logging.error(f"Failed to parse challenge JSON: {e}")
                    logging.error(f"Raw content: {content}")
                    raise ValueError("Failed to parse AI response")

            raise ValueError("No valid challenge received from AI")

    except Exception as e:
        logging.error(f"Error generating challenge: {str(e)}")
        raise

@router.post("/generate", response_model=Challenge)
async def get_challenge(request: ChallengeRequest):
    """Get a new challenge based on location"""
    try:
        # Get location name from coordinates
        async with httpx.AsyncClient() as client:
            location_response = await client.get(
                "https://nominatim.openstreetmap.org/reverse",
                params={
                    "lat": request.latitude,
                    "lon": request.longitude,
                    "format": "json",
                    "addressdetails": 1,
                    "zoom": 18,  # Higher zoom level for more detail
                    "namedetails": 1
                },
                headers={
                    "User-Agent": os.getenv("NOMINATIM_USER_AGENT", "Roami/1.0")
                }
            )

            if location_response.status_code != 200:
                raise HTTPException(
                    status_code=location_response.status_code,
                    detail="Failed to get location name"
                )

            location_data = location_response.json()
            logging.info(f"Location data received: {json.dumps(location_data, indent=2)}")
            
            # Get more specific location details
            address = location_data.get('address', {})
            location_parts = []
            
            # Build location string with available components in priority order
            if address.get('building'):
                location_parts.append(address['building'])
            if address.get('amenity'):
                location_parts.append(address['amenity'])
            if address.get('university'):
                location_parts.append(address['university'])
            if address.get('campus'):
                location_parts.append(address['campus'])
            if address.get('neighbourhood'):
                location_parts.append(address['neighbourhood'])
            if address.get('suburb'):
                location_parts.append(address['suburb'])
            if address.get('city'):
                location_parts.append(address['city'])
            if address.get('state'):
                location_parts.append(address['state'])
            if address.get('country'):
                location_parts.append(address['country'])
            
            # Fall back to display name if no address components
            location_name = ', '.join(filter(None, location_parts)) or location_data.get('display_name', '')
            logging.info(f"Generated location name: {location_name}")

            # Generate challenge for this location
            challenge = await generate_challenge(location_name, request.completed_challenges or [])
            
            # Add location context if needed
            if challenge.get("location_required", False):
                challenge["target_location"] = {
                    "name": location_name,
                    "latitude": request.latitude,
                    "longitude": request.longitude
                }

            return challenge

    except Exception as e:
        logging.error(f"Error in get_challenge: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e)) 