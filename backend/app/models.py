from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime

class UserSignUp(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6)
    full_name: str = Field(..., min_length=2, max_length=100)

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    email: str
    full_name: str
    created_at: datetime

    class Config:
        populate_by_name = True

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: Optional[UserResponse] = None

class TokenPayload(BaseModel):
    email: str
    exp: int
