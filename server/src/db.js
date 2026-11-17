// Conexão com o MySQL.
//
// REGRA DE SEGURANÇA: toda consulta passa valores por placeholders `?`
// (pool.execute). Nunca monte SQL juntando texto vindo do usuário — é isso que
// impede SQL injection, não a criptografia.
import mysql from "mysql2/promise";

export function criarBanco(config) {
  const pool = mysql.createPool({
    ...config.banco,
    waitForConnections: true,
    connectionLimit: 10,
    charset: "utf8mb4",
    timezone: "Z",
    dateStrings: true,
    supportBigNumbers: true,
    multipleStatements: false
  });

  async function consulta(sql, params = []) {
    const [linhas] = await pool.execute(sql, params);
    return linhas;
  }

  async function primeira(sql, params = []) {
    const linhas = await consulta(sql, params);
    return linhas[0] || null;
  }

  // CALL de procedure: devolve a primeira linha do primeiro resultado.
  async function procedure(nome, params = []) {
    if (!/^sp_[a-z_]+$/.test(nome)) throw new Error("Nome de procedure inválido");
    const marcadores = params.map(() => "?").join(", ");
    const [resultados] = await pool.execute(`CALL ${nome}(${marcadores})`, params);
    const primeiroConjunto = Array.isArray(resultados[0]) ? resultados[0] : [];
    return primeiroConjunto[0] || null;
  }

  // Executa várias operações como uma só: ou tudo grava, ou nada grava.
  async function transacao(trabalho) {
    const conexao = await pool.getConnection();
    const t = {
      consulta: async (sql, params = []) => (await conexao.execute(sql, params))[0],
      primeira: async (sql, params = []) => (await conexao.execute(sql, params))[0][0] || null
    };
    try {
      await conexao.beginTransaction();
      const resultado = await trabalho(t);
      await conexao.commit();
      return resultado;
    } catch (e) {
      await conexao.rollback().catch(() => {});
      throw e;
    } finally {
      conexao.release();
    }
  }

  return { pool, consulta, primeira, procedure, transacao, fechar: () => pool.end() };
}
