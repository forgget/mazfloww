import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prepararAmbiente, criarDono, criarFuncionario } from "./ajuda.js";

let amb;
before(async () => { amb = await prepararAmbiente(); });
after(async () => { await amb?.fechar(); });
beforeEach(async () => { await amb.limpar(); });

const PAPEL = { nome: "Papel couché 170g A3", unidade: "folha", preco_unitario: 0.95, quantidade_estoque: 500, estoque_minimo: 200 };
const LANC = { data: "2026-11-17", descricao: "Banner 3x1m — Padaria", categoria: "Comunicação visual", tipo: "entrada", valor: 420 };

async function funcionarioLogado(dono) {
  const f = await criarFuncionario(amb, dono);
  const nav = amb.navegador("10.2.2.2");
  await nav.post("/api/auth/login", { email: f.email, senha: f.senha });
  return nav;
}

// ------------------------------------------------------------- acesso ----

test("sem login nada dos dados da gráfica é entregue nem alterado", async () => {
  const nav = amb.navegador();
  assert.equal((await nav.get("/api/dados")).status, 401);
  assert.equal((await nav.post("/api/lancamentos", LANC)).status, 401);
  assert.equal((await nav.del("/api/lancamentos/1")).status, 401);
  const n = await amb.banco.primeira("SELECT COUNT(*) AS n FROM lancamentos");
  assert.equal(Number(n.n), 0);
});

test("sessão encerrada perde o acesso aos dados na hora", async () => {
  const dono = await criarDono(amb);
  const nav = await funcionarioLogado(dono);
  assert.equal((await nav.get("/api/dados")).status, 200);
  const f = (await dono.get("/api/admin/usuarios")).json.usuarios.find((u) => u.papel === "funcionario");
  await dono.post(`/api/admin/usuarios/${f.id}/desativar`);
  assert.equal((await nav.get("/api/dados")).status, 401);
});

test("DELETE vindo de outro site é recusado", async () => {
  const dono = await criarDono(amb);
  const l = (await dono.post("/api/lancamentos", LANC)).json.lancamento;
  const r = await dono.del(`/api/lancamentos/${l.id}`, { headers: { Origin: "https://site-malicioso.test" } });
  assert.equal(r.status, 403);
  assert.equal((await dono.get("/api/dados")).json.lancamentos.length, 1);
});

// ---------------------------------------------------------- materiais ----

test("só administrador cria, edita e apaga materiais", async () => {
  const dono = await criarDono(amb);
  const func = await funcionarioLogado(dono);
  assert.equal((await func.post("/api/materiais", PAPEL)).status, 403);

  const criado = await dono.post("/api/materiais", PAPEL);
  assert.equal(criado.status, 201);
  const id = criado.json.material.id;
  assert.equal((await func.put(`/api/materiais/${id}`, { ...PAPEL, preco_unitario: 0 })).status, 403);
  assert.equal((await func.del(`/api/materiais/${id}`)).status, 403);

  const editado = await dono.put(`/api/materiais/${id}`, { ...PAPEL, preco_unitario: 1.1 });
  assert.equal(editado.json.material.preco_unitario, 1.1);
  // funcionário consegue ver
  assert.equal((await func.get("/api/dados")).json.materiais[0].preco_unitario, 1.1);
  assert.equal((await dono.del(`/api/materiais/${id}`)).status, 200);
});

test("validação de material", async () => {
  const dono = await criarDono(amb);
  for (const ruim of [
    { ...PAPEL, nome: "" },
    { ...PAPEL, preco_unitario: -1 },
    { ...PAPEL, preco_unitario: "abc" },
    { ...PAPEL, quantidade_estoque: 1e12 },
    { ...PAPEL, unidade: "x".repeat(21) }
  ]) {
    const r = await dono.post("/api/materiais", ruim);
    assert.equal(r.status, 400, JSON.stringify(ruim));
    assert.equal(r.json.erro, "validacao");
  }
});

test("material usado em orçamento não pode ser apagado", async () => {
  const dono = await criarDono(amb);
  const m = (await dono.post("/api/materiais", PAPEL)).json.material;
  await dono.post("/api/orcamentos", { nomeServico: "Catálogo", cliente: "Móveis Aurora", margem: 40, itens: [{ materialId: m.id, quantidade: 10 }] });
  const r = await dono.del(`/api/materiais/${m.id}`);
  assert.equal(r.status, 409);
  assert.equal(r.json.erro, "em_uso");
});

// -------------------------------------------------------- lançamentos ----

