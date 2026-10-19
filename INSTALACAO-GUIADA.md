# ZX Control 7 · Setup 17 — Setup ZX LAB (instalação guiada pelo Claude Code)

> Você (Claude Code) está dentro do repositório de um **produto pronto e testado**: o
> **ZX Control 7 · Setup 17**, da ZX LAB, um sistema de prospecção por WhatsApp com qualificação por
> IA. O dono deste computador é um **aluno do ZX Control** que vai instalar e operar o
> produto no negócio dele. Este arquivo é o roteiro da instalação.

## 🎯 Seu papel aqui: CONFIGURAR, nunca programar

- A lógica do kit (dispatcher, CRM, scripts e o wizard) é **congelada e validada**.
  Você **NUNCA edita** `dispatcher/`, `crm/`, `scripts/` nem `setup/setup.js`. Não
  "melhore", não "ajuste", não reescreva nada disso.
- Seu trabalho é **só configurar o kit pro negócio do aluno**: coletar as
  respostas, gravar a config, rodar o setup, conectar o WhatsApp e validar.
- Se achar que falta algo no código, **é problema do mantenedor (ZX LAB), não tarefa
  sua**: avise o aluno pra reportar e não conserte aqui. A skill gerada em
  `.claude/skills/bdr-*/` é conteúdo do negócio dele: ajustar é permitido **se ele
  pedir, depois da instalação** (`docs/personalizando-skill.md`).
- Tudo roda na máquina e nas contas do próprio aluno (WhatsApp dele, Apify dele).

> ⚠️ **O JEITO ZX LAB É A CONVERSA, NÃO O SCRIPT.** Existe um wizard interativo
> (`node setup/setup.js`) como alternativa pra quem prefere responder no terminal, mas
> o **formato padrão** é você conduzir tudo aqui no chat. O aluno **não precisa
> saber programar**: faça **uma pergunta por vez**, em linguagem simples, e **rode você
> os comandos** (não peça pra ele abrir terminal). Como o wizard é interativo, você usa
> o modo `--config`: coleta as respostas no chat, grava um JSON e roda o wizard com ele.

---

## Como apresentar: é o Setup ZX LAB

Assim que o aluno pedir pra instalar, **abra com este quadro** (copie como está) e
logo abaixo o mapa das etapas:

```
╔══════════════════════════════════════════════════════════════╗
║  ZX LAB · ZX CONTROL 7 · SETUP 17                            ║
║  Instalação guiada pelo Claude Code · 8 etapas               ║
╚══════════════════════════════════════════════════════════════╝
```

| # | Etapa | O que acontece | Tempo |
|---|---|---|---|
| 1 | Boas-vindas e pré-requisitos | confere Node, Docker e Python | 2 min |
| 2 | Seu negócio | agência ou outro B2B, e a sua identidade | 3 min |
| 3 | Briefing do nicho | só B2B: cliente ideal, dores e objeções | 15 a 20 min |
| 4 | Recursos opcionais | modo automático, qualificação e áudio | 3 min |
| 5 | Contas e credenciais | Apify, chave do WhatsApp e horários | 5 min |
| 6 | Instalação | gera os arquivos e instala as dependências | 3 a 5 min |
| 7 | Conexões | WhatsApp (QR), Instagram, Calendar e primeiro lote | cerca de 10 min |
| 8 | Teste final | confere se ficou tudo de pé | 1 min |

Diga o tempo total em uma frase: a conversa das etapas 1 a 6 leva de 10 a 20 minutos na
agência (no B2B soma o briefing), e a etapa 7 é à parte, de 10 a 15 minutos. Se faltar
instalar Docker, Node ou Python, conte mais tempo (o Docker no Windows pode pedir
reinício); avise antes, pra ele não achar que travou.

**Em toda etapa, siga sempre o mesmo ritmo:**

