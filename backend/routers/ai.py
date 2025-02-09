import base64
import json
import logging
import os
from typing import AsyncGenerator, List, Optional

import httpx
import yt_dlp
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from PIL import Image, ImageDraw, ImageFont
from pydantic import BaseModel

from .location import LocationQuery, find_nearby, search_locations
from .media import (HistoricalPhotoRequest, MusicRequest, create_postcard,
                    get_historical_photos, search_music)

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

class TourStopRequest(BaseModel):
    name: str
    type: str
    year: Optional[int] = None
    city: str

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
        api_key = os.getenv("CEREBRAS_API_KEY")
        if not api_key:
            raise ValueError("CEREBRAS_API_KEY environment variable not set")
            
        print("Sending request to Cerebras API...")
        print(f"Messages: {json.dumps(messages, indent=2)}")
        
        # Validate message roles
        for msg in messages:
            if msg["role"] not in ["system", "user", "assistant"]:
                logging.warning(f"Converting message role '{msg['role']}' to 'system'")
                msg["role"] = "system"
        
        request_body = {
            "model": "llama3.3-70b",
            "messages": messages,
            "tools": TOOLS,
            "stream": False  # Disable streaming
        }
        
        print(f"Request body: {json.dumps(request_body, indent=2)}")
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.cerebras.ai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                },
                json=request_body,
                timeout=30.0
            )
            
            print(f"Cerebras API Status Code: {response.status_code}")
            print(f"Cerebras API Response Headers: {response.headers}")
            
            if response.status_code != 200:
                error_text = await response.aread()
                try:
                    error_json = response.json()
                    error_detail = json.dumps(error_json, indent=2)
                except:
                    error_detail = error_text.decode('utf-8')
                    
                print(f"Cerebras API Error: {error_detail}")
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Cerebras API error: {error_detail}"
                )

            data = response.json()
            print(f"Cerebras response: {json.dumps(data, indent=2)}")
            
            if not data or not isinstance(data, dict):
                raise ValueError(f"Invalid response format: {data}")
                
            yield data

    except httpx.TimeoutException as e:
        print(f"Timeout error: {str(e)}")
        raise HTTPException(status_code=504, detail=f"Request to Cerebras API timed out: {str(e)}")
    except httpx.RequestError as e:
        print(f"Request error: {str(e)}")
        raise HTTPException(status_code=502, detail=f"Network error communicating with Cerebras API: {str(e)}")
    except Exception as e:
        print(f"Unexpected error in get_cerebras_response: {str(e)}")
        logging.exception("Error in get_cerebras_response")
        raise HTTPException(status_code=500, detail=f"Error getting AI response: {str(e)}")

