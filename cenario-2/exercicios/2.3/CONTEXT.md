# Criação e teste de skills técnicas (Tech Lead — Ex. 2.3)

**Contexto:** Você precisa criar as skills técnicas do projeto que vão garantir que o Copilot gere código consistente com os padrões definidos.

# Cenário

[Cenário](../cenario.md)

# Anexos

[Anexo C](../../anexo-c-estrutura-repositorio.md)

# Repositório

[Repo](../../novatech-assistant/)

# Árvore de skills (proposta pelo Dev — simulada)

```
Foundation:
├── typescript-conventions (strict mode, imports, naming)
├── error-handling (custom errors, logging, retry)
└── project-structure (folders, modules, exports)

Domain:
├── azure-functions-endpoint (HTTP trigger pattern)
├── azure-ai-search-integration (query, index management)
├── react-components (painel web patterns)
└── testing-patterns (Vitest, mocks, fixtures)

Artifact:
├── create-rag-endpoint (receita completa)
├── create-integration-test (receita completa)
└── create-react-card (receita completa)
```

Skills vivem em `/skills/foundation/`, `/skills/domain/`, `/skills/artifact/`. Cada skill é um `.md` independente.
O destino do SKILL.md deste exercício é `skills/domain/azure-functions-endpoint.md`.
