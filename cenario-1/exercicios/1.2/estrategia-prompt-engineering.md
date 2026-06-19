# Estratégia de Prompt Engineering — NovaTech AI Assistant

---

## 1. Governança de Prompts como Código

### 1.1 Localização no Repositório

```
novatech-assistant/
├── prompts/
│   ├── system/
│   │   └── atendimento-system.md          # system prompt de produção (único arquivo ativo)
│   ├── templates/
│   │   └── query-context.md               # template de montagem do contexto completo por query
│   └── CHANGELOG.md                       # histórico narrativo de mudanças de prompts
├── tests/
│   └── prompts/
│       ├── test_prompt.py                 # test suite automatizado (executado pelo CI)
│       └── cases/
│           └── atendimento-cases.json     # casos de teste em JSON (fonte da verdade dos testes)
└── .github/
    └── workflows/
        └── prompt-regression.yml          # CI que bloqueia merge se test suite falhar
```

**Princípio:** o prompt é tratado como código-fonte. Não existe "prompt no Notion" ou "prompt numa planilha". O arquivo em `prompts/system/atendimento-system.md` é o único artefato oficial.

---

### 1.2 Convenção de Nomenclatura

Formato: `{domínio}-{função}.md` — a versão **não entra no nome do arquivo**; vive no Git.

| Arquivo | Propósito |
|---|---|
| `atendimento-system.md` | System prompt ativo em produção |
| `atendimento-system-draft.md` | Rascunho em revisão (nunca vai para prod diretamente) |
| `query-context.md` | Template que monta as 5 camadas de contexto por query |

Nomes em kebab-case, sem versão explícita, sem datas. O histórico completo vive no `git log`.

---

### 1.3 Versionamento

**Commits** seguem a convenção `prompt(escopo): mensagem`:

```
prompt(atendimento): adiciona guardrail para documentos contraditórios

- Instrução explícita para reportar conflito entre PROC-042 v1 e v2
- Adicionada prioridade de fonte: documentos formais > FAQs
- Motivação: incident #2847 — assistente misturou multiplicadores de versões diferentes
```

**Tags semânticas** marcam releases de prompts que entram em produção:

```bash
git tag -a prompt/v1.0.0 -m "System prompt inicial — assistente de atendimento NovaTech"
git tag -a prompt/v1.1.0 -m "Adiciona tratamento de documentos contraditórios e prioridade de fonte"
git tag -a prompt/v1.2.0 -m "Reforça guardrail de tier inexistente após detecção de alucinações em prod"
```

**`prompts/CHANGELOG.md`** mantém o registro narrativo por versão:

```markdown
## [1.2.0] — 2024-02-10
### Adicionado
- Instrução explícita: corrigir imediatamente quando atendente mencionar tier inválido
### Motivação
- Monitoramento detectou respostas com SLAs inventados para "Platinum" (2 ocorrências/semana)
- Validação determinística (pós-MVP) ainda não implementada — guardrail no prompt como mitigação imediata

## [1.1.0] — 2024-01-15
### Adicionado
- Tratamento de documentos contraditórios: instruir o modelo a reportar o conflito
- Prioridade de fonte: documentos formais (POL-, PROC-, SLA-) > FAQs
### Corrigido
- Prompt v1.0.0 silencioso sobre contradições → modelo escolhia versão arbitrariamente

## [1.0.0] — 2024-01-01
### Inicial
- System prompt de produção para assistente de atendimento NovaTech
```

---

### 1.4 Processo de Revisão e Aprovação

