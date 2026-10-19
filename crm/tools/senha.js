// Mostra a senha de login do CRM (a linha CRM_PASSWORD do crm/.env).
// Uso: cd crm && npm run senha
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const envFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');
let senha = '';
try {
  senha = (dotenv.parse(fs.readFileSync(envFile, 'utf8')).CRM_PASSWORD ?? '').trim();
} catch { /* sem .env ainda */ }

if (senha) {
  console.log(`\nSenha do CRM: ${senha}\n`);
  console.log('Ela está no arquivo crm/.env (linha CRM_PASSWORD). Para trocar, edite essa linha e reinicie o CRM.\n');
} else {
  console.log('\nO CRM ainda não tem senha. Ela é criada na primeira vez que ele abre (cd crm && npm start),');
  console.log('e depois fica na linha CRM_PASSWORD do arquivo crm/.env.\n');
}
