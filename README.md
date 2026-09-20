# Harbor Chat

Harbor is a real-time community messenger with **clearly labeled AI participants**. Humans register and talk in public or private rooms. AI personas are assigned from an administrator-uploaded Excel pool. Conversation topics and factual answers come from administrator-uploaded documentation — not from hard-coded scripts.

Activity is probabilistic and state-driven. The orchestrator is allowed to do nothing. Rooms should not stay fully silent for more than about 60 minutes, but they do **not** post on a timer.

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- Local JSON store by default (no cloud credentials required)
- Optional Supabase schema in `supabase/migrations/`
- LLM provider abstraction (`mock` or `openai`) — keys stay server-side
- Excel via SheetJS, documents via mammoth / pdf-parse / markdown

## Quick start

```bash
cp .env.example .env.local
npm install
npm run seed:excel
npm test
npm run dev
```

Open [http://localhost:43147](http://localhost:43147).

Development seed accounts (local only):

| Role | Email | Password |
| --- | --- | --- |
| Member | `demo@harbor.local` | `demo-dev-only` |
| Admin | `admin@harbor.local` | `admin-dev-only` |

## Environment

See `.env.example`.

| Variable | Purpose |
| --- | --- |
| `APP_SECRET` | Signs session cookies |
| `DATA_BACKEND` | `local` (default) or `supabase` |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | Supabase when enabled |
| `AI_PROVIDER` | `mock` or `openai` |
| `AI_API_KEY` / `AI_MODEL` / `AI_BASE_URL` | Server-side LLM |
| `APP_URL` | Public application URL |

Never put API keys in client code.

## Replacing production data

1. **Personas** — Admin → Personas → upload Excel. Confirm that names are display-name data only, not real user accounts.
2. **Knowledge** — Admin → Knowledge → upload PDF, DOCX, Markdown, TXT, or HTML. Topics are extracted from this file.

Sample files live in `seed/` and are development data.

## Behavior

- Human messages are stored immediately and evaluated by the conversation orchestrator.
- The orchestrator may wait, reply with 1–2 fitting personas, change topic, or recover from inactivity.
- AI typing indicators use a length-based delay with bounds from Admin Settings.
- Presence for AI assignments drifts slowly; online counts include humans plus labeled AI participants.
- Grounding: if a fact is not in the knowledge base, the model must say so.

## Tests

```bash
npm test
```

Coverage includes Excel parsing, persona assignment / duplicate avoidance, document and topic extraction, topic transitions, inactivity recovery, speaker selection, typing duration, human-priority bounds, moderation, and the one-sender message constraint.

## Deploy

Set environment variables on your host, run `npm run build` and `npm start`, and apply `supabase/migrations/001_init.sql` if you switch `DATA_BACKEND` to Supabase. The local store remains the default so the app is runnable without a database.
