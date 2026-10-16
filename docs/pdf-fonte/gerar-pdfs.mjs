// docs/pdf-fonte/gerar-pdfs.mjs
// Gera os PDFs de docs/ a partir dos HTMLs desta pasta, com o Chrome (ou Edge)
// em modo headless. Roda no Windows, no Mac e no Linux:
//
//   node docs/pdf-fonte/gerar-pdfs.mjs
//
// Precisa de Chrome, Chromium ou Edge instalado e de internet (as fontes Inter e
// JetBrains Mono vêm do Google Fonts). Se o navegador não for achado, aponte-o:
//   CHROME_PATH="/caminho/do/chrome" node docs/pdf-fonte/gerar-pdfs.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const docs = path.resolve(here, '..');

const PDFS = [
  ['manual-instalacao.html', 'manual-instalacao-setup17.pdf'],
  ['manual-uso.html', 'manual-uso-setup17.pdf'],
  ['contingencia.html', 'Contingencia-WhatsApp-Setup17.pdf'],
  ['contingencia-mobile.html', 'Contingencia-WhatsApp-Setup17-Mobile.pdf'],
];

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    // Windows
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    // Mac
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    // Linux
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p));
}

const browser = findBrowser();
if (!browser) {
  console.error('Não achei Chrome, Chromium nem Edge. Instale um deles ou defina CHROME_PATH.');
  process.exit(1);
}

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'setup17-pdf-'));
try {
  for (const [html, pdf] of PDFS) {
    const out = path.join(docs, pdf);
    console.log(`→ ${pdf}`);
    execFileSync(browser, [
      '--headless=new',
      '--disable-gpu',
      '--no-pdf-header-footer',
      `--user-data-dir=${profile}`,
      '--virtual-time-budget=15000',
      `--print-to-pdf=${out}`,
      pathToFileURL(path.join(here, html)).href,
    ], { stdio: 'ignore' });
    if (!fs.existsSync(out)) throw new Error(`O navegador não gerou ${pdf}`);
  }
  console.log('Pronto. PDFs atualizados em docs/.');
} finally {
  fs.rmSync(profile, { recursive: true, force: true });
}
