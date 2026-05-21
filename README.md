# ScrapeForge 🚀

A SaaS-grade visual web scraping platform with automatic database schema generation, secure SSRF-shielded scrapers, AI-assisted column renaming, and background cron schedules—built with a Python backend and React frontend.

---

## 🏗️ Project Architecture

```
scrapeforge/
├── apps/
│   ├── api/             # FastAPI REST & WebSockets Gateway (Port 3000)
│   ├── worker/          # Python arq + Playwright background worker
│   └── frontend/        # React + Vite dashboard & Visual Builder (Port 5173)
├── packages/
│   └── core/            # Core shared python models, migrations, and security rules
├── docker-compose.yml   # Infrastructure services (Postgres, Redis, MinIO)
├── docker-compose.prod.yml # Production Docker compose assembly
├── package.json         # Monorepo scripts
└── requirements.txt     # Python dependencies
```

---

## ⚙️ How ScrapeForge Works under the Hood

ScrapeForge bridges the gap between visual configuration and raw database storage. Here is the operational cycle:

### 1. Visual Selector Coordinates Proxy
- When a user inputs a URL in the **Visual Builder**, the API launches a headless Playwright instance.
- It captures the page screenshot at a fixed `1280x800` viewport and serializes the DOM element coordinates.
- The frontend renders this screenshot with transparent overlays representing clickable targets. Clicking a target generates a unique CSS Selector.

### 2. SSRF Security Shield
- Before any crawl begins, the URL is resolved via DNS query.
- The resolved IP address is verified against private, loopback, multicast, or reserved ranges (`127.x.x.x`, `10.x.x.x`, `172.16.x.x`, `192.168.x.x`, `169.254.x.x`).
- Unsafe requests are instantly blocked to protect intranet infrastructure.

### 3. Dynamic Type Inference Engine
- During scraper execution, the page data is loaded.
- Raw string column values are analyzed by a confidence-based scoring model.
- Types are inferred dynamically to match PostgreSQL system types:
  - `BOOLEAN` (flags like "true", "yes", "in stock")
  - `BIGINT` (counts, raw indices)
  - `NUMERIC(14,4)` (currency and double coordinates)
  - `TIMESTAMPTZ` (ISO dates, timestamps)
  - `JSONB` (complex nested arrays)
  - `TEXT` (general fallback description)

### 4. Zero-Downtime Dynamic DDL Migrations
- The inferred layout schemas are compared to the current database table state.
- **Additive Migrations** are generated: new fields trigger safe `ALTER TABLE ADD COLUMN` queries.
- **Widen Type Casts**: Safe conversions (e.g. `INTEGER` ➡️ `TEXT`) are executed automatically.
- **Narrow Type Casts**: Deconstructive conversions are blocked to prevent historical data loss, generating warning events.

### 5. AI Normalizer Schema
- Raw dynamic CSS classes (e.g. `.item-price_3g2A`) often lead to messy table names.
- Users can click **AI Clean Names** inside the Visual Builder to run selectors through an enrichment pipeline that cleans names (e.g., `item_price_3g2A` ➡️ `price`).

### 6. Background Queue & Logs Streams
- Repeating tasks run automatically via `cron` scheduler schedules managed by `arq`.
- Scraper logs are published in real-time to **Redis Pub/Sub** and broadcasted to active frontend terminals using **WebSockets** (`/ws/runs/{id}`).
- Scrape records are exported into CSV, JSON, and XLSX (via `pandas` and `openpyxl`), saved into **MinIO (S3)**, and retrieved with secured pre-signed URLs.

---

## 🛠️ Tech Stack

* **API Gateway**: Python 3.11, FastAPI, Uvicorn, SQLModel (SQLAlchemy)
* **Scheduler/Worker**: Python `arq` (Redis-backed task engine)
* **Scraping Engine**: Playwright Python, BeautifulSoup4, `lxml`
* **Object Storage**: MinIO (S3 API compatible)
* **Frontend Dashboard**: React 18, Vite, Zustand, Lucide Icons, Vanilla CSS
* **Containerization**: Multi-stage Docker, Docker Compose

---

## 🚀 Getting Started

### 1. Prerequisites
- Node.js 20+
- Python 3.11+
- Docker Desktop

### 2. Configure Environment
A default local development environment file `.env` is created at the root directory:
```bash
# Verify credentials are correct for your local setups:
DATABASE_URL=postgresql+asyncpg://postgres:postgrespassword@localhost:5432/scrapeforge
REDIS_URL=redis://localhost:6379
```

### 3. Spin Up Infrastructure
```bash
# Start Postgres, Redis, and MinIO locally
npm run docker:up
```

### 4. Install Dependencies
```bash
# Install NPM modules
npm install

# Install Python packages and Playwright drivers
npm run python:install
```

### 5. Start Development Servers
Run the following tasks concurrently (in separate terminals or a monorepo manager):
```bash
# Start FastAPI Gateway (Port 3000)
npm run dev:api

# Start arq Task Worker
npm run dev:worker

# Start React Frontend (Port 5173)
npm run dev:frontend
```
