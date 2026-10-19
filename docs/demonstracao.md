# Demonstração ao vivo: roteiro de 20 minutos

Roteiro para apresentar o ZX Control 7 · Setup 17 funcionando, com leads fictícios e um
WhatsApp de teste, sem lead real e sem risco para nenhum número de verdade.

> **O que a demonstração precisa de internet.** O envio ao vivo (WhatsApp), a sugestão de
> resposta do Claude e a agenda do Google precisam de conexão. O CRM em si **não**: o estilo
> e as fontes são arquivos locais, então o dashboard, os leads, a ata, a agenda de exemplo e
> as simulações abrem mesmo sem rede. Leve a internet do celular como reserva para o envio ao
> vivo e a sugestão.

**Windows:** troque `python3` por `python`. No Mac e no Linux, `python3`.

## 1. Preparação (30 a 40 minutos, no dia anterior)

Use uma **instalação de demonstração**, separada da instalação de um cliente. O seed se recusa
a rodar se já houver lead real.

- [ ] Instalação concluída e `node setup/smoke.mjs` **sem `✗`**. A versão aparece na primeira
      linha do teste e no rodapé do CRM (`v1.0.0`).
- [ ] **Número de envio:** um chip dedicado de teste conectado na Evolution
      (`cd dispatcher && docker compose up -d`, depois `http://localhost:8080/manager`, Connect
      e QR). Confirme com `npm run setup`.
- [ ] **Número que faz o papel de lead:** um segundo celular, com WhatsApp, **diferente** do
      número de envio. Anote o número com `+` e código do país.
- [ ] Dados de exemplo:
      ```bash
      python3 scripts/seed-demo.py --telefone-teste +5527999990000
      ```
      (troque pelo número do segundo celular). Cria 9 leads fictícios em vários estágios e o
      "Lead de Teste", que é o seu número e o **único** na fila de hoje.
- [ ] CRM no ar: `cd crm && npm start`. Abra `http://localhost:3001` no navegador que vai
      usar na apresentação e confira que os leads aparecem.
- [ ] Claude Code CLI instalado e logado (precisa para o botão "Gerar sugestão").
- [ ] Janela de envio: o dispatcher só envia **segunda a sexta, das 10h às 18h** (no fuso
      configurado). Uma call às 17h tem **uma hora** de janela: faça o envio ao vivo logo no
      começo. Fora da janela, use o plano B da seção 3.
- [ ] Terminal pronto, **fechado**, na pasta `dispatcher` (você inicia o envio ao vivo na hora).

Os leads fictícios têm o envio **bloqueado**: nem o dispatcher nem o botão "Enviar agora" mandam
mensagem para eles. Só o Lead de Teste recebe.

## 2. Roteiro minuto a minuto

| Min | O que mostrar | Onde clicar | O que dizer |
|---|---|---|---|
| 0 a 2 | O quadro geral | **Dashboard** | "Tudo local, no seu computador. Aqui estão os leads ativos, quem respondeu e as reuniões." |
| 2 a 5 | O lead e a ata | **Leads**, linha **Studio Exemplo** | "Antes de ligar, o setup já deixa uma ata: sinais observados, pontos de melhoria e direção. Ela nunca vai para o lead." |
| 5 a 8 | Os freios de segurança | **Leads**, **Loja Exemplo de Calçados**, depois o botão **Não contatar mais** | "Quem pede para parar não recebe mais nada, nem por dataset novo. É por regra, antes de qualquer IA. Há também limite diário, janela de horário e número validado antes do envio." |
| 8 a 12 | Envio ao vivo | Terminal: `npm start` na pasta `dispatcher` | "Aprovei uma copy; o dispatcher respeita a janela e o intervalo." Em até 1 minuto a mensagem chega no segundo celular. Mostre o celular. |
| 12 a 17 | Atender a resposta | Responda no segundo celular ("quanto custa?"). No CRM: **Prospecção Fria**, **💬 Abordar** no Lead de Teste, **📥 Puxar conversa do WhatsApp**, **✨ Gerar sugestão**, revise, **Enviar agora →** | "O Claude propõe a resposta, mas quem envia é você." A primeira sugestão do dia pode levar mais de 1 minuto; se demorar, comente o que ele está considerando (ata, conversa, regras da skill). |
| 17 a 19 | A reunião | **Agenda**, reunião do **Pet Shop Demonstração** | "A reunião aparece na agenda. Conectar o Google Calendar leva uns 10 minutos (`docs/crm-calendar-setup.md`)." O aviso "Não conectado" é esperado na demonstração. |
| 19 a 20 | Fechamento | **Simulações** | "Aqui o aluno calibra o tom antes de ligar o modo automático. O suporte oficial está em suporte.zxlab.com.br/hub." |

