# ZX Control 7 · Setup 17

Sistema de prospecção outbound via WhatsApp com qualificação de leads por IA e cadência de 6 toques em 5 dias úteis. O aluno instala, configura com os dados do próprio negócio e opera de forma independente.

**Demo oficial** (dados fictícios): https://zxcontrol7-demo.zxlab.com.br/

---

## O que este kit faz

1. **Coleta leads** da Apify (Google Maps, LinkedIn ou qualquer fonte configurada)
2. **Enriquece automaticamente** cada lead com dados do site, Instagram e Meta Ads via scripts locais
3. **Qualifica e gera copy** personalizada para cada lead via Claude Code (usa sua assinatura Claude Pro/Max)
4. **Você aprova** cada mensagem antes de ela ser enviada
5. **Dispatcher envia** as mensagens via WhatsApp com intervalo controlado (120–180s)
6. **Cadência automática** de follow-up: 6 toques ao longo de 5 dias úteis
7. **Para a cadência** quando o lead responde: você marca no CRM com um clique ("Puxar conversa do WhatsApp") ou, com o modo automático ligado, o kit detecta sozinho

---

## Pré-requisitos

Crie as contas e instale as ferramentas abaixo **antes** de iniciar a instalação.

### Contas necessárias

| Conta | Onde criar | Para que serve |
|---|---|---|
| **Claude Pro ou Max** | [claude.ai](https://claude.ai) | Qualificação de leads e geração de copy |
| **Conta Apify** | [apify.com](https://apify.com) | Fonte dos datasets de leads. O plano gratuito tem créditos mensais para começar; o custo de cada lote depende do Actor escolhido, veja o preço na página do Actor antes de rodar |

### Software necessário

| Ferramenta | Verificar no terminal | Como instalar |
|---|---|---|
| **Git** (ou **GitHub CLI**, `gh`) | `git --version` ou `gh --version` | [git-scm.com](https://git-scm.com/downloads) ou [cli.github.com](https://cli.github.com). Para baixar o setup |
| **Claude Code** | `claude --version` | App **Claude para Desktop** ([claude.ai/download](https://claude.ai/download), Windows e Mac), que já vem com o Code. No Linux, ou se preferir o terminal: `npm install -g @anthropic-ai/claude-code` e depois `claude login`. O comando `claude` (CLI) também é **obrigatório pra ligar o modo automático** |
| **Node.js ≥ 18** | `node --version` | [nodejs.org](https://nodejs.org/en/download/) |
| **Docker** | `docker --version` | **Windows e Mac:** [Docker Desktop](https://www.docker.com/products/docker-desktop) (no Windows aceite o WSL2 e reinicie se o instalador pedir). **Linux:** [Docker Engine](https://docs.docker.com/engine/install/) com o plugin Compose |
| **Python ≥ 3.10** | `python3 --version` (Mac/Linux) ou `python --version` (Windows) | [python.org/downloads](https://python.org/downloads) |
| **ffmpeg** (opcional) | `ffmpeg -version` | Só pra transcrever áudio de lead (veja `docs/transcricao-audio.md`) |

> O wizard verifica Node.js, Docker e Python automaticamente e para se algum estiver faltando.
> No Windows e no Mac, deixe o **Docker Desktop aberto** antes de iniciar a instalação. No Linux, o serviço do Docker precisa estar ativo.

---

## Instalação

A instalação é o **Setup ZX LAB**: o Code do app Claude conduz você, conversando, em 8 etapas. Você faz uma vez.

### Passo 1 — Baixe o setup

Escolha uma pasta permanente (não a pasta Downloads, que pode ser limpa pelo sistema) e abra o terminal nela:

```bash
gh repo clone zxmarketingdigital/zx-control-setup17-bdr-kit
cd zx-control-setup17-bdr-kit
```

Sem o `gh`, use o Git: `git clone https://github.com/zxmarketingdigital/zx-control-setup17-bdr-kit.git`.

### Passo 2 — Abra o Claude Code nessa pasta

No terminal, dentro da pasta, rode:

```bash
claude
```

Ou, no app Claude para Desktop, clique em **`</> Code`** (canto inferior esquerdo) e escolha a pasta `zx-control-setup17-bdr-kit`.

> Você já está autenticado com o seu plano Claude. Só precisa fazer `claude login` na primeira vez se estiver usando o terminal.

### Passo 3 — Peça a instalação

No chat do Code, escreva:

```
instale esse setup
```

**Só pelo app, sem terminal?** Escreva no chat do Code: `instale o setup do repositório github.com/zxmarketingdigital/zx-control-setup17-bdr-kit`. O Code baixa e instala.

O Code abre com o quadro **ZX LAB · ZX Control 7 · Setup 17** e segue o roteiro em `INSTALACAO-GUIADA.md`, uma pergunta por vez:

| Etapa | O que acontece |
|---|---|
| 1. Boas-vindas e pré-requisitos | Confirma que Node.js, Docker e Python estão instalados |
| 2. Seu negócio | Pergunta se o kit é pra uma **agência de marketing** (setup validado) ou pra **outro negócio B2B**, e sua identidade (nome, nicho, posicionamento) |
| 3. Briefing do nicho | Só B2B: você define oferta, segmentos-alvo, dores e decisor, e o ranking dos leads se adapta ao seu nicho |
| 4. Recursos opcionais | Modo automático, qualificação antes de agendar e transcrição de áudio |
| 5. Contas e credenciais | ID e token da Apify; a chave da Evolution API é gerada pra você |
| 6. Instalação | Gera todos os arquivos personalizados e instala as dependências |
| 7. Conexões | Sobe a Evolution API, você escaneia o QR do WhatsApp em `http://localhost:8080/manager`, e login no Instagram (opcional em B2B), Google Calendar e primeiro lote |
| 8. Teste final | `node setup/smoke.mjs` confere se ficou tudo de pé |

> Você só sai do Code para duas ações: escanear o QR do WhatsApp no painel da Evolution API (browser) e fazer login no Instagram no browser — ambas guiadas pelo Code.

Se a conversa cair no meio, diga "continuar a instalação": o Code confere o que já está pronto e retoma da etapa certa.

**Tempo estimado (estimativa):** com Node.js, Docker e Python já instalados, de 45 a 90 minutos na primeira vez. A conversa das etapas 1 a 6 leva de 10 a 20 minutos na agência (no B2B soma o briefing, de 15 a 20 minutos) e a etapa 7 leva de 10 a 15 minutos. Se você ainda não tem nada instalado, reserve de 2 a 3 horas: o Docker Desktop no Windows inclui o WSL2 e pode pedir reinício.

---

## Após a instalação

### Primeiro lote de leads

1. Acesse [console.apify.com](https://console.apify.com), abra o último run do seu Actor
2. Exporte o dataset como JSON
3. Salve na pasta `pipeline/` do projeto (ex: `pipeline/dataset-2026-06-02.json`)
4. No terminal, dentro da pasta do kit:

```bash
python3 scripts/build-pool.py pipeline/dataset-2026-06-02.json
```

> No Windows, use `python` no lugar de `python3` se o segundo não for reconhecido.

**Fuso horário:** o setup pergunta o seu fuso (`TIMEZONE`, padrão `America/Sao_Paulo`; Portugal: `Europe/Lisbon`) e grava no `.env` do dispatcher e do CRM. Ele vale para a janela de envio, os follow-ups, a agenda do Google (a reunião marcada às 10h aparece às 10h no seu fuso, com horário de verão) e o modo automático.

**Leads de fora do Brasil:** o setup pergunta o país padrão dos telefones (`DEFAULT_COUNTRY`, padrão `BR`; `PT` para Portugal). Número escrito com `+` (por exemplo `+351 912 345 678`) vale em qualquer país, e o `build-pool.py` mostra no fim quantos leads foram descartados por telefone.

Faça isso uma vez por lote — não é necessário diariamente.

### Rotina diária

```
Enriquecimento:  Terminal → enrich-sites.py, depois enrich-instagram.py
                 (ou peça ao Claude Code: ele enriquece pelo navegador dele, sem script)
Copies:          App Claude → </> Code → "roda o pipeline"
Dispatcher:      cd dispatcher && npm start   (terminal, deixar aberto)
CRM:             cd crm && npm start          (opcional, http://localhost:3001)
```

Tudo roda local, pelo terminal ou pelo próprio Claude Code — nenhuma etapa depende de outra ferramenta de IA. Detalhes das duas formas de enriquecer em `docs/operacao-diaria.md`.

Veja o guia completo em `docs/manual-uso-setup17.pdf`.

---

## Como atualizar

Quando a ZX LAB publicar uma versão nova, na pasta do setup:

```bash
git pull
node setup/smoke.mjs
```

Os seus dados não são mexidos: leads (`pipeline/`), `dispatcher/.env`, `crm/.env`, a skill do seu negócio (`.claude/skills/`) e o contexto gerado (`.claude/contexto-local.md`) ficam fora do git. Se o `git pull` reclamar de arquivo que você alterou (por exemplo um script), rode `git stash` antes e `git stash pop` depois. Se a atualização trouxer dependências novas, rode `npm ci` nas pastas `dispatcher` e `crm` e `python -m pip install -r scripts/requirements.txt` (as versões são fixas: `package-lock.json` e `scripts/requirements*.txt`).

---

## CRM

O kit inclui um CRM local que roda em `http://localhost:3001`. Ele lê os mesmos arquivos do pipeline — leads, toques enviados, respostas recebidas — sem nenhuma configuração adicional.

```bash
cd crm && npm start
```

Funcionalidades: lista de leads com status e histórico de toques, a **ata pré-ligação** gerada na Fase 2 (sinais observados, pontos de melhoria, direção sugerida — nunca enviada ao lead) direto no painel de cada um, anotações por lead, agendamento de reuniões no Google Calendar (requer setup OAuth de ~10 minutos — veja `docs/crm-calendar-setup.md`), e a aba **Prospecção Fria** — status da Evolution, sugestão de resposta via Claude Code e envio direto do painel. Opcional: **"Qualificar antes de agendar"** faz o BDR só marcar call depois de saber o faturamento do negócio e quem decide (com faturamento mínimo configurável) — pré-configurável na instalação, mas só fica disponível dentro do card do modo automático quando ele está ligado (a cadência dos toques 2–6 também muda: pede um horário de ligação no manual, pede a resposta em si no automático). Áudio de lead pode ser transcrito localmente (opcional, `docs/transcricao-audio.md`): aparece como texto no CRM, entra na sugestão de resposta e, se você quiser, o modo automático responde a partir dele. A aba **Simulações** mostra conversas de exemplo (objeção, preço, recepção, pedido pra parar, agendamento) com a análise de copy de cada mensagem do agente, pra você calibrar o tom antes de ligar o modo automático.

Tem também um **modo automático opcional** (desligado por padrão) que continua a conversa e agenda a call sozinho — veja `docs/modo-automatico.md` antes de ligar (tem um pré-requisito extra: o Claude Code CLI instalado à parte do app Desktop).

---

## Estrutura do projeto

```
zx-control-setup17-bdr-kit/
├── INSTALACAO-GUIADA.md               ← Setup ZX LAB: roteiro de 8 etapas que o Claude Code segue (agência ou B2B)
├── CLAUDE.md                          ← Versionado: dispara o roteiro de instalação e importa o contexto abaixo
├── .claude/contexto-local.md          ← Gerado pelo wizard (contexto do seu negócio, fora do git)
├── .claude/
│   └── skills/
│       └── bdr-{seu-slug}/
│           └── SKILL.md               ← Gerado pelo wizard (skill de qualificação)
├── pipeline/                          ← Arquivos de leads
│   ├── pool-prequalificados.json     ← Pool persistente de candidatos
│   ├── enriched-leads-{data}.json    ← Leads prontos para qualificação
│   ├── queue-{data}.json             ← Copies aprovadas para disparo
│   ├── leads-master.json             ← Fonte da verdade de todos os leads
│   ├── followup-templates.json       ← Templates dos toques 2–6 (jogo manual + jogo modo automático)
│   ├── icp-config.json               ← Tipo de negócio + categorias-alvo (usado no ranking)
│   └── log-disparos.json             ← Log de todos os envios
├── scripts/
│   ├── build-pool.py                 ← Fase 0: normaliza e filtra dataset Apify
│   ├── enrich-sites.py               ← Enriquecimento de site (HTTP direto)
│   └── enrich-instagram.py           ← Enriquecimento Instagram via Playwright
├── dispatcher/                        ← Engine de envio WhatsApp (Evolution API)
│   ├── src/                          ← Código fonte (não editar)
│   ├── .env                          ← Gerado pelo wizard (configurações)
│   └── package.json
├── crm/                               ← CRM local (http://localhost:3001)
│   ├── server.js                     ← API Express + servidor estático
│   ├── src/                          ← Módulos: leads, calendar, invoices...
│   ├── public/index.html             ← Interface web
│   └── package.json
├── setup/
│   ├── setup.js                      ← Wizard de instalação (o Code roda ele na etapa 6)
│   └── smoke.mjs                     ← Teste final do setup (etapa 8), só leitura
└── docs/
    ├── manual-instalacao-setup17.pdf ← Manual de instalação passo a passo
    ├── manual-uso-setup17.pdf        ← Manual de uso da rotina diária
    ├── crm-calendar-setup.md         ← Setup Google Calendar no CRM
    ├── modo-automatico.md            ← Modo automático opcional (pré-requisito extra + limitações)
    ├── simulacoes-atendimento.md     ← Conversas simuladas (também na aba Simulações do CRM)
    ├── transcricao-audio.md          ← Transcrição local de áudio dos leads (opcional)
    ├── operacao-diaria.md            ← Rotina técnica (referência), inclui enriquecer pelo Claude Code
    ├── comandos-diarios.md           ← Gerado pelo wizard: comandos prontos com seus dados reais
    ├── meta-ads-token.md             ← Token opcional da Meta Ads Library (API automática)
    ├── escolhendo-provedor.md        ← Claude Pro/Max vs. API paga, custo estimado
    ├── personalizando-skill.md       ← Como adaptar ao seu nicho
    ├── troubleshooting.md            ← Problemas comuns e soluções
    ├── Contingencia-WhatsApp-Setup17.pdf  ← O que fazer quando o número cai (sessão, restrição, banimento)
    └── Contingencia-WhatsApp-Setup17-Mobile.pdf ← Mesmo conteúdo, formato retrato pra ler no celular
```

---

## Personalizando para o seu nicho

O wizard gera uma skill genérica com critérios e ângulos padrão. Para melhores resultados, personalize `.claude/skills/bdr-{seu-slug}/SKILL.md` com:

- Critérios de ICP específicos do seu nicho
- Tabela gargalo → ângulo adaptada ao que você oferece
- Exemplos de copy no seu tom de voz

---

## Suporte

Suporte oficial da ZX LAB: https://suporte.zxlab.com.br/hub · contato@zxlab.com.br