async def execute_tool_calls(tool_calls: List[dict]) -> dict:
    """Execute tool calls from the AI response"""
    if not tool_calls:
        raise ValueError("No tool calls provided")
        
    results = {}
    errors = []
    
    for tool in tool_calls:
        try:
            tool_id = tool.get("id")
            if not tool_id:
                raise ValueError(f"Missing tool ID in tool call: {json.dumps(tool, indent=2)}")
                
            function = tool.get("function", {})
            name = function.get("name")
            if not name:
                raise ValueError(f"Missing function name in tool call: {json.dumps(tool, indent=2)}")
                
            args_str = function.get("arguments", "{}")
            try:
                args = json.loads(args_str)
            except json.JSONDecodeError as e:
                raise ValueError(f"Invalid JSON in tool arguments: {args_str}. Error: {str(e)}")
            
            logging.info(f"Executing tool {name} with args: {json.dumps(args, indent=2)}")
            
            if name == "get_location":
                if "query" not in args:
                    raise ValueError(f"Missing required 'query' parameter for get_location: {json.dumps(args, indent=2)}")
                result = await search_locations(
                    LocationQuery(query=args["query"])
                )
                results[tool_id] = {
                    "tool_result": {
                        "tool_call_id": tool_id,
                        "result": result
                    }
                }
                
            elif name == "search_osm":
                required = ["query", "latitude", "longitude"]
                missing = [p for p in required if p not in args]
                if missing:
                    raise ValueError(f"Missing required parameters for search_osm: {missing}")
                    
                result = await find_nearby(
                    category=args["query"],
                    lat=args["latitude"],
                    lon=args["longitude"],
                    radius=args.get("radius", 1000)
                )
                results[tool_id] = {
                    "tool_result": {
                        "tool_call_id": tool_id,
                        "result": result
                    }
                }
                
            elif name == "get_historical_photos":
                required = ["latitude", "longitude"]
                missing = [p for p in required if p not in args]
                if missing:
                    raise ValueError(f"Missing required parameters for get_historical_photos: {missing}")
                    
                result = await get_historical_photos(
                    HistoricalPhotoRequest(
                        latitude=args["latitude"],
                        longitude=args["longitude"],
                        radius=args.get("radius"),
                        year_from=args.get("year_from"),
                        year_to=args.get("year_to")
                    )
                )
                results[tool_id] = {
                    "tool_result": {
                        "tool_call_id": tool_id,
                        "result": result
                    }
                }
                
            elif name == "play_music":
                if "query" not in args:
                    raise ValueError(f"Missing required 'query' parameter for play_music: {json.dumps(args, indent=2)}")
                    
                result = await search_music(
                    MusicRequest(
                        query=args["query"],
                        duration_limit=args.get("duration_limit", 600)
                    )
                )
                results[tool_id] = {
                    "tool_result": {
                        "tool_call_id": tool_id,
                        "result": result
                    }
                }
                
            elif name == "create_postcard":
                required = ["image_url", "location_name"]
                missing = [p for p in required if p not in args]
                if missing:
                    raise ValueError(f"Missing required parameters for create_postcard: {missing}")
                    
                result = await create_postcard(args)
                results[tool_id] = {
                    "tool_result": {
                        "tool_call_id": tool_id,
                        "result": result
                    }
                }
                
            else:
                raise ValueError(f"Unknown tool name: {name}")
                
            logging.info(f"Tool {name} executed successfully. Result: {json.dumps(results[tool_id], indent=2)}")
                
        except Exception as e:
            error_msg = f"Error executing tool {name}: {str(e)}"
            logging.exception(error_msg)
            errors.append(error_msg)
            results[tool_id] = {
                "tool_result": {
                    "tool_call_id": tool_id,
                    "result": {"error": error_msg}
                }
            }
            
    if errors:
        raise ValueError("\n".join(errors))
            
    return results

@router.post("/chat")
async def chat_with_ai(request: ChatRequest):
    """Main chat endpoint that handles all user interactions"""
    try:
        logging.info("Received chat request: %s", request)
        print("Starting response generation...")
        
        # Get user ID from the first user message
        user_id = None
        for msg in request.messages:
            if msg.role == "user":
                user_id = request.context.get('userId') if request.context else None
                break
                
        if not user_id:
            raise ValueError("No user ID found in request context")
        
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        
        # Fetch previous messages from Firebase
        from firebase_admin import firestore
        db = firestore.client()
        messages_ref = db.collection('messages')
        query = messages_ref.where('userId', '==', user_id).order_by('timestamp', direction=firestore.Query.ASCENDING)
        docs = query.stream()
        
        # Add previous messages to context
        for doc in docs:
            msg_data = doc.to_dict()
            role = "assistant" if msg_data['type'] == 'ai' else "user"
            messages.append({
                "role": role,
                "content": msg_data['content']
            })
        
        # Add current message from the request
        messages.append({"role": "user", "content": request.messages[-1].content})

        logging.info("Prepared messages for Cerebras: %s", json.dumps(messages, indent=2))

        # Process any images
        if any(msg.image_url for msg in request.messages):
            logging.info("Processing image in request...")
            latest_image = next(msg for msg in reversed(request.messages) if msg.image_url)
            description = await get_image_description(latest_image.image_url)
            messages.append({"role": "system", "content": f"The image shows: {description}"})

        logging.info("Getting AI response...")
        async for response in get_cerebras_response(messages):
            logging.info("Received response from Cerebras: %s", json.dumps(response, indent=2))
            
            if not response:
                raise ValueError("Empty response from Cerebras API")
                
            if not response.get("choices"):
                raise ValueError(f"No choices in response: {json.dumps(response, indent=2)}")
                
            if not response["choices"][0].get("message"):
                raise ValueError(f"No message in first choice: {json.dumps(response['choices'][0], indent=2)}")
                
            message = response["choices"][0]["message"]
            logging.info("Extracted message from response: %s", json.dumps(message, indent=2))
            
            # Execute any tool calls
            if message.get("tool_calls"):
                logging.info("Found tool calls in message: %s", json.dumps(message["tool_calls"], indent=2))
                tool_results = await execute_tool_calls(message["tool_calls"])
                logging.info("Tool execution results: %s", json.dumps(tool_results, indent=2))
                
                # Add tool results to messages
                for tool_call in message["tool_calls"]:
                    tool_id = tool_call["id"]
                    result = tool_results.get(tool_id)
                    if result is None:
                        raise ValueError(f"No result for tool call {tool_id}")
                    
                    # Extract the actual result from the tool_result structure
                    tool_result = result["tool_result"]["result"]
                    
                    # For location results, format a nice response with the Google Maps link
                    if tool_call['function']['name'] == 'get_location' and tool_result:
                        try:
                            location = tool_result[0]  # Get first location result
                            lat = location['coordinates']['latitude']
                            lon = location['coordinates']['longitude']
                            name = location['name']
                            maps_link = f"https://www.google.com/maps?q={lat},{lon}"
                            response_text = f"I found {name}. Here's the location on Google Maps: {maps_link}"
                            
                            # Return immediately with the formatted response
                            return {"content": response_text}
                        except (IndexError, KeyError) as e:
                            logging.error(f"Error formatting location data: {str(e)}")
                    
                    # For other tool results, truncate if needed
                    result_str = json.dumps(tool_result)
                    if len(result_str) > 500:  # Truncate if longer than 500 chars
                        result_str = result_str[:497] + "..."
                        
                    messages.append({
                        "role": "system",
                        "content": f"Tool {tool_call['function']['name']} returned: {result_str}"
                    })
                    
                    logging.info("Added tool result to messages: %s", json.dumps(messages[-1], indent=2))
                
                # Get final response with tool results
                logging.info("Getting final response with tool results...")
                async for final_response in get_cerebras_response(messages):
                    if not final_response or not final_response.get("choices"):
                        raise ValueError(f"Invalid final response: {json.dumps(final_response, indent=2)}")
                        
                    if not final_response["choices"][0].get("message"):
                        raise ValueError(f"No message in final response: {json.dumps(final_response['choices'][0], indent=2)}")
                        
                    final_message = final_response["choices"][0]["message"]
                    content = final_message.get("content", "")
                    
                    # Return the content directly without saving to Firebase
                    return {"content": content}
            
            # If no tool calls, save and return the message content directly
            content = message.get("content", "")
            
            return {"content": content}

    except Exception as e:
        logging.exception("Error in chat endpoint")
        error_message = f"Sorry, I encountered an error: {str(e)}. Check the server logs for more details."
        
        return {"error": error_message}