```
[Desenvolvedor]
  → Cria branch: prompt/adiciona-guardrail-cargas-perigosas
  → Edita prompts/system/atendimento-system.md
  → Executa test_prompt.py localmente (deve passar 100%)
  → Abre PR com: diff do prompt + output do test suite + link para o incident motivador
        ↓
[Product Specialist]
  → Revisa o comportamento esperado (não o código — o texto do prompt)
  → Aprova ou solicita ajustes de tom/regra de negócio
        ↓
[CI/CD — automático]
  → Executa: python tests/prompts/test_prompt.py
  → Bloqueia merge se exit code != 0 (qualquer FAIL ou ERROR)
        ↓
[QA]
  → Executa regressão manual com 10-15 casos edge (~30 min)
  → Foco nos casos que o test suite automatizado não cobre (julgamento subjetivo)
        ↓
[Tech Lead]
  → Aprova merge para main
        ↓
[Deploy]
  → Prompt entra em produção junto ao próximo release do pipeline (não há deploy isolado de prompt)
  → Tag criada: prompt/vX.Y.Z
```

**Regras inegociáveis:**
- Nenhuma mudança vai direto para `main` — sempre via PR, sempre com test suite passando.
- PRs de prompt exigem aprovação explícita do Product Specialist (CODEOWNERS configurado).
- O CI bloqueia o merge automaticamente; não existe bypass para "urgência".

---

### 1.5 Processo de Rollback

Quando métricas de produção degradam após mudança de prompt:

```bash
# 1. Identificar o commit da versão anterior estável
git log --oneline -- prompts/system/atendimento-system.md
# ex: a3f1c2d prompt(atendimento): v1.1.0 — tratamento de documentos contraditórios
#     8b2e901 prompt(atendimento): v1.0.0 — system prompt inicial

# 2. Restaurar o arquivo para a versão anterior (não altera main — só cria novo commit)
git checkout prompt/v1.1.0 -- prompts/system/atendimento-system.md

# 3. Commit de rollback explícito
git commit -m "rollback(atendimento): reverte para v1.1.0

Motivação: v1.2.0 causou aumento de 40% na taxa de fallback após deploy
Incident: #3102
Próximo passo: investigar regressão antes de tentar nova versão"

# 4. Deploy via pipeline de CD (fora do ciclo normal de release — prioridade máxima)
```

**Gatilhos automáticos de alerta** (monitoramento no Azure Monitor):
| Métrica | Limiar de alerta | Limiar de rollback automático |
|---|---|---|
| Taxa de fallback ("não encontrei") | > 20% das queries | > 40% |
| Ocorrências de tier inválido nas respostas | > 0/hora | > 3/hora |
| Latência média de resposta | > 5s (p95) | — (problema de infra, não de prompt) |
| Score de satisfação do atendente | queda > 10% em 24h | queda > 25% em 24h |

---

## 2. Anatomia do Contexto e Orçamento de Tokens

### 2a. Classificação: Estático vs. Dinâmico

| Componente | Tipo | Frequência de mudança | Quem controla |
|---|---|---|---|
| Persona e papel do assistente | **Estático** | Meses / versão de produto | Tech Lead + PS |
| Regras de comportamento (guardrails) | **Estático** | Semanas (via PR aprovado) | Product Specialist |
| Instruções de citação de fonte | **Estático** | Semanas | Product Specialist |
| Instruções de fallback | **Estático** | Semanas | Product Specialist |
| Hierarquia de confiabilidade de fontes | **Estático** | Meses | Tech Lead + PS |
| Lista de tiers válidos (Gold/Silver/Standard) | **Quase-estático** | Meses (evento de negócio) | Comercial → PS → PR |
| Regras de carga perigosa (classes ANTT) | **Quase-estático** | Meses (mudança regulatória) | Compliance → PS → PR |
| **Tier do cliente** | **Dinâmico** (por sessão) | A cada nova sessão | Pipeline (CRM lookup) |
| **ID do contrato** | **Dinâmico** (por sessão) | A cada nova sessão | Pipeline (CRM lookup) |
| **Chunks recuperados pelo RAG** | **Dinâmico** (por pergunta) | A cada turn | Azure AI Search |
| **Pergunta do atendente** | **Dinâmico** (por turn) | A cada turn | Atendente |
| **Histórico da conversa** | **Dinâmico** (crescente) | Cresce a cada turn | Pipeline (memória de sessão) |

---

