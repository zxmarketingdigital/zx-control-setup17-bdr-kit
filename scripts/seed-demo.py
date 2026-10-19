#!/usr/bin/env python3
"""Dados de demonstração do ZX Control 7 · Setup 17.

Cria leads FICTÍCIOS em vários estágios (novo, em cadência, respondeu, reunião marcada,
frio, opt-out, convertido, esgotado) para mostrar o CRM funcionando sem lead real.

Uso (na pasta do setup; no Mac e Linux troque `python` por `python3`):

    python scripts/seed-demo.py                              # só o CRM, 9 leads fictícios
    python scripts/seed-demo.py --telefone-teste +5527999990000
                                                             # + o "Lead de Teste", que é o
                                                             #   SEU número de teste e entra
                                                             #   na fila de hoje
    python scripts/seed-demo.py --limpar                     # remove tudo que o seed criou

Segurança:
  * Todo registro criado tem id `demo-...` e `"demo": true`. `--limpar` remove só esses.
  * Se já existir lead real em pipeline/leads-master.json, o script RECUSA rodar (use uma
    instalação de demonstração separada) a menos que você passe --forcar.
  * Os telefones fictícios têm formato de telefone FIXO e não entram na fila. O dispatcher
    só envia o que está em queue-AAAA-MM-DD.json, e a fila criada aqui tem no máximo um
    contato: o número de teste que você informou.
"""
import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

PIPELINE_DIR = Path(os.environ.get("PIPELINE_DIR") or Path(__file__).resolve().parent.parent / "pipeline")
DEMO_PREFIX = "demo-"
TEST_LEAD_ID = "demo-teste"

COPY_TOQUE_1 = (
    "Oi, {nome}. Vi o perfil de vocês e achei o trabalho bem cuidado, mas os anúncios que "
    "estão rodando parecem ter o mesmo criativo há semanas. Posso te mostrar em 15 minutos "
    "como isso costuma segurar o resultado? Qual o melhor horário pra uma ligação rápida?"
)
COPY_FOLLOWUPS = {
    2: "Oi, {nome}, passando só pra saber se viu minha mensagem de ontem. Sem compromisso: posso te ligar quando for melhor pra você.",
    3: "{nome}, imagino que a semana esteja corrida. Separei um exemplo de como outro negócio parecido com o seu trocou o criativo e o que mudou. Quer que eu mande?",
    4: "Oi, {nome}. Se o assunto não for prioridade agora, me diga que eu não insisto. Se for, tenho dois horários livres esta semana.",
    5: "{nome}, última tentativa de contato por aqui nesta semana. Posso te enviar o resumo do que observei no perfil de vocês?",
    6: "Oi, {nome}. Vou encerrar o contato por enquanto para não incomodar. Se quiser retomar, é só responder aqui.",
}


def queue_date(now):
    """Dia (AAAA-MM-DD) que o dispatcher considera "hoje": no TIMEZONE configurado."""
    tz_name = os.environ.get("TIMEZONE")
    if not tz_name:
        try:
            for line in (PIPELINE_DIR.parent / "dispatcher" / ".env").read_text(encoding="utf-8", errors="ignore").splitlines():
                if line.strip().startswith("TIMEZONE="):
                    tz_name = line.split("=", 1)[1].strip().strip("'\"")
        except OSError:
            pass
    try:
        from zoneinfo import ZoneInfo
        return now.astimezone(ZoneInfo(tz_name or "America/Sao_Paulo")).strftime("%Y-%m-%d")
    except Exception:  # sem tzdata (comum no Windows) ou fuso inválido: usa o relógio do computador
        return now.astimezone().strftime("%Y-%m-%d")


def iso(dt):
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def phone_for(n):
    # Formato de telefone fixo de São Paulo (8 dígitos): fictício e sem WhatsApp.
    return f"+55115550{n:04d}"


def ata(nome, papel, sinais, melhoria, direcao):
    return {
        "decisor_nome": nome,
        "decisor_papel": papel,
        "decisor_instagram": None,
        "sinais_observados": sinais,
        "pontos_de_melhoria": melhoria,
        "direcao_sugerida": direcao,
    }


def annotation_text(notes):
    parts = []
    if notes.get("decisor_nome"):
        parts.append(f"**Decisor**\n{notes['decisor_nome']} ({notes['decisor_papel']})")
    parts.append(f"**Sinais observados**\n{notes['sinais_observados']}")
    parts.append(f"**Pontos de melhoria**\n{notes['pontos_de_melhoria']}")
    parts.append(f"**Direção sugerida**\n{notes['direcao_sugerida']}")
    return "\n\n".join(parts)


