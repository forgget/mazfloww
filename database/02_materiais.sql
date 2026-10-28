-- =============================================================================
-- MazFlow · 02 · Materiais (estoque)
-- =============================================================================
USE mazflow;

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
CREATE VIEW vw_materiais_em_falta AS
SELECT id, nome, unidade, quantidade_estoque, estoque_minimo
FROM materiais
WHERE quantidade_estoque < estoque_minimo;
