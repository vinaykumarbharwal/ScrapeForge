# ScrapeForge

A SaaS-grade web scraping platform where non-technical users can visually configure scrapers, schedule jobs, monitor runs, export structured data, and have database schemas generated automatically from target website contents — all without writing code.

## 🏗️ Project Structure

This project is organized as a monorepo using npm workspaces:

```
scrapeforge/
├── apps/
│   ├── api/             # Fastify REST & WebSocket API Gateway
│   ├── worker/          # BullMQ + Playwright distributed scraping workers
│   └── frontend/        # React + Vite dashboard & Visual Scraper Builder
├── packages/
│   ├── database/        # Prisma schema, migrations, and Client exports
│   └── shared/          # Shared TypeScript types and Zod validation schemas
├── docker-compose.yml   # Infrastructure dependency services (Postgres, Redis, MinIO)
├── package.json         # Workspace root scripts
└── tsconfig.base.json   # Base compiler settings shared across packages
```

## 🛠️ Tech Stack

- **Backend**: Node.js 20+, TypeScript, Fastify, Prisma, BullMQ, Redis, PostgreSQL.
- **Scraping Engine**: Playwright, Cheerio.
- **Frontend**: React 19, Vite, Zustand, React Query (TanStack), Recharts, React Flow (visual builder).
- **Infrastructure**: Docker & Docker Compose (MinIO for mock S3 storage).

## 🚀 Getting Started

### 1. Prerequisites
- Node.js 20+
- Docker & Docker Compose

### 2. Set Up Infrastructure
Run the following command to start PostgreSQL, Redis, and MinIO in the background:
```bash
npm run docker:up
```

### 3. Install Dependencies
Install all package dependencies and link workspaces:
```bash
npm install
```

### 4. Database Setup
Create database tables and generate the Prisma Client:
```bash
npm run db:migrate   # Run migrations (when DB is ready)
npm run db:generate  # Generate Prisma client types
```

### 5. Start Development Servers
You can run services independently:
```bash
npm run dev:api       # Starts Fastify backend on http://localhost:3000
npm run dev:worker    # Starts scraping worker listening to BullMQ
npm run dev:frontend  # Starts React UI on http://localhost:5173
```

Or build the entire repository:
```bash
npm run build
```

## 📝 Roadmap & Tasks
A comprehensive checklist of remaining implementation tasks can be found in [todo.md](./todo.md).
