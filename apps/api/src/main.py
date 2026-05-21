import os
import uuid
import uvicorn
from datetime import datetime
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from sqlmodel import select, func
from sqlmodel.ext.asyncio.session import AsyncSession
from dotenv import load_dotenv

# Core dependencies
from core.db import init_db, get_session, engine
from core.models import User, ScrapeTask, TaskRun, SchemaRegistry
from core.auth import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    get_current_user,
    generate_api_key,
    hash_api_key,
    JWT_SECRET,
    JWT_ALGORITHM
)
import jwt
from jwt.exceptions import PyJWTError
from arq import create_pool
from arq.connections import RedisSettings

load_dotenv()

app = FastAPI(
    title="ScrapeForge API Gateway",
    description="SaaS Web Scraping Platform API Gateway",
    version="1.0.0"
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def on_startup():
    # Setup relational base schemas
    await init_db()
    
    # Setup worker queues connection pool
    redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379")
    app.state.redis_pool = await create_pool(RedisSettings.from_dsn(redis_url))
    print("API Gateway setup complete. Relational connections ready.")

@app.on_event("shutdown")
async def on_shutdown():
    if app.state.redis_pool:
        await app.state.redis_pool.close()
        print("Redis pool shutdown.")

@app.get("/health")
async def health_check():
    return {"status": "OK", "service": "scrapeforge-api"}

# Pydantic Schemas for API payloads
class RegisterPayload(BaseModel):
    email: EmailStr
    password: str

class LoginPayload(BaseModel):
    email: EmailStr
    password: str

class TaskCreatePayload(BaseModel):
    name: str
    config: Dict[str, Any]
    schedule_cron: Optional[str] = None

class TaskUpdatePayload(BaseModel):
    name: Optional[str] = None
    config: Optional[Dict[str, Any]] = None
    schedule_cron: Optional[str] = None
    status: Optional[str] = None

# --- AUTH ROUTES ---

@app.post("/auth/register", status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterPayload, session: AsyncSession = Depends(get_session)):
    # Check email duplicate
    stmt = select(User).where(User.email == payload.email)
    res = await session.execute(stmt)
    if res.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")
        
    pwd_hash = hash_password(payload.password)
    user = User(email=payload.email, password_hash=pwd_hash)
    
    session.add(user)
    await session.commit()
    await session.refresh(user)
    
    access = create_access_token(str(user.id), user.email)
    refresh = create_refresh_token(str(user.id))
    
    return {
        "access_token": access,
        "refresh_token": refresh,
        "token_type": "bearer",
        "user": {"id": str(user.id), "email": user.email}
    }

@app.post("/auth/login")
async def login(payload: LoginPayload, session: AsyncSession = Depends(get_session)):
    stmt = select(User).where(User.email == payload.email)
    res = await session.execute(stmt)
    user = res.scalar_one_or_none()
    
    if not user or not user.password_hash or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
        
    access = create_access_token(str(user.id), user.email)
    refresh = create_refresh_token(str(user.id))
    
    return {
        "access_token": access,
        "refresh_token": refresh,
        "token_type": "bearer",
        "user": {"id": str(user.id), "email": user.email}
    }

@app.post("/auth/refresh")
async def refresh_tokens(refresh_token: str, session: AsyncSession = Depends(get_session)):
    try:
        payload = jwt.decode(refresh_token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id: str = payload.get("sub")
        token_type: str = payload.get("type")
        if user_id is None or token_type != "refresh":
            raise HTTPException(status_code=401, detail="Invalid refresh token")
    except PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
        
    user = await session.get(User, uuid.UUID(user_id))
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
        
    access = create_access_token(str(user.id), user.email)
    return {"access_token": access, "token_type": "bearer"}

@app.post("/auth/api-key")
async def create_api_key(current_user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    raw_key = generate_api_key()
    hashed = hash_api_key(raw_key)
    
    current_user.api_key_hash = hashed
    session.add(current_user)
    await session.commit()
    
    return {"api_key": raw_key}

# --- TASKS ROUTES (Scoped to current_user) ---

@app.get("/api/tasks", response_model=List[ScrapeTask])
async def list_tasks(
    page: int = 1,
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    offset = (page - 1) * limit
    stmt = select(ScrapeTask).where(ScrapeTask.user_id == current_user.id).offset(offset).limit(limit)
    res = await session.execute(stmt)
    return list(res.scalars().all())

@app.post("/api/tasks", response_model=ScrapeTask, status_code=status.HTTP_201_CREATED)
async def create_task(
    payload: TaskCreatePayload,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    task = ScrapeTask(
        user_id=current_user.id,
        name=payload.name,
        config=payload.config,
        schedule_cron=payload.schedule_cron
    )
    session.add(task)
    await session.commit()
    await session.refresh(task)
    return task

@app.get("/api/tasks/{task_id}", response_model=ScrapeTask)
async def get_task(
    task_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    task = await session.get(ScrapeTask, task_id)
    if not task or task.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Task not found")
    return task

@app.put("/api/tasks/{task_id}", response_model=ScrapeTask)
async def update_task(
    task_id: uuid.UUID,
    payload: TaskUpdatePayload,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    task = await session.get(ScrapeTask, task_id)
    if not task or task.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Task not found")
        
    if payload.name is not None:
        task.name = payload.name
    if payload.config is not None:
        task.config = payload.config
    if payload.schedule_cron is not None:
        task.schedule_cron = payload.schedule_cron
    if payload.status is not None:
        task.status = payload.status
        
    session.add(task)
    await session.commit()
    await session.refresh(task)
    return task

@app.delete("/api/tasks/{task_id}")
async def delete_task(
    task_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    task = await session.get(ScrapeTask, task_id)
    if not task or task.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Task not found")
        
    await session.delete(task)
    await session.commit()
    return {"detail": "Task deleted successfully"}

# Trigger scraper execution
@app.post("/api/tasks/{task_id}/run")
async def trigger_task_run(
    task_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    task = await session.get(ScrapeTask, task_id)
    if not task or task.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Task not found")
        
    db_run = TaskRun(task_id=task.id, status="running")
    session.add(db_run)
    await session.commit()
    await session.refresh(db_run)

    # Queue scraping job
    await app.state.redis_pool.enqueue_job(
        "scrape_task_job", 
        task_id=str(task.id), 
        run_id=str(db_run.id)
    )

    return {"status": "queued", "run_id": str(db_run.id)}

# --- RUNS & DATA VISUALIZATION ---

@app.get("/api/tasks/{task_id}/runs", response_model=List[TaskRun])
async def list_task_runs(
    task_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    task = await session.get(ScrapeTask, task_id)
    if not task or task.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Task not found")
        
    stmt = select(TaskRun).where(TaskRun.task_id == task.id).order_by(TaskRun.started_at.desc())
    res = await session.execute(stmt)
    return list(res.scalars().all())

@app.get("/api/runs/{run_id}", response_model=TaskRun)
async def get_run_status(
    run_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    # Retrieve run and trace it back to verify task ownership
    stmt = select(TaskRun).join(ScrapeTask).where(
        TaskRun.id == run_id, 
        ScrapeTask.user_id == current_user.id
    )
    res = await session.execute(stmt)
    run = res.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run

# Fetch scraped data from dynamic postgres table
@app.get("/api/tasks/{task_id}/data")
async def get_scraped_data(
    task_id: uuid.UUID,
    page: int = 1,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    task = await session.get(ScrapeTask, task_id)
    if not task or task.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Task not found")
        
    # Build dynamic table reference safely
    from core.scraping.migration import MigrationRunner
    async with engine.connect() as conn:
        runner = MigrationRunner(conn)
        table_name = runner.get_table_name(task_id)
        
        if not await runner.table_exists(table_name):
            return {"columns": [], "rows": [], "total": 0}
            
        offset = (page - 1) * limit
        
        # Read total rows
        total_stmt = f"SELECT count(*) FROM {table_name}"
        total_res = await conn.execute(text(total_stmt))
        total = total_res.scalar()
        
        # Read columns config
        cols = await runner.get_current_columns(table_name)
        col_names = [c.name for c in cols]
        
        # Read data rows
        select_cols = ", ".join(col_names)
        data_stmt = f"SELECT id, run_id, scraped_at, {select_cols} FROM {table_name} LIMIT {limit} OFFSET {offset}"
        data_res = await conn.execute(text(data_stmt))
        
        rows = []
        for r in data_res.all():
            row_dict = {
                "id": str(r[0]),
                "run_id": str(r[1]),
                "scraped_at": r[2].isoformat() if r[2] else None
            }
            for i, name in enumerate(col_names):
                row_dict[name] = r[i + 3]
            rows.append(row_dict)
            
        return {
            "columns": [{"name": c.name, "type": c.pg_type} for c in cols],
            "rows": rows,
            "total": total
        }

# WebSockets Console Endpoint
@app.websocket("/ws/runs/{run_id}")
async def websocket_run_console(websocket: WebSocket, run_id: str):
    await websocket.accept()
    try:
        while True:
            # We can stream updates from redis pub/sub or keep-alive echo
            data = await websocket.receive_text()
            await websocket.send_text(f"Run {run_id} heartbeat active")
    except WebSocketDisconnect:
        pass

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 3000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
