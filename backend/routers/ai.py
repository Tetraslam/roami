import base64
import io
import json
import logging
import os
from datetime import datetime
from typing import AsyncGenerator, Dict, List, Optional

import httpx
import yt_dlp
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from PIL import Image, ImageDraw, ImageFont
from pydantic import BaseModel

router = APIRouter(
    prefix="/ai",
    tags=["AI Services"]
)

class ChatMessage(BaseModel):
    role: str
    content: str
    image_url: Optional[str] = None

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    context: Optional[dict] = None

class ToolCall(BaseModel):
    name: str
    parameters: dict

class ImageAnalysisRequest(BaseModel):
    image_url: str
    prompt: Optional[str] = None

# Tool schemas according to Cerebras documentation
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_location",
            "description": "Get current location or search for a place",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Location to search for, or 'current' for current location"
                    }
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_osm",
            "description": "Search OpenStreetMap for POIs, facilities, or places",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "What to search for (e.g., 'restaurants', 'bathrooms', 'tourist attractions')"
                    },
                    "latitude": {
                        "type": "number",
                        "description": "Latitude of the search center"
                    },
                    "longitude": {
                        "type": "number",
                        "description": "Longitude of the search center"
                    },
                    "radius": {
                        "type": "number",
                        "description": "Search radius in meters",
                        "default": 1000
                    }
                },
                "required": ["query", "latitude", "longitude"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_historical_photos",
            "description": "Find historical photos from Wikimedia Commons based on location",
            "parameters": {
                "type": "object",
                "properties": {
                    "latitude": {
                        "type": "number",
                        "description": "Latitude of the location"
                    },
                    "longitude": {
                        "type": "number",
                        "description": "Longitude of the location"
                    },
                    "radius": {
                        "type": "number",
                        "description": "Search radius in meters",
                        "default": 1000
                    },
                    "year_from": {
                        "type": "number",
                        "description": "Start year for historical photos"
                    },
                    "year_to": {
                        "type": "number",
                        "description": "End year for historical photos"
                    }
                },
                "required": ["latitude", "longitude"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "play_music",
            "description": "Search and play music using yt-dlp",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Song or music to search for"
                    },
                    "duration_limit": {
                        "type": "number",
                        "description": "Maximum duration in seconds",
                        "default": 600
                    }
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_postcard",
            "description": "Create a postcard from an image with location details",
            "parameters": {
                "type": "object",
                "properties": {
                    "image_url": {
                        "type": "string",
                        "description": "URL of the image to use"
                    },
                    "location_name": {
                        "type": "string",
                        "description": "Name of the location"
                    },
                    "message": {
                        "type": "string",
                        "description": "Message to add to postcard"
                    }
                },
                "required": ["image_url", "location_name"]
            }
        }
    }
]

SYSTEM_PROMPT = """You are Roami, an AI roadtrip companion. Users interact with you through voice and images.
You have access to these tools:

1. get_location: Find current location or search places
2. search_osm: Search OpenStreetMap for POIs, bathrooms, restaurants, etc.
3. get_historical_photos: Find historical photos from Wikimedia Commons
4. play_music: Stream music using yt-dlp
5. create_postcard: Create a postcard from an image

You should:
- Be conversational and friendly
- Use tools automatically without explaining them to the user
- Respond naturally as if you're having a conversation
- For location-based queries, always check location first
- For image analysis, always use Moondream first
- Chain multiple tools together when needed (e.g., get_location -> search_osm)

Examples:
User: "any cool tourist spots around here?"
You: *use get_location, then search_osm, then respond naturally about findings*

User: *sends image* "where is this?"
You: *use analyze_image first, then try to determine location from description*

User: "play some relaxing music while I drive"
You: *use play_music with appropriate search terms*
"""

