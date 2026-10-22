# Lost & Found

A campus-only, peer-to-peer lost & found app. Users post lost or found items (photo and/or
description), and an AI matching pipeline surfaces likely matches by comparing vector
embeddings. When both parties agree on a match, contact is exchanged via campus email.

Full requirements, architecture decisions, and security design: see
[`LostnFound.md`](./LostnFound.md). Planning history and debugging devlog: see
[`lost-and-found-app-log.md`](./lost-and-found-app-log.md).

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React Native + TypeScript, via Expo |
| Backend / DB | Supabase (Postgres, Auth, Storage, Row Level Security) |
| Vector search | pgvector |
| Embeddings | Hosted CLIP/SigLIP endpoint, called server-side from an Edge Function (planned) |

## Budget

**$0 until the MVP works end to end.** Don't sign up for anything paid (domains, app store accounts,
model hosting) before then. Free substitutes are listed in [`LostnFound.md`](./LostnFound.md) (v0.6.1
changelog).

## Prerequisites

- **Node.js LTS** (currently 24.x) — install via [nvm](https://github.com/nvm-sh/nvm), not
  Homebrew or the official installer, so the project's Node version can be pinned per-project
- **Git**
- **[Expo Go](https://expo.dev/go)** app installed on your phone, for testing the app live
  without a full native build
- Access to the project's Supabase account — ask a teammate for an invite; credentials are
  never committed to this repo (see Environment Variables below)

## Getting started

```bash
git clone https://github.com/Ethan2goat/Lostnfound.git
cd Lostnfound/frontend
npm install
```

Set up your environment variables (see next section), then start the dev server:

```bash
npm start
```

Scan the QR code that appears with the Expo Go app on your phone. The app will hot-reload as
you edit files.

## Environment variables

Create a `.env` file inside `frontend/` (already covered by `.gitignore` — never commit this
file):

```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

Get the real values from **Project Settings → API** in the Supabase dashboard (ask a teammate
for project access first), or ask a teammate to send them to you directly — never through a
commit or a public channel. Use the **Project URL** shown on that page
(`https://[ref].supabase.co`), not the dashboard page URL in your browser's address bar — the
two look similar but only one is the real API endpoint.

## Supabase CLI (optional — for schema and type work)

Only needed if you're changing the database schema or regenerating types:

```bash
npx supabase login
npx supabase gen types typescript --project-id "<project-ref>" --schema public > src/types/database.ts
```

Regenerate types any time the schema changes — there's no automatic sync, it's a manual
command run on demand.

## Project structure

```
Lostandfound/
├── frontend/                    # React Native (Expo) app — everything below is app code
│   └── src/
│       ├── app/                   # screens (Expo Router file-based routing)
│       ├── components/
│       ├── context/                # AuthContext, etc. — shared app-wide state
│       ├── lib/
│       │   └── supabase.ts          # Supabase client setup — import from here, don't
│       │                            # re-instantiate the client elsewhere
│       └── types/
│           └── database.ts          # generated from the live schema — don't hand-edit,
│                                     # regenerate instead (see above)
├── supabase/                    # Supabase CLI config, migrations, tests, Edge Functions
├── LostnFound.md                 # requirements, architecture, security design (v0.6)
├── lost-and-found-app-log.md      # planning log + devlog
├── lostnfound-schema-notes.md     # historical schema snapshot (migrations are the source of truth)
└── TODOS.md                       # deferred work
```

## Git workflow

- `main` stays deployable — no direct commits once a feature is in progress
- One branch per feature: `git checkout -b feature/your-feature-name`
- Naming convention: `feature/`, `bugfix/`, `refactor/`
- Merge back to `main` when a feature is working, then delete the branch
- Every change goes through a pull request: green CI (pgTAP RLS suite + ranking tests) plus one
  approval from the other contributor
- Schema changes are migration files in `supabase/migrations/`. Never edit the schema by hand in the
  Supabase dashboard.
- Merges to `main` deploy automatically to the **staging** Supabase project. Production deploys are a
  manual GitHub Actions run (`workflow_dispatch`).

## Troubleshooting

- **`command not found: node` / `npm`** — Node isn't installed, or your terminal hasn't picked
  up `nvm`'s shell changes yet. Restart your terminal or run `source ~/.zshrc`.
- **`Unexpected token '<', "<!DOCTYPE "... is not valid JSON`** — usually means
  `EXPO_PUBLIC_SUPABASE_URL` is set to the dashboard page URL instead of the real API URL. See
  Environment Variables above.
- **A new column/table isn't showing up in `database.ts`** — regenerate types; they don't
  update automatically when the schema changes.