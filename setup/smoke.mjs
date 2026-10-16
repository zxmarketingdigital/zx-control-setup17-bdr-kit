// setup/smoke.mjs — Etapa 8 do Setup ZX LAB: teste final da instalação.
//
// Só LÊ: não cria arquivo, não envia mensagem, não mexe em nada. Rode com
//   node setup/smoke.mjs
// Sai com código 1 se algo que bloqueia o uso estiver quebrado; avisos (!) são
// coisas pendentes ou opcionais e não reprovam.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const { evolutionKeyProblem } = createRequire(import.meta.url)('./evolution-key.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = (...p) => path.join(ROOT, ...p);

const useColor = process.stdout.isTTY;
const paint = (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const green = (s) => paint('32', s);
const yellow = (s) => paint('33', s);
const red = (s) => paint('31', s);
const dim = (s) => paint('2', s);
const bold = (s) => paint('1', s);

let fails = 0;
let warns = 0;

function ok(label) { console.log(`  ${green('✓')} ${label}`); }
function warn(label, hint) { warns++; console.log(`  ${yellow('!')} ${label}`); if (hint) console.log(`    ${dim(hint)}`); }
function fail(label, hint) { fails++; console.log(`  ${red('✗')} ${label}`); if (hint) console.log(`    ${dim(hint)}`); }
function section(title) { console.log(`\n${bold(title)}`); }

function parseEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function readJsonOrNull(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

console.log('\n' + bold('ZX LAB · SETUP DO BDR KIT — Etapa 8: teste final'));
console.log(dim('Só leitura: nada é alterado nem enviado.'));

// ── Etapa 6: instalação ────────────────────────────────────────────────────
section('Instalação (Etapa 6)');

const claudeMd = rel('CLAUDE.md');
if (!fs.existsSync(claudeMd)) fail('CLAUDE.md não existe', 'Rode a Etapa 6 (node setup/setup.js --config setup/config.json).');
else if (fs.readFileSync(claudeMd, 'utf8').includes('o setup ainda não foi rodado')) fail('CLAUDE.md ainda é o texto padrão (o setup não rodou)', 'Rode a Etapa 6.');
else ok('CLAUDE.md gerado com o contexto do seu negócio');

const skillsDir = rel('.claude', 'skills');
const skillDirs = fs.existsSync(skillsDir) ? fs.readdirSync(skillsDir).filter((d) => d.startsWith('bdr-')) : [];
if (skillDirs.length && fs.existsSync(path.join(skillsDir, skillDirs[0], 'SKILL.md'))) ok(`Skill de qualificação (.claude/skills/${skillDirs[0]})`);
else fail('Skill de qualificação não foi gerada', 'Rode a Etapa 6.');

for (const f of ['followup-templates.json', 'icp-config.json', 'booking-rules.json']) {
  const file = rel('pipeline', f);
  if (!fs.existsSync(file)) fail(`pipeline/${f} não existe`, 'Rode a Etapa 6.');
  else if (readJsonOrNull(file) === null) fail(`pipeline/${f} está com JSON inválido`, 'Rode a Etapa 6 de novo.');
  else ok(`pipeline/${f}`);
}

const dEnv = parseEnv(rel('dispatcher', '.env'));
if (!fs.existsSync(rel('dispatcher', '.env'))) fail('dispatcher/.env não existe', 'Rode a Etapa 6.');
else {
  const missing = ['EVOLUTION_API_URL', 'EVOLUTION_API_KEY', 'EVOLUTION_INSTANCE'].filter((k) => !dEnv[k]);
  if (missing.length) fail(`dispatcher/.env sem: ${missing.join(', ')}`, 'Rode a Etapa 6 de novo.');
  else {
    ok('dispatcher/.env com a chave e a instância da Evolution');
    const keyProblem = evolutionKeyProblem(dEnv.EVOLUTION_API_KEY);
    if (keyProblem) fail(`Chave da Evolution fraca: ${keyProblem}`, 'Apague EVOLUTION_API_KEY do config e rode a Etapa 6 de novo: o setup gera uma chave segura.');
    else ok('Chave da Evolution forte (gerada pelo setup)');
  }
}

if (fs.existsSync(rel('crm', '.env'))) ok('crm/.env');
else fail('crm/.env não existe', 'Rode a Etapa 6.');

for (const dir of ['dispatcher', 'crm']) {
  if (fs.existsSync(rel(dir, 'node_modules'))) ok(`${dir}: dependências instaladas`);
  else fail(`${dir}: dependências não instaladas`, `cd ${dir} && npm install`);
}

if (fs.existsSync(rel('setup', 'config.json'))) {
  fail('setup/config.json ainda existe (tem o token da Apify em texto puro)', 'Apague o arquivo: ele já cumpriu o papel.');
} else {
  ok('setup/config.json apagado (sem segredo solto)');
}

// ── Etapa 7: conexões ──────────────────────────────────────────────────────
section('Conexões (Etapa 7)');

if (!dEnv.EVOLUTION_API_URL || !dEnv.EVOLUTION_API_KEY) {
  console.log(`  ${dim('pulado: falta a configuração da Evolution em dispatcher/.env (Etapa 6)')}`);
} else {
  const url = dEnv.EVOLUTION_API_URL.replace(/\/+$/, '');
  const instance = dEnv.EVOLUTION_INSTANCE || 'bdr-instance';
  try {
    const res = await fetch(`${url}/instance/connectionState/${instance}`, {
      headers: { apikey: dEnv.EVOLUTION_API_KEY },
      signal: AbortSignal.timeout(6000),
    });
    if (res.status === 401 || res.status === 403) {
      fail('Evolution API recusou a chave', 'A chave em dispatcher/.env tem que ser a mesma com que o container subiu. Recrie: cd dispatcher && docker compose up -d --force-recreate');
    } else if (res.status === 404) {
      warn(`Evolution API no ar, mas a instância "${instance}" ainda não existe`, `Crie em ${url}/manager e escaneie o QR (Etapa 7, passo 1).`);
    } else if (!res.ok) {
      fail(`Evolution API respondeu ${res.status}`, 'Veja os logs: cd dispatcher && docker compose logs --tail 40');
    } else {
      const data = await res.json().catch(() => ({}));
      const state = data?.instance?.state ?? data?.state ?? 'desconhecido';
      if (state === 'open') ok(`WhatsApp conectado (instância "${instance}")`);
      else warn(`Evolution API no ar, mas o WhatsApp está "${state}"`, `Escaneie o QR de novo em ${url}/manager (Etapa 7, passo 1).`);
    }
  } catch {
    fail(`Evolution API não responde em ${url}`, 'Suba o container e espere ~10s: cd dispatcher && docker compose up -d (o Docker Desktop precisa estar aberto).');
  }
}

// ── Recursos escolhidos ────────────────────────────────────────────────────
section('Recursos');

if (/^(1|true|sim|yes|on)$/i.test(dEnv.TRANSCRIBE_AUDIO || '')) {
  const py = dEnv.PYTHON_CMD || (process.platform === 'win32' ? 'python' : 'python3');
  try {
    execFileSync(py, ['-c', 'import faster_whisper'], { stdio: 'ignore' });
    ok('Transcrição de áudio: faster-whisper instalado');
  } catch {
    fail('Transcrição de áudio ligada, mas o faster-whisper não está instalado', `${py} -m pip install faster-whisper   (depois: ${py} scripts/transcribe-audio.py --warmup --model ${dEnv.WHISPER_MODEL || 'small'})`);
  }
} else {
  ok('Transcrição de áudio desligada (áudio de lead vai pra você ouvir)');
}

try {
  const { resolveClaudeBin } = await import(pathToFileURL(rel('dispatcher', 'src', 'claude-cli.js')).href);
  const bin = await resolveClaudeBin();
  if (bin) ok('Claude Code CLI encontrado (necessário só pro modo automático)');
  else warn('Claude Code CLI não encontrado', 'Só é preciso se você for ligar o modo automático: npm install -g @anthropic-ai/claude-code e depois "claude login".');
} catch {
  warn('Não consegui checar o Claude Code CLI', 'Só é preciso pro modo automático.');
}

// ── Resultado ──────────────────────────────────────────────────────────────
console.log('');
if (fails > 0) {
  console.log(red(bold(`✗ ${fails} problema(s) pra resolver antes de entregar.`)) + (warns ? yellow(`  (${warns} aviso(s))`) : ''));
  console.log(dim('Resolva o que aparece com ✗ e rode de novo: node setup/smoke.mjs\n'));
  process.exit(1);
}
if (warns > 0) {
  console.log(yellow(bold(`! Nada quebrado, mas ${warns} aviso(s) acima pedem atenção.`)));
  console.log(dim('Avisos são pendências (ex.: WhatsApp sem QR) ou itens opcionais. Resolva o que for seu e rode de novo.\n'));
} else {
  console.log(green(bold('✓ Setup ZX LAB concluído.')));
  console.log('');
}