async def get_image_description(image_data: str, is_base64: bool = False) -> str:
    """Get a description of an image using the Moondream API.
    
    Args:
        image_data: Either a URL or base64 encoded image data
        is_base64: Whether the image_data is base64 encoded
    
    Returns:
        A description of the image
    """
    try:
        api_key = os.getenv("MOONDREAM_API_KEY")
        if not api_key:
            raise ValueError("MOONDREAM_API_KEY environment variable not set")

        headers = {
            "X-Moondream-Auth": api_key,
            "Content-Type": "application/json"
        }

        # If base64, upload to temporary storage and get URL
        if is_base64:
            # For now, we'll use a data URL
            if not image_data.startswith('data:image'):
                image_data = f"data:image/jpeg;base64,{image_data}"

        payload = {
            "image_url": image_data,
            "stream": False,
            "length": "normal"
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.moondream.ai/v1/caption",
                headers=headers,
                json=payload
            )
            
            if response.status_code == 200:
                result = response.json()
                return result.get("caption", "No description available")
            else:
                logging.error(f"Moondream API error: {response.text}")
                raise ValueError(f"Error analyzing image: {response.text}")

    except Exception as e:
        logging.error(f"Error in get_image_description: {str(e)}")
        raise ValueError(f"Error analyzing image: {str(e)}")

async def get_cerebras_response(messages: List[dict]) -> AsyncGenerator[dict, None]:
    """Get response from Cerebras llama3.1-8b"""
    try:
        print("Sending request to Cerebras API...")
        print(f"Messages: {json.dumps(messages, indent=2)}")
        
        request_body = {
            "model": "llama3.1-8b",
            "messages": messages,
            "tools": TOOLS,
            "stream": False  # Disable streaming
        }
        
        print(f"Request body: {json.dumps(request_body, indent=2)}")
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.cerebras.ai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {os.getenv('CEREBRAS_API_KEY')}",
                    "Content-Type": "application/json"
                },
                json=request_body,
                timeout=30.0
            )
            
            print(f"Cerebras API Status Code: {response.status_code}")
            if response.status_code != 200:
                error_detail = response.json() if response.headers.get("content-type") == "application/json" else response.text
                print(f"Cerebras API Error: {error_detail}")
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Cerebras API error: {error_detail}"
                )

            data = response.json()
            print(f"Cerebras response: {json.dumps(data, indent=2)}")
            yield data

    except httpx.TimeoutException as e:
        print(f"Timeout error: {str(e)}")
        raise HTTPException(status_code=504, detail="Request to Cerebras API timed out")
    except httpx.RequestError as e:
        print(f"Request error: {str(e)}")
        raise HTTPException(status_code=502, detail=f"Network error communicating with Cerebras API: {str(e)}")
    except Exception as e:
        print(f"Unexpected error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting AI response: {str(e)}")

async def execute_tool_calls(tool_calls: List[dict]) -> dict:
    """Execute tool calls from the AI response"""
    results = {}
    for tool in tool_calls:
        try:
            if tool["name"] == "get_location":
                results["location"] = await get_location(tool["parameters"])
            elif tool["name"] == "search_osm":
                results["places"] = await search_osm(tool["parameters"])
            elif tool["name"] == "get_historical_photos":
                results["photos"] = await get_historical_photos(tool["parameters"])
            elif tool["name"] == "play_music":
                results["music"] = await play_music(tool["parameters"])
            elif tool["name"] == "create_postcard":
                results["postcard"] = await create_postcard(tool["parameters"])
        except Exception as e:
            results[tool["name"]] = {"error": str(e)}
    return results

