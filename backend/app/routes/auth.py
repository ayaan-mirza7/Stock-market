from fastapi import APIRouter, HTTPException, Header
from fastapi.responses import JSONResponse
from datetime import datetime
from bson.objectid import ObjectId
from ..db import users_collection
from ..models import UserSignUp, UserLogin, TokenResponse, UserResponse
from ..auth_utils import hash_password, verify_password, create_access_token, decode_token

router = APIRouter(prefix="/api/auth", tags=["auth"])

@router.post("/signup", response_model=TokenResponse)
def signup(user_data: UserSignUp):
    """Register a new user"""
    try:
        # Check if email already exists
        existing = users_collection.find_one({"email": user_data.email})
        if existing:
            raise HTTPException(status_code=400, detail="Email already registered")
        
        # Hash password and create user
        hashed_password = hash_password(user_data.password)
        user_doc = {
            "email": user_data.email,
            "password": hashed_password,
            "full_name": user_data.full_name,
            "created_at": datetime.utcnow()
        }
        result = users_collection.insert_one(user_doc)
        
        # Create token
        token = create_access_token(user_data.email)
        
        return {
            "access_token": token,
            "token_type": "bearer",
            "user": {
                "id": str(result.inserted_id),
                "email": user_data.email,
                "full_name": user_data.full_name,
                "created_at": user_doc["created_at"]
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Signup failed: {str(e)}")

@router.post("/login", response_model=TokenResponse)
def login(user_data: UserLogin):
    """Login user and return JWT token"""
    try:
        # Find user
        user = users_collection.find_one({"email": user_data.email})
        if not user:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        
        # Verify password
        if not verify_password(user_data.password, user["password"]):
            raise HTTPException(status_code=401, detail="Invalid credentials")
        
        # Create token
        token = create_access_token(user_data.email)
        
        return {
            "access_token": token,
            "token_type": "bearer",
            "user": {
                "id": str(user["_id"]),
                "email": user["email"],
                "full_name": user["full_name"],
                "created_at": user["created_at"]
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Login failed: {str(e)}")

@router.get("/me")
def get_current_user(authorization: str = Header(None)):
    """Get current authenticated user"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    
    try:
        token = authorization.replace("Bearer ", "")
        payload = decode_token(token)
        
        user = users_collection.find_one({"email": payload["email"]})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        return {
            "id": str(user["_id"]),
            "email": user["email"],
            "full_name": user["full_name"],
            "created_at": user["created_at"]
        }
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Auth check failed: {str(e)}")
