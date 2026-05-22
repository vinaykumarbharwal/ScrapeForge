import os
from collections.abc import AsyncGenerator
from sqlmodel import SQLModel, create_engine
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.orm import sessionmaker

from urllib.parse import urlparse, urlunparse, parse_qsl, urlencode

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql+asyncpg://postgres:postgrespassword@localhost:5432/scrapeforge"
)

# Parse URL and extract SSL options to avoid asyncpg driver type errors
parsed_url = urlparse(DATABASE_URL)
query_params = dict(parse_qsl(parsed_url.query))

connect_args = {}
sslmode = query_params.pop("sslmode", None)
query_params.pop("channel_binding", None)
ssl_param = query_params.pop("ssl", None)

if (
    sslmode in ("require", "verify-ca", "verify-full", "prefer") or 
    ssl_param in ("true", "require") or 
    ("localhost" not in DATABASE_URL and "127.0.0.1" not in DATABASE_URL)
):
    connect_args["ssl"] = True

# Reconstruct connection string without conflicting driver parameters
clean_query = urlencode(query_params)
clean_url = urlunparse(parsed_url._replace(query=clean_query))

# We use asyncpg for async DB calls in FastAPI/workers
engine = create_async_engine(clean_url, echo=True, future=True, connect_args=connect_args)

# Session factory for creating AsyncSession objects
async_session_maker = sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_maker() as session:
        yield session

async def init_db() -> None:
    # SQLModel metadata create_all requires a sync engine or connection.
    # In async environments, we run it in a sync context:
    async with engine.begin() as conn:
        # Enable gen_random_uuid extension for Postgres UUIDs if not present
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"))
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS \"pgcrypto\";"))
        await conn.run_sync(SQLModel.metadata.create_all)

# Import text specifically for extension setup
from sqlalchemy import text
