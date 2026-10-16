// Chave da Evolution API (ZX Control 7 · Setup 17).
// Ela protege o envio de WhatsApp pelo número do aluno. Usada pelo wizard
// (setup/setup.js) e pelo teste final (setup/smoke.mjs): uma regra só.
'use strict';

const crypto = require('crypto');

// 48 caracteres hex aleatórios.
function generateEvolutionKey() {
  return crypto.randomBytes(24).toString('hex');
}

// Devolve o motivo da recusa em português, ou null se a chave serve.
function evolutionKeyProblem(key) {
  const k = String(key ?? '').trim();
  if (!k) return 'está vazia';
  if (/\s/.test(k)) return 'tem espaço';
  if (k.length < 24) return 'tem menos de 24 caracteres';
  if (/^(.)\1+$/.test(k)) return 'repete o mesmo caractere';
  if (/(change.?me|troque|sua.?chave|minha.?chave|your.?(api.?)?key|placeholder|exemplo|example|password|senha|secret|apikey|api.?key)/i.test(k)) {
    return 'parece um texto de exemplo';
  }
  return null;
}

module.exports = { generateEvolutionKey, evolutionKeyProblem };
