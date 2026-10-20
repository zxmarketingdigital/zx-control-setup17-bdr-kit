// dispatcher/src/claude-cli.js
// Resolve o binário real do Claude Code CLI pra chamar via execFile sem shell.
//
// No Windows o npm instala um wrapper claude.cmd que chama o claude.exe de
// verdade. child_process não spawna .cmd/.bat direto sem shell:true (Node
// bloqueia isso com EINVAL desde a correção da CVE-2024-27980), e shell:true
// seria risco de injeção de comando aqui — o prompt carrega texto do lead
// (mensagem de WhatsApp), fora do nosso controle. Por isso resolvemos o .exe
// real uma vez (via o utilitário nativo `where`) e chamamos ele direto, sem
// shell nenhum. Em Mac/Linux não tem esse problema: 'claude' já é executável.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';

const execFileAsync = promisify(execFile);

let resolved = null;
let attempted = false;

export async function resolveClaudeBin() {
  if (attempted) return resolved;
  attempted = true;

  if (process.platform !== 'win32') {
    resolved = 'claude';
    return resolved;
  }

  try {
    const { stdout } = await execFileAsync('where', ['claude']);
    const candidates = stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

    const exeDirect = candidates.find((p) => p.toLowerCase().endsWith('.exe'));
    if (exeDirect) {
      resolved = exeDirect;
      return resolved;
    }

    const cmdPath = candidates.find((p) => p.toLowerCase().endsWith('.cmd'));
    if (cmdPath) {
      const content = await fs.readFile(cmdPath, 'utf8');
      const m = content.match(/([A-Za-z]:\\[^"\r\n]+?claude\.exe|%dp0%\\[^"\r\n]+?claude\.exe)/i);
      if (m) {
        resolved = m[1].toLowerCase().startsWith('%dp0%')
          ? path.join(path.dirname(cmdPath), m[1].slice(5))
          : m[1];
      }
    }
  } catch {
    resolved = null;
  }

  return resolved;
}

// Só pra testes/diagnóstico manual — força uma nova resolução.
export function resetClaudeBinCache() {
  attempted = false;
  resolved = null;
}
