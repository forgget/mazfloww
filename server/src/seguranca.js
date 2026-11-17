// Senhas (scrypt) e tokens aleatórios. Só usa o módulo crypto do Node.
import crypto from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(crypto.scrypt);

// Custo do scrypt: N=2^15 (~32 MB de memória por cálculo), r=8, p=1.
const N = 32768;
const R = 8;
const P = 1;
const TAMANHO = 64;
const MAXMEM = 64 * 1024 * 1024;

export const SENHA_MINIMA = 8;
export const SENHA_MAXIMA = 200;

export async function gerarHashSenha(senha) {
  const sal = crypto.randomBytes(16);
  const hash = await scrypt(senha.normalize("NFKC"), sal, TAMANHO, { N, r: R, p: P, maxmem: MAXMEM });
  return ["scrypt", N, R, P, sal.toString("base64"), hash.toString("base64")].join("$");
}

export async function conferirSenha(senha, guardado) {
  if (typeof guardado !== "string") return false;
  const partes = guardado.split("$");
  if (partes.length !== 6 || partes[0] !== "scrypt") return false;
  const [, n, r, p, salB64, hashB64] = partes;
  const esperado = Buffer.from(hashB64, "base64");
  const calculado = await scrypt(senha.normalize("NFKC"), Buffer.from(salB64, "base64"), esperado.length, {
    N: Number(n), r: Number(r), p: Number(p), maxmem: MAXMEM
  });
  return calculado.length === esperado.length && crypto.timingSafeEqual(calculado, esperado);
}

// Hash "de mentira" para gastar o mesmo tempo quando o e-mail não existe
// (assim ninguém descobre quais e-mails têm conta medindo o tempo da resposta).
let hashFalso = null;
export async function gastarTempoDeSenha(senha) {
  if (!hashFalso) hashFalso = await gerarHashSenha("senha-inexistente-" + crypto.randomUUID());
  await conferirSenha(senha, hashFalso);
}

export function gerarToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}