@router.post("/analyze-image")
async def analyze_image(request: ImageAnalysisRequest):
    """
    Analyze an image using Moondream
    """
    try:
        # Download image from Firebase Storage URL
        async with httpx.AsyncClient() as client:
            response = await client.get(request.image_url)
            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Failed to fetch image from URL: {response.status_code}"
                )
            
            # Convert to base64
            image_base64 = base64.b64encode(response.content).decode('utf-8')
            
            # Get description from Moondream
            description = await get_image_description(image_base64, is_base64=True)
            
            # Return the description
            return {"description": description}
            
    except Exception as e:
        logging.error(f"Error analyzing image: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error analyzing image: {str(e)}"
        )

@router.post("/generate-stop-description")
async def generate_stop_description(request: TourStopRequest) -> dict:
    """
    Generate a description for a tour stop using Cerebras AI
    """
    try:
        # Construct the prompt
        year_context = f" from {request.year}" if request.year else ""
        prompt = f"""Generate a brief, engaging description (2-3 sentences) of {request.name}, a historic {request.type} located specifically in {request.city}{year_context}.
        IMPORTANT: Focus only on the {request.name} that is located in {request.city}, not any similarly named landmarks in other cities.
        Include its historical significance, interesting facts, and its specific connection to {request.city}'s history."""

        messages = [
            {"role": "system", "content": f"""You are a knowledgeable tour guide with expertise in {request.city}'s local history.
            When describing landmarks, always ensure you are referring to the specific landmark in {request.city}, not similarly named places elsewhere.
            Focus on accurate, location-specific historical information."""},
            {"role": "user", "content": prompt}
        ]

        # Get AI response using existing Cerebras function
        async for response in get_cerebras_response(messages):
            if "choices" in response and len(response["choices"]) > 0:
                message = response["choices"][0].get("message", {})
                if "content" in message:
                    return {"description": message["content"].strip()}

        raise HTTPException(status_code=500, detail="Failed to generate description")

    except Exception as e:
        logging.error(f"Error generating stop description: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error generating stop description: {str(e)}"
        ) 