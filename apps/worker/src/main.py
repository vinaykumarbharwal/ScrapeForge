import os
from dotenv import load_dotenv
load_dotenv(override=True)

import re
import json
import asyncio
import traceback
import uuid
from datetime import datetime
from typing import Dict, Any, List
from zoneinfo import ZoneInfo
from croniter import croniter
import pandas as pd
from arq import cron
from arq.connections import RedisSettings
from sqlmodel import select
from sqlalchemy import text

# Core imports
from core.db import async_session_maker, engine
from core.models import ScrapeTask, TaskRun, SchemaRegistry, Export
from core.schemas import TaskConfig, SelectorField, ColumnSchema
from core.scraping.loader import ScraperLoader, apply_anti_detection
from core.scraping.extractor import FieldExtractor
from core.scraping.inference import infer_type
from core.scraping.migration import SchemaDiffer, MigrationRunner
from core.notifications import send_failure_email
from core.security import is_safe_url

from playwright.async_api import async_playwright, Page, Browser

async def execute_pagination(page: Page, config: Dict[str, Any], page_num: int) -> bool:
    pag_config = config.get("pagination", {})
    pag_type = pag_config.get("type")
    
    if pag_type == "next_button":
        selector = pag_config.get("selector")
        if not selector:
            return False
        
        try:
            next_btn = await page.query_selector(selector)
            if not next_btn or not await next_btn.is_visible():
                return False
            
            await next_btn.click()
            await page.wait_for_load_state("networkidle", timeout=10000)
            return True
        except Exception as e:
            print(f"Pagination click failed or button not found: {e}")
            return False
            
    elif pag_type == "infinite_scroll":
        try:
            prev_height = await page.evaluate("document.body.scrollHeight")
            await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            await asyncio.sleep(1.5)
            new_height = await page.evaluate("document.body.scrollHeight")
            return new_height > prev_height
        except Exception as e:
            print(f"Infinite scroll failed: {e}")
            return False
            
    return False

# Real-time WebSocket pub/sub logging status streams helper
async def publish_status(ctx, run_id: str, status: str, pages_visited: int, rows_scraped: int, message: str = ""):
    redis = ctx.get("redis")
    if redis:
        payload = {
            "run_id": run_id,
            "status": status,
            "pages_visited": pages_visited,
            "rows_scraped": rows_scraped,
            "message": message,
            "timestamp": datetime.utcnow().isoformat()
        }
        await redis.publish(f"run_channel_{run_id}", json.dumps(payload))

