# Full-Stack Web Scraping Platform — Complete Project Idea

> A SaaS-grade web scraping platform where non-technical users can visually configure scrapers,
> schedule jobs, monitor runs, export structured data, and have database schemas generated
> automatically from whatever data the target website contains — all without writing a single line of code.

---

## Table of Contents

1. [Project Vision](#1-project-vision)
2. [System Architecture](#2-system-architecture)
3. [Tech Stack](#3-tech-stack)
4. [Database Design](#4-database-design)
5. [Auto-Schema Generation System](#5-auto-schema-generation-system)
6. [Backend Services](#6-backend-services)
7. [Scraping Engine](#7-scraping-engine)
8. [Frontend Interface](#8-frontend-interface)
9. [API Design](#9-api-design)
10. [Job Queue & Scheduling](#10-job-queue--scheduling)
11. [Advanced Features](#11-advanced-features)
12. [Security](#12-security)
13. [Deployment Architecture](#13-deployment-architecture)
14. [Build Order & Milestones](#14-build-order--milestones)
15. [Learning Outcomes](#15-learning-outcomes)

---

## 1. Project Vision

Think **Octoparse meets Apify**, but built by you. The platform solves three real problems:

- Non-technical users cannot write scraping code but need data from the web regularly
- Scraped data has unpredictable structure until you actually visit a site — hardcoding schemas wastes time
- Running scrapers reliably at scale requires infrastructure most individuals cannot set up alone

The killer differentiator is the **auto-schema system**: the database structure builds itself based on whatever data the scraper discovers. Point it at any website, and the system creates a perfectly typed PostgreSQL table, evolves its columns as the site changes, and never loses historical data.

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Frontend (React + Vite)                 │
│    Dashboard · Task Manager · Visual Builder · Export    │
└──────────────────────┬──────────────────────────────────┘
                       │ REST / WebSocket
┌──────────────────────▼──────────────────────────────────┐
│          API Gateway (Node.js / Express / Fastify)       │
│        Auth · Rate limiting · Routing · WebSocket        │
└──────┬───────────────┬────────────────────┬─────────────┘
       │               │                    │
┌──────▼──────┐ ┌──────▼───────────┐ ┌─────▼───────────┐
│ Auth Service│ │Task & Scheduler  │ │  Export Service  │
│ JWT · OAuth │ │BullMQ · Cron     │ │  CSV/JSON/XLSX   │
│ RBAC        │ │Webhooks          │ │  S3 / MinIO      │
└─────────────┘ └──────┬───────────┘ └─────────────────-┘
                       │
              ┌────────▼────────┐
              │  Job Queue      │
              │  Redis/BullMQ   │
              │  Priority queues│
              │  Retries · DLQ  │
              └────────┬────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│           Scraping Engine (Playwright + Cheerio)         │
│  Session · Rate limit · Proxy rotation · JS rendering   │
│  Error retry · Anti-detection · Data validation         │
└──────────────────────┬──────────────────────────────────┘
                       │
         ┌─────────────┼──────────────┐
   ┌─────▼──────┐ ┌────▼─────┐ ┌─────▼──────┐
   │ PostgreSQL │ │  Redis   │ │  S3/MinIO  │
   │ Primary DB │ │  Cache   │ │  Files     │
   └────────────┘ └──────────┘ └────────────┘
```

**Key architectural principle:** The API layer and scraping layer are completely decoupled through the job queue. This means you can scale scrapers independently of the API, and a crashed scraper worker never affects the user-facing API.

---

## 3. Tech Stack

### Backend
| Layer | Technology | Reason |
|---|---|---|
| Runtime | Node.js 20 + TypeScript | Best async ecosystem for scraping |
| Framework | Fastify | Faster than Express, great TypeScript support |
| ORM | Prisma | Type-safe queries, excellent migration tooling |
| Queue | BullMQ (Redis) | Priority queues, delayed jobs, retries, Bull Board UI |
| Auth | JWT + Passport.js | Stateless, scalable |
| File storage | AWS S3 / MinIO | Object storage for exports |

### Scraping Engine
| Tool | Purpose |
|---|---|
| Playwright | Full JS rendering, multi-browser, network interception |
| Cheerio | Fast static HTML parsing when JS not needed |
| Rotating-proxy-stream | Proxy pool management |
| `fingerprint-injector` | Anti-detection browser fingerprinting |

### Frontend
| Tool | Purpose |
|---|---|
| React 18 + Vite | Fast dev server, tree-shaking |
| Tailwind CSS | Utility-first, no CSS conflicts |
| React Query (TanStack) | Server state management, caching |
| React Flow | Visual scraper builder node canvas |
| Recharts | Monitoring charts and analytics |
| Zustand | Client-side UI state |

### Infrastructure
| Tool | Purpose |
|---|---|
| PostgreSQL 16 | Primary relational database |
| Redis 7 | Queue backend + cache + sessions |
| Docker + Docker Compose | Local dev environment |
| Kubernetes / Render | Production deployment |
| Prometheus + Grafana | Metrics and alerting |
| MinIO | S3-compatible local object store |

---

## 4. Database Design

### Fixed Platform Tables

These tables are predefined — they power the platform itself:

```sql
-- Users and authentication
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           VARCHAR(255) UNIQUE NOT NULL,
  password_hash   TEXT,
  oauth_provider  VARCHAR(50),
  oauth_id        TEXT,
  plan            VARCHAR(20) DEFAULT 'free',  -- free | pro | team
  api_key_hash    TEXT,
  timezone        VARCHAR(100) DEFAULT 'UTC',
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Scraping task definitions
CREATE TABLE scrape_tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  config          JSONB NOT NULL,        -- visual builder output (selectors, pagination, auth)
  schedule_cron   VARCHAR(100),          -- null = manual only
  status          VARCHAR(20) DEFAULT 'active',  -- active | paused | archived
  last_run_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Individual run records
CREATE TABLE task_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         UUID NOT NULL REFERENCES scrape_tasks(id) ON DELETE CASCADE,
  started_at      TIMESTAMPTZ DEFAULT now(),
  finished_at     TIMESTAMPTZ,
  status          VARCHAR(20),           -- running | success | failed | cancelled
  rows_scraped    INTEGER DEFAULT 0,
  pages_visited   INTEGER DEFAULT 0,
  error_log       TEXT,
  duration_ms     INTEGER
);

-- Reusable selector templates
CREATE TABLE templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id),
  name            VARCHAR(255) NOT NULL,
  description     TEXT,
  selector_config JSONB NOT NULL,
  is_public       BOOLEAN DEFAULT false,
  use_count       INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Export records
CREATE TABLE exports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_run_id     UUID NOT NULL REFERENCES task_runs(id),
  format          VARCHAR(10) NOT NULL,  -- csv | json | xlsx
  file_url        TEXT,
  file_size_bytes BIGINT,
  status          VARCHAR(20) DEFAULT 'pending',
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Schema registry (for auto-generated tables)
CREATE TABLE schema_registry (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         UUID NOT NULL REFERENCES scrape_tasks(id),
  version         INTEGER NOT NULL,
  columns         JSONB NOT NULL,        -- array of {name, pg_type, nullable, samples}
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(task_id, version)
);

-- Notification settings
CREATE TABLE notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  event_type      VARCHAR(50) NOT NULL,  -- run_success | run_failed | schema_changed
  channel         VARCHAR(20) NOT NULL,  -- email | webhook | slack
  config          JSONB NOT NULL,        -- {webhook_url, email, slack_channel}
  is_active       BOOLEAN DEFAULT true
);
```

### Auto-Generated Data Tables

For every scraping task, the system creates a dedicated table:

```
scrape_data__{task_id_without_hyphens}
```

Example for task `a3f9b2c1-...`:

```sql
CREATE TABLE scrape_data__a3f9b2c1... (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id      UUID NOT NULL REFERENCES task_runs(id),
  scraped_at  TIMESTAMPTZ DEFAULT now(),
  -- All columns below are auto-generated:
  title       TEXT,
  price       NUMERIC(14,4),
  rating      NUMERIC(3,1),
  availability TEXT,
  cover_url   TEXT,
  product_url TEXT
);
```

As the target website changes, new columns are added automatically. Old columns are made nullable (never dropped) to preserve historical data.

---

## 5. Auto-Schema Generation System

This is the most innovative part of the platform. The entire pipeline runs automatically every time a scraping task executes.

### Pipeline Overview

```
Crawl page → Extract raw fields → Infer types → Diff schema → Run migration
                                                      ↕
                                              Schema registry
                                   (optional) LLM field naming
```

### Stage 1 — Field Extraction

When Playwright renders a page, the extractor identifies repeating structural patterns in the DOM — the signature of a data list:

```typescript
class FieldExtractor {
  async extract(page: Page): Promise<RawField[]> {
    return page.evaluate(() => {
      // Find repeated sibling groups — cards, rows, list items
      const candidates = document.querySelectorAll(
        '[class*="card"], [class*="item"], [class*="product"], ' +
        '[class*="result"], article, li, tr'
      )

      // Score by repetition — 3+ identical structures = data pattern
      const groups = groupBySimilarStructure(candidates)
      const bestGroup = groups.sort((a, b) => b.length - a.length)[0]

      return bestGroup.map(el => ({
        rawName:  generateFieldName(el),
        samples:  extractLeafText(el),
        tagPath:  getTagPath(el),
        attrs:    getRelevantAttributes(el)   // href, src, data-*
      }))
    })
  }
}
```

### Stage 2 — Type Inference

Each extracted field runs through a cascade of pattern matchers with confidence scoring:

```typescript
const TYPE_PATTERNS = [
  { type: 'url',     pg: 'TEXT',          regex: /^https?:\/\/.+/,            confidence: 0.99 },
  { type: 'email',   pg: 'TEXT',          regex: /^[\w.]+@[\w.]+\.\w+$/,     confidence: 0.98 },
  { type: 'date',    pg: 'TIMESTAMPTZ',   regex: /\d{4}-\d{2}-\d{2}/,        confidence: 0.95 },
  { type: 'price',   pg: 'NUMERIC(14,4)', regex: /^[$€£¥]?\s*[\d,]+\.?\d*$/, confidence: 0.90 },
  { type: 'integer', pg: 'BIGINT',        regex: /^\d+$/,                    confidence: 0.85 },
  { type: 'decimal', pg: 'NUMERIC(14,4)', regex: /^\d+\.\d+$/,               confidence: 0.85 },
  { type: 'boolean', pg: 'BOOLEAN',       regex: /^(yes|no|true|false)$/i,   confidence: 0.80 },
  { type: 'json',    pg: 'JSONB',         regex: /^\{.*\}$|^\[.*\]$/,        confidence: 0.75 },
  { type: 'text',    pg: 'TEXT',          regex: /.*/,                       confidence: 0.50 },
]

function inferType(samples: string[]): InferredType {
  const scores = TYPE_PATTERNS.map(p => ({
    ...p,
    score: samples.filter(s => p.regex.test(s.trim())).length
           / samples.length * p.confidence
  }))
  return scores.sort((a, b) => b.score - a.score)[0]
}
```

Type mapping reference:

| Inferred | PostgreSQL | Notes |
|---|---|---|
| `text` | `TEXT` | Default fallback |
| `integer` | `BIGINT` | Generous sizing for safety |
| `decimal` / `price` | `NUMERIC(14,4)` | Preserves exact precision |
| `url` | `TEXT` | Plus `CHECK` constraint |
| `date` | `TIMESTAMPTZ` | Normalized to UTC |
| `boolean` | `BOOLEAN` | |
| `json` | `JSONB` | Nested objects or arrays |
| `array` | `TEXT[]` | Multi-value fields |

### Stage 3 — Schema Registry

Every schema version is persisted:

```sql
-- columns JSONB structure example:
[
  { "name": "title",       "pg_type": "TEXT",         "nullable": false },
  { "name": "price",       "pg_type": "NUMERIC(14,4)","nullable": true  },
  { "name": "rating",      "pg_type": "NUMERIC(3,1)", "nullable": true  },
  { "name": "product_url", "pg_type": "TEXT",         "nullable": false }
]
```

### Stage 4 — Diff Engine

Before any migration runs, the system computes a safe diff:

```typescript
class SchemaDiffer {
  diff(current: Column[], incoming: Column[]): SchemaDiff {
    const currentMap = new Map(current.map(c => [c.name, c]))
    const incomingMap = new Map(incoming.map(c => [c.name, c]))

    return {
      added:       incoming.filter(c => !currentMap.has(c.name)),
      removed:     current.filter(c => !incomingMap.has(c.name)),
      typeChanged: incoming.filter(c => {
        const old = currentMap.get(c.name)
        return old && old.pg_type !== c.pg_type && isWidening(old.pg_type, c.pg_type)
      }),
      // These are flagged for human review — never auto-applied
      typeNarrowed: incoming.filter(c => {
        const old = currentMap.get(c.name)
        return old && old.pg_type !== c.pg_type && !isWidening(old.pg_type, c.pg_type)
      })
    }
  }
}
```

### Stage 5 — Migration Runner

Only safe, additive changes are applied automatically:

```typescript
class MigrationRunner {
  async apply(taskId: string, diff: SchemaDiff) {
    const table = `scrape_data__${taskId.replace(/-/g, '_')}`

    if (diff.isNewTable) {
      await this.db.query(`
        CREATE TABLE ${table} (
          id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          run_id     UUID NOT NULL REFERENCES task_runs(id),
          scraped_at TIMESTAMPTZ DEFAULT now(),
          ${diff.added.map(c => `${c.name} ${c.pg_type}`).join(',\n          ')}
        )
      `)
      return
    }

    for (const col of diff.added) {
      await this.db.query(
        `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${col.name} ${col.pg_type}`
      )
    }

    for (const col of diff.typeChanged) {
      await this.db.query(
        `ALTER TABLE ${table} ALTER COLUMN ${col.name}
         TYPE ${col.pg_type} USING ${col.name}::${col.pg_type}`
      )
    }

    // Never DROP — make nullable to preserve historical rows
    for (const col of diff.removed) {
      await this.db.query(
        `ALTER TABLE ${table} ALTER COLUMN ${col.name} DROP NOT NULL`
      )
    }

    await this.saveSchemaVersion(taskId, diff.newColumns)
  }
}
```

### Safety Rules (Non-Negotiable)

The auto-migration engine must never automatically:

1. `DROP COLUMN` — only mark nullable. Dropping destroys historical data silently.
2. Narrow a type (e.g. `TEXT → INTEGER`) — this can fail with cast errors on existing rows.
3. Rename a column — a rename is indistinguishable from a drop + add; always create new, keep old.

Any of these conditions logs a `schema_warning` event and surfaces it in the user's dashboard for manual resolution.

### Optional — LLM Field Naming

Raw DOM field names are often ugly (`span_3`, `div_text_12`). After extraction, sample values can be sent to an LLM to get clean, semantic names:

```typescript
async function enrichFieldNames(rawFields: RawField[]): Promise<RawField[]> {
  const prompt = `
Given these scraped field samples, suggest clean snake_case column names.
Return ONLY a JSON array: [{ "original": "...", "suggested": "...", "type": "..." }]

Fields:
${rawFields.map(f => `- "${f.rawName}": ${JSON.stringify(f.samples.slice(0, 3))}`).join('\n')}
`
  const res = await callClaude(prompt)
  return mergeNames(rawFields, JSON.parse(res))
}
```

This turns `div_class_price_box_span` into `price`, and `h2_product_title_text` into `product_name`.

### End-to-End Example

A user points the scraper at `books.toscrape.com`. First run creates:

```sql
CREATE TABLE scrape_data__a3f9... (
  id UUID, run_id UUID, scraped_at TIMESTAMPTZ,
  title TEXT, price NUMERIC(14,4), rating TEXT,
  availability TEXT, cover_url TEXT
);
```

Three weeks later the site adds a `discount_pct` field. Next scheduled run detects it:

```sql
ALTER TABLE scrape_data__a3f9... ADD COLUMN IF NOT EXISTS discount_pct NUMERIC(5,2);
```

No human involvement. Historical rows have `NULL` for `discount_pct`. New rows have the value. The schema grew with the website.

---

## 6. Backend Services

### Auth Service

- JWT access tokens (15 min expiry) + refresh tokens (30 days, stored in Redis)
- OAuth2 support (Google, GitHub) via Passport.js
- Role-based access control: `owner`, `editor`, `viewer` per workspace
- API key authentication for programmatic access (hashed with bcrypt, shown once on creation)

### Task Service

```typescript
class TaskService {
  async createTask(userId: string, config: TaskConfig): Promise<Task>
  async updateTask(id: string, patch: Partial<TaskConfig>): Promise<Task>
  async triggerRun(taskId: string): Promise<TaskRun>
  async pauseTask(taskId: string): Promise<void>
  async getRunHistory(taskId: string, page: number): Promise<TaskRun[]>
}
```

### Scheduler Service

Uses BullMQ's built-in cron support. When a user sets a task to "every day at 9am":

```typescript
await taskQueue.add('scrape', { taskId }, {
  repeat: { cron: '0 9 * * *', tz: user.timezone },
  removeOnComplete: 100,
  removeOnFail: 50,
})
```

### Export Service

Exports run asynchronously. Client polls status via REST or receives a WebSocket push:

```typescript
class ExportService {
  async createExport(runId: string, format: 'csv' | 'json' | 'xlsx'): Promise<string> {
    const jobId = await exportQueue.add('export', { runId, format })
    return jobId  // client polls /exports/:jobId
  }

  async generateCsv(runId: string): Promise<Buffer> {
    // Stream rows from auto-generated table in batches of 1000
    const table = await this.getDataTable(runId)
    return streamToBuffer(
      db.query(`SELECT * FROM ${table} WHERE run_id = $1`, [runId])
        .pipe(new CsvTransform())
    )
  }
}
```

---

## 7. Scraping Engine

### Core Pipeline (Middleware Architecture)

```
Request
  → ProxyMiddleware        (rotate IP per domain)
  → SessionMiddleware      (manage cookies, login state)
  → RateLimiterMiddleware  (per-domain delays)
  → PageLoader             (Playwright render)
  → SelectorEngine         (extract fields)
  → DataValidator          (type check, sanitize)
  → OutputWriter           (insert to auto-schema table)
```

### ScraperJob Class

```typescript
class ScraperJob {
  constructor(private config: TaskConfig, private taskRunId: string) {}

  async run(): Promise<ScraperResult> {
    const browser = await this.launchBrowser()
    let pageCount = 0
    let rowCount = 0

    for await (const url of this.paginator(browser)) {
      const page = await browser.newPage()
      await this.applyAntiDetection(page)
      await page.goto(url, { waitUntil: 'networkidle' })

      const raw = await this.extractor.extract(page)
      const typed = await this.typeInferrer.infer(raw)
      await this.schemaMigrator.ensureColumns(this.config.taskId, typed)
      await this.writer.insertBatch(this.config.taskId, this.taskRunId, typed)

      rowCount += typed.length
      pageCount++
      await page.close()
      await this.rateLimiter.wait(url)
    }

    await browser.close()
    return { rowCount, pageCount, status: 'success' }
  }
}
```

### Anti-Detection Strategies

```typescript
async function applyAntiDetection(page: Page) {
  // 1. Randomize viewport
  await page.setViewportSize({
    width:  1280 + Math.floor(Math.random() * 200),
    height: 800  + Math.floor(Math.random() * 200)
  })

  // 2. Rotate user agent from a real-browser pool
  await page.setExtraHTTPHeaders({
    'User-Agent': randomUserAgent(),
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br'
  })

  // 3. Mask automation flags
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
    window.chrome = { runtime: {} }
  })

  // 4. Random mouse movement before interaction
  await page.mouse.move(
    300 + Math.random() * 400,
    200 + Math.random() * 300
  )
}
```

### Pagination Handler

Supports three common patterns automatically:

```typescript
async function* paginator(browser: Browser, config: TaskConfig) {
  if (config.pagination.type === 'next_button') {
    // Click "next" until button disappears
    yield config.startUrl
    while (true) {
      const nextBtn = await page.$(config.pagination.selector)
      if (!nextBtn) break
      await nextBtn.click()
      await page.waitForLoadState('networkidle')
      yield page.url()
    }

  } else if (config.pagination.type === 'url_pattern') {
    // Increment page number in URL
    for (let p = 1; p <= config.pagination.maxPages; p++) {
      yield config.pagination.urlTemplate.replace('{page}', String(p))
    }

  } else if (config.pagination.type === 'infinite_scroll') {
    // Scroll to bottom, wait for new content
    yield config.startUrl
    let prevHeight = 0
    while (true) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
      await page.waitForTimeout(1500)
      const newHeight = await page.evaluate(() => document.body.scrollHeight)
      if (newHeight === prevHeight) break
      prevHeight = newHeight
    }
  }
}
```

---

## 8. Frontend Interface

### Component Tree

```
App
├── AuthLayout
│   ├── LoginPage
│   └── RegisterPage
└── AppLayout (authenticated)
    ├── Sidebar (navigation)
    ├── DashboardPage
    │   ├── UsageStats (runs today, rows scraped, active tasks)
    │   ├── RecentRunsList
    │   └── QuickCreateButton
    ├── TasksPage
    │   ├── TaskList (sortable, filterable)
    │   ├── TaskCard (status badge · last run · cron schedule)
    │   └── CreateTaskModal
    ├── BuilderPage  ←  visual scraper editor
    │   ├── UrlBar (enter target URL)
    │   ├── PreviewPanel (screenshot + click-to-select overlay)
    │   ├── FieldMapper (detected fields + name assignment)
    │   ├── PaginationConfig
    │   └── ConfigPanel (JSON preview + validation errors)
    ├── RunDetailPage
    │   ├── LiveConsole (WebSocket stream — current URL, rows found, errors)
    │   ├── DataTable (paginated scraped results, column types shown)
    │   ├── SchemaViewer (current auto-generated schema)
    │   └── ExportPanel (format selector + download)
    ├── TemplatesPage
    │   ├── PublicTemplateGallery
    │   └── MyTemplates
    └── SettingsPage
        ├── ApiKeys
        ├── NotificationSettings
        └── BillingPage
```

### Visual Scraper Builder — Core UX

The builder is the hardest frontend feature and the most valuable one. The UX flow:

1. User enters a URL in the top bar and clicks "Load"
2. Platform takes a full-page screenshot and renders it in the preview panel
3. A transparent overlay is injected — hovering over elements highlights them with a dashed border
4. Clicking an element auto-generates a CSS selector using the `finder` library
5. A popup appears: "What is this field?" — user types `price`, `title`, `rating`, etc.
6. The mapped fields appear as cards in the right panel
7. User can click "Test selector" to preview how many elements it matches
8. A pagination section lets user configure how to move to the next page
9. "Save & Run" outputs the portable JSON config and queues the first run

### Live Run Console

```typescript
// Frontend — connect to WebSocket run stream
const ws = new WebSocket(`wss://api.example.com/ws/runs/${runId}`)

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data)
  // msg.type: 'progress' | 'row' | 'schema_change' | 'error' | 'done'
  appendToConsole(msg)
}
```

Console output example:

```
[10:42:01] Starting run for task "Amazon Product Prices"
[10:42:02] Loaded https://amazon.com/s?k=laptops (page 1)
[10:42:04] Extracted 24 rows — fields: title, price, rating, review_count
[10:42:04] Schema change detected: added column "sponsored" (boolean)
[10:42:04] Migration applied: ALTER TABLE scrape_data__... ADD COLUMN sponsored BOOLEAN
[10:42:06] Loaded https://amazon.com/s?k=laptops&page=2 (page 2)
[10:42:08] Extracted 24 rows
...
[10:43:15] Run complete — 240 rows across 10 pages in 73s
```

---

## 9. API Design

### Authentication

```
POST   /auth/register          Create new account
POST   /auth/login             Returns access + refresh tokens
POST   /auth/refresh           Rotate refresh token
POST   /auth/logout
GET    /auth/me                Current user profile
POST   /auth/api-key           Generate API key
DELETE /auth/api-key           Revoke API key
```

### Tasks

```
GET    /tasks                  List all user tasks (pagination, filter by status)
POST   /tasks                  Create new task
GET    /tasks/:id              Get task detail + current schema
PATCH  /tasks/:id              Update task config or schedule
DELETE /tasks/:id              Archive task (soft delete)
POST   /tasks/:id/run          Trigger manual run → returns run_id
POST   /tasks/:id/pause        Pause scheduled runs
POST   /tasks/:id/resume       Resume scheduled runs
GET    /tasks/:id/schema       Current auto-generated schema for this task
```

### Runs

```
GET    /tasks/:id/runs         Run history (paginated)
GET    /runs/:id               Single run detail
GET    /runs/:id/data          Paginated scraped rows
DELETE /runs/:id               Cancel running job

WS     /ws/runs/:id            Live run progress stream
```

### Templates

```
GET    /templates              Public templates + user's own
POST   /templates              Save current task config as template
GET    /templates/:id          Template detail
DELETE /templates/:id
POST   /templates/:id/use      Create a new task from template
```

### Exports

```
GET    /exports                List exports for user
POST   /exports                Create export job { run_id, format }
GET    /exports/:id            Poll status + get download URL
```

### Schema

```
GET    /tasks/:id/schema/history    All schema versions
POST   /tasks/:id/schema/approve    Approve a pending schema warning
```

---

## 10. Job Queue & Scheduling

### Queue Architecture

Three separate BullMQ queues for isolation:

```typescript
const scrapeQueue  = new Queue('scrape',  { connection: redis })
const exportQueue  = new Queue('export',  { connection: redis })
const notifyQueue  = new Queue('notify',  { connection: redis })
```

Each queue has its own worker pool. Scrape workers are the most resource-intensive and scale separately:

```typescript
const scrapeWorker = new Worker('scrape', async (job) => {
  const runner = new ScraperJob(job.data.config, job.data.runId)
  return runner.run()
}, {
  connection: redis,
  concurrency: 3,           // 3 parallel jobs per worker instance
  limiter: { max: 10, duration: 1000 }  // global rate limit
})
```

### Scheduling

When a task has a cron schedule, BullMQ handles it natively:

```typescript
await scrapeQueue.add(
  'scheduled-run',
  { taskId, config },
  {
    repeat: {
      cron: task.schedule_cron,   // e.g. '0 9 * * 1-5'
      tz:   user.timezone          // e.g. 'Asia/Kolkata'
    },
    attempts: 3,
    backoff: { type: 'exponential', delay: 60000 }
  }
)
```

### Bull Board Admin UI

Mount Bull Board as a protected internal route to monitor all queues visually:

```typescript
import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { ExpressAdapter } from '@bull-board/express'

const serverAdapter = new ExpressAdapter()
createBullBoard({
  queues: [
    new BullMQAdapter(scrapeQueue),
    new BullMQAdapter(exportQueue),
    new BullMQAdapter(notifyQueue),
  ],
  serverAdapter
})

app.use('/admin/queues', adminAuth, serverAdapter.getRouter())
```

---

## 11. Advanced Features

### Visual Scraper Builder — Selector Generation

Use the `finder` library for stable, minimal CSS selectors:

```typescript
import { finder } from '@medv/finder'

page.on('click', async (element) => {
  const selector = await page.evaluate((el) => {
    return finder(el, {
      root:      document.body,
      idName:    (name) => !name.includes('session'),   // skip dynamic IDs
      className: (name) => !name.includes('active'),    // skip state classes
      seedMinLength: 3,
      optimizedMinLength: 2,
    })
  }, element)

  sendSelectorToUI(selector)
})
```

### Template System

Templates are portable JSON configs that can be shared publicly:

```json
{
  "name": "E-commerce product listing",
  "description": "Works on most Shopify and WooCommerce stores",
  "version": "1.0",
  "config": {
    "pagination": { "type": "next_button", "selector": ".pagination .next" },
    "fields": [
      { "name": "title",    "selector": "h1.product-title",    "type": "text" },
      { "name": "price",    "selector": ".price",              "type": "text" },
      { "name": "image",    "selector": "img.product-image",   "type": "attr", "attr": "src" },
      { "name": "sku",      "selector": "[data-sku]",          "type": "attr", "attr": "data-sku" }
    ]
  }
}
```

### Notification System

```typescript
class NotificationService {
  async notify(userId: string, event: ScraperEvent) {
    const prefs = await this.getPreferences(userId, event.type)

    for (const pref of prefs) {
      if (pref.channel === 'email') {
        await this.sendEmail(pref.config.email, event)
      } else if (pref.channel === 'webhook') {
        await axios.post(pref.config.url, event)
      } else if (pref.channel === 'slack') {
        await this.postSlackMessage(pref.config.webhookUrl, event)
      }
    }
  }
}

// Events that trigger notifications:
// run_success, run_failed, run_slow, schema_changed,
// schema_warning (needs human review), quota_near_limit
```

### Usage Analytics

Track per-user usage for billing and plan enforcement:

```typescript
// Stored in Redis for real-time, flushed to PostgreSQL hourly
interface UsageRecord {
  userId:     string
  period:     string     // 'YYYY-MM'
  runsCount:  number
  rowsScraped:number
  storageBytes:number
  apiCalls:   number
}
```

### AI-Assisted Selector Suggestion (Phase 3)

Pass a page screenshot to a vision-capable LLM to auto-suggest what fields to extract:

```typescript
async function suggestSelectors(screenshotBase64: string): Promise<FieldSuggestion[]> {
  const response = await claude.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: screenshotBase64 }},
        { type: 'text',  text: 'This is a webpage screenshot. Identify the repeating data items and suggest CSS selectors and field names for each value. Return JSON only.' }
      ]
    }]
  })
  return JSON.parse(response.content[0].text)
}
```

---

## 12. Security

### API Security

- All endpoints require JWT or API key authentication
- Rate limiting: 100 req/min per user, 10 req/min for scrape triggers
- Scope all database queries to `user_id` — never trust client-provided IDs alone (IDOR prevention)
- CORS restricted to known frontend origins
- Helmet.js for secure HTTP headers

### Scraping Security

- SSRF prevention: validate all user-provided URLs — block `localhost`, `127.x.x.x`, `10.x.x.x`, `file://`, `ftp://`
- Selector sanitization: all CSS selectors are validated against a safelist before execution
- Run Playwright in a sandboxed Docker container with `--no-sandbox` only in controlled environments
- Never allow users to inject JavaScript into the scraping context

