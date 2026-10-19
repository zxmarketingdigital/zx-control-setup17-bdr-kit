# Perguntas frequentes

As dúvidas mais prováveis, com a resposta curta. Para problemas passo a passo, veja o
[troubleshooting](troubleshooting.md); para o primeiro dia, o [guia de primeiro uso](primeiro-uso.md).

> **Windows:** troque `python3` por `python` nos comandos.

## Apify

**1. Quanto custa a Apify?**
O plano gratuito inclui US$ 5 de uso por mês. O custo de cada lote depende do Actor: no Google
Maps Scraper oficial é a partir de US$ 1,50 por 1.000 lugares coletados, mais extras opcionais.
Para um lote de 100 leads aproveitáveis, a conta está no README, em "Quanto custa a Apify".
Confira sempre a aba de preços do Actor antes de rodar.

**2. Onde acho o ID do Actor e o token?**
O ID está na URL da página do Actor (`console.apify.com/actors/<id>`). O token fica em
Settings, API & Integrations (em algumas contas aparece só como Integrations) e começa com
`apify_api_`. O setup **não grava o token em arquivo**: se um comando precisar dele, use a
variável de ambiente `APIFY_TOKEN` (o `docs/comandos-diarios.md`, gerado na instalação, mostra como).

**3. O dataset que baixei não gerou leads. Por quê?**
Rode `python3 scripts/build-pool.py pipeline/<arquivo>.json` e olhe o relatório do fim: ele
mostra quantos foram descartados por telefone (sem telefone, inválido, não é celular), por já
terem sido abordados ou por não terem presença digital. Se vários caem em "Phone inválido",
confira o `DEFAULT_COUNTRY` (país dos telefones sem `+`) em `dispatcher/.env`.

## WhatsApp e Docker

**4. O QR do WhatsApp não aparece ou expirou.**
Abra `http://localhost:8080/manager`, entre com a `EVOLUTION_API_KEY` de `dispatcher/.env` e
clique em **Connect** na instância (o nome é o `EVOLUTION_INSTANCE`). O QR vale por pouco
tempo; clique em Connect de novo para gerar outro. No celular: Dispositivos vinculados,
Vincular dispositivo.

**5. O Docker não sobe.**
No Windows e no Mac, abra o **Docker Desktop** e espere ele ficar pronto; no Windows ele usa o
WSL2 (aceite a instalação e reinicie se pedir). No Linux, `sudo systemctl start docker`. Se der
erro de "arquivo de paginação" ou memória, aumente a memória virtual do Windows e reinicie.
Depois: `cd dispatcher && docker compose up -d`.

**6. O `npm run setup` diz que a instância não existe ou está desconectada.**
Crie a instância no painel (`http://localhost:8080/manager`) com o nome exato de
`EVOLUTION_INSTANCE` e escaneie o QR. Se já existia e caiu, clique em Connect de novo.

**7. Meu número foi restrito ou banido. E agora?**
Pare os envios e siga o guia `docs/Contingencia-WhatsApp-Setup17.pdf` (sessão, restrição,
banimento, número reserva). Para reduzir o risco: número dedicado, até 15 leads por dia nas
duas primeiras semanas e nada fora do horário comercial.

**8. Posso usar o meu WhatsApp pessoal?**
Não é recomendado. Use um número dedicado à prospecção: se ele for restringido, você não perde
o seu contato com clientes e família.

## Envio e cadência

**9. Liguei o dispatcher e nada sai. Por quê?**
As causas mais comuns: está fora de segunda a sexta, 10h às 18h (no seu fuso); você não
aprovou copies hoje (`roda o pipeline`); o WhatsApp está desconectado; ou há dois dispatchers
abertos. Rode `npm run status` e `npm run setup` na pasta `dispatcher`.

**10. O lead não aparece no CRM nem na fila.**
Ele só entra depois de passar por `build-pool.py` (pool), ser enriquecido e ter a copy
aprovada no `roda o pipeline`. Conferir: `pipeline/pool-prequalificados.json` (pool) e
`pipeline/queue-AAAA-MM-DD.json` (fila de hoje).

**11. O lead respondeu, mas continua recebendo toques.**
No modo manual o setup não percebe a resposta sozinho. Abra o lead no CRM e clique em
**📥 Puxar conversa do WhatsApp** (ou **Marcar respondido**). Isso cancela o próximo toque.

**12. Como faço para um lead nunca mais receber mensagem?**
Se ele pediu para parar na conversa do WhatsApp, o setup detecta ("pare", "sair", "não quero
mais receber"...) e marca opt-out sozinho. Se veio por outro canal, abra o lead e clique em
**🚫 Não contatar mais**. Lead em opt-out não volta para a fila, nem por dataset novo.

**13. Quantos leads por dia?**
Nas duas primeiras semanas, até 15. Depois pode subir aos poucos; o setup limita a 20
(`DAILY_NEW_CAP`). O intervalo entre mensagens é de 2 a 3 minutos.

**14. Como pauso tudo?**
No terminal do dispatcher, `Ctrl+C`: nada mais é enviado. Para pausar só um lead, mude o status
dele no CRM para qualquer valor diferente de "Ativo". Se o modo automático estiver ligado,
desligue na aba Prospecção Fria.

## Configuração e atualização

**15. Como atualizo o setup, mudo o fuso ou reinstalo sem perder o que personalizei?**
Para atualizar: `git pull` e `node setup/smoke.mjs` (leads, `.env` e skill ficam fora do git).
Para mudar o fuso (`TIMEZONE`), o país dos telefones (`DEFAULT_COUNTRY`) ou o modelo do Claude
(`CLAUDE_MODEL`), edite `dispatcher/.env` (o `TIMEZONE` também no `crm/.env`) e reinicie. Se
rodar o setup de novo, ele guarda uma cópia `.bak-AAAAMMDD-HHMMSS` de tudo que já existia e vai
mudar, inclusive a skill, e mantém a chave da Evolution e a senha do CRM.

## CRM

**16. Qual é a senha do CRM?**
Rode `cd crm && npm run senha`. Ela também está no `crm/.env`, linha `CRM_PASSWORD`. Para trocar, edite essa linha
(12+ caracteres) e reinicie o CRM. Mais em [troubleshooting](troubleshooting.md), item 11.
