FROM python:3.12-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/*
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt
COPY backend /app/backend
COPY frontend/dist /app/frontend/dist
WORKDIR /app/backend
# Generate the synthetic cohort and train the twin at build time so the image is self-contained
RUN python -m twin.data.generate --no-fhir && python -m twin.models.train && python -m pytest -q tests/test_leakage.py
EXPOSE 8000
CMD ["uvicorn", "twin.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
