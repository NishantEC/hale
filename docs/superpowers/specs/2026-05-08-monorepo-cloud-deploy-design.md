# Monorepo + Cloud Run deployment design

**Date:** 2026-05-08
**Status:** Approved (auto-mode execution)

## Goal

Stop relying on local backend + ad-hoc ngrok tunnels. Get the noop backend and inspector hosted with stable URLs so:

1. The mobile app can reach a real backend without restarting tunnels.
2. The inspector is accessible from anywhere to verify what data is syncing.
3. We have a one-push-to-deploy flow.

## Non-goals

- Hosting the React Native app (mobile, ships via EAS).
- Folding `app/` into the monorepo. App stays as its own repo.
- TypeORM migrations. Backend keeps `synchronize: true` for now.
- Authentication on Cloud Run service itself (`--allow-unauthenticated`); the backend's existing JWT middleware does request auth.
- Hosting the inspector on a CDN. Cloud Run + nginx for symmetry with backend workflow.

## Architecture

### Repo

Top-level `noop/` becomes a pnpm + turbo monorepo, pushed to `NishantEC/noop` (private GitHub repo).

```
noop/
├── apps/
│   ├── backend/        ← git mv from /backend
│   └── inspector/      ← git mv from /inspector
├── packages/
│   └── typescript-config/
├── docs/, resource/, resources/   (root, unchanged)
├── app/, app-old/                 (root, untouched, ignored by workspace globs)
├── .github/workflows/
│   ├── deploy-backend.yml
│   └── deploy-inspector.yml
├── pnpm-workspace.yaml
├── turbo.json
├── .npmrc                  (node-linker=hoisted)
├── .dockerignore
└── package.json
```

Pattern copied from `/Users/nish/Documents/hushbacks` (pnpm@10.2.0 + turbo@2 + per-app Dockerfile using `turbo prune --docker`).

### Cloud topology

| Resource | Value |
|---|---|
| GCP project | `flashckard` |
| Region | `us-central1` |
| Artifact Registry | `us-central1-docker.pkg.dev/flashckard/noop` |
| Cloud SQL | `noop-db` (Postgres 16, db-f1-micro) |
| Service account | `noop-cloud-run@flashckard.iam.gserviceaccount.com` |
| Secrets (Secret Manager) | `NOOP_DB_HOST`, `NOOP_DB_USER`, `NOOP_DB_PASSWORD`, `NOOP_DB_NAME`, `NOOP_JWT_SECRET` |
| Cloud Run service | `noop-backend` → `api.noop.enform.co` |
| Cloud Run service | `noop-inspector` → `noop.enform.co` |
| WIF | reuse hushbacks' provider; bind new SA for `NishantEC/noop` |

### Code changes

1. **`backend/src/config/database.config.ts`** — when `INSTANCE_CONNECTION_NAME` is set, use Cloud SQL Unix socket as `host`, drop `port`. Local dev unchanged.
2. **`backend/Dockerfile`** — replace single-stage build with hushbacks-style 4-stage (`base` → `pruner` → `builder` → `runner`) using `turbo prune --scope=backend --docker`.
3. **`inspector/Dockerfile`** — new: pnpm + vite build, serve `dist/` via `nginx:alpine` with SPA fallback. Build arg `VITE_API_BASE_URL` injected at build time.
4. **Root workspace files**: `pnpm-workspace.yaml`, `turbo.json`, `package.json`, `.npmrc`, `.dockerignore`.
5. **GitHub Actions**: `deploy-backend.yml` and `deploy-inspector.yml` — adapted from hushbacks with path filters, no migration job, trimmed secrets.

### App updates (post-deploy)

- `app/app/services/api/noopClient.ts` — change `DEFAULT_BASE_URL` from ngrok URL to `https://api.noop.enform.co`.
- `app/.env.example` updated; existing `EXPO_PUBLIC_API_BASE_URL` mechanism is preserved.

## Implementation phases

1. **Bootstrap monorepo locally**: `git mv` backend + inspector into `apps/`; add workspace files; verify `pnpm install`, `pnpm dev` work for each.
2. **Push to GitHub**: create `NishantEC/noop` private; push.
3. **GCP infra**: Artifact Registry + Cloud SQL + service account + IAM + secrets + WIF binding (sequential gcloud commands).
4. **GitHub Actions wiring**: workflows committed, repo secrets `WIF_PROVIDER` and `WIF_SERVICE_ACCOUNT` set.
5. **First deploy**: push to main, both workflows run, services land at `*.run.app` URLs.
6. **Domain mapping**: map custom domains in Cloud Run, output DNS instructions for enform.co.
7. **Smoke tests**: curl backend endpoints, load inspector in browser.
8. **App update**: switch `noopClient.ts` default base URL to `https://api.noop.enform.co`.

## Risks & open issues

- **DNS propagation** for `noop.enform.co` and `api.noop.enform.co` is out-of-band — the user controls enform.co DNS. We'll provide the records but won't apply them automatically. Until DNS resolves, the cloud run `*.run.app` URLs are the way to test.
- **`synchronize: true`** in production is unsafe long-term. Acceptable for prototype/personal use; flagged as follow-up.
- **EAS rebuild** required for app to pick up new default URL, OR user can set `EXPO_PUBLIC_API_BASE_URL` at runtime via dev client. We'll update the source default; rebuild scheduling is the user's call.
