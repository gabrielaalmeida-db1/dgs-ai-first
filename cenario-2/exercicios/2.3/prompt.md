# Prompt 2.3 — Criação, Teste e Maturidade de Skill Técnica

> **Como usar:** cole este prompt no Claude Code (ou Copilot Chat) com o repositório `novatech-assistant` aberto e o MCP `filesystem` ativo. O agente deve conseguir ler o `AGENTS.md` e a pasta `skills/` antes de executar.

---

## Role e contexto

Você é o Tech Lead da DB1 responsável pelo projeto `novatech-assistant`.

O novatech-assistant é um sistema RAG corporativo para atendimento ao cliente da NovaTech (logística, 1.200 funcionários). O assistente responde perguntas sobre documentação interna (SLAs, frete, devoluções) usando Azure AI Search + Azure OpenAI GPT-4o. O AGENTS.md do repositório é a sua constitution — releia-o agora antes de continuar.

**Stack relevante para este exercício:**
- TypeScript 5.5+ com `strict: true`; módulos ES (`"type": "module"`)
- Azure Functions v4 com HTTP triggers — padrão de pastas: `src/functions/<nome>/{handler.ts, validator.ts, response-builder.ts}`
- Zod 3.x em toda fronteira de entrada e saída (sem `any`, sem `unknown` não-narrowed)
- pino para logging — `console.log`/`console.error` são **proibidos** em `src/`
- `src/services/` é o único lugar que chama Azure SDKs; Functions **não** chamam SDKs diretamente
- Retry com exponential backoff obrigatório em todas as chamadas a serviços Azure externos

**O que são skills neste projeto:**
Skills são arquivos `.md` que encapsulam como gerar um tipo específico de output. Elas têm três níveis: Foundation (convenções globais) → Domain (padrões por camada) → Artifact (receitas completas). Um agente que recebe uma task e lê a skill certa deve conseguir gerar código correto sem instrução adicional.

---

## Tarefa 1 — Escrever o SKILL.md para `azure-functions-endpoint`

**Arquivo de saída:** `skills/domain/azure-functions-endpoint.md`
**Nível:** Domain
**Restrição:** escreva como especificação executável — sem "recomendamos" ou "pode-se considerar". Use `MUST`, `NEVER`, `ALWAYS` para regras invioláveis; `PREFER` para convenções de estilo.

O SKILL.md deve conter exatamente as seções abaixo, nesta ordem:

### Seção 1 — Frontmatter de metadados

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

### Seção 2 — Contexto

Explique em 3–5 linhas:
- Quando esta skill se aplica (frase de ativação que um agente reconheceria)
- O que é um Azure Function HTTP trigger no contexto deste projeto
- Qual é a relação entre Functions e a camada `src/services/` (onde vivem os SDKs)

### Seção 3 — Estrutura de arquivos obrigatória

Descreva a estrutura canônica de pasta para cada endpoint, com o papel de cada arquivo:

```
src/functions/<endpoint-name>/
├── handler.ts        — HTTP trigger: valida input, chama services, formata resposta
├── validator.ts      — schemas Zod de request e response
└── response-builder.ts — monta o objeto de resposta com source_document
```

Regras sobre naming: o nome da pasta é o slug do endpoint em kebab-case (ex: `query`, `feedback`, `health`). Proibido criar arquivos fora desta estrutura para um mesmo endpoint.

### Seção 4 — Regras prescritivas

Liste as regras como itens com prefixo `MUST`/`NEVER`/`ALWAYS`/`PREFER`. Inclua **pelo menos** as seguintes (adicione outras que a skill Foundation já definiu e que se aplicam aqui):

**Validação (Zod):**
- MUST validate every incoming request body with a Zod schema defined in `validator.ts` before any business logic runs — call `.parse()` which throws on invalid input
- MUST validate the outgoing response shape with a Zod schema before returning to the caller
- NEVER use `req.body as SomeType` casts — always narrow via Zod parse result
- NEVER define Zod schemas in `handler.ts` — they belong in `validator.ts`

**Logging (pino):**
- MUST log every request at `info` level with `{ requestId, module }` context at the start of the handler
- MUST log every handled error at `error` level with `{ requestId, error.message, error.stack }`
- NEVER use `console.log`, `console.warn`, or `console.error` anywhere in `src/`
- NEVER log request body content — log only the requestId and sanitized metadata

**Resposta:**
- MUST include `source_document` (array de identificadores de chunk) em toda resposta que contenha informação recuperada do índice
- MUST return HTTP 422 for validation errors (invalid input schema), 500 for internal errors — never return 200 with an error inside the body
- PREFER returning a `{ data, meta }` envelope; never return a raw string as response body

