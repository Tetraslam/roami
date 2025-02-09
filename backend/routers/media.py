import base64
import io
import json
import logging
import os
from typing import List, Optional
from urllib.parse import quote

import httpx
import yt_dlp
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from PIL import Image, ImageDraw, ImageFont
from pydantic import BaseModel, Field

router = APIRouter(
    prefix="/media",
    tags=["Media Services"]
)

class MusicRequest(BaseModel):
    query: str
    duration_limit: Optional[int] = Field(default=600, ge=30, le=1800)  # 30s to 30min

class MusicResponse(BaseModel):
    title: str
    url: str
    duration: int
    thumbnail: Optional[str]
    artist: Optional[str]
    format: str

class HistoricalPhotoRequest(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    radius: Optional[int] = Field(default=1000, ge=100, le=5000)  # meters
    year_from: Optional[int] = None
    year_to: Optional[int] = None

class PhotoResponse(BaseModel):
    url: str
    title: str
    year: Optional[int] = None
    description: Optional[str] = None
    author: Optional[str] = None
    license: Optional[str] = Field(default="No license information available")
    thumbnail: Optional[str] = None
    source_url: Optional[str] = None

    class Config:
        from_attributes = True

    def dict(self, *args, **kwargs):
        return {
            "url": self.url,
            "title": self.title,
            "year": self.year,
            "description": self.description,
            "author": self.author,
            "license": self.license,
            "thumbnail": self.thumbnail,
            "source_url": self.source_url
        }

    def json(self, *args, **kwargs):
        return json.dumps(self.dict(*args, **kwargs))

class PostcardRequest(BaseModel):
    image_url: str
    location_name: str
    message: Optional[str] = None

class PostcardResponse(BaseModel):
    url: str
    preview_url: str

@router.post("/music/search")
async def search_music(request: MusicRequest) -> MusicResponse:
    """
    Search and get music stream URL using yt-dlp
    """
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
            'duration_limit': request.duration_limit
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            # Search for video
            result = ydl.extract_info(f"ytsearch1:{request.query}", download=False)
            
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

            return MusicResponse(
                title=video.get('title'),
                url=best_audio.get('url'),
                duration=video.get('duration', 0),
                thumbnail=video.get('thumbnail'),
                artist=video.get('artist') or video.get('uploader'),
                format=best_audio.get('format_id')
            )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error searching music: {str(e)}")

@router.get("/music/stream")
async def stream_music(url: str = Query(..., description="Music stream URL")):
    """
    Stream music from URL (proxy to avoid CORS issues)
    """
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, follow_redirects=True)
            return StreamingResponse(
                response.aiter_bytes(),
                media_type="audio/mpeg",
                headers={
                    "Accept-Ranges": "bytes",
                    "Content-Type": "audio/mpeg"
                }
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error streaming music: {str(e)}")

@router.post("/photos/historical")
async def get_historical_photos(request: HistoricalPhotoRequest) -> List[PhotoResponse]:
    """
    Get historical photos from Wikimedia Commons based on location
    """
    try:
        async with httpx.AsyncClient() as client:
            # First, get the location name for better search
            location_response = await client.get(
                "https://nominatim.openstreetmap.org/reverse",
                params={
                    "lat": request.latitude,
                    "lon": request.longitude,
                    "format": "json",
                },
                headers={
                    "User-Agent": os.getenv("WIKIMEDIA_USER_AGENT", "Roami/1.0")
                }
            )
            
            if location_response.status_code != 200:
                logging.error(f"Location lookup failed: {location_response.text}")
                raise HTTPException(status_code=location_response.status_code, detail="Location lookup failed")
            
            location_data = location_response.json()
            location_name = location_data.get('address', {}).get('city') or \
                          location_data.get('address', {}).get('town') or \
                          location_data.get('address', {}).get('suburb') or \
                          location_data.get('display_name', '').split(',')[0]

            logging.info(f"Searching for historical photos in: {location_name}")

            # Search for images using location name and coordinates
            search_response = await client.get(
                "https://commons.wikimedia.org/w/api.php",
                params={
                    "action": "query",
                    "format": "json",
                    "generator": "search",
                    "gsrsearch": f"{location_name} historic",
                    "gsrnamespace": 6,  # File namespace
                    "gsrlimit": 50,  # Get more results
                    "prop": "imageinfo|categories",
                    "iiprop": "url|timestamp|user|extmetadata",
                    "iiurlwidth": 800,
                    "iiurlheight": 800,
                },
                headers={
                    "User-Agent": os.getenv("WIKIMEDIA_USER_AGENT", "Roami/1.0")
                }
            )

            if search_response.status_code != 200:
                logging.error(f"Wikimedia API error: {search_response.text}")
                raise HTTPException(status_code=search_response.status_code, detail="Wikimedia API error")

            data = search_response.json()
            if "query" not in data or "pages" not in data["query"]:
                logging.warning("No photos found in Wikimedia API response")
                return []

            photos = []
            for page in data["query"]["pages"].values():
                try:
                    if "imageinfo" not in page:
                        continue

                    info = page["imageinfo"][0]
                    metadata = info.get("extmetadata", {})

                    # Try to extract year from various metadata fields
                    year = None
                    date_str = metadata.get("DateTimeOriginal", {}).get("value") or \
                              metadata.get("DateTime", {}).get("value")
                    if date_str:
                        # Try to extract year using regex
                        import re
                        year_match = re.search(r'\b(18|19|20)\d{2}\b', date_str)
                        if year_match:
                            year = int(year_match.group())

                    # Skip if year is outside requested range
                    if request.year_from and year and year < request.year_from:
                        continue
                    if request.year_to and year and year > request.year_to:
                        continue

                    # Get license information or use default
                    license_info = metadata.get("License", {}).get("value") or \
                                 metadata.get("LicenseShortName", {}).get("value") or \
                                 "No license information available"

                    photo = PhotoResponse(
                        url=info["url"],
                        title=page.get("title", "").replace("File:", ""),
                        year=year,  # This is now optional
                        description=metadata.get("ImageDescription", {}).get("value"),
                        author=metadata.get("Artist", {}).get("value"),
                        license=license_info,
                        thumbnail=info.get("thumburl") or info["url"],  # Fallback to full URL if no thumbnail
                        source_url=f"https://commons.wikimedia.org/wiki/{page['title'].replace(' ', '_')}"
                    )
                    photos.append(photo.dict())

                except Exception as e:
                    logging.error(f"Error processing photo: {str(e)}")
                    continue

            # Sort by year if available
            photos.sort(key=lambda x: x.get('year') if x.get('year') is not None else 9999)

            if not photos:
                logging.warning(f"No valid photos found for location: {location_name}")
            else:
                logging.info(f"Found {len(photos)} photos for location: {location_name}")

            return photos

    except HTTPException as he:
        raise he
    except Exception as e:
        logging.exception("Error getting historical photos")
        raise HTTPException(
            status_code=500,
            detail=f"Error getting historical photos: {str(e)}"
        )

@router.get("/photos/random")
async def get_random_photos(
    category: str = Query(..., description="Photo category (e.g., 'landscape', 'architecture')"),
    limit: int = Query(default=10, ge=1, le=50, description="Number of photos to return")
) -> List[PhotoResponse]:
    """
    Get random photos from Wikimedia Commons by category
    """
    try:
        async with httpx.AsyncClient() as client:
            # First, get images in category
            response = await client.get(
                "https://commons.wikimedia.org/w/api.php",
                params={
                    "action": "query",
                    "format": "json",
                    "list": "categorymembers",
                    "cmtype": "file",
                    "cmtitle": f"Category:{category}",
                    "cmlimit": limit,
                    "cmsort": "random",
                    "prop": "imageinfo",
                    "iiprop": "url|timestamp|user|extmetadata",
                    "iiurlwidth": 800,
                },
                headers={
                    "User-Agent": "Roami/1.0 (https://github.com/yourusername/roami)"
                }
            )

            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail="Wikimedia API error")

            data = response.json()
            photos = []

            for member in data.get('query', {}).get('categorymembers', []):
                if not member.get('title', '').startswith('File:'):
                    continue

                # Get image info
                info_response = await client.get(
                    "https://commons.wikimedia.org/w/api.php",
                    params={
                        "action": "query",
                        "format": "json",
                        "titles": member['title'],
                        "prop": "imageinfo",
                        "iiprop": "url|timestamp|user|extmetadata",
                        "iiurlwidth": 800,
                    },
                    headers={
                        "User-Agent": "Roami/1.0 (https://github.com/yourusername/roami)"
                    }
                )

                if info_response.status_code != 200:
                    continue

                info_data = info_response.json()
                pages = info_data.get('query', {}).get('pages', {})
                
                for page in pages.values():
                    if 'imageinfo' not in page:
                        continue

                    info = page['imageinfo'][0]
                    metadata = info.get('extmetadata', {})

                    photo = PhotoResponse(
                        url=info['url'],
                        title=page['title'].replace('File:', ''),
                        year=None,  # Could parse from metadata if needed
                        description=metadata.get('ImageDescription', {}).get('value'),
                        author=metadata.get('Artist', {}).get('value'),
                        license=metadata.get('License', {}).get('value'),
                        thumbnail=info.get('thumburl'),
                        source_url=f"https://commons.wikimedia.org/wiki/{quote(page['title'])}"
                    )
                    photos.append(photo)

            return photos[:limit]

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting random photos: {str(e)}")

