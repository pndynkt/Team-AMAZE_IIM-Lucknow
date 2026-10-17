.PHONY: setup data train test api web build demo docs snapshot web-demo clean

setup:            ## Install Python and Node dependencies
	pip install -r backend/requirements.txt
	cd frontend && npm install

data:             ## Generate the synthetic cohort (EHR + wearable streams, FHIR bundles)
	cd backend && python -m twin.data.generate

train:            ## Train the fusion model, ablations, forecasters; write the model card
	cd backend && python -m twin.models.train

test:             ## Run the test suite (leakage, rules, escalation, FHIR, API)
	cd backend && python -m pytest -q

api:              ## Run the API with auto-reload on :8000
	cd backend && uvicorn twin.api.main:app --reload --port 8000

web:              ## Run the front end dev server on :5173 (proxies /api to :8000)
	cd frontend && npm run dev

build:            ## Production front-end build (served by the API at /)
	cd frontend && npm run build

demo: data train build   ## One command: data, model, front end, then serve everything on :8000
	cd backend && uvicorn twin.api.main:app --port 8000

docs:             ## Re-render the model card and the architecture diagram from the trained artifacts
	python scripts/render_model_card.py
	python scripts/render_architecture.py

snapshot:         ## Refresh the hosted-demo data from a running API (run after retraining)
	python scripts/export_snapshot.py

web-demo:         ## Build the hosted demo (no backend needed) into frontend/dist-demo; Vercel runs this
	cd frontend && npm run build:demo

clean:
	rm -rf backend/data/synthetic/*.parquet backend/data/synthetic/fhir backend/artifacts/*.pkl backend/artifacts/*.parquet backend/*.db frontend/dist frontend/dist-demo