def next_due(now, days=1):
    d = (now + timedelta(days=days)).replace(hour=13, minute=0, second=0, microsecond=0)
    return iso(d)  # 10h no horário de Brasília; o CRM mostra no fuso configurado


def build_demo(now, test_phone=None):
    """Devolve {'leads': {...}, 'responses': [...], 'log': [...], 'queue': [...]}."""
    leads, responses, log, queue = {}, [], [], []

    def history_for(lead_id, phone, nome, touches, last_sent):
        """touches toques já enviados, o último em `last_sent`; os anteriores a cada 1 dia útil atrás."""
        hist = []
        for t in range(1, touches + 1):
            sent = last_sent - timedelta(days=(touches - t))
            copy = (COPY_TOQUE_1 if t == 1 else COPY_FOLLOWUPS[t]).format(nome=nome)
            hist.append({"touch": t, "sent_at": iso(sent), "copy": copy})
            log.append({"timestamp": iso(sent), "lead_id": lead_id, "touch": t, "phone": phone, "status": "sent", "error": None})
        return hist

    def add(n, nome, marca, categoria, touches, last_sent_days_ago, status, notes=None, **extra):
        lead_id = f"{DEMO_PREFIX}{n:02d}"
        phone = phone_for(n)
        last_sent = now - timedelta(days=last_sent_days_ago)
        lead = {
            "demo": True,
            "no_send": True,  # o dispatcher e o CRM nunca enviam para lead de exemplo
            "name": nome,
            "marca": marca,
            "phone": phone,
            "category": categoria,
            "first_contact_date": (last_sent - timedelta(days=touches - 1)).strftime("%Y-%m-%d"),
            "current_touch": touches,
            "next_touch_due_at": next_due(now) if status == "active" and touches < 6 else None,
            "responded": False,
            "responded_at": None,
            "status": status,
            "history": history_for(lead_id, phone, marca, touches, last_sent),
        }
        if notes:
            lead["crm_notes"] = notes
            lead["annotations"] = [{"at": iso(last_sent - timedelta(days=touches - 1)), "text": annotation_text(notes)}]
        lead.update(extra)
        leads[lead_id] = lead
        return lead_id, lead

    def reply(lead_id, lead, message, hours_after_last):
        sent = datetime.strptime(lead["history"][-1]["sent_at"], "%Y-%m-%dT%H:%M:%S.000Z").replace(tzinfo=timezone.utc)
        at = sent + timedelta(hours=hours_after_last)
        responses.append({"lead_id": lead_id, "phone": lead["phone"], "received_at": iso(at), "message": message})
        lead["responded"] = True
        lead["responded_at"] = iso(at)
        lead["next_touch_due_at"] = None
        return at

    # 1. Acabou de receber o primeiro toque
    add(1, "Clínica Aurora (demo)", "Aurora", "Clínica odontológica", 1, 0, "active",
        ata("Dra. Helena", "dona", "Perfil ativo, 6 mil seguidores, 1 criativo de anúncio rodando há 40 dias.",
            "Mesmo criativo há semanas; página de agendamento genérica.", "Ligar oferecendo um teste de 2 criativos novos."))

    # 2. Em cadência, sem resposta
    add(2, "Barbearia Modelo Centro (demo)", "Barbearia Modelo", "Barbearia", 2, 1, "active",
        ata("Marcos", "sócio", "Instagram com bom volume de posts, sem anúncios ativos.",
            "Sem anúncio local; bio sem link de agendamento.", "Mostrar como captar agendamentos pelo Instagram."))

    # 3. Respondeu e quer saber preço
    lid, l = add(3, "Studio Pilates Exemplo (demo)", "Studio Exemplo", "Pilates e bem-estar", 1, 2, "responded",
                 ata("Camila", "dona", "Anúncios rodando, mas sem pixel no site.",
                     "Site sem pixel e sem página de conversão.", "Perguntar o que ela espera da agência atual e propor uma call."))
    reply(lid, l, "Oi! Quanto custa? Já tenho uma agência, mas não estou muito satisfeita com os resultados.", 3)
    l["responded_via"] = "whatsapp"

    # 4. Reunião marcada para daqui a 2 dias
    lid, l = add(4, "Pet Shop Demonstração (demo)", "Pet Demo", "Pet shop", 2, 3, "meeting_scheduled",
                 ata("Rogério", "dono", "Três unidades, anúncios com a mesma arte há meses.",
                     "Sem segmentação por unidade.", "Call de 30 minutos para diagnóstico."))
    reply(lid, l, "Pode ser sim. Quinta à tarde consigo conversar.", 5)
    start = (now + timedelta(days=2)).replace(hour=17, minute=0, second=0, microsecond=0)
    l["meeting"] = {
        "scheduled_at": iso(start), "end_time": iso(start + timedelta(minutes=30)), "duration_minutes": 30,
        "calendar_event_id": None, "calendar_html_link": None, "google_meet_url": None,
        "status": "scheduled", "created_at": iso(now - timedelta(days=1)), "confirmation_sent_at": None,
        "notes": "Reunião de demonstração (dado fictício).",
    }
    l["outcome"] = "reuniao_agendada"
    l["outcome_set_at"] = iso(now - timedelta(days=1))

    # 5. Sem interesse agora (frio)
    lid, l = add(5, "Restaurante Modelo (demo)", "Restaurante Modelo", "Restaurante", 3, 4, "cold")
    reply(lid, l, "Obrigado pelo contato, mas agora não é prioridade pra gente.", 20)

    # 6. Pediu para parar: opt-out
    lid, l = add(6, "Loja Exemplo de Calçados (demo)", "Loja Exemplo", "Loja de calçados", 2, 5, "cold")
    reply(lid, l, "Pare de me mandar mensagem, por favor.", 2)
    l["opt_out"] = True
    l["annotations"] = [{"at": l["responded_at"], "text": "Lead pediu pra parar de receber mensagem: marcado como opt-out, nunca será reabordado."}]

    # 7. Virou cliente
    lid, l = add(7, "Academia Demonstração (demo)", "Academia Demo", "Academia", 2, 14, "responded",
                 ata("Paulo", "sócio", "Muitos seguidores, anúncios sem gestão aparente.",
                     "Sem remarketing.", "Proposta de gestão de tráfego mensal."))
    reply(lid, l, "Vamos conversar. Me liga amanhã de manhã?", 4)
    start = now - timedelta(days=10)
    l["meeting"] = {
        "scheduled_at": iso(start), "end_time": iso(start + timedelta(minutes=30)), "duration_minutes": 30,
        "calendar_event_id": None, "calendar_html_link": None, "google_meet_url": None,
        "status": "completed", "created_at": iso(now - timedelta(days=13)), "confirmation_sent_at": None,
        "notes": "Reunião de demonstração (dado fictício).",
    }
    l["outcome"] = "cliente_convertido"
    l["outcome_set_at"] = iso(now - timedelta(days=9))

    # 8. Esgotou os 6 toques sem resposta
    add(8, "Oficina Modelo (demo)", "Oficina Modelo", "Oficina mecânica", 6, 6, "exhausted")

    # 9. Primeiro toque ontem, sem resposta, ainda na cadência
    add(9, "Salão Exemplo (demo)", "Salão Exemplo", "Salão de beleza", 1, 1, "active")

    # Lead de teste: o número de teste do operador, para mostrar o envio de verdade
    if test_phone:
        copy = COPY_TOQUE_1.format(nome="Lead de Teste")
        leads[TEST_LEAD_ID] = {
            "demo": True, "name": "Lead de Teste (você)", "marca": "Lead de Teste", "phone": test_phone,
            "category": "Teste de envio", "first_contact_date": None, "current_touch": 0,
            "next_touch_due_at": None, "responded": False, "responded_at": None, "status": "active", "history": [],
        }
        queue.append({
            "demo": True, "lead_id": TEST_LEAD_ID, "name": "Lead de Teste (você)", "marca": "Lead de Teste",
            "phone": test_phone, "category": "Teste de envio", "copy": copy,
            "crm_notes": ata("Você", "operador", "Número de teste da demonstração.",
                             "Nenhum: é só para ver a mensagem chegar.", "Responda no celular e puxe a conversa no CRM."),
        })

    return {"leads": leads, "responses": responses, "log": log, "queue": queue}