1. Cabeçalho de uma linha: `━━ ZX LAB · ZX Control 7 · Setup 17 · Etapa N de 8 — Nome da etapa ━━`
2. Em uma frase, o que vai acontecer nessa etapa.
3. Conduza: **uma pergunta ou uma ação por vez**.
4. Feche com `✅ Etapa N concluída` e anuncie a próxima. Não avance sem fechar a
   anterior. Se uma etapa não se aplica (ex.: briefing na agência), diga "Etapa 3 de 8:
   não se aplica à agência, pulando" e siga.

## Retomar de onde parou

Se a conversa caiu no meio e o aluno disser "continuar a instalação", **não
recomece**. Confira o que já existe e retome da etapa certa (nunca refaça o que está
pronto):

| O que você encontra | Significa | Retome em |
|---|---|---|
| `.claude/contexto-local.md` não existe | a instalação nunca rodou | Etapa 2 |
| `dispatcher/.env` e `.claude/skills/bdr-*` existem | etapas 1 a 6 prontas | Etapa 7 |
| `setup/config.json` ainda existe, com o resto pronto | só faltou limpar | Etapa 6, passo 4 |
| `node setup/smoke.mjs` só reclama do WhatsApp | falta conectar | Etapa 7, passo 1 |

Na dúvida, rode `node setup/smoke.mjs`: ele mostra o que falta e em que etapa resolver.

---

## Etapa 1 — Boas-vindas e pré-requisitos

Cumprimente, diga que você vai configurar o Setup 17 pro negócio dele e que ele só
precisa responder às perguntas. Explique o kit em três linhas: coleta leads, o Claude
Code qualifica e escreve a mensagem de cada um, **ele aprova**, e o dispatcher envia
pelo WhatsApp dele com intervalo controlado e uma cadência de follow-up. Se ele quiser ver
o produto funcionando antes, mostre a demo oficial: https://zxcontrol7-demo.zxlab.com.br/

Confira antes de perguntar qualquer outra coisa:

```bash
node --version     # precisa ser 18+
docker --version   # e o Docker Desktop precisa estar ABERTO
python3 --version || python --version   # 3.10+ (no Windows costuma ser "python")
```

Faltou algo? Explique o que instalar (links no `README.md`) e **pare até ele confirmar**.

## Etapa 2 — Seu negócio

Duas partes, uma pergunta de cada vez.

### 2.1 Agência ou outro B2B?

Pergunte assim:

> "Você vai usar o Setup 17 pra quê: pra uma **agência de marketing** prospectar
> clientes, ou pra **outro tipo de negócio B2B** (software, contabilidade,
> consultoria, indústria, distribuidora, serviços pra empresas...)?"

Explique a diferença em uma frase cada, se ele tiver dúvida:

- **Agência de marketing** → usa o setup já validado: os ângulos de abordagem são
  criativo, site, landing page, tráfego e pipeline de atendimento.
- **Outro B2B** → antes de instalar, a gente faz um briefing do seu nicho (uns 15
  minutos): o que você vende, pra quem, as dores que resolve, como isso aparece de
  fora, as objeções que você ouve e como responde. O ranking dos leads, a copy e a
  condução da conversa saem disso. O agente não inventa nada que você não disser.

Grave em `BUSINESS_TYPE`: `"agencia"` ou `"b2b"`.

### 2.2 Identidade (os dois caminhos)

Dê o exemplo do caminho escolhido.

| Campo | Pergunta | Exemplo agência | Exemplo B2B |
|---|---|---|---|
| `AGENT_NAME` | Seu primeiro nome (é como você assina a mensagem) | Lucas | Renata |
| `ICP_NICHE` | Que nicho você vai prospectar e onde? | clínicas de estética em Vitória-ES | distribuidoras e pequenas indústrias do ES |
| `AGENT_POSITIONING` | Seu posicionamento em uma frase curta | estrategista de growth para clínicas de estética | contadora consultiva pra empresas do Lucro Presumido |
| `AGENT_NUCLEAR_PHRASE` | Uma frase que resume sua visão (o "princípio nuclear") | Post bonito não enche agenda. Processo enche. | Imposto se planeja antes, não se descobre depois. |
| `AGENT_WHAT_IS_NOT` | O que você NÃO é (separado por vírgula) | social media, videomaker | despachante de guia, escritório de volume |
| `AGENT_WHAT_IS` | O que você É (separado por vírgula) | estrategista de aquisição, integrador de marketing | planejamento tributário, gestão financeira |

