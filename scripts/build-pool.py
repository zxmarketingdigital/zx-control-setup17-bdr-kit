#!/usr/bin/env python3
"""
build-pool.py — Fase 0 do pipeline BDR

Lê um dataset do Google Maps (JSON exportado da Apify ou arquivo local),
deduplica contra o blocklist consolidado, aplica pré-qualificação leve
e appenda os novos candidatos em pipeline/pool-prequalificados.json.

Uso:
    python3 scripts/build-pool.py <caminho-do-dataset.json>

Exemplo:
    python3 scripts/build-pool.py ~/Downloads/dataset-apify-2026-05-28.json
"""

import json
import re
import sys
import unicodedata
from datetime import date
from pathlib import Path
from collections import Counter

import phone_utils

# Evita UnicodeEncodeError ao imprimir símbolos (✓, ⚠️, →) no console padrão
# do Windows (cp1252). Sem efeito em Mac/Linux, que já usam UTF-8.
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

PIPELINE_DIR = Path(__file__).parent.parent / "pipeline"
POOL_FILE = PIPELINE_DIR / "pool-prequalificados.json"
ICP_FILE = PIPELINE_DIR / "icp-config.json"

# Telefones: formato internacional (E.164), validado por país em scripts/phone_utils.py.
# O país padrão (DEFAULT_COUNTRY, padrão BR) só decide como ler número escrito sem "+".


# ---------------------------------------------------------------------------
# Tipo de negócio (gerado pelo wizard). Agência = comportamento validado,
# sem ajuste por nicho. B2B = ranking por categoria-alvo, exclusão de
# categorias e aceita telefone fixo (muita empresa B2B usa WhatsApp Business
# em fixo — o dispatcher valida se o número tem WhatsApp antes de enviar).
# ---------------------------------------------------------------------------

def load_icp_config() -> dict:
    try:
        cfg = json.loads(ICP_FILE.read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError):
        return {'business_type': 'agencia'}
    if cfg.get('business_type') != 'b2b':
        return {'business_type': 'agencia'}
    return {
        'business_type': 'b2b',
        'target_categories': [norm(c) for c in cfg.get('target_categories', []) if c],
        'exclude_categories': [norm(c) for c in cfg.get('exclude_categories', []) if c],
        'accept_landline': cfg.get('accept_landline', True),
    }


def norm(s: str) -> str:
    s = unicodedata.normalize('NFKD', str(s or '')).encode('ascii', 'ignore').decode()
    return s.lower().strip()


def category_text(item: dict) -> str:
    """Junta os campos de categoria que o scraper do Google Maps costuma trazer."""
    parts = [item.get('categoryName'), item.get('category'), item.get('title')]
    cats = item.get('categories')
    if isinstance(cats, list):
        parts.extend(cats)
    return norm(' | '.join(str(p) for p in parts if p))


def matches_any(text: str, keywords: list) -> bool:
    return any(k and k in text for k in keywords)


# ---------------------------------------------------------------------------
# Blocklist — implementado em Python puro (sem depender de `grep` do sistema,
# que não existe por padrão no PowerShell/cmd do Windows)
# ---------------------------------------------------------------------------

def build_blocklist(include_landline: bool = False) -> set:
    """
    Consolida todos os phones já conhecidos a partir de:
      - leads-master.json (pode estar corrompido — leitura via regex, não via json.load)
      - log-disparos.json
      - queue-*.json (fonte mais confiável)

    Varre o texto bruto de cada arquivo em busca do padrão de telefone —
    mesmo comportamento que o antigo `grep -ohP` tinha, só que sem shell out.
    """
    phones = set()
    sources = (
        list(PIPELINE_DIR.glob("leads-master.json"))
        + list(PIPELINE_DIR.glob("log-disparos.json"))
        + list(PIPELINE_DIR.glob("queue-*.json"))
    )

    if not sources:
        print("[build-pool] Aviso: nenhum arquivo de blocklist encontrado.")
        return phones

    for source in sources:
        try:
            text = source.read_text(encoding='utf-8', errors='ignore')
        except OSError:
            continue
        phones |= phone_utils.find_known_phones(text, accept_landline=include_landline)

    print(f"[build-pool] Blocklist: {len(phones)} telefones conhecidos")
    return phones


# ---------------------------------------------------------------------------
# Normalização e filtros básicos
# ---------------------------------------------------------------------------

def parse_phone(ph, country: str):
    """(e164, kind, motivo): kind é 'celular', 'fixo' ou None; motivo é 'vazio' ou 'invalido'."""
    return phone_utils.parse_phone(ph, country)


def has_digital_presence(item: dict) -> bool:
    """Descarta apenas quem não tem absolutamente nenhuma presença digital."""
    return bool(item.get('website'))


