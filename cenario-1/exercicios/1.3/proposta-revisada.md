# Proposta Revisada — Assistente RAG NovaTech

**Versão:** 2.0 (revisada a partir das avaliações técnicas)  
**Data:** 2026-06-15  
**Referências:** [avaliacao-lead.md](avaliacao-lead.md) · [avaliacao-claude.md](avaliacao-claude.md) · [comparacao.md](comparacao.md)

---

## O que muda em relação à proposta original

| Decisão original | Decisão revisada | Motivo |
|-----------------|-----------------|--------|
| Embeddings ada-002 | text-embedding-3-large | Melhor qualidade em português, 5× mais barato |
| Índice único | 3 índices com metadados e filtros | Controle de acesso e contexto por domínio |
| Chunking fixo 512 tokens sem overlap | Chunking semântico com overlap de 10% | Preserva estrutura de tabelas e regras longas |
| Top-3 por similaridade | Top-10 → reranking → Top-5 | Recuperação mais precisa sem custo excessivo |
| GPT-4o sempre | GPT-4o com prompt de grounding | Mesma geração, com fallback explícito |
| Ingestão manual | Job agendado diário | Simples, automatizado, auditável |
| Sem pré-processamento | Azure Document Intelligence por tipo de arquivo | Tabelas e PDFs extraídos com estrutura preservada |
| Sem integração definida | Azure Bot Framework no Teams | Requisito central do projeto |
| Sem observabilidade | Application Insights + feedback 👍/👎 | Mínimo necessário para medir a meta |

---

## Arquitetura

```
[SharePoint]  [Confluence]  [Pasta de Rede / Excel]
      │               │                │
      └───────────────┼────────────────┘
                      │
              [Azure Function]
            Job diário de ingestão
                      │
                      ▼
         [Azure Document Intelligence]
         Extração por tipo de arquivo:
         · PDF/Word → texto + tabelas em Markdown
         · Excel    → tabelas serializadas com cabeçalhos
                      │
                      ▼
           [Chunking Semântico + Overlap]
           · Prosa: por seção/parágrafo + 10% overlap
           · Tabelas: unidade atômica com cabeçalho
           · Metadados: fonte, área, data_versao
                      │
                      ▼
         [text-embedding-3-large]
                      │
                      ▼
         [Azure AI Search — 3 índices]
          sharepoint | confluence | planilhas
          (filtro por fonte na query)
                      │
              top-10 por similaridade
                      │
                      ▼
         [Azure Semantic Ranker]
              top-5 para o LLM
                      │
                      ▼
              [GPT-4o]
          prompt com grounding e citação de fonte
                      │
                      ▼
         [Azure Bot Framework]
           canal Microsoft Teams
                      │
                      ▼
            [Application Insights]
          log de query, resposta, feedback
```

---

## Decisões de Design

### 1. Pré-processamento por tipo de arquivo

Antes de qualquer chunking, cada documento passa por um extrator adequado ao seu formato:

- **PDF e Word:** Azure Document Intelligence extrai texto corrido e serializa tabelas em Markdown, preservando cabeçalhos de coluna e estrutura de linha.
- **Excel:** cada planilha é convertida em tabela Markdown com cabeçalhos — sem tentar interpretar fórmulas, apenas os valores calculados.
- **Confluence (HTML):** extração via API do Confluence, respeitando a hierarquia de seções.

Isso resolve o problema de tabelas de SLA e regras de frete que perderiam toda a estrutura com extração de texto bruto.

### 2. Chunking semântico com overlap

- **Documentos de prosa (manuais, políticas):** chunking por seção ou parágrafo, com overlap de ~10% (50 tokens) entre chunks consecutivos para não cortar regras longas no meio.
- **Tabelas:** tratadas como unidade atômica — a tabela inteira (com cabeçalho) é um único chunk. Se a tabela for maior que 800 tokens, divide-se por grupos de linhas, sempre repetindo o cabeçalho.
- **Tamanho máximo:** 600 tokens por chunk (um pouco acima dos 512 originais para acomodar seções naturais sem corte forçado).

### 3. Três índices com metadados, não um único

Cada fonte tem seu próprio índice no Azure AI Search:

| Índice | Fonte | Campos de metadado |
|--------|-------|-------------------|
| `idx-sharepoint` | SharePoint corporativo | `titulo`, `area`, `data_versao`, `url_fonte` |
| `idx-confluence` | Wiki Confluence | `titulo`, `espaco`, `data_versao`, `url_fonte` |
| `idx-planilhas` | Planilhas de referência | `nome_arquivo`, `aba`, `data_versao`, `url_fonte` |

Na query, a aplicação pode filtrar por índice (ex.: busca forçada em planilhas para perguntas sobre cálculo de frete) ou buscar em todos com resultados rankeados. O campo `data_versao` é obrigatório em todo chunk — é o mecanismo de controle de versão.

### 4. Recuperação: top-10 → reranking semântico → top-5

1. Busca vetorial retorna os 10 chunks mais similares por índice.
2. O **Azure Semantic Ranker** (já disponível no tier Standard do Azure AI Search, incluso nas licenças Azure AI Services da NovaTech) rerankeia por relevância semântica real à query.
3. Os 5 chunks com maior score são enviados ao LLM.

