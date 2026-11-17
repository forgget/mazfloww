// Dados da gráfica: materiais, lançamentos, contas fixas e orçamentos.
// Todas as rotas exigem login (verificado em app.js). Editar materiais é só
// para administrador. Toda alteração é validada e registrada na auditoria.
import { Router } from "express";
import { auditar } from "../auditoria.js";
import * as v from "../validar.js";

export const CATEGORIAS = ["Impressão", "Acabamento", "Comunicação visual", "Material", "Manutenção", "Outros"];
const MAX_VALOR = 9999999999.99; // DECIMAL(12,2)
const MAX_MATERIAL = 99999999.99; // DECIMAL(10,2)

// ------------------------------------------------- linha do banco -> página --
const paraMaterial = (r) => ({
  id: r.id, nome: r.nome, unidade: r.unidade,
  preco_unitario: Number(r.preco_unitario),
  quantidade_estoque: Number(r.quantidade_estoque),
  estoque_minimo: Number(r.estoque_minimo)
});
const paraLancamento = (r) => ({
  id: r.id, data: r.data, descricao: r.descricao, categoria: r.categoria, tipo: r.tipo, valor: Number(r.valor)
});
const paraConta = (r) => ({
  id: r.id, nome: r.nome, valor: Number(r.valor), vencimento: r.vencimento, status: r.status, lancamentoId: r.lancamento_id
});
const paraOrcamento = (r, itens) => ({
  id: r.id, nomeServico: r.nome_servico, cliente: r.cliente, data: r.data, margem: Number(r.margem),
  itens: itens.map((i) => ({ materialId: i.material_id, quantidade: Number(i.quantidade) })),
  custoMateriais: Number(r.custo_materiais), valorSugerido: Number(r.valor_sugerido)
});

const SQL_MATERIAL = "SELECT id, nome, unidade, preco_unitario, quantidade_estoque, estoque_minimo FROM materiais";
const SQL_LANCAMENTO = "SELECT id, data, descricao, categoria, tipo, valor FROM lancamentos";
const SQL_CONTA = "SELECT id, nome, valor, vencimento, status, lancamento_id FROM contas_fixas";
const SQL_ORCAMENTO = "SELECT id, nome_servico, cliente, data, margem, custo_materiais, valor_sugerido FROM orcamentos";

function exigirAdmin(req, res, next) {
  if (req.usuario.papel !== "administrador") {
    return res.status(403).json({ erro: "proibido", mensagem: "Só administradores podem alterar materiais." });
  }
  next();
}

function naoEncontrado(res, o) {
  return res.status(404).json({ erro: "nao_encontrado", mensagem: `${o} não encontrado. Ele pode ter sido apagado por outra pessoa.` });
}

// Lê e valida os campos de cada tipo de registro.
function lerMaterial(b) {
  return {
    nome: v.texto(b.nome, "nome", "Nome", { max: 120 }),
    unidade: v.texto(b.unidade, "unidade", "Unidade", { max: 20 }),
    preco_unitario: v.numero(b.preco_unitario, "preco_unitario", "Preço", { max: MAX_MATERIAL }),
    quantidade_estoque: v.numero(b.quantidade_estoque, "quantidade_estoque", "Estoque", { max: MAX_MATERIAL }),
    estoque_minimo: v.numero(b.estoque_minimo, "estoque_minimo", "Estoque mínimo", { max: MAX_MATERIAL })
  };
}
function lerLancamento(b) {
  return {
    data: v.data(b.data, "data", "Data"),
    descricao: v.texto(b.descricao, "descricao", "Descrição", { max: 200 }),
    categoria: v.opcao(b.categoria, "categoria", "Categoria", CATEGORIAS),
    tipo: v.opcao(b.tipo, "tipo", "Tipo", ["entrada", "saida"]),
    valor: v.numero(b.valor, "valor", "Valor", { minExclusivo: true, max: MAX_VALOR })
  };
}

