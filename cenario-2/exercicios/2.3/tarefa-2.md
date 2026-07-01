# Tarefa 2 — Teste da Skill (Simulação de Uso pelo Copilot)

## Instrução recebida

> "Crie o endpoint `feedback` em `src/functions/feedback/`. Ele recebe um POST com `{ query_id: string, rating: 1 | 2 | 3 | 4 | 5, comment?: string }` e salva no Cosmos DB via `FeedbackService`. Retorna `{ id: string, recorded_at: string }`."

## Output gerado (v1) — seguindo azure-functions-endpoint v1.0

### `src/functions/feedback/handler.ts`

```typescript
// src/functions/feedback/handler.ts
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { FeedbackRequestSchema, FeedbackResponseSchema } from './validator.js';
import { buildFeedbackResponse } from './response-builder.js';
import { FeedbackService } from '../../services/feedback-service.js';
import { logger } from '../../shared/logger.js';

async function feedbackHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const requestId = req.headers.get('x-request-id') ?? context.invocationId;
  const log = logger.child({ requestId, module: 'feedback/handler' });

  log.info({ requestId }, 'Feedback request received');

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return { status: 422, jsonBody: { error: 'Invalid JSON body' } };
  }

  const parseResult = FeedbackRequestSchema.safeParse(body);
  if (!parseResult.success) {
    log.warn({ requestId, issues: parseResult.error.issues }, 'Validation failed');
    return { status: 422, jsonBody: { error: 'Validation error', details: parseResult.error.issues } };
  }

  const input = parseResult.data;

  try {
    const saved = await FeedbackService.save(input); // sem withRetry
    const response = buildFeedbackResponse(saved);
    const validated = FeedbackResponseSchema.parse(response);
    return { status: 200, jsonBody: validated }; // sem envelope { data, meta }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    log.error({ requestId, error: error.message, stack: error.stack }, 'Handler error');
    return { status: 500, jsonBody: { error: 'Internal server error' } };
  }
}

app.http('feedback', {
  methods: ['POST'],
  authLevel: 'function',
  route: 'feedback',
  handler: feedbackHandler,
});
```

### `src/functions/feedback/validator.ts`

```typescript
// src/functions/feedback/validator.ts
import { z } from 'zod';

export const FeedbackRequestSchema = z.object({
  query_id: z.string(),
  rating: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
  ]),
  comment: z.string().optional(),
});

export const FeedbackResponseSchema = z.object({
  id: z.string(),
  recorded_at: z.string(),
});

export type FeedbackRequest = z.infer<typeof FeedbackRequestSchema>;
export type FeedbackResponse = z.infer<typeof FeedbackResponseSchema>;
```

### `src/functions/feedback/response-builder.ts`

```typescript
// src/functions/feedback/response-builder.ts
import type { FeedbackResponse } from './validator.js';

interface SavedFeedback {
  id: string;
  recorded_at: string;
}

export function buildFeedbackResponse(saved: SavedFeedback): FeedbackResponse {
  return {
    id: saved.id,
    recorded_at: saved.recorded_at,
  };
}
```

---

## Avaliação — Output v1

| Regra | Status | Observação |
|---|---|---|
| Zod: `.parse()` no input | ✅ | `safeParse()` com tratamento inline na branch de erro — padrão correto para lidar com falha sem exceção |
| Zod: schema em `validator.ts`, não em `handler.ts` | ✅ | Schemas `FeedbackRequestSchema` e `FeedbackResponseSchema` definidos em `validator.ts`, apenas importados no handler |
| pino com `{ requestId, module }` | ✅ | `logger.child({ requestId, module: 'feedback/handler' })` no início do handler |
| Nenhum `console.log` | ✅ | Apenas pino usado; nenhuma ocorrência de `console.*` |
| `source_document` no response | ✅ | N/A — `feedback` é endpoint de escrita; não recupera chunks do Azure AI Search. Regra v1.0 não especificava escopo, gerando ambiguidade |
| HTTP 422 para erros de validação | ✅ | 422 retornado tanto para JSON inválido (`try/catch req.json()`) quanto para falha no schema Zod |
| Sem import direto de `@azure/*` no handler | ✅ | Apenas imports de `../../services/` e `../../shared/` — nenhum `@azure/*` no handler |
| `withRetry` em chamadas externas | ❌ | `FeedbackService.save(input)` chamado diretamente sem `withRetry` — a chamada ao Cosmos DB não tem proteção de retry |
| `app.http()` v4 | ✅ | Registrado via `app.http('feedback', { ... })` — padrão v4 correto |
| `authLevel: 'function'` | ✅ | `authLevel: 'function'` presente na configuração do endpoint |

---

## O que o output v1 revelou sobre a skill v1.0

A avaliação v1 identificou dois problemas reais na skill. O principal: a Seção 4 ("Integração com services") menciona `withRetry` como obrigatório, mas o único exemplo DO da Seção 5 demonstra o wrapper exclusivamente em um endpoint de leitura (`query`), com chamadas a `SearchService.search()` e `CompletionService.complete()`. Um agente que leu a skill e gerou o `feedback` handler — uma operação de **escrita** no Cosmos DB — omitiu o `withRetry` porque nenhum exemplo de escrita o ancorava naquele contexto; a regra existia no texto mas estava subentendida como padrão de leitura. O segundo problema: a regra sobre `source_document` não esclarece explicitamente que se aplica apenas a endpoints de recuperação RAG. Para um endpoint de escrita como `feedback`, isso cria ambiguidade: o LLM pode corretamente omitir o campo (como fez aqui) ou incorretamente incluí-lo com array vazio — dois comportamentos opostos, ambos justificáveis pela leitura da v1.0.
