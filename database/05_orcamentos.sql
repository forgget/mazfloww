-- =============================================================================
-- MazFlow · 05 · Orçamentos e seus itens (materiais usados)
-- Depende de: 02_materiais.sql
-- =============================================================================
USE mazflow;

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
