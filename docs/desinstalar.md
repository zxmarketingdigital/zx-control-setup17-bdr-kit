# Desinstalar o ZX Control 7 · Setup 17

Escolha o que você quer. Os comandos de Docker valem igual no Windows (PowerShell), no Mac e no
Linux.

| Quero... | Vá para |
|---|---|
| Parar por uns dias, sem apagar nada | [1. Pausar](#1-pausar-sem-apagar-nada) |
| Trocar de número de WhatsApp | [2. Desconectar o WhatsApp](#2-desconectar-o-whatsapp) |
| Tirar tudo do computador | [3 a 6](#3-remover-a-evolution-api) |
| Instalar de novo | [7. Reinstalar](#7-reinstalar) |

## 1. Pausar sem apagar nada

1. No terminal do dispatcher e no do CRM: `Ctrl+C`. Nada mais é enviado.
2. Para parar também a ponte com o WhatsApp (libera memória do computador):
   ```bash
   cd dispatcher
   docker compose stop
   ```
   Para voltar: `docker compose up -d`. A sessão do WhatsApp continua conectada.

## 2. Desconectar o WhatsApp

Faça isto **antes** de apagar a Evolution, para o número não ficar vinculado a algo que não
existe mais.

- Pelo celular: WhatsApp, Dispositivos vinculados, toque no aparelho do setup e em Sair.
- Ou pelo setup, com a Evolution ligada: `cd dispatcher && npm run logout`.

## 3. Remover a Evolution API

Na pasta `dispatcher`:

```bash
docker compose down -v
```

O `-v` apaga também os volumes: a sessão do WhatsApp e o banco da Evolution (histórico de
mensagens que ela guardou). **Sem o `-v`**, os containers somem mas os volumes ficam, e uma
nova instalação reaproveita a sessão.

Conferir que não sobrou nada:

```bash
docker ps -a --filter name=zxc7
docker volume ls --filter name=zx-control-7-evolution
```

As duas listas devem vir vazias. As imagens (ocupam alguns GB) podem ser apagadas, se você não
usa em outro projeto:

```bash
docker image rm evoapicloud/evolution-api:v2.3.7
docker image rm postgres:15
```

Se o segundo comando reclamar que a imagem está em uso, é porque outro container usa o
Postgres 15; deixe a imagem.

## 4. Apagar os dados dos leads

Telefone e nome de empresa ou de sócio são dados pessoais (LGPD). Se você vai parar de usar,
apague a base de leads. Ela está na pasta `pipeline/` do setup: leads, fila, respostas, logs,
pool e enriquecimentos.

- Mac e Linux: `rm -rf pipeline/* pipeline/.meta_token scripts/.instagram-session.json`
  (o `pipeline/*` sozinho não pega arquivo que começa com ponto).
- Windows (PowerShell): `Remove-Item pipeline\* -Recurse -Force` e
  `Remove-Item scripts\.instagram-session.json -Force -ErrorAction SilentlyContinue`
  (o `-Force` inclui os arquivos ocultos, como o `pipeline\.meta_token`).

Dois desses arquivos guardam acesso, não lead: `pipeline/.meta_token` (chave do app da Meta, se
você configurou a Biblioteca de Anúncios) e `scripts/.instagram-session.json` (sessão do
Instagram usada no enriquecimento). Apague os dois mesmo que vá manter os leads.

Os arquivos `*.bak-AAAAMMDD-HHMMSS` (cópias que o setup guarda antes de sobrescrever) também
podem ter dados seus, inclusive chaves. Apague-os junto, na pasta do setup:
`find . -name '*.bak-*' -type f -delete` no Mac e no Linux,
`Get-ChildItem -Recurse -Force -Filter *.bak-* | Remove-Item -Force` no Windows.

## 5. Revogar os acessos que você deu

Apagar a pasta não cancela as permissões que ficaram nos serviços:

- **Apify:** em console.apify.com, Settings, API & Integrations, apague o token que você usou.
- **Google Calendar** (se conectou a agenda): em myaccount.google.com/permissions, remova o
  acesso do app. Depois apague `crm/google-token.json`.
- **Meta** (se criou o app para a Biblioteca de Anúncios): em developers.facebook.com, Meus apps,
  gere um novo segredo do app ou apague o app. Depois apague `pipeline/.meta_token`.
- **Instagram** (se fez login no enriquecimento): em Configurações, Central de Contas, Senha e
  segurança, Onde você está conectado, encerre a sessão do navegador do setup. Depois apague
  `scripts/.instagram-session.json`.
- **WhatsApp:** já feito no passo 2.

## 6. Apagar a pasta do setup

Com os passos 2 a 5 feitos, apague a pasta inteira do setup. Ela contém, entre outros:

| Arquivo ou pasta | O que é |
|---|---|
| `dispatcher/.env`, `crm/.env` | configuração, chaves e a senha do CRM |
| `.claude/contexto-local.md`, `.claude/skills/` | o contexto e a skill do seu negócio |
| `pipeline/` | a base de leads |
| `docs/comandos-diarios.md` | comandos personalizados |
| `dispatcher/dispatcher.log*` | logs (com telefone mascarado) |
| `crm/google-token.json` | acesso à agenda |
| `node_modules/` (em `dispatcher` e `crm`) | dependências |

Se você quer **guardar a skill** do seu negócio (o trabalho de personalização), copie antes a
pasta `.claude/skills/` para outro lugar.

O Node, o Python, o Docker e o Claude Code **não** são instalados pelo setup para uso exclusivo
dele; desinstale à parte só se não usa mais.

## 7. Reinstalar

- **Por cima, sem apagar nada:** abra o Claude Code na pasta e peça "reinstale esse setup por
  cima" (com a instalação feita, só um pedido explícito de reinstalar refaz tudo). Antes de sobrescrever qualquer arquivo que já existe e vai mudar, o setup guarda
  `<arquivo>.bak-AAAAMMDD-HHMMSS` (a skill que você personalizou entra nisso). A chave da
  Evolution é mantida, e o WhatsApp continua conectado.
- **Do zero:** faça os passos 3 a 6 e instale de novo pelo README.

Dúvida ou problema: https://suporte.zxlab.com.br/hub ou contato@zxlab.com.br.
