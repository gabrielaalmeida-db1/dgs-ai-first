**Contexto:** Um desenvolvedor mais júnior propôs uma arquitetura de RAG. Você precisa revisar.

**Inputs fornecidos:**
- O cenário completo ([cenario](../cenario.md)).
- A proposta (simulada): *"Vamos usar Azure AI Search com embeddings do ada-002. Todos os documentos serão indexados num único índice. Chunking fixo de 512 tokens sem overlap. O LLM recebe os 3 chunks mais similares. Usaremos GPT-4o para geração. O pipeline de ingestão roda manualmente quando alguém lembra de atualizar."*
