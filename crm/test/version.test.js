import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// A versão mora no arquivo VERSION (raiz). Estes testes evitam o erro clássico de release:
// mudar um lugar e esquecer os outros.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const VERSION = read('VERSION').trim();

test('VERSION é uma versão X.Y.Z', () => {
  assert.match(VERSION, /^\d+\.\d+\.\d+$/);
});

test('crm e dispatcher (package.json e lockfile) usam a mesma versão do VERSION', () => {
  for (const dir of ['crm', 'dispatcher']) {
    const pkg = JSON.parse(read(dir, 'package.json'));
    const lock = JSON.parse(read(dir, 'package-lock.json'));
    assert.equal(pkg.version, VERSION, `${dir}/package.json`);
    assert.equal(lock.version, VERSION, `${dir}/package-lock.json`);
    assert.equal(lock.packages[''].version, VERSION, `${dir}/package-lock.json (raiz)`);
  }
});

test('a primeira versão do CHANGELOG é a do VERSION', () => {
  const m = read('CHANGELOG.md').match(/^## \[(\d+\.\d+\.\d+)\]/m);
  assert.ok(m, 'CHANGELOG sem entrada de versão');
  assert.equal(m[1], VERSION);
});
