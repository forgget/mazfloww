-- =============================================================================
-- MazFlow — controle financeiro da Gráfica Mazart
-- 00 · Banco de dados
--
-- Rode os arquivos nesta ordem (as tabelas dependem umas das outras):
--   00_banco.sql         cria o banco `mazflow` do zero
--   01_usuarios.sql      login do sistema
--   02_materiais.sql     estoque de materiais
--   03_lancamentos.sql   entradas e saídas do caixa
--   04_contas_fixas.sql  contas do mês (usa lançamentos)
--   05_orcamentos.sql    orçamentos e itens (usa materiais)
--   06_fluxo_caixa.sql   histórico e gráfico de 6 meses (usa lançamentos)
--
-- As datas são relativas ao dia em que os scripts rodam (CURDATE()),
-- igual ao protótipo, que sempre usa "hoje" de quem abre.
-- =============================================================================

DROP DATABASE IF EXISTS mazflow;
CREATE DATABASE mazflow CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
