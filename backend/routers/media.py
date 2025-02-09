from typing import List, Optional

import httpx
import yt_dlp
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(
    prefix="/media",
    tags=["Media Services"]
)

class MusicRequest(BaseModel):
    query: str
    duration_limit: Optional[int] = 600  # 10 minutes max

class HistoricalPhotoRequest(BaseModel):
    coordinates: tuple[float, float]
    radius: Optional[int] = 1000  # meters
    year_from: Optional[int] = None
    year_to: Optional[int] = None

class PhotoResponse(BaseModel):
    url: str
    title: str
    year: Optional[int]
    description: Optional[str]
    author: Optional[str]
    license: Optional[str]

@router.post("/music/search")
async def search_music(request: MusicRequest):
    """
    Search and stream music using yt-dlp
    """
    # TODO: Implement yt-dlp integration
    raise HTTPException(status_code=501, detail="Not implemented yet")

@router.post("/photos/historical")
async def get_historical_photos(request: HistoricalPhotoRequest) -> List[PhotoResponse]:
    """
    Get historical photos from Wikimedia Commons based on location
    """
    # TODO: Implement Wikimedia Commons API integration
    raise HTTPException(status_code=501, detail="Not implemented yet") 