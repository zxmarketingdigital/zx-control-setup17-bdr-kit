#!/usr/bin/env python3
"""
enrich-instagram.py — Fase 1b local: Instagram via Playwright (sem Chrome MCP)

Lê site-enrichment-{date}.json, busca handle + dados de perfil no Instagram,
produz enriched-leads-{date}.json prontos para o pipeline.
Marca leads como 'enriched' no pool-prequalificados.json.

Setup (apenas uma vez):
    python scripts/enrich-instagram.py --login

Uso diário (rodar após enrich-sites.py):
    python scripts/enrich-instagram.py
    python scripts/enrich-instagram.py --date 2026-05-27
    python scripts/enrich-instagram.py --input pipeline/site-enrichment-2026-05-27.json
"""

import asyncio
import json
import re
import sys
import argparse
from datetime import date as datelib
from pathlib import Path

# Evita UnicodeEncodeError ao imprimir símbolos no console padrão do Windows
# (cp1252). Sem efeito em Mac/Linux, que já usam UTF-8.
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

SCRIPTS_DIR  = Path(__file__).parent
PIPELINE_DIR = SCRIPTS_DIR.parent / "pipeline"
SESSION_FILE = SCRIPTS_DIR / ".instagram-session.json"
POOL_FILE    = PIPELINE_DIR / "pool-prequalificados.json"

# ---------------------------------------------------------------------------
# Instalação
# ---------------------------------------------------------------------------

def ensure_playwright():
    try:
        from playwright.async_api import async_playwright  # noqa
    except ImportError:
        import subprocess
        print("Instalando playwright...")
        subprocess.run([sys.executable, "-m", "pip", "install", "-r",
                        str(SCRIPTS_DIR / "requirements-instagram.txt"), "-q"], check=True)
        subprocess.run([sys.executable, "-m", "playwright", "install", "chromium",
                        "--with-deps"], check=True)
        print("Playwright instalado.")

ensure_playwright()
from playwright.async_api import async_playwright, Page  # noqa

# ---------------------------------------------------------------------------
# Parsing de dados do Instagram
# ---------------------------------------------------------------------------

def parse_counts(text: str) -> tuple[int | None, int | None]:
    """
    Extrai (followers, posts) de og:description ou innerText.
    Formatos conhecidos:
      '2,197 Followers, 423 Following, 1,276 Posts - ...'
      '2197 seguidores, 423 seguindo, 1276 publicacoes'
    """
    if not text:
        return None, None

    followers, posts = None, None

    # Tentar padrão inglês (og:description padrao do Instagram)
    m = re.search(r'([\d,\.]+)\s+Follower', text, re.IGNORECASE)
    if m:
        followers = int(re.sub(r'[,\.]', '', m.group(1)))

    m = re.search(r'([\d,\.]+)\s+Post', text, re.IGNORECASE)
    if m:
        posts = int(re.sub(r'[,\.]', '', m.group(1)))

    # Fallback português
    if followers is None:
        m = re.search(r'([\d,\.]+)\s+seguidor', text, re.IGNORECASE)
        if m:
            followers = int(re.sub(r'[,\.]', '', m.group(1)))

    if posts is None:
        m = re.search(r'([\d,\.]+)\s+publica', text, re.IGNORECASE)
        if m:
            posts = int(re.sub(r'[,\.]', '', m.group(1)))

    return followers, posts


DECISOR_TITLE_RE = re.compile(
    r'^(Dr\.?|Dra\.?)\s+([A-ZÀ-Ý][\wà-ÿ]*(?:\s+[A-ZÀ-Ý][\wà-ÿ]*){0,3})$'
)