test("lançamento: criar, editar, apagar", async () => {
  const dono = await criarDono(amb);
  const func = await funcionarioLogado(dono);
  const c = await func.post("/api/lancamentos", LANC);
  assert.equal(c.status, 201);
  assert.deepEqual({ ...c.json.lancamento, id: 0 }, { ...LANC, id: 0 });

  const e = await func.put(`/api/lancamentos/${c.json.lancamento.id}`, { ...LANC, valor: 450.5 });
  assert.equal(e.json.lancamento.valor, 450.5);
  assert.equal((await func.del(`/api/lancamentos/${c.json.lancamento.id}`)).status, 200);
  assert.equal((await func.del(`/api/lancamentos/${c.json.lancamento.id}`)).status, 404);
});

test("lançamento: recusa categoria, tipo, valor e data inválidos", async () => {
  const dono = await criarDono(amb);
  for (const ruim of [
    { ...LANC, categoria: "Inventada" },
    { ...LANC, tipo: "transferencia" },
    { ...LANC, valor: 0 },
    { ...LANC, valor: -50 },
    { ...LANC, data: "2026-02-30" },
    { ...LANC, data: "ontem" },
    { ...LANC, descricao: "x".repeat(201) }
  ]) {
    assert.equal((await dono.post("/api/lancamentos", ruim)).status, 400, JSON.stringify(ruim));
  }
});

test("texto com SQL é gravado como texto, sem executar nada", async () => {
  const dono = await criarDono(amb);
  const ataque = "'); DROP TABLE lancamentos; --";
  const r = await dono.post("/api/lancamentos", { ...LANC, descricao: ataque });
  assert.equal(r.status, 201);
  const salvo = await amb.banco.primeira("SELECT descricao FROM lancamentos WHERE id = ?", [r.json.lancamento.id]);
  assert.equal(salvo.descricao, ataque);
  assert.equal((await dono.get("/api/dados")).json.lancamentos.length, 1);
});

test("id inválido na URL é recusado", async () => {
  const dono = await criarDono(amb);
  assert.equal((await dono.del("/api/lancamentos/1%20OR%201=1")).status, 400);
  assert.equal((await dono.del("/api/lancamentos/-3")).status, 400);
});

// ------------------------------------------------------- contas fixas ----

test("pagar conta cria o lançamento junto; desfazer apaga", async () => {
  const dono = await criarDono(amb);
  const conta = (await dono.post("/api/contas", { nome: "Aluguel da gráfica", valor: 3200, vencimento: "2026-11-20" })).json.conta;
  assert.equal(conta.status, "pendente");

  const pago = await dono.post(`/api/contas/${conta.id}/pagar`, { data: "2026-11-17" });
  assert.equal(pago.status, 200);
  assert.equal(pago.json.conta.status, "pago");
  assert.equal(pago.json.lancamento.valor, 3200);
  assert.equal(pago.json.lancamento.tipo, "saida");
  assert.equal(pago.json.conta.lancamentoId, pago.json.lancamento.id);

  assert.equal((await dono.post(`/api/contas/${conta.id}/pagar`, { data: "2026-11-17" })).status, 409);

  const desfeito = await dono.post(`/api/contas/${conta.id}/desfazer`, {});
  assert.equal(desfeito.json.conta.status, "pendente");
  assert.equal((await dono.get("/api/dados")).json.lancamentos.length, 0);
});

test("apagar o lançamento de uma conta paga reabre a conta", async () => {
  const dono = await criarDono(amb);
  const conta = (await dono.post("/api/contas", { nome: "Energia", valor: 680, vencimento: "2026-11-18" })).json.conta;
  const pago = (await dono.post(`/api/contas/${conta.id}/pagar`, { data: "2026-11-17" })).json;
  const r = await dono.del(`/api/lancamentos/${pago.lancamento.id}`);
  assert.equal(r.json.contaReabertaId, conta.id);
  const dados = (await dono.get("/api/dados")).json;
  assert.equal(dados.contasFixas[0].status, "pendente");
  assert.equal(dados.contasFixas[0].lancamentoId, null);
});

test("apagar conta paga apaga o lançamento dela", async () => {
  const dono = await criarDono(amb);
  const conta = (await dono.post("/api/contas", { nome: "Água", valor: 95, vencimento: "2026-11-29" })).json.conta;
  await dono.post(`/api/contas/${conta.id}/pagar`, { data: "2026-11-17" });
  assert.equal((await dono.del(`/api/contas/${conta.id}`)).status, 200);
  const dados = (await dono.get("/api/dados")).json;
  assert.equal(dados.contasFixas.length, 0);
  assert.equal(dados.lancamentos.length, 0);
});

// --------------------------------------------------------- orçamentos ----

