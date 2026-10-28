-- =============================================================================
-- MazFlow · 03 · Lançamentos (entradas e saídas do caixa)
-- =============================================================================
USE mazflow;

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