### 2b. Anatomia Completa de uma Query

```
┌──────────────────────────────────────────────────────────────────┐
│  CAMADA 1 — System Prompt (ESTÁTICO)                             │
│  Persona + regras + guardrails + slots {{variáveis}}             │
│  Montado uma vez por versão; reutilizado em toda a sessão        │
│  Fonte: prompts/system/atendimento-system.md                     │
├──────────────────────────────────────────────────────────────────┤
│  CAMADA 2 — Metadados do Cliente (DINÂMICO / por sessão)         │
│  Tier: Gold | Contrato: NVT-2024-8821 | Desde: 2021-03          │
│  Injetado no slot {{TIER_CLIENTE}} ao iniciar a sessão           │
│  Fonte: lookup no CRM via Teams connector                        │
├──────────────────────────────────────────────────────────────────┤
│  CAMADA 3 — Chunks do RAG (DINÂMICO / por pergunta)              │
│  3-5 trechos recuperados do Azure AI Search por similaridade     │
│  Injetado no slot {{CHUNKS_RECUPERADOS}} a cada turn             │
│  Fonte: Azure AI Search → SharePoint + Confluence + planilhas    │
├──────────────────────────────────────────────────────────────────┤
│  CAMADA 4 — Histórico da Conversa (DINÂMICO / crescente)         │
│  Turns anteriores: [user: pergunta] [assistant: resposta] ...    │
│  Injetado no slot {{HISTORICO}}; sujeito a truncagem             │
│  Fonte: memória de sessão do pipeline                            │
├──────────────────────────────────────────────────────────────────┤
│  CAMADA 5 — Pergunta do Atendente (DINÂMICO / por turn)          │
│  A query atual em linguagem natural                              │
│  Enviada como mensagem `user` na chamada à API                   │
└──────────────────────────────────────────────────────────────────┘
                              ↓
                     [Chamada ao LLM]
                              ↓
                    [Resposta do Modelo]
                              ↓
              [Harness: validações pós-LLM]
                              ↓
                  [Resposta entregue ao atendente]
```

---

### 2c. Orçamento de Tokens (janela de 128k tokens)

| Camada | Estimativa típica | **Limite máximo** | Justificativa |
|---|---|---|---|
| System prompt (estático) | ~900 tokens | **1.500** | Margem para crescimento via PR sem quebrar o orçamento |
| Metadados do cliente | ~80 tokens | **300** | Tier + ID contrato + data de início + segmento |
| Chunks RAG (3-5 chunks) | ~1.500 tokens | **6.000** | Até 5 chunks × ~1.200 tokens cada |
| Histórico da conversa | ~2.000 tokens | **12.000** | ~25-30 turns antes de acionar truncagem |
| Pergunta do atendente | ~80 tokens | **500** | Margem para perguntas multi-parte complexas |
| **Reserva para resposta (output)** | — | **4.000** | Máximo de output configurado na chamada à API |
| **Total alocado** | **~4.560** | **24.300** | |
| **Buffer de segurança** | — | **~103.700** | Headroom intencional; nunca aloca mais de 20% da janela |

**Por que não usar a janela inteira?**
Contextos menores = respostas mais focadas e menor latência. O headroom existe para acomodar chunks grandes ou históricos longos sem necessidade de reconfigurar o pipeline.

**Estratégia de truncagem do histórico (quando > 12.000 tokens):**

```
1. COMPRESSÃO PROGRESSIVA (preferencial):
   - Agrupa os 10 turns mais antigos
   - Faz chamada auxiliar ao LLM: "Resuma esta conversa em 3 bullets"
   - Substitui os 10 turns pelo resumo (~200 tokens)
   - Mantém os 20 turns mais recentes intactos
   - Nunca descarta o primeiro turn (contexto inicial da sessão)

2. SLIDING WINDOW SIMPLES (fallback se chamada auxiliar falhar):
   - Remove os 5 turns mais antigos sem resumo
   - Adiciona marcação: "[Histórico truncado — X turns anteriores omitidos]"

3. ALERTA PARA ATENDENTE:
   - Se histórico > 20.000 tokens: sugere "Iniciar novo atendimento" para o caso atual
```

