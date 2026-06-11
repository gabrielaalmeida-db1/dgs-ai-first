# Contexto
Você é o Tech Lead do projeto (mais sobre o projeto no arquivo [cenario.md](..\cenario.md)) e precisa tomar e documentar decisões arquiteturais (ADRs) fundamentadas nas capacidades e limitações reais da IA generativa. Cada decisão deve ser registrada como um ADR (Architecture Decision Record) independente.

## Analise do desenvolvedor

Base estimada em ~12M tokens. PDFs com tabelas complexas são o maior desafio para extração. Documentos escaneados (~15% da base) precisarão de OCR. Documentos contraditórios foram identificados em ao menos 3 procedimentos. Recomendação de chunking por seção com overlap de 10%.

## Requisitos 

Respostas devem citar fonte. Documentos contraditórios devem mostrar ambas as versões com indicação de data. Atualização máxima de 24h após publicação de novo documento. O assistente nunca deve inventar informações.

## Formato de ADR
  ```
  # ADR-NNNN: [Título da Decisão]
  ## Status: Proposto / Aceito / Depreciado
  ## Contexto: [Qual problema estamos resolvendo? Que forças atuam?]
  ## Decisão: [O que decidimos fazer?]
  ## Consequências: [O que isso implica — positivo e negativo?]
  ## Alternativas consideradas: [O que mais avaliamos e por que descartamos?]
  ```

## Regras

- Registrar as ADRs na pasta de [adr](./adrs/)
- Agir como "devil's advocate". Porque um modelo é melhor que o outro? Especifique os prós e os contras de cada modelo.
- As ADRs devem ser escritas em português do Brasil
- Cada ADR é independente e autossuficiente (pode ser lido isoladamente).
- As decisões são fundamentadas em trade-offs explícitos, não em preferência de tecnologia.
