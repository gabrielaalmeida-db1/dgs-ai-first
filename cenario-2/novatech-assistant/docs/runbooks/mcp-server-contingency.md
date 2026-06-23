# Runbook: Contingência de MCP Servers

**Princípio:** degradação visível > silêncio > alucinação. Um agente que avisa o usuário sobre o que não sabe é sempre preferível a um agente que inventa uma resposta.

**Health check:** `node .mcp/health-check.mjs` (raiz do repositório)
**ADR de referência:** `docs/adr/0005-mcp-architecture.md`

---

## Tabela de Severidade

| Server       | Cenário                         | Severidade | Owner     | SLA de restauração |
|--------------|---------------------------------|------------|-----------|-------------------|
| `filesystem` | `docs/novatech/` inacessível    | HIGH       | Tech Lead | 30 min            |
| `filesystem` | paths read-write inacessíveis   | CRITICAL   | Tech Lead | 15 min            |
| `filesystem` | server não inicia               | CRITICAL   | Tech Lead | 15 min            |
| `git`        | `uvx` não instalado             | HIGH       | Dev local | 60 min            |
| `git`        | repositório em conflict state   | MEDIUM     | Dev owner | 60 min            |
| `memory`     | grafo inacessível               | HIGH       | Tech Lead | 30 min            |
| `memory`     | roundtrip write→read falha      | MEDIUM     | Dev ativo | 30 min            |
| `everything` | server não inicia               | LOW        | Dev local | best effort       |

---

## filesystem

### Cenário A — `docs/novatech/` inacessível (path removido do escopo ou ausente no disco)

**O que o agente NÃO pode fazer:**

- Responder qualquer pergunta sobre documentação de negócio da NovaTech (políticas, SLAs, procedimentos, regras de frete)
- Afirmar que "não existe uma regra" para algo que simplesmente não conseguiu acessar
- Usar conhecimento de treinamento para substituir os documentos reais
- Resumir, citar ou parafrasear documentos de `docs/novatech/` a partir de sessões anteriores

**Mensagem de aviso ao usuário (texto literal):**

```
⚠️  Base documental indisponível

O servidor de acesso aos documentos da NovaTech não está respondendo.
Respostas sobre prazos, políticas de devolução, regras de frete e SLAs
podem estar incorretas ou incompletas.

Não use estas respostas para comunicações a clientes até que o acesso
seja restaurado. Acione o Tech Lead pelo canal #dev-novatech.
```

**Fluxos por status:**

| Fluxo                                      | Status     |
|--------------------------------------------|------------|
| Geração de código TypeScript/specs         | CONTINUA   |
| Análise de git history e diff              | CONTINUA   |
| Consulta à linguagem ubíqua (memory)       | CONTINUA   |
| Respostas baseadas em docs de negócio      | BLOQUEADO  |
| Geração de golden queries para eval        | BLOQUEADO  |
| Chunking/indexação do pipeline de ingestão | BLOQUEADO  |

**Fallback passo a passo:**

1. O agente exibe o aviso acima antes de qualquer resposta que dependeria de `docs/novatech/`
2. O agente registra a consulta não respondida com timestamp: `"[CONSULTA NÃO RESPONDIDA - docs/novatech/ inacessível]: <pergunta>"`
3. O agente orienta o dev a consultar diretamente os arquivos em `docs/novatech/` via terminal ou IDE
4. O agente NÃO tenta responder a partir de memória ou conhecimento de treinamento

**Recuperação:**

1. Verificar se o path existe: `ls docs/novatech/`
2. Se ausente: restaurar via `git checkout HEAD -- docs/novatech/`
3. Se o path foi removido do escopo do `.mcp/mcp.json`, reverter conforme ADR-0005 §4
4. Reiniciar os MCP servers na IDE
5. Confirmar restauração: `node .mcp/health-check.mjs`
6. SLA: 30 min desde a detecção até confirmação de HEALTHY

### Cenário B — paths read-write (`./src`, `./specs`, `./skills`) inacessíveis

**O que o agente NÃO pode fazer:**

- Criar, editar ou deletar arquivos de código, specs ou skills
- Confirmar que uma edição foi salva (pode reportar sucesso sem ter persistido)

**Mensagem de aviso ao usuário (texto literal):**

```
⚠️  Escrita no repositório indisponível

O agente não consegue ler nem escrever em src/, specs/ ou skills/.
Nenhuma alteração de código será salva durante esta sessão.

Acione o Tech Lead imediatamente pelo canal #dev-novatech (SLA: 15 min).
```

**Recuperação:** mesma sequência do Cenário A. SLA: 15 min (CRITICAL).

---

## git

### Cenário A — `uvx` não instalado (mcp-server-git não inicia)

**Impacto em produção:** nenhum — `mcp-server-git` é exclusivo do ambiente de desenvolvimento.

**O que o agente NÃO pode fazer:**

- Consultar histórico de commits, autoria e datas via tool MCP
- Fazer diff de branches via tool MCP
- Afirmar que uma mudança "está alinhada com o histórico do repositório"

**O agente PODE continuar:**

- Gerando código, specs, skills — sem precisar de contexto de histórico
- O agente pode continuar gerando código, mas **não pode afirmar compatibilidade com commits anteriores** sem ter acesso ao histórico

