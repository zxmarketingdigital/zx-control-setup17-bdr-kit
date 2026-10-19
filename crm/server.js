import 'dotenv/config';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cal from './src/calendar.js';
import * as team from './src/team.js';
import * as packages from './src/packages.js';
import * as clients from './src/clients.js';
import * as invoices from './src/invoices.js';
import * as costs from './src/costs.js';
import * as prenotes from './src/prenotes.js';
import * as dashboard from './src/dashboard.js';
import * as evolution from './src/evolution.js';
import * as simulations from './src/simulations.js';
import { fetchInboundMessages, transcribeEvolutionAudio, transcriptionSettings } from '../dispatcher/src/audio-transcriber.js';
import { detectAutoReply } from '../dispatcher/src/auto-reply-detector.js';
import { loadBookingRules, saveBookingRules, parseRevenueBR, qualificationStatus, formatBRL } from '../dispatcher/src/qualification.js';
import { resolveClaudeBin } from '../dispatcher/src/claude-cli.js';
import { hostGuard } from './src/host-guard.js';
import { runClaudeSandboxed, loadSkillText } from '../dispatcher/src/claude-sandbox.js';
import { collectSecretValues, checkOutgoing } from '../dispatcher/src/outbound-guard.js';
import { parseScheduledAt, toIso } from '../dispatcher/src/tz.js';
import { detectOptOut } from '../dispatcher/src/opt-out-detector.js';
import { createAuth, countRealLeads } from './src/auth.js';
import passwordRules from './src/password.cjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PIPELINE_DIR = path.resolve(__dirname, '..', 'pipeline');
const DOCS_DIR = path.resolve(__dirname, '..', 'docs');
const ROOT_DIR = path.resolve(__dirname, '..');
const PORT = process.env.CRM_PORT ?? 3001;
// Versão do setup (arquivo VERSION na raiz), mostrada no rodapé do painel.
let APP_VERSION = '';
try { APP_VERSION = (await fs.readFile(path.join(ROOT_DIR, 'VERSION'), 'utf8')).trim(); } catch { /* sem VERSION */ }
const MIN_PATTERN_SAMPLE = 5;
// 90s não é sempre suficiente: a 1ª chamada de uma sessão claude -p paga o
// custo de criar o cache do prompt (projeto + skill inteiros), o que sozinho
// já passou de 90s em teste real neste projeto. Chamadas seguintes tendem a
// ser bem mais rápidas (cache hit), mas o limite tem que cobrir a pior hora.
const CLAUDE_SUGGEST_TIMEOUT_MS = 180_000;

// ------- Login e modo demonstração -------
// `npm start` pede senha (CRM_PASSWORD, em crm/.env). `npm run start:demo` abre SEM login,
// para a demonstração com leads fictícios; por isso se recusa a rodar com lead real.
const DEMO = process.argv.includes('--demo') || process.env.CRM_DEMO === '1';
const ENV_FILE = path.join(__dirname, '.env');

async function leadsReaisNoPipeline() {
  try {
    return countRealLeads(JSON.parse(await fs.readFile(path.join(PIPELINE_DIR, 'leads-master.json'), 'utf8')));
  } catch {
    return 0; // sem arquivo ou vazio
  }
}

async function ensurePassword() {
  let senha = (process.env.CRM_PASSWORD ?? '').trim();
  if (!senha) {
    // Instalação anterior ao login (ou .env sem a linha): cria uma senha forte e guarda no .env.
    senha = passwordRules.generatePassword();
    let atual = '';
    try { atual = await fs.readFile(ENV_FILE, 'utf8'); } catch { /* .env novo */ }
    const quebra = atual && !atual.endsWith('\n') ? '\n' : '';
    try {
      await fs.writeFile(ENV_FILE, `${atual}${quebra}\n# Senha de entrada no CRM (gerada automaticamente). Para trocar, edite aqui (12+ caracteres) e reinicie.\nCRM_PASSWORD=${senha}\n`, 'utf8');
      console.log('\n🔐 O CRM agora pede senha. Criei uma e guardei em crm/.env (linha CRM_PASSWORD).');
      console.log('   Para ver: cd crm && npm run senha\n');
    } catch (err) {
      console.log(`\n🔐 O CRM agora pede senha, mas não consegui gravar o crm/.env (${err.message}).`);
      console.log(`   Senha desta execução: ${senha}  (defina CRM_PASSWORD no crm/.env para fixar)\n`);
    }
    process.env.CRM_PASSWORD = senha;
    return senha;
  }
  const problema = passwordRules.passwordProblem(senha);
  if (problema) {
    console.error(`\n✗ CRM_PASSWORD (crm/.env) ${problema}.`);
    console.error('  Apague a linha para o CRM criar uma senha forte, ou escreva uma com 12+ caracteres.\n');
    process.exit(1);
  }
  return senha;
}

if (DEMO) {
  const reais = await leadsReaisNoPipeline();
  if (reais > 0) {
    console.error(`\n✗ O modo demonstração abre o CRM SEM login e só roda com leads fictícios, mas há ${reais} lead(s) real(is) em pipeline/.`);
    console.error('  Para usar o CRM de verdade: npm start (com senha).');
    console.error('  Para uma demonstração: python scripts/seed-demo.py --limpar numa instalação separada.\n');
    process.exit(1);
  }
}
const auth = createAuth({ password: DEMO ? undefined : await ensurePassword(), demo: DEMO });

