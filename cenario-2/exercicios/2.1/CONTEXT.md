
# Cenário

[Link aqui](../cenario.md)

# Contexto 
Você é responsável por montar o AGENTS.md do repositório — o documento que todo agente de IA (Copilot, Claude Code) lê antes de gerar qualquer artefato no projeto. As decisões técnicas vêm das  [ADRs](../../../cenario-1/exercicios/1.1/adrs/) produzidas na fase anterior.

# Estrutura do repositório

[Anexo C](../../anexo-c-estrutura-repositorio.md)

# Decisões

- TypeScript com strict mode
- Azure Functions v4 com HTTP triggers
- Zod para validação de input/output
- Vitest para testes
- pino para logging (nunca console.log)
- Conventional Commits para mensagens de commit
- Branch strategy: feature branches **locais**. Como esta fase não usa remoto, "abrir PR" significa criar a branch e escrever a descrição do PR como um arquivo markdown (ex.: `docs/pull-requests/PR-NNNN.md`) com objetivo, mudanças e checklist de validation gates; a revisão é simulada localmente
- Context budget: ~4K tokens system prompt + ~8K chunks por query ([ADR-0002](../../../cenario-1/exercicios/1.1/adrs/ADR-0002.md)).
- Documentos contraditórios: metadado de vigência, priorizar mais recente ([ADR-0003](../../../cenario-1/exercicios/1.1/adrs/ADR-0003.md)).

# A especificação do AGENTS.md
- *"O AGENTS.md é a constitution do projeto: contém decisões duráveis que todo agente e toda spec devem respeitar. Funciona como contrato entre humanos e agentes."*