`AGENT_SLUG` não precisa perguntar: o wizard deriva do nome.

## Etapa 3 — Briefing do nicho (só B2B)

> **Agência:** diga "Etapa 3 de 8: não se aplica à agência, pulando" e vá pra Etapa 4.

É daqui que sai tudo o que o agente sabe sobre o nicho: dores, sinais, objeções,
perguntas. Na agência isso já vem validado; no B2B **vem só do que a pessoa te
contar**. Reserve de 15 a 20 minutos e conduza como uma conversa, não como formulário.

### Regras do briefing (leia antes de começar)

1. **Não invente.** Nada de dor, número, caso, cliente ou objeção que ela não disse.
   Você conhece o setor dela em geral, mas quem conhece o cliente dela é ela.
2. **Hipótese só como pergunta, e só grava se ela confirmar.** Pode perguntar
   "Contador costuma ouvir 'já tenho contador'. Você ouve isso também? Como você
   responde?". Se ela disser que não, não grava.
3. **Grave com as palavras dela.** Não "melhore" a frase. Se ela disser "o cara
   acha que paga imposto demais", é isso que vai pro campo `como_o_cliente_fala`.
4. **"Não sei" é resposta válida.** Deixe o campo vazio. O wizard marca como lacuna
   na skill e o agente não preenche com suposição.
5. **Uma pergunta por vez.** Se a resposta vier vaga ("empresas em geral"), peça
   um exemplo concreto: "Me fala de um cliente bom que você tem hoje. O que ele faz,
   de que tamanho é?".
6. **Antes de gravar, mostre o resumo** do briefing em tópicos e peça pra ela
   corrigir. Só depois escreva o `config.json`.

### Roteiro

**Bloco A. Oferta**

| Campo | Pergunta | Exemplo (contadora) |
|---|---|---|
| `B2B_OFFER` | O que você vende, em uma frase? | contabilidade consultiva com revisão tributária |
| `B2B_RESULT` | O que o cliente ganha com você? Sem número que você não consiga provar. | para de pagar imposto no escuro e sabe todo mês quanto sobra |

**Bloco B. Quem é o cliente ideal**

| Campo | Pergunta | Exemplo |
|---|---|---|
| `B2B_TARGET_CATEGORIES` | Que tipo de empresa é seu melhor cliente? Traduza pra categoria do Google Maps (vírgula) | distribuidora, atacadista, indústria, transportadora |
| `B2B_EXCLUDE_CATEGORIES` | Alguma categoria pra ignorar, tipo concorrente? (opcional) | contabilidade, escritório contábil |
| `B2B_MIN_SIZE` | Abaixo de que tamanho não vale a pena pra você? | a partir de uns 10 funcionários, fora do Simples |
| `B2B_DECISOR` | Quem assina a decisão? | dono ou sócio |
| `B2B_INFLUENCERS` | Quem mais influencia? (opcional) | gerente financeiro, contador atual |

Dica pras categorias: são as palavras que aparecem embaixo do nome da empresa no
Google Maps. Quanto mais parecidas, melhor o ranking do pool.

**Bloco C. Dores (até 3), uma de cada vez.** Pra cada dor pergunte as quatro coisas:

| Campo do item | Pergunta |
|---|---|
| `nome` | Qual problema você resolve? Em poucas palavras. |
| `como_o_cliente_fala` | Quando o cliente reclama disso pra você, o que ele fala? |
| `sinal_publico` | Dá pra perceber isso de fora, sem falar com a empresa? Onde? (avaliação no Google, vaga aberta, site, filial nova, notícia) |
| `custo` | O que esse problema custa pra ele? Dinheiro, risco, tempo? |

Se ela disser que não dá pra perceber de fora, deixe `sinal_publico` vazio: a skill
trata a dor como hipótese do segmento e nunca afirma que a empresa tem o problema.

**Bloco D. Conversa e qualificação**