**Mensagem de aviso ao usuário (texto literal):**

```
ℹ️  Histórico git indisponível via MCP

O server de git não está ativo (uvx não encontrado).
O agente pode continuar gerando código, mas não tem acesso
ao histórico de commits para verificar compatibilidade.

Para instalar uvx: https://docs.astral.sh/uv/getting-started/installation/
```

**Recuperação:**

1. Instalar `uv`/`uvx`: seguir instruções em https://docs.astral.sh/uv/getting-started/installation/
2. Verificar instalação: `uvx --version`
3. Reiniciar MCP servers na IDE
4. Confirmar: `node .mcp/health-check.mjs`

### Cenário B — repositório em conflict state durante desenvolvimento

**O que o agente NÃO pode fazer:**

- Usar diff/status via MCP como referência para geração de código (estado inconsistente)
- Afirmar que um arquivo está em determinado estado sem resolver o conflito primeiro

**O agente PODE continuar:** gerando código e specs independentes do merge conflict, sem citar o estado do repositório.

**Mensagem de aviso ao usuário (texto literal):**

```
⚠️  Repositório em estado conflitado

Há conflitos não resolvidos no repositório. O histórico e diff
reportados pelo agente podem estar incorretos.

Resolva os conflitos antes de continuar com tarefas que dependem
de contexto de git (ex: "alinhe com a branch X", "compare com HEAD").
```

**Recuperação:**

1. Resolver conflitos: `git status` → editar arquivos com marcadores `<<<`/`>>>` → `git add` → `git commit`
2. Ou abortar merge: `git merge --abort`
3. Re-rodar health check para confirmar saída do conflict state
4. SLA: 60 min (MEDIUM)

---

## memory

### Cenário — grafo corrompido ou inacessível

**O que vive no grafo de memória:**

- Decisões de arquitetura pendentes de ADR formal
- Linguagem ubíqua acordada pelo time (termos do domínio NovaTech)
- Contexto de sessões anteriores que o agente usaria para continuidade

**O que é perdido:** contexto de sessão. Decisões já em ADRs (`docs/adr/`) **não são afetadas** — a memória MCP complementa, não substitui, os ADRs.

**O que o agente NÃO pode fazer:**

- Acessar linguagem ubíqua armazenada em sessões anteriores
- Recuperar decisões informais que não foram formalizadas em ADR

**O agente PODE continuar:** operando em modo stateless — sem memória de contexto de sessões anteriores. O agente deve declarar explicitamente que está operando sem memória persistente.

**Mensagem de aviso ao usuário (texto literal):**

```
ℹ️  Memória de contexto indisponível

O grafo de memória não está acessível. Esta sessão opera sem
contexto de decisões anteriores não formalizadas.

Decisões documentadas em docs/adr/ continuam disponíveis.
Para recuperar o grafo: veja runbook §memory/recuperação.
```

**Recuperação:**

1. Verificar se o processo do server-memory ainda está rodando: `npx @modelcontextprotocol/server-memory` deve iniciar sem erro
2. O server-memory persiste o grafo em memória volátil por padrão — reiniciar o server apaga o grafo
3. Se o grafo tinha dados importantes, verificar se há export anterior (`memory_export.json` se alguém exportou manualmente)
4. Reconstruir a linguagem ubíqua mais crítica a partir de `docs/adr/` e dos specs do projeto
5. SLA: 30 min para confirmar que o server responde; reconstrução do grafo é processo contínuo

**Nota sobre backup:** o `server-memory` padrão não persiste em disco entre reinicializações. Decisões de valor devem ser formalizadas em ADR ou em specs, não apenas no grafo. Se persistência cross-session for necessária, avaliar upgrade para server-memory com backend de arquivo (fora do escopo desta fase).

---

## everything

### Cenário — server não inicia na máquina de um dev

**Impacto em produção:** nenhum. `everything` é exclusivamente uma ferramenta de aprendizado de primitivas MCP. Não há nenhum fluxo de produto ou pipeline de desenvolvimento que dependa dele.

**Impacto em desenvolvimento:** o dev perde a capacidade de explorar interativamente tools, resources e prompts do protocolo MCP. Não bloqueia nenhuma tarefa do projeto.

**O agente PODE continuar:** todas as operações normais de desenvolvimento.

**Ação recomendada:**

```bash
# Limpar cache e reinstalar
npx --yes @modelcontextprotocol/server-everything
```

Não escalar. Não acionar Tech Lead. Dev resolve localmente.

---

## Procedimento Geral de Detecção e Escalonamento

```
Dev nota comportamento estranho no agente
         │
         ▼
Rodar: node .mcp/health-check.mjs
         │
         ├─ exit=0 (ALL HEALTHY) ──► problema não é MCP; investigar prompt/modelo
         │
         ├─ exit=1 (DEGRADED) ──────► ver seção do server degradado neste runbook
         │                            resolver em até SLA definido na tabela
         │
         └─ exit=2 (OFFLINE) ───────► acionar Tech Lead imediatamente se server crítico
                                      (filesystem ou memory)
                                      git OFFLINE sem uvx: resolver localmente (instalar uvx)
                                      everything OFFLINE: ignorar, não escalar
```
