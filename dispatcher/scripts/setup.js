// Evolution API — verificação de conexão
// Confirma que a Evolution API está rodando e a instância WhatsApp está conectada.
// O QR code é escaneado pelo painel da Evolution API (http://localhost:8080/manager),
// não por este script.

import 'dotenv/config';

const API_URL = (process.env.EVOLUTION_API_URL ?? 'http://localhost:8080').replace(/\/$/, '');
const API_KEY = process.env.EVOLUTION_API_KEY ?? '';
const INSTANCE = process.env.EVOLUTION_INSTANCE ?? 'bdr-instance';

async function checkSetup() {
  console.log(`\n→ Verificando Evolution API em ${API_URL}…`);

  let res;
  try {
    res = await fetch(`${API_URL}/instance/connectionState/${INSTANCE}`, {
      headers: { apikey: API_KEY },
    });
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err?.cause?.code === 'ECONNREFUSED') {
      console.log(`\n✗ Evolution API não está rodando em ${API_URL}`);
      console.log('\nInicie o container Docker a partir da pasta do dispatcher:');
      console.log('  docker compose up -d\n');
      console.log('Aguarde ~10s e rode "npm run setup" novamente.\n');
    } else {
      console.log(`\n✗ Erro ao conectar na Evolution API: ${err.message}\n`);
    }
    process.exit(1);
  }

  if (res.status === 401 || res.status === 403) {
    console.log('\n✗ API key inválida ou sem permissão.');
    console.log('  Verifique EVOLUTION_API_KEY no arquivo .env\n');
    process.exit(1);
  }

  if (res.status === 404) {
    console.log(`\n⚠  Instância "${INSTANCE}" não encontrada na Evolution API.`);
    console.log('\nCrie a instância pelo painel:');
    console.log(`  1. Abra: ${API_URL}/manager`);
    console.log(`  2. Crie uma nova instância com o nome: ${INSTANCE}`);
    console.log('  3. Escaneie o QR code com o WhatsApp');
    console.log('     (WhatsApp > Dispositivos Vinculados > Vincular dispositivo)');
    console.log('  4. Rode "npm run setup" novamente para confirmar\n');
    process.exit(1);
  }

  if (!res.ok) {
    console.log(`\n✗ Evolution API retornou erro HTTP ${res.status}\n`);
    process.exit(1);
  }

  const data = await res.json();
  const state = data?.instance?.state ?? data?.state ?? 'unknown';

  if (state === 'open') {
    console.log(`\n✓ Evolution API funcionando em ${API_URL}`);
    console.log(`✓ Instância "${INSTANCE}" conectada ao WhatsApp (state: open)`);
    console.log('\nTudo certo. Inicie o dispatcher com:\n  npm start\n');
    process.exit(0);
  } else {
    console.log(`\n⚠  Instância "${INSTANCE}" existe mas não está conectada (state: ${state}).`);
    console.log('\nConecte a instância pelo painel:');
    console.log(`  1. Abra: ${API_URL}/manager`);
    console.log(`  2. Selecione a instância "${INSTANCE}"`);
    console.log('  3. Clique em "Conectar" e escaneie o QR code com o WhatsApp');
    console.log('  4. Rode "npm run setup" novamente para confirmar\n');
    process.exit(1);
  }
}

checkSetup();