def make_slug(title: str) -> str:
    s = unicodedata.normalize('NFKD', title).encode('ascii', 'ignore').decode()
    s = re.sub(r'[^\w\s-]', '', s.lower())
    s = re.sub(r'[\s-]+', '-', s.strip())
    return 'vit-' + s[:35]


# ---------------------------------------------------------------------------
# Pré-score (sem browser — só dados do Apify)
# ---------------------------------------------------------------------------

def pre_score(item: dict) -> int:
    """
    Score de 0–10 baseado apenas nos dados brutos do Apify.
    NÃO faz nenhuma chamada de rede.

    Pontuação:
      +2  site real próprio (não é IG, não é intermediário)
      +2  perfil Instagram direto como website
      +1  link intermediário (linktree, doctoralia, contate.me etc.)
           → sinal de fit: oportunidade de vender site + rastreabilidade
      +1  reviews ≥ 50
      +1  reviews ≥ 200
      +1  score Google ≥ 4.5
      +1  nome de pessoa ou clínica identificável
      +0.5 tem imageUrl
      +0.5 tem openingHours
    """
    s = 0.0
    web = item.get('website') or ''

    has_ig = 'instagram.com' in web
    is_intermediate = any(x in web for x in [
        'linktree', 'linktr.ee', 'doctoralia', 'docway',
        'contate.me', 'allmylinks', 'beacons.ai'
    ])
    is_real = web and not has_ig and not is_intermediate and web.startswith('http')

    if is_real:
        s += 2
    elif has_ig:
        s += 2
    elif is_intermediate:
        s += 1  # fit signal — oportunidade de venda

    rev = item.get('reviewsCount') or 0
    if rev >= 50:
        s += 1
    if rev >= 200:
        s += 1
    if (item.get('totalScore') or 0) >= 4.5:
        s += 1

    title = item.get('title') or ''
    person_signals = ['Dr.', 'Dra.', 'Dr ', 'Dra ', 'Psicóloga', 'Psicólogo',
                      'Nutricionista', 'Clínica', 'Instituto', 'Centro']
    if any(sig in title for sig in person_signals):
        s += 1

    if item.get('imageUrl'):
        s += 0.5
    if item.get('openingHours'):
        s += 0.5

    return min(round(s), 10)


