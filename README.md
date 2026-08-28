# Shetkari Sathi

Project foundation only — no features yet. This sets up two independent apps
that talk to each other over HTTP:

```
shetkari-sathi/
├── backend/     Express + TypeScript + Prisma + PostgreSQL API
└── frontend/    Next.js (App Router) + TypeScript
```

## Prerequisites

- Node.js 18.18+ (Node 20 LTS recommended)
- A running PostgreSQL instance (local install, Docker, or a hosted DB)

## 1. Backend setup

```bash
cd backend
cp .env.example .env
# edit .env and set DATABASE_URL to your actual PostgreSQL connection string

npm install
npm run prisma:generate
npm run prisma:migrate      # creates the database schema (prompts for a migration name)
npm run dev                 # starts on http://localhost:5000
```

Verify it's working:

```bash
curl http://localhost:5000/api/v1/health
```

You should get `{"success":true,"data":{"status":"ok","database":"connected",...}}`.
If `database` shows `"unreachable"`, double-check `DATABASE_URL` and that
PostgreSQL is running.

## 2. Frontend setup

In a separate terminal:

```bash
cd frontend
cp .env.local.example .env.local

npm install
npm run dev                 # starts on http://localhost:3000
```

Open http://localhost:3000 — you should see the "Shetkari Sathi" placeholder page.

## Folder structure

### backend/src
- `config/` — env loading (`env.ts`) and the Prisma client singleton (`database.ts`)
- `routes/` — Express route definitions, mounted under `/api/v1`
- `controllers/` — request handlers
- `services/` — business logic (kept separate from controllers as features grow)
- `middlewares/` — `errorHandler.ts` (centralized error handling + `AppError`) and `notFound.ts`
- `utils/` — small shared helpers (currently just `logger.ts`)
- `types/` — shared TypeScript types
- `app.ts` — builds and configures the Express app (no `listen()` here, so it's testable)
- `server.ts` — starts the HTTP server and handles graceful shutdown

### backend/prisma
- `schema.prisma` — PostgreSQL datasource, `User`/`FarmerProfile` models, and
  the email-verification / password-reset token models.

### frontend
- `app/` — Next.js App Router pages/layouts
- `components/` — shared UI components (empty for now)
- `lib/` — `api.ts`, a thin fetch wrapper for calling the backend
- `types/` — shared TypeScript types

## Deployment

The two apps deploy independently: **frontend → Vercel**, **backend → Render**.
Deploy the backend first so you have its live URL to give to the frontend.

### Environment variables

**Backend (Render)** — set these under the service's "Environment" tab:

| Variable | Example / notes |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Connection string from your Render PostgreSQL instance (use the **Internal Database URL** if the DB is also on Render, in the same region) |
| `CORS_ORIGIN` | Your Vercel URL(s), comma-separated: `https://shetkari-sathi.vercel.app,https://shetkari-sathi-git-preview-yourteam.vercel.app` |
| `FRONTEND_URL` | Your Vercel production URL, e.g. `https://shetkari-sathi.vercel.app` |
| `JWT_SECRET` | A long random string — generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. Never reuse the local dev value. |
| `JWT_EXPIRES_IN` | `1d` (or your preferred value) |
| `EMAIL_PROVIDER` | `console` (no real provider is wired up yet) |
| `EMAIL_VERIFICATION_TOKEN_TTL_HOURS` | `24` |
| `EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS` | `60` |
| `PASSWORD_RESET_TOKEN_TTL_MINUTES` | `30` |
| `PORT` | Do **not** set this — Render injects it automatically and the app reads `process.env.PORT`. |

**Frontend (Vercel)** — set under Project Settings → Environment Variables:

| Variable | Example / notes |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | Your Render backend URL + `/api/v1`, e.g. `https://shetkari-sathi-backend.onrender.com/api/v1`. Required at **build time** since it's a `NEXT_PUBLIC_*` variable — set it before triggering the first deploy. |

Never commit real `.env` / `.env.local` files. Only the `.env.example` and
`.env.local.example` templates are tracked in git (see `.gitignore`).

### Render deployment steps (backend)

1. Push this repo to GitHub/GitLab.
2. In Render: **New + → PostgreSQL** → create a database (any region). Copy its
   **Internal Database URL** once it's provisioned.
3. In Render: **New + → Web Service** → connect the repo.
   - **Root Directory:** `backend`
   - **Runtime:** Node
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Health Check Path:** `/api/v1/health`
   - (Alternatively, use **New + → Blueprint** and point it at `render.yaml` in
     the repo root, which pre-fills the above.)
4. Add the backend environment variables listed above, using the database URL
   from step 2 for `DATABASE_URL`. Leave `CORS_ORIGIN`/`FRONTEND_URL` pointing
   at `http://localhost:3000` for now if the frontend isn't deployed yet —
   you'll update them in step 6.
5. Deploy. Render runs `npm install` (which triggers `prisma generate` via the
   `postinstall` script), then `npm run build` (compiles TypeScript), then
   `npm start`. Once live, run the database migration once against production,
   either via a Render **Shell** on the service or from your machine with
   `DATABASE_URL=<production-url> npm run prisma:migrate:deploy`.
6. Confirm `https://<your-service>.onrender.com/api/v1/health` returns
   `{"success":true,"data":{"status":"ok","database":"connected",...}}`.

### Vercel deployment steps (frontend)

1. In Vercel: **Add New → Project** → import the same repo.
2. **Root Directory:** `frontend` (Vercel auto-detects the Next.js framework preset).
3. Under **Environment Variables**, add `NEXT_PUBLIC_API_BASE_URL` set to your
   Render backend URL from above, with `/api/v1` appended. Add it for
   Production (and Preview, if you want preview deploys to hit the same API).
4. Deploy. Build command `next build` / output are handled by the Next.js preset.
5. Once deployed, copy the resulting Vercel URL(s) (production, and any preview
   domain pattern you use) back into the backend's `CORS_ORIGIN` and
   `FRONTEND_URL` on Render (step 4 above), then redeploy the backend so the
   new CORS rules take effect.

### Remaining manual configuration

- Generate a fresh `JWT_SECRET` for production — do not reuse the local one.
- Update `CORS_ORIGIN`/`FRONTEND_URL` on Render any time the Vercel URL changes
  (e.g. a new preview URL you want to allow).
- Run `npm run prisma:migrate:deploy` against the production database after
  each schema change (this repo doesn't run migrations automatically on deploy).
- `EMAIL_PROVIDER=console` only logs emails; wire up a real provider (SES,
  SendGrid, etc.) before relying on email verification/password reset in
  production.
- Render's free-tier web services spin down after inactivity, so the first
  request after idle time will be slow (cold start) — upgrade the plan if
  that's not acceptable.

## Notes

- Nothing here was built or `npm install`-ed inside the environment that
  generated this scaffold (no network/package-registry access there), so run
  `npm install` in both `backend/` and `frontend/` yourself and confirm both
  dev servers start cleanly before building on top of this.
- CORS is pre-configured on the backend to allow requests from
  `http://localhost:3000` by default; `CORS_ORIGIN` accepts a comma-separated
  list so both a Vercel production URL and preview URLs can be allowed at once
  (see `CORS_ORIGIN` in `backend/.env.example`).
