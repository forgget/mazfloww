// Rotas do administrador: aprovar cadastros, mudar papel, desativar, liberar IP.
import { Router } from "express";
import { auditar } from "../auditoria.js";

const PAPEIS = ["administrador", "funcionario"];

export function rotasAdmin({ banco, acesso, email }) {
  const r = Router();

  function idDaRota(req) {
    const id = Number(req.params.id);
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  async function outrosAdminsAtivos(excetoId) {
    const linha = await banco.primeira(
      "SELECT COUNT(*) AS total FROM usuarios WHERE papel = 'administrador' AND status = 'ativo' AND id <> ?",
      [excetoId]
    );
    return Number(linha.total);
  }

  // GET /api/admin/usuarios
  r.get("/usuarios", async (req, res) => {
    const usuarios = await banco.consulta(
      `SELECT id, nome, email, papel, status, (google_sub IS NOT NULL) AS google,
              (senha_hash IS NOT NULL) AS tem_senha, criado_em, aprovado_em, ultimo_login_em
         FROM usuarios
        ORDER BY FIELD(status, 'pendente', 'ativo', 'desativado', 'recusado'), criado_em DESC`
    );
    res.json({
      usuarios: usuarios.map((u) => ({ ...u, google: Number(u.google) === 1, tem_senha: Number(u.tem_senha) === 1, eu: u.id === req.usuario.id }))
    });
  });

  // POST /api/admin/usuarios/:id/aprovar — { papel } (também serve para mudar o papel)
  r.post("/usuarios/:id/aprovar", async (req, res) => {
    const id = idDaRota(req);
    const papel = req.body?.papel;
    if (!id) return res.status(400).json({ erro: "id", mensagem: "Usuário inválido." });
    if (!PAPEIS.includes(papel)) return res.status(400).json({ erro: "papel", mensagem: "Papel deve ser administrador ou funcionário." });

    const alvo = await banco.primeira("SELECT id, nome, email, papel, status FROM usuarios WHERE id = ?", [id]);
    if (!alvo) return res.status(404).json({ erro: "nao_encontrado", mensagem: "Usuário não encontrado." });
    if (alvo.id === req.usuario.id && papel !== "administrador" && (await outrosAdminsAtivos(alvo.id)) === 0) {
      return res.status(409).json({ erro: "ultimo_admin", mensagem: "Você é o único administrador. Promova outra pessoa antes de mudar o seu papel." });
    }

    await banco.consulta(
      `UPDATE usuarios
          SET papel = ?, status = 'ativo',
              aprovado_por = IF(status = 'ativo', aprovado_por, ?),
              aprovado_em  = IF(status = 'ativo', aprovado_em, NOW())
        WHERE id = ?`,
      [papel, req.usuario.id, id]
    );
    await auditar(banco, req, alvo.status === "ativo" ? "mudar_papel" : "aprovar", "usuario", id, { antes: { papel: alvo.papel, status: alvo.status }, depois: { papel, status: "ativo" } });
    if (alvo.status !== "ativo") {
      email.contaAprovada({ ...alvo, papel }).catch((e) => console.error("Falha no e-mail de aprovação:", e.message));
    }
    res.json({ ok: true });
  });

  // POST /api/admin/usuarios/:id/recusar — só cadastros pendentes
  r.post("/usuarios/:id/recusar", async (req, res) => {
    const id = idDaRota(req);
    if (!id) return res.status(400).json({ erro: "id", mensagem: "Usuário inválido." });
    const resultado = await banco.consulta("UPDATE usuarios SET status = 'recusado' WHERE id = ? AND status = 'pendente'", [id]);
    if (resultado.affectedRows !== 1) return res.status(409).json({ erro: "estado", mensagem: "Só cadastros pendentes podem ser recusados." });
    await auditar(banco, req, "recusar", "usuario", id, null);
    res.json({ ok: true });
  });

  // POST /api/admin/usuarios/:id/desativar — tira o acesso e encerra as sessões
  r.post("/usuarios/:id/desativar", async (req, res) => {
    const id = idDaRota(req);
    if (!id) return res.status(400).json({ erro: "id", mensagem: "Usuário inválido." });
    if (id === req.usuario.id) return res.status(409).json({ erro: "proprio", mensagem: "Você não pode desativar a própria conta." });
    const resultado = await banco.consulta("UPDATE usuarios SET status = 'desativado' WHERE id = ? AND status = 'ativo'", [id]);
    if (resultado.affectedRows !== 1) return res.status(409).json({ erro: "estado", mensagem: "Só contas ativas podem ser desativadas." });
    await acesso.encerrarTodasAsSessoes(id);
    await auditar(banco, req, "desativar", "usuario", id, null);
    res.json({ ok: true });
  });

  // GET /api/admin/bloqueios — bloqueios em vigor
  r.get("/bloqueios", async (req, res) => {
    const bloqueios = await banco.consulta(
      `SELECT ip, MAX(permanente) AS permanente, MAX(fim) AS ate, MAX(inicio) AS desde,
              SUBSTRING_INDEX(GROUP_CONCAT(motivo ORDER BY inicio DESC SEPARATOR '\\n'), '\\n', 1) AS motivo,
              TIMESTAMPDIFF(SECOND, NOW(), MAX(fim)) AS segundos_restantes
         FROM bloqueios_ip
        WHERE liberado_em IS NULL AND (permanente = 1 OR fim > NOW())
        GROUP BY ip
        ORDER BY desde DESC`
    );
    res.json({
      seuIp: req.ipCliente,
      bloqueios: bloqueios.map((b) => ({ ...b, permanente: Number(b.permanente) === 1, segundos_restantes: b.segundos_restantes == null ? null : Number(b.segundos_restantes) }))
    });
  });

  // POST /api/admin/bloqueios/liberar — { ip }
  r.post("/bloqueios/liberar", async (req, res) => {
    const ip = typeof req.body?.ip === "string" ? req.body.ip.trim() : "";
    if (!ip || ip.length > 45) return res.status(400).json({ erro: "ip", mensagem: "IP inválido." });
    const r2 = await banco.procedure("sp_liberar_ip", [ip, req.usuario.id]);
    if (Number(r2?.liberados)) await auditar(banco, req, "liberar", "bloqueio_ip", ip, null);
    res.json({ ok: true, liberados: Number(r2?.liberados || 0) });
  });

  return r;
}
