// dispatcher/src/phone.js
// Chave de comparação de telefone: o mesmo contato aparece como "11 98765-4321",
// "+55 11 98765-4321" ou "5511987654321". Número brasileiro sem DDI (10 ou 11 dígitos)
// ganha o 55; o resto (Portugal 351..., outros países) fica como veio, só com dígitos.
export function phoneKey(phone) {
  let d = String(phone ?? '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = d.replace(/^0+/, ''); // tronco nacional: "011 9..." = "11 9..." 
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return d;
}

// O mesmo número cadastrado em qualquer lead pediu pra parar: é a mesma pessoa.
export function phoneOptedOut(master, phone, exceptId = null) {
  if (!phone) return false;
  const key = phoneKey(phone);
  return Object.entries(master || {}).some(([id, other]) => id !== exceptId && other?.opt_out && other.phone && phoneKey(other.phone) === key);
}
