// Validação de entrada. Tudo que chega do navegador passa por aqui antes de
// tocar no banco; se algo estiver fora do esperado, a requisição é recusada.

export class ErroValidacao extends Error {
  constructor(campo, mensagem) {
    super(mensagem);
    this.campo = campo;
  }
}

export function texto(valor, campo, rotulo, { min = 1, max = 200 } = {}) {
  const v = typeof valor === "string" ? valor.trim().replace(/\s+/g, " ") : "";
  if (v.length < min || v.length > max) {
    throw new ErroValidacao(campo, `${rotulo}: informe de ${min} a ${max} caracteres.`);
  }
  return v;
}

export function numero(valor, campo, rotulo, { min = 0, max = 99999999.99, minExclusivo = false } = {}) {
  const n = typeof valor === "number" ? valor : typeof valor === "string" && valor.trim() !== "" ? Number(valor) : NaN;
  if (!Number.isFinite(n) || n > max || (minExclusivo ? n <= min : n < min)) {
    throw new ErroValidacao(campo, `${rotulo}: valor inválido.`);
  }
  return Math.round(n * 100) / 100;
}

export function data(valor, campo, rotulo) {
  const m = typeof valor === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor) : null;
  if (m) {
    const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const d = new Date(Date.UTC(ano, mes - 1, dia));
    if (ano >= 2000 && ano <= 2100 && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia) return valor;
  }
  throw new ErroValidacao(campo, `${rotulo}: data inválida.`);
}

export function opcao(valor, campo, rotulo, opcoes) {
  if (!opcoes.includes(valor)) throw new ErroValidacao(campo, `${rotulo}: opção inválida.`);
  return valor;
}

export function id(valor) {
  const n = Number(valor);
  if (!Number.isInteger(n) || n <= 0 || n > 4294967295) throw new ErroValidacao("id", "Registro inválido.");
  return n;
}
