-- =============================================================================
-- MazFlow · 01 · Usuários (login do sistema)
-- =============================================================================
USE mazflow;

CREATE TABLE usuarios (
  id            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  usuario       VARCHAR(60)   NOT NULL,
  senha_hash    CHAR(64)      NOT NULL COMMENT 'SHA-256 só para a demo; no sistema real usar bcrypt/argon2',
  papel         ENUM('administrador','funcionario') NOT NULL DEFAULT 'funcionario',
  criado_em     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_usuarios_usuario (usuario)
) ENGINE=InnoDB;

INSERT INTO usuarios (usuario, senha_hash, papel) VALUES
  ('mazart', SHA2('demo1234', 256), 'administrador');
