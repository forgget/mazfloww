-- ============================================================
-- Ajustes no banco `academia` para alinhar com o MER/DER
-- (Trabalho 1 - Tópicos Avançados em Banco de Dados)
--
-- Execute DEPOIS de importar o academia.sql.
-- Compatível com MySQL 8.0.
--
-- O que este script faz:
--   1. PLANO: adiciona duracao_meses e formas_pagto_aceitas
--      (o enunciado pede duração e formas de pagamento dos planos)
--   2. SALA: cria a tabela e transforma aula.id_sala em FK
--      (antes id_sala era uma coluna solta, sem tabela)
--   3. ITEM_TREINO: cria a tabela que registra os exercícios
--      prescritos em cada ficha (série, repetições e carga)
-- ============================================================

START TRANSACTION;

-- ------------------------------------------------------------
-- 1. PLANO: duração e formas de pagamento aceitas
-- ------------------------------------------------------------
ALTER TABLE `plano`
  ADD COLUMN `duracao_meses` int UNSIGNED NOT NULL DEFAULT 12
      COMMENT 'Duração do contrato do plano, em meses' AFTER `valor_mensal`,
  ADD COLUMN `formas_pagto_aceitas` varchar(100) NOT NULL DEFAULT 'PIX,CARTAO,DINHEIRO'
      COMMENT 'Formas de pagamento aceitas, separadas por vírgula' AFTER `duracao_meses`;

UPDATE `plano` SET `duracao_meses` = 12, `formas_pagto_aceitas` = 'PIX,CARTAO,DINHEIRO';

-- ------------------------------------------------------------
-- 2. SALA: nova tabela + FK em aula.id_sala
-- ------------------------------------------------------------
CREATE TABLE `sala` (
  `id_sala`    smallint UNSIGNED NOT NULL AUTO_INCREMENT,
  `nome`       varchar(50)       NOT NULL,
  `capacidade` int UNSIGNED      NOT NULL,
  PRIMARY KEY (`id_sala`),
  UNIQUE KEY `uq_sala_nome` (`nome`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- As 4 salas já usadas pela tabela aula (id_sala 1 a 4)
INSERT INTO `sala` (`id_sala`, `nome`, `capacidade`) VALUES
(1, 'Sala de Musculação', 40),
(2, 'Estúdio Multiuso',   20),
(3, 'Box de Crossfit',    20),
(4, 'Piscina',            12);

ALTER TABLE `aula`
  ADD KEY `fk_aula_sala` (`id_sala`),
  ADD CONSTRAINT `fk_aula_sala` FOREIGN KEY (`id_sala`)
      REFERENCES `sala` (`id_sala`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- ------------------------------------------------------------
-- 3. ITEM_TREINO: exercícios prescritos em cada ficha
-- ------------------------------------------------------------
CREATE TABLE `item_treino` (
  `id_item`      int UNSIGNED  NOT NULL AUTO_INCREMENT,
  `id_ficha`     int UNSIGNED  NOT NULL,
  `id_exercicio` int UNSIGNED  NOT NULL,
  `series`       int UNSIGNED  NOT NULL,
  `repeticoes`   int UNSIGNED  NOT NULL,
  `carga`        decimal(5,2)  DEFAULT NULL COMMENT 'Carga em kg (NULL para exercícios sem carga)',
  PRIMARY KEY (`id_item`),
  UNIQUE KEY `uq_item_ficha_exercicio` (`id_ficha`, `id_exercicio`),
  KEY `fk_item_exercicio` (`id_exercicio`),
  CONSTRAINT `fk_item_ficha` FOREIGN KEY (`id_ficha`)
      REFERENCES `ficha_treino` (`id_ficha`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_item_exercicio` FOREIGN KEY (`id_exercicio`)
      REFERENCES `exercicio` (`id_exercicio`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ck_item_series` CHECK (`series` > 0),
  CONSTRAINT `ck_item_repeticoes` CHECK (`repeticoes` > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Dados de exemplo
INSERT INTO `item_treino` (`id_ficha`, `id_exercicio`, `series`, `repeticoes`, `carga`) VALUES
-- Ficha 1 (Hipertrofia - musculação)
(1, 1, 4, 10, 40.00),
(1, 2, 4, 10, 60.00),
(1, 3, 3, 12, 35.00),
(1, 4, 3, 12, 12.00),
-- Ficha 4 (Emagrecimento)
(4, 6, 3, 15, 80.00),
(4, 15, 4, 12, NULL),
(4, 16, 3, 1, NULL),
-- Ficha 5 (Condicionamento físico)
(5, 15, 4, 15, NULL),
(5, 16, 4, 1, NULL),
-- Ficha 6 (Performance em crossfit)
(6, 11, 5, 10, 30.00),
(6, 12, 5, 12, NULL),
(6, 13, 4, 15, 16.00);

COMMIT;
