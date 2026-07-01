# Tarefa 4 — Critérios de Maturidade da Skill

Os critérios abaixo determinam quando uma skill está pronta para uso pelo time inteiro. Cada critério é **mensurável** (dois Tech Leads chegam à mesma conclusão), **executável** (verificável em menos de 10 minutos), e **independente de ferramentas** (funciona com Copilot, Claude Code ou qualquer LLM).

---

## Critérios de conteúdo (a skill está bem escrita?)

1. **Linguagem prescritiva completa:** todas as regras usam `MUST`, `NEVER`, `ALWAYS` ou `PREFER` — nenhuma regra usa linguagem descritiva como "recomendamos", "pode-se", "é bom praticar". Verificação: grep por "recomend\|considere\|pode-se\|é possível" no corpo da skill — resultado deve ser zero ocorrências.

2. **Exemplos compiláveis sem modificação:** cada bloco de código DO/DON'T é TypeScript válido — sem `// TODO`, sem `any` não justificado, sem imports fictícios. Verificação: copiar cada bloco DO em um projeto com as dependências declaradas e executar `tsc --noEmit` — zero erros de tipo.

3. **Anti-padrões baseados em comportamento real de LLM:** cada `AP-N` contém um trecho "O que o LLM gera" com código concreto, não uma descrição genérica. Verificação: para cada AP, confirmar que o trecho de código errado é diferente do trecho correto e que o erro é demonstrável (não hipotético).

4. **Toda seção termina com instrução acionável:** nenhuma seção encerra com uma frase descritiva pura ("este endpoint faz X"). A última sentença de cada seção DEVE ser uma regra `MUST`/`NEVER`/`PREFER` ou um comando direto ao agente. Verificação: ler a última linha de cada seção.

5. **Frontmatter `depends-on` completo:** todo termo ou padrão referenciado no corpo da skill que é definido em outra skill (ex: `withRetry`, `AppError`, `logger`, estrutura de pastas) tem sua skill de origem listada em `depends-on`. Verificação: listar todos os imports e utilitários referenciados — cada um deve aparecer em `depends-on` ou ser da stdlib do projeto.

6. **Estrutura de arquivos com papel de cada arquivo:** a seção de estrutura de pastas descreve a responsabilidade de cada arquivo com clareza suficiente para que um agente crie os três arquivos sem consultar outra fonte. Verificação: um desenvolvedor sem contexto do projeto consegue descrever o papel de `handler.ts`, `validator.ts` e `response-builder.ts` após apenas ler a seção.

7. **Cada regra é atômica:** nenhuma regra combina dois comportamentos distintos na mesma linha. Verificação: uma regra que descreve dois comportamentos separados por "e" ou ";" deve ser dividida em duas. Contar ocorrências de conjunções que unem comportamentos distintos.

---

## Critérios de eficácia (a skill produz o efeito desejado?)

1. **Taxa de conformidade ≥ 8/10 na primeira tentativa:** dado a instrução padrão de novo endpoint (POST com payload definido, service destino, response shape), o LLM produz output que passa em 8 ou mais das 10 regras da tabela de avaliação sem iteração. Verificação: aplicar a instrução padrão do onboarding com o LLM de referência do time (atualmente Claude Sonnet ou Copilot Chat) e preencher a tabela de avaliação — resultado deve ser ≥ 8 ✅.

2. **Uso autônomo por desenvolvedor júnior:** um desenvolvedor júnior consegue criar um endpoint completo (`handler.ts`, `validator.ts`, `response-builder.ts`) usando apenas esta skill e as skills listadas em `depends-on`, sem perguntar ao Tech Lead. Verificação: um Dev Sênior observa o processo de criação em tempo real sem intervir — a skill passa se o endpoint gerado atende ≥ 8/10 regras sem orientação adicional.

3. **Reescrita corrige todos os anti-padrões documentados:** dado um endpoint gerado com os anti-padrões AP-1 a AP-6, um LLM que relê a skill e reescreve o código elimina todos os anti-padrões documentados na Seção 6. Verificação: introduzir intencionalmente os 6 anti-padrões em um handler de exemplo → pedir ao LLM "reescreva seguindo a skill azure-functions-endpoint" → nenhum dos 6 AP deve sobreviver na versão reescrita.

---

## Tabela de graduação

| Nível | Critérios atendidos | Uso autorizado |
|---|---|---|
| Draft | < 5 critérios de conteúdo | Tech Lead apenas (validação interna antes de qualquer uso externo) |
| Beta | ≥ 5 critérios de conteúdo + 1 critério de eficácia | Dev Sênior (uso com feedback ativo — reportar gaps ao Tech Lead) |
| Estável | Todos os 7 critérios de conteúdo + ≥ 2 critérios de eficácia | Todo o time sem restrições |
| Arquivada | Skill substituída por versão mais nova ou tecnologia substituída | Deletar da pasta `skills/` após 2 sprints; mover para `skills/_archive/` com nota de substituição |
