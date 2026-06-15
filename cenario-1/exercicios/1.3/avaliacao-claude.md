# Avaliação Técnica — Proposta de Arquitetura RAG (Claude)

**Revisor:** Claude Sonnet 4.6  
**Data:** 2026-06-15  
**Proposta avaliada:** Arquitetura RAG para assistente interno da NovaTech  
**Referência:** Ver também [avaliacao-lead.md](avaliacao-lead.md) para os problemas de ingestão, índice único, chunking, top-k e documentos contraditórios.

---

## Resumo da Proposta

> Azure AI Search + embeddings ada-002 · índice único · chunking fixo 512 tokens sem overlap · top-3 chunks · GPT-4o · ingestão manual sob demanda.

---

## Problemas Adicionais Identificados

---

### 1. Modelo de embedding desatualizado (ada-002)

**O problema:** O `text-embedding-ada-002` é o modelo de embedding da geração anterior da OpenAI. Os modelos `text-embedding-3-small` e `text-embedding-3-large` o substituíram com desempenho significativamente superior nos benchmarks de recuperação semântica (MTEB), além de custo menor por token.

**Impacto:**
- Qualidade de recuperação inferior, especialmente para português — ada-002 foi treinado majoritariamente em inglês e performa pior em queries em português do que os modelos de terceira geração.
- A documentação da NovaTech é em português. A imprecisão semântica nos embeddings se propaga diretamente para a qualidade das respostas.
- Custo desnecessariamente maior: ada-002 custa ~$0.10/1M tokens vs. ~$0.02/1M do text-embedding-3-small, uma diferença de 5x.

**Alternativa recomendada:** Substituir por `text-embedding-3-large` para máxima qualidade semântica em português, ou `text-embedding-3-small` se o orçamento for restrito. Realizar um benchmark com 50-100 queries representativas do domínio de logística antes de indexar todo o corpus — o modelo de embedding é difícil de trocar depois que o índice está populado.

---

### 2. Ausência de observabilidade e critério de sucesso mensurável

**O problema:** A proposta não menciona nenhum mecanismo de avaliação, logging ou métrica de qualidade. O projeto tem uma meta clara da diretoria: reduzir o tempo de busca de 12 para menos de 2 minutos por chamado. Não há como saber se isso foi atingido sem instrumentação.

**Impacto:**
- Sem logging de queries, impossível identificar quais perguntas o sistema não consegue responder bem.
- Sem métricas de qualidade (faithfulness, relevância, taxa de hallucination), o sistema pode estar respondendo errado sistematicamente sem que ninguém perceba.
- No go-live, a diretoria vai perguntar: "o assistente funcionou?" — e não haverá dados para responder.
- Sem feedback loop, o sistema não melhora ao longo do tempo.

**Alternativa recomendada:** Definir antes do desenvolvimento:
- **Métricas de negócio:** tempo médio de resolução por chamado (A/B com e sem assistente), taxa de consultas que dispensaram busca manual.
- **Métricas técnicas:** faithfulness (resposta é suportada pelos chunks?), answer relevance, context recall — frameworks como **RAGAS** ou **DeepEval** automatizam isso.
- **Observabilidade:** logar query, chunks recuperados, resposta gerada, score de relevância e feedback do atendente (👍/👎). Azure Monitor + Application Insights se encaixa naturalmente no ambiente Microsoft da NovaTech.

---

### 3. Sem tratamento para documentos não-textuais (tabelas em PDF, planilhas Excel)

**O problema:** O corpus inclui planilhas de referência atualizadas mensalmente (pasta de rede) e PDFs/Word que certamente contêm tabelas. A proposta não menciona como esses formatos serão processados antes de gerar embeddings.

**Impacto:**
- **Planilhas Excel:** extrair texto bruto de uma planilha resulta em séries de valores sem cabeçalho, sem relação entre células, sem fórmulas interpretadas. Uma tabela de cálculo de frete vira uma sequência de números sem contexto — o LLM não consegue raciocinar sobre isso.
- **Tabelas em PDF:** extratores de PDF padrão (pdfminer, PyMuPDF) frequentemente quebram tabelas em sequências de texto desconexas ou misturam colunas. O modelo nunca vê a estrutura original.
- As tabelas de SLA por tipo de cliente e regras de cálculo de frete são provavelmente as informações mais consultadas pelos atendentes — e estão exatamente nesse formato.

**Alternativa recomendada:**
- **Para planilhas Excel:** converter tabelas em representação textual estruturada (Markdown ou JSON) preservando cabeçalhos, ou usar o Azure Document Intelligence para extração estruturada.
- **Para PDFs com tabelas:** usar Azure Document Intelligence (Form Recognizer) que identifica tabelas e as serializa com estrutura preservada, em vez de extrair texto linear.
- Definir um pipeline de pré-processamento por tipo de arquivo (`pdf`, `docx`, `xlsx`) antes de qualquer chunking.

---

### 4. Sem estratégia de fallback — risco de alucinação em perguntas sem resposta no corpus

**O problema:** A proposta não define o que acontece quando o assistente não encontra informação suficiente na documentação para responder a uma pergunta. Sem guardrails, o GPT-4o irá gerar uma resposta plausível mesmo sem embasamento nos chunks recuperados.

**Impacto:**
- Em logística e compliance, uma resposta inventada sobre prazo de devolução, política de seguro de carga ou norma de segurança tem consequências reais: o atendente repassa a informação errada ao cliente, gerando litígios ou perdas operacionais.
- O atendente não tem como distinguir uma resposta embasada de uma alucinação se o sistema não sinalizar o nível de confiança.
- Perguntas fora do escopo da documentação (ex.: "como faço para pedir férias?") receberão respostas geradas sem base.

