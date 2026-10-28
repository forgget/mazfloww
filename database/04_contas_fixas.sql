-- =============================================================================
-- MazFlow · 04 · Contas fixas (ao pagar, gera um lançamento de saída)
-- Depende de: 03_lancamentos.sql
-- =============================================================================
USE mazflow;

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

INSERT INTO contas_fixas (id, nome, valor, vencimento, status, lancamento_id) VALUES
  (1, 'Aluguel da gráfica',       3200.00, CURDATE() + INTERVAL 3 DAY,  'pendente', NULL),
  (2, 'Energia elétrica',         680.00,  CURDATE() + INTERVAL 1 DAY,  'pendente', NULL),
  (3, 'Internet fibra 500MB',     189.90,  CURDATE() + INTERVAL 8 DAY,  'pendente', NULL),
  (4, 'Água',                     95.00,   CURDATE() + INTERVAL 12 DAY, 'pendente', NULL),
  (5, 'Manutenção da plotter',    350.00,  CURDATE() - INTERVAL 2 DAY,  'pendente', NULL),
  (6, 'Contador',                 520.00,  CURDATE() - INTERVAL 6 DAY,  'pago',     NULL),
  (7, 'Licença CorelDRAW + RIP',  189.00,  CURDATE() - INTERVAL 9 DAY,  'pago',     NULL);

-- Contas pendentes e a situação de cada uma
CREATE VIEW vw_contas_a_vencer AS
SELECT id, nome, valor, vencimento, DATEDIFF(vencimento, CURDATE()) AS dias_restantes,
       CASE WHEN vencimento < CURDATE() THEN 'vencida'
            WHEN vencimento <= CURDATE() + INTERVAL 3 DAY THEN 'vence em breve'
            ELSE 'em dia' END AS situacao
FROM contas_fixas
WHERE status = 'pendente';
