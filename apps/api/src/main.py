import os
import uuid
import uvicorn
import base64
from datetime import datetime
from typing import List, Optional, Dict, Any
from playwright.async_api import async_playwright
from fastapi import FastAPI, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from sqlmodel import select, func, text
from sqlmodel.ext.asyncio.session import AsyncSession
from dotenv import load_dotenv

from fastapi.staticfiles import StaticFiles
# Core dependencies
from core.db import init_db, get_session, engine
from core.models import User, ScrapeTask, TaskRun, SchemaRegistry, Export
from core.security import is_safe_url
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
    
    # Create static exports directory if not exists
    os.makedirs("apps/api/public/exports", exist_ok=True)
    app.mount("/exports", StaticFiles(directory="apps/api/public/exports"), name="exports")
    
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
async def health_check(session: AsyncSession = Depends(get_session)):
    redis_status = "unconnected"
    if app.state.redis_pool:
        try:
            await app.state.redis_pool.ping()
            redis_status = "connected"
        except Exception:
            redis_status = "failed"
            
    db_status = "unconnected"
    try:
        await session.execute(text("SELECT 1"))
        db_status = "connected"
    except Exception:
        db_status = "failed"
        
    return {
        "status": "healthy" if db_status == "connected" and redis_status == "connected" else "degraded",
        "service": "scrapeforge-api",
        "dependencies": {
            "database": db_status,
            "redis_queue": redis_status
        }
    }

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

# --- EXPORTS ENDPOINTS ---

class ExportPayload(BaseModel):
    format: str