def pre_score_b2b(item: dict, icp: dict, phone_type: str) -> tuple[int, bool]:
    """
    Score 0–10 pro modo B2B. Mesmos sinais de presença do modo agência,
    mas o sinal de nicho vem das categorias-alvo do setup (não de
    "Dr./Clínica", que é específico de saúde):

      +2  site próprio     (+1 se for só link intermediário/Instagram)
      +1  reviews ≥ 20     +1 reviews ≥ 100   +1 nota Google ≥ 4.5
      +3  categoria bate com as categorias-alvo
      +0.5 imageUrl        +0.5 openingHours
      -1  telefone fixo (menos certeza de ter WhatsApp)
    """
    s = 0.0
    web = item.get('website') or ''
    has_ig = 'instagram.com' in web
    is_intermediate = any(x in web for x in [
        'linktree', 'linktr.ee', 'contate.me', 'allmylinks', 'beacons.ai'
    ])
    if web.startswith('http') and not has_ig and not is_intermediate:
        s += 2
    elif web:
        s += 1

    rev = item.get('reviewsCount') or 0
    if rev >= 20:
        s += 1
    if rev >= 100:
        s += 1
    if (item.get('totalScore') or 0) >= 4.5:
        s += 1

    niche_match = matches_any(category_text(item), icp['target_categories'])
    if niche_match:
        s += 3

    if item.get('imageUrl'):
        s += 0.5
    if item.get('openingHours'):
        s += 0.5
    if phone_type == 'fixo':
        s -= 1

    return max(0, min(round(s), 10)), niche_match


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    dataset_path = Path(sys.argv[1])
    if not dataset_path.exists():
        print(f"[build-pool] Erro: arquivo não encontrado: {dataset_path}")
        sys.exit(1)

    source_name = dataset_path.stem

    print(f"[build-pool] Lendo dataset: {dataset_path}")
    with open(dataset_path, encoding='utf-8') as f:
        dataset = json.load(f)
    print(f"[build-pool] {len(dataset)} itens no dataset")

    country = phone_utils.default_country()
    icp = load_icp_config()
    b2b = icp['business_type'] == 'b2b'
    accept_landline = b2b and icp.get('accept_landline', True)
    if b2b:
        print(f"[build-pool] Modo B2B — categorias-alvo: {', '.join(icp['target_categories']) or '(nenhuma)'}")
        if icp['exclude_categories']:
            print(f"[build-pool] Categorias excluídas: {', '.join(icp['exclude_categories'])}")

    # Blocklist
    blocklist = build_blocklist(include_landline=accept_landline)

    # Carregar pool existente
    existing_phones = set()
    pool = []
    if POOL_FILE.exists():
        with open(POOL_FILE, encoding='utf-8') as f:
            pool = json.load(f)
        existing_phones = {l['phone'] for l in pool}
        print(f"[build-pool] Pool existente: {len(pool)} leads ({sum(1 for l in pool if l['status']=='pending')} pending)")

    # Processar dataset
    stats = {k: 0 for k in ['no_phone', 'invalid_phone', 'not_cell', 'blocklist', 'duplicate', 'no_presence', 'excluded', 'landline', 'niche_match', 'added']}
    added = []
    today = str(date.today())

    for item in dataset:
        phone, kind, why = parse_phone(item.get('phone') or '', country)

        if not phone:
            stats['no_phone' if why == 'vazio' else 'invalid_phone'] += 1
            continue
        phone_type = 'celular'
        if kind != phone_utils.CELULAR:
            if accept_landline and kind == phone_utils.FIXO:
                phone_type = 'fixo'
            else:
                stats['not_cell'] += 1
                continue
        if phone in blocklist:
            stats['blocklist'] += 1
            continue
        if phone in existing_phones:
            stats['duplicate'] += 1
            continue
        if b2b and icp['exclude_categories'] and matches_any(category_text(item), icp['exclude_categories']):
            stats['excluded'] += 1
            continue
        # Agência vende presença digital: sem site não é lead. Em B2B a oferta
        # pode não ter nada a ver com site, então quem não tem site só pontua menos.
        if not b2b and not has_digital_presence(item):
            stats['no_presence'] += 1
            continue

        if b2b:
            score, niche_match = pre_score_b2b(item, icp, phone_type)
        else:
            score, niche_match = pre_score(item), None

        entry = {
            "lead_id": make_slug(item.get('title', '')),
            "phone": phone,
            "pre_score": score,
            "status": "pending",
            "added_at": today,
            "source": source_name,
            "item": item
        }
        if b2b:
            entry["phone_type"] = phone_type
            entry["niche_match"] = niche_match
            if phone_type == 'fixo':
                stats['landline'] += 1
            if niche_match:
                stats['niche_match'] += 1
        pool.append(entry)
        existing_phones.add(phone)
        stats['added'] += 1
        added.append(entry)

    # Reordenar por pre_score desc (mantém status enriched/descartado no topo não atrapalha).
    # Em B2B, lead do nicho vem sempre antes de lead fora do nicho — presença
    # digital forte não compensa segmento errado. O enrich-sites.py pega os
    # próximos pending nessa ordem.
    if b2b:
        pool.sort(key=lambda x: (x['status'] == 'pending', bool(x.get('niche_match')), x['pre_score']), reverse=True)
    else:
        pool.sort(key=lambda x: (x['status'] == 'pending', x['pre_score']), reverse=True)

    # Salvar
    with open(POOL_FILE, 'w', encoding='utf-8') as f:
        json.dump(pool, f, ensure_ascii=False, indent=2)

    # Relatório
    print(f"\n[build-pool] Resultado:")
    print(f"  País padrão dos telefones: {country}")
    print(f"  Sem phone:        {stats['no_phone']}")
    print(f"  Phone inválido:   {stats['invalid_phone']}")
    print(f"  Não é celular:    {stats['not_cell']}")
    print(f"  Blocklist:        {stats['blocklist']}")
    print(f"  Já no pool:       {stats['duplicate']}")
    if b2b:
        print(f"  Categoria excluída: {stats['excluded']}")
    else:
        print(f"  Sem presença:     {stats['no_presence']}")
    print(f"  Adicionados:      {stats['added']}")
    if b2b and stats['added']:
        print(f"    batem com o nicho: {stats['niche_match']} de {stats['added']}")
        print(f"    telefone fixo:     {stats['landline']} (o dispatcher confere se tem WhatsApp antes de enviar)")
    pending_total = sum(1 for l in pool if l['status'] == 'pending')
    print(f"\n  Pool total pending: {pending_total} leads")

    if added:
        sc = Counter(e['pre_score'] for e in added)
        print(f"  Distribuição dos novos:")
        for k in sorted(sc.keys(), reverse=True):
            print(f"    score {k}: {sc[k]} leads")

    days_remaining = pending_total // 10
    print(f"\n  Estimativa: ~{days_remaining} dias úteis de enriquecimento disponíveis")
    if pending_total < 30:
        print(f"  ⚠️  Pool abaixo de 30 — considere puxar novo dataset da Apify")


if __name__ == '__main__':
    main()
