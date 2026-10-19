#!/usr/bin/env node
'use strict';

const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');
const { generateEvolutionKey, evolutionKeyProblem } = require('./evolution-key');

// ─── ANSI color helpers ────────────────────────────────────────────────────────
const c = {
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan:   (s) => `\x1b[36m${s}\x1b[0m`,
  bold:   (s) => `\x1b[1m${s}\x1b[0m`,
  red:    (s) => `\x1b[31m${s}\x1b[0m`,
  reset:  (s) => `\x1b[0m${s}\x1b[0m`,
  dim:    (s) => `\x1b[2m${s}\x1b[0m`,
};

// Cabeçalho de etapa do Setup ZX LAB — mesmo texto do roteiro INSTALACAO-GUIADA.md.
const SETUP_TOTAL_ETAPAS = 8;
function etapaHeader(n, nome) {
  console.log('\n' + c.bold(c.cyan(`━━ ZX LAB · ZX Control 7 · Setup 17 · Etapa ${n} de ${SETUP_TOTAL_ETAPAS} — ${nome} ━━`)));
}

// ─── Paths ─────────────────────────────────────────────────────────────────────
const SETUP_DIR  = __dirname;
const ROOT_DIR   = path.join(SETUP_DIR, '..');

// ─── Utilities ─────────────────────────────────────────────────────────────────
function toSlug(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')  // remove diacritics
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function csvToBullets(csv) {
  return (csv || '')
    .split(',')
    .map((s) => '- ' + s.trim())
    .filter((s) => s.length > 2)
    .join('\n');
}

function maskSecret(value) {
  if (!value || value.length < 8) return '****';
  return value.slice(0, 10) + '****' + value.slice(-4);
}

// AAAAMMDD-HHMMSS, pra nome de cópia de segurança.
function backupStamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
}

