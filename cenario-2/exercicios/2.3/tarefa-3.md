# Tarefa 3 — Iteração SKILL.md v1.1

Com base no único ❌ da Tarefa 2 (`withRetry` ausente em operação de escrita) e na ambiguidade identificada (`source_document` sem escopo explícito), três seções da skill foram alteradas cirurgicamente. Seções que já funcionaram (Estrutura de arquivos, Validação, Logging, HTTP, Exemplos Par 1 e Par 2, AP-1 a AP-5, Dependências) permaneceram intactas.

---

## Seções alteradas (diff v1.0 → v1.1)

### Frontmatter
```diff
- version: 1.0.0
+ version: 1.1.0
```

### Seção 4 — Regras prescritivas > Resposta
`<!-- v1.1: source_document explicitamente limitado a endpoints de recuperação RAG — ambiguidade gerava comportamento imprevisível em endpoints de escrita -->`

```diff
- MUST include `source_document` (array de identificadores de chunk) em toda resposta que
-   contenha informação recuperada do índice Azure AI Search
+ MUST include `source_document` (array de identificadores de chunk) em toda resposta de
+   endpoint de recuperação RAG (ex: `query`, `search`) que contenha chunks do Azure AI Search
+ NEVER include `source_document` em endpoints de escrita (ex: `feedback`, `health`) —
+   esse campo é exclusivo de respostas de retrieval
```

### Seção 4 — Regras prescritivas > Integração com services
`<!-- v1.1: withRetry agora explicitamente inclui operações de escrita — omissão gerou ❌ no teste do feedback handler -->`

```diff
- MUST use the retry wrapper (`withRetry`) from `src/shared/` for every call to an external Azure service
+ MUST use the retry wrapper (`withRetry`) from `src/shared/` for every call to an external
+   Azure service — applies equally to read operations (search, completion) AND write
+   operations (Cosmos DB saves, updates, deletes)
```

### Seção 5 — Exemplos de código
`<!-- v1.1: Par 3 adicionado para exemplificar withRetry em handler de escrita — Par 1 (query) era leitura-only, insuficiente para ancorar o padrão em operações de escrita -->`

Par 3 adicionado: feedback handler DO/DON'T (ver skill file em `skills/domain/azure-functions-endpoint.md`).

### Seção 6 — Anti-padrões comuns
`<!-- v1.1: AP-6 adicionado após v1 test identificar omissão de withRetry em operação de escrita Cosmos DB -->`

AP-6 adicionado: `withRetry` omitido em operações de escrita.

---

## Output gerado (v2) — seguindo azure-functions-endpoint v1.1

Apenas o `handler.ts` mudou. `validator.ts` e `response-builder.ts` permaneceram idênticos ao v1.

### `src/functions/feedback/handler.ts` (v2)

```typescript
// src/functions/feedback/handler.ts
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { FeedbackRequestSchema, FeedbackResponseSchema } from './validator.js';
import { buildFeedbackResponse } from './response-builder.js';
import { FeedbackService } from '../../services/feedback-service.js';
import { withRetry } from '../../shared/retry.js';
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
    const saved = await withRetry(() => FeedbackService.save(input)); // withRetry: escrita Cosmos DB
    const response = buildFeedbackResponse(saved);
    const validated = FeedbackResponseSchema.parse(response);
    return { status: 200, jsonBody: { data: validated, meta: { requestId } } };
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

---

## Avaliação — Output v2

| Regra | Status v1 | Status v2 | Melhoria |
|---|---|---|---|
| Zod: `.parse()` no input | ✅ | ✅ | Sem alteração — já funcionava |
| Zod: schema em `validator.ts`, não em `handler.ts` | ✅ | ✅ | Sem alteração |
| pino com `{ requestId, module }` | ✅ | ✅ | Sem alteração |
| Nenhum `console.log` | ✅ | ✅ | Sem alteração |
| `source_document` no response | ✅ (N/A implícito) | ✅ (N/A explícito) | Skill v1.1 explicita que `source_document` é exclusivo de endpoints RAG — ambiguidade eliminada |
| HTTP 422 para erros de validação | ✅ | ✅ | Sem alteração |
| Sem import direto de `@azure/*` no handler | ✅ | ✅ | Sem alteração |
| `withRetry` em chamadas externas | ❌ | ✅ | Skill v1.1 regra agora inclui operações de escrita + Par 3 exemplifica `withRetry(() => FeedbackService.save())` |
| `app.http()` v4 | ✅ | ✅ | Sem alteração |
| `authLevel: 'function'` | ✅ | ✅ | Sem alteração |

---

## O que mudou entre v1.0 e v1.1 e por quê

A v1.1 faz duas correções cirúrgicas. Primeira: a regra de `withRetry` na Seção 4 ganhou a cláusula "applies equally to read AND write operations" — removendo a ambiguidade que fazia o LLM aplicar o wrapper apenas em chamadas que tinham exemplos visuais (SearchService, CompletionService). Segunda: a regra de `source_document` foi limitada explicitamente a endpoints RAG de leitura, e uma regra NEVER complementar foi adicionada para endpoints de escrita. Por fim, a Seção 5 ganhou o Par 3 (feedback handler como escrita-com-retry) e a Seção 6 ganhou o AP-6 — ambos ancoram visualmente as duas regras corrigidas. Nenhuma seção que já funcionou foi modificada.
