# Prompt 2.2 — Arquitetura de MCP como Infraestrutura Gerenciada

> **Como usar:** cole este prompt diretamente no Claude Code (ou qualquer agente com acesso ao repositório local `novatech-assistant`). O agente deve ter os MCP servers configurados em `.mcp/mcp.json` antes de executar.

---

## Role e contexto

Você é o Tech Lead da DB1 responsável pelo projeto `novatech-assistant`.

O novatech-assistant é um assistente de IA para atendimento ao cliente da NovaTech (empresa de logística, 1.200 funcionários). O assistente responde perguntas em linguagem natural sobre documentação interna (847 documentos: manuais, SLAs, políticas de frete), usando RAG com Azure AI Search + Azure OpenAI GPT-4o.

**Stack e repositório:**
- Stack: TypeScript · Azure Functions · Azure AI Search · Azure OpenAI
- Repositório local: `novatech-assistant/` (sem remote, sem GitHub nesta fase)
- Fase atual: estruturação — nenhuma linha de código de produção ainda

**MCP servers configurados em `.mcp/mcp.json`:**
- `filesystem` → `./src`, `./specs`, `./skills` (read-write) + `./docs/novatech`, `./data/retrieval-corpus` (read-only)
- `git` → repositório local (histórico, diff, branches)
- `memory` → grafo persistente de decisões e linguagem ubíqua
- `everything` → exploração de primitivas MCP (dev-only)

**Premissa de arquitetura:** MCP servers são infraestrutura — tratados com o mesmo rigor que um banco de dados ou uma fila: versionados, com escopo mínimo, e observáveis. Toda mudança de configuração passa por revisão antes de entrar no repositório.

---

## Tarefa 1 — Documento de Arquitetura MCP

**Arquivo de saída:** `docs/adr/0005-mcp-architecture.md`
**Formato:** ADR (Context → Decision → Consequences → Alternatives Considered)
**Restrição:** escreva como decisão tomada, não como sugestão. Sem "recomendamos" ou "pode-se considerar".

### 1a — Diagrama de topologia (ASCII obrigatório)

Produza um diagrama ASCII que mostre:
- Os 4 servers como blocos nomeados
- Quais agentes consomem cada server (ex: Claude Code, Copilot)
- As setas de acesso com o escopo anotado (rw / ro / dev-only)
- A linha de fronteira explícita entre paths read-write e read-only no `filesystem`
- Destaque para `docs/novatech/` como "zona de conhecimento de negócio" (somente leitura)

O diagrama deve ser legível em terminal de 80 colunas.

### 1b — Política de aprovação de novo server

Defina o processo exato para adicionar um novo server local ao `.mcp/mcp.json`. O documento deve responder:

1. Quem propõe (papel no time) e qual o formato mínimo da proposta (PR, ADR, issue)?
2. Quem revisa escopo e permissões — e qual é o critério de least-privilege aplicado?
3. Qual a diferença de processo entre um server de desenvolvimento (como `everything`) e um server que toca código de produção (como `filesystem`)?
4. O que obriga uma re-revisão de um server já aprovado? (ex: mudança de paths, mudança de permissão de ro para rw, upgrade de versão)

### 1c — Contrato de monitoramento

Para cada server, defina o que significa "healthy":

- `filesystem`: paths `./src`, `./specs`, `./docs/novatech` acessíveis + leitura de ao menos 1 arquivo
- `git`: repositório acessível, não em estado conflitado, retorna branch atual
- `memory`: grafo writable — roundtrip de write+read em menos de 2s
- `everything`: enumeração de tools retorna ≥ 5 tools

Inclua: intervalo de verificação recomendado, quem é owner do alerta, e qual ferramenta executa o check (o script do Entregável 2).

### 1d — Política de versionamento de escopo

Defina como mudanças de escopo são propostas, revisadas e revertidas. Responda especificamente:

a) O que acontece com um fluxo existente se um path for removido do `filesystem`? (ex: `./docs/novatech` removido do escopo → qual a sequência de ações?)

b) Como o time é notificado de uma mudança de escopo antes de chegar ao repositório de cada dev? (sem CI remoto nesta fase — use hooks locais ou convenção de PR description)

c) Procedimento de rollback: quais linhas no `.mcp/mcp.json` mudam, e quem aprova.

---

## Tarefa 2 — Script de Health Check

**Arquivo de saída:** `.mcp/health-check.sh` (bash) ou `.mcp/health-check.ts` (ts-node)
**Restrição:** o script deve rodar de verdade contra os servers locais.
**Evidência obrigatória:** output real de uma execução colado como comentário ao final do arquivo.

### Comportamento por server

**`filesystem`**
1. Tentar iniciar o server (ou verificar se está rodando)
2. Listar as tools/resources disponíveis via MCP
3. Confirmar que `./docs/novatech/` aparece como path acessível
4. Confirmar que um arquivo dentro de `./docs/novatech/` é legível

**`git`**
1. Conectar ao server e verificar que o repositório responde
2. Chamar a tool de status e confirmar retorno com branch atual
3. Verificar que o repositório não está em estado de merge conflict ou rebase

**`memory`**
1. Iniciar o server
2. Escrever uma entidade de teste no grafo (`health-check-probe`)
3. Ler de volta e confirmar que retornou
4. Apagar a entidade de teste (deixar o grafo limpo)

