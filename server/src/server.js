// Inicia o servidor do MazFlow.
import { carregarConfig } from "./config.js";
import { criarBanco } from "./db.js";
import { criarApp } from "./app.js";

const config = carregarConfig();
const banco = criarBanco(config);

try {
  await banco.consulta("SELECT 1 FROM usuarios LIMIT 1");
} catch (e) {
  console.error("Não consegui usar o banco de dados:", e.message);
  console.error("Confira as variáveis DB_* / DATABASE_URL e rode: npm run db:migrar");
  process.exit(1);
}

const app = criarApp({ config, banco });

// Limpa histórico antigo (tentativas, sessões e links vencidos) uma vez por dia.
const limpar = () => banco.procedure("sp_limpar_registros").catch((e) => console.error("Limpeza falhou:", e.message));
limpar();
setInterval(limpar, 24 * 60 * 60 * 1000).unref();

app.listen(config.porta, () => {
  console.log(`MazFlow rodando em ${config.appUrl} (porta ${config.porta})`);
  if (!config.donoEmail) console.log("Aviso: DONO_EMAIL vazio — ninguém vira administrador automaticamente.");
  if (!config.smtp.host) console.log("Aviso: SMTP não configurado — os e-mails aparecem só aqui no log.");
});
