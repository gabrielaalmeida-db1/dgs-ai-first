# Teste do AGENTS.md v1 — Output gerado com Copilot

## Instrução fornecida ao Copilot

> "Crie o endpoint `query-status` em `src/functions/query-status/`. Recebe um GET com
> `queryId` como query parameter. Lê o registro via `QueryStatusService.get(queryId)`.
> Retorna `{ id: string, status: 'processing' | 'completed' | 'failed', created_at: string }`."
>
> Contexto carregado: `AGENTS.md` (via `.github/copilot-instructions.md` apontando para
> `novatech-assistant/AGENTS.md`)

---

## Output gerado (v1 — com AGENTS.md v1.0)

O Copilot gerou um único arquivo `handler.ts`. Nenhum `validator.ts` separado foi criado.

### `src/functions/query-status/handler.ts`

```typescript
// src/functions/query-status/handler.ts
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { z } from 'zod';
import { QueryStatusService } from '../../services/query-status-service.js';
import { logger } from '../../shared/logger.js';

// Schema definido no handler — AGENTS.md v1 diz "alongside the Function handler"
// sem especificar arquivo separado
const QueryParamsSchema = z.object({
  queryId: z.string().min(1),
});

const QueryStatusResponseSchema = z.object({
  id: z.string(),
  status: z.enum(['processing', 'completed', 'failed']),
  created_at: z.string(),
});

async function queryStatusHandler(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const requestId = context.invocationId; // lê invocationId mas não tenta x-request-id primeiro
  const log = logger.child({ requestId, module: 'query-status/handler' });

  log.info({ requestId }, 'Query status request received');

  const params = QueryParamsSchema.safeParse(Object.fromEntries(req.query.entries()));
  if (!params.success) {
    log.warn({ requestId, issues: params.error.issues }, 'Validation failed');
    return { status: 422, jsonBody: { error: 'Validation error', details: params.error.issues } };
  }

  const { queryId } = params.data;

  try {
    const record = await QueryStatusService.get(queryId); // sem withRetry
    if (!record) {
      return { status: 404, jsonBody: { error: 'Query not found' } };
    }
    const validated = QueryStatusResponseSchema.parse(record);
    return { status: 200, jsonBody: validated }; // sem envelope { data, meta }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    log.error({ requestId, error: error.message, stack: error.stack }, 'Handler error');
    return { status: 500, jsonBody: { error: 'Internal server error' } };
  }
}

app.http('query-status', {
  methods: ['GET'],
  authLevel: 'anonymous', // padrão do Copilot — AGENTS.md v1 não especifica authLevel padrão
  route: 'query-status',
  handler: queryStatusHandler,
});
```

---

## Avaliação — Output v1

| # | Regra | Status | Origem da regra no AGENTS.md v1 |
|---|---|---|---|
| 1 | TypeScript: sem `any`, tipos explícitos em funções públicas | ✅ | "never use `any`", "All public function signatures must have explicit return types" |
| 2 | pino: `logger.child()` com `{ requestId, module }` | ✅ | "Always log with pino context fields: `{ requestId, userId, module }`" |
| 3 | pino: nenhum `console.log/warn/error` em `src/` | ✅ | "**never** use `console.log`, `console.error`, or `console.warn` anywhere in `src/`" |
| 4 | Zod: query params validados antes de qualquer lógica | ✅ | "must validate every external input and output boundary" + "Always call `.safeParse()` only when the failure path is handled inline" |
| 5 | Zod: schema em `validator.ts` separado (não em `handler.ts`) | ❌ | AGENTS.md v1 diz "alongside the boundary they guard (e.g., next to the Function handler)" — "next to" é ambíguo: Copilot interpretou como "no mesmo arquivo" |
| 6 | Módulos: nenhum `@azure/*` direto no handler | ✅ | "`src/services/` owns all external service integration; Functions must not call Azure SDKs directly" |
| 7 | `withRetry` em toda chamada a serviço externo (Cosmos DB) | ❌ | **Ausente no AGENTS.md v1** — retry wrapper não é mencionado em nenhuma seção |
| 8 | Resposta: envelope `{ data, meta: { requestId } }` | ❌ | **Ausente no AGENTS.md v1** — sem regra de formato de resposta |
| 9 | HTTP status: 422 validação / 404 not found / 500 erros internos | ✅ | Inferido corretamente mesmo sem regra explícita — comportamento padrão HTTP |
| 10 | `authLevel: 'function'` para endpoints que expõem dados | ❌ | **Ausente no AGENTS.md v1** — Copilot usou `anonymous` por default |

**Score v1: 6/10 ✅**

---

## O que o output v1 revelou sobre o AGENTS.md v1.0

Quatro regras falharam — todas por **ausência de instrução**, não por instrução ignorada. O AGENTS.md v1 define bem o que não é permitido (`any`, `console.log`, SDKs diretos no handler), mas não define o que é obrigatório para a camada HTTP:

1. **`validator.ts` separado:** a formulação "alongside the boundary" é ambígua. O Copilot definiu os schemas dentro do `handler.ts`, o que viola a separação de responsabilidades esperada pelo time — mas não viola nenhuma regra explícita do v1.

2. **`withRetry` ausente:** o wrapper existe em `src/shared/retry.js` e é crítico para resiliência contra falhas transitórias do Cosmos DB (429, 503, timeouts), mas o AGENTS.md v1 não o menciona. Um agente sem contexto da skill `azure-functions-endpoint` não tem como saber que deve usá-lo.

3. **Envelope `{ data, meta }`:** o Copilot retornou o objeto Zod-validado diretamente. Isso é tecnicamente válido, mas quebra o contrato de resposta esperado pelos clientes (Teams bot, painel web) que dependem do campo `meta.requestId` para correlação de logs.

4. **`authLevel`:** sem regra explícita, o Copilot defaultou para `'anonymous'`. Para um endpoint que expõe dados de rastreamento de queries de usuários, isso é uma falha de segurança — `'function'` é o padrão esperado para todos os endpoints não-públicos.