export function rotasDados({ banco }) {
  const r = Router();

  // ---------------------------------------------------------------------------
  // GET /api/dados — tudo que a página precisa para funcionar
  // ---------------------------------------------------------------------------
  r.get("/dados", async (req, res) => {
    const [materiais, lancamentos, contas, orcamentos, itens, mesAtual] = await Promise.all([
      banco.consulta(SQL_MATERIAL + " ORDER BY nome"),
      banco.consulta(SQL_LANCAMENTO + " WHERE data >= CURDATE() - INTERVAL 400 DAY ORDER BY data DESC, id DESC"),
      banco.consulta(SQL_CONTA + " ORDER BY vencimento"),
      banco.consulta(SQL_ORCAMENTO + " ORDER BY id DESC"),
      banco.consulta("SELECT orcamento_id, material_id, quantidade FROM orcamento_itens ORDER BY id"),
      banco.primeira("SELECT DATE_FORMAT(CURDATE(), '%Y-%m-01') AS mes")
    ]);

    // Histórico dos 5 meses anteriores: lançamentos + totais importados (fluxo_historico).
    const [ano, mes] = mesAtual.mes.split("-").map(Number);
    const meses = [];
    for (let i = 5; i >= 1; i--) {
      const d = new Date(Date.UTC(ano, mes - 1 - i, 1));
      meses.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`);
    }
    const somas = await banco.consulta(
      `SELECT mes, SUM(entradas) AS entradas, SUM(saidas) AS saidas FROM (
         SELECT DATE_FORMAT(data, '%Y-%m-01') AS mes,
                SUM(CASE WHEN tipo = 'entrada' THEN valor ELSE 0 END) AS entradas,
                SUM(CASE WHEN tipo = 'saida'   THEN valor ELSE 0 END) AS saidas
           FROM lancamentos WHERE data >= ? AND data < ? GROUP BY DATE_FORMAT(data, '%Y-%m-01')
         UNION ALL
         SELECT DATE_FORMAT(mes, '%Y-%m-01'), entradas, saidas FROM fluxo_historico WHERE mes >= ? AND mes < ?
       ) t GROUP BY mes`,
      [meses[0], mesAtual.mes, meses[0], mesAtual.mes]
    );
    const porMes = new Map(somas.map((s) => [s.mes, s]));

    const itensPorOrc = new Map();
    for (const i of itens) {
      if (!itensPorOrc.has(i.orcamento_id)) itensPorOrc.set(i.orcamento_id, []);
      itensPorOrc.get(i.orcamento_id).push(i);
    }

    res.json({
      materiais: materiais.map(paraMaterial),
      lancamentos: lancamentos.map(paraLancamento),
      contasFixas: contas.map(paraConta),
      orcamentos: orcamentos.map((o) => paraOrcamento(o, itensPorOrc.get(o.id) || [])),
      historicoFluxo: meses.map((m) => ({ entradas: Number(porMes.get(m)?.entradas || 0), saidas: Number(porMes.get(m)?.saidas || 0) }))
    });
  });

  // ------------------------------------------------------------ materiais ----
  r.post("/materiais", exigirAdmin, async (req, res) => {
    const m = lerMaterial(req.body || {});
    const novo = await banco.transacao(async (t) => {
      const x = await t.consulta(
        "INSERT INTO materiais (nome, unidade, preco_unitario, quantidade_estoque, estoque_minimo, criado_por) VALUES (?, ?, ?, ?, ?, ?)",
        [m.nome, m.unidade, m.preco_unitario, m.quantidade_estoque, m.estoque_minimo, req.usuario.id]
      );
      await auditar(t, req, "criar", "material", x.insertId, { depois: m });
      return t.primeira(SQL_MATERIAL + " WHERE id = ?", [x.insertId]);
    });
    res.status(201).json({ material: paraMaterial(novo) });
  });

  r.put("/materiais/:id", exigirAdmin, async (req, res) => {
    const id = v.id(req.params.id);
    const m = lerMaterial(req.body || {});
    const salvo = await banco.transacao(async (t) => {
      const antes = await t.primeira(SQL_MATERIAL + " WHERE id = ? FOR UPDATE", [id]);
      if (!antes) return null;
      await t.consulta(
        "UPDATE materiais SET nome = ?, unidade = ?, preco_unitario = ?, quantidade_estoque = ?, estoque_minimo = ? WHERE id = ?",
        [m.nome, m.unidade, m.preco_unitario, m.quantidade_estoque, m.estoque_minimo, id]
      );
      await auditar(t, req, "editar", "material", id, { antes: paraMaterial(antes), depois: m });
      return t.primeira(SQL_MATERIAL + " WHERE id = ?", [id]);
    });
    if (!salvo) return naoEncontrado(res, "Material");
    res.json({ material: paraMaterial(salvo) });
  });

  r.delete("/materiais/:id", exigirAdmin, async (req, res) => {
    const id = v.id(req.params.id);
    const ok = await banco.transacao(async (t) => {
      const antes = await t.primeira(SQL_MATERIAL + " WHERE id = ? FOR UPDATE", [id]);
      if (!antes) return null;
      const uso = await t.primeira("SELECT COUNT(*) AS n FROM orcamento_itens WHERE material_id = ?", [id]);
      if (Number(uso.n) > 0) return "em_uso";
      await t.consulta("DELETE FROM materiais WHERE id = ?", [id]);
      await auditar(t, req, "apagar", "material", id, { antes: paraMaterial(antes) });
      return true;
    });
    if (!ok) return naoEncontrado(res, "Material");
    if (ok === "em_uso") {
      return res.status(409).json({ erro: "em_uso", mensagem: "Este material está em orçamentos salvos. Apague esses orçamentos antes de apagar o material." });
    }
    res.json({ ok: true });
  });

  // ---------------------------------------------------------- lançamentos ----
  r.post("/lancamentos", async (req, res) => {
    const l = lerLancamento(req.body || {});
    const novo = await banco.transacao(async (t) => {
      const x = await t.consulta(
        "INSERT INTO lancamentos (data, descricao, categoria, tipo, valor, criado_por) VALUES (?, ?, ?, ?, ?, ?)",
        [l.data, l.descricao, l.categoria, l.tipo, l.valor, req.usuario.id]
      );
      await auditar(t, req, "criar", "lancamento", x.insertId, { depois: l });
      return t.primeira(SQL_LANCAMENTO + " WHERE id = ?", [x.insertId]);
    });
    res.status(201).json({ lancamento: paraLancamento(novo) });
  });

  r.put("/lancamentos/:id", async (req, res) => {
    const id = v.id(req.params.id);
    const l = lerLancamento(req.body || {});
    const salvo = await banco.transacao(async (t) => {
      const antes = await t.primeira(SQL_LANCAMENTO + " WHERE id = ? FOR UPDATE", [id]);
      if (!antes) return null;
      await t.consulta(
        "UPDATE lancamentos SET data = ?, descricao = ?, categoria = ?, tipo = ?, valor = ? WHERE id = ?",
        [l.data, l.descricao, l.categoria, l.tipo, l.valor, id]
      );
      await auditar(t, req, "editar", "lancamento", id, { antes: paraLancamento(antes), depois: l });
      return t.primeira(SQL_LANCAMENTO + " WHERE id = ?", [id]);
    });
    if (!salvo) return naoEncontrado(res, "Lançamento");
    res.json({ lancamento: paraLancamento(salvo) });
  });

  // Se o lançamento veio de uma conta paga, a conta volta a pendente.
  r.delete("/lancamentos/:id", async (req, res) => {
    const id = v.id(req.params.id);
    const resultado = await banco.transacao(async (t) => {
      const antes = await t.primeira(SQL_LANCAMENTO + " WHERE id = ? FOR UPDATE", [id]);
      if (!antes) return null;
      const conta = await t.primeira("SELECT id FROM contas_fixas WHERE lancamento_id = ? FOR UPDATE", [id]);
      if (conta) await t.consulta("UPDATE contas_fixas SET status = 'pendente', lancamento_id = NULL WHERE id = ?", [conta.id]);
      await t.consulta("DELETE FROM lancamentos WHERE id = ?", [id]);
      await auditar(t, req, "apagar", "lancamento", id, { antes: paraLancamento(antes), contaReaberta: conta ? conta.id : null });
      return { contaId: conta ? conta.id : null };
    });
    if (!resultado) return naoEncontrado(res, "Lançamento");
    res.json({ ok: true, contaReabertaId: resultado.contaId });
  });

  // -------------------------------------------------------- contas fixas ----
  r.post("/contas", async (req, res) => {
    const b = req.body || {};
    const c = {
      nome: v.texto(b.nome, "nome", "Nome", { max: 120 }),
      valor: v.numero(b.valor, "valor", "Valor", { minExclusivo: true, max: MAX_VALOR }),
      vencimento: v.data(b.vencimento, "vencimento", "Vencimento")
    };
    const nova = await banco.transacao(async (t) => {
      const x = await t.consulta(
        "INSERT INTO contas_fixas (nome, valor, vencimento, criado_por) VALUES (?, ?, ?, ?)",
        [c.nome, c.valor, c.vencimento, req.usuario.id]
      );
      await auditar(t, req, "criar", "conta_fixa", x.insertId, { depois: c });
      return t.primeira(SQL_CONTA + " WHERE id = ?", [x.insertId]);
    });
    res.status(201).json({ conta: paraConta(nova) });
  });

  r.delete("/contas/:id", async (req, res) => {
    const id = v.id(req.params.id);
    const ok = await banco.transacao(async (t) => {
      const antes = await t.primeira(SQL_CONTA + " WHERE id = ? FOR UPDATE", [id]);
      if (!antes) return false;
      await t.consulta("DELETE FROM contas_fixas WHERE id = ?", [id]);
      if (antes.lancamento_id) await t.consulta("DELETE FROM lancamentos WHERE id = ?", [antes.lancamento_id]);
      await auditar(t, req, "apagar", "conta_fixa", id, { antes: paraConta(antes) });
      return true;
    });
    if (!ok) return naoEncontrado(res, "Conta");
    res.json({ ok: true });
  });

  // Pagar: cria o lançamento de saída e marca a conta como paga, juntos.
  r.post("/contas/:id/pagar", async (req, res) => {
    const id = v.id(req.params.id);
    const dataPagamento = v.data(req.body?.data, "data", "Data do pagamento");
    const resultado = await banco.transacao(async (t) => {
      const conta = await t.primeira(SQL_CONTA + " WHERE id = ? FOR UPDATE", [id]);
      if (!conta) return null;
      if (conta.status === "pago") return "ja_paga";
      const x = await t.consulta(
        "INSERT INTO lancamentos (data, descricao, categoria, tipo, valor, criado_por) VALUES (?, ?, 'Outros', 'saida', ?, ?)",
        [dataPagamento, `${conta.nome} — conta fixa`.slice(0, 200), conta.valor, req.usuario.id]
      );
      await t.consulta("UPDATE contas_fixas SET status = 'pago', lancamento_id = ? WHERE id = ?", [x.insertId, id]);
      await auditar(t, req, "pagar", "conta_fixa", id, { lancamentoId: x.insertId, valor: Number(conta.valor) });
      return {
        conta: await t.primeira(SQL_CONTA + " WHERE id = ?", [id]),
        lancamento: await t.primeira(SQL_LANCAMENTO + " WHERE id = ?", [x.insertId])
      };
    });
    if (!resultado) return naoEncontrado(res, "Conta");
    if (resultado === "ja_paga") return res.status(409).json({ erro: "estado", mensagem: "Esta conta já está paga." });
    res.json({ conta: paraConta(resultado.conta), lancamento: paraLancamento(resultado.lancamento) });
  });

  r.post("/contas/:id/desfazer", async (req, res) => {
    const id = v.id(req.params.id);
    const resultado = await banco.transacao(async (t) => {
      const conta = await t.primeira(SQL_CONTA + " WHERE id = ? FOR UPDATE", [id]);
      if (!conta) return null;
      if (conta.status !== "pago") return "nao_paga";
      await t.consulta("UPDATE contas_fixas SET status = 'pendente', lancamento_id = NULL WHERE id = ?", [id]);
      if (conta.lancamento_id) await t.consulta("DELETE FROM lancamentos WHERE id = ?", [conta.lancamento_id]);
      await auditar(t, req, "desfazer_pagamento", "conta_fixa", id, { lancamentoApagado: conta.lancamento_id });
      return t.primeira(SQL_CONTA + " WHERE id = ?", [id]);
    });
    if (!resultado) return naoEncontrado(res, "Conta");
    if (resultado === "nao_paga") return res.status(409).json({ erro: "estado", mensagem: "Esta conta não está paga." });
    res.json({ conta: paraConta(resultado) });
  });

  // ---------------------------------------------------------- orçamentos ----
  // O servidor recalcula custo e valor sugerido com os preços do banco:
  // não confia nos números enviados pelo navegador.
  r.post("/orcamentos", async (req, res) => {
    const b = req.body || {};
    const nomeServico = v.texto(b.nomeServico, "nomeServico", "Serviço", { max: 160 });
    const cliente = v.texto(b.cliente, "cliente", "Cliente", { max: 120 });
    const margem = v.numero(b.margem, "margem", "Margem", { min: 0, max: 95 });
    if (!Array.isArray(b.itens) || b.itens.length < 1 || b.itens.length > 100) {
      throw new v.ErroValidacao("itens", "Adicione de 1 a 100 materiais ao orçamento.");
    }
    const itens = b.itens.map((i) => ({
      materialId: v.id(i?.materialId),
      quantidade: v.numero(i?.quantidade, "quantidade", "Quantidade", { minExclusivo: true, max: MAX_MATERIAL })
    }));

    const novo = await banco.transacao(async (t) => {
      let custo = 0;
      for (const i of itens) {
        const m = await t.primeira("SELECT preco_unitario FROM materiais WHERE id = ?", [i.materialId]);
        if (!m) throw new v.ErroValidacao("itens", "Um dos materiais do orçamento não existe mais.");
        custo += Number(m.preco_unitario) * i.quantidade;
      }
      custo = Math.round(custo * 100) / 100;
      const valor = Math.round((custo / (1 - margem / 100)) * 100) / 100;
      const x = await t.consulta(
        `INSERT INTO orcamentos (nome_servico, cliente, data, margem, custo_materiais, valor_sugerido, criado_por)
         VALUES (?, ?, CURDATE(), ?, ?, ?, ?)`,
        [nomeServico, cliente, margem, custo, valor, req.usuario.id]
      );
      for (const i of itens) {
        await t.consulta("INSERT INTO orcamento_itens (orcamento_id, material_id, quantidade) VALUES (?, ?, ?)", [x.insertId, i.materialId, i.quantidade]);
      }
      await auditar(t, req, "criar", "orcamento", x.insertId, { nomeServico, cliente, margem, itens, valor });
      const o = await t.primeira(SQL_ORCAMENTO + " WHERE id = ?", [x.insertId]);
      const its = await t.consulta("SELECT material_id, quantidade FROM orcamento_itens WHERE orcamento_id = ? ORDER BY id", [x.insertId]);
      return paraOrcamento(o, its);
    });
    res.status(201).json({ orcamento: novo });
  });

  r.delete("/orcamentos/:id", async (req, res) => {
    const id = v.id(req.params.id);
    const ok = await banco.transacao(async (t) => {
      const antes = await t.primeira(SQL_ORCAMENTO + " WHERE id = ? FOR UPDATE", [id]);
      if (!antes) return false;
      await t.consulta("DELETE FROM orcamentos WHERE id = ?", [id]);
      await auditar(t, req, "apagar", "orcamento", id, { antes: { nomeServico: antes.nome_servico, cliente: antes.cliente, valor: Number(antes.valor_sugerido) } });
      return true;
    });
    if (!ok) return naoEncontrado(res, "Orçamento");
    res.json({ ok: true });
  });

  // Erros de validação viram resposta 400 com a mensagem do campo.
  // eslint-disable-next-line no-unused-vars
  r.use((erro, req, res, next) => {
    if (erro instanceof v.ErroValidacao) return res.status(400).json({ erro: "validacao", campo: erro.campo, mensagem: erro.message });
    next(erro);
  });

  return r;
}