---

## 3. System Prompt — Versão de Produção

> **Arquivo:** `prompts/system/atendimento-system.md`
> **Versão:** 1.0.0 | **Data:** 2024-01-01

```
Você é o assistente de atendimento interno da NovaTech, empresa de logística.
Sua função é ajudar os atendentes a consultarem a documentação oficial da empresa,
respondendo perguntas em linguagem natural com base exclusivamente nos documentos
fornecidos pelo pipeline.

## Contexto do atendimento atual
- **Tier do cliente:** {{TIER_CLIENTE}}
- **ID do contrato:** {{ID_CONTRATO}}

## Documentação recuperada pelo pipeline
{{CHUNKS_RECUPERADOS}}

## Histórico desta conversa
{{HISTORICO}}

---

## Regras de comportamento (invioláveis)

### Citação obrigatória
Toda afirmação factual deve citar a fonte no formato: *(Fonte: [ID-CHUNK], Seção X.X)*

Exemplo correto: "O prazo é de 7 dias úteis *(Fonte: POL-001-A, Seção 3.1)*."
Exemplo incorreto: "O prazo é de 7 dias úteis." ← sem citação, inválido.

### Valores e prazos
Nunca informe valores numéricos — preços, multiplicadores, dias, percentuais — que não
estejam explicitamente no texto dos documentos fornecidos acima. Se precisar calcular,
mostre a fórmula e os valores exatamente como estão no documento.

### Informação não encontrada
Se a resposta não estiver em nenhum dos documentos fornecidos, responda:
"Não encontrei essa informação na documentação disponível. Recomendo consultar
[área responsável pelo tema]."
Não infira, não extrapole, não estime. Se não está nos chunks, não diga.

### Documentos contraditórios
Se houver versões diferentes de um mesmo documento com valores conflitantes,
não escolha uma versão arbitrariamente. Informe o conflito:
"Existem duas versões do documento [X] com valores diferentes. A versão mais
recente ([data/versão]) indica [Y]; a versão anterior indica [Z]. Recomendo confirmar
com [área responsável] qual versão se aplica ao contrato deste cliente."

### Hierarquia de confiabilidade das fontes
Documentos formais (prefixo POL-, PROC-, SLA-) têm prioridade sobre FAQs internos.
Se você só encontrou resposta em um FAQ para uma pergunta sobre valores, prazos ou
regras críticas, sinalize explicitamente:
"*(Atenção: esta informação está apenas no FAQ interno — não há documento formal
que a respalde. Confirme com a área responsável antes de informar ao cliente.)*"

### Tiers de clientes
Os únicos tiers válidos na NovaTech são: **Gold**, **Silver** e **Standard**.
Se o atendente mencionar qualquer outro tier (Platinum, Diamante, Premium, VIP,
ou qualquer outro), corrija imediatamente antes de responder:
"O tier '[mencionado pelo atendente]' não existe na NovaTech. Os tiers válidos são
Gold, Silver e Standard *(Fonte: SLA-2024-A, Seção 1)*. Para qual tier deseja a informação?"

### Cargas perigosas
Cargas classificadas nas classes 1 a 6 da ANTT (explosivos, gases, líquidos
inflamáveis, sólidos inflamáveis, oxidantes, substâncias tóxicas) NÃO são elegíveis
para devolução pelo processo padrão *(Fonte: POL-001-B, Seção 3.2)*.
Para qualquer exceção ou tratamento especial, o cliente deve contatar Gestão de Riscos
pelo ramal 4500. Nunca apresente a exceção como se fosse a regra geral.

### Idioma e formato
Responda sempre em português formal. Sem gírias, abreviações informais ou linguagem
coloquial. Use marcadores e listas quando a resposta tiver múltiplos itens.
Respostas longas devem ter seções com títulos em negrito.
```