@app.post("/api/runs/{run_id}/export")
async def trigger_run_export(
    run_id: uuid.UUID,
    payload: ExportPayload,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    # Verify task ownership before exporting
    stmt = select(TaskRun).join(ScrapeTask).where(
        TaskRun.id == run_id,
        ScrapeTask.user_id == current_user.id
    )
    res = await session.execute(stmt)
    run = res.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
        
    export = Export(
        task_run_id=run.id,
        format=payload.format,
        status="pending"
    )
    session.add(export)
    await session.commit()
    await session.refresh(export)
    
    # Enqueue export worker job
    await app.state.redis_pool.enqueue_job("export_task_data_job", export_id=str(export.id))
    
    return {"export_id": str(export.id), "status": "pending"}

@app.get("/api/exports/{export_id}")
async def get_export_status(
    export_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    stmt = select(Export).join(TaskRun).join(ScrapeTask).where(
        Export.id == export_id,
        ScrapeTask.user_id == current_user.id
    )
    res = await session.execute(stmt)
    export = res.scalar_one_or_none()
    if not export:
        raise HTTPException(status_code=404, detail="Export not found")
        
    return {
        "id": str(export.id),
        "status": export.status,
        "file_url": export.file_url,
        "file_size_bytes": export.file_size_bytes,
        "created_at": export.created_at.isoformat()
    }

class ScreenshotPayload(BaseModel):
    url: str

@app.post("/api/screenshot-proxy")
async def screenshot_proxy(payload: ScreenshotPayload, current_user: User = Depends(get_current_user)):
    if not is_safe_url(payload.url):
        raise HTTPException(status_code=400, detail="Target URL blocked by security shield: SSRF protection active.")
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(viewport={"width": 1280, "height": 800})
            page = await context.new_page()
            
            # Go to target URL
            await page.goto(payload.url, wait_until="networkidle", timeout=30000)
            
            # Capture viewport screenshot (base64)
            screenshot_bytes = await page.screenshot(type="jpeg", quality=80)
            base64_image = base64.b64encode(screenshot_bytes).decode("utf-8")
            
            # Extract DOM coordinate bounding boxes and selectors
            js_script = """
            () => {
              const selectors = 'div, span, a, h1, h2, h3, h4, h5, h6, p, li, td, th, img, button, input';
              const elements = document.querySelectorAll(selectors);
              const results = [];
              
              function getSelector(el) {
                if (el.id) {
                  if (!/^[0-9_-]+$/.test(el.id) && el.id.length < 30) {
                    return '#' + el.id;
                  }
                }
                let path = [];
                let current = el;
                while (current && current.nodeType === Node.ELEMENT_NODE) {
                  let selector = current.nodeName.toLowerCase();
                  if (current.className) {
                    const classes = Array.from(current.classList).filter(c => {
                      return !/^(hover|active|focus|flex|grid|w-|h-|p-|m-|bg-|text-|border-|relative|absolute|col-|row-)/.test(c) && c.length < 25;
                    });
                    if (classes.length > 0) {
                      selector += '.' + classes.slice(0, 2).join('.');
                    }
                  }
                  path.unshift(selector);
                  current = current.parentNode;
                }
                return path.join(' > ');
              }

              for (const el of elements) {
                const rect = el.getBoundingClientRect();
                if (rect.width > 10 && rect.height > 10) {
                  results.push({
                    selector: getSelector(el),
                    tagName: el.tagName,
                    box: {
                      x: rect.left,
                      y: rect.top,
                      width: rect.width,
                      height: rect.height
                    }
                  });
                }
              }
              return results;
            }
            """
            elements_data = await page.evaluate(js_script)
            await browser.close()
            
            return {
                "screenshot": f"data:image/jpeg;base64,{base64_image}",
                "elements": elements_data
            }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to capture webpage: {str(e)}")

class EnrichPayload(BaseModel):
    columns: List[str]

@app.post("/api/ai/enrich-schema")
async def enrich_schema(payload: EnrichPayload, current_user: User = Depends(get_current_user)):
    import re
    suggestions = {}
    for col in payload.columns:
        clean = col.lower()
        # strip tag prefix
        clean = re.sub(r'^(div|span|a|h[1-6]|p|li|td|th|img|button|input|class|id)[_\s>]', '', clean)
        # strip common suffixes
        clean = re.sub(r'(_text|_html|_content|_class|_id|_link)$', '', clean)
        # normalize symbols
        clean = re.sub(r'[^a-z0-9_]', '_', clean)
        # clean bounding underscores
        clean = clean.strip('_')
        
        # fallback default
        if not clean:
            clean = "field"
            
        # Add random salt to avoid collisions
        base_clean = clean
        idx = 1
        while clean in suggestions.values():
            clean = f"{base_clean}_{idx}"
            idx += 1
            
        suggestions[col] = clean
    return suggestions

# WebSockets Console Endpoint
@app.websocket("/ws/runs/{run_id}")
async def websocket_run_console(websocket: WebSocket, run_id: str):
    await websocket.accept()
    
    import redis.asyncio as aioredis
    redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379")
    pubsub_conn = aioredis.from_url(redis_url)
    pubsub = pubsub_conn.pubsub()
    
    try:
        await pubsub.subscribe(f"run_channel_{run_id}")
        import asyncio
        while True:
            # We can stream updates from redis pub/sub
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if message:
                data = message["data"].decode("utf-8")
                await websocket.send_text(data)
            await asyncio.sleep(0.1)
    except WebSocketDisconnect:
        pass
    finally:
        await pubsub.unsubscribe(f"run_channel_{run_id}")
        await pubsub_conn.close()

from fastapi import Response

@app.get("/metrics")
async def metrics(session: AsyncSession = Depends(get_session)):
    # Fetch database metrics dynamically
    total_tasks_res = await session.execute(text("SELECT COUNT(*) FROM scrapetask"))
    total_tasks = total_tasks_res.scalar() or 0
    
    total_runs_res = await session.execute(text("SELECT COUNT(*) FROM taskrun"))
    total_runs = total_runs_res.scalar() or 0
    
    failed_runs_res = await session.execute(text("SELECT COUNT(*) FROM taskrun WHERE status = 'failed'"))
    failed_runs = failed_runs_res.scalar() or 0
    
    completed_runs_res = await session.execute(text("SELECT COUNT(*) FROM taskrun WHERE status = 'completed'"))
    completed_runs = completed_runs_res.scalar() or 0
    
    metrics_str = f"""# HELP scrapeforge_tasks_total Total configured scrape tasks in database
# TYPE scrapeforge_tasks_total gauge
scrapeforge_tasks_total {total_tasks}

# HELP scrapeforge_runs_total Total scrape task executions triggered
# TYPE scrapeforge_runs_total counter
scrapeforge_runs_total {total_runs}

# HELP scrapeforge_runs_failed_total Total failed scrape task runs
# TYPE scrapeforge_runs_failed_total counter
scrapeforge_runs_failed_total {failed_runs}

# HELP scrapeforge_runs_completed_total Total successfully completed scrape task runs
# TYPE scrapeforge_runs_completed_total counter
scrapeforge_runs_completed_total {completed_runs}
"""
    return Response(content=metrics_str, media_type="text/plain; version=0.0.4")

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 3000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
