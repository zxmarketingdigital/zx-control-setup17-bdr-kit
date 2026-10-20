// Gravação dos arquivos do pipeline numa fila única, sempre relendo o arquivo dentro dela.
// Uma rota que leu os dados antes de um await (Evolution, Google, transcrição) nunca grava
// esse retrato antigo por cima do que outra rota gravou no meio.
//
// saveLead grava só os campos que a rota MUDOU em relação ao que ela leu (ownLead guarda o
// retrato original). Assim uma reunião criada, uma anotação ou um opt-out gravados por outra
// rota não somem. Um opt-out já gravado só é desfeito com allowOptOutChange (PATCH explícito).
const PROTEGIDOS_PELO_OPT_OUT = ['opt_out', 'status', 'closed_reason', 'closed_at', 'next_touch_due_at'];

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
