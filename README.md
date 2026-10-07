# StudySensei

An AI learning platform. Create a skill you want to learn, upload your own
material, and get a mentor that answers from your documents, quizzes generated
from them, a roadmap you can tick off, and coding challenges graded in a sandbox.

**Stack:** Next.js 16 (App Router) · TypeScript · Supabase (Auth, Postgres, Storage) ·
pgvector · LangChain · Google Gemini · Judge0

## Features

| Feature | What it does |
|---|---|
| **AI mentor** | Streams answers grounded in your uploaded documents, with numbered citations to file and page. Three modes: explain, coach (guides with questions instead of giving answers) and plan. Remembers the conversation and resumes it when you return. |
| **Document-based learning (RAG)** | Upload PDF, TXT or MD. Text is extracted per page, split into chunks, embedded with Gemini and stored in Postgres with pgvector. Questions retrieve the most relevant chunks for that skill. |
| **Quizzes** | Multiple-choice quizzes generated from your documents. Graded on the server: the browser never receives the answer key. |
| **Roadmaps** | A phased plan tailored to your goal and material, stored as tasks you tick off, with per-phase and overall progress. |
| **Coding challenges** | Generated problems with visible and hidden test cases. Submissions run in an isolated sandbox under time, memory and network limits. |
| **Progress** | Quizzes taken, share of questions correct, challenges solved, roadmap progress. |

## Architecture

```
Browser (React client components)
   │  session cookie                       │ direct upload (signed-in user's own folder)
   ▼                                       ▼
Next.js server                          Supabase Storage (private bucket)
 ├─ src/proxy.ts            refreshes the session; redirects signed-out visitors
 ├─ src/app/api/**          route handlers: auth, validation (zod), rate limit
 └─ src/server/**           domain services
      ├─ rag/               extract → chunk → embed → store; retriever
      ├─ mentor/            prompts, context building, streaming turn
      ├─ learning/          quiz, roadmap, analytics
      ├─ coding/            challenge generation, grading
      ├─ sandbox/           CodeExecutor interface + Judge0 / Piston / mock
      ├─ ai/                model factory, configuration
      └─ security/, auth/, db/, observability/
   │                                   │                         │
   ▼                                   ▼                         ▼
Supabase Postgres + pgvector      Google Gemini             Judge0 sandbox
(row level security on            (chat + embeddings)       (untrusted code)
 every table)
```

Two rules shape the code:

1. **The server acts as the signed-in user.** Route handlers use a Supabase
   client carrying the user's session, so row level security applies to every
   query. A user id is never accepted from a request body.
2. **The service-role key is used only where the user must not have the access
   themselves:** reading hidden test cases for grading, and writing challenges,
   graded submissions and progress records. It lives in `src/server/db/admin.ts`.

### The RAG pipeline

`upload → extract → chunk → embed → pgvector → retrieve → prompt → Gemini`

| Stage | Where | Detail |
|---|---|---|
| Upload | browser → Storage, then `api/documents/upload` | File goes straight to a private bucket; the server registers it |
| Extract | `server/rag/extract.ts` | Per-page PDF text (`unpdf`); plain decode for text files |
| Chunk | `server/rag/chunk.ts` | LangChain `RecursiveCharacterTextSplitter`, 1,000 characters with 150 overlap, split per page so each chunk has a page number |
| Embed | `server/rag/embeddings.ts` | `gemini-embedding-001` at 768 dimensions, with separate task types for documents and queries |
| Store | `document_chunks` | `vector(768)` column with an HNSW cosine index |
| Retrieve | `server/rag/retriever.ts` → `match_chunks()` | A LangChain retriever over a SQL function that runs as the caller; scoped to one skill, with a similarity threshold |
| Answer | `server/mentor/` | Numbered excerpts go into the prompt; the model cites them and says so when they do not cover the question |

Follow-up questions are rewritten into a standalone search query before
retrieval, and only sources the answer actually cites are shown and stored.

### Coding evaluation

The application talks only to the `CodeExecutor` interface
(`src/server/sandbox/types.ts`). Providers are swapped with an environment
variable:

| `SANDBOX_PROVIDER` | Notes |
|---|---|
| `judge0` (default) | Defaults to the public Community Edition instance; set `JUDGE0_URL` / `JUDGE0_API_KEY` for your own |
| `piston` | For a self-hosted Piston instance (`PISTON_URL`) |
| `mock` | Runs nothing; for tests and UI work. Refused in production |

Generated challenges are validated before they are stored: the model writes a
reference solution and test inputs, and the expected outputs are produced by
running that solution in the sandbox. Worked examples in the problem statement
come from those verified runs.

## Getting started

### Prerequisites

