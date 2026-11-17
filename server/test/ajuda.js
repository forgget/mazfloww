// Infraestrutura dos testes: banco mazflow_teste, servidor em porta livre,
// e-mail e Google falsos, e um "navegador" que guarda cookies.
import { carregarConfig } from "../src/config.js";
import { criarBanco } from "../src/db.js";
import { criarApp } from "../src/app.js";
import { migrar } from "../scripts/migrar.js";

export const DONO = "dono@grafica.test";

export async function prepararAmbiente({ googleClientId = "cliente-teste" } = {}) {
  const base = carregarConfig();
  const config = carregarConfig({
    producao: false,
    appUrl: "http://localhost:3999",
    donoEmail: DONO,
    googleClientId,
    trustProxy: "true", // os testes escolhem o IP pelo cabeçalho X-Forwarded-For
    banco: { ...base.banco, database: process.env.TEST_DB_NAME || "mazflow_teste" }
  });
  await migrar(config, { log: () => {} });
  const banco = criarBanco(config);

  const emails = [];
  const email = new Proxy({}, {
    get: (_, tipo) => async (...args) => { emails.push({ tipo, args }); }
  });

  const contasGoogle = new Map(); // credencial -> payload
  const verificarGoogle = async (credencial) => {
    if (!contasGoogle.has(credencial)) throw new Error("token inválido");
    return contasGoogle.get(credencial);
  };

  const app = criarApp({ config, banco, email, verificarGoogle });
  const servidor = await new Promise((ok) => { const s = app.listen(0, () => ok(s)); });
  const url = `http://127.0.0.1:${servidor.address().port}`;

  async function limpar() {
    await banco.consulta("SET FOREIGN_KEY_CHECKS = 0");
    for (const t of [
      "auditoria", "orcamento_itens", "orcamentos", "contas_fixas", "lancamentos", "materiais", "fluxo_historico",
      "sessoes", "redefinicoes_senha", "tentativas_login", "bloqueios_ip", "usuarios"
    ]) {
      await banco.consulta(`TRUNCATE TABLE ${t}`);
    }
    await banco.consulta("SET FOREIGN_KEY_CHECKS = 1");
    emails.length = 0;
    contasGoogle.clear();
  }

  // Faz o tempo "andar" para trás nos registros de um IP (simula espera).
  async function passarTempo(minutos, ip) {
    await banco.consulta("UPDATE tentativas_login SET criado_em = criado_em - INTERVAL ? MINUTE WHERE ip = ?", [minutos, ip]);
    await banco.consulta(
      "UPDATE bloqueios_ip SET inicio = inicio - INTERVAL ? MINUTE, fim = fim - INTERVAL ? MINUTE WHERE ip = ?",
      [minutos, minutos, ip]
    );
  }

  function navegador(ip = "10.0.0.1") {
    let cookie = null;
    async function pedir(metodo, caminho, corpo, extras = {}) {
      const headers = { "X-Forwarded-For": ip, ...(extras.headers || {}) };
      if (cookie) headers.Cookie = cookie;
      if (corpo !== undefined) headers["Content-Type"] = "application/json";
      const resp = await fetch(url + caminho, { method: metodo, headers, body: corpo !== undefined ? JSON.stringify(corpo) : undefined });
      const setCookie = resp.headers.get("set-cookie");
      if (setCookie) {
        const valor = setCookie.split(";")[0];
        cookie = /=$/.test(valor) || /Expires=Thu, 01 Jan 1970/i.test(setCookie) ? null : valor;
      }
      let json = null;
      try { json = await resp.json(); } catch { /* sem corpo JSON */ }
      return { status: resp.status, json, headers: resp.headers };
    }
    return {
      ip,
      get: (c, e) => pedir("GET", c, undefined, e),
      post: (c, b = {}, e) => pedir("POST", c, b, e),
      put: (c, b = {}, e) => pedir("PUT", c, b, e),
      del: (c, e) => pedir("DELETE", c, undefined, e),
      cru: (c, init) => fetch(url + c, { ...init, headers: { "X-Forwarded-For": ip, ...(init?.headers || {}) } }),
      get cookie() { return cookie; },
      set cookie(v) { cookie = v; }
    };
  }

  async function fechar() {
    await new Promise((ok) => servidor.close(ok));
    await banco.fechar();
  }

  return { config, banco, emails, contasGoogle, url, limpar, passarTempo, navegador, fechar };
}

// Cria o dono (administrador) já logado.
export async function criarDono(amb, ip = "10.9.9.9") {
  const nav = amb.navegador(ip);
  const r = await nav.post("/api/auth/cadastro", { nome: "Dono da Gráfica", email: DONO, senha: "senha-forte-123" });
  if (r.status !== 201) throw new Error("dono não criado: " + JSON.stringify(r.json));
  return nav;
}

// Cria um funcionário pendente e o aprova pelo dono.
export async function criarFuncionario(amb, dono, email = "func@grafica.test", senha = "senha-func-123") {
  const nav = amb.navegador("10.8.8.8");
  await nav.post("/api/auth/cadastro", { nome: "Funcionário", email, senha });
  const lista = await dono.get("/api/admin/usuarios");
  const u = lista.json.usuarios.find((x) => x.email === email);
  await dono.post(`/api/admin/usuarios/${u.id}/aprovar`, { papel: "funcionario" });
  return { id: u.id, email, senha };
}
