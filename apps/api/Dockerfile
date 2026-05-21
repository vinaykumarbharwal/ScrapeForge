FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
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

# Copy api gateway source
COPY apps/api ./apps/api

# Install Playwright browser binary (chromium only) for screenshot capture support inside API gateway
RUN playwright install chromium

EXPOSE 3000

ENV PORT=3000
ENV PYTHONUNBUFFERED=1

CMD ["python", "apps/api/src/main.py"]