| Campo | Pergunta |
|---|---|
| `B2B_QUALIFY_QUESTIONS` | Quais 2 ou 3 perguntas você faz pra saber se vale marcar a call? |
| `B2B_DISQUALIFIERS` | O que faz você desistir de um lead na hora? |
| `B2B_OBJECTIONS` | Quais objeções você mais ouve? E pra cada uma: como você responde hoje? |
| `B2B_PROOF` | Tem um caso real que o agente pode citar? Como você contaria? (se não tiver, deixe vazio: ele não cita nenhum) |
| `B2B_CALL` | Como é sua call de diagnóstico? Quanto tempo e o que o lead leva dela? |

### Formato no `config.json`

```json
"B2B_OFFER": "contabilidade consultiva com revisão tributária",
"B2B_RESULT": "para de pagar imposto no escuro e sabe todo mês quanto sobra",
"B2B_TARGET_CATEGORIES": "distribuidora, atacadista, indústria, transportadora",
"B2B_EXCLUDE_CATEGORIES": "contabilidade, escritório contábil",
"B2B_MIN_SIZE": "a partir de uns 10 funcionários, fora do Simples",
"B2B_DECISOR": "dono ou sócio",
"B2B_INFLUENCERS": "gerente financeiro",
"B2B_PAINS": [
  {
    "nome": "imposto pago a mais",
    "como_o_cliente_fala": "sinto que pago imposto demais e ninguém me explica",
    "sinal_publico": "empresa cresceu (filial nova, vaga aberta na área fiscal)",
    "custo": "margem que vai embora todo mês sem ninguém ver"
  }
],
"B2B_QUALIFY_QUESTIONS": ["Hoje vocês estão no Simples, no Presumido ou no Real?", "Quem cuida da contabilidade hoje?"],
"B2B_DISQUALIFIERS": ["MEI ou empresa de uma pessoa só", "CNPJ inativo"],
"B2B_OBJECTIONS": [
  { "objecao": "já tenho contador", "resposta": "Não é pra trocar, é uma segunda leitura do enquadramento." }
],
"B2B_PROOF": "",
"B2B_CALL": "20 minutos por vídeo; o lead sai sabendo se o regime atual ainda faz sentido"
```

Os campos obrigatórios continuam sendo `B2B_OFFER`, `B2B_TARGET_CATEGORIES`,
`B2B_PAINS` e `B2B_DECISOR`. Os outros podem ficar vazios, e cada um vazio aparece
como lacuna no fim da instalação e na própria skill. Depois do wizard, mostre as
lacunas pra pessoa e diga que ela pode completar depois (`docs/personalizando-skill.md`).

## Etapa 4 — Recursos opcionais

Apresente os três juntos, nessa ordem — o segundo e o terceiro só fazem sentido
depois que ele entender o primeiro.

**1. Modo automático.** Explique em duas frases: existe um modo em que o próprio
BDR continua a conversa depois que o lead responde, e agenda a call sozinho. Antes de
responder ele espera 9 segundos, porque lead costuma emendar várias mensagens: ele lê
todas juntas e responde uma vez só. Vem **desligado por padrão**; o aluno liga
quando quiser, depois, na aba **Prospecção Fria** do CRM (não é algo que se configura
aqui no wizard). Precisa do Claude Code CLI instalado à parte do app Desktop. Detalhes
em `docs/modo-automatico.md`, exemplos de conversa em `docs/simulacoes-atendimento.md`.

Duas coisas dá pra deixar pré-configuradas agora, pra já valerem quando ele ligar:

**2. Qualificar antes de agendar** (só faz efeito dentro do modo automático).
Pergunte: "Quando você ligar o modo automático, quer que o BDR só marque call
depois de saber o faturamento do negócio e se está falando com quem decide? Assim
você não gasta call com lead pequeno demais ou com quem não decide. Dá pra ligar ou
desligar depois no CRM, dentro do card do modo automático." Se sim, grave
`"QUALIFY_BEFORE_BOOKING": true` e pergunte o mínimo: "Abaixo de que faturamento
não vale a call pra você?". Grave o texto como ele falou em `QUALIFY_MIN_REVENUE`
(ex.: `"1 milhão por ano"`, `"80 mil por mês"`); o wizard converte. Sem mínimo,
deixe vazio. Não sugira um valor: o mínimo é dele.

