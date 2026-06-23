# AGENTS.md — NovaTech Assistant

> Constitution do projeto. Todo agente de IA (Copilot, Claude Code) lê este arquivo antes de gerar qualquer artefato.
> As seções abaixo são preenchidas por papéis diferentes nos exercícios do Cenário 2.

## Project Overview

NovaTech Assistant is a corporate RAG (Retrieval-Augmented Generation) system that answers operator questions about SLA, freight, returns, and compliance using NovaTech's internal document base.

- **Users:** NovaTech internal operators
- **Primary channel:** Microsoft Teams bot (Adaptive Cards); secondary: web panel (`src/web/`)
- **Data flow:** operator question → Azure AI Search (vector retrieval) → Azure OpenAI (LLM completion) → structured response
- **Feedback loop:** operator ratings stored in Cosmos DB and used to improve retrieval quality
- **Document authority:** when two documents conflict, the one with the most recent `vigency` metadata wins (ADR-0003)

## Tech Stack & Architecture

### Runtime & Language
- TypeScript 5.5+ with `strict: true` — **never** disable strict flags
- Node.js with `"type": "module"` (ES Modules); **never** use `require()`
- Azure Functions v4 with HTTP triggers (`src/functions/`)

### Services & Infrastructure
| Concern | Service |
|---|---|
| Vector retrieval | Azure AI Search |
| LLM completions | Azure OpenAI |
| State & feedback | Cosmos DB |
| IaC | Azure Bicep (`infra/`) |
| CI/CD | GitHub Actions (`.github/workflows/`) |

### Key Libraries
- **Zod 3.x** — must validate every external input and output boundary; never trust raw request bodies
- **Vitest 2.x** — all tests; never use Jest or other test runners
- **pino** — all structured logging; **never** use `console.log`, `console.error`, or `console.warn` anywhere in `src/`

### Context Management Rules (ADR-0002)

Every query pipeline implementation must respect these token budgets and retrieval rules. Violations cause cost overruns and unpredictable LLM behavior.

**Token budget per query — hard cap: 8,000 tokens**

| Slot | Budget |
|---|---|
| System prompt | 800 tokens |
| User question | 200 tokens |
| Conversation history | 1,500 tokens |
| Retrieved chunks | 5,500 tokens |

**Retrieval rules**
- Always retrieve exactly **5 chunks**, each capped at **1,000 tokens**
- Chunks exceeding 1,000 tokens must be subdivided at indexing time with **10% overlap** between adjacent chunks
- Never pass raw documents; always pass pre-chunked, size-validated slices

**Multi-domain diversification**
- Detect domains via keywords: `SLA`, `Frete`, `Devolução`, `Compliance`
- If two or more domains are detected: enforce **minimum 1 chunk per detected domain** within the 5 available slots
- If no domain is detected: use pure semantic search with no diversification constraint

**Conversation history — sliding window**
- Always preserve the **first Q&A pair** as a context anchor (never evict it)
- Plus the **last 2 Q&A pairs** (excluding the first)
- Maximum: 3 pairs ≈ 1,500 tokens of history at any point
- Session reset trigger: user sends `"nova consulta"` or `"mudar assunto"` → discard all history immediately

## Coding Standards

### TypeScript
- Always enable `strict: true`; never use `any` — use `unknown` and narrow explicitly
- Prefer `type` over `interface` for data shapes; use `interface` only for extension contracts
- All public function signatures must have explicit return types
- Never use non-null assertion (`!`) without a comment explaining the invariant

### Validation
- Zod schemas live alongside the boundary they guard (e.g., next to the Function handler, not in `shared/`)
- Always call `.parse()` (throws) at entry points; use `.safeParse()` only when the failure path is handled inline

### Logging
- Always log with pino context fields: `{ requestId, userId, module }`
- Log at `info` for normal flow, `warn` for recoverable anomalies, `error` for failures with stack traces
- Never log PII (names, emails, document content) — log IDs only

### Modules & Boundaries
- `src/shared/` contains types and utilities with **zero side effects** — no Azure SDK calls, no I/O
- `src/services/` owns all external service integration; Functions must not call Azure SDKs directly
- Circular dependencies between modules are forbidden

### Commits
- Must follow Conventional Commits: `feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:`
- Subject line: imperative mood, under 72 characters, no period at the end
- Breaking changes: append `!` to the type and add a `BREAKING CHANGE:` footer

### Branch Strategy (local phase)
- Create a feature branch per task: `feat/<short-description>` or `fix/<short-description>`
- "Opening a PR" means creating `docs/pull-requests/PR-NNNN.md` with: objective, list of changes, and validation checklist
- Never commit directly to `main`

## Product Rules & Guardrails (Product Specialist)
<!-- TODO (Product Specialist — Ex. 2.3) -->

## Testing Standards (QA)
<!-- TODO (QA — Ex. 2.1) -->

## Project Management Rules (Delivery Manager)
<!-- TODO (Delivery Manager — Ex. 2.3) -->

## Build & Deploy

### Local Build
```bash
npm run lint       # eslint .
npm run build      # tsc -p .
npm test           # vitest run
```

All three commands must pass before any PR is considered ready. Run them in this order — a lint failure does not require a build attempt.

### CI Pipeline (`.github/workflows/ci.yml`)
Gates run in strict sequence; a failing gate aborts the pipeline:

1. `lint` — ESLint, zero warnings allowed (`--max-warnings 0`)
2. `build` — `tsc -p .` with no type errors
3. `test:unit` — Vitest unit tests under `tests/` (excluding `integration/` and `e2e/`)
4. `test:integration` — Vitest integration tests under `tests/integration/`

### CD Pipeline (`.github/workflows/cd.yml`)
- Triggers on merge to `main` only
- Deploy sequence: **staging** → smoke test → **production**
- Never deploy directly to production; staging gate is mandatory
- Infrastructure changes (`infra/**`) must be applied via `az deployment` in the pipeline — never run `az` commands manually in production

### Infrastructure
- All Azure resources are defined in `infra/` as Bicep files — never create resources via the portal
- Environment-specific parameters live in `infra/parameters.<env>.json`
