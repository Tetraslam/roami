import json
import logging
import os
from typing import List, Optional
from urllib.parse import quote

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(
    prefix="/music-ai",
    tags=["Music AI Services"]
)

class LocalMusicRequest(BaseModel):
    latitude: float
    longitude: float
    limit: Optional[int] = 5

class MusicRecommendation(BaseModel):
    title: str
    artist: str
    year: Optional[int]
    youtube_url: str
    description: str
    genre: Optional[str]
    local_context: str

async def get_music_recommendations(location_name: str, limit: int = 5) -> List[dict]:
    """Get music recommendations from Cerebras AI based on location"""
    api_key = os.getenv("CEREBRAS_API_KEY")
    if not api_key:
        raise ValueError("CEREBRAS_API_KEY environment variable not set")

    # Craft a specific prompt for music recommendations
    messages = [
        {
            "role": "system",
            "content": """You are a local music expert. Provide authentic music recommendations that represent the local culture, 
            history, and musical heritage of the specified location. For each song, include:
            1. Title and artist
            2. Year of release (if known)
            3. Genre
            4. A brief description of why this song is significant to the location
            5. A YouTube search query that will find this exact song
            
            IMPORTANT: Return ONLY a valid JSON object with no additional text, in this exact format:
            {
              "recommendations": [
                {
                  "title": "Song Title",
                  "artist": "Artist Name",
                  "year": 1234,
                  "youtube_url": "search query string",
                  "description": "why this song matters",
                  "genre": "genre name",
                  "local_context": "connection to location"
                }
              ]
            }
            
            Make sure all JSON properties are properly quoted and formatted. Do not include any text before or after the JSON object."""
        },
        {
            "role": "user",
            "content": f"Recommend {limit} songs that represent the musical culture and heritage of {location_name}. Focus on songs that have a strong connection to the location's history, culture, or were created by local artists."
        }
    ]

    try:
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
                    "max_tokens": 2000
                },
                timeout=30.0
            )

            response_data = response.json()
            
            if response.status_code != 200:
                logging.error(f"Cerebras API error: {response.text}")
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Failed to get music recommendations: {response.text}"
                )

            if "choices" in response_data and len(response_data["choices"]) > 0:
                content = response_data["choices"][0]["message"]["content"]
                try:
                    # Clean up the content - remove any text before the first '{' and after the last '}'
                    json_start = content.find('{')
                    json_end = content.rfind('}') + 1
                    if json_start != -1 and json_end > json_start:
                        json_content = content[json_start:json_end]
                        # Parse the content as JSON
                        recommendations_data = json.loads(json_content)
                        if isinstance(recommendations_data, dict) and "recommendations" in recommendations_data:
                            recommendations = recommendations_data["recommendations"]
                            # Validate each recommendation has required fields
                            valid_recommendations = []
                            for rec in recommendations:
                                if all(key in rec for key in ["title", "artist", "youtube_url", "description", "genre", "local_context"]):
                                    # Ensure year is an integer if present
                                    if "year" in rec and not isinstance(rec["year"], int):
                                        try:
                                            rec["year"] = int(rec["year"])
                                        except (ValueError, TypeError):
                                            rec.pop("year", None)
                                    valid_recommendations.append(rec)
                            return valid_recommendations
                        elif isinstance(recommendations_data, list):
                            return recommendations_data
                        else:
                            logging.error(f"Unexpected recommendations format: {recommendations_data}")
                            return []
                    else:
                        logging.error("No valid JSON content found in response")
                        return []
                except json.JSONDecodeError as e:
                    logging.error(f"Failed to parse recommendations JSON: {e}")
                    logging.error(f"Raw content: {content}")
                    return []
            
            logging.error(f"No choices in response: {response_data}")
            return []

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Request to AI service timed out")
    except Exception as e:
        logging.error(f"Error getting music recommendations: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/recommendations", response_model=List[MusicRecommendation])
async def get_local_music(request: LocalMusicRequest):
    """Get local music recommendations based on location"""
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

            # Get music recommendations for this location
            recommendations = await get_music_recommendations(location_name, request.limit)
            
            # Process recommendations to ensure YouTube search URLs
            for rec in recommendations:
                # Create a specific YouTube search query
                search_query = f"{rec['title']} {rec['artist']}"
                rec['youtube_url'] = f"https://www.youtube.com/results?search_query={quote(search_query)}"

            return recommendations

    except Exception as e:
        logging.error(f"Error in get_local_music: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e)) 