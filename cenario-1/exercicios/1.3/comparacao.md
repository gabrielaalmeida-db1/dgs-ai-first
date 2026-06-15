# Comparação das Avaliações Técnicas

**Documentos comparados:**
- [avaliacao-lead.md](avaliacao-lead.md) — Tech Lead
- [avaliacao-claude.md](avaliacao-claude.md) — Claude Sonnet 4.6

---

## Visão Geral

As duas avaliações identificaram **11 problemas distintos** na proposta, sem sobreposição. Isso indica que as duas perspectivas são **complementares**, não redundantes: o Tech Lead analisou a proposta de dentro para fora (qualidade do pipeline RAG), enquanto o Claude analisou de fora para dentro (viabilidade sistêmica e operacional).

| Avaliação | Foco principal | Problemas identificados |
|-----------|---------------|------------------------|
| Tech Lead | Qualidade interna do pipeline RAG | 5 |
| Claude | Viabilidade sistêmica e operacional | 6 |
| **Total combinado** | **Cobertura completa** | **11** |

---

## Cobertura Comparada

### Problemas identificados pelo Tech Lead (não cobertos pelo Claude)

| # | Problema | Severidade |
|---|----------|-----------|
| TL-1 | Ingestão manual sem gatilho → índice desatualizado | Alta |
| TL-2 | Índice único → sem controle de acesso e contexto misturado | Alta |
| TL-3 | Chunking fixo 512 tokens sem overlap → quebra de contexto estrutural | Média |
| TL-4 | Top-3 chunks sem reranking → respostas incompletas | Média |
| TL-5 | Sem estratégia para documentos contraditórios → risco de compliance | Alta |

### Problemas identificados pelo Claude (não cobertos pelo Tech Lead)

| # | Problema | Severidade |
|---|----------|-----------|
| C-1 | Embedding ada-002 desatualizado → qualidade inferior em português | Média |
| C-2 | Sem observabilidade e métricas → meta de 12→2 min não mensurável | Alta |
| C-3 | Documentos não-textuais sem tratamento → tabelas Excel e PDF inutilizáveis | Alta |
| C-4 | Sem fallback → risco de alucinação em perguntas sem resposta no corpus | Alta |
| C-5 | Sem estimativa de custo operacional → viabilidade financeira desconhecida | Média |
| C-6 | Integração Teams/SharePoint não endereçada → requisito central ausente | Alta |

---

## Análise das Perspectivas

### Tech Lead: foco no pipeline de recuperação

O Tech Lead concentrou a análise na qualidade do RAG em si — os mecanismos de indexação, recuperação e contexto enviado ao modelo. Os problemas identificados afetam diretamente **a qualidade das respostas**: chunks mal formados, índice desorganizado e ingestão irregular resultam em um assistente que não recupera a informação certa, mesmo que tudo ao redor funcione.

**Ponto forte:** profundidade técnica. O problema do chunking sem overlap em documentos tabulares (TL-3) e a ausência de reranking (TL-4) são detalhes que exigem conhecimento específico de RAG para identificar.

**Ponto cego:** a análise pressupõe que o sistema está funcionando em produção — não questiona se chegará lá, se o custo é viável ou se a integração com o ambiente Microsoft foi planejada.

### Claude: foco na viabilidade sistêmica

O Claude analisou a proposta do ponto de vista de sistema completo: o que está faltando para que isso funcione em produção, seja adotado pelos atendentes e possa ser avaliado objetivamente. Os problemas identificados são **pré-condições de viabilidade**, não apenas de qualidade.

**Ponto forte:** amplitude. A ausência de observabilidade (C-2) e a integração não endereçada (C-6) são problemas que podem inviabilizar o projeto inteiro, independentemente da qualidade do pipeline RAG.

**Ponto cego:** a análise é menos granular nos detalhes internos do RAG — por exemplo, não desce ao nível de overlap de tokens ou estratégias de reranking como o Tech Lead fez.

