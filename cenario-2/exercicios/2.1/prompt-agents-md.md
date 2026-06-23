# Prompt — Geração do AGENTS.md (seções Tech Lead)

> **Uso:** Cole este prompt em qualquer agente de IA (Claude Code, GitHub Copilot Chat, etc.)  
> **Saída esperada:** Conteúdo pronto para substituir os blocos `<!-- TODO (Tech Lead — Ex. 2.1) -->` no arquivo `novatech-assistant/AGENTS.md`

---

## PROMPT

```
Você é um Tech Lead sênior responsável por escrever a "constitution" do repositório novatech-assistant — o arquivo AGENTS.md que todo agente de IA (Copilot, Claude Code) lê antes de gerar qualquer artefato no projeto.

O AGENTS.md funciona como um contrato entre humanos e agentes: ele contém apenas decisões duráveis. Não inclua TODOs, roadmap, nem itens que mudam a cada sprint.

---

### CONTEXTO DO PROJETO

**Produto:** NovaTech Assistant — sistema RAG (Retrieval-Augmented Generation) corporativo que responde perguntas de operadores da NovaTech sobre SLA, frete, devoluções e compliance usando a base documental interna.

**Stack:**
- Linguagem: TypeScript 5.5+ com strict mode obrigatório
- Runtime: Node.js (ES Modules — `"type": "module"`)
- Backend: Azure Functions v4 (HTTP triggers)
- Busca vetorial: Azure AI Search
- LLM: Azure OpenAI
- Estado e feedback: Cosmos DB
- Validação de schema: Zod 3.x (toda fronteira de entrada/saída)
- Testes: Vitest 2.x
- Logging: pino (proibido usar console.log em qualquer módulo)
- Bot: Microsoft Teams via Adaptive Cards
- IaC: Azure Bicep (pasta `infra/`)
- CI/CD: GitHub Actions (`.github/workflows/ci.yml` e `cd.yml`)

**Estrutura de pastas relevante:**
```
novatech-assistant/
├── src/
│   ├── functions/       # Azure Functions (endpoints HTTP)
│   ├── services/        # Lógica de negócio e integrações
│   ├── pipeline/        # Pipeline de ingestão RAG
│   ├── bot/             # Teams bot
│   ├── web/             # Painel React
│   └── shared/          # Tipos, utilitários, constantes
├── tests/
│   ├── fixtures/
│   ├── integration/
│   └── e2e/
├── prompts/             # System prompt e changelog de prompt
├── docs/
│   ├── adr/             # Architectural Decision Records
│   ├── novatech/        # Docs de negócio (SLA, políticas, FAQ)
│   └── runbooks/
├── specs/               # Especificações de módulo (SDD)
├── infra/               # Bicep
└── data/retrieval-corpus/
```

---

### DECISÕES ARQUITETURAIS OBRIGATÓRIAS (ADR-0002 — Gerenciamento de Contexto)

Estas regras **devem aparecer literalmente** na seção Tech Stack & Architecture do AGENTS.md:

1. **Orçamento máximo por query: 8.000 tokens**, distribuídos:
   - System prompt: 800 tokens
   - Pergunta do usuário: 200 tokens
   - Histórico de conversa: 1.500 tokens
   - Chunks recuperados: 5.500 tokens

2. **Recuperação: 5 chunks de até 1.000 tokens cada**
   - Chunks que excedem 1.000 tokens **devem ser subdivididos** durante a indexação
   - Sobreposição entre chunks: 10%

3. **Queries multi-domínio: diversificação forçada por domínio**
   - Domínios detectados via keywords: SLA, Frete, Devolução, Compliance
   - Se múltiplos domínios detectados: garantir mínimo de 1 chunk por domínio nos 5 slots disponíveis
   - Fallback (nenhum domínio detectado): busca semântica pura sem diversificação

4. **Context rot em conversas longas: sliding window com âncora na primeira pergunta**
   - Sempre preservar: primeiro par Q&A (âncora de contexto)
   - Mais: últimos 2 pares Q&A (excluindo o primeiro)
   - Total: máximo 3 pares ≈ 1.500 tokens de histórico
   - Reset de sessão: usuário digita "nova consulta" ou "mudar assunto" → descarta todo histórico

---

### OUTRAS DECISÕES DURÁVEIS

- **Commits:** Conventional Commits obrigatório (`feat:`, `fix:`, `docs:`, `test:`, `chore:`)
- **Branch strategy (fase local):** feature branches locais; "abrir PR" = criar `docs/pull-requests/PR-NNNN.md` com objetivo, mudanças e checklist de validation gates
- **Documentos contraditórios:** usar metadado `vigency` — sempre priorizar o documento mais recente (ADR-0003)
- **Build:** `tsc -p .` (sem bundler externo nesta fase)
- **Lint:** ESLint com configuração do projeto (`eslint .`)
- **CI gates obrigatórios:** lint → build → testes unitários → testes de integração (nessa ordem)
- **CD:** Deploy automático via `cd.yml` ao merge em `main`; ambiente de homologação obrigatório antes de produção

---

### TAREFA

Escreva o conteúdo das seguintes seções do AGENTS.md, **exatamente nesta ordem e com estes títulos**:

1. `## Project Overview`
2. `## Tech Stack & Architecture`
3. `## Coding Standards`
4. `## Build & Deploy`

**Regras de escrita:**
- Escreva em inglês (o AGENTS.md é lido por agentes internacionais)
- Use listas e sub-listas onde couber — agentes processam melhor listas do que parágrafos longos
- Seja prescritivo: use "must", "never", "always" para regras invioláveis; "prefer" para convenções
- Não repita informação entre seções
- Não adicione seções além das quatro solicitadas
- As regras da ADR-0002 devem aparecer como uma sub-seção nomeada `### Context Management Rules (ADR-0002)` dentro de `## Tech Stack & Architecture`
- O conteúdo deve ser auto-suficiente: um agente sem acesso ao restante do repositório deve conseguir entender e aplicar todas as regras

Produza **apenas o markdown das quatro seções**, sem preâmbulo nem explicação.
```
