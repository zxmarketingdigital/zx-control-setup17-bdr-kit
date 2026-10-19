import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// O CRM tem que abrir sem internet (demonstração ao vivo, wi-fi ruim): estilo e fontes são
// arquivos locais. Estes testes impedem a volta do CDN e a referência a arquivo que não existe.
const PUBLIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');

test('o index.html não carrega nada de fora (CDN, Google Fonts, qualquer http)', () => {
  assert.doesNotMatch(html, /cdn\.tailwindcss\.com|fonts\.googleapis\.com|fonts\.gstatic\.com/);
  assert.doesNotMatch(html, /\b(?:src|href)\s*=\s*["']https?:/i);
  assert.equal([...html.matchAll(/<script[^>]*\ssrc=/g)].length, 0, 'sem <script src> externo');
});

test('todo arquivo de assets/ referenciado em src/href existe em public/', () => {
  const refs = [...html.matchAll(/\b(?:src|href)\s*=\s*"([^"#]+)"/g)].map((m) => m[1]).filter((r) => r.startsWith('assets/')); // caminhos '/...' são rotas do servidor, não arquivos
  assert.ok(refs.includes('assets/tailwind.css') && refs.includes('assets/fonts.css'));
  for (const r of refs) assert.ok(fs.existsSync(path.join(PUBLIC, r)), `faltou ${r}`);
});

test('fonts.css aponta para arquivos de fonte que existem', () => {
  const css = fs.readFileSync(path.join(PUBLIC, 'assets', 'fonts.css'), 'utf8');
  const files = [...css.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1]);
  assert.equal(files.length, 2);
  for (const f of files) assert.ok(fs.existsSync(path.join(PUBLIC, 'assets', f)), `faltou ${f}`);
});

test('o tailwind.css vem depois do <style> da página (cascata igual à do Play CDN)', () => {
  assert.ok(html.indexOf('assets/tailwind.css') > html.indexOf('</style>'));
});