**Alternativa recomendada:**
- Incluir no system prompt instrução explícita: *"Se a resposta não estiver nos documentos fornecidos, diga 'Não encontrei essa informação na documentação disponível' e indique ao atendente onde buscar."*
- Implementar verificação de grounding: após gerar a resposta, checar se as afirmações-chave aparecem nos chunks (pode ser feito com um segundo prompt mais barato ou com um modelo menor como GPT-4o-mini).
- Exibir na interface o score de relevância dos chunks e as fontes utilizadas para que o atendente possa julgar a confiabilidade da resposta.

---

### 5. Ausência de estimativa de custo operacional

**O problema:** A proposta escolhe GPT-4o para geração sem nenhuma análise de custo. O volume da NovaTech é conhecido: ~192 consultas/dia (60% de 320 chamados). O custo de operar com GPT-4o nessa escala não foi considerado.

**Impacto:**
- GPT-4o custa ~$2.50/1M tokens de input e ~$10/1M tokens de output (valores de referência — verificar pricing atual). Com um prompt de sistema + 3 chunks (~1.500 tokens de input) e ~300 tokens de output por consulta:
  - ~288.000 tokens de input/dia → ~$0,72/dia → ~$260/mês só em geração.
  - Mais ingestão, embeddings, Azure AI Search. O custo total pode surpreender o cliente dentro do orçamento de 3 meses.
- Sem modelo de custo, não há como avaliar se a proposta é financeiramente viável no longo prazo após o go-live.

**Alternativa recomendada:**
- Calcular o TCO (Total Cost of Ownership) antes de fechar a arquitetura: embeddings (ingestão + queries), Azure AI Search tier, GPT-4o (ou alternativa), infraestrutura.
- Avaliar **GPT-4o-mini** para consultas de baixa complexidade e reservar GPT-4o para queries que o modelo menor não consegue responder adequadamente — pode reduzir o custo de geração em 15-20x mantendo boa qualidade para a maioria dos casos.
- Apresentar ao cliente um range de custo mensal estimado para aprovação antes do desenvolvimento.

---

### 6. Integração com Teams e SharePoint não endereçada

**O problema:** O requisito central do projeto é que o assistente seja integrado ao ambiente Microsoft da NovaTech (Teams + SharePoint). A proposta não menciona nada sobre essa camada de integração.

**Impacto:**
- A integração com Teams exige um bot registrado no Azure Bot Service, autenticação via Microsoft Entra ID (AAD), e configuração de permissões no tenant da NovaTech — nada disso é trivial e tem lead time burocrático.
- A ingestão do SharePoint requer Graph API com permissões de leitura nos sites corretos — permissões que precisam ser aprovadas pelo time de TI da NovaTech e podem demorar semanas.
- Se o assistente não estiver no Teams, os atendentes precisarão sair do fluxo de trabalho para acessá-lo — reduzindo drasticamente a adoção.
- Esse trabalho de integração pode consumir 30-40% do tempo de desenvolvimento e não está no escopo técnico proposto.

**Alternativa recomendada:**
- Usar **Azure Bot Framework** + **Teams AI Library** para o bot, que já tem templates prontos para RAG com SharePoint.
- Aproveitar o **Microsoft Copilot Studio** como camada de orquestração — dado que a NovaTech tem licenças M365 E3, pode haver acesso a componentes que reduzem o trabalho de integração.
- Mapear na primeira semana do projeto todas as permissões necessárias no tenant e iniciar o processo de aprovação imediatamente, pois é o maior risco de cronograma.

---

## Resumo Comparativo

| # | Problema | Severidade | Já coberto em avaliacao-lead.md? |
|---|----------|-----------|----------------------------------|
| 1 | Embedding ada-002 desatualizado | Média | Não |
| 2 | Sem observabilidade e métricas | Alta | Não |
| 3 | Documentos não-textuais sem tratamento | Alta | Não |
| 4 | Sem fallback → risco de alucinação | Alta | Não |
| 5 | Sem estimativa de custo operacional | Média | Não |
| 6 | Integração Teams/SharePoint não endereçada | Alta | Não |

---

## Visão Geral da Arquitetura Sugerida

```
SharePoint / Confluence / Planilhas
        │
        ▼
[Azure Document Intelligence]   ← extração estruturada por tipo de arquivo
        │
        ▼
[Pipeline de Chunking Semântico]  ← por seção/parágrafo + tabelas atômicas
        │ metadados: fonte, área, data_versao, nivel_acesso
        ▼
[text-embedding-3-large]          ← embeddings por domínio
        │
        ▼
[Azure AI Search]                 ← índices separados por fonte
    + Semantic Ranker (reranking)
        │ top-10 → rerank → top-6
        ▼
[GPT-4o / GPT-4o-mini]            ← geração com grounding check
        │
        ▼
[Azure Bot Framework + Teams]     ← interface do atendente
        │
        ▼
[Azure Monitor / Application Insights]  ← observabilidade + RAGAS
```

---

## Recomendação Final

A proposta cobre a ideia central corretamente (RAG com Azure AI Search), mas deixa lacunas críticas na execução: sem observabilidade não há como saber se funcionou, sem tratamento de arquivos estruturados as consultas mais frequentes falharão, e sem plano de integração com Teams o assistente pode nunca chegar ao atendente. Esses itens devem ser endereçados na revisão da proposta antes do início do desenvolvimento.
