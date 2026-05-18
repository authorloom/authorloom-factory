# Authorloom Factory on Google Cloud Run

The factory is designed to run as a containerized worker. It polls Convex for
queued render jobs, renders videos with FFmpeg in the container's temporary
filesystem, uploads the result to durable storage, and writes job status back to
Convex.

## Architecture

- **GitHub**: source of truth for the factory repo.
- **Artifact Registry**: stores the Docker image.
- **Cloud Run service**: runs one or more worker containers.
- **Secret Manager**: stores Convex, Google, and worker credentials.
- **Convex**: production job queue and campaign state.
- **Google Drive / future GCS preview bucket**: output storage.

The container uses local disk only as a temporary render workspace. Nothing on
the container filesystem should be treated as durable.

## Required Google Cloud APIs

Enable these APIs in the target project:

- Cloud Run API
- Artifact Registry API
- Secret Manager API
- Cloud Build API
- IAM Service Account Credentials API

## Required secrets

Create these secrets in Secret Manager:

- `AUTHORLOOM_CONVEX_URL`
- `AUTHORLOOM_WORKER_SECRET`
- `GOOGLE_CLIENT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `GOOGLE_PROJECT_ID`
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_TOKEN_JSON`

For the current beta path, Google Drive writes should use Workspace
impersonation. The service account must have domain-wide delegation enabled and
must be authorized in Google Workspace Admin for these scopes:

- `https://www.googleapis.com/auth/drive`
- `https://www.googleapis.com/auth/spreadsheets`

OAuth token support remains available for local tooling and emergency fallback,
but production uploads should not use the raw service account because service
accounts do not have personal Drive storage quota.

## First deploy

Set shell variables:

```bash
export PROJECT_ID="western-trees-495213-h1"
export REGION="europe-west2"
export REPOSITORY="authorloom"
export IMAGE="authorloom-factory"
export SERVICE="authorloom-factory-worker"
```

Authenticate and select the project:

```bash
gcloud auth login
gcloud config set project "$PROJECT_ID"
```

Enable APIs:

```bash
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com \
  iamcredentials.googleapis.com
```

Create Artifact Registry:

```bash
gcloud artifacts repositories create "$REPOSITORY" \
  --repository-format=docker \
  --location="$REGION" \
  --description="Authorloom container images"
```

Build and push:

```bash
gcloud builds submit \
  --tag "$REGION-docker.pkg.dev/$PROJECT_ID/$REPOSITORY/$IMAGE:latest"
```

Deploy the worker:

```bash
gcloud run deploy "$SERVICE" \
  --image "$REGION-docker.pkg.dev/$PROJECT_ID/$REPOSITORY/$IMAGE:latest" \
  --region "$REGION" \
  --no-allow-unauthenticated \
  --min-instances 1 \
  --max-instances 3 \
  --cpu 2 \
  --memory 4Gi \
  --timeout 3600 \
  --no-cpu-throttling \
  --set-env-vars NODE_ENV=production,GOOGLE_FACTORY_IMPERSONATE_WORKSPACE=true,GOOGLE_WORKSPACE_IMPERSONATE_EMAIL=admin@authorloom.com,GOOGLE_FACTORY_PREFER_OAUTH_WRITES=false,AUTHORLOOM_WORKER_POLL_MS=5000 \
  --set-secrets AUTHORLOOM_CONVEX_URL=AUTHORLOOM_CONVEX_URL:latest,AUTHORLOOM_WORKER_SECRET=AUTHORLOOM_WORKER_SECRET:latest,GOOGLE_CLIENT_EMAIL=GOOGLE_CLIENT_EMAIL:latest,GOOGLE_PRIVATE_KEY=GOOGLE_PRIVATE_KEY:latest,GOOGLE_PROJECT_ID=GOOGLE_PROJECT_ID:latest,GOOGLE_OAUTH_CLIENT_ID=GOOGLE_OAUTH_CLIENT_ID:latest,GOOGLE_OAUTH_CLIENT_SECRET=GOOGLE_OAUTH_CLIENT_SECRET:latest,GOOGLE_OAUTH_TOKEN_JSON=GOOGLE_OAUTH_TOKEN_JSON:latest
```

Cloud Run services normally serve HTTP traffic. The worker exposes a lightweight
health endpoint at `/healthz` so Cloud Run can keep the container alive while the
background polling loop does the real work.

## Scaling notes

Start with `--max-instances 1` or `3`. Increase only after confirming:

- Drive/GCS upload quotas are healthy.
- Convex claim locks prevent duplicate rendering.
- Average render time and memory use are known.
- Output QA passes for the active layouts.

## Preview storage direction

For better author previews, the next architecture step is:

1. Upload freshly rendered files to a private GCS preview bucket.
2. Serve previews through signed URLs or a web-app proxy route.
3. Let authors approve/reject individual videos or whole batches.
4. On approval, copy/upload approved videos to the author's Drive campaign
   folder and create the spreadsheet export.
5. Delete preview objects according to a short retention policy.

That removes the unreliable Google Drive preview modal from the QA path without
making the Mac mini part of production.
