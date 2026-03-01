# SellinSeconds API - FastAPI backend for Cloud Run
FROM python:3.10-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Application code
COPY app/ ./app/
COPY main.py .

# Cloud Run sets PORT (default 8080); bind to 0.0.0.0
ENV PORT=8080
EXPOSE 8080

# Use shell form so Cloud Run's PORT env is expanded at runtime
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}"]
