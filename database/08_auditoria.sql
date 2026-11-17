-- =============================================================================
-- MazFlow · 08 · Auditoria
--
-- Toda alteração feita pelo sistema (criar, editar, apagar, pagar conta,
-- aprovar usuário, liberar IP) fica registrada aqui: quem fez, de qual IP,
-- quando e o que mudou. Serve para investigar um uso indevido ou um ataque.
-- O servidor só INSERE nesta tabela; nunca altera nem apaga.
-- =============================================================================
USE mazflow;

CREATE TABLE IF NOT EXISTS auditoria (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id  INT UNSIGNED    NULL,
  ip          VARCHAR(45)     NOT NULL,
  acao        VARCHAR(40)     NOT NULL COMMENT 'criar, editar, apagar, pagar, desfazer_pagamento, aprovar...',
  entidade    VARCHAR(30)     NOT NULL COMMENT 'material, lancamento, conta_fixa, orcamento, usuario, bloqueio_ip',
  entidade_id VARCHAR(45)     NULL,
  detalhes    JSON            NULL     COMMENT 'valores antes/depois',
  criado_em   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_auditoria_data     (criado_em),
  KEY ix_auditoria_usuario  (usuario_id, criado_em),
  KEY ix_auditoria_entidade (entidade, entidade_id),
  CONSTRAINT fk_auditoria_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB;