async def get_location(params: dict) -> dict:
    """Get location information"""
    query = params.get("query")
    if query == "current":
        # For now, return a default location (can be updated with actual geolocation)
        return {
            "latitude": 40.7128,
            "longitude": -74.0060,
            "name": "Current Location",
            "address": "New York, NY, USA"
        }
    
    # Use Nominatim for geocoding
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params={
                    "q": query,
                    "format": "json",
                    "limit": 1,
                    "addressdetails": 1
                },
                headers={
                    "User-Agent": "Roami/1.0"
                }
            )
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail="Geocoding error")
            
            results = response.json()
            if not results:
                return {"error": "Location not found"}
            
            location = results[0]
            return {
                "latitude": float(location["lat"]),
                "longitude": float(location["lon"]),
                "name": location["display_name"],
                "address": location.get("address", {})
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting location: {str(e)}")

async def search_osm(params: dict) -> List[dict]:
    """Search OpenStreetMap for POIs"""
    query = params["query"]
    lat = params["latitude"]
    lon = params["longitude"]
    radius = params.get("radius", 1000)

    # Construct Overpass query
    overpass_query = f"""
    [out:json][timeout:25];
    (
        node["amenity"](around:{radius},{lat},{lon});
        way["amenity"](around:{radius},{lat},{lon});
        node["tourism"](around:{radius},{lat},{lon});
        way["tourism"](around:{radius},{lat},{lon});
    );
    out body;
    >;
    out skel qt;
    """

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                os.getenv("OVERPASS_API_URL", "https://overpass-api.de/api/interpreter"),
                data={"data": overpass_query},
                timeout=30.0
            )
            
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail="Overpass API error")
            
            data = response.json()
            places = []
            
            for element in data.get("elements", []):
                if "tags" in element:
                    place = {
                        "type": element["type"],
                        "id": element["id"],
                        "latitude": element.get("lat", lat),
                        "longitude": element.get("lon", lon),
                        "name": element["tags"].get("name", "Unnamed"),
                        "amenity": element["tags"].get("amenity"),
                        "tourism": element["tags"].get("tourism"),
                        "description": element["tags"].get("description"),
                        "website": element["tags"].get("website"),
                        "opening_hours": element["tags"].get("opening_hours")
                    }
                    places.append(place)
            
            # Sort by distance from search center
            places.sort(key=lambda x: ((x["latitude"] - lat) ** 2 + (x["longitude"] - lon) ** 2) ** 0.5)
            
            return places[:10]  # Return top 10 results
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error searching OSM: {str(e)}")

async def get_historical_photos(params: dict) -> List[dict]:
    """Get historical photos from Wikimedia Commons"""
    lat = params["latitude"]
    lon = params["longitude"]
    radius = params.get("radius", 1000)
    year_from = params.get("year_from")
    year_to = params.get("year_to")

    try:
        async with httpx.AsyncClient() as client:
            # First, search for geotagged images
            response = await client.get(
                "https://commons.wikimedia.org/w/api.php",
                params={
                    "action": "query",
                    "format": "json",
                    "list": "geosearch",
                    "gscoord": f"{lat}|{lon}",
                    "gsradius": radius,
                    "gslimit": 20,
                    "generator": "search",
                    "gsnamespace": 6,  # File namespace
                    "prop": "imageinfo|categories",
                    "iiprop": "url|timestamp|user|extmetadata",
                    "iiurlwidth": 800,
                },
                headers={
                    "User-Agent": os.getenv("WIKIMEDIA_USER_AGENT")
                }
            )

            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail="Wikimedia API error")

            data = response.json()
            photos = []

            for page in data.get("query", {}).get("pages", {}).values():
                if "imageinfo" not in page:
                    continue

                info = page["imageinfo"][0]
                metadata = info.get("extmetadata", {})
                
                # Extract year from date if available
                date_str = metadata.get("DateTimeOriginal", {}).get("value", "")
                try:
                    year = int(date_str[:4])
                    if year_from and year < year_from:
                        continue
                    if year_to and year > year_to:
                        continue
                except (ValueError, TypeError):
                    year = None

                photo = {
                    "title": page["title"],
                    "url": info["url"],
                    "thumbnail": info.get("thumburl"),
                    "year": year,
                    "description": metadata.get("ImageDescription", {}).get("value"),
                    "author": metadata.get("Artist", {}).get("value"),
                    "license": metadata.get("License", {}).get("value"),
                    "latitude": lat,
                    "longitude": lon
                }
                photos.append(photo)

            return photos

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting historical photos: {str(e)}")

