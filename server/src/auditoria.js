// Registro de auditoria: quem fez o quê, de onde e quando (tabela `auditoria`).
// Recebe `exec` (o banco ou uma transação) para gravar junto com a alteração.
export async function auditar(exec, req, acao, entidade, entidadeId, detalhes) {
  await exec.consulta(
    "INSERT INTO auditoria (usuario_id, ip, acao, entidade, entidade_id, detalhes) VALUES (?, ?, ?, ?, ?, ?)",
    [
      req.usuario ? req.usuario.id : null,
      req.ipCliente || "0.0.0.0",
      acao,
      entidade,
      entidadeId == null ? null : String(entidadeId),
      detalhes == null ? null : JSON.stringify(detalhes)
    ]
  );
}
