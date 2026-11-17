import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prepararAmbiente, criarDono, criarFuncionario, DONO } from "./ajuda.js";

let amb;
before(async () => { amb = await prepararAmbiente(); });
after(async () => { await amb?.fechar(); });
beforeEach(async () => { await amb.limpar(); });

// ---------------------------------------------------------------- cadastro --

test("o e-mail do dono vira administrador ativo e já entra logado", async () => {
  const dono = await criarDono(amb);
  const eu = await dono.get("/api/auth/eu");
  assert.equal(eu.status, 200);
  assert.equal(eu.json.usuario.email, DONO);
  assert.equal(eu.json.usuario.papel, "administrador");
});

test("o dono só vira administrador automaticamente uma vez", async () => {
  await criarDono(amb);
  await amb.banco.consulta("UPDATE usuarios SET email = 'antigo@grafica.test'");
  const nav = amb.navegador("10.1.1.1");
  const r = await nav.post("/api/auth/cadastro", { nome: "Outro", email: DONO, senha: "senha-forte-123" });
  assert.equal(r.status, 202);
  const u = await amb.banco.primeira("SELECT status, papel FROM usuarios WHERE email = ?", [DONO]);
  assert.deepEqual({ ...u }, { status: "pendente", papel: "funcionario" });
});

test("cadastro comum fica pendente, avisa o dono e não deixa entrar", async () => {
  await criarDono(amb);
  amb.emails.length = 0;
  const nav = amb.navegador("10.1.1.1");
  const c = await nav.post("/api/auth/cadastro", { nome: "Ana", email: "Ana@Grafica.test", senha: "senha-da-ana" });
  assert.equal(c.status, 202);
  assert.equal(c.json.pendente, true);
  assert.equal(nav.cookie, null);
  assert.ok(amb.emails.some((e) => e.tipo === "novoCadastroParaAprovar"));

  const l = await nav.post("/api/auth/login", { email: "ana@grafica.test", senha: "senha-da-ana" });
  assert.equal(l.status, 403);
  assert.equal(l.json.erro, "conta_pendente");
});

test("senha guardada é hash scrypt, nunca o texto", async () => {
  await criarDono(amb);
  const u = await amb.banco.primeira("SELECT senha_hash FROM usuarios WHERE email = ?", [DONO]);
  assert.match(u.senha_hash, /^scrypt\$32768\$8\$1\$/);
  assert.ok(!u.senha_hash.includes("senha-forte-123"));
});

test("cadastro com e-mail já existente responde igual e avisa o dono do e-mail", async () => {
  await criarDono(amb);
  amb.emails.length = 0;
  const nav = amb.navegador("10.1.1.1");
  const r = await nav.post("/api/auth/cadastro", { nome: "Intruso", email: DONO, senha: "outra-senha-1" });
  assert.equal(r.status, 202);
  assert.ok(amb.emails.some((e) => e.tipo === "cadastroDuplicado"));
  const total = await amb.banco.primeira("SELECT COUNT(*) AS n FROM usuarios");
  assert.equal(Number(total.n), 1);
});

test("validações do cadastro", async () => {
  const nav = amb.navegador();
  assert.equal((await nav.post("/api/auth/cadastro", { nome: "A", email: "a@b.co", senha: "12345678" })).status, 400);
  assert.equal((await nav.post("/api/auth/cadastro", { nome: "Ana", email: "nao-e-email", senha: "12345678" })).status, 400);
  assert.equal((await nav.post("/api/auth/cadastro", { nome: "Ana", email: "a@b.co", senha: "1234567" })).status, 400);
});

// ------------------------------------------------------------ aprovação ----

test("dono aprova o funcionário, que passa a entrar sem poder administrar", async () => {
  const dono = await criarDono(amb);
  const f = await criarFuncionario(amb, dono);
  assert.ok(amb.emails.some((e) => e.tipo === "contaAprovada"));

  const nav = amb.navegador("10.2.2.2");
  const l = await nav.post("/api/auth/login", { email: f.email, senha: f.senha });
  assert.equal(l.status, 200);
  assert.equal(l.json.usuario.papel, "funcionario");
  assert.equal((await nav.get("/api/admin/usuarios")).status, 403);
  assert.equal((await amb.navegador("10.3.3.3").get("/api/admin/usuarios")).status, 401);
});

test("recusar cadastro pendente impede o acesso", async () => {
  const dono = await criarDono(amb);
  const nav = amb.navegador("10.1.1.1");
  await nav.post("/api/auth/cadastro", { nome: "Bia", email: "bia@grafica.test", senha: "senha-da-bia" });
  const u = (await dono.get("/api/admin/usuarios")).json.usuarios.find((x) => x.email === "bia@grafica.test");
  assert.equal((await dono.post(`/api/admin/usuarios/${u.id}/recusar`)).status, 200);
  const l = await nav.post("/api/auth/login", { email: "bia@grafica.test", senha: "senha-da-bia" });
  assert.equal(l.json.erro, "conta_inativa");
});

