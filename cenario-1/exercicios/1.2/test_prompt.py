import argparse
import json
import re
import sys
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

try:
    import anthropic
except ImportError:
    anthropic = None

MODEL_NAME = "claude-haiku-4-5-20251001"
DEFAULT_MAX_TOKENS = 600

DEFAULT_SYSTEM_PROMPT = (
    "Voce e o assistente de atendimento da NovaTech, empresa de logistica. "
    "Responda perguntas sobre procedimentos, SLAs e regras de frete. "
    "Use apenas as informacoes dos documentos fornecidos. "
    "Cite a fonte. Se nao souber, diga: nao encontrei essa informacao. "
    "Responda em portugues formal."
)

TEST_CASES = [
    {
        "id": "TC-01",
        "pergunta": "Qual o prazo para solicitar devolucao de mercadoria?",
        "chunks": [
            "Chunk POL-001-A (Secao 3.1): O cliente pode solicitar a devolucao de "
            "mercadorias em ate 7 (sete) dias uteis apos a data de recebimento "
            "confirmada no sistema de tracking.",
            "Chunk POL-001-C (Secao 3.3): O cliente abre chamado no Portal do Cliente "
            "(portal.novatech.com.br), selecionando a categoria 'Devolucao de Mercadoria'."
        ],
        "criterios": {
            "contains_citation": True,
            "no_forbidden_terms": ["inventei", "aproximadamente", "talvez"],
            "no_invention": False,
            "fallback_phrase": None
        }
    },
    {
        "id": "TC-02",
        "pergunta": "Qual o SLA para cliente Platinum em incidente critico?",
        "chunks": [
            "Chunk SLA-2024-A (Secao 1): A NovaTech classifica seus clientes em 3 (tres) "
            "tiers: Gold, Silver e Standard. Nao existem outros tiers alem dos tres listados."
        ],
        "criterios": {
            "contains_citation": True,
            "no_forbidden_terms": ["Platinum", "Diamante", "Premium"],
            "no_invention": True,
            "fallback_phrase": "nao encontrei essa informacao"
        }
    },
    {
        "id": "TC-03",
        "pergunta": "Qual o valor do frete para 300kg de Sao Paulo para Florianopolis?",
        "chunks": [],
        "criterios": {
            "contains_citation": False,
            "no_forbidden_terms": [],
            "no_invention": True,
            "fallback_phrase": "nao encontrei essa informacao"
        }
    }
]

SLANG_TERMS = {
    "vc", "vcs", "pq", "qdo", "blz", "tb", "tipo", "mano", "cara", "kkk", "rs"
}


@dataclass
class CaseResult:
    case_id: str
    passed: bool
    checks: Dict[str, bool]
    response: str
    error: Optional[str] = None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Executa testes de prompt contra Claude.")
    parser.add_argument(
        "--system-prompt-file",
        type=str,
        help="Caminho para arquivo de system prompt. Se omitido, usa prompt padrao.",
    )
    parser.add_argument(
        "--test-cases-file",
        type=str,
        help="Caminho para arquivo JSON com lista de casos de teste.",
    )
    parser.add_argument(
        "--max-tokens",
        type=int,
        default=DEFAULT_MAX_TOKENS,
        help=f"Maximo de tokens de resposta (padrao: {DEFAULT_MAX_TOKENS}).",
    )
    return parser.parse_args()


def load_text_file(path: str) -> str:
    with open(path, "r", encoding="utf-8") as f:
        return f.read().strip()


def load_test_cases(path: Optional[str]) -> List[Dict[str, Any]]:
    if not path:
        return TEST_CASES
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError("Arquivo de casos deve conter uma lista JSON.")
    return data


def normalize(text: str) -> str:
    return " ".join(text.lower().split())


def extract_expected_refs(chunks: List[str]) -> List[str]:
    refs = set()
    for chunk in chunks:
        for match in re.findall(r"\b[A-Z]{2,}-\d{3,4}-[A-Z]\b", chunk):
            refs.add(match.lower())
        for match in re.findall(r"secao\s*\d+(?:\.\d+)?", chunk.lower()):
            refs.add(match)
    return sorted(refs)


def has_citation(response: str, chunks: List[str]) -> bool:
    response_n = normalize(response)
    refs = extract_expected_refs(chunks)
    if not refs:
        # fallback simples: padrao geral de citacao
        return bool(re.search(r"\b[A-Z]{2,}-\d{3,4}-[A-Z]\b", response))
    return any(ref in response_n for ref in refs)


def has_forbidden_terms(response: str, terms: List[str]) -> bool:
    response_n = normalize(response)
    return any(normalize(term) in response_n for term in terms)


