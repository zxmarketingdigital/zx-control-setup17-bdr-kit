// Regras da senha de login do CRM, em CommonJS para o CRM (ESM), o wizard (setup.js) e o
// smoke.mjs usarem a mesma definição.
'use strict';
const crypto = require('node:crypto');

const MIN_LENGTH = 12;
const PLACEHOLDERS = new Set([
  'change-me', 'changeme', 'change-me-please', 'your_password_here', 'your-password', 'yourpassword',
  'password', 'senha', 'senha123', 'admin', 'admin123', 'crm', 'zxlab', 'zxcontrol',
]);

// Sem caracteres que se confundem ao digitar (0/O, 1/l/I).
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

// 16 caracteres em 4 grupos (ex.: Xk3m-Pq9R-tW4n-Jd7s), cerca de 93 bits de entropia.
function generatePassword() {
  const limit = 256 - (256 % ALPHABET.length); // evita viés no sorteio
  const chars = [];
  while (chars.length < 16) {
    for (const b of crypto.randomBytes(32)) {
      if (b < limit && chars.length < 16) chars.push(ALPHABET[b % ALPHABET.length]);
    }
  }
  return [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join('')).join('-');
}

// Devolve o motivo (texto) se a senha não serve, ou null se serve.
function passwordProblem(value) {
  const v = String(value ?? '').trim();
  if (!v) return 'está vazia';
  if (PLACEHOLDERS.has(v.toLowerCase())) return 'é um valor de exemplo';
  if (v.length < MIN_LENGTH) return `é curta demais (mínimo ${MIN_LENGTH} caracteres)`;
  return null;
}

module.exports = { MIN_LENGTH, generatePassword, passwordProblem };