# ── Arquivos ────────────────────────────────────────────────────────────────

def read_json(path, fallback):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except FileNotFoundError:
        return fallback


def write_json(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def drop_or_write(path, data):
    """Grava `data`; se ficou vazio, apaga o arquivo (todo leitor trata arquivo ausente)."""
    path = Path(path)
    if data:
        write_json(path, data)
    elif path.exists():
        path.unlink()


def is_demo_id(lead_id):
    return str(lead_id).startswith(DEMO_PREFIX)


def real_leads(master):
    return [k for k, v in master.items() if not is_demo_id(k) and not (isinstance(v, dict) and v.get("demo"))]


def queue_files(pipeline):
    return sorted(Path(pipeline).glob("queue-*.json"))


def clean(pipeline):
    """Remove só o que o seed criou. Devolve um resumo."""
    pipeline = Path(pipeline)
    summary = {"leads": 0, "responses": 0, "log": 0, "queue": 0}

    master_file = pipeline / "leads-master.json"
    master = read_json(master_file, {})
    kept = {k: v for k, v in master.items() if not (is_demo_id(k) or (isinstance(v, dict) and v.get("demo")))}
    summary["leads"] = len(master) - len(kept)
    drop_or_write(master_file, kept)

    for name, key in (("responses.json", "responses"), ("log-disparos.json", "log")):
        f = pipeline / name
        if not f.exists():
            continue
        data = read_json(f, [])
        kept_list = [e for e in data if not is_demo_id(e.get("lead_id", ""))]
        summary[key] = len(data) - len(kept_list)
        drop_or_write(f, kept_list)

    for f in queue_files(pipeline):
        data = read_json(f, [])
        kept_list = [e for e in data if not is_demo_id(e.get("lead_id", "")) and not e.get("demo")]
        summary["queue"] += len(data) - len(kept_list)
        if kept_list:
            write_json(f, kept_list)
        else:
            f.unlink()
    return summary


def apply(pipeline, demo, today):
    pipeline = Path(pipeline)
    master_file = pipeline / "leads-master.json"
    master = read_json(master_file, {})
    master.update(demo["leads"])
    write_json(master_file, master)

    for name, key in (("responses.json", "responses"), ("log-disparos.json", "log")):
        f = pipeline / name
        existing = [e for e in read_json(f, []) if not is_demo_id(e.get("lead_id", ""))]
        write_json(f, existing + demo[key])

    if demo["queue"]:
        qf = pipeline / f"queue-{today}.json"
        existing = [e for e in read_json(qf, []) if not is_demo_id(e.get("lead_id", ""))]
        write_json(qf, existing + demo["queue"])


def main(argv=None):
    ap = argparse.ArgumentParser(description="Cria ou remove os dados fictícios de demonstração.")
    ap.add_argument("--telefone-teste", help="seu número de teste, com +, ex.: +5527999990000 (vira o Lead de Teste e entra na fila de hoje)")
    ap.add_argument("--limpar", action="store_true", help="remove tudo que o seed criou (ids demo-*)")
    ap.add_argument("--forcar", action="store_true", help="roda mesmo com leads reais no pipeline (não recomendado)")
    args = ap.parse_args(argv)

    if args.limpar:
        s = clean(PIPELINE_DIR)
        print(f"✓ Dados de demonstração removidos: {s['leads']} leads, {s['responses']} respostas, "
              f"{s['log']} envios do log, {s['queue']} itens de fila.")
        return 0

    master = read_json(PIPELINE_DIR / "leads-master.json", {})
    reais = real_leads(master)
    if reais and not args.forcar:
        print(f"✗ Já existem {len(reais)} lead(s) reais em pipeline/leads-master.json.", file=sys.stderr)
        print("  Os dados de demonstração são para uma instalação de demonstração, separada da de verdade.", file=sys.stderr)
        print("  Se quer mesmo misturar, rode de novo com --forcar (e depois --limpar remove só os demo-*).", file=sys.stderr)
        return 1

    test_phone = None
    if args.telefone_teste:
        if not args.telefone_teste.strip().startswith("+"):
            print("✗ --telefone-teste precisa estar no formato internacional, com +, ex.: +5527999990000", file=sys.stderr)
            return 1
        try:
            sys.path.insert(0, str(Path(__file__).resolve().parent))
            import phone_utils
        except ImportError:
            print("✗ Falta a biblioteca de telefone. Rode: python -m pip install -r scripts/requirements.txt", file=sys.stderr)
            return 1
        e164, kind, _ = phone_utils.parse_phone(args.telefone_teste)
        if not e164 or kind != phone_utils.CELULAR:
            print("✗ O número de teste não é um celular válido. Confira o número e o código do país.", file=sys.stderr)
            return 1
        test_phone = e164

    now = datetime.now(timezone.utc)
    demo = build_demo(now, test_phone)
    apply(PIPELINE_DIR, demo, queue_date(now))

    n = sum(1 for k in demo["leads"] if k != TEST_LEAD_ID)
    print(f"✓ {n} leads fictícios criados em {PIPELINE_DIR / 'leads-master.json'}")
    if test_phone:
        print(f"✓ Lead de Teste criado com {test_phone} e 1 item na fila de hoje (é o único que o dispatcher vai enviar).")
    else:
        print("  Sem --telefone-teste: nada foi colocado na fila de envio.")
    print("  Abra o CRM: cd crm && npm start, depois http://localhost:3001")
    print("  Para remover: python scripts/seed-demo.py --limpar")
    return 0


if __name__ == "__main__":
    sys.exit(main())
