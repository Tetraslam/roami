import json
import logging
import os
from typing import List, Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(
    prefix="/cultural",
    tags=["Cultural Information"]
)

class CulturalRequest(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    category: str = Field(..., description="Category of cultural information to fetch")

class CulturalInfo(BaseModel):
    category: str
    title: str
    description: str
    tips: Optional[List[str]] = None
    relevance: Optional[str] = None
    source: Optional[str] = None

async def get_cultural_insights(location_name: str, category: str) -> List[dict]:
    """Get cultural insights from Cerebras AI"""
    try:
        api_key = os.getenv("CEREBRAS_API_KEY")
        if not api_key:
            raise ValueError("CEREBRAS_API_KEY environment variable not set")

        # Craft a specific prompt for cultural insights
        messages = [
            {
                "role": "system",
                "content": f"""You are a cultural expert providing insights about {location_name}. 
                Focus on {category}-related information that would help travelers understand and 
                appreciate the local culture. Include practical tips and relevant context.
                
                Return ONLY a valid JSON array with no additional text, in this format:
                [
                  {{
                    "category": "{category}",
                    "title": "Aspect title",
                    "description": "Detailed description",
                    "tips": ["tip1", "tip2", "tip3"],
                    "relevance": "Why this is important for travelers",
                    "source": "Source of information if available"
                  }}
                ]"""
            },
            {
                "role": "user",
                "content": f"Tell me about the {category} of {location_name}, focusing on what travelers should know."
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
                    detail=f"Failed to get cultural insights: {response.text}"
                )

            data = response.json()
            if "choices" in data and len(data["choices"]) > 0:
                content = data["choices"][0]["message"]["content"]
                try:
                    # Clean up the content
                    json_start = content.find('[')
                    json_end = content.rfind(']') + 1
                    if json_start != -1 and json_end > json_start:
                        json_content = content[json_start:json_end]
                        return json.loads(json_content)
                except json.JSONDecodeError as e:
                    logging.error(f"Failed to parse cultural insights JSON: {e}")
                    logging.error(f"Raw content: {content}")
                    raise ValueError("Failed to parse AI response")

            raise ValueError("No valid cultural insights received from AI")

    except Exception as e:
        logging.error(f"Error getting cultural insights: {str(e)}")
        raise

@router.post("/info", response_model=List[CulturalInfo])
async def get_cultural_information(request: CulturalRequest):
    """Get cultural information based on location and category"""
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

            # Get cultural insights for this location and category
            cultural_info = await get_cultural_insights(location_name, request.category)
            return cultural_info

    except Exception as e:
        logging.error(f"Error in get_cultural_information: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e)) 