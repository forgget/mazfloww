// Lê e valida as variáveis de ambiente (arquivo .env em desenvolvimento).
import "dotenv/config";

function texto(nome, padrao) {
  const v = process.env[nome];
  return v === undefined || v === "" ? padrao : v;
}

function bancoDaUrl(url) {
  // mysql://usuario:senha@host:porta/banco (formato das hospedagens tipo Railway)
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, "")
  };
}

export function carregarConfig(sobrescrever = {}) {
  const producao = texto("NODE_ENV", "development") === "production";
  const banco = process.env.DATABASE_URL
    ? bancoDaUrl(process.env.DATABASE_URL)
    : {
        host: texto("DB_HOST", "127.0.0.1"),
        port: Number(texto("DB_PORT", "3306")),
        user: texto("DB_USER", "root"),
        password: texto("DB_PASSWORD", ""),
        database: texto("DB_NAME", "mazflow")
      };

  const config = {
    producao,
    porta: Number(texto("PORT", "3000")),
    appUrl: texto("APP_URL", "http://localhost:3000").replace(/\/$/, ""),
    donoEmail: texto("DONO_EMAIL", "").trim().toLowerCase(),
    trustProxy: texto("TRUST_PROXY", producao ? "1" : "0"),
    banco,
    smtp: {
      host: texto("SMTP_HOST", ""),
      port: Number(texto("SMTP_PORT", "587")),
      user: texto("SMTP_USER", ""),
      pass: texto("SMTP_PASS", ""),
      from: texto("EMAIL_FROM", "MazFlow <nao-responda@localhost>")
    },
    sessaoDias: 7,
    redefinicaoMinutos: 30,
    ...sobrescrever
  };

  if (config.producao) {
    const faltando = [];
    if (!config.donoEmail) faltando.push("DONO_EMAIL");
    if (!config.appUrl.startsWith("https://")) faltando.push("APP_URL (com https://)");
    // SMTP é opcional: sem ele, os e-mails (recuperação de senha, avisos) só
    // aparecem no log do servidor — o resto do sistema funciona.
    if (faltando.length) {
      throw new Error("Configuração incompleta para produção: " + faltando.join(", "));
    }
  }
  return config;
}
