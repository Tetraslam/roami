import json
import logging
import os
from math import cos, radians
from typing import List, Optional

import httpx
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

router = APIRouter(
    prefix="/location",
    tags=["Location Services"]
)

class Coordinates(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)

class LocationQuery(BaseModel):
    query: str
    coordinates: Optional[Coordinates] = None
    radius: Optional[int] = Field(default=1000, ge=100, le=5000)  # meters

class POIResponse(BaseModel):
    id: str
    name: str
    type: str
    coordinates: Coordinates
    distance: Optional[float] = None
    tags: dict = Field(default_factory=dict)
    additional_info: Optional[dict] = Field(default_factory=dict)

    class Config:
        json_schema_extra = {
            "example": {
                "id": "123",
                "name": "Example POI",
                "type": "restaurant",
                "coordinates": {
                    "latitude": 40.7128,
                    "longitude": -74.0060
                },
                "distance": 100.0,
                "tags": {},
                "additional_info": {}
            }
        }
        
    def dict(self, *args, **kwargs):
        # Ensure coordinates is converted to dict
        d = super().dict(*args, **kwargs)
        d['coordinates'] = self.coordinates.dict()
        return d
        
    def json(self, *args, **kwargs):
        return json.dumps(self.dict(), *args, **kwargs)

def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate approximate distance between two points in meters using equirectangular approximation."""
    R = 6371000  # Earth's radius in meters
    x = (radians(lon2) - radians(lon1)) * cos(0.5 * (radians(lat2) + radians(lat1)))
    y = radians(lat2) - radians(lat1)
    return R * (x * x + y * y) ** 0.5

@router.post("/search")
async def search_locations(query: LocationQuery) -> List[POIResponse]:
    """
    Search for points of interest using OpenStreetMap's Nominatim API
    """
    try:
        logging.info(f"Searching for location: {query.query}")
        
        # Use Nominatim for geocoding
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params={
                    "q": query.query,
                    "format": "json",
                    "limit": 10,
                    "addressdetails": 1,
                    "namedetails": 1,
                    "extratags": 1
                },
                headers={
                    "User-Agent": "Roami/1.0"
                }
            )
            
            logging.info(f"Nominatim API response status: {response.status_code}")
            
            if response.status_code != 200:
                error_text = await response.aread()
                try:
                    error_json = response.json()
                    error_detail = json.dumps(error_json, indent=2)
                except:
                    error_detail = error_text.decode('utf-8')
                    
                logging.error(f"OpenStreetMap API error: {error_detail}")
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"OpenStreetMap API error: {error_detail}"
                )
            
            results = response.json()
            logging.info(f"Raw Nominatim response: {json.dumps(results, indent=2)}")
            logging.info(f"Found {len(results)} results")
            
            if not results:
                logging.info(f"No results found for query: {query.query}")
                return []
            
            pois = []
            for result in results:
                try:
                    # Validate required fields
                    if "place_id" not in result:
                        logging.error(f"Missing place_id in result: {json.dumps(result, indent=2)}")
                        continue
                        
                    # Ensure place_id is converted to string
                    try:
                        place_id = str(result["place_id"])
                    except (ValueError, TypeError) as e:
                        logging.error(f"Invalid place_id format: {result['place_id']}, Error: {str(e)}")
                        continue
                        
                    if "display_name" not in result:
                        logging.error(f"Missing display_name in result: {json.dumps(result, indent=2)}")
                        continue
                    if "lat" not in result or "lon" not in result:
                        logging.error(f"Missing coordinates in result: {json.dumps(result, indent=2)}")
                        continue

                    # Calculate distance if coordinates provided
                    distance = None
                    if query.coordinates:
                        distance = calculate_distance(
                            query.coordinates.latitude,
                            query.coordinates.longitude,
                            float(result["lat"]),
                            float(result["lon"])
                        )
                        # Skip if outside radius
                        if query.radius and distance > query.radius:
                            continue
                    
                    poi = POIResponse(
                        id=place_id,
                        name=result["display_name"],
                        type=result.get("type", "unknown"),
                        coordinates=Coordinates(
                            latitude=float(result["lat"]),
                            longitude=float(result["lon"])
                        ),
                        distance=distance,
                        tags=result.get("extratags", {}),
                        additional_info={
                            "osm_type": result.get("osm_type"),
                            "address": result.get("address", {}),
                            "importance": result.get("importance"),
                            "name_details": result.get("namedetails", {})
                        }
                    )
                    pois.append(poi)
                    logging.info(f"Added POI: {poi.name}")
                except Exception as e:
                    logging.error(f"Error processing result: {str(e)}")
                    continue
            
            # Sort by distance if coordinates provided, otherwise by importance
            if query.coordinates:
                pois.sort(key=lambda x: x.distance if x.distance is not None else float('inf'))
            else:
                pois.sort(key=lambda x: x.additional_info.get("importance", 0), reverse=True)
            
            logging.info(f"Returning {len(pois)} POIs")
            
            # Convert POIs to JSON-serializable format
            return [poi.dict() for poi in pois]

    except HTTPException:
        raise
    except Exception as e:
        logging.exception("Error searching locations")
        raise HTTPException(
            status_code=500,
            detail=f"Error searching locations: {str(e)}"
        )

@router.get("/nearby/{category}")
async def find_nearby(
    category: str,
    lat: float = Query(..., ge=-90, le=90, description="Latitude"),
    lon: float = Query(..., ge=-180, le=180, description="Longitude"),
    radius: Optional[int] = Query(default=1000, ge=100, le=5000, description="Search radius in meters")
) -> List[POIResponse]:
    """
    Find nearby points of interest by category using Overpass API
    """
    try:
        # Map common categories to OSM tags with proper Overpass QL syntax
        category_tags = {
            "restaurant": '"amenity"="restaurant"',
            "cafe": '"amenity"="cafe"',
            "bathroom": '"amenity"="toilets"',
            "parking": '"amenity"="parking"',
            "gas": '"amenity"="fuel"',
            "hotel": '"tourism"="hotel"',
            "attraction": '"tourism"="attraction"',  # Simplified attraction filter
            "historic": '"historic"~"."',           # Separate historic filter
            "viewpoint": '"tourism"="viewpoint"',
            "museum": '"tourism"="museum"',
            "park": '"leisure"="park"',
            "supermarket": '"shop"="supermarket"',
            "hospital": '"amenity"="hospital"',
            "pharmacy": '"amenity"="pharmacy"'
        }

        # Get OSM tag for category or use the category as a direct tag
        tag_filter = category_tags.get(category.lower())
        if not tag_filter:
            tag_filter = f'"amenity"="{category}"'
        
        # Special handling for attractions to include both tourist attractions and historic sites
        if category.lower() == "attraction":
            overpass_query = f"""
            [out:json][timeout:25];
            (
                node[{tag_filter}](around:{radius},{lat},{lon});
                way[{tag_filter}](around:{radius},{lat},{lon});
                relation[{tag_filter}](around:{radius},{lat},{lon});
                node["historic"~"."](around:{radius},{lat},{lon});
                way["historic"~"."](around:{radius},{lat},{lon});
                relation["historic"~"."](around:{radius},{lat},{lon});
            );
            out body center;
            """
        else:
            # Standard query for other categories
            overpass_query = f"""
            [out:json][timeout:25];
            (
                node[{tag_filter}](around:{radius},{lat},{lon});
                way[{tag_filter}](around:{radius},{lat},{lon});
                relation[{tag_filter}](around:{radius},{lat},{lon});
            );
            out body center;
            """

        logging.info(f"Executing Overpass query: {overpass_query}")

        # Make request to Overpass API with proper headers and error handling
        async with httpx.AsyncClient() as client:
            response = await client.post(
                os.getenv("OVERPASS_API_URL", "https://overpass-api.de/api/interpreter"),
                data={"data": overpass_query},
                headers={
                    "User-Agent": "Roami/1.0 (https://github.com/yourusername/roami)",
                    "Accept": "application/json"
                },
                timeout=30.0
            )
            
            if response.status_code == 429:
                raise HTTPException(
                    status_code=429,
                    detail="Too many requests to Overpass API. Please try again later."
                )
            
            if response.status_code != 200:
                error_text = await response.aread()
                logging.error(f"Overpass API error: {error_text}")
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Overpass API error: {response.status_code}"
                )
            
            try:
                data = response.json()
            except Exception as e:
                logging.error(f"Failed to parse Overpass response: {str(e)}")
                raise HTTPException(
                    status_code=500,
                    detail="Failed to parse Overpass API response"
                )

            if "elements" not in data:
                logging.warning("No elements in Overpass response")
                return []

            pois = []
            seen_ids = set()  # To prevent duplicates
            
            for element in data["elements"]:
                try:
                    # Skip if we've seen this POI already
                    element_id = f"{element['type']}/{element['id']}"
                    if element_id in seen_ids:
                        continue
                    seen_ids.add(element_id)

                    # Get coordinates based on element type
                    if element["type"] == "node":
                        element_lat = element["lat"]
                        element_lon = element["lon"]
                    elif element["type"] in ["way", "relation"]:
                        # For ways and relations, use center point if available
                        center = element.get("center", {})
                        if not center:
                            continue
                        element_lat = center.get("lat", lat)
                        element_lon = center.get("lon", lon)
                    else:
                        continue

                    # Calculate distance
                    distance = calculate_distance(lat, lon, element_lat, element_lon)

                    # Skip if outside radius
                    if distance > radius:
                        continue

                    # Extract tags
                    tags = element.get("tags", {})
                    if not tags:
                        continue

                    # Create POI response
                    poi = POIResponse(
                        id=element_id,
                        name=tags.get("name", tags.get("brand", "Unnamed")),
                        type=category,
                        coordinates=Coordinates(
                            latitude=element_lat,
                            longitude=element_lon
                        ),
                        distance=distance,
                        tags=tags,
                        additional_info={
                            "osm_type": element["type"],
                            "opening_hours": tags.get("opening_hours"),
                            "website": tags.get("website"),
                            "phone": tags.get("phone"),
                            "wheelchair": tags.get("wheelchair"),
                            "description": tags.get("description")
                        }
                    )
                    pois.append(poi)

                except Exception as e:
                    logging.error(f"Error processing POI element: {str(e)}")
                    continue
            
            # Sort by distance
            pois.sort(key=lambda x: x.distance if x.distance is not None else float('inf'))
            
            # Limit results and convert to JSON-serializable format
            return [poi.dict() for poi in pois[:50]]

    except HTTPException:
        raise
    except Exception as e:
        logging.exception("Error finding nearby locations")
        raise HTTPException(
            status_code=500,
            detail=f"Error finding nearby locations: {str(e)}"
        ) 