test("desativar derruba a sessão na hora", async () => {
  const dono = await criarDono(amb);
  const f = await criarFuncionario(amb, dono);
  const nav = amb.navegador("10.2.2.2");
  await nav.post("/api/auth/login", { email: f.email, senha: f.senha });
  assert.equal((await nav.get("/api/auth/eu")).status, 200);
  assert.equal((await dono.post(`/api/admin/usuarios/${f.id}/desativar`)).status, 200);
  assert.equal((await nav.get("/api/auth/eu")).status, 401);
});

test("o único administrador não pode se rebaixar nem se desativar", async () => {
  const dono = await criarDono(amb);
  const eu = (await dono.get("/api/auth/eu")).json.usuario;
  assert.equal((await dono.post(`/api/admin/usuarios/${eu.id}/aprovar`, { papel: "funcionario" })).status, 409);
  assert.equal((await dono.post(`/api/admin/usuarios/${eu.id}/desativar`)).status, 409);
});

// ------------------------------------------------------------------ login --

test("login, /eu e sair", async () => {
  await criarDono(amb);
  const nav = amb.navegador("10.4.4.4");
  const l = await nav.post("/api/auth/login", { email: " DONO@grafica.test ", senha: "senha-forte-123" });
  assert.equal(l.status, 200);
  const cookie = l.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
  assert.equal((await nav.get("/api/auth/eu")).status, 200);
  await nav.post("/api/auth/sair");
  assert.equal((await nav.get("/api/auth/eu")).status, 401);
});

test("o banco guarda só o hash do token de sessão", async () => {
  await criarDono(amb);
  const nav = amb.navegador("10.4.4.4");
  await nav.post("/api/auth/login", { email: DONO, senha: "senha-forte-123" });
  const token = decodeURIComponent(nav.cookie.split("=")[1]);
  const achou = await amb.banco.primeira("SELECT COUNT(*) AS n FROM sessoes WHERE token_hash = ?", [token]);
  assert.equal(Number(achou.n), 0);
});

test("senha errada mostra quantas tentativas restam", async () => {
  await criarDono(amb);
  const nav = amb.navegador("10.5.5.5");
  const r = await nav.post("/api/auth/login", { email: DONO, senha: "errada-1" });
  assert.equal(r.status, 401);
  assert.equal(r.json.tentativasRestantes, 4);
});

test("tentativa de SQL injection não passa e não quebra nada", async () => {
  await criarDono(amb);
  const nav = amb.navegador("10.6.6.6");
  for (const ataque of ["' OR '1'='1' -- ", "x@y.com'; DROP TABLE usuarios; --", "\" OR \"\"=\""]) {
    const r = await nav.post("/api/auth/login", { email: ataque, senha: "' OR '1'='1" });
    assert.ok([401, 429].includes(r.status), `status ${r.status} para ${ataque}`);
    assert.equal(nav.cookie, null);
  }
  const total = await amb.banco.primeira("SELECT COUNT(*) AS n FROM usuarios");
  assert.equal(Number(total.n), 1);
});

// --------------------------------------------------------------- bloqueio --

async function errar(nav, vezes, email = DONO) {
  let r;
  for (let i = 0; i < vezes; i++) r = await nav.post("/api/auth/login", { email, senha: "senha-errada-" + i });
  return r;
}

test("5 erros em 15 min bloqueiam o IP por 15 min — até com a senha certa", async () => {
  await criarDono(amb);
  const nav = amb.navegador("10.7.7.7");
  const r = await errar(nav, 5);
  assert.equal(r.status, 429);
  assert.equal(r.json.erro, "ip_bloqueado");
  assert.ok(r.json.segundos > 14 * 60 && r.json.segundos <= 15 * 60);

  const certa = await nav.post("/api/auth/login", { email: DONO, senha: "senha-forte-123" });
  assert.equal(certa.status, 429);

  // Outro IP continua entrando normalmente.
  const outro = amb.navegador("10.7.7.8");
  assert.equal((await outro.post("/api/auth/login", { email: DONO, senha: "senha-forte-123" })).status, 200);
});

test("erros espalhados por mais de 15 min não bloqueiam", async () => {
  await criarDono(amb);
  const nav = amb.navegador("10.7.7.7");
  await errar(nav, 4);
  await amb.passarTempo(16, nav.ip);
  const r = await errar(nav, 1);
  assert.equal(r.status, 401);
});

test("login certo zera a contagem de erros do IP", async () => {
  await criarDono(amb);
  const nav = amb.navegador("10.7.7.7");
  await errar(nav, 4);
  assert.equal((await nav.post("/api/auth/login", { email: DONO, senha: "senha-forte-123" })).status, 200);
  const r = await errar(nav, 4);
  assert.equal(r.status, 401);
});

