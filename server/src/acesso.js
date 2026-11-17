// Bloqueio de IP, registro de tentativas e sessões.
// As regras de bloqueio moram no MySQL (database/07_acesso.sql); aqui só chamamos.
import { gerarToken, hashToken } from "./seguranca.js";

export const COOKIE_SESSAO = "mz_sessao";

export function ipDaRequisicao(req) {
  let ip = req.ip || req.socket?.remoteAddress || "0.0.0.0";
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  return ip.slice(0, 45);
}

export function lerCookie(req, nome) {
  const cabecalho = req.headers.cookie;
  if (!cabecalho) return null;
  for (const parte of cabecalho.split(";")) {
    const i = parte.indexOf("=");
    if (i === -1) continue;
    if (parte.slice(0, i).trim() === nome) {
      try { return decodeURIComponent(parte.slice(i + 1).trim()); } catch { return null; }
    }
  }
  return null;
}

export function criarAcesso({ banco, config }) {
  const opcoesCookie = {
    httpOnly: true,
    secure: config.producao,
    sameSite: "lax",
    path: "/"
  };

  return {
    async verificar(ip, email) {
      const r = await banco.procedure("sp_verificar_acesso", [ip, email || null]);
      return {
        permanente: Number(r?.permanente) === 1,
        bloqueadoAte: r?.bloqueado_ate || null,
        segundos: r?.segundos_restantes != null ? Number(r.segundos_restantes) : null,
        emailTravado: Number(r?.email_travado) === 1
      };
    },

    async registrar(ip, email, sucesso, motivo) {
      const r = await banco.procedure("sp_registrar_tentativa", [ip, email || null, sucesso ? 1 : 0, motivo]);
      return {
        resultado: r?.resultado || "ok",
        segundos: r?.segundos_restantes != null ? Number(r.segundos_restantes) : null,
        restantes: r?.falhas_restantes != null ? Number(r.falhas_restantes) : null
      };
    },

    // Quantas tentativas de um tipo este IP (ou e-mail) fez nos últimos N minutos.
    async contarRecentes({ ip, email, motivo, minutos }) {
      const campo = email ? "email" : "ip";
      const valor = email || ip;
      const linha = await banco.primeira(
        `SELECT COUNT(*) AS total FROM tentativas_login
          WHERE ${campo} = ? AND motivo = ? AND criado_em > NOW() - INTERVAL ? MINUTE`,
        [valor, motivo, Number(minutos)]
      );
      return Number(linha?.total || 0);
    },

    async criarSessao(res, usuarioId, ip, userAgent) {
      const token = gerarToken();
      await banco.consulta(
        `INSERT INTO sessoes (usuario_id, token_hash, ip, user_agent, expira_em)
         VALUES (?, ?, ?, ?, NOW() + INTERVAL ? DAY)`,
        [usuarioId, hashToken(token), ip, (userAgent || "").slice(0, 255), config.sessaoDias]
      );
      await banco.consulta("UPDATE usuarios SET ultimo_login_em = NOW() WHERE id = ?", [usuarioId]);
      res.cookie(COOKIE_SESSAO, token, { ...opcoesCookie, maxAge: config.sessaoDias * 24 * 60 * 60 * 1000 });
    },

    async usuarioDaSessao(req) {
      const token = lerCookie(req, COOKIE_SESSAO);
      if (!token || token.length > 100) return null;
      return banco.primeira(
        `SELECT u.id, u.nome, u.email, u.papel, u.status, s.id AS sessao_id
           FROM sessoes s
           JOIN usuarios u ON u.id = s.usuario_id
          WHERE s.token_hash = ?
            AND s.encerrada_em IS NULL
            AND s.expira_em > NOW()
            AND u.status = 'ativo'`,
        [hashToken(token)]
      );
    },

    async encerrarSessao(req, res) {
      const token = lerCookie(req, COOKIE_SESSAO);
      if (token) {
        await banco.consulta("UPDATE sessoes SET encerrada_em = NOW() WHERE token_hash = ? AND encerrada_em IS NULL", [hashToken(token)]);
      }
      res.clearCookie(COOKIE_SESSAO, opcoesCookie);
    },

    async encerrarTodasAsSessoes(usuarioId) {
      await banco.consulta("UPDATE sessoes SET encerrada_em = NOW() WHERE usuario_id = ? AND encerrada_em IS NULL", [usuarioId]);
    }
  };
}
