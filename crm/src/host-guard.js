// crm/src/host-guard.js
// Protege o CRM local contra acesso fora do próprio computador.
//
// O CRM não tem login: quem alcançar a porta consegue enviar WhatsApp pelo número
// do aluno, ler a base de leads e ligar o modo automático. Duas camadas:
//   1. server.js escuta só em 127.0.0.1 (a rede local não alcança a porta);
//   2. este middleware recusa requisições cujo Host (ou Origin) não seja o do
//      próprio computador, o que barra DNS rebinding: um site mal-intencionado
//      apontando um domínio dele para 127.0.0.1 e usando o navegador do aluno
//      como ponte.

export function allowedHosts(port) {
  return new Set([`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`]);
}

// `Host` chega sem esquema ("localhost:3001"); `Origin` chega com ("http://localhost:3001").
export function isAllowedHost(hostHeader, port) {
  if (typeof hostHeader !== 'string') return false;
  return allowedHosts(port).has(hostHeader.trim().toLowerCase());
}

export function isAllowedOrigin(originHeader, port) {
  if (originHeader === undefined) return true; // navegação normal e curl não mandam Origin
  if (typeof originHeader !== 'string') return false;
  const m = /^http:\/\/([^/]+)$/i.exec(originHeader.trim());
  return m ? isAllowedHost(m[1], port) : false;
}

export function hostGuard(port) {
  return function hostGuardMiddleware(req, res, next) {
    if (!isAllowedHost(req.headers.host, port) || !isAllowedOrigin(req.headers.origin, port)) {
      res.status(403).type('text/plain').send(
        `Acesso negado: o CRM só atende em http://localhost:${port} neste computador.`
      );
      return;
    }
    next();
  };
}
