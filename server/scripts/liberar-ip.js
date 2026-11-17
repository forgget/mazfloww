// npm run liberar-ip -- 200.100.50.25
// Emergência: libera um IP bloqueado (por exemplo, quando o próprio dono ficou
// bloqueado e não consegue entrar para liberar pela tela).
// Sem IP, lista os bloqueios em vigor.
import { carregarConfig } from "../src/config.js";
import { criarBanco } from "../src/db.js";

const ip = process.argv[2];
const banco = criarBanco(carregarConfig());

try {
  if (!ip) {
    const linhas = await banco.consulta(
      `SELECT ip, permanente, inicio, fim, motivo FROM bloqueios_ip
        WHERE liberado_em IS NULL AND (permanente = 1 OR fim > NOW()) ORDER BY inicio DESC`
    );
    if (!linhas.length) console.log("Nenhum IP bloqueado agora.");
    for (const l of linhas) {
      console.log(`${l.ip}  ${Number(l.permanente) ? "PERMANENTE" : "até " + l.fim}  — ${l.motivo}`);
    }
    console.log("\nPara liberar: npm run liberar-ip -- <ip>");
  } else {
    const r = await banco.procedure("sp_liberar_ip", [ip, null]);
    console.log(Number(r?.liberados) ? `IP ${ip} liberado.` : `Nenhum bloqueio ativo para ${ip}.`);
  }
} finally {
  await banco.fechar();
}