**Integração com services:**
- MUST call Azure SDKs only through `src/services/` — never import `@azure/*` packages directly in handler, validator, or response-builder
- MUST use the retry wrapper (`withRetry`) from `src/shared/` for every call to an external Azure service
- NEVER catch-and-swallow errors from services — either re-throw or convert to a typed error (see `foundation/error-handling`)

**HTTP e Azure Functions v4:**
- MUST register the function using the `app.http()` API (Azure Functions v4 style) — never use v1/v2 decorator syntax
- MUST set `authLevel: 'function'` (key-based auth) for all endpoints except `/health`
- NEVER mutate the `request` object — treat it as read-only

### Seção 5 — Exemplos de código (DO / DON'T)

Forneça **dois pares completos** de DO/DON'T. Cada par deve mostrar um arquivo inteiro (não snippet parcial) com TypeScript real e compilável.

**Par 1 — handler.ts correto vs. handler.ts com anti-padrões**

DO: handler que valida com Zod, chama um service, loga com pino, retorna envelope com `source_document`.

DON'T: handler que usa `req.body as QueryRequest` (cast sem validação), chama um SDK Azure diretamente, usa `console.log`, retorna string crua.

**Par 2 — validator.ts correto vs. validator.ts com anti-padrões**

DO: validator com schema de input e output separados, tipos inferidos via `z.infer<>`, exportados nomeadamente.

DON'T: validator que define schema e handler no mesmo arquivo, usa `z.any()`, não exporta os tipos inferidos.

Cada bloco de código deve ter:
- Caminho do arquivo como primeiro comentário (`// src/functions/query/handler.ts`)
- Imports completos (nenhum import fictício)
- Nenhum `TODO` ou placeholder — código funcional como seria em produção

### Seção 6 — Anti-padrões comuns

Liste exatamente 5 anti-padrões que um LLM (Copilot, Claude) tipicamente gera ao criar endpoints sem esta skill. Para cada anti-padrão:

```
### AP-N: <nome curto>
**O que o LLM gera:** <trecho de código ou descrição concisa do que ele faz errado>
**Por que é errado:** <consequência técnica concreta>
**Correção:** <o padrão correto em uma linha ou snippet mínimo>
```

Anti-padrões obrigatórios (você pode complementar):
- AP-1: Cast sem validação (`req.body as T`)
- AP-2: Import direto de SDK Azure dentro do handler
- AP-3: `console.log` em vez de pino
- AP-4: Resposta sem `source_document` em endpoints RAG
- AP-5: HTTP 200 com `{ success: false }` no corpo (em vez de código 4xx/5xx correto)

### Seção 7 — Dependências e ordem de leitura

Liste as skills que DEVEM ser lidas antes desta, com uma frase explicando o que cada uma contribui:

```
Antes de usar esta skill, o agente DEVE ter lido:
1. `foundation/typescript-conventions` — define strict mode, padrões de import, e naming
2. `foundation/error-handling` — define custom errors, `withRetry`, e padrão de logging de exceções
3. `foundation/project-structure` — define a hierarquia de pastas e o papel de cada camada
```

---

## Tarefa 2 — Testar a skill (simulação de uso pelo Copilot)

Com o SKILL.md salvo em `skills/domain/azure-functions-endpoint.md`, gere um endpoint de exemplo **como se fosse o Copilot respondendo a esta instrução:**

> "Crie o endpoint `feedback` em `src/functions/feedback/`. Ele recebe um POST com `{ query_id: string, rating: 1 | 2 | 3 | 4 | 5, comment?: string }` e salva no Cosmos DB via `FeedbackService`. Retorna `{ id: string, recorded_at: string }`."

Gere os três arquivos (`handler.ts`, `validator.ts`, `response-builder.ts`) como o Copilot geraria seguindo a skill. Em seguida, **avalie cada regra prescritiva** da Seção 4 e marque se foi seguida:

```markdown
## Avaliação — Output v1

| Regra | Status | Observação |
|---|---|---|
| Zod: `.parse()` no input | ✅ / ❌ | ... |
| Zod: schema em validator.ts, não em handler.ts | ✅ / ❌ | ... |
| pino com { requestId, module } | ✅ / ❌ | ... |
| Nenhum console.log | ✅ / ❌ | ... |
| source_document no response | ✅ / ❌ | ... |
| HTTP 422 para erros de validação | ✅ / ❌ | ... |
| Sem import direto de @azure/* no handler | ✅ / ❌ | ... |
| withRetry em chamadas externas | ✅ / ❌ | ... |
| app.http() v4 | ✅ / ❌ | ... |
| authLevel: 'function' | ✅ / ❌ | ... |
```