### Data Security

- API keys shown only once at creation, stored as bcrypt hashes
- Sensitive config values (proxy passwords, login credentials) encrypted at rest using AES-256
- Exports deleted from S3 after 30 days automatically
- All auto-generated table names use task UUIDs — never user-provided strings in table names (SQL injection prevention)

### OWASP Compliance Checklist

- [x] Injection: parameterized queries everywhere, table names from UUID registry only
- [x] Broken authentication: JWT expiry, refresh rotation, secure cookie flags
- [x] Sensitive data exposure: passwords hashed, API keys hashed, HTTPS enforced
- [x] Security misconfiguration: Helmet.js, CSP headers, no stack traces in production
- [x] IDOR: all resource queries scoped to authenticated user's ID
- [x] SSRF: URL blocklist for internal ranges

---

## 13. Deployment Architecture

### Docker Compose (Local Development)

```yaml
services:
  api:
    build: ./apps/api
    ports: ["3000:3000"]
    environment:
      DATABASE_URL: postgres://postgres:postgres@postgres:5432/scraper
      REDIS_URL: redis://redis:6379
    depends_on: [postgres, redis]

  worker:
    build: ./apps/worker
    environment:
      DATABASE_URL: postgres://postgres:postgres@postgres:5432/scraper
      REDIS_URL: redis://redis:6379
    depends_on: [redis]

  frontend:
    build: ./apps/frontend
    ports: ["5173:5173"]

  postgres:
    image: postgres:16
    volumes: ["pgdata:/var/lib/postgresql/data"]

  redis:
    image: redis:7-alpine

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    ports: ["9000:9000", "9001:9001"]

volumes:
  pgdata:
```

