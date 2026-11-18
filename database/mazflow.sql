-- =============================================================================
-- MazFlow — controle financeiro da Gráfica Mazart
-- Arquivo único: estrutura + dados de exemplo (os mesmos do protótipo).
--
-- GERADO AUTOMATICAMENTE por server/scripts/juntar-sql.js a partir de
-- 00_banco.sql, 01_usuarios.sql, 02_materiais.sql, 03_lancamentos.sql, 04_contas_fixas.sql, 05_orcamentos.sql, 06_fluxo_caixa.sql, 07_acesso.sql, 08_auditoria.sql.
-- Não edite à mão: altere os arquivos numerados e rode "npm run db:juntar".
--
-- Como usar no MySQL Workbench: abra este arquivo e execute tudo
-- (Ctrl+Shift+Enter). O script RECRIA o banco `mazflow` do zero — nunca rode
-- no banco de produção (lá use "npm run db:migrar", que não apaga nada).
-- =============================================================================

DROP DATABASE IF EXISTS mazflow;
CREATE DATABASE mazflow CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE mazflow;

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

CREATE TABLE IF NOT EXISTS usuarios (
  id               INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  nome             VARCHAR(120)  NOT NULL,
  email            VARCHAR(190)  NOT NULL COMMENT 'sempre minúsculo; é o login',
  senha_hash       VARCHAR(255)  NOT NULL COMMENT 'scrypt',
  papel            ENUM('administrador','funcionario') NOT NULL DEFAULT 'funcionario',
  status           ENUM('pendente','ativo','recusado','desativado') NOT NULL DEFAULT 'pendente',
  aprovado_por     INT UNSIGNED  NULL,
  aprovado_em      DATETIME      NULL,
  ultimo_login_em  DATETIME      NULL,
  criado_em        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_usuarios_email  (email),
  KEY ix_usuarios_status (status),
  CONSTRAINT fk_usuarios_aprovador FOREIGN KEY (aprovado_por) REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- =============================================================================
-- MazFlow · 02 · Materiais (estoque)
-- =============================================================================

CREATE TABLE IF NOT EXISTS materiais (
  id                  INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  nome                VARCHAR(120)   NOT NULL,
  unidade             VARCHAR(20)    NOT NULL,
  preco_unitario      DECIMAL(10,2)  NOT NULL DEFAULT 0,
  quantidade_estoque  DECIMAL(10,2)  NOT NULL DEFAULT 0,
  estoque_minimo      DECIMAL(10,2)  NOT NULL DEFAULT 0,
  criado_por          INT UNSIGNED   NULL COMMENT 'quem cadastrou (usuarios.id)',
  criado_em           DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT ck_materiais_preco   CHECK (preco_unitario >= 0),
  CONSTRAINT ck_materiais_estoque CHECK (quantidade_estoque >= 0 AND estoque_minimo >= 0)
) ENGINE=InnoDB;

INSERT INTO materiais (id, nome, unidade, preco_unitario, quantidade_estoque, estoque_minimo) VALUES
  (1,  'Papel sulfite A4 75g',         'resma',    28.90,  24,  10),
  (2,  'Papel sulfite A3 75g',         'resma',    56.00,  6,   4),
  (3,  'Papel couché brilho 170g A3',  'folha',    0.95,   500, 200),
  (4,  'Papel offset 120g A4',         'resma',    42.00,  8,   4),
  (5,  'Papel fotográfico glossy A4',  'folha',    1.40,   120, 50),
  (6,  'Toner preto (laser)',          'un',       189.00, 2,   3),
  (7,  'Toner colorido (kit CMY)',     'kit',      215.00, 4,   3),
  (8,  'Tinta eco-solvente 440ml',     'cartucho', 320.00, 3,   4),
  (9,  'Lona front-light 440g',        'm²',       18.50,  45,  20),
  (10, 'Vinil adesivo branco brilho',  'm²',       22.00,  30,  15),
  (11, 'Laminação BOPP fosco',         'm²',       4.80,   60,  25),
  (12, 'Espiral 17mm preto',           'un',       1.85,   180, 60),
  (13, 'Capa PVC transparente A4',     'un',       0.90,   220, 100),
  (14, 'Ilhós metálico 10mm',          'un',       0.35,   400, 150);

-- Itens abaixo do estoque mínimo
CREATE OR REPLACE VIEW vw_materiais_em_falta AS
SELECT id, nome, unidade, quantidade_estoque, estoque_minimo
FROM materiais
WHERE quantidade_estoque < estoque_minimo;

-- =============================================================================
-- MazFlow · 03 · Lançamentos (entradas e saídas do caixa)
-- =============================================================================

CREATE TABLE IF NOT EXISTS lancamentos (
  id         INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  data       DATE           NOT NULL,
  descricao  VARCHAR(200)   NOT NULL,
  categoria  VARCHAR(60)    NOT NULL,
  tipo       ENUM('entrada','saida') NOT NULL,
  valor      DECIMAL(12,2)  NOT NULL,
  criado_por          INT UNSIGNED   NULL COMMENT 'quem cadastrou (usuarios.id)',
  criado_em           DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_lancamentos_data (data),
  CONSTRAINT ck_lancamentos_valor CHECK (valor > 0)
) ENGINE=InnoDB;

INSERT INTO lancamentos (id, data, descricao, categoria, tipo, valor) VALUES
  (1,  CURDATE(),                     'Banner 3x1m em lona — Padaria Pão Nosso',     'Comunicação visual', 'entrada', 420.00),
  (2,  CURDATE(),                     'Reposição de toner preto',                    'Material',           'saida',   189.00),
  (3,  CURDATE() - INTERVAL 1 DAY,    '1.000 cartões de visita 4x4 — Clínica Vida',  'Impressão',          'entrada', 280.00),
  (4,  CURDATE() - INTERVAL 1 DAY,    'Plotagem de projeto A1 — 12 pranchas',        'Impressão',          'entrada', 168.00),
  (5,  CURDATE() - INTERVAL 2 DAY,    'Adesivo de vitrine 2,5 m² — Ótica Real',      'Comunicação visual', 'entrada', 310.00),
  (6,  CURDATE() - INTERVAL 2 DAY,    'Compra de papel couché A3 — 2 pacotes',       'Material',           'saida',   190.00),
  (7,  CURDATE() - INTERVAL 3 DAY,    'Encadernação espiral — 40 apostilas',         'Acabamento',         'entrada', 360.00),
  (8,  CURDATE() - INTERVAL 4 DAY,    'Troca de lâmina da guilhotina',               'Manutenção',         'saida',   220.00),
  (9,  CURDATE() - INTERVAL 5 DAY,    '500 envelopes timbrados — Escritório Lima',   'Impressão',          'entrada', 245.00),
  (10, CURDATE() - INTERVAL 6 DAY,    'Compra de lona front-light — 20 m²',          'Material',           'saida',   370.00);

-- =============================================================================
-- MazFlow · 04 · Contas fixas (ao pagar, gera um lançamento de saída)
-- Depende de: 03_lancamentos.sql
-- =============================================================================

CREATE TABLE IF NOT EXISTS contas_fixas (
  id             INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  nome           VARCHAR(120)   NOT NULL,
  valor          DECIMAL(12,2)  NOT NULL,
  vencimento     DATE           NOT NULL,
  status         ENUM('pendente','pago') NOT NULL DEFAULT 'pendente',
  lancamento_id  INT UNSIGNED   NULL,
  criado_por          INT UNSIGNED   NULL COMMENT 'quem cadastrou (usuarios.id)',
  criado_em           DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_contas_fixas_vencimento (vencimento),
  CONSTRAINT fk_contas_fixas_lancamento FOREIGN KEY (lancamento_id)
    REFERENCES lancamentos (id) ON DELETE SET NULL,
  CONSTRAINT ck_contas_fixas_valor CHECK (valor > 0)
) ENGINE=InnoDB;

INSERT INTO contas_fixas (id, nome, valor, vencimento, status, lancamento_id) VALUES
  (1, 'Aluguel da gráfica',       3200.00, CURDATE() + INTERVAL 3 DAY,  'pendente', NULL),
  (2, 'Energia elétrica',         680.00,  CURDATE() + INTERVAL 1 DAY,  'pendente', NULL),
  (3, 'Internet fibra 500MB',     189.90,  CURDATE() + INTERVAL 8 DAY,  'pendente', NULL),
  (4, 'Água',                     95.00,   CURDATE() + INTERVAL 12 DAY, 'pendente', NULL),
  (5, 'Manutenção da plotter',    350.00,  CURDATE() - INTERVAL 2 DAY,  'pendente', NULL),
  (6, 'Contador',                 520.00,  CURDATE() - INTERVAL 6 DAY,  'pago',     NULL),
  (7, 'Licença CorelDRAW + RIP',  189.00,  CURDATE() - INTERVAL 9 DAY,  'pago',     NULL);

-- Contas pendentes e a situação de cada uma
CREATE OR REPLACE VIEW vw_contas_a_vencer AS
SELECT id, nome, valor, vencimento, DATEDIFF(vencimento, CURDATE()) AS dias_restantes,
       CASE WHEN vencimento < CURDATE() THEN 'vencida'
            WHEN vencimento <= CURDATE() + INTERVAL 3 DAY THEN 'vence em breve'
            ELSE 'em dia' END AS situacao
FROM contas_fixas
WHERE status = 'pendente';

-- =============================================================================
-- MazFlow · 05 · Orçamentos e seus itens (materiais usados)
-- Depende de: 02_materiais.sql
-- =============================================================================

CREATE TABLE IF NOT EXISTS orcamentos (
  id               INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  nome_servico     VARCHAR(160)   NOT NULL,
  cliente          VARCHAR(120)   NOT NULL,
  data             DATE           NOT NULL,
  margem           DECIMAL(5,2)   NOT NULL COMMENT 'percentual sobre o preço de venda',
  custo_materiais  DECIMAL(12,2)  NOT NULL DEFAULT 0,
  valor_sugerido   DECIMAL(12,2)  NOT NULL DEFAULT 0,
  criado_por          INT UNSIGNED   NULL COMMENT 'quem cadastrou (usuarios.id)',
  criado_em           DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT ck_orcamentos_margem CHECK (margem >= 0 AND margem <= 100)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS orcamento_itens (
  id           INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  orcamento_id INT UNSIGNED   NOT NULL,
  material_id  INT UNSIGNED   NOT NULL,
  quantidade   DECIMAL(10,2)  NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_itens_orcamento FOREIGN KEY (orcamento_id)
    REFERENCES orcamentos (id) ON DELETE CASCADE,
  CONSTRAINT fk_itens_material FOREIGN KEY (material_id)
    REFERENCES materiais (id),
  CONSTRAINT ck_itens_quantidade CHECK (quantidade > 0)
) ENGINE=InnoDB;

INSERT INTO orcamentos (id, nome_servico, cliente, data, margem) VALUES
  (1, 'Catálogo institucional 20 páginas', 'Móveis Aurora', CURDATE() - INTERVAL 2 DAY, 45);

INSERT INTO orcamento_itens (orcamento_id, material_id, quantidade) VALUES
  (1, 3,  220),
  (1, 11, 12),
  (1, 12, 20),
  (1, 13, 20);

-- Custo e valor sugerido calculados como no protótipo:
-- custo = soma(preço × quantidade); sugerido = custo / (1 − margem/100)
UPDATE orcamentos o
JOIN (
  SELECT i.orcamento_id, SUM(m.preco_unitario * i.quantidade) AS custo
  FROM orcamento_itens i
  JOIN materiais m ON m.id = i.material_id
  GROUP BY i.orcamento_id
) c ON c.orcamento_id = o.id
SET o.custo_materiais = c.custo,
    o.valor_sugerido  = IF(o.margem >= 100, c.custo, c.custo / (1 - o.margem / 100));

-- =============================================================================
-- MazFlow · 06 · Fluxo de caixa (gráfico "Últimos 6 meses")
-- Os meses anteriores ficam consolidados em `fluxo_historico`;
-- o mês atual é calculado a partir de `lancamentos`.
-- Depende de: 03_lancamentos.sql
-- =============================================================================

CREATE TABLE IF NOT EXISTS fluxo_historico (
  mes       DATE           NOT NULL COMMENT 'primeiro dia do mês',
  entradas  DECIMAL(12,2)  NOT NULL DEFAULT 0,
  saidas    DECIMAL(12,2)  NOT NULL DEFAULT 0,
  PRIMARY KEY (mes)
) ENGINE=InnoDB;

-- Do mais antigo (5 meses atrás) ao mês passado, na mesma ordem do protótipo
INSERT INTO fluxo_historico (mes, entradas, saidas) VALUES
  (DATE_FORMAT(CURDATE() - INTERVAL 5 MONTH, '%Y-%m-01'), 14200, 9800),
  (DATE_FORMAT(CURDATE() - INTERVAL 4 MONTH, '%Y-%m-01'), 16400, 10300),
  (DATE_FORMAT(CURDATE() - INTERVAL 3 MONTH, '%Y-%m-01'), 12900, 9100),
  (DATE_FORMAT(CURDATE() - INTERVAL 2 MONTH, '%Y-%m-01'), 18600, 11400),
  (DATE_FORMAT(CURDATE() - INTERVAL 1 MONTH, '%Y-%m-01'), 15800, 10900);

-- Os 6 meses do gráfico, com saldo
CREATE OR REPLACE VIEW vw_fluxo_mensal AS
SELECT mes, entradas, saidas, entradas - saidas AS saldo FROM fluxo_historico
UNION ALL
SELECT DATE_FORMAT(CURDATE(), '%Y-%m-01'),
       COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN valor END), 0),
       COALESCE(SUM(CASE WHEN tipo = 'saida'   THEN valor END), 0),
       COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN valor ELSE -valor END), 0)
FROM lancamentos
WHERE data >= DATE_FORMAT(CURDATE(), '%Y-%m-01');

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

-- =============================================================================
-- MazFlow · 08 · Auditoria
--
-- Toda alteração feita pelo sistema (criar, editar, apagar, pagar conta,
-- aprovar usuário, liberar IP) fica registrada aqui: quem fez, de qual IP,
-- quando e o que mudou. Serve para investigar um uso indevido ou um ataque.
-- O servidor só INSERE nesta tabela; nunca altera nem apaga.
-- =============================================================================

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
