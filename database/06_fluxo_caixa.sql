-- =============================================================================
-- MazFlow · 06 · Fluxo de caixa (gráfico "Últimos 6 meses")
-- Os meses anteriores ficam consolidados em `fluxo_historico`;
-- o mês atual é calculado a partir de `lancamentos`.
-- Depende de: 03_lancamentos.sql
-- =============================================================================
USE mazflow;

CREATE TABLE fluxo_historico (
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
CREATE VIEW vw_fluxo_mensal AS
SELECT mes, entradas, saidas, entradas - saidas AS saldo FROM fluxo_historico
UNION ALL
SELECT DATE_FORMAT(CURDATE(), '%Y-%m-01'),
       COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN valor END), 0),
       COALESCE(SUM(CASE WHEN tipo = 'saida'   THEN valor END), 0),
       COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN valor ELSE -valor END), 0)
FROM lancamentos
WHERE data >= DATE_FORMAT(CURDATE(), '%Y-%m-01');
