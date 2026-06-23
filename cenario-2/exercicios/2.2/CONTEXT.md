# Arquitetura de MCP do projeto (servers locais)

**Contexto:** Você precisa definir a arquitetura de MCP do projeto: quais servers locais, com quais escopos/permissões, como monitorá-los e como o time é avisado de mudanças. Como todos os servers rodam localmente, "monitorar" e "health check" são exercícios **executáveis de verdade**.


# Cenário

[Cenário](../cenario.md)

# Anexos

[Anexo C](../../anexo-c-estrutura-repositorio.md)

# Repositorio

[Repo](../../novatech-assistant/)

# Mapeamento de MCP

  ```
  Servers locais e gratuitos:
  (1) filesystem  -> ./src ./specs ./skills (rw) + ./docs/novatech ./data/retrieval-corpus (read-only)
  (2) git         -> repositório local (histórico, diff, branches)
  (3) memory      -> grafo persistente de decisões e linguagem ubíqua
  (4) everything  -> aprendizado das primitivas de MCP
  ```

- Conceito de MCP architecture: *"MCP servers devem ser gerenciados como infraestrutura: versionados, com escopo/permissões mínimas, e observáveis. O Tech Lead decide quais servers são autorizados e quais tools cada um expõe."*
