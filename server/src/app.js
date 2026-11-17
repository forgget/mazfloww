// Monta o servidor Express. Recebe as dependências por parâmetro para os
// testes poderem trocar o e-mail e a verificação do Google por versões falsas.
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { OAuth2Client } from "google-auth-library";
import { criarAcesso, ipDaRequisicao } from "./acesso.js";
import { criarEmail } from "./email.js";
import { rotasAuth } from "./rotas/auth.js";
import { rotasAdmin } from "./rotas/admin.js";
import { rotasDados } from "./rotas/dados.js";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const PASTA_PAGINA = path.resolve(AQUI, "..", "..", "demo");

function verificadorGoogle(config) {
  const cliente = new OAuth2Client(config.googleClientId);
  return async (credencial) => {
    const ticket = await cliente.verifyIdToken({ idToken: credencial, audience: config.googleClientId });
    return ticket.getPayload();
  };
}

export function criarApp({ config, banco, email = criarEmail(config), verificarGoogle = verificadorGoogle(config) }) {
  const app = express();
  const acesso = criarAcesso({ banco, config });
  const origemApp = new URL(config.appUrl).origin;

  app.disable("x-powered-by");
  const proxy = config.trustProxy;
  app.set("trust proxy", /^\d+$/.test(proxy) ? Number(proxy) : proxy === "true" ? true : proxy === "false" ? false : proxy);

  // Cabeçalhos de segurança
  app.use((req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "same-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "Content-Security-Policy": [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/client",
        "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
        "frame-src https://accounts.google.com/gsi/",
        "connect-src 'self' https://accounts.google.com/gsi/",
        "img-src 'self' data: https://*.googleusercontent.com",
        "base-uri 'none'",
        "form-action 'self'",
        "frame-ancestors 'none'"
      ].join("; ")
    });
    if (config.producao) res.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    next();
  });

  // ---------------------------------------------------------------- /api ----
  const api = express.Router();
  api.use(express.json({ limit: "10kb" }));
  api.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    req.ipCliente = ipDaRequisicao(req);
    next();
  });

  // Proteção contra requisições forjadas por outros sites (CSRF): quem altera
  // dados precisa mandar JSON e, se o navegador informar a origem, ela tem que
  // ser a do próprio MazFlow.
  api.use((req, res, next) => {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
    const origem = req.get("origin");
    if (origem && origem !== origemApp) return res.status(403).json({ erro: "origem", mensagem: "Origem não permitida." });
    const temCorpo = Number(req.get("content-length") || 0) > 0 || req.get("transfer-encoding");
    const semCorpoPermitido = req.method === "DELETE" && !temCorpo;
    if (!semCorpoPermitido && !req.is("application/json")) return res.status(415).json({ erro: "formato", mensagem: "Envie JSON." });
    next();
  });

  // IP banido de forma permanente não acessa nada.
  api.use(async (req, res, next) => {
    try {
      const v = await acesso.verificar(req.ipCliente, null);
      if (v.permanente) return res.status(403).json({ erro: "ip_banido", mensagem: "Acesso bloqueado para esta rede. Fale com o administrador da gráfica." });
      next();
    } catch (e) { next(e); }
  });

  // Carrega quem está logado (se houver).
  api.use(async (req, res, next) => {
    try {
      req.usuario = await acesso.usuarioDaSessao(req);
      next();
    } catch (e) { next(e); }
  });

  api.get("/config", (req, res) => {
    res.json({ modo: "servidor", googleClientId: config.googleClientId || null });
  });

  // Express 5 repassa erros de funções async ao tratador de erros.
  api.use("/auth", rotasAuth({ banco, config, acesso, email, verificarGoogle }));

  api.use("/admin", (req, res, next) => {
    if (!req.usuario) return res.status(401).json({ erro: "sem_sessao", mensagem: "Entre novamente." });
    if (req.usuario.papel !== "administrador") return res.status(403).json({ erro: "proibido", mensagem: "Só administradores podem fazer isso." });
    next();
  }, rotasAdmin({ banco, acesso, email }));

  // Dados da gráfica: só para quem está logado.
  api.use((req, res, next) => {
    if (!req.usuario) return res.status(401).json({ erro: "sem_sessao", mensagem: "Entre novamente." });
    next();
  }, rotasDados({ banco }));

  api.use((req, res) => res.status(404).json({ erro: "nao_encontrado" }));


  // eslint-disable-next-line no-unused-vars
  api.use((erro, req, res, next) => {
    if (erro.type === "entity.parse.failed") return res.status(400).json({ erro: "json", mensagem: "JSON inválido." });
    if (erro.type === "entity.too.large") return res.status(413).json({ erro: "tamanho", mensagem: "Requisição grande demais." });
    console.error(erro);
    res.status(500).json({ erro: "interno", mensagem: "Erro no servidor. Tente de novo." });
  });

  app.use("/api", api);

  // ------------------------------------------------------------- página ----
  app.use(express.static(PASTA_PAGINA, { index: "index.html", maxAge: 0 }));
  app.use((req, res) => res.status(404).send("Página não encontrada"));

  return app;
}
