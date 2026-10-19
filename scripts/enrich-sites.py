#!/usr/bin/env python3
"""
enrich-sites.py — Fase 1a: enriquecimento de site + Meta Ads Library

Para cada lead do pool (status=pending), faz:
  1. Requisição HTTP direta ao site: pixel, GA4, link IG, design signal
  2. Consulta à Meta Ads Library API (sem browser, sem login)

SEM browser. SEM Chrome MCP. Roda em segundos via Claude Code local.

TOKEN META ADS:
  Crie o arquivo pipeline/.meta_token com o conteúdo:
    APP_ID|APP_SECRET
  Ou defina a variável de ambiente META_ADS_TOKEN.
  Nunca commite nem exponha esse token.

Uso:
    python3 scripts/enrich-sites.py [--n 10] [--output pipeline/site-enrichment-{data}.json]
"""

import json
import os
import re
import sys
import time
import argparse
from datetime import date
from pathlib import Path

import phone_utils

# Evita UnicodeEncodeError ao imprimir símbolos no console padrão do Windows
# (cp1252). Sem efeito em Mac/Linux, que já usam UTF-8.
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

try:
    import requests
    from requests.exceptions import RequestException
except ImportError:
    print("Instalando as dependências (scripts/requirements.txt)...")
    import subprocess
    if subprocess.run([sys.executable, "-m", "pip", "install", "-r",
                       str(Path(__file__).parent / "requirements.txt"), "-q"]).returncode != 0:
        sys.exit("Não consegui instalar as dependências. Rode: python -m pip install -r scripts/requirements.txt")
    import requests
    from requests.exceptions import RequestException

PIPELINE_DIR = Path(__file__).parent.parent / "pipeline"
POOL_FILE = PIPELINE_DIR / "pool-prequalificados.json"
TOKEN_FILE = PIPELINE_DIR / ".meta_token"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
}
TIMEOUT = 10


# ---------------------------------------------------------------------------
# Token Meta Ads
# ---------------------------------------------------------------------------

def load_meta_token() -> str | None:
    """
    Carrega o token da Ads Library API.
    Prioridade: variável de ambiente > arquivo pipeline/.meta_token
    Formato esperado: APP_ID|APP_SECRET
    """
    token = os.environ.get("META_ADS_TOKEN")
    if token:
        return token.strip()
    if TOKEN_FILE.exists():
        token = TOKEN_FILE.read_text(encoding="utf-8").strip()
        if token:
            return token
    return None


# ---------------------------------------------------------------------------
# Blocklist
# ---------------------------------------------------------------------------

def build_blocklist() -> set:
    # Python puro, sem `grep` do sistema (não existe no PowerShell/cmd do
    # Windows). Aceita celular e fixo: em modo B2B o pool também tem fixo.
    phones = set()
    sources = (
        list(PIPELINE_DIR.glob("leads-master.json"))
        + list(PIPELINE_DIR.glob("log-disparos.json"))
        + list(PIPELINE_DIR.glob("queue-*.json"))
    )
    for source in sources:
        try:
            text = source.read_text(encoding='utf-8', errors='ignore')
        except OSError:
            continue
        phones |= phone_utils.find_known_phones(text, accept_landline=True)
    phones |= phone_utils.opt_out_phones(PIPELINE_DIR)  # pediram pra parar: nunca reabordar
    return phones


# ---------------------------------------------------------------------------
# Enriquecimento de site (HTTP direto)
# ---------------------------------------------------------------------------

def fetch_site(url: str) -> dict:
    """
    Baixa o HTML do site e extrai sinais de marketing.
    Retorna dict com os campos de enrichment.
    """
    result = {
        "site_ok": False,
        "has_pixel": False,
        "has_ga4": False,
        "ig_handle_from_site": None,
        "design_signal": None,
        "error": None,
    }

    if not url or not url.startswith("http"):
        result["error"] = "no_url"
        return result

    if "instagram.com" in url:
        result["site_ok"] = False
        result["error"] = "instagram_url"
        return result

    try:
        resp = requests.get(url, headers=HEADERS, timeout=TIMEOUT,
                            allow_redirects=True, verify=False)
        resp.raise_for_status()
        html = resp.text
        result["site_ok"] = True
    except RequestException as e:
        result["error"] = str(e)[:80]
        return result

    # Pixel do Facebook
    result["has_pixel"] = (
        "fbevents.js" in html
        or "connect.facebook.net" in html
        or "fbq('init'" in html
        or 'fbq("init"' in html
    )

    # Google Analytics / GA4
    result["has_ga4"] = (
        "gtag(" in html
        or "google-analytics.com/analytics.js" in html
        or bool(re.search(r'G-[A-Z0-9]{8,}', html))
        or bool(re.search(r'UA-\d{6,}-\d', html))
    )

    # Instagram link no site
    ig_links = re.findall(
        r'instagram\.com/([A-Za-z0-9_.]+)(?:[/?"]|$)',
        html
    )
    ignore = {"p", "reel", "explore", "accounts", "stories", "sharedPost",
              "tv", "direct", "ar", "web", "about", "legal", "wix"}
    valid_handles = [h for h in ig_links if h.lower() not in ignore and len(h) > 2]
    if valid_handles:
        result["ig_handle_from_site"] = valid_handles[0]

    # Design signal
    if "elementor" in html or "wp-content" in html or "wp-includes" in html:
        result["design_signal"] = "wordpress"
    elif "wix.com" in html or "_wix_" in html:
        result["design_signal"] = "wix"
    elif "squarespace" in html:
        result["design_signal"] = "squarespace"
    elif "webflow" in html:
        result["design_signal"] = "webflow"
    else:
        result["design_signal"] = "custom"

    return result


