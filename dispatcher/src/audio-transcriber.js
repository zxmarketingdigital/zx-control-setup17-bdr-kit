// dispatcher/src/audio-transcriber.js
// Mensagens recebidas + transcrição de áudio. Compartilhado entre o dispatcher
// (poller do modo automático) e o CRM (botão "Puxar conversa do WhatsApp" no
// modo manual), por isso não lê config.js: tudo entra por parâmetro.
//
// Transcrição é local (scripts/transcribe-audio.py, faster-whisper na CPU):
// o áudio do lead não vai pra nenhum serviço externo e é apagado logo depois.
// Opt-in: TRANSCRIBE_AUDIO=true no .env (dispatcher e CRM).

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(__dirname, '..', '..', 'scripts', 'transcribe-audio.py');
const HTTP_TIMEOUT_MS = 30_000;

export const MEDIA_LABEL = { audio: 'áudio', image: 'imagem', video: 'vídeo', document: 'arquivo', sticker: 'figurinha' };

export function transcriptionSettings(env = process.env) {
  return {
    enabled: /^(1|true|sim|yes|on)$/i.test(String(env.TRANSCRIBE_AUDIO || '').trim()),
    pythonCmd: env.PYTHON_CMD || (process.platform === 'win32' ? 'python' : 'python3'),
    model: env.WHISPER_MODEL || 'small',
    minConfidence: Number.parseFloat(env.TRANSCRIBE_MIN_CONFIDENCE || '0.5'),
    timeoutMs: Number.parseInt(env.TRANSCRIBE_TIMEOUT_SECONDS || '240', 10) * 1000,
  };
}

// ---------------------------------------------------------------- Evolution

async function evo({ apiUrl, apiKey }, method, endpoint, body) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_MS);
  try {
    const res = await fetch(`${apiUrl.replace(/\/+$/, '')}${endpoint}`, {
      method,
      headers: { apikey: apiKey, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const msg = typeof data === 'string' ? data : JSON.stringify(data);
      throw new Error(`Evolution ${res.status}: ${String(msg).slice(0, 150)}`);
    }
    return data;
  } finally {
    clearTimeout(t);
  }
}

export function mediaType(message) {
  if (!message) return null;
  for (const t of Object.keys(MEDIA_LABEL)) {
    if (message[`${t}Message`]) return t;
  }
  return null;
}

// Converte os registros do findMessages em mensagens recebidas do lead.
export function parseInboundRecords(records) {
  return (records || [])
    .filter((r) => r?.key?.fromMe === false)
    .map((r) => {
      const media = mediaType(r.message);
      const caption = media ? r.message?.[`${media}Message`]?.caption : null;
      return {
        id: r.key?.id,
        key: r.key,
        media,
        seconds: media === 'audio' ? Number(r.message?.audioMessage?.seconds) || null : null,
        text: media
          ? `[${MEDIA_LABEL[media]}]${caption ? ` ${caption}` : ''}`
          : (r.message?.conversation || r.message?.extendedTextMessage?.text || ''),
        timestamp: r.messageTimestamp ? new Date(Number(r.messageTimestamp) * 1000).toISOString() : new Date().toISOString(),
      };
    })
    .filter((r) => r.id && r.text);
}

export async function fetchInboundMessages(evoCfg, phone) {
  const jid = `${String(phone).replace(/\D/g, '')}@s.whatsapp.net`;
  const data = await evo(evoCfg, 'POST', `/chat/findMessages/${evoCfg.instance}`, { where: { key: { remoteJid: jid } } });
  const records = data?.messages?.records
    ?? (Array.isArray(data?.messages) ? data.messages : null)
    ?? (Array.isArray(data) ? data : null);
  // Formato desconhecido não é "nenhuma mensagem": quem decide enviar follow-up precisa saber que não leu.
  if (!Array.isArray(records)) throw new Error('Resposta da Evolution em formato inesperado ao ler mensagens');
  return parseInboundRecords(records);
}

export async function downloadMedia(evoCfg, key) {
  const data = await evo(evoCfg, 'POST', `/chat/getBase64FromMediaMessage/${evoCfg.instance}`, {
    message: { key },
    convertToMp4: false,
  });
  const b64 = data?.base64 || data?.data?.base64;
  if (!b64) throw new Error('Evolution não devolveu o áudio (base64 vazio)');
  return { buffer: Buffer.from(b64, 'base64'), mimetype: data?.mimetype || data?.data?.mimetype || 'audio/ogg' };
}

// ---------------------------------------------------------------- whisper

export function runWhisper(file, { pythonCmd, model, timeoutMs = 240_000 }) {
  return new Promise((resolve) => {
    const child = spawn(pythonCmd, [SCRIPT, file, '--model', model, '--language', 'pt'], {
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      windowsHide: true,
    });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => { child.kill(); resolve({ ok: false, error: `transcrição passou de ${Math.round(timeoutMs / 1000)}s` }); }, timeoutMs);
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (err) => { clearTimeout(timer); resolve({ ok: false, error: `não consegui rodar ${pythonCmd}: ${err.message}` }); });
    child.on('close', () => {
      clearTimeout(timer);
      const line = stdout.trim().split('\n').filter(Boolean).pop();
      try { resolve(JSON.parse(line)); } catch { resolve({ ok: false, error: `saída inesperada do transcritor: ${(stderr || stdout).slice(-200)}` }); }
    });
  });
}