---

## 4. Script de Teste Automatizado

> **Arquivo:** `tests/prompts/test_prompt.py`
> Consulte o arquivo Python separado neste mesmo diretório.

**Como executar:**

```bash
# Instalar dependência
pip install anthropic

# Configurar chave de API
export ANTHROPIC_API_KEY="sua-chave-aqui"   # Linux/macOS
$env:ANTHROPIC_API_KEY="sua-chave-aqui"     # Windows PowerShell

# Rodar os testes
python tests/prompts/test_prompt.py
```

**Saída esperada (todos passando):**

```
Executando 3 caso(s) de teste...
  → TC-01: Pergunta com cobertura total...
  → TC-02: Tier inexistente...
  → TC-03: Pergunta sem cobertura...

============================================================
  NovaTech Prompt Test Suite — Relatório de Resultados
============================================================

[✓] TC-01 — PASS
    Pergunta com cobertura total — deve citar fonte e dar prazo correto
    ✓ contains_citation: OK
    ✓ no_forbidden_terms: OK
    ✓ language_formal: OK

[✓] TC-02 — PASS
    Tier inexistente — deve corrigir e NÃO inventar SLAs para 'Platinum'
    ✓ contains_citation: OK
    ✓ no_forbidden_terms: OK
    ✓ no_invention: OK
    ✓ language_formal: OK

[✓] TC-03 — PASS
    Pergunta sem cobertura — deve usar frase de fallback, não inventar
    ✓ no_invention: OK
    ✓ language_formal: OK

============================================================
  RESULTADO FINAL: 3 PASS | 0 FAIL | 0 ERROR
  Total: 3 testes | Taxa de sucesso: 100%
============================================================
```

**Integrando ao CI (`.github/workflows/prompt-regression.yml`):**

