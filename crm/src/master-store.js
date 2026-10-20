// Grava UM lead relendo o arquivo na hora: uma rota que leu o master antes de um await
// (Evolution, Google) nunca sobrescreve o que outra rota gravou nos outros leads. As
// gravações passam numa fila, uma por vez. Um pedido pra parar já gravado não é desfeito
// por um retrato antigo do mesmo lead (só o PATCH explícito de opt_out muda isso).
export function createMasterStore({ readJson, writeJsonAtomic, file = 'leads-master.json' }) {
  let queue = Promise.resolve();

  function saveLead(id, lead, { allowOptOutChange = false } = {}) {
    const run = queue.then(async () => {
      const fresh = (await readJson(file, {})) ?? {};
      const atual = Object.hasOwn(fresh, id) ? fresh[id] : null;
      if (atual?.opt_out && !lead.opt_out && !allowOptOutChange) {
        lead.opt_out = true;
        lead.status = atual.status;
        lead.closed_reason = atual.closed_reason;
        lead.closed_at = atual.closed_at;
        lead.next_touch_due_at = null;
      }
      fresh[id] = lead;
      await writeJsonAtomic(file, fresh);
    });
    queue = run.catch(() => {});
    return run;
  }

  // Só chave própria: "__proto__" e afins não viram lead.
  function ownLead(master, id) {
    return Object.hasOwn(master, id) ? master[id] : undefined;
  }

  return { saveLead, ownLead };
}
