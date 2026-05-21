FROM python:3.11-slim

WORKDIR /app

# Install system dependencies needed for Playwright headless execution
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy python dependencies list
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy package structures
COPY packages/core ./packages/core
RUN pip install -e ./packages/core

# Copy worker source
COPY apps/worker ./apps/worker

# Install playwright browser binary and all its Linux system dependencies (libraries)
RUN playwright install --with-deps chromium

ENV PYTHONUNBUFFERED=1

CMD ["arq", "apps.worker.src.main.WorkerSettings"]