async def play_music(params: dict) -> dict:
    """Search and play music using yt-dlp"""
    query = params["query"]
    duration_limit = params.get("duration_limit", 600)  # 10 minutes default

    try:
        # Configure yt-dlp
        ydl_opts = {
            'format': 'bestaudio/best',
            'extract_audio': True,
            'audioformat': 'mp3',
            'outtmpl': '%(id)s.%(ext)s',
            'quiet': True,
            'no_warnings': True,
            'default_search': 'ytsearch',
            'max_downloads': 1,
            'duration_limit': duration_limit
        }

        # Search for video
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            try:
                # Search and get video info
                result = ydl.extract_info(f"ytsearch1:{query}", download=False)
                
                if 'entries' in result:
                    video = result['entries'][0]
                else:
                    video = result

                # Get the best audio format URL
                formats = video.get('formats', [])
                audio_formats = [f for f in formats if f.get('acodec') != 'none' and f.get('vcodec') == 'none']
                
                if not audio_formats:
                    audio_formats = formats
                
                best_audio = max(audio_formats, key=lambda f: f.get('abr', 0) if f.get('abr') else 0)

                return {
                    "title": video.get('title'),
                    "url": best_audio.get('url'),
                    "duration": video.get('duration'),
                    "thumbnail": video.get('thumbnail'),
                    "artist": video.get('artist') or video.get('uploader'),
                    "format": best_audio.get('format_id')
                }

            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Error searching for music: {str(e)}")

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error configuring music player: {str(e)}")

async def create_postcard(params: dict) -> dict:
    """Create a postcard from an image with location details"""
    image_url = params["image_url"]
    location_name = params["location_name"]
    message = params.get("message", "Greetings from {}!".format(location_name))

    try:
        # Download the image
        async with httpx.AsyncClient() as client:
            response = await client.get(image_url)
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail="Error downloading image")
            
            image_data = response.content
            image = Image.open(io.BytesIO(image_data))

        # Resize image to standard postcard size (6x4 inches at 300dpi)
        postcard_size = (1800, 1200)
        image = image.resize(postcard_size, Image.Resampling.LANCZOS)

        # Create a new image with white space for text
        postcard = Image.new('RGB', postcard_size, 'white')
        postcard.paste(image.resize((1800, 900), Image.Resampling.LANCZOS), (0, 0))

        # Add text
        draw = ImageDraw.Draw(postcard)
        
        # Use a default font (you might want to include a custom font file)
        # font = ImageFont.truetype("path/to/font.ttf", size=40)
        font = ImageFont.load_default()

        # Add location and date
        date_str = datetime.now().strftime("%B %d, %Y")
        draw.text((50, 920), location_name, fill='black', font=font)
        draw.text((50, 970), date_str, fill='black', font=font)

        # Add message
        draw.text((50, 1020), message, fill='black', font=font)

        # Convert to base64
        buffer = io.BytesIO()
        postcard.save(buffer, format='JPEG', quality=85)
        image_base64 = base64.b64encode(buffer.getvalue()).decode()

        return {
            "image": f"data:image/jpeg;base64,{image_base64}",
            "location": location_name,
            "date": date_str,
            "message": message
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating postcard: {str(e)}")

@router.post("/chat")
async def chat_with_ai(request: ChatRequest):
    """Main chat endpoint that handles all user interactions"""
    print("Received chat request:", request)
    
    try:
        print("Starting response generation...")
        # 1. Process any images first
        if any(msg.image_url for msg in request.messages):
            print("Processing image in request...")
            latest_image = next(msg for msg in reversed(request.messages) if msg.image_url)
            description = await get_image_description(latest_image.image_url)
            
            # Add description to messages
            request.messages.append(ChatMessage(
                role="system",
                content=f"The image shows: {description}"
            ))

        print("Getting AI response...")
        # 2. Get AI response with potential tool calls
        async for response in get_cerebras_response([
            {"role": "system", "content": SYSTEM_PROMPT},
            *[{"role": m.role, "content": m.content} for m in request.messages]
        ]):
            if response.get("choices") and response["choices"][0].get("message"):
                return response["choices"][0]["message"]
            return {"error": "Invalid response format from Cerebras"}

    except Exception as e:
        return {
            "error": f"Sorry, I encountered an error: {str(e)}"
        }

@router.post("/analyze-image")
async def analyze_image(request: ImageAnalysisRequest):
    """
    Analyze an image using Moondream
    """
    try:
        description = await get_image_description(request.image_url)
        return {"description": description}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error analyzing image: {str(e)}") 