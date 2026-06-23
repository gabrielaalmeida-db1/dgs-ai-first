# ADR-0005: Arquitetura de MCP — Servers Locais como Infraestrutura Gerenciada

## Status: Aceito

---

## Contexto

O projeto novatech-assistant usa quatro MCP servers locais para dar a agentes de IA (Claude Code, GitHub Copilot) acesso estruturado ao repositório, à documentação de negócio e à memória de decisões. Todos rodam via `npx`/`uvx` sem dependências de serviços externos.

O risco identificado: tratar MCP servers como configuração ad-hoc — adicionados sem revisão, sem escopo documentado, sem monitoramento — é equivalente a dar a um serviço de terceiro acesso não auditado ao repositório e à base documental. Uma misconfiguration pode expor paths de escrita onde só leitura é adequada, ou integrar um server não revisado que executa código arbitrário.

A decisão esta ADR documenta: tratar cada MCP server como peça de infraestrutura gerenciada, com escopo mínimo declarado, política de aprovação, contrato de monitoramento e procedimento de rollback.

---

## Diagrama de Topologia

```
┌─────────────────────────────────────────────────────────────────────┐
│  AGENTES DE DESENVOLVIMENTO                                          │
│  ┌──────────────────┐    ┌──────────────────────────────────────┐   │
│  │   Claude Code    │    │         GitHub Copilot               │   │
│  └────────┬─────────┘    └──────────────┬───────────────────────┘   │
│           │                             │                           │
└───────────┼─────────────────────────────┼───────────────────────────┘
            │                             │
            ▼                             ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  MCP SERVERS (.mcp/mcp.json)                                              │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  filesystem  (npx @modelcontextprotocol/server-filesystem)          │  │
│  │                                                                     │  │
│  │  ┌──────────────────────────────┐  ┌────────────────────────────┐  │  │
│  │  │  ZONA DE DESENVOLVIMENTO     │  │  ZONA DE CONHECIMENTO       │  │  │
│  │  │  [read-write]                │  │  DE NEGÓCIO [read-only]     │  │  │
│  │  │  ./src                       │  │  ./docs/novatech/  ←───────┼──┼──┤← FRONTEIRA
│  │  │  ./specs                     │  │  ./data/retrieval-corpus/  │  │  │   sem escrita
│  │  │  ./skills                    │  └────────────────────────────┘  │  │
│  │  └──────────────────────────────┘                                  │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                           │
│  ┌──────────────────────────────────┐                                     │
│  │  git  (uvx mcp-server-git)       │  [read-only]                        │
│  │  → repositório local             │  histórico, diff, branches           │
│  └──────────────────────────────────┘                                     │
│                                                                           │
│  ┌──────────────────────────────────┐                                     │
│  │  memory  (npx server-memory)     │  [read-write]                       │
│  │  → grafo local persistente       │  decisões, linguagem ubíqua          │
│  └──────────────────────────────────┘                                     │
│                                                                           │
│  ┌──────────────────────────────────┐                                     │
│  │  everything  (npx server-everyt.)│  [dev-only]                         │
│  │  → sem filesystem real           │  exploração de primitivas MCP        │
│  └──────────────────────────────────┘                                     │
└───────────────────────────────────────────────────────────────────────────┘

Legenda:
  rw  = read-write (agente pode criar, editar, deletar)
  ro  = read-only  (agente pode ler, nunca escrever)
  dev = dev-only   (sem impacto em produção; não expõe filesystem real)
```

---

## Decisão

### 1. Servers autorizados e escopos

| Server       | Comando runtime | Paths / Alvo                                              | Escopo     | Ambiente  |
|--------------|-----------------|-----------------------------------------------------------|------------|-----------|
| `filesystem` | `npx`           | `./src`, `./specs`, `./skills`                            | read-write | dev + ci  |
| `filesystem` | `npx`           | `./docs/novatech`, `./data/retrieval-corpus`              | read-only  | dev + ci  |
| `git`        | `uvx`           | `.` (repositório local)                                   | read-only  | dev + ci  |
| `memory`     | `npx`           | grafo local persistente                                   | read-write | dev       |
| `everything` | `npx`           | — (sem filesystem)                                        | dev-only   | dev       |

O arquivo `.mcp/mcp.json` é a fonte de verdade. Toda configuração divergente do `.mcp/mcp.json` versionado é inválida.

### 2. Política de aprovação de novo server

#### Proposta

Qualquer membro do time pode propor um novo server. A proposta é um PR que modifica `.mcp/mcp.json` e inclui obrigatoriamente:

1. **Justificativa de necessidade**: qual capacidade o time não tem sem esse server.
2. **Análise de escopo mínimo**: qual o menor conjunto de paths/permissões suficiente para a necessidade descrita. Todo path read-write deve ter justificativa explícita.
3. **Modelo de ameaça**: o que um agente mal-direcionado poderia fazer com esse server ativo. Para servers que expõem filesystem com escrita, o PR deve listar os paths e confirmar que não incluem `.env`, `infra/`, `**/secrets/`.

#### Revisão e aprovação

| Tipo de server                                      | Quem revisa                      | Aprovação mínima              |
|-----------------------------------------------------|----------------------------------|-------------------------------|
| Dev-only, sem filesystem real (ex: `everything`)    | Qualquer dev sênior              | 1 aprovação                   |
| Filesystem read-only (ex: `docs/novatech`)          | Tech Lead                        | 1 aprovação do Tech Lead      |
| Filesystem read-write (ex: `./src`)                 | Tech Lead + Dev Sênior           | 2 aprovações                  |
| Expõe serviço externo ou credenciais                | Tech Lead + Delivery Manager     | 2 aprovações + revisão de segurança |

