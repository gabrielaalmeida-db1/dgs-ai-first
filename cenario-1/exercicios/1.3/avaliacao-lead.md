# Avaliação Técnica — Proposta de Arquitetura RAG

**Revisor:** Tech Lead  
**Data:** 2026-06-15  
**Proposta avaliada:** Arquitetura RAG para assistente interno da NovaTech  

---

## Resumo da Proposta

> Azure AI Search + embeddings ada-002 · índice único · chunking fixo 512 tokens sem overlap · top-3 chunks · GPT-4o · ingestão manual sob demanda.

---

## Problemas e Riscos Identificados

---

### 1. Ingestão manual sem gatilho — risco alto de respostas desatualizadas

**O problema:** O pipeline de ingestão "roda quando alguém lembra de atualizar". A documentação da NovaTech é atualizada mensalmente por três áreas distintas (Operações, Compliance, Comercial) sem processo unificado. Isso significa que o índice ficará desatualizado com frequência.

**Impacto:** O assistente pode responder com base em versões antigas de políticas de SLA, regras de frete ou normas de compliance — exatamente o tipo de inconsistência que o projeto foi contratado para resolver. O risco é ainda maior porque o cenário já indica que existem documentos contraditórios entre versões.

**Recomendação:** Automatizar a ingestão via event-driven (webhook/trigger no SharePoint e Confluence) ou ao menos um job agendado diário. Adicionar metadado de `data_versao` em cada chunk e expô-lo na resposta para que o atendente saiba a vigência da informação.

---

### 2. Índice único para todas as fontes — sem separação de contexto ou controle de acesso

**O problema:** Misturar ~800 documentos do SharePoint, ~400 páginas do Confluence e planilhas de rede num único índice sem namespace ou filtro por fonte ou área.

**Impacto:**
- **Relevância degradada:** Uma busca sobre "prazo de devolução" pode retornar chunks de manuais operacionais, planilhas de frete e políticas de compliance ao mesmo tempo, com o modelo precisando reconciliar contextos distintos.
- **Controle de acesso zero:** Documentos restritos (ex.: tabelas de custo interno, políticas de compliance ainda não publicadas) ficam acessíveis via RAG para qualquer atendente que faça a pergunta certa.
- **Rastreabilidade prejudicada:** O requisito de "indicação da fonte" fica comprometido quando chunks de origens diferentes chegam juntos sem identificação clara.

**Recomendação:** Separar o índice por fonte ou domínio (SharePoint / Confluence / Planilhas), adicionar campos de metadado (`fonte`, `area`, `nivel_acesso`) e usar filtros no momento da busca. Avaliar se o Azure AI Search com RBAC resolve o controle de acesso ou se é necessária uma camada de autorização na aplicação.

---

### 3. Chunking fixo de 512 tokens sem overlap — quebra de contexto em documentos estruturados

**O problema:** A estratégia de chunking fixo sem overlap ignora a estrutura semântica dos documentos. Documentos como tabelas de SLA, regras de frete e planilhas possuem estrutura tabular ou hierárquica onde o contexto de uma linha depende do cabeçalho ou da linha anterior.

**Impacto:**
- Um chunk pode conter dados de uma tabela sem incluir os cabeçalhos das colunas, tornando a informação sem sentido para o LLM.
- Parágrafos de regras longas são cortados no meio, e sem overlap o chunk seguinte não carrega o início da regra — o modelo nunca vê a regra completa.
- Respostas incompletas ou incorretas para perguntas sobre cálculo de frete e SLA, que são justamente as consultas mais frequentes (60% dos 320 chamados/dia).

**Recomendação:** Adotar chunking semântico ou híbrido: respeitar seções/parágrafos para prosa, e tratar tabelas como unidades atômicas com contexto do cabeçalho. Usar overlap de ao menos 10-15% (50-75 tokens) para preservar continuidade. Testar diferentes estratégias com amostras reais dos documentos da NovaTech antes de indexar tudo.

---

### 4. Apenas 3 chunks no contexto — insuficiente para perguntas complexas ou documentos contraditórios

**O problema:** O LLM recebe exatamente os 3 chunks mais similares por similaridade de vetor, sem nenhum critério adicional de seleção ou reranking.

**Impacto:**
- **Respostas incompletas:** Perguntas que cruzam múltiplos domínios (ex.: "qual o prazo de devolução para cliente tipo A com frete expresso em zona 3?") podem precisar de informações espalhadas em 5 ou mais chunks distintos.
- **Documentos contraditórios ignorados:** O cenário explicitamente menciona que existem versões conflitantes de documentos. Com apenas 3 chunks por similaridade pura, o modelo nunca terá acesso à versão mais recente se ela tiver score de similaridade levemente inferior.
- **Ausência de reranking:** Similaridade de vetor captura proximidade semântica, mas não relevância para responder a pergunta. Um reranker (ex.: Azure AI Search semantic ranker ou um modelo cross-encoder) melhora significativamente a precisão.

**Recomendação:** Aumentar o pool de recuperação para 10-15 chunks e aplicar reranking antes de enviar ao LLM. Adicionar lógica de seleção por `data_versao` para priorizar documentos mais recentes quando houver conflito. Considerar expandir a janela de contexto para até 6-8 chunks dependendo do tipo de pergunta.

---

### 5. Ausência de estratégia para documentos contraditórios — risco de compliance

**O problema:** A proposta não trata o cenário já conhecido de documentos com informações conflitantes entre versões. O assistente simplesmente retornará o que os chunks mais similares disserem, sem nenhum sinal de alerta.

**Impacto:** Um atendente pode receber uma resposta confiante sobre uma política de compliance que foi revisada, mas cuja versão antiga ainda está indexada. Em logística, erros em políticas de devolução ou normas de segurança de carga têm implicações legais e operacionais diretas.

**Recomendação:** Implementar detecção de conflito no pipeline: ao recuperar chunks sobre o mesmo tema com datas diferentes, o prompt deve instruir o modelo a sinalizar a contradição ao atendente e indicar qual fonte é mais recente. Criar processo de governança para arquivar ou marcar versões obsoletas no momento da ingestão.

---

## Resumo dos Riscos

| # | Risco | Severidade | Probabilidade |
|---|-------|-----------|---------------|
| 1 | Ingestão manual → respostas desatualizadas | Alta | Alta |
| 2 | Índice único → sem controle de acesso e contexto misturado | Alta | Certa |
| 3 | Chunking fixo sem overlap → perda de contexto estrutural | Média | Alta |
| 4 | Top-3 sem reranking → respostas incompletas | Média | Alta |
| 5 | Sem tratamento de contradições → risco de compliance | Alta | Alta |


