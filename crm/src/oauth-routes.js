// crm/src/oauth-routes.js
// Rotas do login com o Google Calendar. Tudo que vem da URL ou de erro é escapado
// antes de voltar na página: a callback é aberta pelo navegador do aluno, então
// "?error=<script>…" não pode virar código rodando na origem do CRM.

import crypto from 'node:crypto';

// "state" do OAuth: amarra a callback ao login que ESTE navegador começou. Sem isso,
// um link para /auth/google/callback?code=<code de outra conta> trocaria a agenda do CRM.
const STATE_COOKIE = 'zxcrm_oauth_state';
const STATE_TTL_S = 600;

function readCookie(req, name) {
  for (const part of String(req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

function sameState(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

function errorPage(res, status, message) {
  res.status(status).type('html').send(`<pre>${escapeHtml(message)}</pre>`);
}

export function registerGoogleOAuthRoutes(app, cal) {
  app.get('/auth/google', async (req, res) => {
    const state = crypto.randomBytes(24).toString('hex');
    res.setHeader('Set-Cookie', `${STATE_COOKIE}=${state}; HttpOnly; SameSite=Lax; Path=/auth/google; Max-Age=${STATE_TTL_S}`);
    try { res.redirect(await cal.getAuthUrl(state)); }
    catch (err) { errorPage(res, 500, `Erro: ${err.message}`); }
  });

  app.get('/auth/google/callback', async (req, res) => {
    const { code, error } = req.query;
    if (error) return errorPage(res, 400, `OAuth error: ${error}`);
    if (!code || typeof code !== 'string') return errorPage(res, 400, 'Faltou ?code= na callback.');
    const expected = readCookie(req, STATE_COOKIE);
    res.setHeader('Set-Cookie', `${STATE_COOKIE}=; HttpOnly; SameSite=Lax; Path=/auth/google; Max-Age=0`);
    if (!sameState(req.query.state, expected)) {
      return errorPage(res, 400, 'Este link de conexão não foi iniciado por este CRM. Volte ao CRM e clique em "Conectar Google Calendar" de novo.');
    }
    try {
      await cal.handleAuthCallback(code);
      res.type('html').send(`<html><body style="font-family:system-ui;padding:2rem;background:#0d1219;color:#f1f5f9;">
      <h2 style="margin:0 0 0.5rem;color:#60a5fa;">Google Calendar conectado.</h2>
      <p style="color:#94a3b8;">Token salvo em <code>crm/google-token.json</code>. Pode fechar essa aba e voltar pro CRM.</p>
    </body></html>`);
    } catch (err) { errorPage(res, 500, err.message); }
  });
}
