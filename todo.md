# ScrapeForge Implementation TODO List (Python Backend)

This document lists all action items required to build the ScrapeForge platform using a Python/FastAPI/arq backend and React frontend.

---

## 🛠️ Phase 1: Core Scraping & Auto-Schema Generation (Target: Milestone 1)
*Goal: A single scraping run can be manually triggered, page parsed, types inferred, database schema migrated, and data inserted successfully.*

- [x] **Monorepo Setup**: Scaffold directories for Python backend (`apps/api`, `apps/worker`, `packages/core`) and Node frontend (`apps/frontend`).
- [x] **Base Configuration**: Setup root `package.json`, `.gitignore`, `docker-compose.yml` (Postgres, Redis, MinIO), and Python dependency configurations (`requirements.txt`, `setup.py`).
- [x] **Database ORM setup**: Define initial SQLModel models (`User`, `ScrapeTask`, `TaskRun`, `Template`, `Export`, `SchemaRegistry`, `Notification`) in `packages/core/core/models.py`.
- [x] **Scraping Engine: Playwright Python Loader**:
  - [x] Implement `apply_anti_detection(page)` using Python Playwright client to mask automation flags, randomize viewports, and rotate browser agents.
  - [x] Implement browser launch pools and request rate limiters in async task loops.
- [x] **Scraping Engine: Selector & Field Extractor**:
  - [x] Create `FieldExtractor` class using BeautifulSoup4 / lxml to scan DOM trees based on CSS selectors in the task configuration.
  - [x] Support text, attribute (e.g. `href`, `src`), and raw HTML parsing modes.
- [ ] **Scraping Engine: Type Inference Engine**:
  - [x] Create Python type inference logic in `packages/core/core/scraping/inference.py` to match string values to PostgreSQL data types (`TEXT`, `BIGINT`, `NUMERIC`, `TIMESTAMPTZ`, `BOOLEAN`, `JSONB`) with confidence scoring.
  - [x] Complete edge-case tests (handling currency symbols, ISO dates, array elements).
- [x] **Scraping Engine: Auto-Schema Diff & Migrations**:
  - [x] Implement `SchemaDiffer` in `packages/core/core/scraping/migration.py` to calculate safe additive modifications.
  - [x] Implement `MigrationRunner` to dynamically execute DDL operations (`CREATE TABLE`, `ALTER TABLE ADD COLUMN`, `ALTER TABLE ALTER COLUMN TYPE`).
  - [x] Add safety boundary constraints: block automatic column dropping (mark columns as nullable instead) and narrowing migrations. Emit warnings to `schema_registry` for human resolution.
- [x] **Background Job Worker**:
  - [x] Implement basic async scraping task execution under `apps/worker/src/main.py`.
  - [x] Connect full Playwright scraping execution cycle with database session updates: fetch task config -> run scraper -> infer types -> migrate schemas -> write results -> update `task_runs` status.
- [x] **API Endpoint**:
  - [x] Implement `/health` and `GET /api/tasks` listing routes.
  - [x] Implement `POST /api/tasks/:id/run` to queue background scraping jobs using `arq` redis pool.

---

## 🔒 Phase 2: Auth, Multi-Tenancy & Dashboard Portal (Target: Milestone 2)
*Goal: Users can log in, create tasks scoped to their account, and view history logs.*

- [x] **Authentication & Security**:
  - [x] Setup register and login endpoints with password hashing using `passlib[bcrypt]`.
  - [x] Implement JWT access tokens (15-min) and refresh tokens (30-day) with rotation stored in Redis using PyJWT.
  - [x] Implement API key management (generate, hash with sha256, verify).
- [x] **Multi-Tenant Query Scoping**:
  - [x] Apply strict query filters across all SQLModel/SQLAlchemy operations to restrict operations to current `user_id` (IDOR protection).
- [x] **Dashboard Backend Routes**:
  - [x] `GET /api/tasks` - Paginated task definitions.
  - [x] `GET /api/tasks/{id}` - Detailed task information.
  - [x] `GET /api/runs/{id}` - List of runs for a task.
