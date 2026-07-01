# Tarefa 1 — Criação do SKILL.md v1.0

**Arquivo de saída:** `cenario-2/novatech-assistant/skills/domain/azure-functions-endpoint.md`
**Versão:** 1.0.0

O conteúdo abaixo foi escrito como especificação executável seguindo o AGENTS.md do projeto. A skill foi posteriomente iterada para v1.1 após a avaliação da Tarefa 2 (documentado em `tarefa-3.md`).

---

```yaml
---
skill: azure-functions-endpoint
level: domain
version: 1.0.0
depends-on:
  - foundation/typescript-conventions
  - foundation/error-handling
  - foundation/project-structure
applies-when: "criando ou modificando um HTTP trigger em src/functions/"
---
```

## Contexto

Esta skill aplica-se toda vez que um agente recebe instrução do tipo "crie o endpoint X", "adicione um HTTP trigger para Y" ou "modifique o handler de Z em `src/functions/`". Um Azure Function HTTP trigger neste projeto é a camada exclusiva de recepção de requisições externas: valida o payload, delega a lógica de negócio para `src/services/`, e retorna a resposta formatada pelo `response-builder`. Functions NUNCA instanciam clientes Azure diretamente — toda integração com Azure AI Search, Azure OpenAI e Cosmos DB passa obrigatoriamente por `src/services/`, que é a única camada autorizada a importar pacotes `@azure/*`. Essa separação garante testabilidade via mocking da camada de services sem dependência de credenciais Azure em testes unitários.

## Estrutura de arquivos obrigatória

```
src/functions/<endpoint-name>/
├── handler.ts          — HTTP trigger: valida input, chama services, formata resposta
├── validator.ts        — schemas Zod de request e response
└── response-builder.ts — monta o objeto de resposta com source_document
```

- MUST: o nome da pasta é o slug do endpoint em kebab-case (ex: `query`, `feedback`, `health`)
- NEVER criar arquivos adicionais dentro de `src/functions/<endpoint-name>/` além dos três acima
- NEVER colocar lógica de negócio em `handler.ts` — toda transformação vai para `response-builder.ts`; toda chamada Azure vai para `src/services/`

## Regras prescritivas

### Validação (Zod)

- MUST validate every incoming request body with a Zod schema defined in `validator.ts` before any business logic runs — call `.parse()` which throws on invalid input, or `.safeParse()` only when the failure path is handled inline
- MUST validate the outgoing response shape with a Zod schema before returning to the caller
- NEVER use `req.body as SomeType` casts — always narrow via Zod parse result
- NEVER define Zod schemas in `handler.ts` — they belong exclusively in `validator.ts`

### Logging (pino)

- MUST log every request at `info` level with `{ requestId, module }` context at the start of the handler
- MUST log every handled error at `error` level with `{ requestId, error.message, error.stack }`
- NEVER use `console.log`, `console.warn`, or `console.error` anywhere in `src/`
- NEVER log request body content — log only the requestId and sanitized metadata

### Resposta

- MUST include `source_document` (array de identificadores de chunk) em toda resposta que contenha informação recuperada do índice Azure AI Search
- MUST return HTTP 422 for validation errors (invalid input schema), 500 for internal errors — never return 200 with an error inside the body
- PREFER returning a `{ data, meta }` envelope; never return a raw string as response body

### Integração com services

- MUST call Azure SDKs only through `src/services/` — never import `@azure/*` packages directly in handler, validator, or response-builder
- MUST use the retry wrapper (`withRetry`) from `src/shared/` for every call to an external Azure service
- NEVER catch-and-swallow errors from services — either re-throw or convert to a typed error (see `foundation/error-handling`)

### HTTP e Azure Functions v4

- MUST register the function using the `app.http()` API (Azure Functions v4 style) — never use v1/v2 decorator syntax
- MUST set `authLevel: 'function'` (key-based auth) for all endpoints except `/health`
- NEVER mutate the `request` object — treat it as read-only

## Exemplos de código (DO / DON'T)

### Par 1 — handler.ts

#### ✅ DO

```typescript
// src/functions/query/handler.ts
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { QueryRequestSchema, QueryResponseSchema } from './validator.js';
import { buildQueryResponse } from './response-builder.js';
import { SearchService } from '../../services/search-service.js';
import { CompletionService } from '../../services/completion-service.js';
import { withRetry } from '../../shared/retry.js';
import { logger } from '../../shared/logger.js';

async function queryHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const requestId = req.headers.get('x-request-id') ?? context.invocationId;
  const log = logger.child({ requestId, module: 'query/handler' });

  log.info({ requestId }, 'Request received');

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return { status: 422, jsonBody: { error: 'Invalid JSON body' } };
  }

  const parseResult = QueryRequestSchema.safeParse(body);
  if (!parseResult.success) {
    log.warn({ requestId, issues: parseResult.error.issues }, 'Validation failed');
    return { status: 422, jsonBody: { error: 'Validation error', details: parseResult.error.issues } };
  }

  const input = parseResult.data;

  try {
    const chunks = await withRetry(() => SearchService.search(input.query));
    const completion = await withRetry(() => CompletionService.complete(input.query, chunks));
    const response = buildQueryResponse(completion, chunks);
    const validated = QueryResponseSchema.parse(response);
    return { status: 200, jsonBody: { data: validated, meta: { requestId } } };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    log.error({ requestId, error: error.message, stack: error.stack }, 'Handler error');
    return { status: 500, jsonBody: { error: 'Internal server error' } };
  }
}

app.http('query', {
  methods: ['POST'],
  authLevel: 'function',
  route: 'query',
  handler: queryHandler,
});
```

