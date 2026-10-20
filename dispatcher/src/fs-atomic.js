// dispatcher/src/fs-atomic.js
// Helper de escrita atômica de JSON. Evita corrupção em writes concorrentes.
// Padrão: write em arquivo temp + rename atômico.
// NTFS e ext4 garantem que rename é atômico — leitor nunca vê arquivo parcialmente escrito.

import fs from 'node:fs/promises';

export async function writeJsonAtomic(fullPath, data) {
  const dir = fullPath.substring(0, Math.max(fullPath.lastIndexOf('/'), fullPath.lastIndexOf('\\')));
  if (dir) await fs.mkdir(dir, { recursive: true });
  const tmp = `${fullPath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmp, fullPath);
}

export async function readJson(fullPath, fallback = null) {
  try {
    const raw = await fs.readFile(fullPath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}
