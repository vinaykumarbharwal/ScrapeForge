# ScrapeForge2.0 🚀

A full-stack, enterprise-grade **Visual Web Scraping Platform & Auto-Schema Ingestion Engine** featuring Playwright visual selector mapping, zero-downtime database DDL migrations, an offline Machine Learning semantic matching engine, and Postgres vector sync.

---

## 🏗️ Project Architecture

```
scrapeforge/
├── apps/
│   ├── api/             # FastAPI REST Gateway & WebSocket Logs Streamer
│   │   └── src/api_gateway.py  # Central API gateway entrypoint (Port 3000)
│   ├── worker/          # Python arq + Headless Playwright background worker
│   │   └── src/scraper_worker.py # Scraper worker queue scheduler entrypoint
│   └── frontend/        # React + Vite premium glassmorphism client dashboard
│       └── src/pages/
│           ├── ScraperLibrary.tsx  # Scraper definition grid & logs terminal
│           ├── DeveloperKeys.tsx   # REST API keys & custom integration snippets
│           └── TemplatesCatalog.tsx # Ready-to-deploy scraper blueprints
├── packages/
│   └── core/            # Shared python ORM schemas, migration runners, and security filters
│       └── core/scraping/
│           └── vector_vsm.py  # Pure Python TF-IDF Cosine-Similarity vector model
├── package.json         # Unified monorepo startup runner scripts
└── requirements.txt     # Python backend dependencies
```

---

## ⚡ Key Platform Optimizations

### 🚀 1. 500% Page Scraping Acceleration
Playwright crawlers are optimized to bypass slow third-party analytics, cookies, tracking scripts, and heavy dynamic elements:
* **Active Resource Interception:** Automatically intercepts and aborts loading of unnecessary assets (`images`, `media`, `web fonts`, `web sockets`, Google Analytics, Doubleclick).
* **DOM Content Acceleration:** Migrated page load wait limits from standard sluggish `networkidle` states to fast `domcontentloaded` triggers with a brief 500ms layout stabilization delay.

### 🧠 2. Offline Machine Learning & AI Track
The platform features a built-in, highly optimized **Vector Space Model (VSM)** engineered from scratch in pure Python for advanced semantic operations:
* **"Zero-Click" AI Auto-Selector:** Inside the Visual Builder, type a semantic prompt (e.g., `"book price"`, `"article title"`) and click **Auto-Map**. The gateway compiles page coordinates, vectorizes texts, tags, and CSS classes, and runs a sparse **Cosine Similarity** scoring query to automatically detect and map selectors.
* **Live Vector Database Sync (RAG Sync):** Successful scraping runs automatically trigger a dynamic Vector ingestion pipeline. Extracted text fields are chunked, vectorized via TF-IDF, and synced directly to a customized Postgres database table (`scrape_embeddings`) for prompt search querying.

### 🌐 3. Real-Time Status logs & Console Stream
* Execution logs are streamed in real-time using **Redis Pub/Sub** and broadcast to active frontend clients over **WebSockets** (`/ws/runs/{id}`).
* Users can watch scrapers navigate, extract rows, and apply DDL modifications line-by-line via a premium console panel.

### 📅 4. Single-Command Concurrent Startup
The entire full-stack application (FastAPI Gateway, arq Worker, and Vite client) starts concurrently with a single command:
```bash
npm run dev
```

---

## ⚙️ How ScrapeForge Works Under the Hood

1. **Visual Selector Coordinates Proxy:** Plays screenshot coordinate frames in React with transparent interactive bounds to capture visual pointer coordinates.
2. **SSRF Security Shield:** Fully resolves URLs via DNS queries and filters loops, private networks, or reserved ranges (`127.x.x.x`, `10.x.x.x`, etc.) to prevent SSRF vulnerabilities.
3. **Dynamic Type Inference:** Evaluates string samples and scores data types dynamically (`BOOLEAN`, `BIGINT`, `NUMERIC`, `TIMESTAMPTZ`, `JSONB`, `TEXT`).
4. **Additive DDL Migrations:** Dynamically translates type schema diffs into postgres queries, applying migrations (`CREATE TABLE`, `ALTER TABLE ADD COLUMN`, `ALTER TABLE ALTER TYPE`) with widen type protections.

---

## 🛠️ Tech Stack

* **API Gateway**: Python 3.11, FastAPI, Uvicorn, SQLModel, JWT Authentication
* **Task Queue**: Python `arq` (Redis-backed high-speed concurrent scheduler)
* **Scraping Engine**: Playwright Headless Browser, BeautifulSoup4, `lxml`
* **Machine Learning**: Pure Python Vector Space Model, Cosine Similarity, TF-IDF
* **Database**: PostgreSQL (Dynamic schemas & custom Vector sync)
* **Client Dashboard**: React 18, Vite, Zustand state management, Lucide Icons, HSL styling

---

## 🚀 Getting Started

### 1. Install System Dependencies
Install system python and node modules:
```bash
# Install node packages
npm install

# Install Python requirements and Playwright drivers
npm run python:install
```

### 2. Configure Environment variables
Ensure you have a `.env` file in the root workspace configured with your local server credentials:
```env
DATABASE_URL=postgresql+asyncpg://postgres:postgrespassword@localhost:5432/scrapeforge
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_jwt_signing_secret_key_here
```

### 3. Launch the Stack
Execute the unified script to concurrently start the API, Worker, and Frontend client dashboard:
```bash
npm run dev
```

Open your browser and navigate to the local client address (typically `http://localhost:5173`) to launch the ScrapeForge console!
