// Lê um arquivo .sql do jeito que o MySQL Workbench/CLI entende (com DELIMITER)
// e devolve a lista de comandos, sem as linhas USE (o banco vem da configuração).
import fs from "node:fs";

export function lerComandosSql(arquivo) {
  const linhas = fs.readFileSync(arquivo, "utf8").split(/\r?\n/);
  const comandos = [];
  let delimitador = ";";
  let atual = [];

  for (const linha of linhas) {
    const limpa = linha.trim();
    const mudanca = /^DELIMITER\s+(\S+)\s*$/i.exec(limpa);
    if (mudanca) { delimitador = mudanca[1]; continue; }
    if (!atual.length && (limpa === "" || limpa.startsWith("--"))) continue;
    if (!atual.length && /^USE\s+\S+;$/i.test(limpa)) continue;
    atual.push(linha);
    if (limpa.endsWith(delimitador)) {
      let comando = atual.join("\n").trimEnd();
      comando = comando.slice(0, comando.length - delimitador.length).trim();
      if (comando) comandos.push(comando);
      atual = [];
    }
  }
  if (atual.join("").trim()) comandos.push(atual.join("\n").trim());
  return comandos;
}
