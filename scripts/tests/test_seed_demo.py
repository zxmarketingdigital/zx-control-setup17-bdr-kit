"""Testes do seed de demonstração (python -m unittest discover -s scripts/tests)."""
import importlib.util
import json
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SCRIPTS))
import phone_utils  # noqa: E402

spec = importlib.util.spec_from_file_location("seed_demo", SCRIPTS / "seed-demo.py")
seed = importlib.util.module_from_spec(spec)
spec.loader.exec_module(seed)

NOW = datetime(2026, 10, 19, 15, 0, tzinfo=timezone.utc)
TEST_PHONE = "+5527999990000"


def write(path, data):
    Path(path).write_text(json.dumps(data), encoding="utf-8")


class SeedDemoTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self._tmp.name)
        self._old = seed.PIPELINE_DIR
        seed.PIPELINE_DIR = self.dir

    def tearDown(self):
        seed.PIPELINE_DIR = self._old
        self._tmp.cleanup()

    def load(self, name, fallback):
        return seed.read_json(self.dir / name, fallback)

    def test_estagios_e_marca_demo(self):
        d = seed.build_demo(NOW)
        self.assertEqual(len(d["leads"]), 9)
        for lead_id, lead in d["leads"].items():
            self.assertTrue(lead_id.startswith("demo-"))
            self.assertTrue(lead["demo"])
        status = {l["status"] for l in d["leads"].values()}
        self.assertTrue({"active", "responded", "cold", "exhausted", "meeting_scheduled"} <= status)
        self.assertTrue(any(l.get("opt_out") for l in d["leads"].values()))
        self.assertTrue(any(l.get("meeting") for l in d["leads"].values()))
        for e in d["responses"] + d["log"]:
            self.assertTrue(e["lead_id"].startswith("demo-"))

    def test_leads_ficticios_tem_envio_bloqueado_e_o_de_teste_nao(self):
        d = seed.build_demo(NOW, TEST_PHONE)
        for lead_id, lead in d["leads"].items():
            if lead_id == "demo-teste":
                self.assertNotIn("no_send", lead)
            else:
                self.assertTrue(lead["no_send"], lead_id)

    def test_telefones_ficticios_nunca_sao_celular_e_nada_vai_para_a_fila(self):
        d = seed.build_demo(NOW)
        self.assertEqual(d["queue"], [])
        for lead in d["leads"].values():
            e164, kind, _ = phone_utils.parse_phone(lead["phone"], "BR")
            self.assertNotEqual(kind, phone_utils.CELULAR, lead["phone"])

    def test_lead_de_teste_e_o_unico_na_fila(self):
        d = seed.build_demo(NOW, TEST_PHONE)
        self.assertEqual([e["phone"] for e in d["queue"]], [TEST_PHONE])
        self.assertEqual(d["queue"][0]["lead_id"], "demo-teste")
        self.assertIn("demo-teste", d["leads"])

    def test_aplicar_e_limpar_preserva_o_que_nao_e_demo(self):
        write(self.dir / "leads-master.json", {})
        write(self.dir / "responses.json", [{"lead_id": "real-1", "phone": "+351912345678", "message": "oi"}])
        write(self.dir / "log-disparos.json", [{"lead_id": "real-1", "touch": 1, "status": "sent"}])
        write(self.dir / "queue-2026-10-19.json", [{"lead_id": "real-1", "phone": "+351912345678", "copy": "oi"}])

        d = seed.build_demo(NOW, TEST_PHONE)
        seed.apply(self.dir, d, "2026-10-19")
        self.assertEqual(len(self.load("leads-master.json", {})), 10)
        self.assertEqual(len(self.load("queue-2026-10-19.json", [])), 2)

        # aplicar duas vezes não duplica
        seed.apply(self.dir, seed.build_demo(NOW, TEST_PHONE), "2026-10-19")
        self.assertEqual(len(self.load("leads-master.json", {})), 10)
        self.assertEqual(len(self.load("responses.json", [])), len(d["responses"]) + 1)

        seed.clean(self.dir)
        self.assertEqual(self.load("leads-master.json", {}), {})
        self.assertEqual([e["lead_id"] for e in self.load("responses.json", [])], ["real-1"])
        self.assertEqual([e["lead_id"] for e in self.load("log-disparos.json", [])], ["real-1"])
        self.assertEqual([e["lead_id"] for e in self.load("queue-2026-10-19.json", [])], ["real-1"])

    def test_limpar_remove_fila_que_ficou_so_com_demo(self):
        seed.apply(self.dir, seed.build_demo(NOW, TEST_PHONE), "2026-10-19")
        self.assertTrue((self.dir / "queue-2026-10-19.json").exists())
        seed.clean(self.dir)
        self.assertFalse((self.dir / "queue-2026-10-19.json").exists())

    def test_recusa_rodar_com_lead_real(self):
        write(self.dir / "leads-master.json", {"lead-real": {"name": "Cliente real", "phone": "+5511999990001", "history": []}})
        self.assertEqual(seed.main([]), 1)
        self.assertEqual(list(self.load("leads-master.json", {})), ["lead-real"])
        self.assertEqual(seed.main(["--forcar"]), 0)
        self.assertEqual(len(self.load("leads-master.json", {})), 10)  # 9 demo + 1 real
        seed.main(["--limpar"])
        self.assertEqual(list(self.load("leads-master.json", {})), ["lead-real"])

    def test_telefone_de_teste_invalido_e_recusado(self):
        self.assertEqual(seed.main(["--telefone-teste", "27999990000"]), 1)        # sem +
        self.assertEqual(seed.main(["--telefone-teste", "+551155500001"]), 1)      # fixo
        self.assertEqual(seed.main(["--telefone-teste", "+55abc"]), 1)             # lixo
        self.assertFalse((self.dir / "leads-master.json").exists())

    def test_telefone_de_teste_valido_entra_na_fila(self):
        self.assertEqual(seed.main(["--telefone-teste", TEST_PHONE]), 0)
        queues = list(self.dir.glob("queue-*.json"))
        self.assertEqual(len(queues), 1)
        self.assertEqual([e["phone"] for e in seed.read_json(queues[0], [])], [TEST_PHONE])


if __name__ == "__main__":
    unittest.main()