Isso resolve tanto a baixa precisão do top-3 sem reranking quanto o custo de enviar janelas de contexto excessivamente grandes ao GPT-4o.

### 5. Prompt de geração: grounding, citação e detecção de conflito

O system prompt instrui o modelo a seguir três regras:

```
Regra 1 — Grounding: responda APENAS com base nos documentos fornecidos.
Se a resposta não estiver nos documentos, diga exatamente:
"Não encontrei essa informação na documentação disponível. Consulte [área responsável]."
Nunca invente ou extrapole.

Regra 2 — Citação: ao final de cada afirmação, indique a fonte entre colchetes:
[Nome do documento, data_versao].

Regra 3 — Conflito: se dois documentos fornecidos apresentarem informações
contraditórias sobre o mesmo ponto, sinalize: "Atenção: encontrei versões
conflitantes. [Documento A, data X] diz Y; [Documento B, data Z] diz W.
Recomendo verificar com a área responsável qual versão está vigente."
```

Essas três regras são suficientes para o comportamento desejado sem adicionar uma segunda chamada de LLM para verificação de grounding.

### 6. Ingestão: job diário agendado

- **Azure Function** com trigger de timer (CRON diário às 2h).
- Percorre as três fontes e verifica documentos modificados desde a última execução (usando `last_modified` do SharePoint Graph API e do Confluence API).
- Re-indexa apenas os documentos alterados — não reprocessa o corpus inteiro.
- Log de execução no Application Insights: quantos documentos processados, erros, tempo total.

Ingestão event-driven (webhook a cada save) seria mais precisa, mas adiciona complexidade desnecessária dado que as atualizações são mensais. O job diário é suficiente e simples de manter.

### 7. Integração com Microsoft Teams

- **Azure Bot Framework** com registro no Azure Bot Service.
- Canal do Teams configurado via Teams App Manifest — aparece como app instalável no tenant da NovaTech.
- Autenticação via Microsoft Entra ID (SSO com as credenciais corporativas do atendente) — sem login adicional.
- A identidade do usuário autenticado é usada para filtrar índices conforme o perfil de acesso (atendente padrão vs. supervisor vs. compliance).

**Ação imediata:** iniciar o processo de aprovação de permissões no tenant Microsoft na primeira semana do projeto — esse é o maior risco de cronograma.

### 8. Observabilidade mínima viável

Cada interação loga no Application Insights:
- Query do atendente
- Chunks recuperados (com scores)
- Resposta gerada
- Feedback do atendente (👍 / 👎 no Teams)
- Tempo de resposta end-to-end

Com isso é possível:
- Medir se a meta de 2 minutos está sendo atingida.
- Identificar as queries que mais recebem 👎 para priorizar melhorias.
- Detectar tendências de perguntas sem resposta (fallback acionado com frequência).

Frameworks de avaliação como RAGAS ficam para uma fase posterior — o feedback manual é suficiente para validar o MVP.

---

## Estimativa de Custo Operacional (referência)

Baseado em ~192 consultas/dia (60% de 320 chamados):

| Componente | Estimativa mensal |
|-----------|------------------|
| text-embedding-3-large (queries) | ~$5 |
| Azure AI Search Standard S1 | ~$250 |
| GPT-4o (input ~2.000 tokens + output ~350 tokens/query) | ~$350 |
| Azure Document Intelligence (ingestão inicial) | ~$50 (one-time) |
| Azure Bot Service + Function | ~$20 |
| **Total estimado** | **~$625/mês** |

> Valores de referência — verificar pricing atual antes de apresentar ao cliente. O maior componente é o GPT-4o; se o orçamento for restrito, GPT-4o-mini pode ser avaliado em uma segunda fase após validar a qualidade do MVP.

---

## O que esta proposta deliberadamente não inclui

- **Roteamento de modelos (GPT-4o vs. mini por complexidade):** adiciona lógica de classificação de query sem ROI claro no MVP.
- **Cache semântico:** relevante em escala maior; com 192 queries/dia é prematuro.
- **Re-ingestão event-driven:** o job diário cobre o ciclo de atualização mensal com folga.
- **Framework de avaliação automática (RAGAS):** o feedback 👍/👎 é suficiente para o MVP; RAGAS entra na fase de maturação.
- **Múltiplos modelos de reranking:** o Azure Semantic Ranker nativo é suficiente e não adiciona nova dependência.

---

## Cronograma Sugerido (3 meses)

| Fase | Duração | Entregas |
|------|---------|---------|
| **Discovery** | 2 semanas | Mapeamento de documentos, aprovação de permissões no tenant, spike de chunking com amostras reais |
| **MVP interno** | 4 semanas | Pipeline de ingestão + índices + bot no Teams (ambiente de dev) |
| **Validação** | 3 semanas | Testes com 5-10 atendentes, ajuste de prompt, calibração do reranker |
| **Go-live** | 3 semanas | Deploy em produção, treinamento, monitoramento ativo |

O spike de chunking na primeira fase é crítico: testar a estratégia de chunking com PDFs, Word e Excel reais da NovaTech antes de indexar o corpus completo evita retrabalho custoso.