test("orçamento: o servidor recalcula o valor e ignora números do navegador", async () => {
  const dono = await criarDono(amb);
  const papel = (await dono.post("/api/materiais", PAPEL)).json.material;
  const espiral = (await dono.post("/api/materiais", { ...PAPEL, nome: "Espiral 17mm", unidade: "un", preco_unitario: 1.85 })).json.material;
  const r = await dono.post("/api/orcamentos", {
    nomeServico: "Catálogo 20 páginas", cliente: "Móveis Aurora", margem: 45,
    custoMateriais: 1, valorSugerido: 1, // tentativa de forjar
    itens: [{ materialId: papel.id, quantidade: 220 }, { materialId: espiral.id, quantidade: 20 }]
  });
  assert.equal(r.status, 201);
  assert.equal(r.json.orcamento.custoMateriais, 246);          // 220×0,95 + 20×1,85
  assert.equal(r.json.orcamento.valorSugerido, 447.27);        // 246 ÷ 0,55
  assert.equal(r.json.orcamento.itens.length, 2);
  assert.equal((await dono.del(`/api/orcamentos/${r.json.orcamento.id}`)).status, 200);
  const itens = await amb.banco.primeira("SELECT COUNT(*) AS n FROM orcamento_itens");
  assert.equal(Number(itens.n), 0);
});

test("orçamento: material inexistente ou sem itens é recusado", async () => {
  const dono = await criarDono(amb);
  const base = { nomeServico: "X", cliente: "Y", margem: 40 };
  assert.equal((await dono.post("/api/orcamentos", { ...base, itens: [] })).status, 400);
  assert.equal((await dono.post("/api/orcamentos", { ...base, itens: [{ materialId: 999, quantidade: 1 }] })).status, 400);
  assert.equal((await dono.post("/api/orcamentos", { ...base, margem: 100, itens: [{ materialId: 1, quantidade: 1 }] })).status, 400);
  const n = await amb.banco.primeira("SELECT COUNT(*) AS n FROM orcamentos");
  assert.equal(Number(n.n), 0);
});

// ---------------------------------------------------- dados e auditoria ----

test("GET /api/dados devolve tudo no formato da página, com 5 meses de histórico", async () => {
  const dono = await criarDono(amb);
  await dono.post("/api/lancamentos", LANC);
  const d = (await dono.get("/api/dados")).json;
  assert.deepEqual(Object.keys(d).sort(), ["contasFixas", "historicoFluxo", "lancamentos", "materiais", "orcamentos"]);
  assert.equal(d.historicoFluxo.length, 5);
  assert.equal(typeof d.lancamentos[0].valor, "number");
});

test("histórico soma lançamentos dos meses anteriores", async () => {
  const dono = await criarDono(amb);
  const mesPassado = await amb.banco.primeira("SELECT DATE_FORMAT(CURDATE() - INTERVAL 1 MONTH, '%Y-%m-10') AS d");
  await dono.post("/api/lancamentos", { ...LANC, data: mesPassado.d, valor: 1000 });
  await dono.post("/api/lancamentos", { ...LANC, data: mesPassado.d, tipo: "saida", categoria: "Material", valor: 300 });
  const h = (await dono.get("/api/dados")).json.historicoFluxo;
  assert.deepEqual(h[4], { entradas: 1000, saidas: 300 });
});

test("toda alteração fica na auditoria com quem fez e de qual IP", async () => {
  const dono = await criarDono(amb);
  const func = await funcionarioLogado(dono);
  const l = (await func.post("/api/lancamentos", LANC)).json.lancamento;
  await func.put(`/api/lancamentos/${l.id}`, { ...LANC, valor: 99 });
  await func.del(`/api/lancamentos/${l.id}`);

  const linhas = await amb.banco.consulta(
    "SELECT a.acao, a.entidade, a.ip, u.email, a.detalhes FROM auditoria a JOIN usuarios u ON u.id = a.usuario_id WHERE a.entidade = 'lancamento' ORDER BY a.id"
  );
  assert.deepEqual(linhas.map((x) => x.acao), ["criar", "editar", "apagar"]);
  assert.ok(linhas.every((x) => x.ip === "10.2.2.2" && x.email === "func@grafica.test"));
  const editar = typeof linhas[1].detalhes === "string" ? JSON.parse(linhas[1].detalhes) : linhas[1].detalhes;
  assert.equal(editar.antes.valor, 420);
  assert.equal(editar.depois.valor, 99);

  const aprov = await amb.banco.primeira("SELECT COUNT(*) AS n FROM auditoria WHERE entidade = 'usuario' AND acao = 'aprovar'");
  assert.equal(Number(aprov.n), 1);
});

test("rota inexistente da API responde 404 em JSON", async () => {
  const dono = await criarDono(amb);
  const r = await dono.get("/api/nao-existe");
  assert.equal(r.status, 404);
  assert.equal(r.json.erro, "nao_encontrado");
});