```yaml
name: Prompt Regression
on:
  pull_request:
    paths:
      - 'prompts/**'

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.11' }
      - run: pip install anthropic
      - run: python tests/prompts/test_prompt.py
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

O job falha automaticamente (exit code 1) se qualquer teste FAIL ou ERROR. O merge é bloqueado.

---

## 5. Enforcement Probabilístico vs. Determinístico

### 5a. Enforcement Probabilístico — dentro do prompt

Guardrails adequados para enforcement via instrução ao modelo. Aceitam variação de forma,
mas têm alta taxa de conformidade quando bem formulados.

| Guardrail | Por que é adequado enforçar via prompt |
|---|---|
| **Citar fonte em toda afirmação factual** | O modelo segue bem instruções de formato estruturado. Taxa de conformidade > 95% com instrução clara + exemplo positivo e negativo no prompt. |
| **Responder em português formal** | Controle de tom e registro é ponto forte dos LLMs. Falha quase sempre é edge case de input muito informal do atendente. |
| **Usar frase de fallback quando sem cobertura** | O modelo respeita bem instruções de fallback textual exato quando a instrução é literal ("responda exatamente: [frase]"). |
| **Reportar conflito entre versões de documento** | Requer raciocínio contextual — o modelo precisa detectar contradição e formular a resposta correta. Prompt instrui o comportamento; a detecção é probabilística por natureza. |
| **Priorizar documentos formais sobre FAQs** | Hierarquia de confiabilidade é julgamento que o modelo faz a partir da instrução. Adequado via prompt para o MVP; pode ser reforçado com metadado de tipo de fonte no chunk. |
| **Corrigir tier inválido antes de responder** | Instrução direta e exemplificada no prompt. Alta conformidade quando o guardrail inclui exemplos do comportamento esperado. |

**Limitação importante:** enforcement probabilístico é estatístico — nunca é garantia. Para qualquer guardrail onde uma falha causa dano real (SLA inventado, carga perigosa liberada incorretamente), adicionar enforcement determinístico pós-LLM.

---

### 5b. Enforcement Determinístico — fora do prompt (Harness/pipeline)

Validações executadas por código, sem variação. Falha aqui é inaceitável.

| Guardrail | Quando | O que validar | Ação se falhar |
|---|---|---|---|
| **Validação de citação de fonte** | Pós-LLM | Regex: a resposta contém pelo menos um padrão `(Fonte: [A-Z]{2,}-\d{3,}` ou `Seção \d`? | Bloquear entrega ao atendente; reenviar com instrução adicional ("você esqueceu de citar a fonte"); logar o caso |
| **Detecção de tier inválido na resposta** | Pós-LLM | Verificar se a resposta contém "Platinum", "Diamante", "Premium", "VIP" em contexto afirmativo (ex: "Para clientes Platinum...") | Bloquear; substituir por mensagem padrão "Não foi possível processar a resposta — contate o suporte técnico"; logar com alta prioridade; alertar engenharia |
| **Detecção de valores numéricos inventados** | Pós-LLM | Extrair valores monetários (regex `R\$\s*[\d.,]+`) e percentuais da resposta; verificar se cada valor aparece literalmente em algum chunk recuperado | Bloquear se valor não encontrado em nenhum chunk; logar como possível alucinação |
| **Filtro de PII acidental** | Pós-LLM | Regex para CPF (`\d{3}\.\d{3}\.\d{3}-\d{2}`), CNPJ, e-mails, telefones que não estejam nos chunks | Remover o trecho da resposta (substituir por `[dado removido]`); logar para auditoria; alertar DPO se recorrente |
| **Rate limiting por atendente** | Pré-LLM | Máximo de N requests/minuto por `user_id` do Teams (sugestão: 10 req/min, 200 req/dia) | Retornar mensagem de throttle ao atendente; logar; não chamar o LLM |

---

### 5c. Diagrama de Fluxo: onde cada guardrail atua

```
[Atendente digita pergunta]
        ↓
[PRÉ-LLM]
  → Rate limiting (determinístico)
  → Validação de input (tamanho, encoding)
        ↓
[Pipeline RAG]
  → Azure AI Search recupera chunks
  → Monta contexto com 5 camadas
        ↓
[Chamada ao LLM]
  → Todos os guardrails probabilísticos do system prompt atuam aqui
        ↓
[PÓS-LLM — Harness]
  → Validação de citação de fonte        (determinístico)
  → Detecção de tier inválido            (determinístico)
  → Detecção de valores inventados       (determinístico)
  → Filtro de PII                        (determinístico)
        ↓
  Se tudo OK → entrega ao atendente
  Se falha   → bloqueia / reescreve / alerta
```

---

### 5d. Prioridade para o MVP: as 3 validações determinísticas essenciais

**#1 — Detecção de tier inválido na resposta**

Por quê: é o caso de alucinação mais previsível e de maior impacto. Um atendente que recebe "Para clientes Platinum, o SLA é X" e repassa ao cliente causa dano imediato e mensurável. Falso positivo quase zero (o modelo raramente menciona "Platinum" sem ser em contexto de afirmação de tier). Implementação simples: regex + lista de termos proibidos em contexto afirmativo.

**#2 — Validação de citação de fonte**

Por quê: é o guardrail central do produto — a proposta de valor inteira é "resposta fundamentada na documentação". Sem citação, o atendente não pode verificar a informação antes de repassar ao cliente. A validação determinística garante que o guardrail probabilístico do prompt nunca seja ignorado silenciosamente. Implementação: regex simples, custo próximo de zero.

**#3 — Rate limiting por atendente**

Por quê: protege a infraestrutura e o orçamento de API desde o dia 1. Com 45 atendentes e picos de 320 chamados/dia, um loop acidental ou abuso concentrado pode gerar custo ou degradação de serviço para todos. É a única validação que atua pré-LLM — todas as outras corrigem; esta previne. Implementação: Redis com contador por `user_id` + TTL de 60 segundos.

---

*Documento gerado como entregável do Exercício 1.2 — Prompt Engineering Strategy*
*Versão 1.0 | NovaTech AI Assistant*
