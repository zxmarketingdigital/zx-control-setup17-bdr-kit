# Primeiro uso: da instalação até a primeira leva disparada

Este guia começa quando o setup terminou (o `node setup/smoke.mjs` está sem `✗`) e vai até
a sua **primeira leva aprovada e enviada**. Faça uma vez, na ordem.

> **Windows:** troque `python3` por `python` em todos os comandos. No Mac e no Linux, `python3`.

**Quanto tempo leva (estimativa, primeira vez):** de 40 a 70 minutos, contando a espera do
Actor da Apify. Nos próximos dias o mesmo ciclo leva uns 20 minutos de atenção ativa.

| # | Passo | Tempo |
|---|---|---|
| 1 | Conferir que está tudo de pé | 2 min |
| 2 | Conectar o WhatsApp | 5 a 10 min |
| 3 | Trazer o primeiro lote de leads | 10 a 20 min |
| 4 | Enriquecer os primeiros leads | 5 a 10 min |
| 5 | Gerar e aprovar as primeiras copies | 10 a 20 min |
| 6 | Iniciar o envio | 2 min |
| 7 | Acompanhar no CRM e atender as respostas | ao longo do dia |

---

## 1. Conferir que está tudo de pé

Na pasta do setup:

```bash
node setup/smoke.mjs
```

Pode ter avisos (`!`) de coisas que você ainda não fez, como conectar o WhatsApp. **Não pode
ter `✗`.** Se tiver, o teste diz o que fazer. Se o Docker não estiver rodando, abra o Docker
Desktop (ou, no Linux, `sudo systemctl start docker`) e espere ele ficar pronto.

## 2. Conectar o WhatsApp

Use um **número dedicado à prospecção**, não o seu pessoal.

1. Suba a Evolution API (a ponte com o WhatsApp):
   ```bash
   cd dispatcher
   docker compose up -d
   ```
   Espere uns 10 a 15 segundos.
2. Abra `http://localhost:8080/manager` no navegador e entre com a chave que está em
   `dispatcher/.env` (linha `EVOLUTION_API_KEY`).
3. Clique em **New Instance** e use **exatamente** o nome de `EVOLUTION_INSTANCE` do mesmo
   arquivo (o padrão é `bdr-instance`). Clique em **Connect**: aparece o QR code.
4. No celular: WhatsApp, Dispositivos vinculados, Vincular dispositivo, e aponte para o QR.
   Se ele expirar, clique em Connect de novo.
5. Confirme (ainda na pasta `dispatcher`):
   ```bash
   npm run setup
   ```
   Deve dizer que a instância está conectada.

## 3. Trazer o primeiro lote de leads

1. No console da Apify (`console.apify.com`), abra o Actor que você escolheu na instalação,
   rode com a sua busca (por exemplo, o tipo de negócio e a cidade) e espere terminar.
2. No resultado (aba **Storage**, dataset), exporte como **JSON** e salve na pasta
   `pipeline/` do setup, por exemplo `pipeline/dataset-2026-10-20.json`.
3. Monte o pool de leads:
   ```bash
   python3 scripts/build-pool.py pipeline/dataset-2026-10-20.json
   ```
   No fim ele mostra quantos leads foram adicionados e quantos foram descartados (sem
   telefone, telefone inválido, não é celular, já abordado, sem presença digital).

**Quantos leads pedir ao Actor?** Conte com o dobro ou o triplo do que você quer usar: uma
parte é descartada. Para os primeiros dias, 100 leads aproveitáveis já bastam. Quanto isso
custa na Apify está no README, em "Quanto custa a Apify".

## 4. Enriquecer os primeiros leads

Enriquecer é levantar, de cada lead, site, pixel, Instagram e anúncios, para a copy ser
específica. **Comece com 5 leads** (não 10) para ver o fluxo funcionando.

```bash
python3 scripts/enrich-sites.py --n 5
```

Para o Instagram, escolha uma forma (detalhes em `docs/operacao-diaria.md`):

- **Pelo script:** `python3 scripts/enrich-instagram.py` (na primeira vez, rode antes com
  `--login` e entre na sua conta no navegador que abrir).
- **Pelo Claude Code, sem instalar nada:** na pasta do setup, abra o Claude Code e escreva:
  `enriquece o site-enrichment de hoje: pra cada lead, abre o Instagram e a Biblioteca de Anúncios da Meta pelo teu navegador e escreve o enriched-leads de hoje no formato de sempre`.

## 5. Gerar e aprovar as primeiras copies

No Claude Code, aberto na pasta do setup, escreva:

```
roda o pipeline
```

Ele aplica a skill do seu negócio e mostra os leads **um por um**, com a copy do toque 1 e a
ata pré-ligação (a ata nunca vai para o lead). Para cada um você responde:

| Você escreve | O que acontece |
|---|---|
| `ok` | a copy entra na fila |
| o texto corrigido | a sua versão entra na fila |
| `skip` | o lead não entra hoje |

No fim ele grava `pipeline/queue-AAAA-MM-DD.json` e diz quantas copies foram aprovadas.
**Nada é enviado sem a sua aprovação.** Se você editar muito, ajuste a skill
(`docs/personalizando-skill.md`).

## 6. Iniciar o envio

```bash
cd dispatcher
npm start
```

Deixe esse terminal aberto. O envio só acontece **de segunda a sexta, entre 10h e 18h** (no
fuso que você escolheu na instalação), com 2 a 3 minutos entre mensagens. Se você iniciar
fora da janela, ele espera abrir. Nas **duas primeiras semanas, fique em até 15 leads por dia**
(o setup limita em 20): número novo mandando muito é o que mais leva à restrição.

Para ver o que já saiu, em outro terminal (pasta `dispatcher`): `npm run status`.

## 7. Acompanhar no CRM e atender as respostas

Em outro terminal:

```bash
cd crm
npm start
```

Abra `http://localhost:3001` e entre com a senha do CRM (para ver: `cd crm && npm run senha`; ela também está no `crm/.env`, linha `CRM_PASSWORD`). Depois vá na aba **Prospecção Fria**.

**Atenção:** no modo manual (o padrão), o setup **não percebe sozinho** que o lead respondeu.
Quem respondeu e não foi marcado continua recebendo os próximos toques. Quando alguém
responder:

1. Abra o lead e clique em **📥 Puxar conversa do WhatsApp**: isso registra a resposta e
   cancela o próximo toque.
2. Clique em **✨ Gerar sugestão** (ou **📋 Copiar prompt**), revise a resposta e clique em
   **Enviar agora**.
3. Quando a call for marcada, use **📅 Agendar** no lead.

Se o lead pedir para parar, o setup detecta e marca opt-out sozinho; se o pedido vier por
outro canal, use **🚫 Não contatar mais** no lead.

## Terminou o dia

No terminal do dispatcher, `Ctrl+C`. Confira o resumo com `npm run status`. Amanhã é só
repetir os passos 4 a 7 (o 3 só quando o pool de leads baixar de 30 pendentes).

---

**Travou?** Veja o [FAQ](faq.md) e o [troubleshooting](troubleshooting.md). Para o dia a dia
completo: `docs/manual-uso-setup17.pdf`.