test("bloqueios escalam 15 min → 1 h → 24 h → permanente", async () => {
  await criarDono(amb);
  const nav = amb.navegador("10.7.7.7");
  const esperado = [15 * 60, 60 * 60, 24 * 60 * 60];

  for (const segundos of esperado) {
    const r = await errar(nav, 5);
    assert.equal(r.json.erro, "ip_bloqueado");
    assert.ok(Math.abs(r.json.segundos - segundos) <= 5, `esperava ~${segundos}s, veio ${r.json.segundos}`);
    await amb.passarTempo(segundos / 60 + 1, nav.ip); // espera o bloqueio acabar
  }

  const r = await errar(nav, 5);
  assert.equal(r.status, 403);
  assert.equal(r.json.erro, "ip_banido");

  // Banido de vez: nem a /api/config responde, mesmo dias depois.
  await amb.passarTempo(3 * 24 * 60, nav.ip);
  assert.equal((await nav.get("/api/config")).status, 403);
  const tipos = await amb.banco.consulta("SELECT permanente FROM bloqueios_ip WHERE ip = ? ORDER BY id", [nav.ip]);
  assert.deepEqual(tipos.map((t) => Number(t.permanente)), [0, 0, 0, 1]);
});

test("bloqueios de mais de 7 dias atrás não contam para a escala", async () => {
  await criarDono(amb);
  const nav = amb.navegador("10.7.7.7");
  await errar(nav, 5);
  await amb.passarTempo(8 * 24 * 60, nav.ip);
  const r = await errar(nav, 5);
  assert.ok(Math.abs(r.json.segundos - 15 * 60) <= 5);
});

test("o dono libera um IP bloqueado e ele volta a entrar", async () => {
  const dono = await criarDono(amb);
  const nav = amb.navegador("10.7.7.7");
  await errar(nav, 5);
  const lista = await dono.get("/api/admin/bloqueios");
  assert.equal(lista.json.bloqueios[0].ip, nav.ip);
  const lib = await dono.post("/api/admin/bloqueios/liberar", { ip: nav.ip });
  assert.equal(lib.json.liberados, 1);
  assert.equal((await nav.post("/api/auth/login", { email: DONO, senha: "senha-forte-123" })).status, 200);
  assert.equal((await dono.get("/api/admin/bloqueios")).json.bloqueios.length, 0);
});

test("liberar um banimento permanente devolve o acesso", async () => {
  const dono = await criarDono(amb);
  await amb.banco.consulta("INSERT INTO bloqueios_ip (ip, permanente, motivo) VALUES ('10.7.7.7', 1, 'teste')");
  const nav = amb.navegador("10.7.7.7");
  assert.equal((await nav.get("/api/config")).status, 403);
  await dono.post("/api/admin/bloqueios/liberar", { ip: "10.7.7.7" });
  assert.equal((await nav.get("/api/config")).status, 200);
});

test("10 erros no mesmo e-mail vindos de IPs diferentes travam esse e-mail", async () => {
  await criarDono(amb);
  for (let i = 0; i < 10; i++) {
    await amb.navegador(`10.50.0.${i + 1}`).post("/api/auth/login", { email: DONO, senha: "errada" });
  }
  const r = await amb.navegador("10.60.0.1").post("/api/auth/login", { email: DONO, senha: "senha-forte-123" });
  assert.equal(r.status, 429);
  assert.equal(r.json.erro, "email_travado");
  // Nenhum IP foi banido por isso.
  const b = await amb.banco.primeira("SELECT COUNT(*) AS n FROM bloqueios_ip");
  assert.equal(Number(b.n), 0);
});

// ------------------------------------------------------ recuperar senha ----

function tokenDoEmail() {
  const e = amb.emails.find((x) => x.tipo === "redefinirSenha");
  return e ? new URL(e.args[1]).searchParams.get("redefinir") : null;
}

test("recuperação: link por e-mail troca a senha e derruba sessões antigas", async () => {
  const dono = await criarDono(amb);
  const nav = amb.navegador("10.11.0.1");
  const r = await nav.post("/api/auth/esqueci", { email: DONO });
  assert.equal(r.status, 200);
  const token = tokenDoEmail();
  assert.ok(token);

  const ok = await nav.post("/api/auth/redefinir", { token, senha: "nova-senha-456" });
  assert.equal(ok.status, 200);
  assert.equal((await dono.get("/api/auth/eu")).status, 401); // sessão antiga caiu
  assert.equal((await nav.post("/api/auth/login", { email: DONO, senha: "senha-forte-123" })).status, 401);
  assert.equal((await nav.post("/api/auth/login", { email: DONO, senha: "nova-senha-456" })).status, 200);

  // Link de uso único.
  assert.equal((await nav.post("/api/auth/redefinir", { token, senha: "outra-senha-789" })).status, 400);
});