def extract_decisor(title: str, bio: str | None, handle: str | None) -> dict:
    """
    Extração conservadora do decisor a partir do título do Maps ("Dra. Fulana ...").
    Nunca inventa: sem o prefixo Dr./Dra. no título, fica tudo null. O Instagram só
    é linkado quando a bio da própria conta repete o primeiro nome — evita apontar
    pra conta comercial da marca como se fosse o perfil pessoal.
    """
    decisor = {"nome": None, "papel": None, "instagram_url": None}
    if not title:
        return decisor

    cleaned = re.split(r'\s*[|\-]\s*', title.strip())[0].strip()
    cleaned = re.sub(
        r'\s+(Psicóloga?o?|Psiquiatra|Médico|Médica|Nutricionista|Fisioterapeuta|'
        r'Dermatologista|Cardiologista|Neurologista|Ortopedista|Neuropsicóloga?)$',
        '', cleaned, flags=re.IGNORECASE
    ).strip()

    m = DECISOR_TITLE_RE.match(cleaned)
    if not m:
        return decisor

    prefix = m.group(1) if m.group(1).endswith('.') else f'{m.group(1)}.'
    decisor["nome"] = f'{prefix} {m.group(2)}'
    decisor["papel"] = "responsável técnica"

    primeiro_nome = m.group(2).split()[0]
    if handle and bio and primeiro_nome.lower() in bio.lower():
        decisor["instagram_url"] = f"https://instagram.com/{handle}"

    return decisor


def calc_engagement_signal(followers: int | None) -> str | None:
    if followers is None:
        return None
    if followers >= 5000:
        return "high"
    if followers >= 500:
        return "medium"
    return "low"


# ---------------------------------------------------------------------------
# Extração de bio via script tags embutidos
# ---------------------------------------------------------------------------

EXTRACT_BIO_JS = """
() => {
    // Tenta encontrar o campo biography nos dados embutidos pelo React
    const scripts = Array.from(document.querySelectorAll('script'));
    for (const s of scripts) {
        const t = s.textContent || '';
        // Formato 1: JSON puro
        const m1 = t.match(/"biography"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"/);
        if (m1) return m1[1].replace(/\\\\n/g, '\\n').replace(/\\\\"/g, '"');
        // Formato 2: edge_owner_to_timeline_media
        const m2 = t.match(/"biography":"((?:[^"\\\\]|\\\\.)*)"/);
        if (m2) return m2[1].replace(/\\\\n/g, '\\n').replace(/\\\\"/g, '"');
    }
    return null;
}
"""

EXTRACT_OG_JS = """
(prop) => document.querySelector('meta[property="' + prop + '"]')?.content || null
"""


# ---------------------------------------------------------------------------
# Busca de handle por nome
# ---------------------------------------------------------------------------

async def search_handle(page: Page, title: str) -> str | None:
    """
    Usa a API interna de busca do Instagram para encontrar handle pelo nome.
    Retorna o handle mais relevante ou None.
    """
    # Limpar o nome: remover prefixos médicos, especializações, sufixos
    term = re.sub(r'^(Dr\.|Dra\.|Dr |Dra )', '', title, flags=re.IGNORECASE).strip()
    term = re.split(r'\s*[|\-]\s*', term)[0].strip()
    term = re.sub(
        r'\s+(Psicóloga?o?|Psiquiatra|Médico|Médica|Nutricionista|Fisioterapeuta|'
        r'Dermatologista|Cardiologista|Neurologista|Ortopedista|Neuropsicóloga?)$',
        '', term, flags=re.IGNORECASE
    ).strip()

    if len(term) < 3:
        return None

    try:
        resp = await page.request.get(
            f"https://www.instagram.com/web/search/topsearch/?query={term}",
            headers={"X-Requested-With": "XMLHttpRequest"},
        )
        if resp.status != 200:
            return None
        data = await resp.json()
        users = data.get("users", [])
        if users:
            return users[0]["user"]["username"]
    except Exception:
        pass

    return None


# ---------------------------------------------------------------------------
# Perfil do Instagram
# ---------------------------------------------------------------------------