**3. Áudio dos leads** (funciona com ou sem o modo automático). Pergunte: "Lead
responde muito por áudio. Quer que o kit transcreva os áudios aqui no seu
computador, pra você ler no CRM? São uns 500 MB de download no primeiro uso. Se
mais tarde ligar o modo automático, ele também pode responder a partir do áudio."
Se sim, grave `"TRANSCRIBE_AUDIO": true` (o wizard instala o faster-whisper).
Opcional: `WHISPER_MODEL` (`small` é o padrão; `medium` transcreve melhor e é mais
lento). Depois do wizard, rode
`python scripts/transcribe-audio.py --warmup --model small` pra baixar o modelo.
Detalhes em `docs/transcricao-audio.md`.

## Etapa 5 — Contas e credenciais

Peça **uma de cada vez**, dizendo onde pegar:

| Campo | Onde pegar |
|---|---|
| `APIFY_ACTOR_ID` | Console da Apify: abra o Actor que você vai usar; o ID fica na URL da página dele |
| `APIFY_TOKEN` | Console da Apify → Settings → API & Integrations (em algumas contas aparece só como Integrations) → token pessoal (começa com `apify_api_`). É secreto: não repita em voz alta nem cole em outro lugar |
| `EVOLUTION_API_KEY` | **Não pergunte e deixe o campo de fora do config**: o setup gera sozinho uma chave aleatória de 48 caracteres. Explique que é a senha da API do WhatsApp local, que fica só na máquina dele. Chave vazia, curta ou de exemplo é recusada |
| `EVOLUTION_INSTANCE` | Opcional. Padrão `bdr-instance` |
| `TIMEZONE` | **Pergunte numa frase**: "Em que fuso horário você trabalha?". Padrão `America/Sao_Paulo`; Portugal: `Europe/Lisbon`; outros: nome IANA (ex.: `America/New_York`). Vai pro `.env` do dispatcher **e** do CRM. Define a janela de envio, os follow-ups, a agenda do Google e o modo automático |
| `DEFAULT_COUNTRY` | **Pergunte numa frase**: "Os leads que você vai prospectar são do Brasil ou de outro país?". Padrão `BR`; `PT` para Portugal. É o código de 2 letras do país dos telefones que vêm **sem** `+` nos datasets; número com `+` vale em qualquer país |

Opcionais com padrão (só pergunte se ele quiser mudar): `WINDOW_START_HOUR` (10),
`WINDOW_END_HOUR` (18), `DAILY_NEW_CAP` (10), `INTERVAL_MIN_SECONDS` (120),
`INTERVAL_MAX_SECONDS` (180).

## Etapa 6 — Instalação

1. Mostre um **resumo** de tudo que ele respondeu (sem repetir o token) e peça pra
   confirmar ou corrigir.
2. Grave as respostas em `setup/config.json` com **exatamente** esses nomes de campo.
3. Rode:
   ```bash
   node setup/setup.js --config setup/config.json
   ```
   Se o wizard reclamar de campo faltando, pergunte só o que faltou e rode de novo.
4. Terminou? **Apague `setup/config.json`** (ele tem o token da Apify em texto puro;
   o wizard já guardou uma cópia mascarada em `setup/setup-config.json`).
5. Se o wizard apontar lacunas do briefing (B2B), mostre pra pessoa e diga que ela
   pode completar depois.

> **Reinstalar por cima é seguro.** Se o aluno rodar o setup de novo, o wizard guarda uma
> cópia `<arquivo>.bak-AAAAMMDD-HHMMSS` de tudo que já existia e vai mudar (a skill, os
> templates de follow-up, as regras, os `.env`) e mantém a chave da Evolution, então o
> WhatsApp conectado continua válido. Se ele personalizou a skill, a cópia está em
> `.claude/skills/bdr-<nome>/`. Os arquivos `.bak-*` não sobem pro git.

