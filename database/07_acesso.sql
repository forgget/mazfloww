-- =============================================================================
-- MazFlow · 07 · Acesso: sessões, recuperação de senha e bloqueio de IP
--
-- Regra de bloqueio (aplicada por sp_registrar_tentativa):
--   1. 5 falhas do mesmo IP em 15 min  -> bloqueio temporário
--   2. a duração escala com os bloqueios do IP nos últimos 7 dias:
--        1º = 15 min · 2º = 1 h · 3º = 24 h
--   3. se o IP já teve 3 bloqueios temporários em 7 dias, o próximo é PERMANENTE
--   4. 10 falhas no mesmo e-mail em 1 h travam o login desse e-mail por 15 min
--      (protege contra ataque vindo de muitos IPs, sem banir ninguém)
--
-- Contam como falha só os motivos suspeitos: senha errada, e-mail inexistente,
-- e token de redefinição inválido. Conta pendente
-- com senha certa NÃO conta.
--
-- Um login certo zera a contagem de falhas do IP (todos da gráfica costumam sair
-- pelo mesmo IP). Bloqueios liberados pelo dono não contam para a escala.
--
-- Todos os horários usam NOW() do MySQL — o servidor Node nunca calcula datas.
-- =============================================================================
USE mazflow;

-- -----------------------------------------------------------------------------
-- Sessões: o cookie leva um token aleatório; aqui fica só o SHA-256 dele.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessoes (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id    INT UNSIGNED    NOT NULL,
  token_hash    CHAR(64)        NOT NULL,
  ip            VARCHAR(45)     NOT NULL,
  user_agent    VARCHAR(255)    NULL,
  criado_em     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expira_em     DATETIME        NOT NULL,
  encerrada_em  DATETIME        NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sessoes_token (token_hash),
  KEY ix_sessoes_usuario (usuario_id),
  CONSTRAINT fk_sessoes_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- Recuperação de senha: link de uso único, válido por 30 minutos.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS redefinicoes_senha (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id  INT UNSIGNED    NOT NULL,
  token_hash  CHAR(64)        NOT NULL,
  ip          VARCHAR(45)     NOT NULL,
  criado_em   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expira_em   DATETIME        NOT NULL,
  usado_em    DATETIME        NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_redef_token (token_hash),
  KEY ix_redef_usuario (usuario_id),
  CONSTRAINT fk_redef_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- Tentativas: todo login, cadastro, recuperação e redefinição fica registrado.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tentativas_login (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ip         VARCHAR(45)     NOT NULL,
  email      VARCHAR(190)    NULL,
  sucesso    TINYINT(1)      NOT NULL,
  motivo     VARCHAR(40)     NOT NULL,
  criado_em  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_tentativas_ip    (ip, criado_em),
  KEY ix_tentativas_email (email, criado_em)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- Bloqueios de IP: temporários (com fim) ou permanentes (fim NULL).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bloqueios_ip (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ip            VARCHAR(45)     NOT NULL,
  permanente    TINYINT(1)      NOT NULL DEFAULT 0,
  inicio        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fim           DATETIME        NULL COMMENT 'NULL quando permanente',
  motivo        VARCHAR(160)    NOT NULL,
  liberado_em   DATETIME        NULL,
  liberado_por  INT UNSIGNED    NULL,
  PRIMARY KEY (id),
  KEY ix_bloqueios_ip (ip, inicio),
  CONSTRAINT fk_bloqueios_liberador FOREIGN KEY (liberado_por) REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB;

DELIMITER $$

-- -----------------------------------------------------------------------------
-- A partir de quando as falhas de um IP contam: as dos últimos 15 min, depois
-- do fim (ou liberação) do último bloqueio e depois do último login certo.
-- O login certo é comparado pelo id (ordem exata de gravação), porque o
-- DATETIME só tem precisão de segundos.
-- -----------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_inicio_contagem $$
CREATE PROCEDURE sp_inicio_contagem(IN p_ip VARCHAR(45), OUT p_desde DATETIME, OUT p_depois_do_id BIGINT UNSIGNED)
  READS SQL DATA
BEGIN
  DECLARE v_fim_bloqueio DATETIME DEFAULT NULL;

  SELECT MAX(CASE
               WHEN liberado_em IS NOT NULL AND (fim IS NULL OR liberado_em < fim) THEN liberado_em
               ELSE fim
             END)
    INTO v_fim_bloqueio
    FROM bloqueios_ip
   WHERE ip = p_ip;

  SELECT COALESCE(MAX(id), 0) INTO p_depois_do_id
    FROM tentativas_login
   WHERE ip = p_ip AND sucesso = 1 AND motivo = 'login';

  SET p_desde = GREATEST(
    NOW() - INTERVAL 15 MINUTE,
    COALESCE(v_fim_bloqueio, CAST('1000-01-01 00:00:00' AS DATETIME))
  );
END $$

-- -----------------------------------------------------------------------------
-- sp_verificar_acesso: chamado ANTES de checar a senha.
-- Devolve 1 linha: permanente (0/1), bloqueado_ate (DATETIME ou NULL),
--                  email_travado (0/1)
-- -----------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_verificar_acesso $$
CREATE PROCEDURE sp_verificar_acesso(IN p_ip VARCHAR(45), IN p_email VARCHAR(190))
  READS SQL DATA
BEGIN
  DECLARE v_permanente   INT      DEFAULT 0;
  DECLARE v_ate          DATETIME DEFAULT NULL;
  DECLARE v_falhas_email INT      DEFAULT 0;
  DECLARE v_ultima_falha DATETIME DEFAULT NULL;

  SELECT COUNT(*) INTO v_permanente
    FROM bloqueios_ip
   WHERE ip = p_ip AND permanente = 1 AND liberado_em IS NULL;

  IF v_permanente = 0 THEN
    SELECT MAX(fim) INTO v_ate
      FROM bloqueios_ip
     WHERE ip = p_ip AND permanente = 0 AND liberado_em IS NULL AND fim > NOW();
  END IF;

  IF p_email IS NOT NULL AND p_email <> '' THEN
    SELECT COUNT(*), MAX(criado_em) INTO v_falhas_email, v_ultima_falha
      FROM tentativas_login
     WHERE email = p_email
       AND sucesso = 0
       AND motivo IN ('senha_incorreta', 'email_inexistente')
       AND criado_em > NOW() - INTERVAL 1 HOUR;
  END IF;

  SELECT (v_permanente > 0)                                   AS permanente,
         v_ate                                                AS bloqueado_ate,
         TIMESTAMPDIFF(SECOND, NOW(), v_ate)                  AS segundos_restantes,
         (v_falhas_email >= 10
          AND v_ultima_falha > NOW() - INTERVAL 15 MINUTE)    AS email_travado;
END $$

-- -----------------------------------------------------------------------------
-- sp_registrar_tentativa: grava a tentativa e, se for falha suspeita, aplica
-- a regra de bloqueio. Devolve 1 linha:
--   resultado ('ok' | 'temporario' | 'permanente'), bloqueado_ate, falhas_restantes
-- -----------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_registrar_tentativa $$
CREATE PROCEDURE sp_registrar_tentativa(
  IN p_ip      VARCHAR(45),
  IN p_email   VARCHAR(190),
  IN p_sucesso TINYINT,
  IN p_motivo  VARCHAR(40)
)
  MODIFIES SQL DATA
BEGIN
  DECLARE v_desde      DATETIME;
  DECLARE v_depois_id  BIGINT UNSIGNED DEFAULT 0;
  DECLARE v_falhas     INT          DEFAULT 0;
  DECLARE v_bloqueios  INT          DEFAULT 0;
  DECLARE v_minutos    INT          DEFAULT 0;
  DECLARE v_ate        DATETIME     DEFAULT NULL;
  DECLARE v_resultado  VARCHAR(12)  DEFAULT 'ok';

  INSERT INTO tentativas_login (ip, email, sucesso, motivo)
  VALUES (p_ip, NULLIF(p_email, ''), p_sucesso, p_motivo);

  IF p_sucesso = 0 AND p_motivo IN ('senha_incorreta', 'email_inexistente', 'token_invalido') THEN
    CALL sp_inicio_contagem(p_ip, v_desde, v_depois_id);

    SELECT COUNT(*) INTO v_falhas
      FROM tentativas_login
     WHERE ip = p_ip
       AND sucesso = 0
       AND motivo IN ('senha_incorreta', 'email_inexistente', 'token_invalido')
       AND criado_em >= v_desde
       AND id > v_depois_id;

    IF v_falhas >= 5 THEN
      SELECT COUNT(*) INTO v_bloqueios
        FROM bloqueios_ip
       WHERE ip = p_ip
         AND permanente = 0
         AND liberado_em IS NULL
         AND inicio > NOW() - INTERVAL 7 DAY;

      IF v_bloqueios >= 3 THEN
        INSERT INTO bloqueios_ip (ip, permanente, fim, motivo)
        VALUES (p_ip, 1, NULL, 'Reincidência: 4º bloqueio em 7 dias');
        SET v_resultado = 'permanente';
      ELSE
        SET v_minutos = CASE v_bloqueios WHEN 0 THEN 15 WHEN 1 THEN 60 ELSE 1440 END;
        SET v_ate = NOW() + INTERVAL v_minutos MINUTE;
        INSERT INTO bloqueios_ip (ip, permanente, fim, motivo)
        VALUES (p_ip, 0, v_ate, CONCAT('5 tentativas erradas em 15 min — bloqueio de ', v_minutos, ' min'));
        SET v_resultado = 'temporario';
      END IF;
    END IF;
  END IF;

  SELECT v_resultado AS resultado,
         v_ate       AS bloqueado_ate,
         TIMESTAMPDIFF(SECOND, NOW(), v_ate) AS segundos_restantes,
         GREATEST(0, 5 - v_falhas) AS falhas_restantes;
END $$

-- -----------------------------------------------------------------------------
-- sp_liberar_ip: o dono libera um IP (temporário ou permanente).
-- -----------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_liberar_ip $$
CREATE PROCEDURE sp_liberar_ip(IN p_ip VARCHAR(45), IN p_usuario_id INT UNSIGNED)
  MODIFIES SQL DATA
BEGIN
  UPDATE bloqueios_ip
     SET liberado_em = NOW(), liberado_por = p_usuario_id
   WHERE ip = p_ip
     AND liberado_em IS NULL
     AND (permanente = 1 OR fim > NOW());
  SELECT ROW_COUNT() AS liberados;
END $$

-- -----------------------------------------------------------------------------
-- sp_limpar_registros: apaga histórico antigo (o servidor chama 1x por dia).
-- -----------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_limpar_registros $$
CREATE PROCEDURE sp_limpar_registros()
  MODIFIES SQL DATA
BEGIN
  DELETE FROM tentativas_login   WHERE criado_em < NOW() - INTERVAL 30 DAY;
  DELETE FROM sessoes            WHERE expira_em < NOW() - INTERVAL 30 DAY;
  DELETE FROM redefinicoes_senha WHERE expira_em < NOW() - INTERVAL 30 DAY;
END $$

DELIMITER ;