async def create_postcard(request: dict) -> PostcardResponse:
    """
    Create a postcard from an image with location details
    """
    try:
        # Download the source image
        async with httpx.AsyncClient() as client:
            response = await client.get(request["image_url"])
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail="Failed to fetch image")
            
            image = Image.open(io.BytesIO(response.content))
            
            # Resize if needed (max 1920x1080 while maintaining aspect ratio)
            max_size = (1920, 1080)
            image.thumbnail(max_size, Image.Resampling.LANCZOS)
            
            # Create a new image with space for text
            margin = 40
            text_height = 120
            new_height = image.height + text_height + (2 * margin)
            postcard = Image.new('RGB', (image.width, new_height), 'white')
            
            # Paste the original image
            postcard.paste(image, (0, 0))
            
            # Add text
            draw = ImageDraw.Draw(postcard)
            
            # Try to load a nice font, fall back to default if not available
            try:
                font = ImageFont.truetype("arial.ttf", 32)
                small_font = ImageFont.truetype("arial.ttf", 24)
            except:
                font = ImageFont.load_default()
                small_font = ImageFont.load_default()
            
            # Add location name
            text_y = image.height + margin
            draw.text((margin, text_y), request["location_name"], font=font, fill='black')
            
            # Add message if provided
            if request.get("message"):
                message_y = text_y + 40
                draw.text((margin, message_y), request["message"], font=small_font, fill='gray')
            
            # Save to bytes
            output = io.BytesIO()
            postcard.save(output, format='JPEG', quality=85)
            output.seek(0)
            
            # For now, we'll return the same URL for both full and preview
            # In a production environment, you'd upload this to cloud storage
            # and create a smaller preview version
            data_url = f"data:image/jpeg;base64,{base64.b64encode(output.read()).decode()}"
            
            return PostcardResponse(
                url=data_url,
                preview_url=data_url
            )
            
    except Exception as e:
        logging.error(f"Error creating postcard: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error creating postcard: {str(e)}") 