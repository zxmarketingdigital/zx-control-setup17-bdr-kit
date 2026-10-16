#!/usr/bin/env python3
"""
fill-meta-ads.py — Preenche meta_ads nos leads de enriched-leads-{data}.json
onde running=None (ainda não consultado).

Uso:
    python3 scripts/fill-meta-ads.py
    python3 scripts/fill-meta-ads.py --file pipeline/enriched-leads-2026-05-27.json
"""

import json
import re
import sys
import time
import argparse
from datetime import date
from pathlib import Path

# Evita UnicodeEncodeError ao imprimir símbolos (✓, ✗, →) no console padrão
# do Windows (cp1252). Sem efeito em Mac/Linux, que já usam UTF-8.
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

try:
    import requests
except ImportError:
    import subprocess
    if subprocess.run([sys.executable, "-m", "pip", "install", "-r",
                       str(Path(__file__).parent / "requirements.txt"), "-q"]).returncode != 0:
        sys.exit("Não consegui instalar as dependências. Rode: python -m pip install -r scripts/requirements.txt")
    import requests

PIPELINE_DIR = Path(__file__).parent.parent / "pipeline"
TOKEN_FILE = PIPELINE_DIR / ".meta_token"


def load_meta_token() -> str | None:
    import os
    token = os.environ.get("META_ADS_TOKEN")
    if token:
        return token.strip()
    if TOKEN_FILE.exists():
        token = TOKEN_FILE.read_text(encoding="utf-8").strip()
        if token:
            return token
    return None


def clean_search_term(title: str) -> str:
    title = re.sub(r'^(Dr\.|Dra\.|Dr |Dra )', '', title, flags=re.IGNORECASE).strip()
    title = re.split(r'\s*[|\-]\s*', title)[0].strip()
    title = re.sub(
        r'\s+(Psiquiatra|Geriatra|Nutricionista|Dermatologista|Cardiologista|'
        r'Neurologista|Ortopedista|Oftalmologista|Urologista|Ginecologista|'
        r'Psic[oó]logo?a?)$',
        '', title, flags=re.IGNORECASE
    ).strip()
    return title


def check_meta_ads(title: str, token: str) -> dict:
    search_term = clean_search_term(title)
    url = "https://graph.facebook.com/v21.0/ads_archive"
    params = {
        "access_token": token,
        "search_terms": search_term,
        "ad_reached_countries": '["BR"]',
        "ad_type": "ALL",
        "fields": "id,ad_delivery_start_time,page_name",
        "limit": 25,
    }
    try:
        resp = requests.get(url, params=params, timeout=15)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        return {"running": None, "creative_count": None,
                "first_seen": None, "variation_signal": None,
                "api_error": str(e)[:80]}

    ads = data.get("data", [])
    if not ads:
        return {"running": False, "creative_count": 0,
                "first_seen": None, "variation_signal": None}

    dates = [ad["ad_delivery_start_time"]
             for ad in ads if ad.get("ad_delivery_start_time")]
    first_seen = min(dates)[:10] if dates else None
    creative_count = len(ads)

    if creative_count >= 5:
        variation_signal = "high"
    elif creative_count >= 2:
        variation_signal = "medium"
    else:
        variation_signal = "low"

    return {"running": True, "creative_count": creative_count,
            "first_seen": first_seen, "variation_signal": variation_signal}


def main():
    parser = argparse.ArgumentParser()
    today = str(date.today())
    parser.add_argument("--file", default=str(
        PIPELINE_DIR / f"enriched-leads-{today}.json"))
    args = parser.parse_args()

    file_path = Path(args.file)
    if not file_path.exists():
        print(f"Arquivo não encontrado: {file_path}")
        sys.exit(1)

    token = load_meta_token()
    if not token:
        print(f"Token não encontrado. Crie {TOKEN_FILE} com APP_ID|APP_SECRET")
        sys.exit(1)
    print(f"✓ Token carregado")

    leads = json.load(open(file_path, encoding="utf-8"))
    to_fill = [l for l in leads if l.get("enrichment", {})
               .get("meta_ads", {}).get("running") is None]

    print(f"Leads com meta_ads=null: {len(to_fill)} de {len(leads)}")

    if not to_fill:
        print("Nada a preencher.")
        return

    # Index por lead_id para atualizar in-place
    leads_index = {l["lead_id"]: l for l in leads}

    for i, lead in enumerate(to_fill, 1):
        title = lead.get("title", "?")
        print(f"[{i}/{len(to_fill)}] {title[:50]}")
        result = check_meta_ads(title, token)
        time.sleep(0.6)

        leads_index[lead["lead_id"]]["enrichment"]["meta_ads"] = {
            "running": result.get("running"),
            "creative_count": result.get("creative_count"),
            "first_seen": result.get("first_seen"),
            "variation_signal": result.get("variation_signal"),
        }

        r = result.get("running")
        cc = result.get("creative_count")
        ads_str = f"ADS✓({cc})" if r is True else ("ads✗" if r is False else "ads?")
        print(f"  → {ads_str}")

    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(list(leads_index.values()), f, ensure_ascii=False, indent=2)

    print(f"\nAtualizado: {file_path}")
    ads_yes = sum(1 for l in leads if l["enrichment"]["meta_ads"]["running"] is True)
    ads_no  = sum(1 for l in leads if l["enrichment"]["meta_ads"]["running"] is False)
    print(f"Meta Ads: {ads_yes} rodando | {ads_no} sem ads | {len(leads)-ads_yes-ads_no} null/erro")
    print(f"\nAgora rode o pipeline: 'roda o pipeline'")


if __name__ == "__main__":
    import urllib3
    urllib3.disable_warnings()
    main()
