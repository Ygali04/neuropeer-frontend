FROM python:3.11-slim

# System deps: ffmpeg for audio extraction, yt-dlp needs curl
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Create temp dir
RUN mkdir -p /tmp/neuropeer

# Railway assigns PORT dynamically
ENV PORT=8000
EXPOSE ${PORT}

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

CMD uvicorn backend.api.main:app --host 0.0.0.0 --port ${PORT}