const app = express();
// Antes de qualquer rota: recusa Host/Origin que não sejam do próprio computador.
app.use(hostGuard(PORT));
app.use(express.json());
// Depois do host-guard e antes de tudo que serve dado: sem login, só a tela de entrada
// e os arquivos de /assets abrem (ver src/auth.js).
app.use(auth.middleware);
app.get('/login', (req, res) => (auth.isAuthorized(req) ? res.redirect(302, '/') : res.sendFile(path.join(__dirname, 'public', 'login.html'))));
app.post('/api/login', auth.login);
app.post('/api/logout', auth.logout);
app.get('/api/session', auth.session);
app.use(express.static(path.join(__dirname, 'public')));

// ------- File helpers (leads-master ainda lê/escreve direto aqui) -------

async function readJson(file, fallback = null) {
  try {
    const raw = await fs.readFile(path.join(PIPELINE_DIR, file), 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

async function writeJsonAtomic(file, data) {
  const fullPath = path.join(PIPELINE_DIR, file);
  const tmp = `${fullPath}.tmp-${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmp, fullPath);
}

// ============================================================
// LEADS
// ============================================================

app.get('/api/version', (req, res) => res.json({ version: APP_VERSION || null }));

app.get('/api/leads', async (req, res) => {
  const master = await readJson('leads-master.json', {}) ?? {};
  const leads = Object.entries(master).map(([id, lead]) => ({ id, ...lead }));
  res.json(leads);
});

app.get('/api/leads/:id', async (req, res) => {
  const master = await readJson('leads-master.json', {}) ?? {};
  const lead = master[req.params.id];
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  res.json({ id: req.params.id, ...lead });
});

app.patch('/api/leads/:id', async (req, res) => {
  const master = await readJson('leads-master.json', {}) ?? {};
  const lead = master[req.params.id];
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  const allowed = ['status', 'responded', 'responded_at', 'responded_via', 'next_touch_due_at', 'name', 'marca', 'category', 'outcome', 'opt_out', 'closed_reason', 'closed_at'];
  for (const key of allowed) if (key in req.body) lead[key] = req.body[key];

  if (req.body.status === 'responded' && !lead.responded) {
    lead.responded = true;
    if (!lead.responded_at) lead.responded_at = new Date().toISOString();
    lead.next_touch_due_at = null;
  }
  if (['cold', 'exhausted', 'meeting_scheduled'].includes(req.body.status)) lead.next_touch_due_at = null;
  if ('outcome' in req.body) lead.outcome_set_at = req.body.outcome ? new Date().toISOString() : null;

  master[req.params.id] = lead;
  await writeJsonAtomic('leads-master.json', master);
  res.json({ id: req.params.id, ...lead });
});

app.post('/api/leads/:id/annotations', async (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'text required' });
  const master = await readJson('leads-master.json', {}) ?? {};
  const lead = master[req.params.id];
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  if (!Array.isArray(lead.annotations)) lead.annotations = [];
  lead.annotations.push({ at: new Date().toISOString(), text: text.trim() });
  master[req.params.id] = lead;
  await writeJsonAtomic('leads-master.json', master);
  res.json({ id: req.params.id, ...lead });
});

app.delete('/api/leads/:id/annotations/:idx', async (req, res) => {
  const master = await readJson('leads-master.json', {}) ?? {};
  const lead = master[req.params.id];
  if (!lead || !Array.isArray(lead.annotations)) return res.status(404).json({ error: 'Annotation not found' });
  const idx = parseInt(req.params.idx, 10);
  if (Number.isNaN(idx) || idx < 0 || idx >= lead.annotations.length) return res.status(404).json({ error: 'Annotation not found' });
  lead.annotations.splice(idx, 1);
  master[req.params.id] = lead;
  await writeJsonAtomic('leads-master.json', master);
  res.json({ id: req.params.id, ...lead });
});

app.get('/api/responses', async (req, res) => res.json(await readJson('responses.json', []) ?? []));
app.get('/api/log', async (req, res) => res.json(await readJson('log-disparos.json', []) ?? []));

// ============================================================
// ABORDAGENS E FOLLOW-UPS (Evolution — status + resposta manual)
// ============================================================

app.get('/api/evolution/status', async (req, res) => res.json(await evolution.getStatus()));

// Registra o que o lead respondeu (captura manual — não há webhook de inbound
// nesse kit). Grava em responses.json no mesmo formato que um webhook usaria,
// e marca o lead como respondido.
app.post('/api/leads/:id/inbound', async (req, res) => {
  const { message } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'message required' });
  const master = await readJson('leads-master.json', {}) ?? {};
  const lead = master[req.params.id];
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  const entry = { lead_id: req.params.id, phone: lead.phone, received_at: new Date().toISOString(), message: message.trim() };
  const responses = await readJson('responses.json', []) ?? [];
  responses.push(entry);
  await writeJsonAtomic('responses.json', responses);

  lead.responded = true;
  lead.responded_at = entry.received_at;
  lead.status = 'responded';
  lead.next_touch_due_at = null;
  master[req.params.id] = lead;
  await writeJsonAtomic('leads-master.json', master);

  res.json({ id: req.params.id, ...lead });
});

// Envia uma resposta manual AGORA, direto pela Evolution — sem fila nem pacing
// do dispatcher. É uma resposta humana a uma conversa em andamento, não um
// toque da cadência automática (1-6): não mexe em current_touch/next_touch_due_at.
app.post('/api/leads/:id/manual-message', async (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'text required' });
  const master = await readJson('leads-master.json', {}) ?? {};
  const lead = master[req.params.id];
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  if (!lead.phone) return res.status(400).json({ error: 'Lead sem telefone' });
  if (lead.no_send) return res.status(400).json({ error: 'Lead de demonstração: o envio está bloqueado.' });

  const logEntry = { timestamp: new Date().toISOString(), lead_id: req.params.id, touch: 'manual', phone: lead.phone, status: 'failed', error: null };
  try {
    await evolution.sendMessage(lead.phone, text.trim());
    logEntry.status = 'sent';
  } catch (err) {
    logEntry.error = err.message;
  }
  const log = await readJson('log-disparos.json', []) ?? [];
  log.push(logEntry);
  await writeJsonAtomic('log-disparos.json', log);

  if (logEntry.status === 'sent') {
    if (!Array.isArray(lead.history)) lead.history = [];
    lead.history.push({ touch: 'manual', sent_at: logEntry.timestamp, copy: text.trim() });
    master[req.params.id] = lead;
    await writeJsonAtomic('leads-master.json', master);
  } else {
    return res.status(502).json({ error: logEntry.error || 'Falha ao enviar' });
  }
  res.json({ id: req.params.id, ...lead });
});

// ── Sugestão de resposta via Claude Code headless (mesmo padrão do modo
// automático em dispatcher/src/auto-responder.js). A conversa tem texto de
// desconhecidos (o lead), então o modelo roda SEM ferramentas, sem MCP e numa
// pasta temporária vazia, com a skill embutida no contexto (claude-sandbox.js):
// um lead que escreva "leia o arquivo .env" não tem como fazer o modelo ler
// nada. A sugestão ainda passa pelo filtro de saída (outbound-guard.js) antes de
// chegar na tela. Exige o Claude Code CLI instalado à parte do app Desktop; sem
// ele, cai no fallback de "copiar prompt" no front.
app.post('/api/leads/:id/suggest-reply', async (req, res) => {
  const prompt = req.body?.prompt;
  if (!prompt?.trim()) return res.status(400).json({ error: 'prompt é obrigatório' });
  const bin = await resolveClaudeBin();
  if (!bin) {
    return res.status(503).json({ error: 'Claude Code CLI não encontrado. Instale com "npm install -g @anthropic-ai/claude-code" e rode "claude login" uma vez — ou use "Copiar prompt" abaixo.' });
  }
  try {
    const skillText = await loadSkillText(ROOT_DIR);
    const stdout = await runClaudeSandboxed({ prompt, skillText, timeoutMs: CLAUDE_SUGGEST_TIMEOUT_MS });
    let outer;
    try {
      outer = JSON.parse(stdout);
    } catch {
      return res.status(502).json({ error: 'Claude Code não devolveu uma resposta interpretável.' });
    }
    const text = String(outer.result ?? outer.output ?? '').trim();
    if (!text) return res.status(502).json({ error: 'Claude Code não devolveu texto.' });
    const guard = checkOutgoing(text, { secrets: await collectSecretValues(ROOT_DIR) });
    if (!guard.ok) {
      console.error('[suggest-reply] sugestão barrada pelo filtro de segurança:', guard.reason);
      return res.status(422).json({ error: `Sugestão barrada pelo filtro de segurança (${guard.reason}). Escreva a resposta você mesmo.` });
    }
    res.json({ text });
  } catch (err) {
    console.error('[suggest-reply]', err.code, err.message);
    if (err.code === 'ENOENT') {
      return res.status(503).json({ error: 'Claude Code CLI não encontrado. Instale com "npm install -g @anthropic-ai/claude-code" e rode "claude login" uma vez — ou use "Copiar prompt" abaixo.' });
    }
    if (err.killed || err.signal) {
      return res.status(504).json({ error: 'Claude Code demorou demais pra responder. Tente de novo ou use "Copiar prompt".' });
    }
    res.status(500).json({ error: `Falha ao chamar Claude Code: ${(err.message || '').slice(0, 200)}` });
  }
});

// ── Áudio: puxar conversa do WhatsApp + transcrição local (modo manual) ──
// No modo manual o dispatcher não faz polling de respostas. Aqui você puxa sob
// demanda as mensagens do lead direto da Evolution, e os áudios já vêm
// transcritos (se TRANSCRIBE_AUDIO=true). O cursor é o mesmo do poller do modo
// automático, então a mesma mensagem nunca é processada duas vezes.
const evoCfg = () => ({
  apiUrl: process.env.EVOLUTION_API_URL || 'http://localhost:8080',
  apiKey: process.env.EVOLUTION_API_KEY || '',
  instance: process.env.EVOLUTION_INSTANCE || 'bdr-instance',
});

app.get('/api/transcription/status', (req, res) => {
  const s = transcriptionSettings();
  res.json({ enabled: s.enabled, model: s.model, min_confidence: s.minConfidence });
});

app.post('/api/leads/:id/pull-whatsapp', async (req, res) => {
  const master = await readJson('leads-master.json', {}) ?? {};
  const lead = master[req.params.id];
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  if (!lead.phone) return res.status(400).json({ error: 'Lead sem telefone' });

  let msgs;
  try {
    msgs = await fetchInboundMessages(evoCfg(), lead.phone);
  } catch (err) {
    return res.status(502).json({ error: `Não consegui ler o WhatsApp: ${err.message}` });
  }

  const settings = transcriptionSettings();
  const responses = await readJson('responses.json', []) ?? [];
  const cursor = await readJson('inbound-cursor.json', {}) ?? {};
  const seen = new Set(cursor[req.params.id] || []);
  const known = new Set(responses.filter((r) => r.lead_id === req.params.id).map((r) => r.message_id || `txt:${r.message}`));
  const lastOutbound = (lead.history || [])[lead.history.length - 1];
  const added = [];
  let optOutDetected = false;

  for (const m of msgs.sort((a, b) => a.timestamp.localeCompare(b.timestamp))) {
    if (seen.has(m.id) || known.has(m.id) || (!m.media && known.has(`txt:${m.text}`))) { seen.add(m.id); continue; }
    seen.add(m.id);
    const entry = { lead_id: req.params.id, phone: lead.phone, received_at: m.timestamp, message: m.text, message_id: m.id, source: 'pull' };
    if (m.media) entry.media = m.media;
    if (!m.media) {
      const det = detectAutoReply({ message: m.text, sentAt: lastOutbound?.sent_at, receivedAt: m.timestamp });
      if (det.isAutoReply) entry.possible_auto_reply = det.reasons;
    }
    if (m.media === 'audio') {
      entry.media_key = m.key;
      if (settings.enabled) entry.transcript = await transcribeEvolutionAudio(evoCfg(), m.key, settings);
    }
    responses.push(entry);
    added.push(entry);
  }

  cursor[req.params.id] = [...seen].slice(-50);
  await writeJsonAtomic('inbound-cursor.json', cursor);
  if (added.length) {
    await writeJsonAtomic('responses.json', responses);
    if (added.some((e) => !e.possible_auto_reply)) {
      lead.responded = true;
      lead.responded_at = lead.responded_at || added[added.length - 1].received_at;
      if (lead.status === 'active') lead.status = 'responded';
      lead.next_touch_due_at = null;
      // Pediu pra parar (regra, sem modelo): fecha como opt-out. Você pode desfazer na tela do lead.
      const stopped = added.some((e) => !e.possible_auto_reply && detectOptOut(e.transcript?.ok ? e.transcript.text : e.message).optOut);
      if (stopped) {
        const now = new Date().toISOString();
        lead.opt_out = true;
        lead.status = 'cold';
        lead.closed_reason = 'opt_out';
        lead.closed_at = now;
        if (!Array.isArray(lead.annotations)) lead.annotations = [];
        lead.annotations.push({ at: now, text: 'Lead pediu pra parar de receber mensagem: marcado como opt-out, nunca será reabordado.' });
        optOutDetected = true;
      }
      master[req.params.id] = lead;
      await writeJsonAtomic('leads-master.json', master);
    }
  }
  res.json({
    opt_out_detected: optOutDetected,
    added: added.length,
    audios: added.filter((e) => e.media === 'audio').length,
    transcribed: added.filter((e) => e.transcript?.ok).length,
    transcription_enabled: settings.enabled,
  });
});

// Transcreve (ou re-transcreve) um áudio já registrado — ex.: chegou quando a
// transcrição estava desligada, ou a primeira tentativa falhou.
app.post('/api/responses/transcribe', async (req, res) => {
  const { lead_id, message_id } = req.body || {};
  const settings = transcriptionSettings();
  if (!settings.enabled) return res.status(400).json({ error: 'Transcrição desligada. Ligue TRANSCRIBE_AUDIO=true no crm/.env (veja docs/transcricao-audio.md)' });
  const responses = await readJson('responses.json', []) ?? [];
  const entry = responses.find((r) => r.lead_id === lead_id && r.message_id === message_id && r.media === 'audio');
  if (!entry) return res.status(404).json({ error: 'Áudio não encontrado' });
  if (!entry.media_key) return res.status(400).json({ error: 'Esse áudio foi registrado sem a referência do WhatsApp. Use "Puxar conversa do WhatsApp".' });
  entry.transcript = await transcribeEvolutionAudio(evoCfg(), entry.media_key, settings);
  await writeJsonAtomic('responses.json', responses);
  res.json(entry);
});

// ── Qualificar antes de agendar (faturamento + autoridade) ──
// Regra lida pelo dispatcher (modo automático) e pelo prompt manual.
app.get('/api/booking-rules', async (req, res) => {
  const rules = await loadBookingRules(PIPELINE_DIR);
  res.json({ ...rules, min_label: rules.min_annual_revenue ? formatBRL(rules.min_annual_revenue) : null });
});

app.post('/api/booking-rules', async (req, res) => {
  const body = req.body || {};
  const rules = await loadBookingRules(PIPELINE_DIR);
  if ('require_qualification' in body && !!body.require_qualification) {
    const autoState = await readJson('auto-mode.json', null);
    if (!autoState?.enabled) return res.status(409).json({ error: 'Ligue o modo automático antes de exigir qualificação — sem ele, ninguém aplica a regra.' });
  }
  if ('require_qualification' in body) rules.require_qualification = !!body.require_qualification;
  if ('min_annual_revenue_text' in body) {
    const txt = String(body.min_annual_revenue_text || '').trim();
    if (!txt) rules.min_annual_revenue = null;
    else {
      const parsed = parseRevenueBR(txt);
      if (!parsed) return res.status(400).json({ error: 'Não entendi o valor. Ex.: "1 milhão por ano", "80 mil por mês", "500000".' });
      rules.min_annual_revenue = parsed.annual;
    }
  }
  const saved = await saveBookingRules(PIPELINE_DIR, rules);
  res.json({ ...saved, min_label: saved.min_annual_revenue ? formatBRL(saved.min_annual_revenue) : null });
});

// Registro manual (você falou com o lead por telefone, áudio etc.).
// body: { revenue_text?, authority_kind?, authority_text?, clear? }
app.post('/api/leads/:id/qualification', async (req, res) => {
  const master = await readJson('leads-master.json', {}) ?? {};
  const lead = master[req.params.id];
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  const body = req.body || {};
  const now = new Date().toISOString();
  const q = body.clear ? {} : { ...(lead.qualification || {}) };
  if (!body.clear && String(body.revenue_text || '').trim()) {
    const parsed = parseRevenueBR(body.revenue_text);
    if (!parsed) return res.status(400).json({ error: 'Não entendi o faturamento. Ex.: "8 milhões por ano", "120 mil por mês".' });
    q.revenue = { annual: parsed.annual, quote: String(body.revenue_text).trim(), source: 'manual', at: now };
  }
  if (!body.clear && body.authority_kind) {
    if (!['decisor', 'decisor_na_call', 'nao_decisor'].includes(body.authority_kind)) return res.status(400).json({ error: 'authority_kind inválido' });
    q.authority = { kind: body.authority_kind, quote: String(body.authority_text || '').trim() || '(registrado por você)', source: 'manual', at: now };
  }
  lead.qualification = q;
  master[req.params.id] = lead;
  await writeJsonAtomic('leads-master.json', master);
  const rules = await loadBookingRules(PIPELINE_DIR);
  res.json({ qualification: q, status: qualificationStatus(q, rules) });
});

// ── Modo automático (opt-in) — o dispatcher lê o mesmo arquivo a cada ciclo ──
const AUTO_MODE_DEFAULTS = { enabled: false, paused_leads: [], audio_auto_reply: false };
const autoModeView = (s) => ({ enabled: !!s.enabled, paused_leads: s.paused_leads || [], audio_auto_reply: !!s.audio_auto_reply });

app.get('/api/auto-mode', async (req, res) => {
  const state = await readJson('auto-mode.json', null);
  res.json({ ...autoModeView(state || AUTO_MODE_DEFAULTS), transcription_enabled: transcriptionSettings().enabled });
});

app.post('/api/auto-mode', async (req, res) => {
  const state = (await readJson('auto-mode.json', null)) || { ...AUTO_MODE_DEFAULTS };
  if ('enabled' in (req.body || {})) state.enabled = !!req.body.enabled;
  if ('audio_auto_reply' in (req.body || {})) state.audio_auto_reply = !!req.body.audio_auto_reply;
  await writeJsonAtomic('auto-mode.json', state);
  res.json(autoModeView(state));
});

app.post('/api/leads/:id/auto-mode', async (req, res) => {
  const state = (await readJson('auto-mode.json', null)) || { ...AUTO_MODE_DEFAULTS };
  const set = new Set(state.paused_leads || []);
  if (req.body.paused) set.add(req.params.id); else set.delete(req.params.id);
  state.paused_leads = [...set];
  await writeJsonAtomic('auto-mode.json', state);
  res.json(state);
});

app.get('/api/flagged-auto-replies', async (req, res) => res.json(await readJson('flagged-auto-replies.json', []) ?? []));

app.post('/api/flagged-auto-replies/:index/dismiss', async (req, res) => {
  const idx = parseInt(req.params.index, 10);
  const flagged = await readJson('flagged-auto-replies.json', []) ?? [];
  if (Number.isNaN(idx) || idx < 0 || idx >= flagged.length) return res.status(404).json({ error: 'Not found' });
  flagged.splice(idx, 1);
  await writeJsonAtomic('flagged-auto-replies.json', flagged);
  res.json({ ok: true });
});

// ============================================================
// SIMULAÇÕES — conversas de docs/simulacoes-atendimento.md + análise de copy
// ============================================================

app.get('/api/simulations', async (req, res) => {
  try {
    const data = await simulations.loadSimulations(DOCS_DIR);
    data.notes = await readJson('simulation-notes.json', {}) ?? {};
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: `Não consegui ler docs/simulacoes-atendimento.md: ${err.message}` });
  }
});

// Nota de revisão por mensagem: { key: "A1#3", note, verdict: "ok" | "ajustar" | null }
app.post('/api/simulations/notes', async (req, res) => {
  const { key, note = '', verdict = null } = req.body || {};
  if (!/^[AB]\d+#\d+$|^BA#\d+$/.test(String(key || ''))) return res.status(400).json({ error: 'key inválida' });
  if (verdict !== null && !['ok', 'ajustar'].includes(verdict)) return res.status(400).json({ error: 'verdict inválido' });
  const notes = await readJson('simulation-notes.json', {}) ?? {};
  if (!String(note).trim() && !verdict) delete notes[key];
  else notes[key] = { note: String(note).slice(0, 2000), verdict, updated_at: new Date().toISOString() };
  await writeJsonAtomic('simulation-notes.json', notes);
  res.json({ ok: true, notes });
});

app.get('/api/stats', async (req, res) => {
  const master = await readJson('leads-master.json', {}) ?? {};
  const stats = {
    total: 0, active: 0, responded: 0, cold: 0, exhausted: 0, meeting_scheduled: 0, needs_review: 0, skipped: 0,
    by_touch: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }, by_category: {},
    outcomes: { reuniao_agendada: 0, cliente_convertido: 0, proposta_aceita: 0, proposta_recusada: 0, no_show: 0 },
  };
  for (const lead of Object.values(master)) {
    stats.total++;
    if (lead.status && stats[lead.status] !== undefined) stats[lead.status]++;
    if (lead.current_touch && stats.by_touch[lead.current_touch] !== undefined) stats.by_touch[lead.current_touch]++;
    if (lead.category) stats.by_category[lead.category] = (stats.by_category[lead.category] || 0) + 1;
    if (lead.outcome && stats.outcomes[lead.outcome] !== undefined) stats.outcomes[lead.outcome]++;
  }
  res.json(stats);
});

app.get('/api/outcomes/patterns', async (req, res) => {
  const master = await readJson('leads-master.json', {}) ?? {};
  const byAngle = {}, byCategory = {};
  let totalWithOutcome = 0;
  for (const lead of Object.values(master)) {
    if (!lead.outcome) continue;
    totalWithOutcome++;
    const angle = lead.crm_notes?.angle || lead.angle || 'desconhecido';
    const category = lead.category || 'sem_categoria';
    for (const [groups, key] of [[byAngle, angle], [byCategory, category]]) {
      if (!groups[key]) groups[key] = { total: 0, reuniao_agendada: 0, cliente_convertido: 0, proposta_aceita: 0, proposta_recusada: 0, no_show: 0 };
      groups[key].total++;
      groups[key][lead.outcome] = (groups[key][lead.outcome] || 0) + 1;
    }
  }
  function enrichGroups(groups) {
    return Object.entries(groups).map(([key, g]) => {
      const conversoes = g.reuniao_agendada + g.proposta_aceita + g.cliente_convertido;
      return {
        key, ...g, conversoes,
        taxa_conversao: g.total > 0 ? +(conversoes / g.total * 100).toFixed(1) : 0,
        taxa_reuniao:   g.total > 0 ? +(g.reuniao_agendada  / g.total * 100).toFixed(1) : 0,
        taxa_aceite:    g.total > 0 ? +(g.proposta_aceita   / g.total * 100).toFixed(1) : 0,
        taxa_recusa:    g.total > 0 ? +(g.proposta_recusada / g.total * 100).toFixed(1) : 0,
        taxa_noshow:    g.total > 0 ? +(g.no_show           / g.total * 100).toFixed(1) : 0,
        validated: g.total >= MIN_PATTERN_SAMPLE,
      };
    }).sort((a, b) => b.taxa_conversao - a.taxa_conversao);
  }
  res.json({
    total_with_outcome: totalWithOutcome,
    min_sample: MIN_PATTERN_SAMPLE,
    sufficient_data: totalWithOutcome >= MIN_PATTERN_SAMPLE,
    by_angle: enrichGroups(byAngle),
    by_category: enrichGroups(byCategory),
    generated_at: new Date().toISOString(),
  });
});

// ============================================================
// GOOGLE CALENDAR
// ============================================================

app.get('/auth/google', async (req, res) => {
  try { res.redirect(await cal.getAuthUrl()); }
  catch (err) { res.status(500).send(`<pre>Erro: ${err.message}</pre>`); }
});

app.get('/auth/google/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error) return res.status(400).send(`<pre>OAuth error: ${error}</pre>`);
  if (!code) return res.status(400).send('<pre>Faltou ?code= na callback.</pre>');
  try {
    await cal.handleAuthCallback(code);
    res.send(`<html><body style="font-family:system-ui;padding:2rem;background:#0d1219;color:#f1f5f9;">
      <h2 style="margin:0 0 0.5rem;color:#60a5fa;">Google Calendar conectado.</h2>
      <p style="color:#94a3b8;">Token salvo em <code>crm/google-token.json</code>. Pode fechar essa aba e voltar pro CRM.</p>
    </body></html>`);
  } catch (err) { res.status(500).send(`<pre>${err.message}</pre>`); }
});

app.get('/api/calendar/status', async (req, res) => res.json(await cal.isCalendarConnected()));

// Horário de reuniões (diferente da janela de disparo do dispatcher)
const MEETING_START_HOUR = parseInt(process.env.MEETING_START_HOUR ?? '9', 10);
const MEETING_END_HOUR = parseInt(process.env.MEETING_END_HOUR ?? '18', 10);

// Usado pelo modo automático pra oferecer só horário que existe de verdade.
app.get('/api/calendar/free-slots', async (req, res) => {
  const status = await cal.isCalendarConnected();
  if (!status.connected) return res.json({ connected: false, slots: [], meeting_hours: [MEETING_START_HOUR, MEETING_END_HOUR] });
  try {
    const slots = await cal.getFreeSlots({
      days: parseInt(req.query.days ?? '4', 10),
      durationMinutes: parseInt(req.query.duration ?? '30', 10),
      startHour: MEETING_START_HOUR,
      endHour: MEETING_END_HOUR,
    });
    res.json({ connected: true, slots, meeting_hours: [MEETING_START_HOUR, MEETING_END_HOUR] });
  } catch (err) {
    res.json({ connected: true, slots: [], error: err.message, meeting_hours: [MEETING_START_HOUR, MEETING_END_HOUR] });
  }
});

// ============================================================
// MEETINGS
// ============================================================

app.post('/api/leads/:id/meeting', async (req, res) => {
  const { scheduled_at, duration_minutes = 30, notes = '', add_google_meet = true, require_free = false } = req.body;
  if (!scheduled_at) return res.status(400).json({ error: 'scheduled_at required' });
  // Horário sem deslocamento ("2026-10-20T10:00") vale no fuso configurado (TIMEZONE).
  const when = parseScheduledAt(scheduled_at);
  if (!when) return res.status(400).json({ error: 'scheduled_at inválido' });
  const startISO = toIso(when);
  const master = await readJson('leads-master.json', {}) ?? {};
  const lead = master[req.params.id];
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  if (lead.meeting && ['scheduled', 'confirmed'].includes(lead.meeting.status)) {
    return res.status(409).json({ error: 'Lead já tem reunião ativa. Use PATCH pra reagendar.' });
  }
  // Agendamento feito pelo modo automático: nunca por cima de outro compromisso.
  // (O agendamento manual pela tela continua livre — quem agenda na mão sabe da própria agenda.)
  if (require_free) {
    try {
      if (!(await cal.isSlotFree(startISO, duration_minutes))) {
        return res.status(409).json({ error: 'Horário ocupado na agenda', code: 'slot_busy' });
      }
    } catch (err) {
      return res.status(503).json({ error: `Não deu pra conferir a agenda: ${err.message}`, code: 'calendar_unavailable' });
    }
  }
  try {
    const calEvent = await cal.createMeeting({
      lead: { id: req.params.id, ...lead },
      startTime: startISO, durationMinutes: duration_minutes, notes, addMeet: add_google_meet,
    });
    lead.meeting = {
      scheduled_at: toIso(new Date(calEvent.start_time)), end_time: toIso(new Date(calEvent.end_time)), duration_minutes,
      calendar_event_id: calEvent.calendar_event_id, calendar_html_link: calEvent.calendar_html_link,
      google_meet_url: calEvent.google_meet_url, status: 'scheduled',
      created_at: new Date().toISOString(), confirmation_sent_at: null, notes: notes || null,
    };
    lead.status = 'meeting_scheduled'; lead.next_touch_due_at = null;
    if (!lead.outcome) { lead.outcome = 'reuniao_agendada'; lead.outcome_set_at = new Date().toISOString(); }
    master[req.params.id] = lead;
    await writeJsonAtomic('leads-master.json', master);
    res.json({ id: req.params.id, ...lead });
  } catch (err) { console.error('createMeeting error:', err.message); res.status(500).json({ error: err.message }); }
});

app.patch('/api/leads/:id/meeting', async (req, res) => {
  const master = await readJson('leads-master.json', {}) ?? {};
  const lead = master[req.params.id];
  if (!lead || !lead.meeting) return res.status(404).json({ error: 'Meeting not found' });
  const { scheduled_at, duration_minutes, notes, status, confirmed_at } = req.body;
  const newStart = scheduled_at ? parseScheduledAt(scheduled_at) : null;
  if (scheduled_at && !newStart) return res.status(400).json({ error: 'scheduled_at inválido' });
  try {
    if (scheduled_at || notes !== undefined) {
      await cal.updateMeeting({
        eventId: lead.meeting.calendar_event_id,
        startTime: newStart ? toIso(newStart) : lead.meeting.scheduled_at,
        durationMinutes: duration_minutes || lead.meeting.duration_minutes,
        notes: notes !== undefined ? notes : lead.meeting.notes,
        lead: { id: req.params.id, ...lead },
      });
      if (scheduled_at) {
        const startMs = newStart.getTime();
        const dur = duration_minutes || lead.meeting.duration_minutes || 30;
        lead.meeting.scheduled_at = toIso(new Date(startMs));
        lead.meeting.end_time = toIso(new Date(startMs + dur * 60_000));
      }
      if (duration_minutes) lead.meeting.duration_minutes = duration_minutes;
      if (notes !== undefined) lead.meeting.notes = notes;
    }
    if (status) {
      lead.meeting.status = status;
      if (status === 'confirmed' && !lead.meeting.confirmed_at) lead.meeting.confirmed_at = new Date().toISOString();
      if (status === 'cancelled') {
        lead.status = 'responded'; lead.outcome = null; lead.outcome_set_at = null;
        try { await cal.deleteMeeting(lead.meeting.calendar_event_id); } catch (e) { console.warn(e.message); }
      }
      if (status === 'no_show') { lead.outcome = 'no_show'; lead.outcome_set_at = new Date().toISOString(); lead.status = 'cold'; }
    }
    if (confirmed_at) lead.meeting.confirmed_at = confirmed_at;
    master[req.params.id] = lead;
    await writeJsonAtomic('leads-master.json', master);
    res.json({ id: req.params.id, ...lead });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

app.delete('/api/leads/:id/meeting', async (req, res) => {
  const master = await readJson('leads-master.json', {}) ?? {};
  const lead = master[req.params.id];
  if (!lead || !lead.meeting) return res.status(404).json({ error: 'Meeting not found' });
  try {
    try { await cal.deleteMeeting(lead.meeting.calendar_event_id); } catch (e) { console.warn(e.message); }
    lead.meeting = null;
    if (lead.status === 'meeting_scheduled') lead.status = 'responded';
    if (lead.outcome === 'reuniao_agendada') { lead.outcome = null; lead.outcome_set_at = null; }
    master[req.params.id] = lead;
    await writeJsonAtomic('leads-master.json', master);
    res.json({ id: req.params.id, ...lead });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/meetings', async (req, res) => {
  const master = await readJson('leads-master.json', {}) ?? {};
  const meetings = [];
  for (const [id, lead] of Object.entries(master)) {
    if (!lead.meeting) continue;
    meetings.push({ id, marca: lead.marca, name: lead.name, phone: lead.phone, category: lead.category, meeting: lead.meeting });
  }
  meetings.sort((a, b) => (a.meeting.scheduled_at || '').localeCompare(b.meeting.scheduled_at || ''));
  res.json(meetings);
});

// ============================================================
// TEAM
// ============================================================
app.get('/api/team', async (req, res) => res.json(await team.list()));
app.post('/api/team', async (req, res) => {
  try { res.status(201).json(await team.create(req.body)); }
  catch (err) { res.status(400).json({ error: err.message }); }
});
app.patch('/api/team/:id', async (req, res) => {
  try { const upd = await team.update(req.params.id, req.body); if (!upd) return res.status(404).json({error:'Not found'}); res.json(upd); }
  catch (err) { res.status(400).json({ error: err.message }); }
});
app.delete('/api/team/:id', async (req, res) => {
  const ok = await team.remove(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// ============================================================
// PACKAGES
// ============================================================
app.get('/api/packages', async (req, res) => res.json(await packages.list()));
app.post('/api/packages', async (req, res) => {
  try { res.status(201).json(await packages.create(req.body)); }
  catch (err) { res.status(400).json({ error: err.message }); }
});
app.patch('/api/packages/:id', async (req, res) => {
  try { const upd = await packages.update(req.params.id, req.body); if (!upd) return res.status(404).json({error:'Not found'}); res.json(upd); }
  catch (err) { res.status(400).json({ error: err.message }); }
});
app.delete('/api/packages/:id', async (req, res) => {
  const ok = await packages.remove(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// ============================================================
// CLIENTS
// ============================================================
app.get('/api/clients', async (req, res) => res.json(await clients.list()));
app.get('/api/clients/:id', async (req, res) => {
  const c = await clients.get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  res.json(c);
});
app.post('/api/clients', async (req, res) => {
  try { res.status(201).json(await clients.create(req.body)); }
  catch (err) { res.status(400).json({ error: err.message }); }
});
app.patch('/api/clients/:id', async (req, res) => {
  try { const upd = await clients.update(req.params.id, req.body); if (!upd) return res.status(404).json({error:'Not found'}); res.json(upd); }
  catch (err) { res.status(400).json({ error: err.message }); }
});
app.delete('/api/clients/:id', async (req, res) => {
  const ok = await clients.remove(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});
app.post('/api/clients/from-lead/:leadId', async (req, res) => {
  try { res.status(201).json(await clients.fromLead(req.params.leadId, req.body)); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

// ============================================================
// INVOICES
// ============================================================
app.get('/api/invoices', async (req, res) => {
  res.json(await invoices.list({ clientId: req.query.client_id, monthRef: req.query.month_ref }));
});
app.patch('/api/invoices/:id', async (req, res) => {
  try { const upd = await invoices.update(req.params.id, req.body); if (!upd) return res.status(404).json({error:'Not found'}); res.json(upd); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

// ============================================================
// COSTS
// ============================================================
app.get('/api/costs', async (req, res) => res.json(await costs.list()));
app.post('/api/costs', async (req, res) => {
  try { res.status(201).json(await costs.create(req.body)); }
  catch (err) { res.status(400).json({ error: err.message }); }
});
app.patch('/api/costs/:id', async (req, res) => {
  try { const upd = await costs.update(req.params.id, req.body); if (!upd) return res.status(404).json({error:'Not found'}); res.json(upd); }
  catch (err) { res.status(400).json({ error: err.message }); }
});
app.delete('/api/costs/:id', async (req, res) => {
  const ok = await costs.remove(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// ============================================================
// PRENOTES
// ============================================================
app.get('/api/prenotes', async (req, res) => res.json(await prenotes.list({ clientId: req.query.client_id })));
app.post('/api/prenotes', async (req, res) => {
  try { res.status(201).json(await prenotes.generate(req.body)); }
  catch (err) { res.status(400).json({ error: err.message }); }
});
app.get('/api/prenotes/:id', async (req, res) => {
  const p = await prenotes.get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  res.json(p);
});
app.delete('/api/prenotes/:id', async (req, res) => {
  const ok = await prenotes.remove(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// ============================================================
// DASHBOARDS
// ============================================================
app.get('/api/dashboard/executive', async (req, res) => res.json(await dashboard.executive()));
app.get('/api/dashboard/financial', async (req, res) => res.json(await dashboard.financial({ monthRef: req.query.month_ref })));

// ============================================================
// Só no próprio computador: sem host, o Express escutaria em todas as interfaces
// e qualquer pessoa na mesma rede (Wi-Fi de coworking) alcançaria o CRM.
app.listen(PORT, '127.0.0.1', () => {
  console.log(`CRM running at http://localhost:${PORT} (só neste computador)`);
  console.log(`Reading pipeline from: ${PIPELINE_DIR}`);
  console.log(DEMO
    ? '⚠  MODO DEMONSTRAÇÃO: o CRM está SEM LOGIN. Use só com os dados fictícios do seed-demo.py.'
    : 'Login: ligado (senha em crm/.env, linha CRM_PASSWORD; para ver: npm run senha)');
  console.log(`Calendar OAuth: http://localhost:${PORT}/auth/google`);
});