### Production Topology

```
┌─ nginx / Cloudflare (SSL termination, DDoS)
├─ api          (Node.js, 2–4 replicas, auto-scale on CPU)
├─ worker       (Scraper workers, 2–20 replicas, auto-scale on queue depth)
├─ frontend     (Static build on Vercel / Cloudflare Pages)
├─ postgres     (Managed — AWS RDS or Supabase)
├─ redis        (Managed — Upstash or ElastiCache)
└─ minio / S3   (AWS S3 in production)
```

The worker service is the only horizontally-scaled compute component. A queue depth threshold triggers auto-scaling: when pending jobs exceed 50, add a worker; when queue empties, scale down.

### Monitoring Stack

- **Prometheus** — metrics collection (queue depth, scrape success rate, latency)
- **Grafana** — dashboards and alerting
- **Sentry** — error tracking and performance monitoring
- **Bull Board** — real-time job queue visualization (admin only)

Key metrics to alert on:
- Queue depth > 100 for more than 5 minutes
- Worker error rate > 10%
- API p95 latency > 500ms
- Disk usage > 80%

---

## 14. Build Order & Milestones

### Phase 1 — Core Scraping (Weeks 1–3)

Goal: a single URL can be scraped end-to-end, data saved to auto-generated table.

- [ ] Project scaffold: monorepo with `apps/api`, `apps/worker`, `apps/frontend`
- [ ] Docker Compose local environment
- [ ] PostgreSQL schema + Prisma setup (fixed tables only)
- [ ] Basic Playwright scraper with type inference
- [ ] Auto-schema generation + migration runner
- [ ] BullMQ worker wired up
- [ ] REST endpoint: `POST /tasks` + `POST /tasks/:id/run`
- [ ] Verify data lands in auto-generated table