// Avalia se dá pra confiar na transcrição pra responder sem ouvir.
export function assessTranscript(t, minConfidence = 0.5) {
  if (!t?.ok) return { reliable: false, reason: t?.error || 'falha na transcrição' };
  const words = (String(t.text).match(/[\p{L}\p{N}]+/gu) || []).length;
  if (words < 2) return { reliable: false, reason: 'áudio sem fala reconhecível' };
  if (t.no_speech > 0.6) return { reliable: false, reason: 'áudio com pouca fala (ruído ou silêncio)' };
  if (t.confidence < minConfidence) return { reliable: false, reason: `transcrição com baixa confiança (${Math.round(t.confidence * 100)}%)` };
  return { reliable: true, reason: null };
}

// Baixa o áudio da Evolution, transcreve e apaga o arquivo temporário.
export async function transcribeEvolutionAudio(evoCfg, key, settings) {
  const tmp = path.join(os.tmpdir(), `bdr-audio-${String(key?.id || Date.now()).replace(/[^\w-]/g, '')}.ogg`);
  let result;
  try {
    const { buffer } = await downloadMedia(evoCfg, key);
    await fs.writeFile(tmp, buffer);
    result = await runWhisper(tmp, settings);
  } catch (err) {
    result = { ok: false, error: err.message };
  } finally {
    await fs.rm(tmp, { force: true }).catch(() => {});
  }
  const verdict = assessTranscript(result, settings.minConfidence);
  return {
    ok: !!result.ok,
    text: result.ok ? result.text : '',
    duration: result.duration ?? null,
    confidence: result.confidence ?? null,
    no_speech: result.no_speech ?? null,
    model: result.model || settings.model,
    reliable: verdict.reliable,
    reason: verdict.reason,
    transcribed_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------- texto

function mmss(sec) {
  if (!sec && sec !== 0) return '';
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Como uma resposta do lead aparece numa linha de conversa (prompt do Claude,
// timeline do CRM). Áudio transcrito vira o texto, marcado como transcrição.
export function responseText(r) {
  if (r?.media === 'audio' && r.transcript?.text) {
    const tag = `áudio ${mmss(r.transcript.duration)}, transcrição automática${r.transcript.reliable ? '' : ' com baixa confiança'}`;
    return `[${tag}] ${r.transcript.text}`;
  }
  return r?.message ?? '';
}