async def scrape_task_job(ctx, task_id: str, run_id: str):
    print(f"Scraper worker starting job for Task: {task_id}, Run: {run_id}")
    
    task_uuid = uuid.UUID(task_id)
    run_uuid = uuid.UUID(run_id)
    
    pages_visited = 0
    all_extracted_rows = []
    
    async with async_session_maker() as session:
        task = await session.get(ScrapeTask, task_uuid)
        run = await session.get(TaskRun, run_uuid)
        
        if not task or not run:
            print("Database configuration error: Task or Run records missing.")
            return {"status": "failed", "error": "Db records missing"}
            
        start_time = datetime.utcnow()
        run.started_at = start_time
        run.status = "running"
        session.add(run)
        await session.commit()
        
        await publish_status(ctx, run_id, "running", 0, 0, "Initializing browser sandbox...")
        
        # Parse visual config options
        config_data = task.config
        start_url = config_data.get("startUrl")
        
        if not is_safe_url(start_url):
            error_msg = f"SSRF Shield blocked target URL: {start_url}"
            run.status = "failed"
            run.error_message = error_msg
            session.add(run)
            await session.commit()
            await publish_status(ctx, run_id, "failed", 0, 0, error_msg)
            try:
                await send_failure_email(task.name, error_msg)
            except Exception as notify_err:
                print(f"Failed to dispatch email warning: {notify_err}")
            return {"status": "failed", "error": error_msg}
            
        fields_data = config_data.get("fields", [])
        
        fields = [
            SelectorField(
                name=f.get("name"),
                selector=f.get("selector"),
                type=f.get("type", "text"),
                attr=f.get("attr")
            ) for f in fields_data
        ]
        
        try:
            # 1. Scraping Loop using Loader and Extractor
            async with async_playwright() as p:
                # Fetch rate limit config
                rate_limit = config_data.get("rateLimit", {})
                delay_ms = rate_limit.get("delayMs", 1000)
                
                loader = ScraperLoader(rate_limit_ms=delay_ms)
                browser = await p.chromium.launch(headless=True)
                
                context = await browser.new_context()
                page = await context.new_page()
                await apply_anti_detection(page)
                
                # Speed up crawls by blocking heavy images, media, tracking ads, and fonts
                async def block_resources(route):
                    req = route.request
                    if req.resource_type in ("image", "media", "font", "websocket") or "analytics" in req.url or "doubleclick" in req.url:
                        await route.abort()
                    else:
                        await route.continue_()
                
                await page.route("**/*", block_resources)
                
                pag_config = config_data.get("pagination", {})
                max_pages = pag_config.get("maxPages", 1)
                
                page_num = 1
                current_url = start_url
                
                while page_num <= max_pages:
                    # Resolve URL pattern routing if configured
                    if pag_config.get("type") == "url_pattern":
                        pattern = pag_config.get("pattern")
                        if pattern and page_num > 1:
                            # e.g. "https://example.com/books?page={page}"
                            current_url = pattern.replace("{page}", str(page_num))
                    
                    print(f"Loading page {page_num}: {current_url}")
                    await publish_status(ctx, run_id, "running", page_num, len(all_extracted_rows), f"Crawling page {page_num}...")
                    
                    try:
                        # Optimized DOM loading triggers
                        await page.goto(current_url, wait_until="domcontentloaded", timeout=15000)
                        await page.wait_for_timeout(500) # Quick layout settle delay
                        pages_visited += 1
                        
                        # Extract row blocks
                        html_content = await page.content()
                        extractor = FieldExtractor(html_content)
                        
                        container_sel = config_data.get("containerSelector")
                        extracted = extractor.extract_list(fields, container_selector=container_sel)
                        all_extracted_rows.extend(extracted)
                        print(f"Extracted {len(extracted)} rows from page {page_num}")
                        await publish_status(ctx, run_id, "running", page_num, len(all_extracted_rows), f"Successfully parsed {len(extracted)} items.")
                    except Exception as page_err:
                        print(f"Error loading/parsing page {page_num}: {page_err}")
                        if page_num == 1:
                            raise page_err
                    
                    # Handle pagination navigation
                    if pag_config.get("type") == "url_pattern":
                        page_num += 1
                    else:
                        has_more = await execute_pagination(page, config_data, page_num)
                        if not has_more:
                            break
                        page_num += 1
                        await loader.wait_rate_limit()

                await browser.close()
                
            await publish_status(ctx, run_id, "migrating", pages_visited, len(all_extracted_rows), "Inferring types and migrating Postgres schema...")
            
            # 2. Perform Type Inference on accumulated samples
            inferred_cols: List[ColumnSchema] = []
            for field in fields:
                samples = [str(r[field.name]) for r in all_extracted_rows if r.get(field.name) is not None]
                inferred = infer_type(samples)
                inferred_cols.append(
                    ColumnSchema(
                        name=field.name,
                        pg_type=inferred.pg,
                        nullable=True,
                        samples=samples[:5]
                    )
                )

            # 3. Apply DDL Migrations
            warnings = []
            async with engine.begin() as conn:
                differ = SchemaDiffer()
                runner = MigrationRunner(conn)
                
                table_name = runner.get_table_name(task_uuid)
                current_cols = []
                
                if await runner.table_exists(table_name):
                    current_cols = await runner.get_current_columns(table_name)
                    
                diff = differ.diff(current_cols, inferred_cols)
                warnings = await runner.apply(task_uuid, diff, run_uuid)
                print(f"Dynamic migrations applied for {table_name}")
                
                # Fetch new version number and save registry snapshot
                version = 1
                if not diff.isNewTable:
                    ver_query = text("SELECT MAX(version) FROM schema_registry WHERE task_id = :task_id")
                    ver_res = await conn.execute(ver_query, {"task_id": task_uuid})
                    version = (ver_res.scalar() or 0) + 1
                
                columns_json = json.dumps([c.dict() for c in inferred_cols])
                insert_reg = text(
                    "INSERT INTO schema_registry (id, task_id, version, columns, created_at) "
                    "VALUES (gen_random_uuid(), :task_id, :version, :columns, now())"
                )
                await conn.execute(insert_reg, {
                    "task_id": task_uuid,
                    "version": version,
                    "columns": columns_json
                })
                
                if warnings:
                    print(f"DDL Warnings: {warnings}")

            # 4. Insert extracted rows into dynamic DB table
            if all_extracted_rows:
                await publish_status(ctx, run_id, "running", pages_visited, len(all_extracted_rows), f"Writing {len(all_extracted_rows)} records to dynamic table...")
                
                async with engine.begin() as conn:
                    col_names = [field.name for field in fields]
                    cols_str = ", ".join(col_names)
                    binds_str = ", ".join([f":{name}" for name in col_names])
                    
                    insert_data = text(
                        f"INSERT INTO {table_name} (id, run_id, scraped_at, {cols_str}) "
                        f"VALUES (gen_random_uuid(), :run_id, now(), {binds_str})"
                    )
                    
                    for row in all_extracted_rows:
                        binds = {"run_id": run_uuid}
                        for col in inferred_cols:
                            raw_val = row.get(col.name)
                            if raw_val is None:
                                binds[col.name] = None
                                continue
                                
                            val_str = str(raw_val).strip()
                            if not val_str:
                                binds[col.name] = None
                                continue

                            # Coerce values depending on database column types to prevent DataErrors
                            if "NUMERIC" in col.pg_type:
                                # Strip currency symbols, commas, spaces, keeping digits, dot and minus sign
                                cleaned = re.sub(r"[^\d\.\-]", "", val_str)
                                try:
                                    binds[col.name] = float(cleaned) if len(cleaned) > 0 else None
                                except ValueError:
                                    binds[col.name] = None
                            elif "BIGINT" in col.pg_type:
                                cleaned = re.sub(r"[^\d\-]", "", val_str)
                                try:
                                    binds[col.name] = int(cleaned) if len(cleaned) > 0 else None
                                except ValueError:
                                    binds[col.name] = None
                            elif "BOOLEAN" in col.pg_type:
                                l_val = val_str.lower()
                                if l_val in ("true", "1", "yes", "y"):
                                    binds[col.name] = True
                                elif l_val in ("false", "0", "no", "n"):
                                    binds[col.name] = False
                                else:
                                    binds[col.name] = None
                            else:
                                binds[col.name] = val_str
                                
                        await conn.execute(insert_data, binds)

            # Update DB run to Success
            finished_time = datetime.utcnow()
            duration = int((finished_time - start_time).total_seconds() * 1000)
            
            run.status = "success"
            run.rows_scraped = len(all_extracted_rows)
            run.pages_visited = pages_visited
            run.finished_at = finished_time
            run.duration_ms = duration
            if warnings:
                run.error_log = "Schema Warnings:\n" + "\n".join(warnings)
            session.add(run)
            await session.commit()
            
            # Update task last_run_at timestamp
            task.last_run_at = finished_time
            session.add(task)
            await session.commit()
            
            await publish_status(ctx, run_id, "success", pages_visited, len(all_extracted_rows), f"Success. Imported {len(all_extracted_rows)} rows.")
            print(f"ScrapeForge job {run_id} completed successfully. {len(all_extracted_rows)} rows inserted.")
            return {"status": "success", "rows": len(all_extracted_rows)}
            
        except Exception as e:
            trace = traceback.format_exc()
            print(f"Job execution failed with error:\n{trace}")
            
            finished_time = datetime.utcnow()
            duration = int((finished_time - start_time).total_seconds() * 1000)
            
            run.status = "failed"
            run.error_log = f"{str(e)}\n\n{trace}"
            run.finished_at = finished_time
            run.duration_ms = duration
            session.add(run)
            await session.commit()
            
            await publish_status(ctx, run_id, "failed", pages_visited, len(all_extracted_rows), f"Error: {str(e)}")
            
            # Email Alert dispatch
            try:
                from core.models import User
                user = await session.get(User, task.user_id)
                if user and user.email:
                    await send_failure_email(user.email, task.name, f"{str(e)}\n\n{trace}")
            except Exception as notify_err:
                print(f"Failed to trigger failure alerts: {notify_err}")
                
            raise e

