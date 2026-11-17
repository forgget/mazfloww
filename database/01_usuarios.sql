-- =============================================================================
-- MazFlow · 01 · Usuários (login do sistema)
--
-- Ninguém escolhe o próprio papel: o cadastro entra como 'pendente' e o dono
-- (administrador) aprova, definindo se a pessoa é administrador ou funcionário.
-- O e-mail configurado em DONO_EMAIL no servidor vira administrador sozinho
-- no primeiro cadastro.
--
-- Senhas: o servidor grava só o hash scrypt (formato scrypt$N$r$p$sal$hash).
-- Nunca grave senha em texto puro aqui.
-- =============================================================================
USE mazflow;

CREATE TABLE IF NOT EXISTS usuarios (
  id               INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  nome             VARCHAR(120)  NOT NULL,
  email            VARCHAR(190)  NOT NULL COMMENT 'sempre minúsculo; é o login',
  senha_hash       VARCHAR(255)  NULL     COMMENT 'scrypt; NULL para quem só entra com Google',
  google_sub       VARCHAR(64)   NULL     COMMENT 'id da conta Google vinculada',
  papel            ENUM('administrador','funcionario') NOT NULL DEFAULT 'funcionario',
  status           ENUM('pendente','ativo','recusado','desativado') NOT NULL DEFAULT 'pendente',
  aprovado_por     INT UNSIGNED  NULL,
  aprovado_em      DATETIME      NULL,
  ultimo_login_em  DATETIME      NULL,
  criado_em        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_usuarios_email  (email),
  UNIQUE KEY uq_usuarios_google (google_sub),
  KEY ix_usuarios_status (status),
  CONSTRAINT fk_usuarios_aprovador FOREIGN KEY (aprovado_por) REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB;
