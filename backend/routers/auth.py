from typing import Optional

import firebase_admin
from fastapi import APIRouter, Depends, Header, HTTPException
from firebase_admin import auth, credentials
from pydantic import BaseModel

router = APIRouter(
    prefix="/auth",
    tags=["Authentication"]
)

class User(BaseModel):
    uid: str
    email: Optional[str] = None
    display_name: Optional[str] = None
    photo_url: Optional[str] = None

async def verify_token(authorization: str = Header(...)) -> User:
    """
    Verify Firebase ID token and return user info
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Invalid authorization header"
        )
    
    token = authorization.split(" ")[1]
    try:
        decoded_token = auth.verify_id_token(token)
        return User(
            uid=decoded_token["uid"],
            email=decoded_token.get("email"),
            display_name=decoded_token.get("name"),
            photo_url=decoded_token.get("picture")
        )
    except Exception as e:
        raise HTTPException(
            status_code=401,
            detail=f"Invalid token: {str(e)}"
        )

@router.get("/me")
async def get_current_user(user: User = Depends(verify_token)) -> User:
    """
    Get current authenticated user info
    """
    return user 