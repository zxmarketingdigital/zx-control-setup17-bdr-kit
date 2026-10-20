// crm/src/oauth-routes.js
// Rotas do login com o Google Calendar. Tudo que vem da URL ou de erro é escapado
// antes de voltar na página: a callback é aberta pelo navegador do aluno, então
// "?error=<script>…" não pode virar código rodando na origem do CRM.

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

function errorPage(res, status, message) {
  res.status(status).type('html').send(`<pre>${escapeHtml(message)}</pre>`);
}

export function registerGoogleOAuthRoutes(app, cal) {
  app.get('/auth/google', async (req, res) => {
    try { res.redirect(await cal.getAuthUrl()); }
    catch (err) { errorPage(res, 500, `Erro: ${err.message}`); }
  });

  app.get('/auth/google/callback', async (req, res) => {
    const { code, error } = req.query;
    if (error) return errorPage(res, 400, `OAuth error: ${error}`);
    if (!code || typeof code !== 'string') return errorPage(res, 400, 'Faltou ?code= na callback.');
    try {
      await cal.handleAuthCallback(code);
      res.type('html').send(`<html><body style="font-family:system-ui;padding:2rem;background:#0d1219;color:#f1f5f9;">
      <h2 style="margin:0 0 0.5rem;color:#60a5fa;">Google Calendar conectado.</h2>
      <p style="color:#94a3b8;">Token salvo em <code>crm/google-token.json</code>. Pode fechar essa aba e voltar pro CRM.</p>
    </body></html>`);
    } catch (err) { errorPage(res, 500, err.message); }
  });
}
