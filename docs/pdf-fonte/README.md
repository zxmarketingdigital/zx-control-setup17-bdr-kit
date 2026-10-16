# Fonte dos PDFs

Os PDFs de `docs/` (manual de instalação, manual de uso e guia de contingência do
WhatsApp) são gerados a partir dos HTMLs desta pasta. Para atualizar um PDF, edite o
HTML e rode:

```bash
node docs/pdf-fonte/gerar-pdfs.mjs
```

Precisa de Chrome, Chromium ou Edge e de internet (fontes do Google Fonts).

| HTML | PDF gerado |
|---|---|
| `manual-instalacao.html` | `docs/manual-instalacao-setup17.pdf` |
| `manual-uso.html` | `docs/manual-uso-setup17.pdf` |
| `contingencia.html` | `docs/Contingencia-WhatsApp-Setup17.pdf` |
| `contingencia-mobile.html` | `docs/Contingencia-WhatsApp-Setup17-Mobile.pdf` |

Regras do material (ZX LAB): só a marca e o contato oficial da ZX LAB
(https://suporte.zxlab.com.br/hub · contato@zxlab.com.br), o nome **ZX Control 7 ·
Setup 17**, e a demo oficial em https://zxcontrol7-demo.zxlab.com.br/. Nenhum nome,
e-mail, WhatsApp ou link pessoal.
