import json
import logging
import os
from typing import List, Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(
    prefix="/serendipity",
    tags=["Serendipity Mode"]
)

class SerendipityRequest(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    radius: Optional[int] = Field(default=5000, ge=1000, le=20000)  # 1km to 20km
    mood: Optional[str] = None  # e.g., "adventurous", "relaxed", "curious"
    time_available: Optional[int] = None  # minutes available for detour

class SerendipityResponse(BaseModel):
    title: str
    description: str
    type: str  # "hidden_gem", "activity", "food", "scenic_route", "local_secret"
    location: Optional[dict] = None
    duration: Optional[int] = None  # estimated minutes
    distance: Optional[float] = None  # distance in km if relevant
    context: str  # why this suggestion is interesting
    tags: List[str]

async def get_serendipitous_suggestion(location_name: str, mood: Optional[str] = None) -> dict:
    """Get a serendipitous suggestion from Cerebras AI"""
    try:
        api_key = os.getenv("CEREBRAS_API_KEY")
        if not api_key:
            raise ValueError("CEREBRAS_API_KEY environment variable not set")

        # Craft a specific prompt for serendipitous suggestions
        messages = [
            {
                "role": "system",
                "content": """You are a spontaneous and adventurous local guide who knows all the hidden gems and unique experiences in every area. 
                When suggesting places or activities:
                1. Focus on unique, lesser-known experiences that travelers might miss
                2. Include interesting historical or cultural context
                3. Explain why this suggestion is special or meaningful
                4. Consider the mood/vibe the traveler is seeking
                5. Suggest something specific, not generic
                
                Return ONLY a valid JSON object with no additional text, in this exact format:
                {
                  "title": "Name of suggestion",
                  "description": "Engaging description of what to do",
                  "type": "hidden_gem|activity|food|scenic_route|local_secret",
                  "duration": estimated_minutes_as_number,
                  "context": "Why this is interesting/special",
                  "tags": ["tag1", "tag2", "tag3"]
                }"""
            },
            {
                "role": "user",
                "content": f"Suggest a serendipitous {'and ' + mood if mood else ''} experience near {location_name} that would make this journey more memorable and unique."
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
                    "temperature": 0.8,  # Slightly higher for more creative suggestions
                    "max_tokens": 1000
                },
                timeout=30.0
            )

            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Failed to get suggestion: {response.text}"
                )

            data = response.json()
            if "choices" in data and len(data["choices"]) > 0:
                content = data["choices"][0]["message"]["content"]
                try:
                    # Clean up the content - remove any text before the first '{' and after the last '}'
                    json_start = content.find('{')
                    json_end = content.rfind('}') + 1
                    if json_start != -1 and json_end > json_start:
                        json_content = content[json_start:json_end]
                        return json.loads(json_content)
                except json.JSONDecodeError as e:
                    logging.error(f"Failed to parse suggestion JSON: {e}")
                    logging.error(f"Raw content: {content}")
                    raise ValueError("Failed to parse AI response")

            raise ValueError("No valid suggestion received from AI")

    except Exception as e:
        logging.error(f"Error getting serendipitous suggestion: {str(e)}")
        raise

@router.post("/suggest", response_model=SerendipityResponse)
async def get_suggestion(request: SerendipityRequest):
    """Get a serendipitous suggestion based on location and context"""
    try:
        # First, get the location name from coordinates
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

            # Get serendipitous suggestion for this location
            suggestion = await get_serendipitous_suggestion(location_name, request.mood)
            
            # Add location data if available
            if location_data:
                suggestion["location"] = {
                    "name": location_name,
                    "latitude": request.latitude,
                    "longitude": request.longitude
                }

            return suggestion

    except Exception as e:
        logging.error(f"Error in get_suggestion: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e)) 