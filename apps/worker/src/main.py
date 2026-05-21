import os
import asyncio
import traceback
import uuid
from datetime import datetime
from typing import Dict, Any, List
from arq.connections import RedisSettings
from sqlmodel import select
from sqlalchemy import text

# Core imports
from core.db import async_session_maker, engine
from core.models import ScrapeTask, TaskRun, SchemaRegistry
from core.schemas import TaskConfig, SelectorField, ColumnSchema
from core.scraping.loader import ScraperLoader
from core.scraping.extractor import FieldExtractor
from core.scraping.inference import infer_type
from core.scraping.migration import SchemaDiffer, MigrationRunner

from playwright.async_api import async_playwright, Page, Browser
from dotenv import load_dotenv

load_dotenv()

async def execute_pagination(page: Page, config: Dict[str, Any], page_num: int) -> bool:
    pag_config = config.get("pagination", {})
    pag_type = pag_config.get("type")
    
    if pag_type == "next_button":
        selector = pag_config.get("selector")
        if not selector:
            return False
        
        # Check if next button exists and click it
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
        # Scroll to bottom and wait for content
        try:
            prev_height = await page.evaluate("document.body.scrollHeight")
            await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            await asyncio.sleep(1.5)
            new_height = await page.evaluate("document.body.scrollHeight")
            # Returns True if page height changed (new content loaded)
            return new_height > prev_height
        except Exception as e:
            print(f"Infinite scroll failed: {e}")
            return False
            
    return False

async def scrape_task_job(ctx, task_id: str, run_id: str):
    print(f"Scraper worker starting job for Task: {task_id}, Run: {run_id}")
    
    task_uuid = uuid.UUID(task_id)
    run_uuid = uuid.UUID(run_id)
    
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
        
        # Parse visual config options
        config_data = task.config
        start_url = config_data.get("startUrl")
        fields_data = config_data.get("fields", [])
        
        fields = [
            SelectorField(
                name=f.get("name"),
                selector=f.get("selector"),
                type=f.get("type", "text"),
                attr=f.get("attr")
            ) for f in fields_data
        ]
        
        rate_limit_ms = config_data.get("rateLimitMs", 0)
        max_pages = config_data.get("pagination", {}).get("maxPages", 1)
        container_selector = config_data.get("containerSelector")
        
        loader = ScraperLoader(rate_limit_ms=rate_limit_ms)
        all_extracted_rows: List[Dict[str, Any]] = []
        pages_visited = 0
        
        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                
                current_url = start_url
                page_num = 1
                
                # We reuse the same page context if next_button/scroll, or create new contexts for URL patterns
                context = await browser.new_context()
                page = await context.new_page()
                
                # Apply stealth configs
                from core.scraping.loader import apply_anti_detection
                await apply_anti_detection(page)
                
                while page_num <= max_pages:
                    # Resolve URL pattern if config specifies it
                    pag_config = config_data.get("pagination", {})
                    if pag_config.get("type") == "url_pattern" and pag_config.get("urlTemplate"):
                        current_url = pag_config["urlTemplate"].replace("{page}", str(page_num))
                    
                    print(f"Loading page {page_num}: {current_url}")
                    
                    try:
                        # Load request
                        if pag_config.get("type") == "url_pattern" or page_num == 1:
                            await page.goto(current_url, wait_until="networkidle", timeout=30000)
                        
                        html_content = await page.content()
                        extractor = FieldExtractor(html_content)
                        rows = extractor.extract_list(fields, container_selector=container_selector)
                        
                        all_extracted_rows.extend(rows)
                        pages_visited += 1
                        print(f"Page {page_num} extracted {len(rows)} items.")
                        
                    except Exception as page_err:
                        print(f"Error loading/parsing page {page_num}: {page_err}")
                        if page_num == 1:
                            raise page_err  # Fail run if first page fails
                    
                    # Handle pagination navigation
                    if pag_config.get("type") == "url_pattern":
                        page_num += 1
                    else:
                        has_more = await execute_pagination(page, config_data, page_num)
                        if not has_more:
                            break
                        page_num += 1
                        # Rate limit delay between pages
                        await loader.wait_rate_limit()

                await browser.close()
                
            # Perform Type Inference on accumulated samples
            inferred_cols: List[ColumnSchema] = []
            for field in fields:
                # Collect all extracted values for this specific field
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

            # Apply DDL Migrations
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
                    # Query current version
                    ver_query = text("SELECT MAX(version) FROM schema_registry WHERE task_id = :task_id")
                    ver_res = await conn.execute(ver_query, {"task_id": task_uuid})
                    version = (ver_res.scalar() or 0) + 1
                
                # Save schema registry log
                import json
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
                
                # Insert dynamic rows safely using parameter bindings
                if all_extracted_rows:
                    col_names = [field.name for field in fields]
                    cols_str = ", ".join(col_names)
                    placeholders = ", ".join([f":{name}" for name in col_names])
                    
                    insert_data = text(
                        f"INSERT INTO {table_name} (id, run_id, scraped_at, {cols_str}) "
                        f"VALUES (gen_random_uuid(), :run_id, now(), {placeholders})"
                    )
                    
                    for row in all_extracted_rows:
                        binds = {"run_id": run_uuid}
                        for col in col_names:
                            binds[col] = row.get(col)
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
            
            print(f"ScrapeForge job {run_id} completed successfully. {len(all_extracted_rows)} rows inserted.")
            return {"status": "success", "rows": len(all_extracted_rows)}
            
        except Exception as e:
            trace = traceback.format_exc()
            print(f"Job execution failed with error:\n{trace}")
            
            # Update DB run to Failed
            finished_time = datetime.utcnow()
            duration = int((finished_time - start_time).total_seconds() * 1000)
            
            run.status = "failed"
            run.error_log = f"{str(e)}\n\n{trace}"
            run.finished_at = finished_time
            run.duration_ms = duration
            session.add(run)
            await session.commit()
            raise e

async def startup(ctx):
    print("Scraper background worker active.")

async def shutdown(ctx):
    print("Scraper background worker shutdown.")

class WorkerSettings:
    functions = [scrape_task_job]
    redis_settings = RedisSettings.from_dsn(os.environ.get("REDIS_URL", "redis://localhost:6379"))
    on_startup = startup
    on_shutdown = shutdown
    concurrency = 3