- [ ] **React Frontend Setup**:
  - [ ] Set up React Router and TanStack Query providers in `@scrapeforge/frontend`.
  - [ ] Implement UI State Management using Zustand.
- [ ] **Frontend Core Pages**:
  - [ ] Build Register & Login pages with visual validation.
  - [ ] Create authenticated sidebar shell and header dashboard container.
  - [ ] Build **Tasks List View** displaying cards with cron, name, status, and last run.
  - [ ] Build **Runs History Dashboard** showing progress states, row count, and execution time.

---

## 📅 Phase 3: Scheduling, Exports & WebSocket Streams (Target: Milestone 3)
*Goal: Scheduled scrapers run automatically; data can be viewed and downloaded.*

- [ ] **arq Scheduler Configurations**:
  - [ ] Implement cron repeatable tasks using `arq` cron definitions.
  - [ ] Handle timezone calculations when evaluating schedule triggers.
- [ ] **Asynchronous Export Service**:
  - [ ] Build a background task to retrieve rows from dynamic tables and stream to CSV and JSON formats in chunks.
  - [ ] Integrate with local S3 (MinIO) using `aioboto3` or `httpx` to upload exports with presigned URL download capabilities.
- [ ] **WebSocket Live Stream**:
  - [x] Add FastAPI WebSocket router at `/ws/runs/{run_id}`.
  - [ ] Integrate database/redis event publishing to broadcast real-time scraper progress (running pages, error logs, row counts, schema shifts) to connected clients.
- [ ] **Notification System**:
  - [ ] Create email dispatch mechanisms using `aiosmtplib` for task failure alerts.

---

## 🖱️ Phase 4: Visual Scraper Builder & Selector Overlay (Target: Milestone 4)
*Goal: Non-technical users can configure scrapers by pointing and clicking on target websites.*

- [ ] **FastAPI Screenshot Proxy**:
  - [ ] Implement endpoint that launches a headless browser, navigates to target URL, captures a screenshot, and returns it.
  - [ ] Serialize DOM tag bounding coordinates for hover maps.
- [ ] **Visual Builder Canvas**:
  - [ ] Render screenshot in interactive React canvas overlay.
  - [ ] Implement mouse-tracking highlights over elements.
- [ ] **Selector Path Generator**:
  - [ ] Generate stable, minimal CSS selectors using DOM traversal heuristics.
  - [ ] Exclude dynamic ID identifiers and state utility classes.
- [ ] **Config Mapper Panel**:
  - [ ] Build sidebar forms mapping names (`price`, `title`), testing selectors, and configuring pagination rules.

---

## 🚀 Phase 5: Production Hardening, LLM Enrichment & Scale (Target: Milestone 5)
*Goal: Enterprise scalability, AI enhancements, security validation, and deployment.*

- [ ] **SSRF & Security Shielding**:
  - [ ] Restrict scraper target URLs to block local hostnames and internal IP ranges (`127.x.x.x`, `10.x.x.x`, etc.).
  - [ ] Sandbox Playwright container execution context.
- [ ] **AI-Assisted Field Renamer**:
  - [ ] Send samples of dynamic columns to LLM (e.g. Claude / Gemini) to auto-enrich names (e.g. rename `div_class_price` -> `product_price`).
- [ ] **Public Templates Gallery**:
  - [ ] Implement catalog schemas and template exports allowing configuration sharing.
- [ ] **Advanced Exports**:
  - [ ] Add Excel (.xlsx) formatting capability using `openpyxl` / `pandas`.
- [ ] **Observability**:
  - [ ] Set up Prometheus instrumentation endpoints and configure Grafana dashboards.
  - [ ] Expose `arq` dashboards for worker queue health monitoring.
- [ ] **Deployment**:
  - [ ] Create production Multi-stage Dockerfiles.
  - [ ] Configure Docker Compose production configs.