// Valor de uma chave num .env que já existe (ou null).
function existingEnvValue(relFile, key) {
  try {
    const text = fs.readFileSync(path.join(ROOT_DIR, relFile), 'utf8');
    const m = new RegExp('^\s*' + key + '\s*=\s*(.*?)\s*$', 'm').exec(text);
    return m ? m[1].replace(/^(['"])(.*)\1$/, '$2') : null;
  } catch (_) {
    return null;
  }
}

// Rodar o wizard de novo não pode apagar o que o aluno personalizou (a skill, os templates
// de follow-up, as regras, os .env). Se o arquivo já existe e vai mudar, guarda antes uma
// cópia <arquivo>.bak-AAAAMMDD-HHMMSS (o .gitignore ignora *.bak-*).
function writeFileRecursive(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (fs.existsSync(filePath)) {
    let before = null;
    try { before = fs.readFileSync(filePath, 'utf8'); } catch (_) { /* ilegível: segue */ }
    if (before !== null && before !== content) {
      const bak = filePath + '.bak-' + backupStamp();
      fs.copyFileSync(filePath, bak);
      console.log(c.dim('    (já existia e mudou: cópia em ' + path.relative(ROOT_DIR, bak) + ')'));
    }
  }
  fs.writeFileSync(filePath, content, 'utf8');
}

// Teto de leads NOVOS por dia (anti-ban): acima de 20 o risco de restrição do número sobe
// muito. Valor inválido cai em 10. Devolve { value, limited }.
const DAILY_NEW_CAP_MAX = 20;
function normalizeDailyCap(raw) {
  const n = parseInt(String(raw ?? '').trim(), 10);
  if (!Number.isFinite(n) || n < 1) return { value: '10', limited: false };
  if (n > DAILY_NEW_CAP_MAX) return { value: String(DAILY_NEW_CAP_MAX), limited: true };
  return { value: String(n), limited: false };
}

// Nome IANA de fuso horário válido (America/Sao_Paulo, Europe/Lisbon...).
// (O mesmo teste de dispatcher/src/tz.js; o wizard é CommonJS e aquele é ESM.)
function isValidTimezone(tz) {
  if (!tz || typeof tz !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch (_) {
    return false;
  }
}

// ─── Prerequisites check ───────────────────────────────────────────────────────
function checkPrerequisites() {
  console.log('\n' + c.cyan('Verificando pré-requisitos...\n'));

  // Check Node.js version
  const nodeVersion = process.version; // e.g. "v18.12.0"
  const major = parseInt(nodeVersion.slice(1).split('.')[0], 10);
  if (major < 18) {
    console.error(c.red(`✗ Node.js ${nodeVersion} detectado. É necessário Node.js ≥ 18.`));
    console.error(c.yellow('\nComo atualizar:'));
    console.error('  • Windows/Mac: https://nodejs.org/en/download/');
    console.error('  • Via nvm:     nvm install 18 && nvm use 18');
    console.error('  • Via volta:   volta install node@18\n');
    process.exit(1);
  }
  console.log(c.green(`✓ Node.js ${nodeVersion}`));

  // Check Docker: o programa, o Compose v2 (docker compose) e se está rodando
  try {
    const dockerVersion = execSync('docker --version', { encoding: 'utf8' }).trim();
    console.log(c.green(`✓ ${dockerVersion}`));
  } catch (_) {
    console.error(c.red('✗ Docker não encontrado (necessário para a Evolution API).'));
    console.error(c.yellow('\nComo instalar:'));
    console.error('  • Windows/Mac: Docker Desktop, https://www.docker.com/products/docker-desktop');
    console.error('                 (no Windows aceite o WSL2 e reinicie se o instalador pedir)');
    console.error('  • Linux:       Docker Engine com o plugin Compose, https://docs.docker.com/engine/install/');
    console.error('  • Depois de instalar, abra o Docker Desktop (ou inicie o serviço) e rode o setup de novo.\n');
    process.exit(1);
  }
  try {
    const composeVersion = execSync('docker compose version', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    console.log(c.green(`✓ ${composeVersion}`));
  } catch (_) {
    console.error(c.red('✗ Docker Compose v2 não encontrado (o comando "docker compose").'));
    console.error(c.yellow('\nComo resolver:'));
    console.error('  • Windows/Mac: atualize o Docker Desktop (ele já traz o Compose).');
    console.error('  • Linux:       instale o plugin, por exemplo "sudo apt install docker-compose-plugin".\n');
    process.exit(1);
  }
  try {
    execSync('docker info', { stdio: 'ignore', timeout: 20000 });
    console.log(c.green('✓ Docker em execução'));
  } catch (_) {
    console.log(c.yellow('! Docker instalado, mas não está rodando. Você vai precisar dele na Etapa 7:'));
    console.log(c.yellow('  abra o Docker Desktop (Windows/Mac) ou rode "sudo systemctl start docker" (Linux).'));
  }

  // Check Python 3.10+
  // No Windows, quem instala pelo python.org só ganha o comando "python" —
  // "python3" cai no stub inútil da Microsoft Store. Tenta os dois.
  let pythonCmd = null;
  let pyVersion = null;
  for (const candidate of ['python3', 'python']) {
    try {
      // stdio com pipe: o atalho "python3" da Microsoft Store (Windows) imprime um aviso confuso
      pyVersion = execSync(`${candidate} --version`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
      pythonCmd = candidate;
      break;
    } catch (_) {
      // tenta o próximo candidato
    }
  }

  if (!pythonCmd) {
    console.error(c.red('✗ Python 3 não encontrado.'));
    console.error(c.yellow('\nComo instalar Python:'));
    console.error('  • Download: https://python.org/downloads (versão 3.10 ou superior)');
    console.error('  • Mac via brew: brew install python@3.11');
    console.error('  • Windows: marque "Add python.exe to PATH" no instalador\n');
    process.exit(1);
  }

  const match = pyVersion.match(/Python (\d+)\.(\d+)/);
  if (match) {
    const major = parseInt(match[1], 10);
    const minor = parseInt(match[2], 10);
    if (major < 3 || (major === 3 && minor < 10)) {
      console.error(c.red(`✗ ${pyVersion} detectado. É necessário Python ≥ 3.10.`));
      console.error(c.yellow('\nComo instalar Python 3.10+:'));
      console.error('  • Download: https://python.org/downloads');
      console.error('  • Mac via brew: brew install python@3.11\n');
      process.exit(1);
    }
  }
  console.log(c.green(`✓ ${pyVersion}`) + c.dim(`  (comando: ${pythonCmd})`));

  console.log('');
  return pythonCmd;
}

// ─── Readline helpers ──────────────────────────────────────────────────────────
function createRL() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function ask(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer));
  });
}

async function askRequired(rl, question, label) {
  let value = '';
  while (!value.trim()) {
    value = await ask(rl, c.cyan('? ') + question + ' ');
    if (!value.trim()) {
      console.log(c.red(`  ⚠ ${label} é obrigatório.\n`));
    }
  }
  return value.trim();
}

async function askWithDefault(rl, question, defaultValue) {
  const answer = await ask(rl, c.cyan('? ') + question + ` [${c.dim(defaultValue)}] `);
  return answer.trim() || defaultValue;
}

async function askSecret(rl, question, label) {
  let value = '';
  while (!value.trim()) {
    value = await ask(rl, c.cyan('? ') + question + ' ');
    if (!value.trim()) {
      console.log(c.red(`  ⚠ ${label} é obrigatório.\n`));
    }
  }
  value = value.trim();
  console.log(c.dim(`  (salvo como: ${maskSecret(value)})`));
  return value;
}

// ─── Phase 1: Identity ─────────────────────────────────────────────────────────
async function phase1(rl) {
  console.log('\n' + c.green('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(c.bold(c.green('  ZX LAB · ETAPAS 2 a 5 — Seu negócio, briefing, recursos e Apify')));
  console.log(c.green('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));

  const AGENT_NAME = await askRequired(
    rl,
    'Qual é o seu primeiro nome? (Ex: João)',
    'Nome'
  );

  const suggestedSlug = toSlug(AGENT_NAME);
  console.log(c.dim(`  Sugestão de slug: ${suggestedSlug}`));
  const slugAnswer = await ask(
    rl,
    c.cyan('? ') + `Confirme ou altere o slug (Enter = "${suggestedSlug}"): `
  );
  const AGENT_SLUG = slugAnswer.trim()
    ? toSlug(slugAnswer.trim())
    : suggestedSlug;
  console.log(c.dim(`  Slug definido: ${AGENT_SLUG}`));

  console.log('\n' + c.bold('  Que tipo de negócio vai usar o Setup 17?'));
  console.log(c.dim('  [1] Agência de marketing — setup validado (ângulos de criativo, site, LP, tráfego)'));
  console.log(c.dim('  [2] Outro negócio B2B — você define oferta, segmentos-alvo, dores e decisor;'));
  console.log(c.dim('      o ranking dos leads e os ângulos de abordagem se adaptam ao seu nicho\n'));
  let typeAnswer = '';
  while (!['1', '2'].includes(typeAnswer)) {
    typeAnswer = (await ask(rl, c.cyan('? ') + 'Digite 1 ou 2: ')).trim();
  }
  const BUSINESS_TYPE = typeAnswer === '2' ? 'b2b' : 'agencia';
  const isB2B = BUSINESS_TYPE === 'b2b';

  const ICP_NICHE = await askRequired(
    rl,
    isB2B
      ? 'Qual é o nicho que você prospectará? (Ex: distribuidoras e pequenas indústrias do ES)'
      : 'Qual é o nicho que você prospectará? (Ex: salões de beleza em BH)',
    'Nicho ICP'
  );

  const AGENT_POSITIONING = await askRequired(
    rl,
    isB2B
      ? 'Descreva seu posicionamento em 1 frase curta:\n  (Ex: contadora consultiva pra empresas do Lucro Presumido)\n '
      : 'Descreva seu posicionamento em 1 frase curta:\n  (Ex: consultor de marketing digital para salões premium)\n ',
    'Posicionamento'
  );

  const AGENT_NUCLEAR_PHRASE = await askRequired(
    rl,
    isB2B
      ? 'Qual é o seu princípio nuclear?\n  (Ex: Imposto se planeja antes, não se descobre depois.)\n '
      : 'Qual é o seu princípio nuclear?\n  (Ex: Instagram bonito não vende. Sistema vende.)\n ',
    'Princípio nuclear'
  );

  const AGENT_WHAT_IS_NOT = await askRequired(
    rl,
    isB2B
      ? 'O que você NÃO é? (separe por vírgula)\n  (Ex: despachante de guia, escritório de volume)\n '
      : 'O que você NÃO é? (separe por vírgula)\n  (Ex: videomaker, editor, social media executor)\n ',
    'O que você NÃO é'
  );

  const AGENT_WHAT_IS = await askRequired(
    rl,
    isB2B
      ? 'O que você É? (separe por vírgula)\n  (Ex: planejamento tributário, gestão financeira)\n '
      : 'O que você É? (separe por vírgula)\n  (Ex: estrategista de crescimento, integrador de marketing)\n ',
    'O que você É'
  );

  let B2B_OFFER = null, B2B_TARGET_CATEGORIES = null, B2B_EXCLUDE_CATEGORIES = null, B2B_PAINS = null, B2B_DECISOR = null;
  const B2B_BRIEF = {};
  if (isB2B) {
    console.log('\n' + c.bold('  — Oferta e cliente ideal (B2B) —\n'));
    B2B_OFFER = await askRequired(
      rl,
      'O que você vende, em 1 frase?\n  (Ex: contabilidade consultiva com revisão tributária)\n ',
      'Oferta'
    );
    B2B_TARGET_CATEGORIES = await askRequired(
      rl,
      'Quais categorias do Google Maps são seu cliente ideal? (separe por vírgula)\n  (Ex: distribuidora, atacadista, indústria, transportadora)\n ',
      'Categorias-alvo'
    );
    B2B_EXCLUDE_CATEGORIES = (await ask(
      rl,
      c.cyan('? ') + 'Alguma categoria pra ignorar, tipo concorrente? (separe por vírgula, Enter pula)\n  (Ex: contabilidade, escritório contábil)\n '
    )).trim() || null;
    B2B_PAINS = await askRequired(
      rl,
      'Quais as 3 dores principais que você resolve? (separe por ponto e vírgula)\n  (Ex: imposto pago a mais; caixa no escuro; fechamento do mês que atrasa)\n ',
      'Dores'
    );
    B2B_DECISOR = await askRequired(
      rl,
      'Quem decide a compra no seu cliente? (Ex: dono ou sócio, diretor financeiro)',
      'Decisor'
    );

    // Briefing do nicho: tudo opcional. O que ficar em branco vira lacuna
    // declarada na skill (o agente não preenche com suposição).
    console.log('\n' + c.bold('  — Briefing do nicho (Enter pula; o que você pular fica marcado como lacuna) —\n'));
    const opt = async (q) => (await ask(rl, c.cyan('? ') + q + '\n  ')).trim();
    B2B_BRIEF.B2B_MIN_SIZE = await opt('Qual o porte mínimo de cliente que vale a pena pra você? (Ex: 10+ funcionários, faturamento acima de 2 milhões/ano)');
    B2B_BRIEF.B2B_RESULT = await opt('O que o cliente ganha com você, nas suas palavras? (sem número que você não possa provar)');
    const painObjs = [];
    for (const nome of splitList(B2B_PAINS, ';')) {
      console.log(c.dim(`\n  Dor: ${nome}`));
      painObjs.push({
        nome,
        como_o_cliente_fala: await opt('  Como o cliente descreve essa dor quando fala com você?'),
        sinal_publico: await opt('  Que sinal público indica essa dor? (avaliação no Google, vaga aberta, site, filial nova...)'),
        custo: await opt('  O que essa dor custa pro cliente? (dinheiro, risco, tempo)'),
      });
    }
    B2B_PAINS = painObjs;
    B2B_BRIEF.B2B_QUALIFY_QUESTIONS = await opt('Que perguntas você faz pra saber se vale a call? (separe por ponto e vírgula)');
    B2B_BRIEF.B2B_DISQUALIFIERS = await opt('O que desqualifica um lead na hora? (separe por ponto e vírgula)');
    const objs = [];
    for (const objecao of splitList(await opt('Quais objeções você mais ouve? (separe por ponto e vírgula)'), ';')) {
      objs.push({ objecao, resposta: await opt(`  Como você responde a "${objecao}"?`) });
    }
    B2B_BRIEF.B2B_OBJECTIONS = objs;
    B2B_BRIEF.B2B_PROOF = await opt('Tem um caso real que o agente pode citar? (Enter se não tiver: ele não vai citar nenhum)');
    B2B_BRIEF.B2B_CALL = await opt('Como é a sua call de diagnóstico? (duração e o que o lead leva dela)');
  }

  console.log('\n' + c.bold('  — Modo automático (opcional) —\n'));
  console.log(c.dim('  O kit tem um modo em que o próprio BDR continua a conversa depois que o lead'));
  console.log(c.dim('  responde, e agenda a call sozinho. Vem DESLIGADO por padrão — você liga quando'));
  console.log(c.dim('  quiser, depois, na aba Prospecção Fria do CRM. Duas coisas que dá pra deixar'));
  console.log(c.dim('  pré-configuradas agora, pra já valerem quando você ligar:\n'));

  console.log(c.bold('  — Qualificar antes de agendar —\n'));
  console.log(c.dim('  Só faz efeito dentro do modo automático: com isso ligado, o BDR só propõe horário'));
  console.log(c.dim('  e só agenda depois que o lead disser o faturamento do negócio e quem decide.\n'));
  const QUALIFY_BEFORE_BOOKING = /^s/i.test((await ask(rl, c.cyan('? ') + 'Ativar qualificação obrigatória antes de agendar? (s/N) ')).trim());
  let QUALIFY_MIN_REVENUE = '';
  if (QUALIFY_BEFORE_BOOKING) {
    QUALIFY_MIN_REVENUE = (await ask(rl, c.cyan('? ') + 'Faturamento mínimo pra valer a call? (ex.: 1 milhão por ano, 80 mil por mês; Enter = sem mínimo)\n  ')).trim();
  }

  console.log('\n' + c.bold('  — Áudio dos leads —\n'));
  console.log(c.dim('  Lead manda muito áudio. O kit pode transcrever localmente (faster-whisper, ~500 MB'));
  console.log(c.dim('  no primeiro uso) pra você ler no CRM. Funciona no manual (botão "Puxar conversa do'));
  console.log(c.dim('  WhatsApp") e, se ligar o modo automático, ele também pode responder a partir do áudio.\n'));
  const TRANSCRIBE_AUDIO = /^s/i.test((await ask(rl, c.cyan('? ') + 'Ativar transcrição de áudio? (s/N) ')).trim()) ? 'true' : 'false';

  const APIFY_ACTOR_ID = await askRequired(
    rl,
    'Cole o ID do seu Apify Actor (ex: AbCdEfGhIj1234567)',
    'Apify Actor ID'
  );

  console.log('');
  const APIFY_TOKEN = await askSecret(
    rl,
    'Cole o seu token da Apify API (começa com apify_api_...)',
    'Apify Token'
  );

  if (!APIFY_TOKEN.startsWith('apify_api_')) {
    console.log(c.yellow('  ⚠ O token não começa com "apify_api_" — verifique se está correto.'));
    console.log(c.dim('    Continuando mesmo assim...\n'));
  }

  return {
    AGENT_NAME,
    AGENT_SLUG,
    BUSINESS_TYPE,
    ICP_NICHE,
    AGENT_POSITIONING,
    AGENT_NUCLEAR_PHRASE,
    AGENT_WHAT_IS_NOT,
    AGENT_WHAT_IS,
    B2B_OFFER,
    B2B_TARGET_CATEGORIES,
    B2B_EXCLUDE_CATEGORIES,
    B2B_PAINS,
    B2B_DECISOR,
    ...B2B_BRIEF,
    TRANSCRIBE_AUDIO,
    QUALIFY_BEFORE_BOOKING,
    QUALIFY_MIN_REVENUE,
    APIFY_ACTOR_ID,
    APIFY_TOKEN,
  };
}

// ─── Phase 2: Operational ──────────────────────────────────────────────────────
async function phase2(rl) {
  console.log('\n' + c.green('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(c.bold(c.green('  ZX LAB · ETAPA 5 (cont.) — Horários e WhatsApp')));
  console.log(c.green('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(c.dim('  (Enter para aceitar o valor padrão)\n'));

  // Fuso do seu negócio (nome IANA): America/Sao_Paulo, Europe/Lisbon, America/New_York...
  // Vale pra janela de envio, follow-ups, agenda do Google e modo automático.
  let TIMEZONE = '';
  while (!isValidTimezone(TIMEZONE)) {
    if (TIMEZONE) console.log(c.red(`  ✗ "${TIMEZONE}" não é um fuso válido. Exemplos: America/Sao_Paulo, Europe/Lisbon, America/New_York.`));
    TIMEZONE = (await askWithDefault(
      rl,
      'Fuso horário (ex.: America/Sao_Paulo, Europe/Lisbon)?',
      'America/Sao_Paulo'
    )).trim();
  }

  // País padrão dos telefones dos leads (código de 2 letras). Número escrito com "+"
  // (ex.: +351...) vale em qualquer país; este só decide como ler número sem "+".
  let DEFAULT_COUNTRY = '';
  while (!/^[A-Za-z]{2}$/.test(DEFAULT_COUNTRY)) {
    DEFAULT_COUNTRY = (await askWithDefault(
      rl,
      'País padrão dos telefones dos leads (2 letras: BR, PT, US...)?',
      'BR'
    )).trim();
  }
  DEFAULT_COUNTRY = DEFAULT_COUNTRY.toUpperCase();

  const WINDOW_START_HOUR = await askWithDefault(
    rl,
    'Hora início de envio?',
    '10'
  );

  const WINDOW_END_HOUR = await askWithDefault(
    rl,
    'Hora fim de envio?',
    '18'
  );

  const capAnswer = await askWithDefault(
    rl,
    `Máximo de leads novos por dia (até ${DAILY_NEW_CAP_MAX}; nas 2 primeiras semanas use no máximo 15)?`,
    '10'
  );
  const capNorm = normalizeDailyCap(capAnswer);
  const DAILY_NEW_CAP = capNorm.value;
  if (capNorm.limited) {
    console.log(c.yellow(`  ! ${capAnswer} passa do máximo seguro. Usando ${DAILY_NEW_CAP_MAX}: acima disso o número corre risco de restrição.`));
  }

  const INTERVAL_MIN_SECONDS = await askWithDefault(
    rl,
    'Intervalo mínimo entre mensagens (segundos)?',
    '120'
  );

  const INTERVAL_MAX_SECONDS = await askWithDefault(
    rl,
    'Intervalo máximo entre mensagens (segundos)?',
    '180'
  );

  console.log('\n' + c.bold('  — Evolution API (WhatsApp) —\n'));
  console.log(c.dim('  A Evolution API precisa estar rodando via Docker antes do primeiro disparo.'));
  console.log(c.dim('  Rode "docker compose up -d" na pasta dispatcher/ para iniciá-la.\n'));

  const EVOLUTION_API_URL = await askWithDefault(
    rl,
    'URL da Evolution API?',
    'http://localhost:8080'
  );

  let EVOLUTION_API_KEY = (await ask(
    rl,
    c.cyan('? ') + 'API key da Evolution API (Enter para gerar uma aleatória, recomendado): '
  )).trim();
  if (!EVOLUTION_API_KEY) {
    const kept = existingEnvValue('dispatcher/.env', 'EVOLUTION_API_KEY');
    if (kept && !evolutionKeyProblem(kept)) {
      EVOLUTION_API_KEY = kept;
      console.log(c.dim('  Mantida a chave que já está em dispatcher/.env (o WhatsApp conectado continua válido).'));
    } else {
      EVOLUTION_API_KEY = generateEvolutionKey();
      console.log(c.dim('  Chave gerada e gravada em dispatcher/.env. Você não precisa guardar.'));
    }
  }
  for (let problem = evolutionKeyProblem(EVOLUTION_API_KEY); problem; problem = evolutionKeyProblem(EVOLUTION_API_KEY)) {
    console.log(c.red(`  ✗ Essa chave ${problem}. Ela protege o envio de WhatsApp pelo seu número.`));
    EVOLUTION_API_KEY = (await ask(
      rl,
      c.cyan('? ') + 'Digite outra chave (24+ caracteres) ou Enter para gerar: '
    )).trim() || generateEvolutionKey();
  }

  const EVOLUTION_INSTANCE = await askWithDefault(
    rl,
    'Nome da instância WhatsApp?',
    'bdr-instance'
  );

  return {
    TIMEZONE,
    DEFAULT_COUNTRY,
    WINDOW_START_HOUR,
    WINDOW_END_HOUR,
    DAILY_NEW_CAP,
    INTERVAL_MIN_SECONDS,
    INTERVAL_MAX_SECONDS,
    EVOLUTION_API_URL: EVOLUTION_API_URL.trim().replace(/\/$/, ''),
    EVOLUTION_API_KEY: EVOLUTION_API_KEY.trim(),
    EVOLUTION_INSTANCE: EVOLUTION_INSTANCE.trim(),
  };
}

// ─── Phase 3: Follow-up templates ─────────────────────────────────────────────
async function phase3(rl) {
  console.log('\n' + c.green('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(c.bold(c.green('  ZX LAB · ETAPA 6 — Instalação: templates de follow-up')));
  console.log(c.green('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));

  console.log(c.dim(
    '  Templates genéricos para os toques 2-6 serão gerados automaticamente.\n' +
    '  Você poderá editá-los a qualquer momento em:\n' +
    '    pipeline/followup-templates.json\n'
  ));

  const answer = await ask(
    rl,
    c.cyan('? ') + 'Quer personalizar os templates de follow-up agora? (s/N) '
  );

  const customize = answer.trim().toLowerCase() === 's';
  if (!customize) {
    console.log(c.dim('  Templates padrão serão gerados.\n'));
  }
  return { customize };
}

// ─── File generators ───────────────────────────────────────────────────────────
function generateClaudeMd(vars) {
  const {
    AGENT_NAME, AGENT_SLUG, APIFY_ACTOR_ID, DAILY_NEW_CAP,
    PYTHON_CMD = 'python3',
    BUSINESS_TYPE = 'agencia', B2B_OFFER,
  } = vars;
  const isB2B = BUSINESS_TYPE === 'b2b';

  return `# Contexto do negócio (gerado pelo setup; fica fora do git)

Este arquivo é importado pelo CLAUDE.md do repositório. Ele guia o Claude Code ao trabalhar neste projeto.

## Project overview

This is the **BDR Agent** for ${AGENT_NAME} — an AI-assisted sales prospecting system. It automates the qualification of Apify-sourced leads, the generation of WhatsApp outreach copy, and a 6-touch follow-up cadence.

**Tipo de negócio:** ${isB2B ? `B2B — ${B2B_OFFER}. ICP, ranking do pool (\`pipeline/icp-config.json\`) e ângulos são específicos do nicho definido no setup.` : 'agência de marketing (setup validado: ângulos de criativo, site, LP, pipeline).'}

${AGENT_NAME} qualifies, calls, and closes personally. There is no separate closer.

## Operating mode

Two modes. The skill \`.claude/skills/bdr-${AGENT_SLUG}/SKILL.md\` covers both (seção 9 = condução da conversa).

**Padrão (manual).** The agent writes **touch 1** and the dispatcher fires **touches 2 to 6** (fixed templates). When a lead replies, ${AGENT_NAME} conducts the conversation from the **Prospecção Fria** tab in the CRM, optionally asking Claude Code for a suggested reply (skill section 9). The agent does not send anything on its own after a reply.

**Modo automático (opt-in, desligado por padrão — \`pipeline/auto-mode.json\`).** When ${AGENT_NAME} turns it on in the CRM, the dispatcher polls replies, filters auto-replies, and calls \`claude -p\` headless in this directory to decide the next step following skill section 9: reply and keep qualifying, **book the call directly** on Google Calendar (only real free slots, only with exact day and time confirmed), close politely, or hand off to ${AGENT_NAME}. In that mode, and only there, replying to leads and booking calls is expected behavior. See \`docs/modo-automatico.md\`.

In both modes the agent never quotes price, never sends proposals, never promises results, and hands off to ${AGENT_NAME} when in doubt.

## Pipeline overview

O pipeline tem 4 fases de enriquecimento + qualificação + disparo. Fase 0 e 1a são
terminal puro (sem browser). Fase 1b tem duas formas — script Playwright OU você
mesmo (Claude Code) navegando com seu próprio navegador — ver seção abaixo. Fase 2
é você. Stage 3 é o dispatcher. Nenhuma fase depende de outra ferramenta de IA.

| Stage | Where | Command |
|---|---|---|
| Fase 0: Build pool do dataset Apify | Terminal (Python) | \`${PYTHON_CMD} scripts/build-pool.py <dataset.json>\` |
| Fase 1a: Enriquecer site + Meta Ads (com token) | Terminal (Python) | \`${PYTHON_CMD} scripts/enrich-sites.py --n ${DAILY_NEW_CAP}\` |
| Fase 1b: Enriquecer Instagram + Meta Ads (sem token) | Terminal (Playwright) OU você mesmo, com seu navegador | \`${PYTHON_CMD} scripts/enrich-instagram.py\` — ver alternativa abaixo |
| Fase 2: Qualificar + gerar copies | Você | \`roda o pipeline\` |
| Stage 3: Disparar toques | Terminal (Node) | \`cd dispatcher && npm start\` |
| Marcar respondido | Você | Edição trivial de JSON |

## Fase 1b pelo seu navegador (alternativa ao script)

Quando ${AGENT_NAME} pedir pra enriquecer sem rodar o script Playwright (ou quando
\`pipeline/.meta_token\` não estiver configurado e for preciso checar a Biblioteca de
Anúncios da Meta): use seu próprio navegador, não peça pra rodar outro script.

1. Leia \`pipeline/site-enrichment-{data-de-hoje}.json\` (produzido pela Fase 1a).
2. Pra cada item pendente de enriquecimento (sem \`instagram.followers\` preenchido):
   - Se tiver \`ig_handle_from_site\`, abra \`instagram.com/<handle>/\` e leia
     seguidores, seguindo e bio na página (não precisa estar logado pra perfil
     público; se aparecer bloqueio de login, pule esse campo em vez de tentar
     contornar).
   - Abra \`facebook.com/ads/library/?active_status=active&ad_type=all&country=BR&q=<nome do lead>\`
     e leia se tem anúncio ativo ("Ativo"), a data de "Veiculação iniciada em" e
     quantos anúncios aparecem pra essa página. Sem login.
   - Enquanto estiver no site ou no Instagram do lead, repare se dá pra identificar
     **quem decide** (nome numa página "Quem somos", assinatura de bio, "Dra. Fulana" no
     título do Maps). Só preencha \`enrichment.decisor.instagram_url\` se o perfil for
     claramente pessoal — nunca a conta comercial da marca — e só se você tiver
     certeza de que é a mesma pessoa (cuidado com homônimo). Na dúvida, \`null\`.
3. Monte \`pipeline/enriched-leads-{data-de-hoje}.json\` no schema abaixo (mesmo
   formato que \`enrich-instagram.py\` produziria) e marque os leads processados
   como \`"status": "enriched"\` em \`pipeline/pool-prequalificados.json\`.
4. Campo que não deu pra confirmar fica \`null\` — nunca invente número, nome ou link.

\`\`\`json
{
  "lead_id": "...", "title": "...", "name": "...", "phone": "...",
  "category": "...", "address": "...", "totalScore": 4.8, "reviewsCount": 120,
  "website": "...",
  "enrichment": {
    "decisor": { "nome": "... ou null", "papel": "dono|sócio(a)|inferido|null", "instagram_url": "... ou null" },
    "instagram": { "handle": "...", "followers": 0, "posts": 0, "bio": "...", "last_post_recent": null, "engagement_signal": "low|medium|high|null" },
    "meta_ads": { "running": true, "creative_count": 1, "first_seen": "YYYY-MM-DD", "variation_signal": null },
    "website_signals": { "has_pixel": false, "has_ga4": false, "design_signal": "...", "has_segmented_lps": null }
  }
}
\`\`\`

Pra 10+ leads todo dia, o script Playwright (Opção A em \`docs/comandos-diarios.md\`)
continua mais rápido e não arrisca pedir login do Instagram de novo no meio do lote.
Pra lote pequeno ou quando não quiser instalar o Playwright, use seu navegador.

**Nota sobre Apify:** O plano gratuito da Apify limita automação via API. Datasets são obtidos via download manual do painel Apify (apify.com → Actors → seu ator → Last run → Export) e passados como argumento para \`build-pool.py\`.

## Directory layout

| Directory | Purpose |
|---|---|
| \`.claude/skills/bdr-${AGENT_SLUG}/\` | Core skill: ICP filter, angle selection, copy generation |
| \`pipeline/\` | Lead files (pool, enriched, queue, master, log, responses, templates) |
| \`scripts/\` | Python scripts: build-pool, enrich-sites, enrich-instagram, fill-meta-ads |
| \`dispatcher/\` | WhatsApp dispatcher with 120-180s interval cadence |

## Core skill: bdr-${AGENT_SLUG}

Trigger: \`/bdr-${AGENT_SLUG}\` or any task involving lead qualification or copy generation.

The skill at \`.claude/skills/bdr-${AGENT_SLUG}/SKILL.md\` is the single source of truth.

## Apify configuration

Actor ID: \`${APIFY_ACTOR_ID}\`

Para usar: baixe o dataset do último run no painel da Apify e rode:
\`\`\`
${PYTHON_CMD} scripts/build-pool.py pipeline/dataset-YYYY-MM-DD.json
\`\`\`

## Scripts

| Script | Fase | O que faz |
|---|---|---|
| \`scripts/build-pool.py <dataset.json>\` | Fase 0 | Normaliza phones, deduplica, calcula pre_score, appenda em pool-prequalificados.json |
| \`scripts/enrich-sites.py [--n 10]\` | Fase 1a | HTTP: pixel, GA4, handle IG, design signal + Meta Ads via API (se token configurado) |
| \`scripts/enrich-instagram.py [--login]\` | Fase 1b | Playwright: seguidores, bio, posts por handle. Produz enriched-leads-{date}.json |
| \`scripts/fill-meta-ads.py [--file ...]\` | Utilitário | Preenche meta_ads=null em enriched-leads existente via API |

**Setup do Instagram (primeira vez, só se for usar o script):**
\`\`\`
${PYTHON_CMD} scripts/enrich-instagram.py --login
\`\`\`
Abre browser Chromium para login manual. Salva sessão em \`scripts/.instagram-session.json\`. Só precisa fazer uma vez. Não precisa disso se for enriquecer pelo seu próprio navegador (seção "Fase 1b pelo seu navegador" acima).

**Token Meta Ads (opcional):**
Crie o arquivo \`pipeline/.meta_token\` com o conteúdo: \`APP_ID|APP_SECRET\`
Sem o token, Meta Ads fica null no script — mas você ainda pode conferir a Biblioteca de Anúncios (\`facebook.com/ads/library\`) pelo seu navegador, que é pública e não pede token nem login.

## Model usage

- Fase 2 (skill, copies, aprovação): use o modelo padrão da sua conta.
- Edições triviais de JSON (marcar respondido, mudar status): se quiser economizar, troque para um modelo mais leve com \`/model\`.
- O modelo do modo automático e do botão "Gerar sugestão" vem de \`CLAUDE_MODEL\` no \`dispatcher/.env\` (vazio = modelo padrão da conta). É o único lugar onde ele se escolhe.

## Pipeline files

| File | Written by | Read by | Purpose |
|---|---|---|---|
| \`pipeline/pool-prequalificados.json\` | build-pool.py | enrich-sites.py | Pool persistente de candidatos pré-qualificados |
| \`pipeline/site-enrichment-{date}.json\` | enrich-sites.py | enrich-instagram.py | Site + Meta Ads signals |
| \`pipeline/enriched-leads-{date}.json\` | enrich-instagram.py (ou você, pelo navegador) | Claude Code | Leads prontos para qualificação |
| \`pipeline/queue-{date}.json\` | Claude Code | Dispatcher | Approved touch 1 messages |
| \`pipeline/leads-master.json\` | Dispatcher + Claude Code | Both | Single source of truth for lead state |
| \`pipeline/followup-templates.json\` | Setup wizard | Dispatcher | Templates for touches 2–6 |
| \`pipeline/log-disparos.json\` | Dispatcher | — | Append-only send log |
| \`pipeline/responses.json\` | Dispatcher | Claude Code | Inbound messages from leads |
`;
}

function generateSkillMd(vars) {
  return vars.BUSINESS_TYPE === 'b2b' ? generateSkillMdB2B(vars) : generateSkillMdAgencia(vars);
}

// Setup validado de agência. Seções 1 a 8 (ICP, anti-fit, ângulos, tom, copy,
// ata, filtro, output) não mudam — só a descrição e o modo de operação foram
// atualizados pra não contradizer o modo automático, e a seção 9 virou
// condução da conversa + checklist anti-IA + limites.
function generateSkillMdAgencia(vars) {
  const {
    AGENT_NAME,
    AGENT_SLUG,
    AGENT_POSITIONING,
    AGENT_NUCLEAR_PHRASE,
    AGENT_WHAT_IS_NOT,
    AGENT_WHAT_IS,
    ICP_NICHE,
  } = vars;

  const whatIsNotBullets = csvToBullets(AGENT_WHAT_IS_NOT);
  const whatIsBullets    = csvToBullets(AGENT_WHAT_IS);

  return `---
name: bdr-${AGENT_SLUG}
description: Skill operacional do BDR de ${AGENT_NAME}. Use quando precisar gerar copy de prospecção outbound via WhatsApp, qualificar leads pelo ICP/anti-fit, ou identificar o ângulo de abordagem correto a partir de sinais da Apify. Também conduz a conversa depois que o lead responde, até a call de diagnóstico (sugestão na aba Prospecção Fria ou modo automático).
---

# BDR ${AGENT_NAME} — Skill operacional

## 0. Como esta skill é usada

Esta skill é consultada toda vez que o agente precisa **gerar uma copy de prospecção** ou **decidir se um lead vale entrar no pipeline**.

Fluxo padrão:

1. Apify entrega lead com sinais (bio, site, anúncios, tipo de operação).
2. O agente lê este SKILL.md.
3. Aplica filtro ICP/anti-fit (seções 2 e 3).
4. Identifica o gargalo principal pelos sinais (seção 4).
5. Escolhe o ângulo de abordagem da tabela (seção 4).
6. Escreve a copy seguindo a estrutura da seção 6 e o tom da seção 5.
7. Passa pelo filtro final da seção 7 antes de salvar.

Modo de operação: por padrão, o agente gera o **toque 1** e ${AGENT_NAME} conduz as respostas pela aba Prospecção Fria do CRM, pedindo sugestão quando quiser (seção 9). Com o **modo automático** ligado, o agente também conduz a conversa depois da resposta do lead, seguindo a seção 9, até agendar a call, encerrar ou passar pro humano.

---

## 1. Identidade — quem é ${AGENT_NAME}

**${AGENT_NAME}** é ${AGENT_POSITIONING}.

### O que NÃO é
${whatIsNotBullets}

### O que É
${whatIsBullets}

### Princípio nuclear
> **"${AGENT_NUCLEAR_PHRASE}"**

### Verdade central que guia toda copy
- Antes da execução vem a estrutura.
- Antes do criativo vem a estratégia.
- Antes da promessa vem o diagnóstico.

Qualquer copy que o agente gerar precisa transmitir essa ordem.

---

## 2. ICP — perfil ideal de lead

Nicho-alvo: **${ICP_NICHE}**

Marcar o lead como **fit** quando cumprir **pelo menos 4 dos 7 critérios** abaixo.

| # | Critério | Sinais observáveis |
|---|---|---|
| 1 | Já vende | Loja online ativa, ecommerce funcional, perfil comercial com produto/serviço claro, agendamentos públicos |
| 2 | Operação real | Endereço, equipe visível, conteúdo recorrente nos últimos 90 dias, presença em mais de um canal |
| 3 | Potencial de crescimento | Cresceu em seguidores nos últimos 6 meses, lançou novo produto, abriu nova unidade, começou a anunciar |
| 4 | Sente gargalo de comunicação ou aquisição | Criativos amadores ou antigos, anúncios ativos com pouca variação, site com tracking ausente, LP confusa |
| 5 | Produto validado | Avaliações reais, depoimentos de clientes, recompra, aparições em mídia |
| 6 | Decisor engajado | Dono ou sócio aparece publicamente, perfil pessoal ativo, responde mensagens, conteúdo autoral |
| 7 | Verba mínima provável | Já roda anúncios pagos, já contratou agência antes, tem equipe interna ou freelancer recorrente |

**Prioridade alta**: leads que cumprem critérios 4 + 6 simultaneamente (gargalo claro + decisor acessível) → \`priority: high\`

---

## 3. Anti-fit — descarte automático

Se **qualquer um** dos sinais abaixo for detectado → descartar, marcar como \`anti_fit\`, não gerar copy.

- Perfil sem qualquer produto/serviço identificável
- Conta inativa há mais de 90 dias
- Conteúdo apenas pessoal (não comercial)
- Discurso de "ganhos rápidos", "fórmula", "renda extra fácil"
- Negócio claramente abaixo da estrutura mínima (sem site, sem operação, perfil novo de poucas semanas)
- Concorrente direto (mesma área de atuação de ${AGENT_NAME})
- Empresa em segmento incompatível com o posicionamento (apostas, esquemas, MMN)
- Já é cliente atual ou ex-cliente
- **Estrutura digital já completa**: anúncios ativos com variação alta + LPs segmentadas + pixel + GA4 + social ativo com engajamento real — esse perfil precisa de otimização, não de estruturação. ${AGENT_NAME} constrói estrutura; não entra como consultor de stack já montado.

### Sinais ambíguos
Se o agente não conseguir confirmar nem fit nem anti-fit com confiança → marcar como \`needs_review\` e **não gerar copy** — ${AGENT_NAME} decide manualmente.

### Zona cinza: estrutura parcial vs. estrutura completa
O ICP ideal é **operação validada + digital fraco**. Leads com 1 ou 2 peças digitais no lugar (ex: só GA4, ou só anúncios sem LP) ainda são fit — o gargalo é real. O descarte por "estrutura completa" só se aplica quando **todos os quatro sinais estão presentes simultaneamente**: ads ativos com variação alta + LPs segmentadas + tracking instalado (pixel/GA4) + social ativo. Se faltar qualquer um desses quatro, o lead ainda tem gargalo abordável.

---

## 4. Tabela gargalo → ângulo de abordagem

A copy do toque 1 sempre **abre por uma observação específica do gargalo identificado**. O ângulo da observação determina qual produto está sendo implicitamente posicionado.

| Gargalo identificado | Sinais Apify | Ângulo da copy | Produto implícito |
|---|---|---|---|
| **Criativo amador** | Anúncios com baixa variação, criativos institucionais demais, ausência de hook nos primeiros 3s | Comunicação não acompanha o nível do produto | Sistema de criativos para crescimento |
| **Saturação criativa** | Mesmos formatos rodando há semanas, repetição de conceito | Atenção do público está saturando | Sistema de criativos (renovação) |
| **Posicionamento fraco** | Produto bom + percepção fraca, marca sem clareza de promessa | Apresentação não transmite o valor real | Estratégia + posicionamento |
| **Gargalo técnico de site** | Site lento, sem pixel, tracking ausente, design datado, sem mobile decente | Ambiente digital limita mensuração e conversão | Site novo / LP estratégica |
| **LP de conversão fraca** | Anúncios mandam pra Instagram ou home genérica, sem LP dedicada | Tráfego chega mas não tem pra onde converter | Landing page estratégica |
| **Pipeline desorganizado** | Atendimento por DM, sem CRM aparente, leads se perdendo nos comentários | Crescimento sem organização do pipeline | CRM / sistema de atendimento |
| **Falta de previsibilidade** | Vende mas não rastreia, tomada de decisão por achismo | Não sabe o que funciona, decide no escuro | Estrutura completa (sistema) |

### Como o agente escolhe o ângulo

1. Lê os sinais do lead.
2. Identifica o gargalo **mais visível** — não tentar cobrir múltiplos numa só copy.
3. Se houver mais de um gargalo evidente, escolhe o que tem **maior potencial de gerar identificação imediata**.
4. Marca o gargalo escolhido no campo \`angle\` do lead.

> ⚠️ Esta tabela foi gerada com os ângulos padrão do kit. **Personalize em \`.claude/skills/bdr-${AGENT_SLUG}/SKILL.md\`** para mapear os gargalos reais do seu nicho (${ICP_NICHE}) aos produtos que você oferece.

---

## 5. Tom de voz

### Características obrigatórias
- **Direto** — vai ao ponto em até 4 linhas
- **Estratégico** — fala de problema estrutural, não sintoma
- **Claro** — zero jargão, zero buzzword vazia
- **Analítico** — observação fundamentada, não palpite

### Estrutura mental por trás de cada copy
1. Quebra de expectativa ou dor verbalizada
2. Problema estrutural (não sintoma)
3. Permissão para mostrar clareza
4. CTA implícito ou explícito

Padrões de frase que funcionam:
- "O problema não é X. É Y."
- "Você não precisa de mais X. Precisa de Y."
- "Antes de [executar], precisa [estruturar]."
- "Notei [observação]. Geralmente isso indica [problema estrutural]."

### Linguagem permitida (usar com frequência)
clareza · processo · estrutura · teste · decisão · aprendizado · diagnóstico · gargalo · organização · sistema · ativo · validação · consistência

### Linguagem proibida
viral · explodir · hack · segredo · fórmula · garantido · milagre · explosão · revolucionar · 10x · escala absurda · resultado garantido · método infalível

### Postura proibida
- Carente ("você teria 5 minutinhos?")
- Apelativa ("imperdível")
- Vendedora agressiva ("vagas limitadas")
- Genérica ("vi seu perfil e adorei")
- Bajulação vazia ("seu trabalho é incrível", "amei tudo", "ficou perfeito")

### Reconhecimento legítimo é obrigatório
Toda copy abre validando algo **factual e específico** do lead antes de apontar o gargalo. Reconhecimento legítimo é diferente de bajulação:

- ✅ Legítimo: "Os projetos têm alto nível, parabéns" (observação factual de um portfólio bom)
- ✅ Legítimo: "Operação consistente, produto que roda há 3 anos" (fato observável)
- ✅ Legítimo: "Reparei que você anuncia, o que é ótimo" (validação de movimento real)
- ❌ Bajulação: "Adorei seu perfil" (vago, não-factual)
- ❌ Bajulação: "Seu trabalho é maravilhoso" (genérico, não-específico)

A função do reconhecimento é **legitimar a observação que vem depois**. Sem ele, a crítica soa gratuita.

---

## 6. Estrutura da copy do toque 1 (WhatsApp)

### Regras de formato
- **Máximo 4 linhas curtas** ou ~60 palavras
- Sem saudação cerimoniosa ("Olá, espero que esteja bem")
- **Obrigatório**: apresentar-se como "${AGENT_NAME}, [seu posicionamento curto]" na abertura — o lead não sabe quem está mandando
- Tom de mensagem real entre profissionais, não de robô
- Uma única pergunta no fim, com permissão clara

### Template estrutural (4 blocos)
\`\`\`
[1. Abertura: Oi, [nome]. Sou ${AGENT_NAME}, [posicionamento]. + reconhecimento legítimo do que está bom]
[2. Pivô: "mas" / "porém" + observação específica do gargalo]
[3. Implicação curta: o que esse gargalo causa estruturalmente]
[4. CTA explícito: convite para ligação curta de diagnóstico]
\`\`\`

### CTA padrão — sempre ligação

A call to action no toque 1 é **sempre uma ligação curta**, nunca "posso te mostrar aqui", "te mando no direct" ou "te explico por mensagem". A ligação é o ativo que o BDR está vendendo.

Padrões válidos de CTA:
- "Podemos marcar uma ligação pra eu te apontar isso melhor?"
- "Podemos marcar uma ligação onde eu explico onde isso afeta sua conversão?"
- "Podemos marcar uma ligação curta pra eu te mostrar o impacto disso?"
- "Faz sentido a gente marcar uma ligação rápida pra eu detalhar?"

Padrões a evitar:
- "Posso te mostrar?" (vago, não compromete)
- "Te mando aqui mesmo?" (desvia da ligação)
- "Tem 15 minutos pra uma reunião?" (palavra "reunião" pesa demais no toque 1)

### Princípio crítico — não entregar o diagnóstico na copy

A copy **não detalha** os pontos específicos identificados. Detalhar destrói o motivo da ligação — o lead pensa "ah, basta arrumar isso" e some.

A copy deve:
- Reconhecer o que está bem (factual)
- Sinalizar a **categoria do gargalo** (criativos, posicionamento, atendimento, ambiente digital)
- Indicar que existem **pontos específicos** identificados
- Reservar os pontos detalhados para a ligação

Os detalhes específicos vão para a **Ata interna** (ver seção 6.5), não para a copy.

### Variáveis dinâmicas obrigatórias
- \`[nome]\` — primeiro nome do contato
- \`[marca]\` — nome do negócio (quando público) ou referência neutra ("o seu negócio")
- A observação central deve sinalizar **categoria de gargalo específica**, mas sem detalhar os pontos

---

## 6.5. Ata interna — preparação para a ligação

Para **cada lead com copy gerada**, o agente também produz uma ata estruturada no campo \`crm_notes\`. A ata **nunca vai pro lead** — é briefing de ${AGENT_NAME} pra ligação, e é o que aparece no painel do CRM quando ${AGENT_NAME} abre o lead antes de ligar.

### Campos de \`crm_notes\`

| Campo | Conteúdo |
|---|---|
| \`angle\` | O mesmo ângulo escolhido (repetido aqui pro painel) |
| \`decisor_nome\` | Nome de quem decide, se identificado — ver regra abaixo. Sem confiança: \`null\` |
| \`decisor_papel\` | \`"dono"\`, \`"sócio(a)"\`, \`"responsável técnica"\`, \`"inferido"\` ou \`null\` |
| \`decisor_instagram\` | URL do perfil **pessoal** do Instagram do decisor, se localizado. Sem match confiável: \`null\` |
| \`sinais_observados\` | Bullets, string com quebra de linha: \`"- fato 1\\n- fato 2"\` |
| \`pontos_de_melhoria\` | Bullets — descritivo, não prescritivo |
| \`direcao_sugerida\` | Bullets — onde explorar na call, com pelo menos 1 ponto reservado pra **não revelar antes dela** |

### Decisor: nome e Instagram, sempre que possível

Antes de deixar \`null\`, confira nesta ordem:
1. **\`enrichment.decisor\`** no lead enriquecido — se \`nome\` e \`instagram_url\` já vieram preenchidos, use exatamente isso.
2. **Bio ou título do Google Maps** — nomes do tipo "Dra. Fulana de Tal" costumam aparecer ali. Preencha \`decisor_nome\`, mas só preencha \`decisor_instagram\` se o mesmo perfil (o da conta comercial já enriquecida) for claramente pessoal, não um perfil genérico da marca.
3. **A própria conversa** — se o lead se apresentou pelo nome, ou alguém (recepção, outro contato) indicou quem decide, use isso mesmo que o enriquecimento não tenha achado nada.

**Nunca invente nome nem link de perfil, e nunca monte uma URL de Instagram chutando o handle.** Um perfil errado atinge a pessoa errada — pior que não ter nada. Sem certeza de que é a mesma pessoa (cuidado com homônimo), os dois campos ficam \`null\`. Isso não é falha, é honestidade — a maioria dos leads vai ficar assim mesmo, e está certo.

### Regras da ata

1. **Factual sobre observado, hipotético sobre causa.** "5 de 6 anúncios são fotos de produto" é fato. "Isso reduz performance em 40%" é hipótese — não afirmar.
2. **Não inventar dados.** Se a Apify não trouxe, a ata não inclui. Se algo é inferência, marcar como "(inferência)".
3. **Direção pra ligação não é roteiro.** A ata sugere onde explorar, não o que dizer.
4. **Reservar munição.** Sempre listar pelo menos 1 ponto que se recomenda **não revelar antes da ligação**.
5. **Idioma e tom.** Ata é interna — pode usar jargão técnico (CPL, CPA, ROAS, pixel, GTM). Linguagem direta, em bullets, sem floreio.

---

## 7. Restrições e filtro final

### Restrições absolutas (nunca violar)

- ❌ Nunca prometer resultado financeiro ("vai te dar X% de retorno")
- ❌ Nunca garantir performance ("garanto que isso funciona")
- ❌ Nunca entregar o método completo na mensagem ("é só fazer A, B e C")
- ❌ Nunca usar urgência falsa ("só hoje", "última vaga")
- ❌ Nunca rebater objeção diretamente — sempre validar e redirecionar
- ❌ Nunca prometer reunião gratuita como isca — a reunião é diagnóstico, não brinde

### Filtro final — antes de salvar a copy

**Check 1 — Reforço estrutural**
> "Essa copy reforça que ${AGENT_NAME} organiza antes de produzir?"
Se não reforçar, reescrever.

**Check 2 — Especificidade**
> "Essa observação poderia ser copiada e colada para qualquer outro lead?"
Se sim, está genérica demais. Reescrever com observação específica.

**Check 3 — Tom**
> "Essa mensagem soa como um estrategista falando com um decisor, ou como um vendedor pedindo atenção?"
Se soar como vendedor, reescrever com mais segurança e menos pedido.

**Check 4 — Reconhecimento legítimo presente**
> "A copy abre validando algo factual e específico do lead antes de apontar o gargalo?"
Se a primeira frase já é crítica/observação negativa, reescrever incluindo reconhecimento real.

**Check 5 — CTA é ligação**
> "O CTA convida explicitamente para uma ligação?"
Se o CTA é "te mostro aqui", "te mando no direct" ou similar, reescrever com convite direto à ligação.

**Check 6 — Diagnóstico não foi entregue**
> "A copy revelou os pontos específicos identificados, ou apenas sinalizou a categoria do gargalo?"
Se a copy detalha o problema específico, reescrever movendo os detalhes para a ata.

**Check 7 — Ata foi gerada**
> "Existe \`crm_notes\` com sinais observados, pontos de melhoria e direção pra ligação — e o decisor foi checado (nome/Instagram preenchidos ou conscientemente deixados \`null\`)?"
Se não há ata, gerar antes de finalizar o lead.

### Quando NÃO gerar copy
- Lead marcado como \`anti_fit\`
- Lead marcado como \`needs_review\`
- Sinais insuficientes para escolher um ângulo (sem dados visíveis sobre comunicação ou operação)
- Telefone ausente ou inválido
- Lead duplicado no pipeline (já abordado nos últimos 90 dias)

Nesses casos, marcar status como \`skipped\` com motivo registrado.

---

## 8. Output esperado por lead

\`\`\`json
{
  "lead_id": "...",
  "nome": "...",
  "marca": "...",
  "telefone": "...",
  "fit_score": 5,
  "fit_status": "fit | anti_fit | needs_review",
  "angle": "criativo_amador | saturacao | posicionamento | tecnico_site | lp_fraca | pipeline | previsibilidade",
  "priority": "high | normal",
  "copy": "Oi, [nome]. ...",
  "checks": {
    "reforco_estrutural": true,
    "especificidade": true,
    "tom": true,
    "reconhecimento_legitimo": true,
    "cta_ligacao": true,
    "diagnostico_nao_entregue": true,
    "ata_gerada": true
  },
  "observacao_origem": "frase específica do que foi observado no perfil que justifica o ângulo escolhido",
  "crm_notes": {
    "angle": "criativo_amador",
    "decisor_nome": "Marina ou null",
    "decisor_papel": "dono | sócio(a) | responsável técnica | inferido | null",
    "decisor_instagram": "https://instagram.com/handle ou null",
    "sinais_observados": "- fato 1\\n- fato 2",
    "pontos_de_melhoria": "- ponto 1\\n- ponto 2",
    "direcao_sugerida": "- o que explorar\\n- o que NÃO revelar antes da call"
  },
  "status": "copy_gerada | skipped | anti_fit | needs_review"
}
\`\`\`

Esse objeto vai pro pipeline aguardando aprovação manual de ${AGENT_NAME}. Só copies com \`status: copy_gerada\` e todos os checks \`true\` entram na fila de aprovação.

---

${skillConversationSection(vars, 'agencia')}
${skillAntiAiSection()}
${skillLimitsSection()}`;
}

// ─── Skill B2B (qualquer negócio B2B que não seja agência de marketing) ───────
function splitList(str, sep) {
  if (Array.isArray(str)) return str.map((s) => String(s ?? '').trim()).filter(Boolean);
  return String(str || '').split(sep).map((s) => s.trim()).filter(Boolean);
}

const asText = (v) => (v == null ? '' : String(v).trim());

// Briefing B2B. Aceita o formato curto (strings separadas por ";" e ",") e o
// completo (arrays de objetos) que a instalação guiada grava depois de
// entrevistar o usuário sobre o nicho. Campo vazio vira lacuna declarada,
// nunca texto genérico fingindo ser do nicho.
function normalizeB2B(vars) {
  const pains = (Array.isArray(vars.B2B_PAINS) ? vars.B2B_PAINS : splitList(vars.B2B_PAINS, ';'))
    .map((p) => (typeof p === 'string'
      ? { nome: p.trim(), fala: '', sinal: '', custo: '' }
      : {
          nome: asText(p.nome || p.dor),
          fala: asText(p.como_o_cliente_fala || p.fala),
          sinal: asText(p.sinal_publico || p.sinal),
          custo: asText(p.custo || p.impacto),
        }))
    .filter((p) => p.nome);
  const objections = (Array.isArray(vars.B2B_OBJECTIONS) ? vars.B2B_OBJECTIONS : splitList(vars.B2B_OBJECTIONS, ';'))
    .map((o) => (typeof o === 'string'
      ? { objecao: o.trim(), resposta: '' }
      : { objecao: asText(o.objecao), resposta: asText(o.resposta) }))
    .filter((o) => o.objecao);

  const b = {
    offer: asText(vars.B2B_OFFER),
    result: asText(vars.B2B_RESULT),
    targets: splitList(vars.B2B_TARGET_CATEGORIES, ','),
    excludes: splitList(vars.B2B_EXCLUDE_CATEGORIES, ','),
    minSize: asText(vars.B2B_MIN_SIZE),
    decisor: asText(vars.B2B_DECISOR),
    influencers: asText(vars.B2B_INFLUENCERS),
    pains,
    objections,
    questions: splitList(vars.B2B_QUALIFY_QUESTIONS, ';'),
    disqualifiers: splitList(vars.B2B_DISQUALIFIERS, ';'),
    proof: asText(vars.B2B_PROOF),
    call: asText(vars.B2B_CALL),
  };
  const noSignal = b.pains.filter((p) => !p.sinal).map((p) => p.nome);
  const noAnswer = b.objections.filter((o) => !o.resposta).map((o) => o.objecao);
  b.gaps = [
    !b.result && { label: 'o que o cliente ganha com a oferta', field: 'B2B_RESULT' },
    !b.minSize && { label: 'porte mínimo do cliente', field: 'B2B_MIN_SIZE' },
    noSignal.length && { label: `sinal público das dores: ${noSignal.join(', ')}`, field: 'B2B_PAINS[].sinal_publico' },
    !b.questions.length && { label: 'perguntas de qualificação', field: 'B2B_QUALIFY_QUESTIONS' },
    !b.objections.length && { label: 'objeções que mais aparecem', field: 'B2B_OBJECTIONS' },
    noAnswer.length && { label: `como responder a: ${noAnswer.join(', ')}`, field: 'B2B_OBJECTIONS[].resposta' },
    !b.proof && { label: 'prova ou caso real que pode ser citado', field: 'B2B_PROOF' },
    !b.call && { label: 'como é a call de diagnóstico', field: 'B2B_CALL' },
  ].filter(Boolean);
  return b;
}

function generateSkillMdB2B(vars) {
  const {
    AGENT_NAME, AGENT_SLUG, AGENT_POSITIONING, AGENT_NUCLEAR_PHRASE,
    AGENT_WHAT_IS_NOT, AGENT_WHAT_IS, ICP_NICHE,
    B2B_OFFER, B2B_TARGET_CATEGORIES, B2B_EXCLUDE_CATEGORIES, B2B_PAINS, B2B_DECISOR,
  } = vars;

  const whatIsNotBullets = csvToBullets(AGENT_WHAT_IS_NOT);
  const whatIsBullets    = csvToBullets(AGENT_WHAT_IS);
  const brief    = normalizeB2B(vars);
  const targets  = brief.targets;
  const excludes = brief.excludes;
  const pains    = brief.pains;
  const angleIds = pains.map((_, i) => `dor_${i + 1}`);
  const cell = (s) => String(s).replace(/\|/g, '/').replace(/\n+/g, ' ');

  const painRows = pains.map((p, i) =>
    `| **dor_${i + 1}: ${cell(p.nome)}** | ${p.fala ? `"${cell(p.fala)}"` : '(não informado)'} | ${p.sinal ? cell(p.sinal) : 'Nenhum sinal público informado no briefing: use só como hipótese do segmento, marcada "(inferência)"'} | ${p.custo ? `Abrir pelo que isso custa: ${cell(p.custo)}` : `Abrir pelo custo, risco ou tempo perdido com "${cell(p.nome)}"`}, sem entregar o diagnóstico |`
  ).join('\n');

  const gapsSection = brief.gaps.length ? `
### Lacunas do briefing

O briefing de instalação não cobriu estes pontos:
${brief.gaps.map((g) => `- ${g.label}`).join('\n')}

**Onde há lacuna, não preencha com suposição.** Não invente sinal, número, caso, cliente ou resposta a objeção. Na copy, fique no que está no briefing e nos dados do lead. Na conversa, faça uma pergunta ou passe pro humano. ${AGENT_NAME} pode completar estes pontos editando esta skill (veja \`docs/personalizando-skill.md\`).
` : `
Briefing completo: todos os pontos da instalação guiada foram respondidos por ${AGENT_NAME}. Mesmo assim, nada fora daqui vira fato na copy.
`;

  return `---
name: bdr-${AGENT_SLUG}
description: Skill operacional do BDR B2B de ${AGENT_NAME} (${B2B_OFFER}). Use pra qualificar leads B2B pelo ICP/anti-fit, escolher o ângulo pela dor observada, escrever a copy do toque 1 no WhatsApp e conduzir a conversa depois que o lead responde, até a call de diagnóstico (sugestão na aba Prospecção Fria ou modo automático).
---

# BDR ${AGENT_NAME} — Skill operacional (B2B)

## 0. Como esta skill é usada

Consultada toda vez que o agente precisa **decidir se um lead entra no pipeline**, **escrever a copy do toque 1** ou **responder um lead que respondeu**.

Fluxo do toque 1:

1. O lead chega da Apify com sinais (categoria, site, avaliações, porte aparente).
2. Aplica o filtro ICP/anti-fit (seções 2 e 3).
3. Identifica qual dor da seção 4 tem indício mais forte.
4. Escreve a copy (seção 6) no tom da seção 5 e passa pelo checklist anti-IA (seção 10).
5. Filtro final (seção 7) antes de salvar.

Modo de operação: por padrão, o agente gera o **toque 1** e ${AGENT_NAME} conduz as respostas pela aba Prospecção Fria do CRM, pedindo sugestão quando quiser (seção 9). Com o **modo automático** ligado, o agente também conduz a conversa depois da resposta do lead, seguindo a seção 9, até agendar a call, encerrar ou passar pro humano.

**De onde vem o conteúdo desta skill:** do briefing que ${AGENT_NAME} respondeu na instalação (oferta, clientes, dores, sinais, objeções, perguntas). É a única fonte sobre o nicho. O que não está aqui nem nos dados do lead não existe pra efeito de copy.
${gapsSection}
---

## 1. Identidade — quem é ${AGENT_NAME}

**${AGENT_NAME}** é ${AGENT_POSITIONING}.

**O que vende:** ${B2B_OFFER}
${brief.result ? `\n**O que o cliente ganha** (palavras de ${AGENT_NAME}): ${brief.result}\n` : ''}
### Prova que pode citar
${brief.proof ? `${brief.proof}\n\nCite só isso, do jeito que está. Não arredonde número nem generalize ("vários clientes").` : `Nenhuma informada no briefing. **Não cite caso, cliente, número nem tempo de mercado.** O reconhecimento vem do lead, não de ${AGENT_NAME}.`}

### O que NÃO é
${whatIsNotBullets}

### O que É
${whatIsBullets}

### Princípio nuclear
> **"${AGENT_NUCLEAR_PHRASE}"**

---

## 2. ICP — perfil ideal de lead (B2B)

Nicho-alvo: **${ICP_NICHE}**
Segmentos-alvo (categorias do Google Maps): **${targets.join(', ')}**
Quem decide a compra: **${B2B_DECISOR}**${brief.influencers ? `\nQuem influencia: ${brief.influencers}` : ''}${brief.minSize ? `\nPorte mínimo (briefing): ${brief.minSize}` : ''}

Lead é **fit** quando cumpre **pelo menos 4 dos 7 critérios**:

| # | Critério | Sinais observáveis |
|---|---|---|
| 1 | Segmento certo | Categoria do Google Maps ou descrição do site bate com os segmentos-alvo |
| 2 | Empresa ativa | Endereço, horário de funcionamento, avaliações recentes, site no ar |
| 3 | Porte compatível | ${brief.minSize ? `Sinal público de que atinge o porte mínimo (${cell(brief.minSize)}): unidades, equipe visível, volume de avaliações. Sem sinal, o critério não conta` : 'Site próprio, mais de uma unidade, equipe visível, volume de avaliações acima da média do segmento'} |
| 4 | Indício da dor | Algum sinal público ligado a uma dor da seção 4. Se for dedução, marcar como "(inferência)" |
| 5 | Decisor alcançável | ${B2B_DECISOR} identificável no site ou no Google, ou WhatsApp da empresa atendido por gente |
| 6 | Momento | Expansão, vaga aberta, nova unidade, mudança de endereço, linha de produto nova |
| 7 | Capacidade de investir | Porte somado a estrutura mínima: site, e-mail corporativo, presença ativa |

**Prioridade alta**: critérios 4 + 5 juntos (dor com indício + decisor alcançável) → \`priority: high\`

---

## 3. Anti-fit — descarte automático

Qualquer um destes → \`anti_fit\`, sem copy:

- Concorrente direto (vende o mesmo que ${AGENT_NAME})${excludes.length ? `\n- Categoria excluída no setup: ${excludes.join(', ')}` : ''}${brief.disqualifiers.map((d) => `\n- ${d} (briefing)`).join('')}
- Empresa fechada: sem avaliação recente, site fora do ar e nenhum outro sinal de atividade
- Porte claramente abaixo do mínimo pra oferta (ex: operação de uma pessoa só quando a oferta pede estrutura)
- Já é cliente ou ex-cliente
- Segmento incompatível com o posicionamento (apostas, esquemas, MMN)

Não dá pra confirmar fit nem anti-fit com segurança → \`needs_review\`, sem copy. ${AGENT_NAME} decide.

---

## 4. Tabela dor → ângulo de abordagem

A copy do toque 1 abre por **uma** dor com indício observável. Nunca por dor inventada.

| Dor | Como o cliente fala | Sinal público que indica | Ângulo da copy |
|---|---|---|---|
${painRows}

A segunda coluna serve pra **nomear a dor do jeito que o cliente nomeia** ("nunca sobra dinheiro" soa mais real que "gestão de fluxo de caixa"). Nunca atribua a frase ao lead ("você deve sentir que..."): ele não disse isso.

### Sinais genéricos de B2B (complementam os do briefing, não substituem)

- Avaliação no Google reclamando de atraso, erro, demora pra responder ou entrega → processo travado
- Vaga aberta (financeiro, fiscal, comercial, operação) → crescimento ou gargalo interno
- Filial nova, galpão, linha de produto, mudança de endereço → momento de mudança
- Site desatualizado (ano antigo no rodapé, catálogo parado) → estrutura enxuta, dono sobrecarregado
- Muito tempo de mercado com o mesmo jeito de operar → processo que ninguém revisa há anos

### Como escolher

1. Leia os sinais do lead.
2. Escolha a dor com o indício **mais concreto**. Uma só por copy.
3. Sem sinal direto de nenhuma dor, mas o lead é do segmento certo: use a dor mais comum do segmento **como hipótese**. A copy fala do segmento ("em ${(targets[0] || 'empresa do seu segmento').toLowerCase()} é comum..."), nunca afirma que a empresa tem o problema, e a ata marca "(inferência)". Nesse caso o critério 4 do ICP não conta.
4. Segmento incerto e nenhum sinal → \`needs_review\`. Não chute.
5. Registre o id escolhido no campo \`angle\` (${angleIds.join(', ')}).

---

## 5. Tom de voz (B2B)

- **Direto e profissional, sem formalidade de e-mail.** Conversa entre gestores, não vendedor pedindo atenção.
- **Fala do problema de negócio**: custo, risco, prazo, margem, tempo do dono. Nunca de "solução".
- **Específico**: a observação só serve pra esse lead. Se servir pra qualquer empresa, está genérica.

Linguagem que funciona: custo, risco, margem, prazo, processo, gargalo, diagnóstico, controle, previsibilidade, decisão.

Linguagem proibida: solução completa, revolucionar, alavancar, potencializar, parceria de sucesso, sinergia, otimizar processos (genérico), garantido, 10x, resultado garantido.

Postura proibida: carente ("teria 5 minutinhos?"), apelativa, vendedora agressiva ("condição especial só hoje"), genérica ("vi a empresa de vocês e adorei"), bajulação vazia.

### Reconhecimento legítimo é obrigatório
Toda copy abre validando algo **factual** do lead antes de apontar a dor: tempo de mercado, avaliação, nova unidade, porte. Sem isso, a crítica soa gratuita.

---

## 6. Estrutura da copy do toque 1 (WhatsApp)

### Regras de formato
- **Máximo 4 linhas curtas** ou ~60 palavras
- Sem saudação cerimoniosa ("Olá, espero que esteja bem")
- **Obrigatório**: apresentar-se como "${AGENT_NAME}, [o que faz em poucas palavras]" na abertura
- Uma única pergunta no fim, pedindo a ligação

### Template (4 blocos)
\`\`\`
[1. Oi, [nome]. Sou ${AGENT_NAME}, [o que faz]. + reconhecimento factual do lead]
[2. Pivô: sinal específico ligado a uma dor da seção 4]
[3. Implicação curta em custo, risco ou tempo (sem número inventado)]
[4. CTA: convite pra uma ligação curta de diagnóstico]
\`\`\`

### CTA padrão: sempre ligação curta
- "Faz sentido uma ligação de 10 minutos pra eu te mostrar o que vi?"
- "Consegue uma ligação rápida essa semana pra eu detalhar?"

Evitar: "posso te explicar por aqui?", "te mando um material?", "podemos agendar uma reunião?" (reunião pesa no toque 1).

### Não entregar o diagnóstico
A copy sinaliza **a categoria da dor** e que existem pontos específicos. Os detalhes ficam na ata (seção 6.5) e vão pra ligação. Detalhar no chat destrói o motivo da call.

### Variáveis
- \`[nome]\` — primeiro nome do contato (se não souber, use o nome da empresa, nunca invente pessoa)
- \`[empresa]\` — nome da empresa

---

## 6.5. Ata interna — preparação para a ligação

Pra cada lead com copy, gere a ata no campo \`crm_notes\`. **Nunca vai pro lead** — é o que aparece no painel do CRM quando ${AGENT_NAME} abre o lead antes de ligar.

### Campos de \`crm_notes\`

| Campo | Conteúdo |
|---|---|
| \`angle\` | O id da dor escolhida (repetido aqui pro painel) |
| \`decisor_nome\` | Nome de ${B2B_DECISOR}, se identificado — ver regra abaixo. Sem confiança: \`null\` |
| \`decisor_papel\` | \`"dono"\`, \`"sócio(a)"\`, \`"${B2B_DECISOR}"\`, \`"inferido"\` ou \`null\` |
| \`decisor_instagram\` | URL do perfil **pessoal** do Instagram dele, se localizado. Sem match confiável: \`null\` |
| \`sinais_observados\` | Bullets, string com quebra de linha: \`"- fato 1\\n- fato 2"\` |
| \`pontos_de_melhoria\` | A dor provável e por quê — a dor da seção 4 + o sinal que sustenta, marcando inferência |
| \`direcao_sugerida\` | Bullets — o que explorar na call e o que NÃO entregar de bandeja |

### Decisor: nome e Instagram, sempre que possível

Antes de deixar \`null\`, confira nesta ordem:
1. **\`enrichment.decisor\`** no lead enriquecido — se \`nome\` e \`instagram_url\` já vieram preenchidos, use exatamente isso.
2. **Site ou perfil da empresa** — nome do responsável costuma aparecer em "Quem somos", rodapé ou bio. Preencha \`decisor_nome\`, mas só preencha \`decisor_instagram\` se o perfil for claramente pessoal, não uma conta genérica da empresa.
3. **A própria conversa** — se o lead se apresentou pelo nome, ou indicou quem decide, use isso mesmo que o enriquecimento não tenha achado nada.

**Nunca invente nome nem link de perfil, e nunca monte uma URL de Instagram chutando o handle.** Sem certeza de que é a mesma pessoa (cuidado com homônimo), os dois campos ficam \`null\` — a maioria dos leads B2B vai ficar assim (Instagram pesa menos que no consumidor final), e está certo.

Regras: fato é fato, inferência é marcada como "(inferência)", nada inventado, pelo menos 1 ponto reservado pra ligação.

---

## 7. Restrições e filtro final

### Nunca
- Prometer resultado financeiro ou número ("vai economizar 30%")
- Passar preço ou condição no chat
- Entregar o método completo na mensagem
- Usar urgência falsa
- Rebater objeção de frente (valida e redireciona)

### Filtro antes de salvar a copy
1. **Específica?** Dava pra mandar a mesma copy pra outra empresa? Se sim, reescreva.
2. **Problema do lead?** Fala da dor dele ou da oferta de ${AGENT_NAME}? Tem que ser a dor dele.
3. **Tom de gestor pra gestor?** Ou de vendedor pedindo atenção?
4. **Reconhecimento factual presente** antes da dor?
5. **CTA é ligação curta?**
6. **Diagnóstico guardado?** A copy sinaliza a categoria, não detalha.
7. **Ata (\`crm_notes\`) gerada, com o decisor checado?**
8. **Passou no checklist anti-IA (seção 10)?**

### Quando NÃO gerar copy
\`anti_fit\`, \`needs_review\`, sinais insuficientes pra escolher uma dor, telefone ausente ou inválido, lead já abordado.

---

## 8. Output esperado por lead

\`\`\`json
{
  "lead_id": "...",
  "nome": "...",
  "marca": "...",
  "telefone": "...",
  "fit_score": 5,
  "fit_status": "fit | anti_fit | needs_review",
  "angle": "${angleIds.join(' | ')}",
  "priority": "high | normal",
  "copy": "Oi, [nome]. ...",
  "checks": {
    "especifica": true,
    "problema_do_lead": true,
    "tom": true,
    "reconhecimento_legitimo": true,
    "cta_ligacao": true,
    "diagnostico_nao_entregue": true,
    "ata_gerada": true,
    "anti_ia": true
  },
  "observacao_origem": "sinal concreto que justifica a dor escolhida",
  "crm_notes": {
    "angle": "dor_1",
    "decisor_nome": "Marina ou null",
    "decisor_papel": "dono | sócio(a) | ${B2B_DECISOR} | inferido | null",
    "decisor_instagram": "https://instagram.com/handle ou null",
    "sinais_observados": "- fato 1\\n- fato 2",
    "pontos_de_melhoria": "- dor provável e por quê, com a inferência marcada",
    "direcao_sugerida": "- o que explorar\\n- o que NÃO revelar antes da call"
  },
  "status": "copy_gerada | skipped | anti_fit | needs_review"
}
\`\`\`

Só \`status: copy_gerada\` com todos os checks \`true\` vai pra fila de aprovação de ${AGENT_NAME}.

---

${skillConversationSection(vars, 'b2b')}
${skillAntiAiSection()}
${skillLimitsSection()}`;
}

// ─── Seções compartilhadas (agência e B2B) ────────────────────────────────────
function skillConversationSection(vars, kind) {
  const { AGENT_NAME, B2B_DECISOR } = vars;
  const b2b = kind === 'b2b';
  const decisor = b2b ? (B2B_DECISOR || 'quem decide') : 'quem decide';
  const brief = b2b ? normalizeB2B(vars) : null;
  const segmento = b2b ? (brief.targets[0] || 'empresa do seu segmento').toLowerCase() : '';
  const dor      = b2b ? (brief.pains[0]?.nome || 'esse tipo de problema').toLowerCase() : '';

  const objecaoExemplo = b2b
    ? (brief.objections.length
        ? brief.objections.slice(0, 2).map((o) => `"${o.objecao}"`).join(', ')
        : '"já tenho quem faça isso", "tá tudo certo aqui"')
    : '"já tenho agência", "já tentei e não deu certo"';

  const perguntas = b2b
    ? (brief.questions.length
        ? brief.questions.map((q) => `- "${q}" (briefing)`).join('\n')
        : `- "Hoje quem cuida disso aí, alguém interno ou terceirizado?"
- "Isso já deu dor de cabeça esse ano ou tá sob controle?"
- "Além de você, quem participa dessa decisão?"
- (perguntas genéricas: o briefing não trouxe as de ${AGENT_NAME}. Troque pelas que ${AGENT_NAME} faz de verdade)`)
    : `- "Hoje o que mais traz cliente novo pra vocês: indicação ou anúncio?"
- "Vocês estão anunciando agora ou tá parado?"
- "Quem cuida do marketing aí hoje, alguém da equipe ou agência?"`;

  const objecoesNicho = b2b && brief.objections.length ? `
### 9.2.1 Objeções do nicho (briefing)

Como ${AGENT_NAME} responde hoje. Use a **ideia** da resposta, com o tamanho e o tom da seção 10: valida, reposiciona e tenta a call uma vez. Não cole a frase inteira se ela for maior que a mensagem do lead.

| Objeção | Como ${AGENT_NAME} responde |
|---|---|
${brief.objections.map((o) => `| "${o.objecao.replace(/\|/g, '/')}" | ${o.resposta ? o.resposta.replace(/\|/g, '/') : 'Sem resposta no briefing: valide, faça 1 pergunta e, se o lead insistir, passe pro humano'} |`).join('\n')}
` : '';

  const callInfo = b2b && brief.call ? `\n**Sobre a call** (briefing): ${brief.call}. Use isso pra dizer o que o lead leva da conversa, sem prometer resultado.\n` : '';

  const objFirst = b2b ? brief.objections.find((o) => o.resposta) : null;
  const exemploObjecao = objFirst
    ? `**Objeção "${objFirst.objecao}"** (resposta do briefing, encurtada pro WhatsApp quando precisar):
> Lead: ${objFirst.objecao}
> Agente: ${objFirst.resposta}
> Agente: Essa semana tenho horário na terça 10h e na quinta 14h. Qual você prefere?`
    : `**Objeção "já tenho quem faça isso"** (montado com o seu primeiro segmento e a sua primeira dor, ajuste a frase ao seu jeito):
> Lead: já tenho quem cuide disso, obrigado
> Agente: Imaginei. A ideia não é trocar ninguém, é uma segunda olhada. Em ${segmento} é comum ${dor} passar batido no dia a dia
> Agente: Se não aparecer nada, você sai da call com a confirmação de que tá tudo certo. Essa semana tenho horário na terça 10h e na quinta 14h. Qual você prefere?`;

  const exemplos = b2b
    ? `${exemploObjecao}

**Não é o decisor:**
> Lead: quem vê isso é meu pai, eu cuido só da parte comercial
> Agente: Entendi. Consegue me passar o contato dele ou prefere mostrar essa conversa pra ele primeiro?
> Lead: te passo, é 27 99...
> → handoff_human (contato novo: ${AGENT_NAME} decide como abordar)

**Pedido de proposta por e-mail:**
> Lead: manda uma proposta por e-mail que eu vejo
> Agente: Posso até enviar. Só que proposta sem ver os números de vocês tende a ficar genérica. Consigo te ligar? Em 2 minutos por telefone eu já te digo se vale a pena.
> Lead: prefiro por e-mail mesmo
> → handoff_human (pediu e-mail: ${AGENT_NAME} envia)`
    : `**Curiosidade virando call:**
> Lead: como assim, o que você viu?
> Agente: Uma das coisas: o site não tem rastreamento nenhum. Quem chega pelo anúncio vai embora sem deixar rastro
> Agente: Tem mais duas que por mensagem fica raso. Consegue 10 minutos amanhã às 11h ou quinta às 15h?
> (entrega 1 ponto concreto pra ganhar crédito e guarda o resto pra call)

**Objeção "já tenho agência":**
> Lead: já temos agência cuidando disso
> Agente: Faz sentido. Não é pra substituir ninguém, é uma segunda opinião sobre o que tá travando o retorno
> Agente: Se a agência já resolve, a call serve pra confirmar. Topa quinta 16h?

**Preço antes da call:**
> Lead: quanto custa?
> Agente: Depende do que aparecer no diagnóstico, pode ser um ajuste pequeno ou um projeto. Por isso a call vem antes
> Lead: tá, pode ser amanhã à tarde
> Agente: Fechado. 14h ou 16h?
> Lead: 16h
> → book_meeting (dia seguinte, 16:00)`;

  return `## 9. Condução da conversa (depois que o lead responde)

Vale em dois momentos: quando ${AGENT_NAME} pede uma sugestão na aba **Prospecção Fria** do CRM, e quando o **modo automático** está ligado (aí o agente decide e envia sozinho). O objetivo é um só: **qualificar e levar pra call de diagnóstico**. Não é suporte, não é venda pelo chat, não é consultoria de graça.

### 9.1 Primeiro, leia a resposta

Classifique a última mensagem do lead antes de escrever qualquer coisa:

| Tipo | Como aparece | O que fazer |
|---|---|---|
| Curiosidade | "como assim?", "o que você viu?" | Explica em 1 ou 2 frases, sem entregar o diagnóstico, e faz 1 pergunta de qualificação |
| Interesse | "pode ser", "quero entender melhor" | Propõe a call com 2 horários concretos |
| Objeção | ${objecaoExemplo}, "não tenho tempo" | Valida sem rebater, faz 1 pergunta que reabre e tenta a call uma vez |
| Preço | "quanto custa?", "qual o valor?" | Não passa preço no chat. Diz que depende do diagnóstico e oferece a call |
| Não é o decisor | "quem cuida disso é o dono" | Pede ajuda pra chegar em ${decisor}. Se passar outro número, passa pro humano |
| Desconfiança | "quem é você?", "onde pegou meu número?" | Transparência: número público no Google Maps e quem você é em 1 linha. Sem justificativa longa |
| Adiamento | "agora não", "me chama mês que vem" | Aceita, combina quando retomar e encerra por ora. Não insiste |
| Recusa ou pedido de parar | "não tenho interesse", "não me manda mais" | Uma frase educada e encerra. Nunca insiste, nunca pergunta "por quê?" |
| Fora do escopo | proposta formal, e-mail, contrato, dúvida técnica, reclamação | Passa pro humano |
| Áudio transcrito | "[áudio 0:18, transcrição automática] ..." | Trate como a fala do lead e classifique o conteúdo por esta tabela. Veja 9.1.1 |
| Áudio sem transcrição, foto ou arquivo | "[áudio]", "[imagem]", "[arquivo]" | Passa pro humano |

### 9.1.1 Áudio transcrito

Quando a transcrição de áudio está ligada, a mensagem do lead chega como texto marcado "[áudio ..., transcrição automática]". É o que ele **falou**, transcrito por máquina.

- Responda ao conteúdo como quem ouviu. Não diga "ouvi seu áudio" nem cite a transcrição.
- Áudio costuma ser longo e ter várias ideias. Responda curto, ao ponto principal, com no máximo 1 pergunta.
- A máquina pode trocar palavra. **Dado essencial** (dia, hora, nome, número, valor) que pareça estranho: pergunte de novo em 1 frase, nunca assuma.
- Nunca agende a partir de dia ou hora que veio só de trecho duvidoso. Confirme por escrito antes ("Fechado então, quinta às 15h?").
- Marcado "com baixa confiança": não responda sozinho, passe pro humano.
- Responder em texto a quem mandou áudio é normal. Não peça pra ele escrever.

### 9.2 Qualificação: pouca pergunta, uma por vez

- No máximo **1 pergunta por mensagem**.
- No máximo **2 ou 3 perguntas na conversa inteira** antes de propor a call. A call aprofunda, o chat não.
- Perguntas que funcionam:
${perguntas}
- Não pergunte o que já está no histórico ou na ata.
${objecoesNicho}
### 9.3 Quando o lead está pronto pra call

Proponha a call quando pelo menos 2 destas forem verdade:
- ele decide ou participa da decisão;
- mostrou interesse, curiosidade real ou admitiu a dor;
- nada na conversa revelou anti-fit.

Não espere todas as respostas. Lead que pergunta "como funciona?" duas vezes já está pronto.

**Como propor:** 2 horários concretos, em dias diferentes quando der, e deixe o lead escolher. Formato de referência: "Essa semana tenho horário na terça 10h e na quinta 14h. Qual você prefere?". Nunca "qual o melhor horário pra você?", que devolve o trabalho pro lead e esfria a conversa.
${callInfo}
### 9.3.1 Qualificação obrigatória: faturamento e autoridade

Quando a opção **"Qualificar antes de agendar"** está ligada no CRM (o prompt avisa, com o estado de cada item), a call só é proposta depois de duas coisas ditas pelo próprio lead:

- **Faturamento do negócio** (orçamento). Se houver mínimo configurado, precisa estar acima dele.
- **Autoridade:** ele decide, ou quem decide vai estar na call.

Como perguntar sem virar interrogatório:

- **Depois do interesse, antes do horário.** Quando o lead topar conversar, a pergunta entra como preparação da call, não como filtro: "Consigo sim. Pra eu chegar com o diagnóstico certo: ${b2b ? 'a empresa fatura mais perto de 2, 5 ou 10 milhões por ano?' : 'o negócio fatura mais perto de 50, 100 ou 200 mil por mês?'}"
- **Faixa, não número exato.** Três opções fáceis de escolher. Ajuste as faixas ao nicho.
- **Uma pergunta por mensagem.** Faturamento numa, autoridade na outra: "E essa decisão é só sua ou tem sócio junto?"
- **Pule o que já foi dito.** Se o lead já contou o faturamento ou disse que é o dono, não pergunte de novo.
- **Quem decide é outra pessoa:** convide pra call ("dá pra ele participar também?"). Se ele confirmar, a autoridade conta.
- **Não quis dizer o faturamento:** não insista, passe pro humano.
- **Abaixo do mínimo:** não proponha call. Passe pro humano com o motivo; quem decide se abre exceção é ${AGENT_NAME}.

No modo automático o sistema confere: agendamento ou proposta de horário sem os dois itens confirmados é barrado, e o lead vai pro humano. O trecho citado precisa estar na conversa, com as palavras do lead.

### 9.4 Agendamento (modo automático)

- Ofereça **só os horários livres reais** que vierem da agenda conectada. Nunca invente disponibilidade.
- Só agende com **dia e hora exatos** confirmados pelo lead. "Amanhã à tarde" ou "pode ser terça" pedem a hora, não viram agendamento.
- Lead propôs outro horário? Aceite só se for dia útil dentro do horário de reuniões. Fora disso, passe pro humano.
- Depois de agendar, confirme curto: dia e hora. O sistema anexa o link do Meet sozinho.
- Sem agenda conectada ou sem horário livre: quando o lead topar, passe pro humano confirmar.

### 9.5 Passar pro humano (\`handoff_human\`)

- Pediu proposta, contrato, orçamento formal ou envio por e-mail
- Passou outro contato (sócio, financeiro, decisor)
- Pergunta técnica que esta skill não cobre
- Mandou foto, arquivo ou áudio sem transcrição (ou com transcrição de baixa confiança)
- Qualquer dúvida real sobre o que responder. **Na dúvida, passe.** Mensagem errada pra lead real custa mais que uma resposta atrasada.

Pode mandar uma frase de cortesia antes de passar ("Combinado, te escrevo por lá."), pro lead não ficar no vácuo. Sem prometer prazo e sem assumir compromisso novo que o lead não pediu.

### 9.6 Encerrar (\`close\`)

- Recusa clara, pedido de parar ou irritação → uma frase educada ("Tranquilo, não te mando mais nada. Obrigado pelo retorno.") com motivo \`opt_out\` ou \`sem_interesse\`
- Anti-fit revelado na conversa → agradece e encerra com motivo \`anti_fit\`
- Adiamento → confirma quando retomar e encerra com motivo \`adiado\` e a data no motivo. O lead fica em "precisa revisão" na Prospecção Fria pra ${AGENT_NAME} retomar na data (o kit não retoma sozinho)

### 9.7 Exemplos

${exemplos}

Simulações completas, com pontos de inflexão comentados: \`docs/simulacoes-atendimento.md\`.

---
`;
}

function skillAntiAiSection() {
  return `## 10. Texto humano: checklist anti-IA

Mensagem com cara de robô queima o lead antes de qualquer argumento. Rode este checklist em **toda** mensagem (toque 1, follow-up e conversa) antes de salvar ou enviar. Qualquer item marcado: reescreva. Baseado no guia "Signs of AI writing" (Wikipédia), adaptado pra WhatsApp.

1. **Travessão (—).** Quase ninguém usa no WhatsApp. Troque por ponto ou vírgula.
2. **Emoji.** Nenhum no toque 1. Na conversa, no máximo 1, e só se o lead usou antes.
3. **Abertura de atendente virtual.** "Ótima pergunta!", "Entendo perfeitamente", "Com certeza!", "Perfeito!", "Que bom que você respondeu!". Vá direto.
4. **Repetir o que o lead acabou de dizer.** "Entendi que vocês já têm agência e estão satisfeitos..." Ele sabe o que escreveu.
5. **Fecho de robô.** "Fico à disposição", "Qualquer dúvida, estou por aqui", "Espero ter ajudado", "Tenha um ótimo dia!".
6. **Mensagem maior que a do lead.** Ele mandou uma linha, você responde com uma ou duas. Espelhe tamanho e tom. Se precisar dizer duas coisas, mande em duas mensagens curtas.
7. **Lista, tópico ou negrito.** Ninguém conversa em bullet point no WhatsApp.
8. **Regra de três.** "Mais clientes, mais previsibilidade e mais crescimento." Fique com o item que importa.
9. **Vocabulário de IA.** "Além disso", "vale ressaltar", "é importante destacar", "jornada", "potencializar", "alavancar", "impulsionar", "solução", "ecossistema", "sinergia", "estratégico" repetido.
10. **Formalidade de e-mail.** "Prezado(a)", "Cordialmente", "Venho por meio desta".
11. **Hedge.** "Talvez", "de certa forma", "pode ser que", "em certa medida". Afirme ou corte.
12. **Conversa em que toda mensagem termina em pergunta.** Varie. Às vezes afirme e pare. (O toque 1 termina no CTA, isso não muda.)
13. **Ritmo robótico.** Frases todas do mesmo tamanho. Alterne curta e média.
14. **Elogio genérico.** "Adorei o trabalho de vocês!" Elogio só com fato: "vi que vocês abriram a segunda unidade".
15. **Justificativa longa.** Pediu desculpa, contextualizou, explicou e só então disse a coisa. Diga a coisa.

**Teste final:** se essa mensagem chegasse no seu próprio WhatsApp, você perceberia que foi IA? Se sim, reescreva.

Isso não autoriza erro de português de propósito nem gíria forçada. Humano não é desleixado, é direto.

---
`;
}

function skillLimitsSection() {
  return `## 11. Limites desta versão

- Áudio só entra pela transcrição local (quando ligada, \`TRANSCRIBE_AUDIO\`). No modo automático, só responde áudio se a opção "responder áudios" estiver ligada e a transcrição for confiável. Imagem e arquivo sempre vão pro humano.
- Não passa preço, não manda proposta, não negocia condição. Isso é na call.
- Não agenda sem Google Calendar conectado e sem horário livre confirmado na agenda.
- Depois que a call é agendada, o modo automático sai da conversa. Remarcação e dúvida antes da call são com o humano.
- Modo automático: no máximo 8 turnos por lead. Depois disso, sempre humano.
- A cadência de follow-up (toques 2 a 6) continua nos templates fixos do dispatcher (\`pipeline/followup-templates.json\`) e para quando o lead responde.
`;
}

// Cada toque tem uma função diferente — não é o mesmo pedido reescrito.
// Agência: mesmo texto validado, só sem as marcas de IA (travessão no toque 3,
// "fico à disposição" no 5, "Boa sorte!" no 6). B2B: sem "criativos".
// Dois jogos de cadência (toques 2-6). Qual entra em cada envio é decidido em
// tempo real pelo scheduler.js, pelo estado ATUAL do modo automático — não pelo
// que estava ligado quando o toque 1 saiu.
//
// - manual: você conduz a resposta. O CTA pede um horário de ligação, porque
//   é você quem vai efetivamente marcar e falar por telefone depois.
// - auto: o próprio BDR conduz a resposta e agenda sozinho. O CTA pede a
//   resposta em si ("me responde que já vejo um horário"), porque a partir da
//   resposta o modo automático já assume a conversa e propõe os horários —
//   não precisa de um segundo vaivém manual só pra chegar até aí.
//
// Os dois jogos passam pelo mesmo checklist anti-IA (seção 10) e mantêm a
// função comunicativa de cada toque (confirmação de alcance, reforço de
// valor, pedido direto, qualificação + saída elegante, encerramento).
function generateFollowupTemplates(vars) {
  const { AGENT_NAME, BUSINESS_TYPE } = vars;
  const isB2B = BUSINESS_TYPE === 'b2b';

  const manual = isB2B
    ? {
        touch_2: `Oi, [nome]. ${AGENT_NAME} de novo. Só pra confirmar se a mensagem chegou e se é com você mesmo que eu falo sobre isso. Se for com outra pessoa, me indica?`,
        touch_3: `Oi, [nome]. Uma coisa que não falei na primeira mensagem: o ponto que vi na [empresa] costuma passar batido até aparecer no caixa. Por telefone te mostro em 10 minutos. Essa semana dá?`,
        touch_4: `Oi, [nome]. Consigo te ligar 10 minutos ainda essa semana? Se agora não for prioridade, me fala que eu não insisto.`,
        touch_5: `Oi, [nome]. Pergunta direta: isso é prioridade pra vocês esse semestre? Se não for, tudo certo, só me avisa pra eu não ficar mandando mensagem.`,
        touch_6: `Oi, [nome]. Vou parar por aqui pra não encher sua caixa. Se um dia quiser ver o que eu vi na [empresa], é só responder essa mensagem.`,
      }
    : {
        touch_2: `Oi, [nome]! Sou ${AGENT_NAME} de novo. Só garantindo que minha mensagem de ontem chegou. Tem algum momento esta semana pra uma ligação rápida?`,
        touch_3: `Oi, [nome]. ${AGENT_NAME} aqui. Sei que a agenda tá cheia, mas o que identifiquei nos criativos vale 10 minutos da sua atenção. Podemos marcar?`,
        touch_4: `Oi, [nome]. Última tentativa de contato por aqui. Se o timing não for agora, tudo bem. Mas se quiser entender o que vi, é só responder.`,
        touch_5: `Oi, [nome]. ${AGENT_NAME} aqui. Vou deixar espaço. Quando fizer sentido conversar, é só me chamar.`,
        touch_6: `Oi, [nome]. Encerrando meu contato por agora. Se em algum momento quiser entender o que identifiquei na operação, me chama.`,
      };

  const auto = isB2B
    ? {
        touch_2: `Oi, [nome]. ${AGENT_NAME} de novo. Chegou a mensagem? Se for com você mesmo que eu falo, me responde que já vejo um horário. Se for outra pessoa, me indica.`,
        touch_3: `Oi, [nome]. Uma coisa que não falei antes: o ponto que vi na [empresa] costuma passar batido até aparecer no caixa. Me responde que eu te conto e já vemos um horário.`,
        touch_4: `Oi, [nome]. Só pra não insistir à toa: responde rapidinho, mesmo que seja "agora não é prioridade". Se topar, já te passo dois horários.`,
        touch_5: `Oi, [nome]. Pergunta direta: isso é prioridade pra vocês esse semestre? Se for, é só responder que já vejo um horário. Se não for, me avisa pra eu não insistir.`,
        touch_6: `Oi, [nome]. Vou parar por aqui pra não encher sua caixa. Se um dia quiser ver o que eu vi na [empresa], é só responder essa mensagem.`,
      }
    : {
        touch_2: `Oi, [nome]! Sou ${AGENT_NAME} de novo. Chegou a mensagem de ontem? Me responde que já vejo com você um horário essa semana.`,
        touch_3: `Oi, [nome]. ${AGENT_NAME} aqui. Tem mais um ponto que vi e não cabia na primeira mensagem. Me responde que eu te conto e já vemos um horário.`,
        touch_4: `Oi, [nome]. Só pra não sumir: responde rapidinho, mesmo que seja "agora não é prioridade". Se topar, já te passo dois horários.`,
        touch_5: `Oi, [nome]. ${AGENT_NAME} aqui. Vou deixar espaço, mas se quiser ver o que encontrei é só responder que eu já vejo um horário com você.`,
        touch_6: `Oi, [nome]. Encerrando meu contato por agora. Se mudar de ideia, é só responder essa mensagem que eu volto a te atender.`,
      };

  return JSON.stringify({ manual, auto }, null, 2);
}

// Lido pelo scripts/build-pool.py. Agência = comportamento validado (sem
// ajuste por nicho). B2B = ranking por categoria-alvo + aceita fixo.
function generateIcpConfig(vars) {
  const isB2B = vars.BUSINESS_TYPE === 'b2b';
  const config = isB2B
    ? {
        business_type: 'b2b',
        target_categories: splitList(vars.B2B_TARGET_CATEGORIES, ','),
        exclude_categories: splitList(vars.B2B_EXCLUDE_CATEGORIES, ','),
        accept_landline: true,
      }
    : { business_type: 'agencia' };
  return JSON.stringify(config, null, 2) + '\n';
}

const isOn = (v) => v === true || /^(1|true|sim|s|yes|y|on)$/i.test(String(v ?? '').trim());

// Transcrição de áudio (opcional): mesmo bloco no dispatcher (modo automático)
// e no CRM (botão "Puxar conversa do WhatsApp" no modo manual).
function transcriptionEnvBlock(vars) {
  return `
# Transcrição de áudio dos leads — local (faster-whisper), o áudio não sai da máquina.
# Requer: ${vars.PYTHON_CMD || 'python'} -m pip install -r scripts/requirements-audio.txt
# Modelo: tiny | base | small (padrão, bom em português) | medium (melhor, mais lento)
TRANSCRIBE_AUDIO=${isOn(vars.TRANSCRIBE_AUDIO) ? 'true' : 'false'}
PYTHON_CMD=${vars.PYTHON_CMD || 'python'}
WHISPER_MODEL=${vars.WHISPER_MODEL || 'small'}
TRANSCRIBE_MIN_CONFIDENCE=0.5
`;
}

function generateDispatcherEnv(vars) {
  const {
    TIMEZONE,
    DEFAULT_COUNTRY = 'BR',
    WINDOW_START_HOUR,
    WINDOW_END_HOUR,
    INTERVAL_MIN_SECONDS,
    INTERVAL_MAX_SECONDS,
    DAILY_NEW_CAP,
    EVOLUTION_API_URL,
    EVOLUTION_API_KEY,
    EVOLUTION_INSTANCE,
  } = vars;

  return `TIMEZONE=${TIMEZONE}
# País padrão dos telefones dos leads (2 letras). Lido pelo build-pool.py e pelo enrich-sites.py.
DEFAULT_COUNTRY=${DEFAULT_COUNTRY}
WINDOW_START_HOUR=${WINDOW_START_HOUR}
WINDOW_END_HOUR=${WINDOW_END_HOUR}
WORKING_DAYS=1,2,3,4,5
INTERVAL_MIN_SECONDS=${INTERVAL_MIN_SECONDS}
INTERVAL_MAX_SECONDS=${INTERVAL_MAX_SECONDS}
DAILY_NEW_CAP=${DAILY_NEW_CAP}
PIPELINE_DIR=../pipeline
LOG_LEVEL=info

# Modo automático: espera o lead terminar de mandar mensagens seguidas antes de responder (segundos)
AUTO_REPLY_DELAY_MIN_SECONDS=9
AUTO_REPLY_DELAY_MAX_SECONDS=9

# Modelo do Claude no modo automático e no botão "Gerar sugestão" (opcional). Vazio usa o
# modelo padrão da sua conta. É o único lugar onde o modelo se escolhe: nada de versão
# de modelo espalhada pela documentação.
${vars.CLAUDE_MODEL ? `CLAUDE_MODEL=${vars.CLAUDE_MODEL}` : '# CLAUDE_MODEL='}

# Evolution API (WhatsApp)
EVOLUTION_API_URL=${EVOLUTION_API_URL}
EVOLUTION_API_KEY=${EVOLUTION_API_KEY}
EVOLUTION_INSTANCE=${EVOLUTION_INSTANCE}
${transcriptionEnvBlock(vars)}`;
}

function generateCrmEnv(vars) {
  const { EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE, TIMEZONE = 'America/Sao_Paulo' } = vars;
  return `CRM_PORT=3001

# Fuso horário: o mesmo do dispatcher/.env. A agenda do Google, os horários livres e o
# modo automático usam este fuso (nome IANA, ex.: America/Sao_Paulo, Europe/Lisbon).
TIMEZONE=${TIMEZONE}

# Horário em que você aceita reunião (modo automático só oferece/agenda aqui,
# em dia útil e em horário livre na agenda do Google)
MEETING_START_HOUR=9
MEETING_END_HOUR=18

# Evolution API (WhatsApp) — mesma instância do dispatcher/.env.
# Usada pela aba "Prospecção Fria" pra status + resposta manual.
EVOLUTION_API_URL=${EVOLUTION_API_URL}
EVOLUTION_API_KEY=${EVOLUTION_API_KEY}
EVOLUTION_INSTANCE=${EVOLUTION_INSTANCE}
${transcriptionEnvBlock(vars)}`;
}

// ─── Write all generated files ─────────────────────────────────────────────────
function writeFiles(vars) {
  console.log('\n' + c.cyan('Gerando arquivos...\n'));

  // 1. .claude/contexto-local.md — contexto do negócio do aluno. O CLAUDE.md do repo
  //    (versionado) importa este arquivo; assim o git pull nunca conflita com o setup.
  const contextoPath = path.join(ROOT_DIR, '.claude', 'contexto-local.md');
  writeFileRecursive(contextoPath, generateClaudeMd(vars));
  console.log(c.green('✓') + ' .claude/contexto-local.md (contexto do seu negócio)');

  // 2. .claude/skills/bdr-{slug}/SKILL.md — project root
  const skillPath = path.join(ROOT_DIR, '.claude', 'skills', `bdr-${vars.AGENT_SLUG}`, 'SKILL.md');
  writeFileRecursive(skillPath, generateSkillMd(vars));
  console.log(c.green('✓') + ` .claude/skills/bdr-${vars.AGENT_SLUG}/SKILL.md`);

  // 3. pipeline/followup-templates.json
  const templatesPath = path.join(ROOT_DIR, 'pipeline', 'followup-templates.json');
  writeFileRecursive(templatesPath, generateFollowupTemplates(vars));
  console.log(c.green('✓') + ' pipeline/followup-templates.json');

  // 3b. pipeline/icp-config.json — tipo de negócio + ranking por nicho (B2B)
  const icpPath = path.join(ROOT_DIR, 'pipeline', 'icp-config.json');
  writeFileRecursive(icpPath, generateIcpConfig(vars));
  console.log(c.green('✓') + ` pipeline/icp-config.json (${vars.BUSINESS_TYPE === 'b2b' ? 'B2B' : 'agência'})`);

  // 3c. pipeline/booking-rules.json — qualificar antes de agendar (liga/desliga no CRM depois)
  const rulesPath = path.join(ROOT_DIR, 'pipeline', 'booking-rules.json');
  writeFileRecursive(rulesPath, JSON.stringify({
    require_qualification: isOn(vars.QUALIFY_BEFORE_BOOKING),
    min_annual_revenue: vars.QUALIFY_MIN_REVENUE_ANNUAL || null,
  }, null, 2) + '\n');
  console.log(c.green('✓') + ` pipeline/booking-rules.json (qualificar antes de agendar: ${isOn(vars.QUALIFY_BEFORE_BOOKING) ? 'ligado' : 'desligado'})`);

  // 4. dispatcher/.env
  const envPath = path.join(ROOT_DIR, 'dispatcher', '.env');
  writeFileRecursive(envPath, generateDispatcherEnv(vars));
  console.log(c.green('✓') + ' dispatcher/.env');

  // 4b. crm/.env (mesma config da Evolution, pra aba "Prospecção Fria")
  const crmEnvPath = path.join(ROOT_DIR, 'crm', '.env');
  writeFileRecursive(crmEnvPath, generateCrmEnv(vars));
  console.log(c.green('✓') + ' crm/.env');

  // 5. pipeline/leads-master.json (only if it doesn't exist)
  const masterPath = path.join(ROOT_DIR, 'pipeline', 'leads-master.json');
  if (!fs.existsSync(masterPath)) {
    writeFileRecursive(masterPath, '{}\n');
    console.log(c.green('✓') + ' pipeline/leads-master.json (novo)');
  } else {
    console.log(c.dim('  pipeline/leads-master.json já existe — mantido.'));
  }

  // 6. Ensure pipeline/ directory exists (already created above, but be explicit)
  const pipelineDir = path.join(ROOT_DIR, 'pipeline');
  fs.mkdirSync(pipelineDir, { recursive: true });

  // 7. docs/comandos-diarios.md — personalized with real values
  const dailyCommandsPath = path.join(ROOT_DIR, 'docs', 'comandos-diarios.md');
  writeFileRecursive(dailyCommandsPath, generateDailyCommands(vars));
  console.log(c.green('✓') + ' docs/comandos-diarios.md (personalizado)');
}

// ─── Generate personalized daily command reference ────────────────────────────
// Tudo aqui roda local — terminal (Python/Node) ou o próprio Claude Code, que
// já é a ferramenta usada pra instalar e pra qualificar (Fase 2). Nenhuma fase
// depende de outra ferramenta de IA: onde antes só dava pra enriquecer com um
// browser separado, hoje o próprio Claude Code, com o navegador dele, resolve.
function generateDailyCommands(vars) {
  const { APIFY_ACTOR_ID, DAILY_NEW_CAP, AGENT_NAME, PYTHON_CMD = 'python3' } = vars;

  return `# Comandos Diários — ${AGENT_NAME}

Referência rápida com os comandos prontos para cada fase da operação.
Gerado automaticamente pelo wizard de instalação.

> O token da Apify **não** fica neste arquivo (nem em nenhum arquivo do projeto): quando um comando precisar dele, use a variável de ambiente \`APIFY_TOKEN\`, como mostrado abaixo.

Para a rotina completa, consulte \`docs/operacao-diaria.md\`.

---

## Fase 0 — Novo lote de leads (quando necessário)

Acesse o painel da Apify, abra o último run do seu actor e exporte o dataset como JSON:

\`\`\`
https://console.apify.com/actors/${APIFY_ACTOR_ID}/runs/last
\`\`\`

Ou baixe pela API, com o token numa variável de ambiente (nunca colado em arquivo ou em URL):

\`\`\`bash
# Mac e Linux
export APIFY_TOKEN="cole-o-token-aqui"
curl -H "Authorization: Bearer $APIFY_TOKEN" -o pipeline/dataset-YYYY-MM-DD.json "https://api.apify.com/v2/acts/${APIFY_ACTOR_ID}/runs/last/dataset/items"

# Windows (PowerShell)
$env:APIFY_TOKEN = "cole-o-token-aqui"
curl.exe -H "Authorization: Bearer $env:APIFY_TOKEN" -o pipeline/dataset-YYYY-MM-DD.json "https://api.apify.com/v2/acts/${APIFY_ACTOR_ID}/runs/last/dataset/items"
\`\`\`

O token fica em Settings, API & Integrations, no console da Apify. Se perder, gere outro lá.

Depois adicione ao pool local:

\`\`\`bash
${PYTHON_CMD} scripts/build-pool.py pipeline/dataset-YYYY-MM-DD.json
\`\`\`

Faça isso uma vez por lote — não é diário. Só quando o pool cair abaixo de 30 pending.

---

## Fase 1a — Enriquecimento de site + Meta Ads (Terminal)

\`\`\`bash
${PYTHON_CMD} scripts/enrich-sites.py --n ${DAILY_NEW_CAP}
\`\`\`

Produz: \`pipeline/site-enrichment-{data-de-hoje}.json\`

---

## Fase 1b — Instagram e Meta Ads: duas formas, escolha uma

**Opção A — Terminal (Playwright, precisa de login uma vez):**

\`\`\`bash
${PYTHON_CMD} scripts/enrich-instagram.py
\`\`\`

(Primeira vez: rode \`${PYTHON_CMD} scripts/enrich-instagram.py --login\` antes)

Produz: \`pipeline/enriched-leads-{data-de-hoje}.json\`

**Opção B — Peça ao Claude Code** (mesma janela usada na Fase 2, sem instalar
nada, sem login salvo em disco). Cole:

\`\`\`
enriquece o site-enrichment de hoje: pra cada lead, abre o Instagram (se tiver handle)
e a Biblioteca de Anúncios da Meta pelo teu navegador, e escreve o enriched-leads
de hoje no formato de sempre
\`\`\`

Ele lê \`pipeline/site-enrichment-{data}.json\`, navega os perfis e a Biblioteca de
Anúncios (\`facebook.com/ads/library\`, pública, sem login) pelo próprio navegador dele,
e grava \`pipeline/enriched-leads-{data-de-hoje}.json\` no mesmo formato de sempre —
a Fase 2 não muda nada. Bom pra lotes pequenos e pra Meta Ads sem token. Pra 10+ leads
por dia todo dia, a Opção A ainda é mais rápida e não arrisca pedir login do Instagram
de novo no meio do lote.

---

## Fase 2 — Qualificação + copies (Claude Code)

\`\`\`bash
claude
\`\`\`

Dentro do Claude Code:

\`\`\`
lê o enriched-leads mais recente e roda o pipeline
\`\`\`

---

## Stage 3 — Disparo (Terminal)

\`\`\`bash
cd dispatcher && npm start
\`\`\`

---

## Verificação rápida

\`\`\`bash
cd dispatcher && npm run status
\`\`\`
`;
}

// ─── Install dependencies ──────────────────────────────────────────────────────
function installDepsInDir(label, dirName) {
  const dir = path.join(ROOT_DIR, dirName);

  if (!fs.existsSync(dir)) {
    console.log(c.yellow(`\n  ⚠ Pasta ${dirName}/ não encontrada — pulando npm install.`));
    return;
  }
  const pkgJson = path.join(dir, 'package.json');
  if (!fs.existsSync(pkgJson)) {
    console.log(c.yellow(`\n  ⚠ ${dirName}/package.json não encontrado — pulando npm install.`));
    return;
  }

  // Com package-lock.json, usa "npm ci": instala exatamente as versões testadas.
  const hasLock = fs.existsSync(path.join(dir, 'package-lock.json'));
  const cmd = hasLock ? 'npm ci' : 'npm install';
  console.log('\n' + c.cyan(`Instalando dependências do ${label}${hasLock ? ' (versões fixas)' : ''}...\n`));
  try {
    execSync(cmd, { cwd: dir, stdio: 'inherit' });
    console.log('\n' + c.green(`✓ ${label}: ${cmd} concluído.`));
  } catch (err) {
    console.error('\n' + c.red(`✗ ${label}: ${cmd} falhou:`), err.message);
    console.log(c.yellow(`  Rode manualmente: cd ${dirName} && ${cmd}\n`));
  }
}

// pip install -r <arquivo>: versões fixas. Em Linux com Python "gerenciado pelo
// sistema" (Debian/Ubuntu), o pip recusa instalar fora de um venv: nesse caso repete
// instalando só pro usuário (--user), sem tocar nos pacotes do sistema.
function installPythonFile(vars, file, label) {
  const py = vars.PYTHON_CMD || 'python';
  console.log('\n' + c.cyan(`Instalando dependências Python ${label} (${file})...\n`));
  const run = (extra = []) => spawnSync(py, ['-m', 'pip', 'install', '-r', file, ...extra], { cwd: ROOT_DIR, encoding: 'utf8' });
  let r = run();
  if (r.status !== 0 && /externally-managed-environment/.test(`${r.stderr}`)) {
    console.log(c.dim('  O Python do sistema é gerenciado pelo sistema operacional; instalando só pro seu usuário (--user).'));
    r = run(['--user', '--break-system-packages']);
  }
  if (r.status === 0) {
    console.log(c.green(`✓ ${file} instalado.`));
  } else {
    console.error(c.red(`✗ pip install -r ${file} falhou:`));
    console.error(c.dim(`${r.stderr || r.error?.message || ''}`.trim().split('\n').slice(-6).join('\n')));
    console.log(c.yellow(`  Rode manualmente: ${py} -m pip install -r ${file}\n`));
  }
}

function installDependencies(vars = {}) {
  installDepsInDir('dispatcher', 'dispatcher');
  installDepsInDir('CRM', 'crm');
  installPythonFile(vars, 'scripts/requirements.txt', 'dos scripts');
  if (isOn(vars.TRANSCRIBE_AUDIO)) {
    installPythonFile(vars, 'scripts/requirements-audio.txt', 'do transcritor de áudio (faster-whisper)');
  }
}

// ─── Final instructions ────────────────────────────────────────────────────────
function printFinalInstructions(vars) {
  const { AGENT_SLUG, PYTHON_CMD = 'python3' } = vars;

  console.log('\n');
  console.log(c.green('╔══════════════════════════════════════════════════════════════╗'));
  console.log(c.green('║  ZX LAB · Etapa 6 de 8 concluída — kit instalado             ║'));
  console.log(c.green('╚══════════════════════════════════════════════════════════════╝'));

  if (vars.BUSINESS_TYPE === 'b2b') {
    const { gaps } = normalizeB2B(vars);
    if (gaps.length) {
      console.log('\n' + c.yellow(`Briefing do nicho: ${gaps.length} lacuna(s). A skill marca cada uma e o agente não preenche com suposição:`));
      gaps.forEach((g) => console.log(c.dim(`   - ${g.label}  (${g.field})`)));
    } else {
      console.log('\n' + c.green('✓ Briefing do nicho completo.'));
    }
  }

  etapaHeader(7, 'Conexões');
  console.log(c.dim('Um passo de cada vez; confirme cada um antes de seguir pro próximo.\n'));

  console.log(c.yellow('1. SUBIR EVOLUTION API + AUTENTICAR WHATSAPP'));
  console.log('   cd dispatcher');
  console.log('   docker compose up -d');
  console.log(c.dim('   (Aguarde ~10s para o container iniciar)\n'));
  console.log('   Acesse o painel da Evolution API:');
  console.log(`   http://localhost:8080/manager`);
  console.log(c.dim('   → Crie uma instância com o nome definido no wizard'));
  console.log(c.dim('   → Escaneie o QR code com seu WhatsApp'));
  console.log(c.dim('     (WhatsApp > Dispositivos Vinculados > Vincular dispositivo)\n'));
  console.log('   Confirme a conexão:');
  console.log('   npm run setup');
  console.log(c.dim('   (Deve mostrar ✓ instância conectada)\n'));

  const isB2B = vars.BUSINESS_TYPE === 'b2b';
  console.log(c.yellow(`2. LOGIN NO INSTAGRAM (${isB2B ? 'opcional em B2B' : 'apenas na primeira vez'})`));
  console.log(`   ${PYTHON_CMD} scripts/enrich-instagram.py --login`);
  console.log(c.dim(isB2B
    ? '   (Em B2B o Instagram pesa pouco na qualificação — site e Google Maps contam mais. Pule se seu nicho não usa.)\n'
    : '   (Abre browser → faça login → sessão salva localmente. Alternativa sem instalar nada:'));
  if (!isB2B) console.log(c.dim('   peça ao Claude Code pra enriquecer pelo navegador dele — veja docs/operacao-diaria.md.)\n'));

  console.log(c.yellow('3. CONECTAR CRM AO GOOGLE CALENDAR (uma vez)'));
  console.log('   cd crm && npm start');
  console.log('   Acesse: http://localhost:3001/auth/google');
  console.log(c.dim('   (Opcional no modo manual. Obrigatório pro modo automático agendar sozinho.)'));
  console.log(c.dim('   (Siga docs/crm-calendar-setup.md para configurar o projeto Google Cloud)\n'));

  console.log(c.yellow('4. PRIMEIRO LOTE DE LEADS'));
  console.log('   Exporte o dataset do último run da Apify como JSON, salve em pipeline/ e rode:');
  console.log(`   ${PYTHON_CMD} scripts/build-pool.py pipeline/<dataset>.json`);
  console.log(c.dim(isB2B
    ? '   (Ranking por nicho ativo: categorias-alvo sobem no pool, categorias excluídas saem. Ajuste em pipeline/icp-config.json.)\n'
    : '\n'));

  etapaHeader(8, 'Teste final');
  console.log('   node setup/smoke.mjs');
  console.log(c.dim('   (Só lê, não altera nem envia nada. Qualquer ✗ precisa ser resolvido antes de dar por concluído.)\n'));

  console.log(c.bold('Pra operar depois:\n'));

  console.log(c.yellow('ROTINA DIÁRIA'));
  console.log('   Enriquecimento:  Terminal (enrich-sites.py + enrich-instagram.py)');
  console.log(c.dim('                    ou peça ao Claude Code: ele enriquece pelo navegador dele — docs/operacao-diaria.md'));
  console.log('   Copies:          App Claude → </> Code → "roda o pipeline"');
  console.log('   Dispatcher:      cd dispatcher && npm start');
  console.log('   CRM:             cd crm && npm start  →  http://localhost:3001');
  console.log('   Respostas:       aba Prospecção Fria do CRM (sugestão de resposta + envio)');
  console.log(c.yellow('   ⚠ Marque quem respondeu: no modo manual o kit NÃO detecta resposta sozinho. Abra o lead e clique'));
  console.log(c.yellow('     em "Puxar conversa do WhatsApp"; senão ele continua recebendo os próximos toques.\n'));

  console.log(c.yellow('MODO AUTOMÁTICO (opcional, desligado)'));
  console.log('   Continua a conversa e agenda a call sozinho. Liga na aba Prospecção Fria.');
  console.log(c.dim('   Espera 9s antes de responder, pra ler junto as mensagens que o lead emenda.'));
  console.log(c.dim('   Leia antes: docs/modo-automatico.md (precisa do Claude Code CLI e do Google Calendar)'));
  console.log(c.dim('   Simulações de atendimento: docs/simulacoes-atendimento.md\n'));

  console.log(c.yellow('QUALIFICAR ANTES DE AGENDAR'));
  console.log(c.dim('   Só vale dentro do modo automático (acima) — sem ele, ninguém agenda sozinho.'));
  console.log(isOn(vars.QUALIFY_BEFORE_BOOKING)
    ? `   Já configurado ligado${vars.QUALIFY_MIN_REVENUE_ANNUAL ? `, com faturamento mínimo de R$ ${Number(vars.QUALIFY_MIN_REVENUE_ANNUAL).toLocaleString('pt-BR')}/ano` : ', sem faturamento mínimo'}: assim que ligar o modo automático, a trava já entra valendo.`
    : c.dim('   Desligado por enquanto. Pra ligar: aba Prospecção Fria → dentro do card "Modo automático" (aparece só quando ele estiver ligado).'));
  console.log('');

  console.log(c.yellow('ÁUDIO DOS LEADS'));
  if (isOn(vars.TRANSCRIBE_AUDIO)) {
    console.log('   Transcrição ligada. Baixe o modelo uma vez (~500 MB, pode levar alguns minutos):');
    console.log(`   ${PYTHON_CMD} scripts/transcribe-audio.py --warmup --model ${vars.WHISPER_MODEL || 'small'}`);
    console.log(c.dim('   No CRM: aba Prospecção Fria → abrir o lead → "Puxar conversa do WhatsApp".'));
    console.log(c.dim('   No modo automático: ligue "responder áudios" pra ele continuar a conversa a partir do áudio.\n'));
  } else {
    console.log(c.dim('   Transcrição desligada: áudio de lead vai sempre pra você ouvir.'));
    console.log(c.dim('   Pra ligar depois: veja docs/transcricao-audio.md\n'));
  }

  console.log(c.dim('Rotina completa: docs/operacao-diaria.md'));
  console.log(c.dim('Manual de uso:   docs/manual-uso-setup17.pdf'));
  console.log('\n' + c.dim('Dúvidas? docs/troubleshooting.md · Suporte ZX LAB: https://suporte.zxlab.com.br/hub') + '\n');
}

// ─── Qualificação antes de agendar: lê o faturamento mínimo em texto livre ─────
// Usa o mesmo leitor do dispatcher/CRM (ESM), via import dinâmico.
async function resolveQualification(vars) {
  vars.QUALIFY_BEFORE_BOOKING = isOn(vars.QUALIFY_BEFORE_BOOKING);
  vars.QUALIFY_MIN_REVENUE_ANNUAL = null;
  const txt = String(vars.QUALIFY_MIN_REVENUE || '').trim();
  if (!vars.QUALIFY_BEFORE_BOOKING || !txt) return;
  try {
    const { pathToFileURL } = require('url');
    const { parseRevenueBR, formatBRL } = await import(pathToFileURL(path.join(ROOT_DIR, 'dispatcher', 'src', 'qualification.js')).href);
    const parsed = parseRevenueBR(txt);
    if (parsed) {
      vars.QUALIFY_MIN_REVENUE_ANNUAL = parsed.annual;
      console.log(c.dim(`  Faturamento mínimo pra call: ${formatBRL(parsed.annual)} (de "${txt}")`));
    } else {
      console.log(c.yellow(`  ⚠ Não entendi o faturamento mínimo "${txt}". Ficou sem mínimo; ajuste depois na aba Prospecção Fria.`));
    }
  } catch (err) {
    console.log(c.yellow(`  ⚠ Não consegui ler o faturamento mínimo (${err.message}). Ajuste na aba Prospecção Fria.`));
  }
}

// ─── Save config for reference ─────────────────────────────────────────────────
function saveConfig(vars) {
  // Save a sanitized config (no token) for reference
  const configForRef = { ...vars };
  configForRef.APIFY_TOKEN = maskSecret(vars.APIFY_TOKEN);

  const configPath = path.join(ROOT_DIR, 'setup', 'setup-config.json');
  try {
    writeFileRecursive(configPath, JSON.stringify(configForRef, null, 2) + '\n');
    console.log(c.dim('\n  Configuração salva em setup/setup-config.json (token mascarado)'));
  } catch (_) {
    // Non-critical — silently skip
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  // ── Non-interactive mode: node setup/setup.js --config path/to/config.json ──
  // Used by Claude Code during guided installation (o aluno pede "instala").
  const configArgIdx = process.argv.indexOf('--config');
  if (configArgIdx !== -1 && process.argv[configArgIdx + 1]) {
    const configPath = process.argv[configArgIdx + 1];
    let rawConfig;
    try {
      rawConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (err) {
      console.error(c.red(`\n✗ Não foi possível ler o arquivo de config: ${configPath}`));
      console.error(err.message);
      process.exit(1);
    }

    // Auto-derive AGENT_SLUG if not provided
    if (!rawConfig.AGENT_SLUG) {
      rawConfig.AGENT_SLUG = toSlug(rawConfig.AGENT_NAME || '');
    }

    // Merge with safe defaults
    const vars = {
      TIMEZONE: 'America/Sao_Paulo',
      DEFAULT_COUNTRY: 'BR',
      WINDOW_START_HOUR: '10',
      WINDOW_END_HOUR: '18',
      DAILY_NEW_CAP: '10',
      INTERVAL_MIN_SECONDS: '120',
      INTERVAL_MAX_SECONDS: '180',
      EVOLUTION_API_URL: 'http://localhost:8080',
      EVOLUTION_INSTANCE: 'bdr-instance',
      ...rawConfig,
    };

    // Teto de leads novos por dia: no máximo 20 (anti-ban).
    {
      const capNorm = normalizeDailyCap(vars.DAILY_NEW_CAP);
      if (capNorm.limited) console.log(c.yellow(`  ! DAILY_NEW_CAP=${vars.DAILY_NEW_CAP} passa do máximo seguro; usando ${DAILY_NEW_CAP_MAX}.`));
      vars.DAILY_NEW_CAP = capNorm.value;
    }

    // Fuso horário: nome IANA válido (America/Sao_Paulo, Europe/Lisbon...).
    if (!isValidTimezone(vars.TIMEZONE)) {
      console.error(c.red(`\n✗ TIMEZONE inválido: "${vars.TIMEZONE}". Use um nome IANA, como America/Sao_Paulo ou Europe/Lisbon.\n`));
      process.exit(1);
    }

    // País padrão dos telefones: 2 letras (BR, PT, US...).
    vars.DEFAULT_COUNTRY = String(vars.DEFAULT_COUNTRY || 'BR').trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(vars.DEFAULT_COUNTRY)) {
      console.error(c.red(`\n✗ DEFAULT_COUNTRY inválido: "${vars.DEFAULT_COUNTRY}". Use o código de 2 letras do país (BR, PT, US...).\n`));
      process.exit(1);
    }

    // Aceita nomes alternativos (NICHO/POSICIONAMENTO) como aliases dos campos
    // que os geradores realmente consomem — evita quebrar configs antigos.
    if (!vars.ICP_NICHE && vars.NICHO) vars.ICP_NICHE = vars.NICHO;
    if (!vars.AGENT_POSITIONING && vars.POSICIONAMENTO) vars.AGENT_POSITIONING = vars.POSICIONAMENTO;

    // Tipo de negócio: sem o campo, assume agência (comportamento validado).
    const rawType = String(vars.BUSINESS_TYPE || 'agencia').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (['agencia', 'agency', '1'].includes(rawType)) vars.BUSINESS_TYPE = 'agencia';
    else if (['b2b', 'outro', '2'].includes(rawType)) vars.BUSINESS_TYPE = 'b2b';
    else {
      console.error(c.red(`\n✗ BUSINESS_TYPE inválido: "${vars.BUSINESS_TYPE}". Use "agencia" ou "b2b".\n`));
      process.exit(1);
    }

    // Chave da Evolution API: gera se não veio; recusa vazio/placeholder/curta.
    if (!String(vars.EVOLUTION_API_KEY ?? '').trim()) {
      const kept = existingEnvValue('dispatcher/.env', 'EVOLUTION_API_KEY');
      if (kept && !evolutionKeyProblem(kept)) {
        vars.EVOLUTION_API_KEY = kept;
        console.log(c.dim('  EVOLUTION_API_KEY: mantida a que já está em dispatcher/.env (o WhatsApp conectado continua válido).'));
      } else {
        vars.EVOLUTION_API_KEY = generateEvolutionKey();
        console.log(c.dim('  EVOLUTION_API_KEY não informada: gerada automaticamente (48 caracteres).'));
      }
    } else {
      const keyProblem = evolutionKeyProblem(vars.EVOLUTION_API_KEY);
      if (keyProblem) {
        console.error(c.red(`\n✗ EVOLUTION_API_KEY inválida: ${keyProblem}.`));
        console.error(c.yellow('  Apague o campo do config para o setup gerar uma chave segura, ou informe uma com 24+ caracteres.\n'));
        process.exit(1);
      }
    }

    // Validate required fields — nomes têm que bater com os usados em
    // generateClaudeMd/generateSkillMd, senão o texto gerado sai com "undefined".
    const required = [
      'AGENT_NAME', 'AGENT_SLUG', 'ICP_NICHE', 'AGENT_POSITIONING',
      'AGENT_NUCLEAR_PHRASE', 'AGENT_WHAT_IS_NOT', 'AGENT_WHAT_IS',
      'APIFY_ACTOR_ID', 'APIFY_TOKEN',
      ...(vars.BUSINESS_TYPE === 'b2b' ? ['B2B_OFFER', 'B2B_TARGET_CATEGORIES', 'B2B_PAINS', 'B2B_DECISOR'] : []),
    ];
    const missing = required.filter(k => !vars[k]);
    if (missing.length) {
      console.error(c.red(`\n✗ Campos obrigatórios ausentes no config: ${missing.join(', ')}`));
      console.error(c.yellow('  Corrija o arquivo de config e rode novamente.\n'));
      process.exit(1);
    }

    etapaHeader(6, 'Instalação');
    console.log(c.cyan('Modo --config: instalando sem interação...\n'));
    vars.PYTHON_CMD = checkPrerequisites();
    await resolveQualification(vars);
    writeFiles(vars);
    installDependencies(vars);
    saveConfig(vars);
    printFinalInstructions(vars);
    return;
  }
  // ── End non-interactive mode ─────────────────────────────────────────────────

  console.log('\n' + c.bold(c.cyan('╔══════════════════════════════════════════════════════════════╗')));
  console.log(c.bold(c.cyan('║  ZX LAB · ZX CONTROL 7 · SETUP 17                            ║')));
  console.log(c.bold(c.cyan('║  Modo interativo no terminal · 8 etapas                      ║')));
  console.log(c.bold(c.cyan('╚══════════════════════════════════════════════════════════════╝')));
  console.log(c.dim('\n  Este wizard configura o seu Setup 17 personalizado.'));
  console.log(c.dim('  Você precisará de: nome, nicho, posicionamento, e tokens da Apify.'));
  console.log(c.dim('  O jeito padrão da ZX LAB é o Claude Code conduzir tudo no chat: INSTALACAO-GUIADA.md\n'));

  // Step 1: Prerequisites
  const pythonCmd = checkPrerequisites();

  // Step 2: Interactive questions
  const rl = createRL();

  let vars;
  try {
    const phase1Vars = await phase1(rl);
    const phase2Vars = await phase2(rl);
    await phase3(rl);  // currently only asks about customization; default templates used either way

    vars = { ...phase1Vars, ...phase2Vars, PYTHON_CMD: pythonCmd };
  } finally {
    rl.close();
  }

  // Step 3: Generate files
  await resolveQualification(vars);
  writeFiles(vars);

  // Step 4: Install dependencies
  installDependencies(vars);

  // Step 5: Save sanitized config
  saveConfig(vars);

  // Step 6: Print final instructions
  printFinalInstructions(vars);
}

main().catch((err) => {
  console.error(c.red('\n✗ Erro inesperado:'), err);
  process.exit(1);
});