# Dynamic Timezone-aware Cron scheduler execution task
async def scheduler_cron_job(ctx):
    print("Evaluating scraper schedule triggers...")
    now_dt = datetime.utcnow()
    
    async with async_session_maker() as session:
        stmt = select(ScrapeTask).where(
            ScrapeTask.schedule_cron != None,
            ScrapeTask.status == "active"
        )
        res = await session.execute(stmt)
        active_tasks = res.scalars().all()
        
        for task in active_tasks:
            from core.models import User
            user = await session.get(User, task.user_id)
            tz_name = user.timezone if user else "UTC"
            
            try:
                user_tz = ZoneInfo(tz_name)
            except Exception:
                user_tz = ZoneInfo("UTC")
                
            base_time = task.last_run_at or task.created_at
            
            localized_base = base_time.replace(tzinfo=ZoneInfo("UTC")).astimezone(user_tz)
            localized_now = now_dt.replace(tzinfo=ZoneInfo("UTC")).astimezone(user_tz)
            
            try:
                cron = croniter(task.schedule_cron, localized_base)
                next_run = cron.get_next(datetime)
                
                if next_run <= localized_now:
                    print(f"Scheduling trigger matched for Task {task.id} (schedule: {task.schedule_cron})")
                    
                    db_run = TaskRun(task_id=task.id, status="running")
                    session.add(db_run)
                    await session.commit()
                    await session.refresh(db_run)
                    
                    # Queue scrape execution job
                    await ctx["redis"].enqueue_job("scrape_task_job", task_id=str(task.id), run_id=str(db_run.id))
                    
                    task.last_run_at = now_dt
                    session.add(task)
                    await session.commit()
            except Exception as e:
                print(f"Failed to evaluate cron for task {task.id}: {e}")