#### Re-revisão obrigatória

Um server já aprovado exige nova revisão completa quando:
- Um path é adicionado ao escopo (qualquer permissão)
- Uma permissão é elevada de `ro` para `rw`
- O pacote npm/pypi do server é atualizado de minor ou maior (patch é isento)
- O mesmo server passa a ser usado em mais de um contexto (ex: de dev para ci)

#### Diferença entre server de desenvolvimento e server de produção

`everything` e qualquer server sem acesso a filesystem real são classificados como **dev-only**. Eles:
- Não passam por análise de ameaça
- Podem ser adicionados com 1 aprovação de dev sênior
- São marcados com `"env": "dev"` em comentário no mcp.json (convenção interna)
- Não impactam fluxos de produção se ficarem offline

Servers com acesso a `./src`, `./specs`, `./skills`, `./docs/novatech` são **infraestrutura gerenciada** e seguem o processo completo acima.

### 3. Contrato de monitoramento

O health check é executado pelo script `.mcp/health-check.mjs`. Executar `node .mcp/health-check.mjs` a partir da raiz do repositório.

| Server       | Critério "HEALTHY"                                                                          | Intervalo recomendado | Owner do alerta |
|--------------|---------------------------------------------------------------------------------------------|-----------------------|-----------------|
| `filesystem` | Server responde + `docs/novatech/` listado + ao menos 1 arquivo legível + ≥1 tool exposta  | Antes de cada sessão  | Dev ativo       |
| `git`        | Server responde + `git_status` retorna branch atual + zero linhas UU/AA/DD no status       | Antes de cada sessão  | Dev ativo       |
| `memory`     | Server responde + roundtrip `create_entities` → `search_nodes` → `delete_entities` < 2s   | Antes de cada sessão  | Dev ativo       |
| `everything` | Server responde + `tools/list` retorna ≥ 5 tools                                           | Uma vez por dia       | Dev local       |

**Procedimento padrão:** rodar o health check antes de iniciar uma sessão de desenvolvimento que envolva agentes. Se qualquer server crítico (`filesystem`, `git`, `memory`) retornar DEGRADED ou OFFLINE, não iniciar a sessão antes de remediar. O script retorna exit code `2` se qualquer server estiver OFFLINE — usar isso em scripts de pre-commit se desejado.

### 4. Política de versionamento de escopo

#### Proposta de mudança

Toda mudança de escopo (adicionar/remover path, elevar permissão) segue o mesmo fluxo de PR da política de aprovação acima. O PR deve incluir:

- Diff do `.mcp/mcp.json` mostrando exatamente o que muda
- Lista de fluxos de agente que dependem do escopo atual (para avaliar impacto de remoções)
- Confirmação de que `.mcp/mcp.example.json` foi atualizado para refletir a nova configuração canônica

#### Notificação ao time (sem CI remoto)

Nesta fase o repositório é local sem remote. O mecanismo de notificação é:

1. O PR description usa a tag `[MCP-SCOPE-CHANGE]` no título
2. O Tech Lead informa o time no canal de desenvolvimento antes do merge
3. Cada dev faz `git pull` e verifica que o `.mcp/mcp.json` local foi atualizado antes da próxima sessão
4. O hook `post-merge` (se configurado) pode invocar `.mcp/health-check.mjs` automaticamente

#### Procedimento de rollback

Se uma mudança de escopo quebrar um fluxo:

1. Reverter `.mcp/mcp.json` para o commit anterior: `git show HEAD~1:.mcp/mcp.json > .mcp/mcp.json`
2. Reiniciar os MCP servers na IDE (reload da configuração)
3. Rodar `.mcp/health-check.mjs` para confirmar que o estado anterior restaurou os servers
4. Abrir issue documentando qual fluxo quebrou e por quê, antes de re-propor a mudança

A reversão não requer aprovação — qualquer dev pode reverter imediatamente. A re-proposta da mudança requer o processo completo.

---

## Consequências

**Positivas:**
- Todo dev sabe exatamente quais paths um agente pode ler ou escrever
- Mudanças de escopo são auditáveis via git log de `.mcp/mcp.json`
- O health check detecta regressões de configuração antes de começar uma sessão
- O processo de aprovação diferencia risco por tipo de server, sem burocratizar servers de desenvolvimento

**Negativas:**
- Adicionar um server de infraestrutura (read-write em paths de código) requer 2 aprovações, o que é um atrito intencional
- O health check depende de `npx` e `uvx` instalados — ambientes sem eles reportarão OFFLINE para os servers correspondentes (documentado como limitação conhecida)

---

## Alternativas Consideradas

**1. Configuração ad-hoc por dev:** cada dev mantém seu próprio `.mcp/mcp.json` sem versionamento. Descartado — impossibilita auditoria e cria divergências silenciosas entre ambientes.

**2. Um único server filesystem com acesso total ao repositório:** mais simples, mas viola least-privilege — um agente com escrita em `./docs/novatech` pode corromper a base documental. Descartado.

**3. Aprovação única do Tech Lead para todos os servers:** simplificaria o processo mas cria gargalo para servers de desenvolvimento. A diferenciação por risco (1 aprovação para dev-only, 2 para infraestrutura) equilibra agilidade com segurança.
