**Contexto:** Você precisa definir a estratégia de prompt engineering e context engineering do projeto como artefato versionado. O prompt não é texto informal — é código que precisa ser gerenciado com o mesmo rigor.


**Inputs fornecidos:**
- O cenário completo em [cenario.md](../cenario.md).
- O system prompt prototipado pelo desenvolvedor (simulado — use o prompt abaixo como base para melhorar):

```
Você é o assistente de atendimento da NovaTech, empresa de logística.
Responda perguntas sobre procedimentos, SLAs e regras de frete.
Use apenas as informações dos documentos fornecidos.
Cite a fonte. Se não souber, diga que não sabe.
```

- Os guardrails do Product Specialist: *"(1) Sempre citar fonte. (2) Nunca inventar prazos ou valores. (3) Quando não encontrar resposta, dizer explicitamente. (4) Responder em português formal."*
- Os chunks de referência do pipeline (ver [Anexo B](../../anexo-b-chunks-referencia-rag.md)) para usar como dados de teste no script.

**Tarefa:**
1. Usando o **Claude**, defina: onde os prompts ficam versionados no repositório, como são nomeados, como são testados, e quem pode alterá-los.

2. Identifique quais partes do system prompt são estáticas (raramente mudam) e quais são dinâmicas (mudam conforme o contexto — ex: o tier do cliente, os chunks recuperados). Defina a "anatomia do contexto" completa de uma query: system prompt (estático) + metadados do cliente (dinâmico) + chunks recuperados (dinâmico) + pergunta (dinâmico) + histórico de conversa (dinâmico, crescente). Estime o tamanho de cada parte e defina o orçamento de contexto total.

3. Usando o **GitHub Copilot**, crie um script de teste automatizado de prompts: dado um prompt, um conjunto de perguntas e respostas esperadas, o script envia cada pergunta ao LLM e verifica se a resposta atende critérios básicos (contém citação de fonte, não contém termos proibidos, etc). O script não precisa ser completo — o objetivo é demonstrar o conceito.

4. Defina como o prompt se relaciona com o Harness: quais guardrails são enforçados no prompt (probabilístico) e quais deveriam ser enforçados fora do prompt (determinístico, ex: um filtro que valida se a resposta contém citação).

**Entregável:** O documento de estratégia com a anatomia de contexto, o script de teste gerado com o Copilot, e a análise de enforcement probabilístico vs determinístico.

**Critérios de avaliação:**
- Os prompts são tratados como código (versionados, testados, revisados).
- A anatomia de contexto demonstra pensamento de engenharia de contexto (não é apenas "o prompt" — é o contexto completo que o modelo recebe, com orçamento por parte).
- A separação entre enforcement probabilístico e determinístico demonstra maturidade de engenharia.
- O script de teste é funcional (ou ao menos demonstra claramente o conceito).