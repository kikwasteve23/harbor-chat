# Harbor Chat

Realtime group chat for the Harbor community. Rooms stay populated (70+ online), members show as names, and conversation state lives in Postgres when you deploy.

## Local development

```bash
cp .env.example .env.local
npm install
npm run seed:excel
npm test
npm run dev
```

Open [http://localhost:43147](http://localhost:43147).

| Role | Email | Password |
| --- | --- | --- |
| Member | `demo@harbor.local` | `demo-dev-only` |
| Admin | `admin@harbor.local` | `admin-dev-only` |

Without `DATABASE_URL`, data is stored in `data/store.json`.

## Render + PostgreSQL

1. Push this repo to GitHub (`kikwasteve23/harbor-chat`).
2. In [Render](https://dashboard.render.com): **New → PostgreSQL**. Copy the **Internal Database URL**.
3. **New → Web Service** from this repo (or apply `render.yaml`).
   - Build: `npm ci && npm run build`
   - Start: `npm start`
   - Instance: Node 22
4. Set environment variables:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Render Postgres URL |
| `DATA_BACKEND` | `postgres` |
| `APP_SECRET` | long random string |
| `APP_URL` | `https://your-service.onrender.com` |
| `AI_PROVIDER` | `mock` (or `openai` + `AI_API_KEY`) |
| `DEMO_ADMIN_PASSWORD` | your admin password |
| `DEMO_USER_PASSWORD` | optional demo user |

On boot the app runs `db/schema.sql`, then seeds rooms and the persona pool if the database is empty. Health check: `/api/health`.

Postgres holds:

- `app_state` — full application state (source of truth)
- `profiles`, `rooms`, `messages`, `room_conversation_state`, and related tables — queryable copies

## Environment

See `.env.example`. Never commit real credentials.

## Tests

```bash
npm test
```