#### ❌ DON'T

```typescript
// src/functions/query/handler.ts
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { z } from 'zod';
import { SearchClient, AzureKeyCredential } from '@azure/search-documents'; // ❌ SDK Azure direto no handler

interface QueryRequest { query: string; }

// ❌ schema Zod definido no handler, deveria estar em validator.ts
const RequestSchema = z.object({ query: z.string() });

async function queryHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const body = await req.json() as QueryRequest; // ❌ cast sem validação Zod

  console.log('Processing query:', body.query); // ❌ console.log proibido em src/

  const client = new SearchClient(         // ❌ SDK Azure instanciado no handler
    process.env.SEARCH_ENDPOINT!,
    'novatech-index',
    new AzureKeyCredential(process.env.SEARCH_KEY!)
  );
  const results = await client.search(body.query); // ❌ sem withRetry

  return { status: 200, body: JSON.stringify({ answer: 'response here' }) }; // ❌ raw string, sem source_document, sem envelope
}

app.http('query', {
  methods: ['POST'],
  authLevel: 'anonymous', // ❌ deveria ser 'function'
  route: 'query',
  handler: queryHandler,
});
```

---

### Par 2 — validator.ts

#### ✅ DO

```typescript
// src/functions/query/validator.ts
import { z } from 'zod';

export const QueryRequestSchema = z.object({
  query: z.string().min(1).max(500),
  session_id: z.string().uuid().optional(),
});

export const QueryResponseSchema = z.object({
  answer: z.string(),
  source_document: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

export type QueryRequest = z.infer<typeof QueryRequestSchema>;
export type QueryResponse = z.infer<typeof QueryResponseSchema>;
```

#### ❌ DON'T

```typescript
// src/functions/query/handler.ts — ❌ schemas e handler no mesmo arquivo
import { z } from 'zod';
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

// ❌ schemas definidos no handler, não em validator.ts
const RequestSchema = z.object({
  query: z.any(), // ❌ z.any() não valida nada
});

// ❌ tipos não exportados — outros módulos não conseguem reusar
type InternalRequest = { query: string };

async function handler(req: HttpRequest): Promise<HttpResponseInit> {
  const body = RequestSchema.parse(await req.json()); // parseResult.data é any
  return { status: 200, body: 'ok' }; // ❌ string crua, sem envelope
}

app.http('query', { methods: ['POST'], authLevel: 'function', handler });
```

## Anti-padrões comuns

### AP-1: Cast sem validação (`req.body as T`)
**O que o LLM gera:** `const body = await req.json() as QueryRequest;`
**Por que é errado:** Bypassa toda validação em runtime — um payload malformado chega ao service sem verificação, causando erros de tipo não tratados e possíveis vazamentos internos no stack trace da resposta de erro.
**Correção:** `const body = QueryRequestSchema.parse(await req.json());`

### AP-2: Import direto de SDK Azure dentro do handler
**O que o LLM gera:** `import { SearchClient } from '@azure/search-documents';` em `handler.ts`
**Por que é errado:** Quebra a separação de camadas — o handler passa a gerenciar credenciais, configuração de cliente e retry logic, duplicando código e impossibilitando mocking isolado nos testes unitários.
**Correção:** Importe apenas de `../../services/search-service.js`; o SDK fica exclusivamente em `src/services/`.

### AP-3: `console.log` em vez de pino
**O que o LLM gera:** `console.log('Processing request:', body);`
**Por que é errado:** Logs sem estrutura (sem requestId, sem module) impossibilitam correlação de traces em produção; o body logado pode expor PII acidentalmente.
**Correção:** `log.info({ requestId, module: 'query/handler' }, 'Processing request');`

### AP-4: Resposta sem `source_document` em endpoints RAG
**O que o LLM gera:** `return { status: 200, jsonBody: { answer: completion.text } };`
**Por que é errado:** Sem `source_document`, o operador não consegue verificar qual documento originou a resposta — violando o requisito de rastreabilidade da NovaTech e inutilizando o feedback loop de qualidade de retrieval.
**Correção:** `return { status: 200, jsonBody: { data: { answer, source_document: chunks.map(c => c.id) }, meta: { requestId } } };`

### AP-5: HTTP 200 com `{ success: false }` no corpo
**O que o LLM gera:** `return { status: 200, jsonBody: { success: false, error: 'Validation failed' } };`
**Por que é errado:** Clientes HTTP (Teams bot, painel web) interpretam 2xx como sucesso e ignoram o campo `success`; erros ficam silenciosos em dashboards que monitoram por status code HTTP.
**Correção:** Retorne 422 para erros de validação, 404 para not found, 500 para erros internos — nunca encapsule erros em 200.

## Dependências e ordem de leitura

```
Antes de usar esta skill, o agente DEVE ter lido:
1. `foundation/typescript-conventions` — define strict mode, padrões de import, e naming
2. `foundation/error-handling` — define custom errors, `withRetry`, e padrão de logging de exceções
3. `foundation/project-structure` — define a hierarquia de pastas e o papel de cada camada
```