**`everything`**
1. Iniciar o server
2. Chamar `list_tools` e confirmar que retorna ≥ 5 tools
3. Registrar os nomes das tools retornadas no output

### Formato de output por server

```
✗ OFFLINE   filesystem   — porta não responde após 5s
✗ DEGRADED  filesystem   — docs/novatech/ inacessível: path not found
✓ HEALTHY   filesystem   — 3 tools · docs/novatech/ acessível · 12 arquivos visíveis
```

### Exit codes

- `0` — todos os servers HEALTHY
- `1` — ao menos um DEGRADED (responde mas com funcionalidade reduzida)
- `2` — ao menos um OFFLINE (não responde)

### Evidência de execução (obrigatória)

Ao final do arquivo, inclua a saída real de uma execução entre delimitadores:

```
--- EXECUTION LOG (YYYY-MM-DD HH:MM) ---
[cole aqui a saída real do terminal, sem edição]
--- END LOG ---
```

Se um server não estiver rodando no momento da execução, documente isso como OFFLINE com o motivo real — não simule um resultado HEALTHY.

---

## Tarefa 3 — Plano de Contingência

**Arquivo de saída:** `docs/runbooks/mcp-server-contingency.md`
**Formato:** runbook operacional — uma seção por server, com tabela de severidade.
**Princípio:** degradação visível > silêncio > alucinação. Nunca o inverso.

Para cada server, responda as três perguntas:

**Pergunta 1 — O que o agente NÃO pode fazer quando o server cai?**
Liste as operações proibidas de forma explícita. Ex: `filesystem` offline → agente NÃO pode responder perguntas sobre documentação de negócio; NÃO pode afirmar que "não há regra" para uma política não encontrada.

**Pergunta 2 — Qual é a mensagem de aviso exata que o usuário vê?**
Escreva o texto literal do aviso (não uma descrição do aviso). O aviso deve:
- Nomear o server afetado em linguagem de usuário (não "filesystem server")
- Explicar a consequência prática ("respostas sobre prazos podem estar incorretas")
- Indicar a ação: quem o dev deve acionar, qual canal, em quanto tempo

**Pergunta 3 — Quais fluxos continuam e quais ficam bloqueados?**
Classifique cada fluxo em: CONTINUA / DEGRADADO / BLOQUEADO.

### `filesystem` (cenário: path `docs/novatech/` desapareceu ou foi removido do escopo)

- Impacto: qual parte do RAG pipeline fica cega?
- Aviso obrigatório: texto exato a exibir ao atendente
- Fallback: o agente pode redirecionar para o SharePoint original? Deve registrar a consulta não respondida para auditoria? Detalhe o que acontece passo a passo.
- Recuperação: quem restaura o path, como confirmar que voltou, SLA.

### `git` (cenário: repositório em estado conflitado durante o desenvolvimento)

- Impacto: quais operações de diff/histórico ficam indisponíveis?
- O agente pode continuar gerando código sem contexto de histórico? Sob quais restrições? (ex: pode gerar, mas não pode afirmar compatibilidade com commits anteriores)
- Recuperação: procedimento de resolução de conflito + re-healthcheck.

### `memory` (cenário: grafo corrompido ou inacessível)

- O que é perdido: quais decisões de arquitetura vivem só no grafo?
- O agente pode operar sem memória? Defina o modo degradado explicitamente.
- Recuperação: o grafo tem backup? Onde? Como restaurar?

### `everything` (cenário: server não inicia na máquina de um dev)

- Impacto em produção: nenhum (dev-only) — documente isso explicitamente
- Impacto em desenvolvimento: o dev perde exploração de primitivas
- Ação recomendada: reinstalar via `npx`, sem escalar

### Tabela de severidade (obrigatória no runbook)

Inclua a tabela abaixo, revisada e completada com base na análise de impacto:

| Server     | Cenário              | Severidade | Owner     | SLA de restauração |
|------------|----------------------|------------|-----------|-------------------|
| filesystem | path read-only ausente | HIGH     | Tech Lead | 30 min            |
| filesystem | path read-write ausente | CRITICAL | Tech Lead | 15 min            |
| git        | conflict state       | MEDIUM     | Dev owner | 60 min            |
| memory     | inacessível          | HIGH       | Tech Lead | 30 min            |
| everything | não inicia           | LOW        | Dev local | best effort       |

---

## Critérios de aceitação

O output do agente passa se — e somente se — atender todos os critérios:

- [ ] O documento de arquitetura pode ser copiado para um PR e usado como política vinculante sem reescrita. Não contém frases como "recomendamos" ou "pode-se considerar".
- [ ] O script de health check roda com `bash .mcp/health-check.sh` ou `npx ts-node .mcp/health-check.ts` e produz output colorido com status por server.
- [ ] O script contém output de uma execução real — não simulada — colado como comentário. Servers offline devem aparecer como OFFLINE, não HEALTHY.
- [ ] O plano de contingência nomeia o texto exato do aviso ao usuário para cada server crítico. "Mostrar um erro" não é suficiente — o aviso deve estar escrito no documento.
- [ ] Nenhum server é tratado como "sempre disponível". Todo server tem um cenário de falha com SLA de restauração e owner nomeado.
- [ ] A política de aprovação diferencia servers de desenvolvimento (`everything`) de servers que tocam documentação de negócio (`filesystem → docs/novatech`).