Fale do **primeiro uso** (`docs/primeiro-uso.md`) e do **FAQ** (`docs/faq.md`) como o caminho do
aluno depois da call.

## 3. Se algo travar

| O que acontece | Causa provável | O que fazer na hora |
|---|---|---|
| O CRM abre sem layout, só texto | Arquivos de `crm/public/assets` ausentes (atualização incompleta) | Na pasta do setup: `git checkout -- crm/public`, depois recarregue com `Ctrl+F5`. |
| "WhatsApp desconectado" na Prospecção Fria | Docker parado ou sessão caída | `cd dispatcher && docker compose up -d`, espere 15 s, **↻ Atualizar**. Se pedir QR, reconecte em `http://localhost:8080/manager`. Se não resolver em 2 minutos, siga só pelo CRM e conte o passo do WhatsApp. |
| A mensagem não chega no segundo celular | Fora da janela (seg a sex, 10h às 18h), dispatcher fechado ou fila vazia | **Plano B:** no CRM, **Prospecção Fria**, **Abordar** no Lead de Teste, digite a mensagem e **Enviar agora →** (envio direto, sem fila nem janela). Se a fila sumiu, rode o seed de novo (veja abaixo). |
| **Gerar sugestão** demora muito ou dá erro | Claude CLI não instalado ou deslogado, ou internet lenta | Use **📋 Copiar prompt** ou escreva a resposta à mão e envie. |
| "Lead de demonstração: o envio está bloqueado" | Normal: leads fictícios não enviam | Use o **Lead de Teste**. |
| A lista de leads está estranha ou vazia | Dados alterados durante o ensaio | `python3 scripts/seed-demo.py --limpar` e rode o seed de novo. |
| O Docker não sobe | WSL ou memória do Windows | Veja `docs/faq.md`, pergunta 5. Reserve 10 minutos extras para isso na preparação. |

Para refazer toda a demonstração do zero:

```bash
python3 scripts/seed-demo.py --limpar
python3 scripts/seed-demo.py --telefone-teste +5527999990000
```

## 4. Ensaio de 20 minutos (rode sozinho do início ao fim)

Faça uma vez antes da apresentação, cronometrando. Está pronto quando **tudo** abaixo foi
feito sem pedir ajuda:

- [ ] Preparação (seção 1) concluída, com o smoke sem `✗`.
- [ ] Dashboard e lista de leads conferidos.
- [ ] Ata do Studio Exemplo aberta, botão "Não contatar mais" mostrado.
- [ ] Envio ao vivo: a mensagem chegou no segundo celular.
- [ ] Resposta puxada, sugestão gerada (ou plano B) e enviada.
- [ ] Agenda e Simulações mostradas.
- [ ] Você sabe a ação de cada linha da tabela "Se algo travar".
- [ ] Tempo total até 20 minutos.

## 5. Depois da demonstração

```bash
python3 scripts/seed-demo.py --limpar
```

Isso remove só o que o seed criou (tudo com id `demo-`). Se o chip de teste ficou conectado
numa instalação que vai para outro uso, desconecte (`cd dispatcher && npm run logout`).
