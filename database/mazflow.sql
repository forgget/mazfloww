-- =============================================================================
-- MazFlow — controle financeiro da Gráfica Mazart
-- Estrutura + dados de exemplo (os mesmos do protótipo em demo/index.html)
--
-- Como usar no MySQL Workbench: abra este arquivo e execute tudo (Ctrl+Shift+Enter).
-- O script recria o banco `mazflow` do zero.
--
-- As datas são relativas ao dia em que o script roda (CURDATE()),
-- igual ao protótipo, que sempre usa "hoje" de quem abre.
-- =============================================================================

DROP DATABASE IF EXISTS mazflow;
CREATE DATABASE mazflow CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE mazflow;

-- -----------------------------------------------------------------------------
-- Usuários (login do sistema)
-- -----------------------------------------------------------------------------
CREATE TABLE usuarios (
  id            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  usuario       VARCHAR(60)   NOT NULL,
  senha_hash    CHAR(64)      NOT NULL COMMENT 'SHA-256 só para a demo; no sistema real usar bcrypt/argon2',
  papel         ENUM('administrador','funcionario') NOT NULL DEFAULT 'funcionario',
  criado_em     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_usuarios_usuario (usuario)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- Materiais (estoque)
-- -----------------------------------------------------------------------------
CREATE TABLE materiais (
  id                  INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  nome                VARCHAR(120)   NOT NULL,
  unidade             VARCHAR(20)    NOT NULL,
  preco_unitario      DECIMAL(10,2)  NOT NULL DEFAULT 0,
  quantidade_estoque  DECIMAL(10,2)  NOT NULL DEFAULT 0,
  estoque_minimo      DECIMAL(10,2)  NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  CONSTRAINT ck_materiais_preco   CHECK (preco_unitario >= 0),
  CONSTRAINT ck_materiais_estoque CHECK (quantidade_estoque >= 0 AND estoque_minimo >= 0)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- Lançamentos (entradas e saídas do caixa)
-- -----------------------------------------------------------------------------
CREATE TABLE lancamentos (
  id         INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  data       DATE           NOT NULL,
  descricao  VARCHAR(200)   NOT NULL,
  categoria  VARCHAR(60)    NOT NULL,
  tipo       ENUM('entrada','saida') NOT NULL,
  valor      DECIMAL(12,2)  NOT NULL,
  PRIMARY KEY (id),
  KEY ix_lancamentos_data (data),
  CONSTRAINT ck_lancamentos_valor CHECK (valor > 0)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- Contas fixas (ao pagar, gera um lançamento de saída)
-- -----------------------------------------------------------------------------
CREATE TABLE contas_fixas (
  id             INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  nome           VARCHAR(120)   NOT NULL,
  valor          DECIMAL(12,2)  NOT NULL,
  vencimento     DATE           NOT NULL,
  status         ENUM('pendente','pago') NOT NULL DEFAULT 'pendente',
  lancamento_id  INT UNSIGNED   NULL,
  PRIMARY KEY (id),
  KEY ix_contas_fixas_vencimento (vencimento),
  CONSTRAINT fk_contas_fixas_lancamento FOREIGN KEY (lancamento_id)
    REFERENCES lancamentos (id) ON DELETE SET NULL,
  CONSTRAINT ck_contas_fixas_valor CHECK (valor > 0)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- Orçamentos e seus itens (materiais usados)
-- -----------------------------------------------------------------------------
CREATE TABLE orcamentos (
  id               INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  nome_servico     VARCHAR(160)   NOT NULL,
  cliente          VARCHAR(120)   NOT NULL,
  data             DATE           NOT NULL,
  margem           DECIMAL(5,2)   NOT NULL COMMENT 'percentual sobre o preço de venda',
  custo_materiais  DECIMAL(12,2)  NOT NULL DEFAULT 0,
  valor_sugerido   DECIMAL(12,2)  NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  CONSTRAINT ck_orcamentos_margem CHECK (margem >= 0 AND margem <= 100)
) ENGINE=InnoDB;

CREATE TABLE orcamento_itens (
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

-- -----------------------------------------------------------------------------
-- Histórico mensal consolidado (alimenta o gráfico "Fluxo de Caixa — 6 meses")
-- O mês atual é calculado a partir de `lancamentos`.
-- -----------------------------------------------------------------------------
CREATE TABLE fluxo_historico (
  mes       DATE           NOT NULL COMMENT 'primeiro dia do mês',
  entradas  DECIMAL(12,2)  NOT NULL DEFAULT 0,
  saidas    DECIMAL(12,2)  NOT NULL DEFAULT 0,
  PRIMARY KEY (mes)
) ENGINE=InnoDB;

-- =============================================================================
-- Dados de exemplo
-- =============================================================================

INSERT INTO usuarios (usuario, senha_hash, papel) VALUES
  ('mazart', SHA2('demo1234', 256), 'administrador');

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

INSERT INTO contas_fixas (id, nome, valor, vencimento, status, lancamento_id) VALUES
  (1, 'Aluguel da gráfica',       3200.00, CURDATE() + INTERVAL 3 DAY,  'pendente', NULL),
  (2, 'Energia elétrica',         680.00,  CURDATE() + INTERVAL 1 DAY,  'pendente', NULL),
  (3, 'Internet fibra 500MB',     189.90,  CURDATE() + INTERVAL 8 DAY,  'pendente', NULL),
  (4, 'Água',                     95.00,   CURDATE() + INTERVAL 12 DAY, 'pendente', NULL),
  (5, 'Manutenção da plotter',    350.00,  CURDATE() - INTERVAL 2 DAY,  'pendente', NULL),
  (6, 'Contador',                 520.00,  CURDATE() - INTERVAL 6 DAY,  'pago',     NULL),
  (7, 'Licença CorelDRAW + RIP',  189.00,  CURDATE() - INTERVAL 9 DAY,  'pago',     NULL);

-- Do mais antigo (5 meses atrás) ao mês passado, na mesma ordem do protótipo
INSERT INTO fluxo_historico (mes, entradas, saidas) VALUES
  (DATE_FORMAT(CURDATE() - INTERVAL 5 MONTH, '%Y-%m-01'), 14200, 9800),
  (DATE_FORMAT(CURDATE() - INTERVAL 4 MONTH, '%Y-%m-01'), 16400, 10300),
  (DATE_FORMAT(CURDATE() - INTERVAL 3 MONTH, '%Y-%m-01'), 12900, 9100),
  (DATE_FORMAT(CURDATE() - INTERVAL 2 MONTH, '%Y-%m-01'), 18600, 11400),
  (DATE_FORMAT(CURDATE() - INTERVAL 1 MONTH, '%Y-%m-01'), 15800, 10900);

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
-- Consultas úteis (views)
-- =============================================================================

CREATE VIEW vw_materiais_em_falta AS
SELECT id, nome, unidade, quantidade_estoque, estoque_minimo
FROM materiais
WHERE quantidade_estoque < estoque_minimo;

CREATE VIEW vw_contas_a_vencer AS
SELECT id, nome, valor, vencimento, DATEDIFF(vencimento, CURDATE()) AS dias_restantes,
       CASE WHEN vencimento < CURDATE() THEN 'vencida'
            WHEN vencimento <= CURDATE() + INTERVAL 3 DAY THEN 'vence em breve'
            ELSE 'em dia' END AS situacao
FROM contas_fixas
WHERE status = 'pendente';

CREATE VIEW vw_fluxo_mensal AS
SELECT mes, entradas, saidas, entradas - saidas AS saldo FROM fluxo_historico
UNION ALL
SELECT DATE_FORMAT(CURDATE(), '%Y-%m-01'),
       COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN valor END), 0),
       COALESCE(SUM(CASE WHEN tipo = 'saida'   THEN valor END), 0),
       COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN valor ELSE -valor END), 0)
FROM lancamentos
WHERE data >= DATE_FORMAT(CURDATE(), '%Y-%m-01');