async def fetch_profile(page: Page, handle: str) -> dict:
    """
    Navega ao perfil e extrai followers, posts, bio, engagement_signal.
    """
    result = {
        "handle": handle,
        "followers": None,
        "posts": None,
        "bio": None,
        "last_post_recent": None,
        "engagement_signal": None,
    }

    try:
        resp = await page.goto(
            f"https://www.instagram.com/{handle}/",
            wait_until="domcontentloaded",
            timeout=20000,
        )

        # Handle inválido (404 ou redirect para login)
        if resp and resp.status == 404:
            result["handle"] = None
            return result

        await page.wait_for_timeout(2500)

        # 1. og:description → followers + posts
        og_desc = await page.evaluate(EXTRACT_OG_JS, "og:description")
        og_title = await page.evaluate(EXTRACT_OG_JS, "og:title")

        followers, posts = parse_counts(og_desc or "")

        # 2. Fallback: innerText da página para counts (quando og não está disponível)
        if followers is None:
            try:
                body_text = await page.evaluate("() => document.body.innerText.slice(0, 2000)")
                followers, posts = parse_counts(body_text)
            except Exception:
                pass

        # 3. Bio via script tags embutidos
        bio = None
        try:
            bio = await page.evaluate(EXTRACT_BIO_JS)
        except Exception:
            pass

        # 4. Verificar se perfil não existe
        if og_title and ("Page Not Found" in og_title or "não encontrada" in og_title.lower()):
            result["handle"] = None
            return result

        result["followers"] = followers
        result["posts"] = posts
        result["bio"] = bio
        result["engagement_signal"] = calc_engagement_signal(followers)

    except Exception as e:
        result["_error"] = str(e)[:100]

    return result


# ---------------------------------------------------------------------------
# Produção de enriched-leads no formato do pipeline
# ---------------------------------------------------------------------------

def build_enriched_lead(pool_item: dict, site: dict, ig: dict, meta: dict) -> dict:
    """
    Combina dados do pool + site-enrichment + instagram + meta_ads
    no formato de enriched-leads-{date}.json.
    """
    item = pool_item.get("item", {})

    address_parts = [
        item.get("street", ""),
        item.get("city", ""),
        item.get("state", ""),
    ]
    address = ", ".join(p for p in address_parts if p)

    return {
        "lead_id": pool_item["lead_id"],
        "title": item.get("title", ""),
        "name": item.get("title", ""),   # sem decisor identificado → usa título
        "phone": pool_item["phone"],
        "category": item.get("categoryName", ""),
        "address": address,
        "totalScore": item.get("totalScore"),
        "reviewsCount": item.get("reviewsCount"),
        "website": item.get("website", ""),
        "enrichment": {
            "decisor": extract_decisor(item.get("title", ""), ig.get("bio"), ig.get("handle")),
            "instagram": {
                "handle": ig.get("handle"),
                "followers": ig.get("followers"),
                "posts": ig.get("posts"),
                "bio": ig.get("bio"),
                "last_post_recent": ig.get("last_post_recent"),
                "engagement_signal": ig.get("engagement_signal"),
            },
            "meta_ads": {
                "running": meta.get("running"),
                "creative_count": meta.get("creative_count"),
                "first_seen": meta.get("first_seen"),
                "variation_signal": meta.get("variation_signal"),
            },
            "website_signals": {
                "has_pixel": site.get("site_signals", {}).get("has_pixel"),
                "has_ga4": site.get("site_signals", {}).get("has_ga4"),
                "design_signal": site.get("site_signals", {}).get("design_signal"),
                "has_segmented_lps": None,
            },
        },
    }


# ---------------------------------------------------------------------------
# Flow principal
# ---------------------------------------------------------------------------

