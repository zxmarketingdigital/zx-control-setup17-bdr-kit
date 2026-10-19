# Setup Google Calendar (uma vez só)

O CRM cria reuniões direto no seu Google Calendar via OAuth2. Setup leva ~10 minutos.

## 1. Criar projeto no Google Cloud Console

1. Acesse https://console.cloud.google.com
2. Topo → seletor de projeto → "Novo projeto"
3. Nome sugerido: `bdr-crm-calendar` → criar

## 2. Habilitar Google Calendar API

1. Menu hamburger → "APIs e serviços" → "Biblioteca"
2. Busque "Google Calendar API" → habilitar

## 3. Configurar tela de consentimento OAuth

1. Menu → "APIs e serviços" → "Tela de consentimento OAuth"
2. Tipo de usuário: **Externo** → criar
3. Preencher:
   - Nome do app: `BDR CRM`
   - Email de suporte: `seu-email@gmail.com`
   - Email do desenvolvedor: `seu-email@gmail.com`
4. "Salvar e continuar"
5. **Escopos:** "Adicionar ou remover escopos" → buscar `calendar.events` → selecionar `https://www.googleapis.com/auth/calendar.events` → atualizar → salvar e continuar
6. **Usuários de teste:** adicionar `seu-email@gmail.com` → salvar e continuar
7. Resumo → voltar ao painel

## 4. Criar credenciais OAuth 2.0

1. Menu → "APIs e serviços" → "Credenciais"
2. "+ CRIAR CREDENCIAIS" → "ID do cliente OAuth"
3. Tipo: **Aplicativo da Web**
4. Nome: `bdr-crm-local`
5. **URIs de redirecionamento autorizados** → adicionar:
   ```
   http://localhost:3001/auth/google/callback
   ```
6. Criar → janela mostra Client ID e Client Secret
7. Clique "FAZER O DOWNLOAD DO JSON"
8. **Renomeie o arquivo baixado** para `google-credentials.json` e **mova para a pasta `crm/` dentro do seu kit**

## 5. Conectar o CRM ao Calendar

Com o CRM rodando (`npm start` em `crm/`):

1. Entre no CRM (`http://localhost:3001`, com a senha de `npm run senha`) e, na mesma janela do navegador, abra `http://localhost:3001/auth/google`
2. Aparecerá tela "Google não verificou esse app" → clique em "Avançado" → "Acessar bdr-crm-calendar (não seguro)"
3. Aprove o acesso ao Calendar
4. Será redirecionado pra `http://localhost:3001/auth/google/callback` com mensagem de sucesso
5. Pronto. Token salvo em `crm/google-token.json` (mantém refresh automático)

## 6. Validar

1. Abra o CRM
2. Clique no botão "📅 Agenda" no header → deve mostrar "✓ Google Calendar conectado"
3. Abra qualquer lead com status "respondeu" → clique "📅 Agendar reunião" → preencha data/hora → "Agendar no Calendar"
4. O evento aparece no seu Google Calendar com Google Meet anexado

## Troubleshooting

**"google-credentials.json não encontrado":** o arquivo precisa estar em `crm/google-credentials.json` (não na raiz do projeto).

**"redirect_uri_mismatch":** o URI no Google Cloud precisa ser exatamente `http://localhost:3001/auth/google/callback` (sem trailing slash, http não https).

**Token expirado / inválido:** delete `crm/google-token.json` e rode `/auth/google` de novo.

**"App não verificado":** é esperado porque é uso pessoal. Clique em "Avançado" → "Acessar (não seguro)". Você é o único usuário, então não há risco.

## Arquivos sensíveis (NÃO commitar no git)

- `crm/google-credentials.json` — contém client_secret
- `crm/google-token.json` — contém refresh_token

Já estão no `.gitignore` do projeto