def is_formal_language(response: str) -> bool:
    tokens = re.findall(r"\b\w+\b", response.lower())
    return not any(token in SLANG_TERMS for token in tokens)


def build_user_content(question: str, chunks: List[str]) -> str:
    chunks_text = "\n".join(chunks) if chunks else "(sem chunks recuperados)"
    return (
        "Pergunta do usuario:\n"
        f"{question}\n\n"
        "Chunks recuperados:\n"
        f"{chunks_text}\n\n"
        "Instrucoes:\n"
        "- Responda SOMENTE com base nos chunks acima.\n"
        "- Cite explicitamente a fonte (ID do chunk e/ou secao) quando houver cobertura.\n"
        "- Se nao houver informacao suficiente, responda exatamente: nao encontrei essa informacao.\n"
    )


def call_model(
    client: Any,
    system_prompt: str,
    question: str,
    chunks: List[str],
    max_tokens: int,
) -> str:
    user_content = build_user_content(question, chunks)
    resp = client.messages.create(
        model=MODEL_NAME,
        max_tokens=max_tokens,
        system=system_prompt,
        messages=[{"role": "user", "content": user_content}],
    )

    texts: List[str] = []
    for block in getattr(resp, "content", []):
        text_value = getattr(block, "text", None)
        if text_value:
            texts.append(text_value)
    return "\n".join(texts).strip()


def evaluate_case(case: Dict[str, Any], response: str) -> Dict[str, bool]:
    criterios = case.get("criterios", {})
    chunks = case.get("chunks", [])

    expected_contains_citation = bool(criterios.get("contains_citation", False))
    actual_contains_citation = has_citation(response, chunks)
    citation_ok = actual_contains_citation == expected_contains_citation

    forbidden_terms = criterios.get("no_forbidden_terms", []) or []
    forbidden_ok = not has_forbidden_terms(response, forbidden_terms)

    no_invention_expected = bool(criterios.get("no_invention", False))
    fallback_phrase = criterios.get("fallback_phrase") or ""
    if no_invention_expected:
        no_invention_ok = normalize(fallback_phrase) in normalize(response)
    else:
        no_invention_ok = True

    language_formal_ok = is_formal_language(response)

    return {
        "contains_citation": citation_ok,
        "no_forbidden_terms": forbidden_ok,
        "no_invention": no_invention_ok,
        "language_formal": language_formal_ok,
    }


def print_case_result(result: CaseResult) -> None:
    status = "PASS" if result.passed else "FAIL"
    print(f"\n[{status}] {result.case_id}")
    for key, value in result.checks.items():
        marker = "OK" if value else "X"
        print(f"  - {key}: {marker}")
    if result.error:
        print(f"  - api_error: {result.error}")
    print("  - resposta:")
    print(f"    {result.response if result.response else '(vazia)'}")


def main() -> int:
    args = parse_args()

    if anthropic is None:
        print("ERRO: pacote anthropic nao instalado. Rode: pip install anthropic")
        return 2

    system_prompt = DEFAULT_SYSTEM_PROMPT
    if args.system_prompt_file:
        system_prompt = load_text_file(args.system_prompt_file)

    try:
        test_cases = load_test_cases(args.test_cases_file)
    except Exception as exc:
        print(f"ERRO ao carregar casos: {exc}")
        return 2

    try:
        client = anthropic.Anthropic()
    except Exception as exc:
        print(f"ERRO ao iniciar cliente Anthropic: {exc}")
        return 2

    results: List[CaseResult] = []

    for case in test_cases:
        case_id = case.get("id", "SEM-ID")
        question = case.get("pergunta", "")
        chunks = case.get("chunks", [])

        try:
            response = call_model(client, system_prompt, question, chunks, args.max_tokens)
            checks = evaluate_case(case, response)
            passed = all(checks.values())
            results.append(CaseResult(case_id=case_id, passed=passed, checks=checks, response=response))
        except Exception as exc:
            checks = {
                "contains_citation": False,
                "no_forbidden_terms": False,
                "no_invention": False,
                "language_formal": False,
            }
            results.append(
                CaseResult(
                    case_id=case_id,
                    passed=False,
                    checks=checks,
                    response="",
                    error=str(exc),
                )
            )

    total = len(results)
    passed_count = sum(1 for r in results if r.passed)

    print("=== RELATORIO DE TESTE DE PROMPT ===")
    print(f"Modelo: {MODEL_NAME}")
    for result in results:
        print_case_result(result)

    print("\n=== SUMARIO FINAL ===")
    print(f"Casos totais: {total}")
    print(f"Casos PASS:   {passed_count}")
    print(f"Casos FAIL:   {total - passed_count}")

    return 0 if passed_count == total else 1


if __name__ == "__main__":
    sys.exit(main())