- Node.js 22 or newer
- A [Supabase](https://supabase.com) project
- A [Gemini API key](https://aistudio.google.com/apikey)

### 1. Install

```bash
npm ci
```

### 2. Configure

```bash
cp env.template .env.local
```

Fill in `.env.local`. `env.template` documents every variable. The two secrets
(`SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_API_KEY`) must never get a `NEXT_PUBLIC_`
prefix.

### 3. Set up the database

Run the files in `supabase/migrations/` **in order** in the Supabase SQL editor.

| File | Purpose |
|---|---|
| `0000_baseline.sql` | The original schema. **New projects only**: skip it if your project already has these tables |
| `0001`, `0002` | Row level security on every table; private storage bucket |
| `0003` | Schema corrections, pgvector HNSW index, `match_chunks()` |
| `0004` | Server-side quiz grading |
| `0005` | Coding challenge integrity |
| `0006` | Rate limiting and input length limits |
| `0007` | Storage size and type limits |

On a new project, also enable the `vector` extension (the baseline does this)
and, under Authentication, enable the Email and Google providers and add
`http://localhost:3000/auth/callback` to the redirect allow-list.

### 4. Run

```bash
npm run dev
```

Open <http://localhost:3000>.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, no emit |
| `npm test` | Unit and database tests (Vitest) |
| `npm run test:e2e` | Browser tests (Playwright) |

## Testing

- **Database tests** (`tests/db`) start an embedded Postgres with pgvector,
  replay every migration, and check data migration, access rules for signed-out
  visitors and for two different users, vector search isolation, quiz grading,
  coding integrity, rate limits and length limits. No external services needed.
- **Unit tests** (`tests/unit`) cover extraction, chunking, grading, citation
  handling, the sandbox adapters (against scripted servers), the cross-site
  guard, the rate-limit helper and the streaming API client.
- **Browser tests** (`tests/e2e`) cover the signed-out flows. The signed-in
  journey needs a dedicated test account:
  `E2E_EMAIL=... E2E_PASSWORD=... npm run test:e2e`.
- **Live sandbox test**: `RUN_LIVE_TESTS=1 npm test` runs real programs on Judge0.

CI (`.github/workflows/ci.yml`) runs lint, type-check, tests, a build and the
signed-out browser tests.

To regenerate database types after a schema change:

```bash
npx supabase gen types typescript --project-id <project-ref> --schema public > src/server/db/database.types.ts
```

## Security model

- **Row level security on every table.** Signed-out visitors can read nothing;
  a user can read only their own rows. Child tables are authorised through
  their parent.
- **Answer keys stay on the server.** Quiz answers and hidden test cases are
  not readable by the browser, even by their owner. Quiz grading happens in a
  database function; code grading on the server.
- **Results cannot be forged.** Quiz scores, submissions and progress records
  are read-only for clients.
- **Private storage.** Files live under `{user_id}/{skill_id}/` in a private
  bucket with size and type limits; only the owner can read or write them.
- **Rate limits** per user on every endpoint that costs model or sandbox time,
  counted atomically in the database.
- **Cross-site requests** that change state are refused by the API.
- **Browser protections:** Content Security Policy, no remote images, HSTS,
  `nosniff`, restricted permissions.
- **Untrusted content.** Uploaded documents are treated as reference material
  in prompts, never as instructions. Model output is rendered without raw HTML
  or images.
- **Untrusted code** never runs in the app process; it goes to the sandbox with
  CPU, wall-clock and memory limits and networking disabled.

## Deployment

### Vercel

1. Import the repository.
2. Set the environment variables from `env.template` (all environments).
3. Add your production URL plus `/auth/callback` to the Supabase redirect allow-list.

Uploads go directly from the browser to Supabase Storage, so the platform's
request-size limit does not apply to documents. Document processing and code
evaluation are long-running requests; check your plan's function duration limit
against `maxDuration` in the route handlers (up to 300 seconds for processing).

### Docker

```bash
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=... \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
  -t studysensei .

docker run -p 3000:3000 \
  -e SUPABASE_SERVICE_ROLE_KEY=... \
  -e GOOGLE_API_KEY=... \
  studysensei
```

The image runs the standalone server as an unprivileged user. Secrets are
passed at run time, not baked into the image.

### Health check

`GET /api/health` returns `200` when the required configuration is present and
`503` naming what is missing. It reports presence only, never values, and calls
no external service.

### Monitoring

Server errors are logged as one JSON object per line. `src/instrumentation.ts`
receives every server-side error and is the place to forward them to a
monitoring service.

## Known limitations

- **Public sandbox by default.** The default Judge0 instance is shared, rate
  limited, and operated by a third party. Use your own for real traffic.
- **Free-tier model limits.** Gemini's free tier allows 100 embedding items per
  minute, so long documents take several minutes to process.
- **Scanned PDFs are not supported.** There is no OCR; image-only documents
  fail with a clear message.
- **Roadmap tasks are ticked off manually.** Finishing a quiz or challenge does
  not complete the matching task automatically.
- **One coding challenge at a time** per skill is shown in the editor.
- **Inline scripts are allowed by the Content Security Policy.** Removing that
  needs per-request nonces.
- **Rate limits use fixed windows** and apply per signed-in user; sign-up and
  sign-in rely on Supabase's own limits.

## Project structure

```
src/
  app/                 pages and API route handlers
  components/          shared UI
  lib/                 code shared by browser and server (API client, types)
  server/              server-only services (see Architecture)
  proxy.ts             session refresh and route protection
  instrumentation.ts   server error hook
supabase/migrations/   schema, policies and functions, in order
tests/                 unit, database, browser and live tests
```
