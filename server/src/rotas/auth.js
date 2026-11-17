// Rotas de autenticação: cadastro, login, Google, sair, recuperar senha.
import { Router } from "express";
import {
  gerarHashSenha, conferirSenha, gastarTempoDeSenha, gerarToken, hashToken,
  SENHA_MINIMA, SENHA_MAXIMA
} from "../seguranca.js";
import { ipDaRequisicao } from "../acesso.js";

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]{1,64}@[^\s@<>()[\]\\,;:"]{1,180}\.[a-z]{2,24}$/i;

export function normalizarEmail(v) {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

function senhaValida(senha) {
  return typeof senha === "string" && senha.length >= SENHA_MINIMA && senha.length <= SENHA_MAXIMA;
}

export function usuarioPublico(u) {
  return { id: u.id, nome: u.nome, email: u.email, papel: u.papel };
}

function minutos(segundos) {
  return Math.max(1, Math.ceil((segundos || 60) / 60));
}

export function rotasAuth({ banco, config, acesso, email, verificarGoogle }) {
  const r = Router();

  // ---------------------------------------------------------------------------
  // Bloqueio por IP antes de qualquer tentativa (o banimento permanente é
  // tratado para toda a /api em app.js).
  // ---------------------------------------------------------------------------
  async function barrarSeBloqueado(req, res, emailInformado) {
    const ip = ipDaRequisicao(req);
    const v = await acesso.verificar(ip, emailInformado);
    if (v.permanente) {
      res.status(403).json({ erro: "ip_banido", mensagem: "Acesso bloqueado para esta rede. Fale com o administrador da gráfica." });
      return true;
    }
    if (v.bloqueadoAte) {
      await acesso.registrar(ip, emailInformado, false, "ip_bloqueado");
      res.status(429).json({
        erro: "ip_bloqueado",
        segundos: v.segundos,
        mensagem: `Muitas tentativas erradas. Tente de novo em ${minutos(v.segundos)} min.`
      });
      return true;
    }
    if (v.emailTravado) {
      await acesso.registrar(ip, emailInformado, false, "email_travado");
      res.status(429).json({
        erro: "email_travado",
        mensagem: "Muitas tentativas erradas para este e-mail. Espere 15 minutos ou use \"Esqueci minha senha\"."
      });
      return true;
    }
    return false;
  }

  // Responde a uma falha de login, já considerando se ela gerou bloqueio.
  function responderFalha(res, registro, mensagem) {
    if (registro.resultado === "permanente") {
      return res.status(403).json({ erro: "ip_banido", mensagem: "Acesso bloqueado para esta rede. Fale com o administrador da gráfica." });
    }
    if (registro.resultado === "temporario") {
      return res.status(429).json({
        erro: "ip_bloqueado",
        segundos: registro.segundos,
        mensagem: `Muitas tentativas erradas. Tente de novo em ${minutos(registro.segundos)} min.`
      });
    }
    return res.status(401).json({ erro: "credenciais", mensagem, tentativasRestantes: registro.restantes });
  }

  // Conta encontrada e credencial certa: decide pelo status.
  async function concluirLogin(req, res, usuario) {
    const ip = ipDaRequisicao(req);
    if (usuario.status === "pendente") {
      await acesso.registrar(ip, usuario.email, false, "conta_pendente");
      return res.status(403).json({ erro: "conta_pendente", mensagem: "Sua conta ainda está aguardando a aprovação do administrador." });
    }
    if (usuario.status !== "ativo") {
      await acesso.registrar(ip, usuario.email, false, "conta_inativa");
      return res.status(403).json({ erro: "conta_inativa", mensagem: "Esta conta não tem acesso ao MazFlow. Fale com o administrador." });
    }
    await acesso.registrar(ip, usuario.email, true, "login");
    await acesso.criarSessao(res, usuario.id, ip, req.get("user-agent"));
    return res.json({ usuario: usuarioPublico(usuario) });
  }

  // O e-mail do dono vira administrador ativo enquanto não existir outro administrador ativo.
  async function statusInicial(emailNovo) {
    if (!config.donoEmail || emailNovo !== config.donoEmail) return { status: "pendente", papel: "funcionario" };
    const admin = await banco.primeira("SELECT id FROM usuarios WHERE papel = 'administrador' AND status = 'ativo' LIMIT 1");
    return admin ? { status: "pendente", papel: "funcionario" } : { status: "ativo", papel: "administrador" };
  }

  async function avisarAdmins(novo) {
    const admins = await banco.consulta("SELECT nome, email FROM usuarios WHERE papel = 'administrador' AND status = 'ativo'");
    for (const admin of admins) {
      email.novoCadastroParaAprovar(admin, novo).catch((e) => console.error("Falha ao avisar admin:", e.message));
    }
  }

  // ---------------------------------------------------------------------------
  // GET /api/auth/eu — quem está logado
  // ---------------------------------------------------------------------------
  r.get("/eu", (req, res) => {
    if (!req.usuario) return res.status(401).json({ erro: "sem_sessao" });
    res.json({ usuario: usuarioPublico(req.usuario) });
  });

  // ---------------------------------------------------------------------------
  // POST /api/auth/cadastro — { nome, email, senha }
  // ---------------------------------------------------------------------------
  r.post("/cadastro", async (req, res) => {
    const ip = ipDaRequisicao(req);
    const nome = typeof req.body?.nome === "string" ? req.body.nome.trim().replace(/\s+/g, " ") : "";
    const emailNovo = normalizarEmail(req.body?.email);
    const senha = req.body?.senha;

    if (nome.length < 2 || nome.length > 120) return res.status(400).json({ erro: "nome", mensagem: "Informe seu nome (2 a 120 caracteres)." });
    if (!EMAIL_RE.test(emailNovo) || emailNovo.length > 190) return res.status(400).json({ erro: "email", mensagem: "Informe um e-mail válido." });
    if (!senhaValida(senha)) return res.status(400).json({ erro: "senha", mensagem: `A senha precisa ter de ${SENHA_MINIMA} a ${SENHA_MAXIMA} caracteres.` });

    if (await barrarSeBloqueado(req, res, null)) return;
    if (await acesso.contarRecentes({ ip, motivo: "cadastro", minutos: 60 }) >= 10) {
      return res.status(429).json({ erro: "limite", mensagem: "Muitos cadastros feitos desta rede. Tente de novo mais tarde." });
    }
    await acesso.registrar(ip, emailNovo, true, "cadastro");

    const existente = await banco.primeira("SELECT id, nome, email FROM usuarios WHERE email = ?", [emailNovo]);
    if (existente) {
      // Mesma resposta de um cadastro novo, para não revelar quem tem conta.
      email.cadastroDuplicado(existente).catch((e) => console.error("Falha no e-mail:", e.message));
      return res.status(202).json({ pendente: true, mensagem: "Cadastro recebido. Você poderá entrar assim que o administrador aprovar." });
    }

    const { status, papel } = await statusInicial(emailNovo);
    const senhaHash = await gerarHashSenha(senha);
    const resultado = await banco.consulta(
      "INSERT INTO usuarios (nome, email, senha_hash, papel, status, aprovado_em) VALUES (?, ?, ?, ?, ?, IF(? = 'ativo', NOW(), NULL))",
      [nome, emailNovo, senhaHash, papel, status, status]
    );
    const novo = { id: resultado.insertId, nome, email: emailNovo, papel, status };

    if (status === "ativo") {
      await acesso.criarSessao(res, novo.id, ip, req.get("user-agent"));
      return res.status(201).json({ usuario: usuarioPublico(novo) });
    }
    await avisarAdmins(novo);
    return res.status(202).json({ pendente: true, mensagem: "Cadastro recebido. Você poderá entrar assim que o administrador aprovar." });
  });

  // ---------------------------------------------------------------------------
  // POST /api/auth/login — { email, senha }
  // ---------------------------------------------------------------------------
  r.post("/login", async (req, res) => {
    const ip = ipDaRequisicao(req);
    const emailLogin = normalizarEmail(req.body?.email);
    const senha = req.body?.senha;
    if (!emailLogin || typeof senha !== "string" || !senha || senha.length > SENHA_MAXIMA || emailLogin.length > 190) {
      return res.status(400).json({ erro: "dados", mensagem: "Informe e-mail e senha." });
    }

    if (await barrarSeBloqueado(req, res, emailLogin)) return;

    const usuario = await banco.primeira(
      "SELECT id, nome, email, papel, status, senha_hash FROM usuarios WHERE email = ?",
      [emailLogin]
    );
    if (!usuario) {
      await gastarTempoDeSenha(senha);
      const reg = await acesso.registrar(ip, emailLogin, false, "email_inexistente");
      return responderFalha(res, reg, "E-mail ou senha incorretos.");
    }
    const ok = usuario.senha_hash ? await conferirSenha(senha, usuario.senha_hash) : (await gastarTempoDeSenha(senha), false);
    if (!ok) {
      const reg = await acesso.registrar(ip, emailLogin, false, "senha_incorreta");
      const dica = usuario.senha_hash ? "E-mail ou senha incorretos." : "E-mail ou senha incorretos. Se você entra pelo Google, use o botão do Google.";
      return responderFalha(res, reg, dica);
    }
    return concluirLogin(req, res, usuario);
  });

  // ---------------------------------------------------------------------------
  // POST /api/auth/google — { credential } (ID token do botão do Google)
  // ---------------------------------------------------------------------------
  r.post("/google", async (req, res) => {
    const ip = ipDaRequisicao(req);
    if (!config.googleClientId) return res.status(503).json({ erro: "google_desligado", mensagem: "Login com Google não está configurado." });
    const credencial = req.body?.credential;
    if (typeof credencial !== "string" || credencial.length > 4096) return res.status(400).json({ erro: "dados", mensagem: "Credencial do Google ausente." });

    if (await barrarSeBloqueado(req, res, null)) return;

    let dados;
    try {
      dados = await verificarGoogle(credencial);
    } catch {
      dados = null;
    }
    if (!dados || !dados.sub || !dados.email || dados.email_verified !== true) {
      const reg = await acesso.registrar(ip, null, false, "google_invalido");
      return responderFalha(res, reg, "Não foi possível confirmar sua conta Google. Tente de novo.");
    }

    const emailGoogle = normalizarEmail(dados.email);
    let usuario = await banco.primeira("SELECT id, nome, email, papel, status FROM usuarios WHERE google_sub = ?", [dados.sub]);
    if (!usuario) {
      usuario = await banco.primeira("SELECT id, nome, email, papel, status, google_sub FROM usuarios WHERE email = ?", [emailGoogle]);
      if (usuario) {
        if (usuario.google_sub && usuario.google_sub !== dados.sub) {
          const reg = await acesso.registrar(ip, emailGoogle, false, "google_invalido");
          return responderFalha(res, reg, "Este e-mail já está ligado a outra conta Google.");
        }
        // E-mail confirmado pelo Google: vincula à conta existente.
        await banco.consulta("UPDATE usuarios SET google_sub = ? WHERE id = ?", [dados.sub, usuario.id]);
      }
    }
    if (!usuario) {
      const nome = String(dados.name || emailGoogle.split("@")[0]).slice(0, 120);
      const { status, papel } = await statusInicial(emailGoogle);
      const resultado = await banco.consulta(
        "INSERT INTO usuarios (nome, email, google_sub, papel, status, aprovado_em) VALUES (?, ?, ?, ?, ?, IF(? = 'ativo', NOW(), NULL))",
        [nome, emailGoogle, dados.sub, papel, status, status]
      );
      usuario = { id: resultado.insertId, nome, email: emailGoogle, papel, status };
      await acesso.registrar(ip, emailGoogle, true, "cadastro");
      if (status === "pendente") await avisarAdmins(usuario);
    }
    return concluirLogin(req, res, usuario);
  });

  // ---------------------------------------------------------------------------
  // POST /api/auth/sair
  // ---------------------------------------------------------------------------
  r.post("/sair", async (req, res) => {
    await acesso.encerrarSessao(req, res);
    res.json({ ok: true });
  });

  // ---------------------------------------------------------------------------
  // POST /api/auth/esqueci — { email } — sempre a mesma resposta
  // ---------------------------------------------------------------------------
  const RESPOSTA_ESQUECI = { ok: true, mensagem: "Se este e-mail tiver conta ativa no MazFlow, enviamos um link para criar uma nova senha. Confira também o spam." };

  r.post("/esqueci", async (req, res) => {
    const ip = ipDaRequisicao(req);
    const emailPedido = normalizarEmail(req.body?.email);
    if (!EMAIL_RE.test(emailPedido)) return res.status(400).json({ erro: "email", mensagem: "Informe um e-mail válido." });

    if (await barrarSeBloqueado(req, res, null)) return;
    const pedidosIp = await acesso.contarRecentes({ ip, motivo: "recuperacao", minutos: 60 });
    const pedidosEmail = await acesso.contarRecentes({ email: emailPedido, motivo: "recuperacao", minutos: 60 });
    if (pedidosIp >= 5 || pedidosEmail >= 3) {
      return res.status(429).json({ erro: "limite", mensagem: "Muitos pedidos de recuperação. Espere uma hora e tente de novo." });
    }
    await acesso.registrar(ip, emailPedido, true, "recuperacao");

    const usuario = await banco.primeira("SELECT id, nome, email FROM usuarios WHERE email = ? AND status = 'ativo'", [emailPedido]);
    if (usuario) {
      const token = gerarToken();
      await banco.consulta("UPDATE redefinicoes_senha SET usado_em = NOW() WHERE usuario_id = ? AND usado_em IS NULL", [usuario.id]);
      await banco.consulta(
        "INSERT INTO redefinicoes_senha (usuario_id, token_hash, ip, expira_em) VALUES (?, ?, ?, NOW() + INTERVAL ? MINUTE)",
        [usuario.id, hashToken(token), ip, config.redefinicaoMinutos]
      );
      const url = `${config.appUrl}/?redefinir=${encodeURIComponent(token)}`;
      email.redefinirSenha(usuario, url).catch((e) => console.error("Falha ao enviar e-mail de redefinição:", e.message));
    }
    res.json(RESPOSTA_ESQUECI);
  });

  // ---------------------------------------------------------------------------
  // POST /api/auth/redefinir — { token, senha }
  // ---------------------------------------------------------------------------
  r.post("/redefinir", async (req, res) => {
    const ip = ipDaRequisicao(req);
    const token = req.body?.token;
    const senha = req.body?.senha;
    if (typeof token !== "string" || !token || token.length > 100) return res.status(400).json({ erro: "token", mensagem: "Link inválido." });
    if (!senhaValida(senha)) return res.status(400).json({ erro: "senha", mensagem: `A senha precisa ter de ${SENHA_MINIMA} a ${SENHA_MAXIMA} caracteres.` });

    if (await barrarSeBloqueado(req, res, null)) return;

    const pedido = await banco.primeira(
      `SELECT r.id, r.usuario_id, u.email
         FROM redefinicoes_senha r
         JOIN usuarios u ON u.id = r.usuario_id
        WHERE r.token_hash = ? AND r.usado_em IS NULL AND r.expira_em > NOW() AND u.status = 'ativo'`,
      [hashToken(token)]
    );
    if (!pedido) {
      const reg = await acesso.registrar(ip, null, false, "token_invalido");
      if (reg.resultado !== "ok") return responderFalha(res, reg, "");
      return res.status(400).json({ erro: "token", mensagem: "Este link expirou ou já foi usado. Peça um novo em \"Esqueci minha senha\"." });
    }

    // Marca o token como usado antes de trocar a senha (evita uso duplo em paralelo).
    const marcado = await banco.consulta("UPDATE redefinicoes_senha SET usado_em = NOW() WHERE id = ? AND usado_em IS NULL", [pedido.id]);
    if (marcado.affectedRows !== 1) return res.status(400).json({ erro: "token", mensagem: "Este link já foi usado." });

    await banco.consulta("UPDATE usuarios SET senha_hash = ? WHERE id = ?", [await gerarHashSenha(senha), pedido.usuario_id]);
    await acesso.encerrarTodasAsSessoes(pedido.usuario_id);
    await acesso.registrar(ip, pedido.email, true, "senha_redefinida");
    res.json({ ok: true, mensagem: "Senha alterada. Entre com a nova senha." });
  });

  return r;
}
