import os
import secrets
import hashlib
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
import jwt
from jwt.exceptions import PyJWTError
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status, Security
from fastapi.security import OAuth2PasswordBearer, APIKeyHeader
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from core.db import get_session
from core.models import User

# Configurations
JWT_SECRET = os.environ.get("JWT_SECRET", "scrapeforge-super-secret-jwt-key")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 15
REFRESH_TOKEN_EXPIRE_DAYS = 30

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

# Password hashing
def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

# API Key management
def generate_api_key() -> str:
    # Generates a prefix key of form sf_live_...
    token = secrets.token_urlsafe(32)
    return f"sf_live_{token}"

def hash_api_key(api_key: str) -> str:
    return hashlib.sha256(api_key.encode("utf-8")).hexdigest()

# JWT Token creation
def create_access_token(user_id: str, email: str) -> str:
    expires = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": user_id,
        "email": email,
        "exp": expires.timestamp(),  # Standard Unix epoch timestamp
        "type": "access"
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def create_refresh_token(user_id: str) -> str:
    expires = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": user_id,
        "exp": expires.timestamp(),  # Standard Unix epoch timestamp
        "type": "refresh"
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

# FastAPI Dependencies for Tenant Authentication
async def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    api_key: Optional[str] = Security(api_key_header),
    session: AsyncSession = Depends(get_session)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    # 1. First attempt verification via API Key
    if api_key:
        api_key_hash = hash_api_key(api_key)
        stmt = select(User).where(User.api_key_hash == api_key_hash)
        res = await session.execute(stmt)
        user = res.scalar_one_or_none()
        if user:
            return user
            
    # 2. Second attempt verification via OAuth2 JWT Token
    if token:
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            user_id: str = payload.get("sub")
            token_type: str = payload.get("type")
            if user_id is None or token_type != "access":
                raise credentials_exception
        except PyJWTError:
            raise credentials_exception
            
        import uuid
        stmt = select(User).where(User.id == uuid.UUID(user_id))
        res = await session.execute(stmt)
        user = res.scalar_one_or_none()
        if user:
            return user
            
    raise credentials_exception