Após a tabela, escreva um parágrafo: **"O que o output v1 revelou sobre a skill v1.0"** — identifique as seções da skill que foram ignoradas ou mal-interpretadas.

---

## Tarefa 3 — Iterar: SKILL.md v1.1

Com base nos ❌ da avaliação da Tarefa 2, reescreva as seções problemáticas do SKILL.md.

**Regras de iteração:**
- Não reescreva seções que já funcionaram — altere cirurgicamente só o que falhou
- Para cada seção alterada, adicione um comentário `<!-- v1.1: motivo da mudança →` logo abaixo do título da seção
- Incremente a versão no frontmatter para `1.1.0`
- Se um anti-padrão foi gerado no output v1 e não está na Seção 6, adicione-o como `AP-6` (ou seguinte)

Após as alterações, repita o teste da Tarefa 2 com a mesma instrução de endpoint e produza a tabela de avaliação v2:

```markdown
## Avaliação — Output v2

| Regra | Status v1 | Status v2 | Melhoria |
|---|---|---|---|
| Zod: `.parse()` no input | ❌ | ✅ | Seção 4 agora tem exemplo inline |
| ... | ... | ... | ... |
```

Finalize com: **"O que mudou entre v1.0 e v1.1 e por quê"** — máximo 5 linhas.

---

## Tarefa 4 — Critérios de maturidade da skill

Defina os critérios que determinam quando uma skill está **pronta para uso pelo time inteiro** (não apenas pelo Tech Lead que a criou). Os critérios devem ser:
- **Mensuráveis** (dois Tech Leads devem chegar à mesma conclusão ao aplicá-los)
- **Executáveis** (alguém pode verificar cada critério em menos de 10 minutos)
- **Independentes de ferramentas** (funcionam com Copilot, Claude Code, ou qualquer LLM)

Organize os critérios em duas categorias:

### Critérios de conteúdo (a skill está bem escrita?)

Defina ao menos 5 critérios. Exemplos de forma, não de conteúdo:
- "Todas as regras usam `MUST`/`NEVER`/`ALWAYS`/`PREFER` — nenhuma regra é descritiva"
- "Cada exemplo DO/DON'T é compilável sem modificação"
- "Anti-padrões documentam um comportamento real de LLM, não hipotético"

### Critérios de eficácia (a skill produz o efeito desejado?)

Defina ao menos 3 critérios baseados em teste, não em leitura:
- "Dado a instrução padrão de novo endpoint (definida na skill ou no onboarding), o LLM produz ≥ 8/10 regras corretas na primeira tentativa"
- "Um desenvolvedor júnior consegue usar a skill sem perguntas ao Tech Lead"
- (defina o terceiro)

Finalize com uma **tabela de graduação**:

| Nível | Critérios atendidos | Uso autorizado |
|---|---|---|
| Draft | < 5 critérios de conteúdo | Tech Lead apenas (validação) |
| Beta | ≥ 5 conteúdo + 1 eficácia | Dev Sênior (feedback ativo) |
| Estável | Todos conteúdo + ≥ 2 eficácia | Todo o time |
| Arquivada | Skills substituída por versão mais nova | Deletar após 2 sprints |

---

## Critérios de aceitação

O output do agente passa se — e somente se — atender todos os critérios:

- [ ] O SKILL.md v1.0 existe em `skills/domain/azure-functions-endpoint.md` com as 7 seções completas; o frontmatter `depends-on` está correto.
- [ ] Os exemplos DO/DON'T são TypeScript compilável real — nenhum placeholder, nenhum `// TODO`, nenhum import fictício.
- [ ] A avaliação v1 tem uma linha por regra da Seção 4; as células não estão em branco.
- [ ] A narrativa "o que o output v1 revelou" identifica pelo menos um problema real (não inventa aprovação total se houve ❌).
- [ ] O SKILL.md v1.1 tem comentários `<!-- v1.1: ... -->` nas seções alteradas e versão atualizada no frontmatter.
- [ ] A avaliação v2 mostra ≥ 1 regra que passou de ❌ para ✅ — a iteração produziu melhoria concreta.
- [ ] Os critérios de maturidade têm a tabela de graduação preenchida com os 4 níveis.
- [ ] Nenhuma seção usa linguagem descritiva pura ("este endpoint faz X") — toda seção termina com uma instrução acionável.