# ---------------------------------------------------------------------------
# Meta Ads Library API
# ---------------------------------------------------------------------------

def clean_search_term(title: str) -> str:
    """
    Remove prefixos médicos e sufixos comuns para melhorar a busca.
    Exemplos:
      "Dra. Julia Almenara | Geriatra" → "Julia Almenara"
      "Clínica São Lucas - Cardiologia" → "Clínica São Lucas"
    """
    # Remover prefixos
    title = re.sub(r'^(Dr\.|Dra\.|Dr |Dra )', '', title, flags=re.IGNORECASE).strip()
    # Remover sufixos após | ou -
    title = re.split(r'\s*[|\-]\s*', title)[0].strip()
    # Remover especialidade standalone no final (ex: "Maria Silva Psiquiatra")
    title = re.sub(
        r'\s+(Psiquiatra|Geriatra|Nutricionista|Dermatologista|Cardiologista|'
        r'Neurologista|Ortopedista|Oftalmologista|Urologista|Ginecologista)$',
        '', title, flags=re.IGNORECASE
    ).strip()
    return title or title


def check_meta_ads(title: str, token: str) -> dict:
    """
    Consulta a Meta Ads Library API para verificar se a clínica/médico
    está rodando anúncios no Facebook/Instagram.

    Retorna:
      running: bool | None (None = erro na API)
      creative_count: int | None
      first_seen: str (YYYY-MM-DD) | None
      variation_signal: "low"|"medium"|"high"|None
    """
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
        return {
            "running": None,
            "creative_count": None,
            "first_seen": None,
            "variation_signal": None,
            "api_error": str(e)[:80],
        }

    ads = data.get("data", [])

    if not ads:
        return {
            "running": False,
            "creative_count": 0,
            "first_seen": None,
            "variation_signal": None,
        }

    # Data mais antiga encontrada
    dates = [
        ad["ad_delivery_start_time"]
        for ad in ads
        if ad.get("ad_delivery_start_time")
    ]
    first_seen = min(dates)[:10] if dates else None

    creative_count = len(ads)

    if creative_count >= 5:
        variation_signal = "high"
    elif creative_count >= 2:
        variation_signal = "medium"
    else:
        variation_signal = "low"

    return {
        "running": True,
        "creative_count": creative_count,
        "first_seen": first_seen,
        "variation_signal": variation_signal,
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--n", type=int, default=10, help="Número de leads a processar")
    parser.add_argument("--output", type=str, default=None)
    args = parser.parse_args()

    today = str(date.today())
    output_path = Path(args.output) if args.output else PIPELINE_DIR / f"site-enrichment-{today}.json"

    # Token Meta Ads
    meta_token = load_meta_token()
    if meta_token:
        print("✓ Token Meta Ads carregado")
    else:
        print("⚠  Token Meta Ads não encontrado — meta_ads será null")
        print(f"   Crie {TOKEN_FILE} com: APP_ID|APP_SECRET")

    # Carregar pool
    with open(POOL_FILE, encoding="utf-8") as f:
        pool = json.load(f)

    # Blocklist
    print("Construindo blocklist...")
    blocklist = build_blocklist()
    print(f"Blocklist: {len(blocklist)} números")

    # Selecionar pending
    pending = [l for l in pool if l["status"] == "pending" and l["phone"] not in blocklist]
    to_process = pending[:args.n]

    if not to_process:
        print("Nenhum lead pending no pool.")
        return

    print(f"\nProcessando {len(to_process)} leads...\n")

    results = []
    for i, lead in enumerate(to_process, 1):
        item = lead["item"]
        url = item.get("website") or ""
        title = item.get("title", "?")
        title_short = title[:50]

        print(f"[{i:2d}/{len(to_process)}] {title_short}")
        print(f"        {url[:60]}")

        # 1. Site HTTP
        site_data = fetch_site(url)
        time.sleep(0.4)

        # 2. Meta Ads Library API
        ads_data = {"running": None, "creative_count": None, "first_seen": None, "variation_signal": None}
        if meta_token:
            ads_data = check_meta_ads(title, meta_token)
            time.sleep(0.6)  # Respeitar rate limit da API

        # Tipo de site
        is_intermediate = any(x in url for x in [
            "linktree", "linktr.ee", "doctoralia", "docway", "contate.me", "allmylinks"
        ])
        is_ig_only = "instagram.com" in url

        result = {
            "lead_id": lead["lead_id"],
            "phone": lead["phone"],
            "pre_score": lead["pre_score"],
            "title": title,
            "website": url,
            "website_type": (
                "instagram" if is_ig_only
                else "intermediate" if is_intermediate
                else "real" if site_data["site_ok"]
                else "dead"
            ),
            "site_signals": {
                "site_ok": site_data["site_ok"],
                "has_pixel": site_data["has_pixel"],
                "has_ga4": site_data["has_ga4"],
                "design_signal": site_data["design_signal"],
                "error": site_data["error"],
            },
            "ig_handle_from_site": site_data["ig_handle_from_site"],
            # Instagram followers/posts vêm na Fase 1b (enrich-instagram.py ou Claude Code)
            "instagram": {
                "handle": site_data["ig_handle_from_site"],
                "followers": None,
                "posts": None,
                "engagement_signal": None,
            },
            # Meta Ads: agora preenchido via API
            "meta_ads": {
                "running": ads_data.get("running"),
                "creative_count": ads_data.get("creative_count"),
                "first_seen": ads_data.get("first_seen"),
                "variation_signal": ads_data.get("variation_signal"),
            },
        }

        # Log linha
        status = "✓" if site_data["site_ok"] else ("IG" if is_ig_only else ("INTER" if is_intermediate else "DEAD"))
        pixel = "PX✓" if site_data["has_pixel"] else "px✗"
        ga4 = "GA✓" if site_data["has_ga4"] else "ga✗"
        ig = f"@{site_data['ig_handle_from_site']}" if site_data["ig_handle_from_site"] else "ig?"
        ads_running = ads_data.get("running")
        ads_str = (
            f"ADS✓({ads_data.get('creative_count')})" if ads_running is True
            else ("ads✗" if ads_running is False else "ads?")
        )
        print(f"        → {status} | {pixel} | {ga4} | {ig} | {ads_str}\n")

        results.append(result)

    # Salvar resultado
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    # Resumo
    ok = sum(1 for r in results if r["site_signals"]["site_ok"])
    pixel_count = sum(1 for r in results if r["site_signals"]["has_pixel"])
    ga4_count = sum(1 for r in results if r["site_signals"]["has_ga4"])
    dead = sum(1 for r in results if r["website_type"] == "dead")
    ig_found = sum(1 for r in results if r["ig_handle_from_site"])
    ads_yes = sum(1 for r in results if r["meta_ads"]["running"] is True)
    ads_no = sum(1 for r in results if r["meta_ads"]["running"] is False)

    print("=" * 55)
    print(f"Resultado: {len(results)} leads")
    print(f"  Sites OK:    {ok} | Dead: {dead}")
    print(f"  Pixel:       {pixel_count} | GA4: {ga4_count}")
    print(f"  Handle IG no site: {ig_found}")
    if meta_token:
        print(f"  Meta Ads: {ads_yes} rodando | {ads_no} sem ads | {len(results)-ads_yes-ads_no} erro/null")
    print(f"\nSalvo em: {output_path}")
    print(f"\nPróximo passo (Fase 1b):")
    print(f"  — Instagram ({ig_found} handles encontrados): python scripts/enrich-instagram.py")
    print(f"     ou peça ao Claude Code pra enriquecer pelo navegador dele (sem instalar nada)")
    if not meta_token:
        print(f"  — Meta Ads Library: sem token configurado. Peça ao Claude Code pra conferir")
        print(f"     a Biblioteca de Anúncios da Meta pra esses leads — não precisa de token")
    else:
        print(f"  — Meta Ads: ✓ já preenchido via API")


if __name__ == "__main__":
    import urllib3
    urllib3.disable_warnings()
    main()
