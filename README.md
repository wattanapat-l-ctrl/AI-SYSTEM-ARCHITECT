# AI System Architect

A collaborative workspace for designing software architecture: draw C4 and
infrastructure diagrams, design the Web API contract, cost out the tech stack,
record the decisions, get a scored design review, and export living
documentation.

Built with Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 and
Supabase (Postgres + Auth + Row Level Security).

## Features

| Module | Route | What it does |
| --- | --- | --- |
| Architecture Designer | `/projects/[id]/architecture` | React Flow canvas with 18 component types, custom edge labels, 6 diagram kinds (C4 context/container/component, infrastructure, data flow, deployment), immutable version history, restore, JSON import/export, autosave. |
| Web API Designer | `/projects/[id]/api` | OpenAPI operations with params, request bodies, responses and errors; live OpenAPI 3.1 output, TypeScript client, cURL commands, mock server, Postman collection import, quality checks. |
| Tech Stack & Cost | `/projects/[id]/stack` | Pick managed services from the seeded catalog, size them, and get a monthly/annual estimate with category shares, top drivers and stated assumptions. |
| Decisions (ADR) | `/projects/[id]/decisions` | Numbered architecture decision records with context, decision, consequences, alternatives, tags and status lifecycle. |
| AI Review | `/projects/[id]/review` | Scored design review (0–100) with severity-ranked findings. Uses an OpenAI-compatible model when `OPENAI_API_KEY` is set, otherwise a built-in rules analyzer. |
| Documentation | `/projects/[id]/docs` | Generate architecture, API, decision and cost documents from live project data; export as Markdown or PDF. |

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure the environment

```bash
cp .env.local.example .env.local
```

Then fill in `.env.local`:

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Your Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | Public/anon key. Safe in the browser; RLS is the boundary. |
| `SUPABASE_SECRET_KEY` | yes | Service-role/secret key. **Server side only.** Used for `auth.admin` calls such as member invites. |
| `OPENAI_API_KEY` | no | Enables model-based architecture reviews. Without it the offline rules engine is used. |
| `OPENAI_BASE_URL` | no | Point at any OpenAI-compatible gateway. Defaults to `https://api.openai.com/v1`. |
| `OPENAI_MODEL` | no | Defaults to `gpt-4o-mini`. |

> `.env*` is git-ignored. Never commit `SUPABASE_SECRET_KEY`, and never prefix
> it with `NEXT_PUBLIC_`.

### 3. Create the database schema

Open the Supabase dashboard → **SQL Editor** → paste the whole of
[`supabase/schema.sql`](supabase/schema.sql) → **Run**.

The script is idempotent (`create table if not exists`, `create or replace
function`, `drop policy if exists`), so it is safe to re-run after edits. It
creates:

- 13 tables: `profiles`, `projects`, `project_members`, `diagrams`,
  `diagram_versions`, `api_specs`, `api_endpoints`, `service_catalog`,
  `service_selections`, `adrs`, `ai_reviews`, `documents`, `activity_logs`
- 10 enums: `app_role`, `project_status`, `diagram_kind`, `node_kind`,
  `node_layer`, `http_method`, `api_auth_type`, `adr_status`, `service_category`
  and `review_severity`
- A 34-row service catalog seed used by the cost planner
- `my_projects()` and `project_role()` helper functions
- Row Level Security on every user-facing table

### 4. Run it

```bash
npm run dev
```

Open <http://localhost:3000>, sign up, create a project, and add teammates from
**Settings → Members**.

## Scripts

```bash
npm run dev        # dev server (Turbopack)
npm run build      # production build
npm start          # serve the production build
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
```

## Architecture notes

### Auth and authorization

- Supabase Auth with email confirmation; `src/proxy.ts` refreshes the session on
  every request. **Next 16 renamed `middleware.ts` to `proxy.ts`** — this is not
  a custom convention.
- Authorization is enforced twice, deliberately:
  1. **RLS** in Postgres, so a compromised client still cannot read other
     projects' rows.
  2. **`requireProjectAccess()`** in `src/lib/auth.ts` at the top of every
     server action, which resolves the caller's role (`owner` / `admin` /
     `editor` / `viewer`) for that specific project.
- `project_role()` only trusts `project_members`, the project owner, or a
  platform admin. It deliberately has **no global viewer/editor fallback**, so
  membership cannot be widened by accident.
- A `projects_protect_owner` trigger blocks direct updates to `owner_id`.
- Deleting a diagram version goes through the platform key because
  `diagram_versions` has no DELETE policy. Since that key bypasses RLS, the
  action first proves the diagram belongs to the authorised project, proves the
  version belongs to that diagram, and refuses to delete the last remaining
  version.

### Data flow

Server actions (`src/app/actions/`) own every mutation. They validate with Zod,
authorize, write, and `revalidatePath` the affected route. Client components
receive already-authorized data as props and call actions through
`useActionState`, so no client component ever queries Supabase directly for
writes.

### Diagram data shape

Nodes and edges are persisted in the shape React Flow uses, with component
metadata under `data`:

```jsonc
{
  "id": "n1",
  "position": { "x": 120, "y": 80 },
  "data": { "kind": "service", "layer": "application", "label": "Orders API" }
}
```

`toGraph()` in `src/components/diagram/canvas.tsx` normalises untrusted stored
JSON before it reaches the canvas, so a hand-edited import cannot crash the
editor.

### Reviews without an API key

`runArchitectureReviewAction` always produces a review. With `OPENAI_API_KEY` it
asks the model for strict JSON (validated with Zod before use) and falls back to
`analyzeArchitecture()` if the key is missing, the request fails, or the model
returns malformed JSON. The `engine` column records which path ran.

## Project layout

```
src/
  app/
    actions/        server actions: auth + projects, diagrams, api, planning, review
    projects/[id]/  per-project routes, one folder per module
  components/
    diagram/        architecture canvas, inspectors, version history
    api/            API workspace and dialogs
    stack/          tech stack and cost planner
    adr/            decision log
    review/         review workspace
    docs/           documentation workspace
    ui.tsx          shared design system
  lib/
    analysis.ts     rules-based architecture analyzer
    codegen.ts      TypeScript client, cURL, mock server
    cost.ts         cost model and insights
    docs.ts         markdown document generators
    openapi.ts      OpenAPI builder, Postman parser, quality checks
    pdf.ts          markdown → PDF renderer (jsPDF)
supabase/schema.sql full database schema, RLS and seed data
```

## Known limitations

- Email confirmation and password reset require Supabase email templates to be
  configured in the dashboard.
- Cost figures are estimates from a static seeded catalog with no live pricing
  feed; treat them as a planning aid, not a quote.
- Reviews analyse the newest saved version of each diagram, so unsaved canvas
  edits are not included until you save a version.