async def run_enrich(input_file: Path, output_file: Path):
    pool = json.loads(POOL_FILE.read_text(encoding="utf-8"))
    pool_index = {l["lead_id"]: l for l in pool}

    enrichment_list = json.loads(input_file.read_text(encoding="utf-8"))
    to_process = [
        e for e in enrichment_list
        if e.get("instagram", {}).get("followers") is None
    ]

    print(f"Leads para enriquecer: {len(to_process)} de {len(enrichment_list)}")
    if not to_process:
        print("Nada a fazer.")
        return

    enriched_leads = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            storage_state=str(SESSION_FILE),
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 900},
        )
        page = await context.new_page()

        # Aquece a sessão
        await page.goto("https://www.instagram.com/", wait_until="domcontentloaded")
        await page.wait_for_timeout(2000)

        for i, site in enumerate(to_process, 1):
            lead_id = site["lead_id"]
            title   = site.get("title", "?")
            handle  = site.get("ig_handle_from_site") or site.get("instagram", {}).get("handle")
            pool_item = pool_index.get(lead_id, {})
            meta    = site.get("meta_ads", {})

            print(f"\n[{i}/{len(to_process)}] {title[:55]}")

            # --- Passo 1: encontrar handle se não veio do site ---
            if not handle:
                print("  Buscando handle por nome...")
                handle = await search_handle(page, title)
                if handle:
                    print(f"  Encontrado: @{handle}")
                else:
                    print("  Handle nao encontrado — Instagram null")

            # --- Passo 2: buscar perfil ---
            ig = {"handle": None, "followers": None, "posts": None,
                  "bio": None, "last_post_recent": None, "engagement_signal": None}

            if handle:
                print(f"  @{handle}")
                ig = await fetch_profile(page, handle)
                f = ig.get("followers")
                po = ig.get("posts")
                sig = ig.get("engagement_signal")
                bio_preview = (ig.get("bio") or "")[:60]
                print(f"  -> followers={f} posts={po} signal={sig}")
                if bio_preview:
                    print(f"  -> bio: {bio_preview}")

            # --- Passo 3: montar enriched lead ---
            enriched = build_enriched_lead(pool_item, site, ig, meta)
            enriched_leads.append(enriched)

            # --- Passo 4: marcar como enriched no pool ---
            if lead_id in pool_index:
                pool_index[lead_id]["status"] = "enriched"

            await asyncio.sleep(2.5)

        await browser.close()

    # Salvar enriched-leads
    output_file.write_text(
        json.dumps(enriched_leads, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )

    # Salvar pool atualizado
    POOL_FILE.write_text(
        json.dumps(list(pool_index.values()), ensure_ascii=False, indent=2),
        encoding="utf-8"
    )

    found = sum(1 for e in enriched_leads if e["enrichment"]["instagram"]["followers"] is not None)
    print(f"\nInstagram com dados: {found}/{len(enriched_leads)}")
    print(f"Salvo: {output_file}")
    print(f"Pool atualizado: leads marcados como enriched")
    print(f"\nPróximo passo: 'roda o pipeline'")


# ---------------------------------------------------------------------------
# Login interativo (primeira vez)
# ---------------------------------------------------------------------------

async def run_login():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context()
        page = await context.new_page()

        await page.goto("https://www.instagram.com/accounts/login/")
        print("\nFaca login no Instagram no browser que abriu.")
        print("Depois de entrar na home, pressione ENTER aqui...")
        input()

        await context.storage_state(path=str(SESSION_FILE))
        print(f"Sessao salva em: {SESSION_FILE}")
        print("Pronto — nas proximas vezes rode sem --login.")
        await browser.close()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Enriquece Instagram via Playwright")
    parser.add_argument("--login", action="store_true",
                        help="Login interativo (apenas primeira vez)")
    parser.add_argument("--date", type=str, default=str(datelib.today()),
                        help="Data do arquivo (YYYY-MM-DD), default: hoje")
    parser.add_argument("--input", type=str, default=None,
                        help="Arquivo site-enrichment de entrada (sobrescreve --date)")
    args = parser.parse_args()

    if args.login:
        asyncio.run(run_login())
        return

    if not SESSION_FILE.exists():
        print(f"Sessao nao encontrada. Rode primeiro:")
        print(f"  python scripts/enrich-instagram.py --login")
        sys.exit(1)

    input_file = Path(args.input) if args.input else PIPELINE_DIR / f"site-enrichment-{args.date}.json"
    output_file = PIPELINE_DIR / f"enriched-leads-{args.date}.json"

    if not input_file.exists():
        print(f"Arquivo nao encontrado: {input_file}")
        print(f"Rode primeiro: python scripts/enrich-sites.py")
        sys.exit(1)

    asyncio.run(run_enrich(input_file, output_file))


if __name__ == "__main__":
    main()
