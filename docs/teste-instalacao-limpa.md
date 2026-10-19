# Teste de instalação em máquina limpa

Roteiro para quem testa o setup antes de uma versão sair: uma pessoa, um computador **sem nada
do setup** (Windows ou Mac), seguindo só o README. O objetivo é descobrir onde um aluno trava e
quanto tempo leva de verdade.

Faça uma rodada por sistema. Uma máquina virtual nova ou um usuário novo do computador servem.

## Antes de começar

Anote:

- Sistema e versão (Windows 11 24H2, macOS 15...), chip (Intel ou Apple Silicon), RAM.
- O que **já estava** instalado: `node -v`, `python --version` (`python3 --version` no Mac),
  `git --version`, `docker --version`, `claude --version`.
- Se o Docker Desktop estava aberto e rodando.

Tenha à mão: conta Apify com token, um celular com WhatsApp para o QR, e (para o modo
automático) o Claude Code CLI instalado.

## Rodada 1: instalação do zero

Siga o README, do passo 1 em diante, **sem pedir ajuda a ninguém**. Use um cronômetro e anote
o tempo de cada etapa e **qualquer coisa que travou**: a mensagem exata de erro, o que você
fez para sair, ou "não consegui".

| Etapa | Tempo | Travou? (mensagem e o que fez) |
|---|---|---|
| Instalar o que faltava (Node, Python, Git, Docker) | | |
| Baixar o setup (`gh repo clone` ou link no app) | | |
| Conversa de instalação (etapas 1 a 6) | | |
| Subir a Evolution e conectar o WhatsApp (etapa 7) | | |
| `node setup/smoke.mjs` | | |
| **Total** | | |

O resultado esperado do smoke é **nenhum `✗`**. Avisos `!` são aceitáveis se forem pendências
suas (por exemplo, WhatsApp ainda sem QR). Guarde **um print do smoke inteiro**.

## Rodada 2: reinstalar por cima

Na mesma máquina, com o WhatsApp conectado, peça "reinstale esse setup por cima" no Claude Code
e responda igual. Confira:

- [ ] Sobraram arquivos `*.bak-AAAAMMDD-HHMMSS` dos arquivos que mudaram (skill, `.env`...).
- [ ] A skill que você tinha editado não se perdeu (o backup tem a sua versão).
- [ ] O WhatsApp **continuou conectado** (`cd dispatcher && npm run setup` diz que sim, sem
      pedir QR de novo).
- [ ] `node setup/smoke.mjs` continua sem `✗`.

## Rodada 3: atualizar

Com o repositório clonado, `git pull` e `node setup/smoke.mjs`. Confira que `pipeline/`, os
`.env` e a skill não foram tocados, e que a versão na primeira linha do smoke é a esperada.

## Rodada 4: desinstalar

Siga `docs/desinstalar.md` até o passo 6. Confira:

- [ ] `docker ps -a --filter name=zxc7` e `docker volume ls --filter name=zx-control-7-evolution`
      voltam vazios.
- [ ] O aparelho sumiu de Dispositivos vinculados no WhatsApp.
- [ ] Nenhum arquivo do setup ficou fora da pasta apagada.

## O que entregar

1. A tabela de tempos preenchida, por sistema.
2. O print do smoke (rodada 1).
3. A lista de travas, cada uma com mensagem de erro, etapa e a sugestão de correção. Cada
   trava vira uma correção no repositório ou uma entrada no `docs/faq.md`.

Quem testa não deve mexer em arquivos do setup para "ajudar" a instalação: se precisou, isso
é uma trava e entra na lista.
