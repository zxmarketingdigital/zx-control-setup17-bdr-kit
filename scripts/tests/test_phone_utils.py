"""Testes de scripts/phone_utils.py. Rode da raiz do projeto:

    python -m unittest discover -s scripts/tests
"""
import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
import phone_utils as pu  # noqa: E402


class PhoneUtilsTest(unittest.TestCase):
    def setUp(self):
        self._old = os.environ.get("DEFAULT_COUNTRY")

    def tearDown(self):
        if self._old is None:
            os.environ.pop("DEFAULT_COUNTRY", None)
        else:
            os.environ["DEFAULT_COUNTRY"] = self._old

    def test_brasil_formatos_que_ja_eram_aceitos(self):
        for raw in ["+5511999990000", "55 11 99999-0000", "(11) 99999-0000", "11999990000"]:
            self.assertEqual(pu.parse_phone(raw, "BR"), ("+5511999990000", pu.CELULAR, None), raw)

    def test_brasil_fixo_e_invalido(self):
        self.assertEqual(pu.parse_phone("+551133334444", "BR")[:2], ("+551133334444", pu.FIXO))
        self.assertEqual(pu.parse_phone("+55 11 1234", "BR")[2], "invalido")
        self.assertEqual(pu.parse_phone("", "BR")[2], "vazio")
        self.assertEqual(pu.parse_phone(None, "BR")[2], "vazio")

    def test_portugal_com_mais_vale_em_qualquer_pais_padrao(self):
        for country in ("BR", "PT"):
            self.assertEqual(pu.parse_phone("+351 912 345 678", country), ("+351912345678", pu.CELULAR, None))

    def test_portugal_como_pais_padrao(self):
        self.assertEqual(pu.parse_phone("912345678", "PT"), ("+351912345678", pu.CELULAR, None))
        self.assertEqual(pu.parse_phone("351912345678", "PT"), ("+351912345678", pu.CELULAR, None))
        self.assertEqual(pu.parse_phone("+351211234567", "PT")[:2], ("+351211234567", pu.FIXO))

    def test_celular_e_fixo_sao_por_pais(self):
        # 9 dígitos começando com 9 é celular no Brasil e em Portugal, mas 2xx é fixo em PT
        self.assertEqual(pu.parse_phone("+351 21 123 4567")[1], pu.FIXO)
        self.assertEqual(pu.parse_phone("+351 91 234 5678")[1], pu.CELULAR)

    def test_default_country_por_variavel_de_ambiente(self):
        os.environ["DEFAULT_COUNTRY"] = "pt"
        self.assertEqual(pu.default_country(), "PT")
        os.environ["DEFAULT_COUNTRY"] = "XX"
        self.assertEqual(pu.default_country(), "BR")
        os.environ.pop("DEFAULT_COUNTRY")

    def test_blocklist_acha_numeros_de_varios_paises(self):
        texto = '{"phone": "+5511999990000"}, {"phone": "+351912345678"}, {"x": "+99"}, {"y": "+551133334444"}'
        self.assertEqual(pu.find_known_phones(texto), {"+5511999990000", "+351912345678", "+551133334444"})
        self.assertEqual(pu.find_known_phones(texto, accept_landline=False), {"+5511999990000", "+351912345678"})


if __name__ == "__main__":
    unittest.main()