test("recuperação: link expira em 30 minutos", async () => {
  await criarDono(amb);
  const nav = amb.navegador("10.11.0.1");
  await nav.post("/api/auth/esqueci", { email: DONO });
  await amb.banco.consulta("UPDATE redefinicoes_senha SET expira_em = NOW() - INTERVAL 1 MINUTE");
  assert.equal((await nav.post("/api/auth/redefinir", { token: tokenDoEmail(), senha: "nova-senha-456" })).status, 400);
});

test("recuperação: e-mail inexistente recebe a mesma resposta e nenhum e-mail sai", async () => {
  await criarDono(amb);
  const nav = amb.navegador("10.11.0.1");
  const existe = await nav.post("/api/auth/esqueci", { email: DONO });
  amb.emails.length = 0;
  const naoExiste = await nav.post("/api/auth/esqueci", { email: "ninguem@grafica.test" });
  assert.deepEqual(naoExiste.json, existe.json);
  assert.equal(amb.emails.length, 0);
});

test("recuperação: só 3 pedidos por e-mail por hora", async () => {
  await criarDono(amb);
  const nav = amb.navegador("10.11.0.1");
  for (let i = 0; i < 3; i++) assert.equal((await nav.post("/api/auth/esqueci", { email: DONO })).status, 200);
  assert.equal((await nav.post("/api/auth/esqueci", { email: DONO })).status, 429);
});

test("recuperação: chutar tokens conta como tentativa e bloqueia o IP", async () => {
  await criarDono(amb);
  const nav = amb.navegador("10.12.0.1");
  let r;
  for (let i = 0; i < 5; i++) r = await nav.post("/api/auth/redefinir", { token: "chute-" + i, senha: "nova-senha-456" });
  assert.equal(r.status, 429);
});

// ---------------------------------------------------------------- Google --

test("Google: conta nova fica pendente; com o e-mail do dono vira administrador", async () => {
  amb.contasGoogle.set("cred-ana", { sub: "g-ana", email: "ana@gmail.test", email_verified: true, name: "Ana Google" });
  const ana = await amb.navegador("10.20.0.1").post("/api/auth/google", { credential: "cred-ana" });
  assert.equal(ana.status, 403);
  assert.equal(ana.json.erro, "conta_pendente");

  amb.contasGoogle.set("cred-dono", { sub: "g-dono", email: DONO, email_verified: true, name: "Dono" });
  const nav = amb.navegador("10.20.0.2");
  const dono = await nav.post("/api/auth/google", { credential: "cred-dono" });
  assert.equal(dono.status, 200);
  assert.equal(dono.json.usuario.papel, "administrador");
});

test("Google: vincula à conta existente com o mesmo e-mail", async () => {
  await criarDono(amb);
  amb.contasGoogle.set("cred", { sub: "g-123", email: DONO, email_verified: true, name: "Dono" });
  const r = await amb.navegador("10.20.0.3").post("/api/auth/google", { credential: "cred" });
  assert.equal(r.status, 200);
  const u = await amb.banco.primeira("SELECT google_sub FROM usuarios WHERE email = ?", [DONO]);
  assert.equal(u.google_sub, "g-123");
});

test("Google: credencial falsa ou e-mail não verificado é recusado", async () => {
  const nav = amb.navegador("10.20.0.4");
  assert.equal((await nav.post("/api/auth/google", { credential: "inventada" })).status, 401);
  amb.contasGoogle.set("nao-verificado", { sub: "g-x", email: "x@gmail.test", email_verified: false });
  assert.equal((await nav.post("/api/auth/google", { credential: "nao-verificado" })).status, 401);
});

// ---------------------------------------------------- proteção da API ----

test("pedido de outro site (Origin diferente) é recusado", async () => {
  await criarDono(amb);
  const nav = amb.navegador("10.30.0.1");
  const r = await nav.post("/api/auth/login", { email: DONO, senha: "senha-forte-123" }, { headers: { Origin: "https://site-malicioso.test" } });
  assert.equal(r.status, 403);
  assert.equal(r.json.erro, "origem");
});

test("formulário comum (não JSON) é recusado", async () => {
  const nav = amb.navegador("10.30.0.2");
  const r = await nav.cru("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "email=a&senha=b" });
  assert.equal(r.status, 415);
});

test("cabeçalhos de segurança e página servida", async () => {
  const r = await fetch(amb.url + "/");
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("x-frame-options"), "DENY");
  assert.match(r.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  assert.match(await r.text(), /MazFlow/);
});

test("/api/config informa o modo servidor e o client id do Google", async () => {
  const r = await amb.navegador().get("/api/config");
  assert.deepEqual(r.json, { modo: "servidor", googleClientId: "cliente-teste" });
});
