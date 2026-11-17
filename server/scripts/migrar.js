// npm run db:migrar
// Cria (se não existirem) o banco, as tabelas, as views e as procedures.
// Pode rodar quantas vezes quiser: não apaga dados e NÃO insere os dados de
// exemplo dos arquivos .sql (os INSERT/UPDATE de fora das procedures são
// ignorados — o banco de produção começa vazio).
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { carregarConfig } from "../src/config.js";
import { lerComandosSql } from "./sql.js";

const PASTA_SQL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "database");
export const ARQUIVOS = [
  "01_usuarios.sql",
  "02_materiais.sql",
  "03_lancamentos.sql",
  "04_contas_fixas.sql",
  "05_orcamentos.sql",
  "06_fluxo_caixa.sql",
  "07_acesso.sql",
  "08_auditoria.sql"
];

const SO_DADOS_DE_EXEMPLO = /^(INSERT|UPDATE)\b/i;

export async function migrar(config, { log = console.log } = {}) {
  const { database, ...semBanco } = config.banco;
  const conexao = await mysql.createConnection({ ...semBanco, multipleStatements: false });
  try {
    await conexao.query(`CREATE DATABASE IF NOT EXISTS ${mysql.escapeId(database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
    await conexao.changeUser({ database });
    for (const arquivo of ARQUIVOS) {
      const comandos = lerComandosSql(path.join(PASTA_SQL, arquivo)).filter((c) => !SO_DADOS_DE_EXEMPLO.test(c));
      for (const comando of comandos) await conexao.query(comando);
      log(`✓ ${arquivo} (${comandos.length} comandos)`);
    }
  } finally {
    await conexao.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = carregarConfig();
  migrar(config)
    .then(() => console.log(`Banco "${config.banco.database}" pronto.`))
    .catch((e) => { console.error("Falhou:", e.message); process.exit(1); });
}