# Dynamic table asynchronous exporter job
async def export_task_data_job(ctx, export_id: str):
    print(f"Export job starting for Export ID: {export_id}")
    export_uuid = uuid.UUID(export_id)
    
    async with async_session_maker() as session:
        export = await session.get(Export, export_uuid)
        if not export:
            print("Export record not found.")
            return
            
        run = await session.get(TaskRun, export.task_run_id)
        if not run:
            print("TaskRun record not found for export.")
            export.status = "failed"
            session.add(export)
            await session.commit()
            return
            
        task = await session.get(ScrapeTask, run.task_id)
        if not task:
            print("ScrapeTask record not found for export.")
            export.status = "failed"
            session.add(export)
            await session.commit()
            return
            
        from core.scraping.migration import MigrationRunner
        async with engine.connect() as conn:
            runner = MigrationRunner(conn)
            table_name = runner.get_table_name(task.id)
            
            if not await runner.table_exists(table_name):
                print(f"Dynamic database table {table_name} does not exist.")
                export.status = "failed"
                session.add(export)
                await session.commit()
                return
                
            cols = await runner.get_current_columns(table_name)
            col_names = [c.name for c in cols]
            
            select_cols = ", ".join(col_names)
            query = text(f"SELECT scraped_at, {select_cols} FROM {table_name} WHERE run_id = :run_id ORDER BY scraped_at DESC")
            res = await conn.execute(query, {"run_id": run.id})
            rows = res.all()
            
        data_list = []
        for r in rows:
            row_dict = {"scraped_at": r[0].isoformat() if r[0] else None}
            for idx, name in enumerate(col_names):
                row_dict[name] = r[idx + 1]
            data_list.append(row_dict)
            
        df = pd.DataFrame(data_list)
        
        # Local static directory export
        out_dir = "apps/api/public/exports"
        os.makedirs(out_dir, exist_ok=True)
        
        file_name = f"{export.id}.{export.format}"
        file_path = os.path.join(out_dir, file_name)
        
        if export.format == "csv":
            df.to_csv(file_path, index=False)
        elif export.format == "json":
            df.to_json(file_path, orient="records", date_format="iso")
        elif export.format == "xlsx":
            df.to_excel(file_path, index=False, engine="openpyxl")
        else:
            print(f"Unsupported export format: {export.format}")
            export.status = "failed"
            session.add(export)
            await session.commit()
            return
            
        file_size = os.path.getsize(file_path)
        
        # Finalize export metadata
        export.status = "completed"
        export.file_url = f"http://localhost:3000/exports/{file_name}"
        export.file_size_bytes = file_size
        session.add(export)
        await session.commit()
        print(f"Export {export.id} completed. Size: {file_size} bytes.")

async def startup(ctx):
    print("ScrapeForge background worker active.")

async def shutdown(ctx):
    print("ScrapeForge background worker shutdown.")

class WorkerSettings:
    functions = [scrape_task_job, export_task_data_job]
    cron_jobs = [
        # Evaluate crons every minute
        cron(scheduler_cron_job, minute=None)
    ]
    redis_settings = RedisSettings.from_dsn(os.environ.get("REDIS_URL", "redis://localhost:6379"))
    on_startup = startup
    on_shutdown = shutdown
    concurrency = 3