---

## Sobreposição Temática

Apesar de não cobrirem os mesmos problemas, as duas avaliações convergem em dois temas centrais:

**1. Confiabilidade da informação**
- Tech Lead abordou pelo ângulo de documentos contraditórios e ingestão desatualizada (TL-1, TL-5).
- Claude abordou pelo ângulo de alucinação e ausência de grounding check (C-4).
- Juntos, cobrem o problema completo: o sistema pode responder errado tanto por recuperar informação antiga/conflitante quanto por inventar quando não há informação.

**2. Qualidade da recuperação**
- Tech Lead identificou chunking ruim e top-k insuficiente como causa de recuperação falha (TL-3, TL-4).
- Claude identificou embeddings de menor qualidade para português como causa raiz de recuperação falha (C-1).
- Juntos, mapeiam o problema de qualidade de recuperação em três camadas: geração do vetor (embedding), estrutura do chunk (chunking) e seleção dos chunks (reranking).

---

## Ranking Consolidado de Prioridade

Combinando os 11 problemas por impacto e urgência para o projeto:

| Prioridade | Problema | Fonte | Severidade |
|-----------|----------|-------|-----------|
| 1 | Integração Teams/SharePoint não endereçada | Claude | Alta |
| 2 | Ingestão manual → índice desatualizado | Tech Lead | Alta |
| 3 | Documentos não-textuais sem tratamento | Claude | Alta |
| 4 | Sem observabilidade e métricas | Claude | Alta |
| 5 | Sem fallback → risco de alucinação | Claude | Alta |
| 6 | Índice único → sem controle de acesso | Tech Lead | Alta |
| 7 | Sem estratégia para documentos contraditórios | Tech Lead | Alta |
| 8 | Chunking fixo sem overlap | Tech Lead | Média |
| 9 | Top-3 sem reranking | Tech Lead | Média |
| 10 | Embedding ada-002 desatualizado | Claude | Média |
| 11 | Sem estimativa de custo operacional | Claude | Média |

> A integração com Teams/SharePoint lidera porque é o requisito central do projeto e tem o maior risco de cronograma (aprovações burocráticas no tenant Microsoft).

---

## Lacunas Não Cobertas por Nenhuma das Avaliações

Ambas as avaliações deixaram pontos não endereçados:

- **Estratégia de teste e homologação com usuários reais:** como os 45 atendentes validarão o assistente antes do go-live? Sem um plano de UAT (User Acceptance Testing), o risco de adoção baixa é alto.
- **Tratamento de perguntas em linguagem informal:** atendentes farão perguntas coloquiais, com abreviações e erros de digitação. A proposta não discute robustez do sistema a variações de linguagem.
- **Gestão de sessão e histórico de conversa:** o assistente responde perguntas isoladas ou mantém contexto da conversa? Para casos de atendimento complexo, o contexto anterior é essencial.

---

## Conclusão

As duas avaliações se complementam sem se repetir e, juntas, formam uma análise completa da proposta. O Tech Lead garantiu que o pipeline RAG em si seja bem construído; o Claude garantiu que o sistema em torno do pipeline seja viável, mensurável e integrado.

**A proposta original, sem as correções apontadas nas duas avaliações, tem baixa probabilidade de atingir a meta da diretoria (12→2 minutos) e alto risco de não ser adotada pelos atendentes** — seja por respostas de qualidade insuficiente (problemas do Tech Lead) ou por não estar onde os atendentes trabalham (problema C-6 do Claude).

A recomendação conjunta é revisar a proposta em três frentes antes de iniciar o desenvolvimento:
1. **Arquitetura do pipeline RAG** — chunking semântico, reranking, índices por domínio, automação de ingestão.
2. **Viabilidade operacional** — custo, observabilidade, tratamento de arquivos não-textuais.
3. **Integração e adoção** — plano de integração com Teams/SharePoint e estratégia de rollout com os atendentes.
