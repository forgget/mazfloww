// npm run db:juntar
// Gera database/mazflow.sql (arquivo único para o MySQL Workbench) juntando
// os arquivos numerados 00..08. Edite os numerados e rode este script.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PASTA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "database");
const numerados = fs.readdirSync(PASTA).filter((f) => /^\d\d_.+\.sql$/.test(f)).sort();

const cabecalho = `-- =============================================================================
-- MazFlow — controle financeiro da Gráfica Mazart
-- Arquivo único: estrutura + dados de exemplo (os mesmos do protótipo).
--
-- GERADO AUTOMATICAMENTE por server/scripts/juntar-sql.js a partir de
-- ${numerados.join(", ")}.
-- Não edite à mão: altere os arquivos numerados e rode "npm run db:juntar".
--
-- Como usar no MySQL Workbench: abra este arquivo e execute tudo
-- (Ctrl+Shift+Enter). O script RECRIA o banco \`mazflow\` do zero — nunca rode
-- no banco de produção (lá use "npm run db:migrar", que não apaga nada).
-- =============================================================================
`;

const partes = numerados.map((arquivo) => {
  let texto = fs.readFileSync(path.join(PASTA, arquivo), "utf8").replace(/\r\n/g, "\n");
  if (arquivo.startsWith("00_")) {
    texto = texto.slice(texto.indexOf("DROP DATABASE")).trim() + "\nUSE mazflow;";
  } else {
    texto = texto.replace(/^USE mazflow;\n/m, "").trim();
  }
  return texto;
});

fs.writeFileSync(path.join(PASTA, "mazflow.sql"), cabecalho + "\n" + partes.join("\n\n") + "\n");
console.log(`database/mazflow.sql gerado (${numerados.length} arquivos).`);
