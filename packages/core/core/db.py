import os
from collections.abc import AsyncGenerator
from sqlmodel import SQLModel, create_engine
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.orm import sessionmaker

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql+asyncpg://postgres:postgrespassword@localhost:5432/scrapeforge"
)

# We use asyncpg for async DB calls in FastAPI/workers
engine = create_async_engine(DATABASE_URL, echo=True, future=True)

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
