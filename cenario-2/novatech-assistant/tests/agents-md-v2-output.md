# Teste do AGENTS.md v2 — Output gerado com Copilot

## AGENTS.md v2 — seções alteradas

Quatro correções cirúrgicas aplicadas após análise do output v1. Seções que já funcionaram
(TypeScript, pino proibição de console.log, separação de camadas, commits, CI/CD) não foram alteradas.

| Seção | Alteração |
|---|---|
| `### Validation` | "alongside the Function handler" → "in a dedicated `validator.ts` file … never in `handler.ts`" |
| `### Logging` | Adicionada regra explícita: `requestId = req.headers.get('x-request-id') ?? context.invocationId` |
| `### Response Format` *(nova)* | Envelope `{ data, meta: { requestId } }`, status codes corretos, `authLevel: 'function'` como padrão |
| `### Modules & Boundaries` | Adicionado: "Always wrap every external service call with `withRetry` from `src/shared/`" |

---

## Instrução fornecida ao Copilot (idêntica à v1)

> "Crie o endpoint `query-status` em `src/functions/query-status/`. Recebe um GET com
> `queryId` como query parameter. Lê o registro via `QueryStatusService.get(queryId)`.
> Retorna `{ id: string, status: 'processing' | 'completed' | 'failed', created_at: string }`."
>
> Contexto carregado: `AGENTS.md` v2 (mesma instrução de carga via `.github/copilot-instructions.md`)

---

## Output gerado (v2 — com AGENTS.md v2.0)

O Copilot gerou dois arquivos separados: `validator.ts` e `handler.ts`.

### `src/functions/query-status/validator.ts`

```typescript
// src/functions/query-status/validator.ts
import { z } from 'zod';

export const QueryStatusParamsSchema = z.object({
  queryId: z.string().min(1),
});

export const QueryStatusResponseSchema = z.object({
  id: z.string(),
  status: z.enum(['processing', 'completed', 'failed']),
  created_at: z.string(),
});

export type QueryStatusParams = z.infer<typeof QueryStatusParamsSchema>;
export type QueryStatusResponse = z.infer<typeof QueryStatusResponseSchema>;
```

### `src/functions/query-status/handler.ts`

```typescript
// src/functions/query-status/handler.ts
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { QueryStatusParamsSchema, QueryStatusResponseSchema } from './validator.js';
import { QueryStatusService } from '../../services/query-status-service.js';
import { withRetry } from '../../shared/retry.js';
import { logger } from '../../shared/logger.js';

async function queryStatusHandler(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const requestId = req.headers.get('x-request-id') ?? context.invocationId;
  const log = logger.child({ requestId, module: 'query-status/handler' });

  log.info({ requestId }, 'Query status request received');

  const params = QueryStatusParamsSchema.safeParse(Object.fromEntries(req.query.entries()));
  if (!params.success) {
    log.warn({ requestId, issues: params.error.issues }, 'Validation failed');
    return { status: 422, jsonBody: { error: 'Validation error', details: params.error.issues } };
  }

  const { queryId } = params.data;

  try {
    const record = await withRetry(() => QueryStatusService.get(queryId));
    if (!record) {
      return { status: 404, jsonBody: { error: 'Query not found' } };
    }
    const validated = QueryStatusResponseSchema.parse(record);
    return { status: 200, jsonBody: { data: validated, meta: { requestId } } };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    log.error({ requestId, error: error.message, stack: error.stack }, 'Handler error');
    return { status: 500, jsonBody: { error: 'Internal server error' } };
  }
}

app.http('query-status', {
  methods: ['GET'],
  authLevel: 'function',
  route: 'query-status',
  handler: queryStatusHandler,
});
```

---

## Avaliação — Output v2

| # | Regra | Status v1 | Status v2 | Melhoria |
|---|---|---|---|---|
| 1 | TypeScript: sem `any`, tipos explícitos | ✅ | ✅ | Sem alteração |
| 2 | pino: `logger.child()` com `{ requestId, module }` | ✅ | ✅ | Sem alteração |
| 3 | pino: nenhum `console.*` | ✅ | ✅ | Sem alteração |
| 4 | Zod: input validado antes de qualquer lógica | ✅ | ✅ | Sem alteração |
| 5 | Zod: schema em `validator.ts` separado | ❌ | ✅ | Regra v2 explicita "dedicated `validator.ts` file" — `QueryStatusParamsSchema` e `QueryStatusResponseSchema` agora em arquivo separado |
| 6 | Módulos: nenhum `@azure/*` direto no handler | ✅ | ✅ | Sem alteração |
| 7 | `withRetry` em chamadas ao serviço externo | ❌ | ✅ | Regra v2 "Always wrap every external service call with `withRetry`" — `QueryStatusService.get()` agora envolto |
| 8 | Resposta: envelope `{ data, meta: { requestId } }` | ❌ | ✅ | Regra v2 "Always return a `{ data, meta: { requestId } }` envelope" — formato correto |
| 9 | HTTP status: 422 / 404 / 500 corretos | ✅ | ✅ | Sem alteração |
| 10 | `authLevel: 'function'` | ❌ | ✅ | Regra v2 "Always set `authLevel: 'function'` for endpoints that serve user data" |

**Score v1: 6/10 → Score v2: 10/10 ✅**

---

## Resumo das mudanças e impacto

O AGENTS.md v2 corrigiu quatro ausências identificadas no teste v1. Cada correção foi cirúrgica: nenhuma seção que já produzia comportamento correto foi alterada.

- **`validator.ts` separado:** a regra v2 é inequívoca ("dedicated `validator.ts` file … never in `handler.ts`"). O Copilot criou os dois arquivos corretamente sem instrução adicional no prompt do endpoint.
- **`withRetry`:** com a regra explícita em `### Modules & Boundaries`, o wrapper foi aplicado em `QueryStatusService.get()` — que acessa Cosmos DB e está sujeito a falhas transitórias (429, 503).
- **Envelope `{ data, meta }`:** a seção `### Response Format` eliminou a ambiguidade: o Copilot estruturou a resposta com `data` e `meta.requestId`, compatível com o que o Teams bot e o painel web esperam.
- **`authLevel: 'function'`:** com a regra explícita e a exceção documentada (`/health` = `anonymous`), o Copilot usou o padrão correto sem precisar inferir.

Uma regra que ainda não está no AGENTS.md: o AGENTS.md v2 não menciona `response-builder.ts` como terceiro arquivo da triade. O Copilot gerou apenas `validator.ts` + `handler.ts` — para endpoints simples isso é aceitável, mas para endpoints com lógica de formatação complexa (como `query`) o `response-builder.ts` seria omitido. Esse gap pode ser abordado em v2.1 se o time identificar padrão de omissão em geração de endpoints RAG.
