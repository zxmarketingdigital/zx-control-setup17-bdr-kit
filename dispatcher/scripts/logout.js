// Evolution API — desconectar instância WhatsApp
// Para desconectar ou trocar de número, use o painel da Evolution API.

import 'dotenv/config';

const API_URL = (process.env.EVOLUTION_API_URL ?? 'http://localhost:8080').replace(/\/$/, '');
const API_KEY = process.env.EVOLUTION_API_KEY ?? '';
const INSTANCE = process.env.EVOLUTION_INSTANCE ?? 'bdr-instance';

async function main() {
  console.log('\n→ Desconectando instância WhatsApp via Evolution API…\n');

  let res;
  try {
    res = await fetch(`${API_URL}/instance/logout/${INSTANCE}`, {
      method: 'DELETE',
      headers: { apikey: API_KEY },
    });
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err?.cause?.code === 'ECONNREFUSED') {
      console.log(`✗ Evolution API não está rodando em ${API_URL}`);
      console.log('  Inicie o container: docker compose up -d\n');
    } else {
      console.log(`✗ Erro: ${err.message}\n`);
    }
    process.exit(1);
  }

  if (res.status === 200 || res.status === 204) {
    console.log(`✓ Instância "${INSTANCE}" desconectada.`);
    console.log('\nPara reconectar, acesse o painel e escaneie o QR code:');
    console.log(`  ${API_URL}/manager\n`);
    console.log('Depois confirme com: npm run setup\n');
  } else {
    const body = await res.text().catch(() => '');
    console.log(`⚠  Evolution API retornou HTTP ${res.status}: ${body.slice(0, 120)}`);
    console.log(`\nTente desconectar manualmente pelo painel: ${API_URL}/manager\n`);
  }
}

main();