### Phase 2 — Auth + Dashboard (Weeks 4–5)

Goal: multiple users can log in and manage their own tasks.

- [ ] JWT auth (register, login, refresh)
- [ ] Scope all queries to `user_id`
- [ ] React frontend scaffold + routing
- [ ] Login / register pages
- [ ] Tasks list + create task form
- [ ] Run history table
- [ ] Basic data viewer (read-only table component)

### Phase 3 — Scheduling + Exports (Week 6)

Goal: runs happen automatically, data can be downloaded.

- [ ] Cron scheduling with timezone support
- [ ] CSV and JSON export
- [ ] WebSocket live console
- [ ] Email notifications on run failure

### Phase 4 — Visual Builder (Weeks 7–9)

Goal: non-technical user can configure a scraper by clicking.

- [ ] Playwright screenshot API endpoint
- [ ] Click-to-select overlay with `finder` selector generation
- [ ] Field mapper UI component
- [ ] Pagination configurator
- [ ] "Test run" with live preview of first 5 rows

### Phase 5 — Polish + Scale (Weeks 10–12)

Goal: production-ready with advanced features.

- [ ] Template marketplace
- [ ] XLSX export
- [ ] LLM field naming integration
- [ ] API key management
- [ ] Usage analytics dashboard
- [ ] Slack / webhook notifications
- [ ] Rate limiting + plan enforcement
- [ ] Production Docker/Kubernetes deployment
- [ ] Prometheus + Grafana setup
- [ ] AI-assisted selector suggestion (stretch goal)

---

## 15. Learning Outcomes

By completing this project you will have built and understood:

**System Architecture**
- Event-driven architecture with job queues decoupling API from compute
- Horizontal scaling of stateless worker processes
- Database schema management at runtime (DDL from application code)

**API Development**
- RESTful API design with proper resource naming and HTTP semantics
- WebSocket real-time communication for live streaming data
- JWT authentication with refresh token rotation
- API key management and hashing

**Frontend Development**
- Complex stateful UI with React Query server-state management
- Real-time updates via WebSocket
- Visual editor using React Flow node canvas
- File download UX (streaming exports)

**Database Engineering**
- Dynamic schema generation and safe DDL migrations
- Schema versioning and diff algorithms
- JSONB for flexible metadata storage
- Query scoping for multi-tenant isolation

**DevOps**
- Docker multi-service local development
- Container orchestration concepts
- Observability: metrics, logging, alerting
- Environment-based configuration management

**Security**
- OWASP top 10 mitigations in a real application
- SSRF prevention
- Multi-tenant data isolation
- Secrets management

---

*Document generated by a senior AI engineer. All code samples are TypeScript/Node.js. Database is PostgreSQL 16. Scraping engine uses Playwright 1.x.*
