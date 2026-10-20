// Gravação dos arquivos do pipeline numa fila única, sempre relendo o arquivo dentro dela.
// Uma rota que leu os dados antes de um await (Evolution, Google, transcrição) nunca grava
// esse retrato antigo por cima do que outra rota gravou no meio.
//
// saveLead grava só os campos que a rota MUDOU em relação ao que ela leu (ownLead guarda o
// retrato original). Assim uma reunião criada, uma anotação ou um opt-out gravados por outra
// rota não somem. Um opt-out já gravado só é desfeito com allowOptOutChange (PATCH explícito).
const PROTEGIDOS_PELO_OPT_OUT = ['opt_out', 'status', 'closed_reason', 'closed_at', 'next_touch_due_at'];

function mergeList(original, mine, current) {
  const count = (arr) => arr.reduce((m, x) => { const k = JSON.stringify(x); m.set(k, (m.get(k) || 0) + 1); return m; }, new Map());
  const before = count(original), after = count(mine);
  const removed = new Map(), added = [];
  for (const [k, n] of before) { const d = n - (after.get(k) || 0); if (d > 0) removed.set(k, d); }
  const seenMine = new Map();
  for (const x of mine) {
    const k = JSON.stringify(x);
    seenMine.set(k, (seenMine.get(k) || 0) + 1);
    if (seenMine.get(k) > (before.get(k) || 0)) added.push(x);
  }
  const out = [];
  for (const x of current) {
    const k = JSON.stringify(x);
    if (removed.get(k) > 0) { removed.set(k, removed.get(k) - 1); continue; }
    out.push(x);
  }
  return [...out, ...added];
}

export function createMasterStore({ readJson, writeJsonAtomic, file = 'leads-master.json' }) {
  let queue = Promise.resolve();
  const originals = new WeakMap();

  function enqueue(fn) {
    const run = queue.then(fn);
    queue = run.catch(() => {});
    return run;
  }

  // fn recebe o conteúdo atual do arquivo e devolve o novo (undefined = não grava).
  function withFile(name, fallback, fn) {
    return enqueue(async () => {
      const fresh = (await readJson(name, fallback)) ?? structuredClone(fallback);
      const next = await fn(fresh);
      if (next !== undefined) await writeJsonAtomic(name, next);
      return next;
    });
  }

  function saveLead(id, lead, { allowOptOutChange = false } = {}) {
    return enqueue(async () => {
      const fresh = (await readJson(file, {})) ?? {};
      const atual = Object.hasOwn(fresh, id) ? fresh[id] : null;
      const original = originals.get(lead);
      let merged;
      if (atual && original) {
        merged = { ...atual };
        for (const key of new Set([...Object.keys(original), ...Object.keys(lead)])) {
          if (JSON.stringify(original[key]) === JSON.stringify(lead[key])) continue;
          if (Array.isArray(original[key]) && Array.isArray(lead[key]) && Array.isArray(atual[key])) {
            // Lista (anotações, histórico): aplica só o que esta rota tirou e pôs, sobre a lista
            // atual. Um item que outra rota acrescentou no meio fica.
            merged[key] = mergeList(original[key], lead[key], atual[key]);
            continue;
          }
          if (key in lead) merged[key] = lead[key]; else delete merged[key];
        }
      } else {
        merged = lead;
      }
      if (atual?.opt_out && !allowOptOutChange) {
        for (const key of PROTEGIDOS_PELO_OPT_OUT) {
          if (key in atual) merged[key] = atual[key]; else delete merged[key];
        }
      }
      fresh[id] = merged;
      await writeJsonAtomic(file, fresh);
      Object.keys(lead).forEach((k) => { if (!(k in merged)) delete lead[k]; });
      Object.assign(lead, merged);
      originals.set(lead, structuredClone(merged));
    });
  }

  // Só chave própria: "__proto__" e afins não viram lead.
  function ownLead(master, id) {
    if (!Object.hasOwn(master, id)) return undefined;
    const lead = master[id];
    if (lead && typeof lead === 'object') originals.set(lead, structuredClone(lead));
    return lead;
  }

  return { saveLead, ownLead, withFile };
}
