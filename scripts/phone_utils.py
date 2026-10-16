"""Telefones em formato internacional (E.164) para os scripts do ZX Control 7 · Setup 17.

O país padrão vem de DEFAULT_COUNTRY (código de 2 letras: BR, PT, US...). Ele é lido, na
ordem, de: variável de ambiente, `dispatcher/.env` e, se nada existir, BR. Número já escrito
com "+" (por exemplo +351 912 345 678) vale em qualquer país; o país padrão só decide como
ler número escrito sem "+".

Celular x fixo é validado pelo país do número (biblioteca `phonenumbers`), não por regra
fixa do Brasil.
"""
import os
import re
import subprocess
import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).parent
ENV_FILE = SCRIPTS_DIR.parent / "dispatcher" / ".env"

try:
    import phonenumbers
    from phonenumbers import PhoneNumberType as _T
except ImportError:
    print("Instalando as dependências (scripts/requirements.txt)...")
    if subprocess.run([sys.executable, "-m", "pip", "install", "-r",
                       str(SCRIPTS_DIR / "requirements.txt"), "-q"]).returncode != 0:
        sys.exit("Não consegui instalar as dependências. Rode: python -m pip install -r scripts/requirements.txt")
    import phonenumbers
    from phonenumbers import PhoneNumberType as _T

CELULAR = "celular"
FIXO = "fixo"

# Tipos que contam como celular. FIXED_LINE_OR_MOBILE (EUA e outros) não dá pra separar.
_MOBILE = {_T.MOBILE, _T.FIXED_LINE_OR_MOBILE}


def _read_env_file(key: str):
    try:
        for line in ENV_FILE.read_text(encoding="utf-8", errors="ignore").splitlines():
            m = re.match(r"\s*" + re.escape(key) + r"\s*=\s*(.*?)\s*$", line)
            if m:
                return m.group(1).strip("'\"")
    except OSError:
        pass
    return None


def default_country() -> str:
    """País padrão (2 letras). Variável de ambiente > dispatcher/.env > BR."""
    raw = (os.environ.get("DEFAULT_COUNTRY") or _read_env_file("DEFAULT_COUNTRY") or "BR").strip().upper()
    if raw not in phonenumbers.SUPPORTED_REGIONS:
        print(f"[telefone] Aviso: DEFAULT_COUNTRY={raw!r} não é um país válido; usando BR.")
        return "BR"
    return raw


def parse_phone(raw, country=None):
    """Lê um telefone e devolve (e164, kind, motivo).

    kind: CELULAR, FIXO ou None (válido mas de outro tipo, ex.: 0800).
    motivo, quando e164 é None: "vazio" ou "invalido".
    """
    country = country or default_country()
    text = str(raw or "").strip()
    if not re.search(r"\d", text):
        return None, None, "vazio"

    candidates = []
    digits = re.sub(r"\D", "", text)
    if text.startswith("+") or text.startswith("00"):
        candidates.append((text, None))
    else:
        # Sem "+": primeiro tenta como número já com o código do país padrão
        # ("55 11 99999-0000", "351912345678"), depois como número nacional.
        code = str(phonenumbers.country_code_for_region(country))
        if digits.startswith(code):
            candidates.append(("+" + digits, None))
        candidates.append((text, country))

    for value, region in candidates:
        try:
            num = phonenumbers.parse(value, region)
        except phonenumbers.NumberParseException:
            continue
        if not phonenumbers.is_valid_number(num):
            continue
        e164 = phonenumbers.format_number(num, phonenumbers.PhoneNumberFormat.E164)
        t = phonenumbers.number_type(num)
        if t in _MOBILE:
            return e164, CELULAR, None
        if t == _T.FIXED_LINE:
            return e164, FIXO, None
        return e164, None, None
    return None, None, "invalido"


def phone_kind(e164: str):
    """Tipo de um número já em E.164 (ou None se inválido/outro tipo)."""
    return parse_phone(e164)[1]


def find_known_phones(text: str, accept_landline: bool = True) -> set:
    """Telefones em E.164 achados no texto bruto de um arquivo (blocklist)."""
    found = set()
    for match in re.findall(r"\+\d{8,15}", text):
        e164, kind, _ = parse_phone(match)
        if e164 and (kind == CELULAR or (accept_landline and kind == FIXO)):
            found.add(e164)
    return found