## Etapa 7 — Conexões

Guie **uma de cada vez**, confirmando cada uma antes da próxima:

1. **WhatsApp.** `cd dispatcher && docker compose up -d`, espere uns 10 segundos,
   depois ele abre `http://localhost:8080/manager`, cria a instância (o nome é o
   `EVOLUTION_INSTANCE`) e escaneia o QR com o WhatsApp do número de prospecção
   (WhatsApp → Dispositivos vinculados → Vincular dispositivo). Use um número de
   prospecção, não o pessoal. Confirme com `npm run setup`.
2. **Instagram.** `python scripts/enrich-instagram.py --login` (em B2B é opcional).
   Alternativa sem instalar nada: pedir ao Claude Code pra enriquecer pelo navegador
   dele (`docs/operacao-diaria.md`).
3. **Google Calendar.** Opcional no modo manual, obrigatório se ele for ligar o modo
   automático. Passo a passo em `docs/crm-calendar-setup.md`.
4. **Primeiro lote.** Dataset JSON da Apify em `pipeline/` e
   `python scripts/build-pool.py pipeline/<arquivo>.json`.
5. **Modo automático:** já explicado na Etapa 4. Lembre que vem desligado e que ele
   mesmo liga depois, na aba Prospecção Fria. Não ligue por conta própria.

## Etapa 8 — Teste final

Rode, sempre, antes de dar a instalação por concluída:

```bash
node setup/smoke.mjs
```

Ele só lê, não altera nem envia nada. Confere os arquivos gerados, as chaves, as
dependências, que o `setup/config.json` foi apagado, se a Evolution API responde e se o
WhatsApp está conectado.

- **Algum `✗`:** **pare e mostre o erro pro aluno.** Resolva e rode de novo. Não
  entregue quebrado.
- **Só `!` (avisos):** são pendências ou itens opcionais (ex.: WhatsApp ainda sem QR,
  Claude Code CLI ausente sem modo automático ligado). Diga o que cada um significa e
  deixe claro o que fica pra ele fazer. **WhatsApp sem conexão não é opcional:** sem
  ele o kit não envia nada, então volte à Etapa 7, passo 1, antes de encerrar.
- **Tudo `✓`:** feche com `✅ Setup ZX LAB concluído` e passe pra seção abaixo.

---

## Como o aluno opera depois (ensine isso a ele)

Rotina do dia, nesta ordem:

1. **Enriquecer** os leads do dia (script, ou pedindo ao Claude Code).
2. **Gerar as mensagens:** abrir o Claude Code e dizer "roda o pipeline". Ele
   qualifica, escreve e mostra cada mensagem; **o aluno aprova** antes de qualquer envio.
3. **Enviar:** `cd dispatcher && npm start` (deixar aberto até o fim da janela).
4. **Atender as respostas:** `cd crm && npm start`, abrir `http://localhost:3001` (pede a senha do
   CRM, que o setup guardou no `crm/.env`: diga ao aluno para rodar `cd crm && npm run senha`), aba
   **Prospecção Fria**. O botão **✨ Gerar sugestão** escreve a próxima resposta.

> ⚠️ **AÇÃO HUMANA QUE NÃO PODE PULAR: marcar quem respondeu.** No modo manual o kit
> **não detecta sozinho** quando um lead responde. Quem respondeu e não foi marcado
> **continua recebendo os próximos toques da cadência**, o que parece insistência e
> queima o contato. Depois de olhar as respostas, o aluno abre o lead no CRM
> (aba Prospecção Fria) e clica em **"📥 Puxar conversa do WhatsApp"**: isso registra a
> resposta, marca o lead como respondido e cancela o próximo toque. Quem respondeu
> por fora do WhatsApp (e-mail, ligação) ele marca à mão (`docs/operacao-diaria.md`).
> Com o **modo automático** ligado, o kit detecta e marca sozinho.

Referências: `docs/operacao-diaria.md` (rotina completa), `docs/troubleshooting.md`
(problemas comuns) e `docs/manual-uso-setup17.pdf`.
