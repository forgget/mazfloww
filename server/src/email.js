// Envio de e-mails. Sem SMTP configurado (desenvolvimento), imprime no log.
import nodemailer from "nodemailer";

function escapar(texto) {
  return String(texto).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function html(titulo, paragrafos, botao) {
  const corpo = paragrafos.map((p) => `<p style="margin:0 0 14px;line-height:1.5">${escapar(p)}</p>`).join("");
  const link = botao
    ? `<p style="margin:22px 0"><a href="${escapar(botao.url)}" style="background:#0033ff;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">${escapar(botao.texto)}</a></p>
       <p style="font-size:12px;color:#737889;line-height:1.5">Se o botão não abrir, copie este endereço no navegador:<br>${escapar(botao.url)}</p>`
    : "";
  return `<div style="font-family:Segoe UI,Arial,sans-serif;color:#10111a;max-width:520px">
    <h2 style="font-size:18px;margin:0 0 16px">${escapar(titulo)}</h2>${corpo}${link}
    <p style="font-size:12px;color:#737889;margin-top:28px">MazFlow · Gráfica Mazart</p></div>`;
}

export function criarEmail(config) {
  const transporte = config.smtp.host
    ? nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.port === 465,
        auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined
      })
    : null;

  async function enviar({ para, assunto, titulo, paragrafos, botao }) {
    const texto = [...paragrafos, botao ? `${botao.texto}: ${botao.url}` : ""].filter(Boolean).join("\n\n");
    if (!transporte) {
      console.log(`\n[e-mail não enviado — SMTP não configurado]\nPara: ${para}\nAssunto: ${assunto}\n${texto}\n`);
      return;
    }
    await transporte.sendMail({ from: config.smtp.from, to: para, subject: assunto, text: texto, html: html(titulo, paragrafos, botao) });
  }

  return {
    enviar,

    redefinirSenha(usuario, url) {
      return enviar({
        para: usuario.email,
        assunto: "Redefinir sua senha do MazFlow",
        titulo: "Redefinir senha",
        paragrafos: [
          `Olá, ${usuario.nome}. Recebemos um pedido para redefinir a senha da sua conta no MazFlow.`,
          `O link vale por ${config.redefinicaoMinutos} minutos e só pode ser usado uma vez.`,
          "Se não foi você, ignore este e-mail: sua senha continua a mesma."
        ],
        botao: { texto: "Criar nova senha", url }
      });
    },

    cadastroDuplicado(usuario) {
      return enviar({
        para: usuario.email,
        assunto: "Tentativa de cadastro com o seu e-mail",
        titulo: "Você já tem conta no MazFlow",
        paragrafos: [
          `Olá, ${usuario.nome}. Alguém tentou criar uma conta no MazFlow com este e-mail, mas ele já está cadastrado.`,
          "Se foi você, entre normalmente ou use \"Esqueci minha senha\". Se não foi, nada muda na sua conta."
        ],
        botao: { texto: "Abrir o MazFlow", url: config.appUrl }
      });
    },

    novoCadastroParaAprovar(admin, novo) {
      return enviar({
        para: admin.email,
        assunto: `Novo cadastro aguardando aprovação: ${novo.nome}`,
        titulo: "Novo cadastro para aprovar",
        paragrafos: [
          `${novo.nome} (${novo.email}) criou uma conta no MazFlow.`,
          "A pessoa só consegue entrar depois que você aprovar e definir se ela é administradora ou funcionária."
        ],
        botao: { texto: "Ver cadastros", url: `${config.appUrl}/#/usuarios` }
      });
    },

    contaAprovada(usuario) {
      return enviar({
        para: usuario.email,
        assunto: "Sua conta no MazFlow foi aprovada",
        titulo: "Conta aprovada",
        paragrafos: [
          `Olá, ${usuario.nome}. Sua conta foi aprovada como ${usuario.papel === "administrador" ? "administrador" : "funcionário"}.`,
          "Você já pode entrar no MazFlow."
        ],
        botao: { texto: "Entrar no MazFlow", url: config.appUrl }
      });
    }
  };
}
