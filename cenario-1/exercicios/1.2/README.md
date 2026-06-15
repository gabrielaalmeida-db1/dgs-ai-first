Instale a dependencia: pip install anthropic
Defina a chave da API: $env:ANTHROPIC_API_KEY="sua_chave"
Execute os testes padrao: python test_prompt.py
Opcional: python test_prompt.py --system-prompt-file system_prompt.txt --test-cases-file casos.json
O script imprime PASS/FAIL por caso e retorna codigo 0 apenas se todos passarem.
