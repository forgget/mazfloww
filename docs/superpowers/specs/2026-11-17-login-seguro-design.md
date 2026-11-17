# MazFlow — Login seguro (Fase 1)

Data: 2026-11-17 · Status: aprovado para implementação

## Objetivo

Transformar o MazFlow de demo no navegador em sistema real para a Gráfica Mazart,
começando pelo acesso: quem entra, como entra e como o sistema se defende.

Fase 1 (este documento): servidor Node.js + MySQL com autenticação completa.
Fase 2 (depois): mover caixa, contas, materiais e orçamentos do `localStorage`
para o MySQL (as tabelas já existem em `database/`). Até a Fase 2, os dados
financeiros continuam no navegador de cada pessoa — o login da Fase 1 ainda não
os protege.

## Decisões do cliente

| Tema | Decisão |
|---|---|
| Uso | Sistema real da gráfica |
| Servidor | Node.js (Express) + MySQL |
| Cadastro | Livre, mas a conta fica **pendente** até o dono aprovar e definir o papel |
| Papel | Definido pelo dono (administrador/funcionário); some o "Entrar como" |
| Login | E-mail + senha, ou conta Google |
| Recuperação | Só por e-mail (link de uso único, 30 min) |
| Bloqueio | Por IP, escalonado, com banimento permanente — regras em SQL |

## Arquitetura

```
navegador ──HTTPS──► Express (server/)
                      ├─ entrega demo/index.html e a API no mesmo endereço
                      ├─ /api/auth/*   cadastro, login, Google, sair, recuperar
                      ├─ /api/admin/*  aprovar usuários, liberar IPs (só administrador)
                      └─ mysql2 (consultas sempre parametrizadas) ──► MySQL
```

- Mesmo endereço para página e API: cookie de sessão `httpOnly`, `SameSite=Lax`,
  `Secure` em produção; sem CORS. Requisições que alteram estado exigem
  `Content-Type: application/json` e `Origin` igual ao `APP_URL`.
- A página detecta o modo: se `GET /api/config` responde, usa o servidor;
  senão (GitHub Pages), continua como demo local. Um único `index.html`.

## Segurança

- **Senhas**: `crypto.scrypt` do Node (N=2^15, r=8, p=1, sal de 16 bytes),
  formato `scrypt$N$r$p$sal$hash`. Comparação em tempo constante. Mínimo 8 caracteres.
- **SQL injection**: toda consulta usa placeholders `?` do `mysql2`
  (`execute`). Nenhuma concatenação de entrada do usuário em SQL.
- **Sessão**: token aleatório de 32 bytes no cookie; o banco guarda só o
  SHA-256 dele (vazar o banco não vaza sessões). Validade 7 dias.
  Redefinir a senha encerra todas as sessões da pessoa.
- **Tokens de redefinição**: idem — só o hash no banco, uso único, 30 min.
- **Sem enumeração de contas**: "esqueci a senha" responde sempre igual.
- **Google**: o ID token é verificado no servidor (`google-auth-library`):
  assinatura, `aud` = `GOOGLE_CLIENT_ID`, `email_verified`.
- Cabeçalhos: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`,
  `Strict-Transport-Security` (produção).

## Bloqueio por IP (MySQL)

Tabelas `tentativas_login` e `bloqueios_ip`; procedures:

- `sp_verificar_acesso(ip, email)` → se o IP está bloqueado (até quando, ou
  permanente) e se o e-mail está travado.
- `sp_registrar_tentativa(ip, email, sucesso, motivo)` → grava e aplica a regra.

Regra:
1. 5 falhas do mesmo IP em 15 min → bloqueio temporário.
2. Duração escala com os bloqueios do IP nos últimos 7 dias: 15 min → 1 h → 24 h.
3. Se o IP já teve 3 bloqueios temporários em 7 dias, o próximo é **permanente**.
4. Proteção extra contra ataque distribuído: 10 falhas no mesmo e-mail em 1 h
   travam o login desse e-mail por 15 min (sem banir IP).
5. IP banido de forma permanente não acessa nada em `/api`.

Risco conhecido: todos da gráfica podem sair pelo mesmo IP. Por isso o dono vê
e libera bloqueios na tela "Usuários e acesso", e existe o comando de emergência
`npm run liberar-ip -- <ip>` no servidor.

## Cadastro e aprovação

- `DONO_EMAIL` (variável de ambiente): quem se cadastrar com esse e-mail vira
  administrador ativo automaticamente. Todos os outros entram como `pendente`.
- Os administradores recebem e-mail a cada novo cadastro; a pessoa recebe
  e-mail quando é aprovada.
- Login com Google de alguém sem conta cria um cadastro pendente com o nome e
  e-mail do Google. Se já existe conta com o mesmo e-mail, a conta Google é
  vinculada a ela.
- Estados: `pendente`, `ativo`, `recusado`, `desativado`. Só `ativo` entra.

## Telas

- Login: e-mail, senha, "Esqueci minha senha", botão Google, "Criar conta".
  Sem "Entrar como".
- Criar conta: nome, e-mail, senha, confirmar senha → mensagem "aguardando aprovação".
- Esqueci a senha: e-mail → mensagem neutra.
- Redefinir senha: aberta pelo link `/?redefinir=<token>`.
- Usuários e acesso (só administrador, no menu do avatar): pendentes com
  "Aprovar como funcionário/administrador" e "Recusar"; ativos com mudar papel e
  desativar; IPs bloqueados com "Liberar".

## Configuração (.env)

`DATABASE_URL` ou `DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME`, `APP_URL`,
`DONO_EMAIL`, `GOOGLE_CLIENT_ID`, `SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/EMAIL_FROM`,
`TRUST_PROXY` (1 atrás do proxy da hospedagem), `NODE_ENV`.
Sem SMTP configurado, os e-mails são impressos no log (desenvolvimento).

## Testes

`node --test` com um MySQL real (banco `mazflow_teste`): cadastro pendente,
dono automático, login, senha errada, escalonamento 15 min → 1 h → 24 h →
permanente, trava por e-mail, recuperação de senha (token único/expirado),
aprovação por administrador, bloqueio de não-administrador nas rotas de admin,
tentativa de SQL injection no e-mail.

## Fora do escopo da Fase 1

SMS; verificação de e-mail no cadastro (a aprovação do dono cobre); 2FA.

---

# Fase 2 — Dados da gráfica no servidor

Pedido do cliente: "não pode ter vazamento caso um ataque". Os dados
financeiros saem do `localStorage` e passam a viver só no MySQL.

## Decisões

- **Nada financeiro no aparelho.** Com servidor, a página guarda materiais,
  lançamentos, contas e orçamentos apenas na memória da aba. Não grava
  `localStorage`; ao sair (ou se a sessão cair) a página é recarregada para
  apagar a memória.
- **API única de leitura** `GET /api/dados` + rotas de gravação por recurso.
  Tudo exige sessão válida; materiais só administrador (mesma regra da demo).
- **Validação no servidor** de cada campo (tamanho, número, data real,
  categoria da lista fechada). Ids da URL validados como inteiros positivos.
- **Orçamento recalculado no servidor** com os preços do banco.
- **Operações compostas em transação**: pagar conta (lançamento + conta),
  desfazer, apagar lançamento de conta paga (reabre a conta), apagar conta paga.
- **Auditoria** (`database/08_auditoria.sql`): toda alteração registra usuário,
  IP, ação, registro e valores antes/depois, na mesma transação.
- **Página com resposta imediata**: o `store` aplica a alteração na tela e
  enfileira o envio (um por vez, em ordem). Registros novos usam id temporário
  negativo até o servidor devolver o definitivo. Se o servidor recusar, a
  página avisa, descarta o resto da fila e recarrega tudo do banco.
- **Migração só de estrutura**: `npm run db:migrar` cria tabelas, views e
  procedures de 01 a 08 e ignora os INSERT/UPDATE de exemplo — produção começa
  vazia. `database/mazflow.sql` (Workbench, com exemplos) é gerado por
  `npm run db:juntar`.

## Rotas

| Método | Caminho | Quem |
|---|---|---|
| GET | `/api/dados` | logado |
| POST/PUT/DELETE | `/api/materiais[/:id]` | administrador |
| POST/PUT/DELETE | `/api/lancamentos[/:id]` | logado |
| POST/DELETE | `/api/contas[/:id]` | logado |
| POST | `/api/contas/:id/pagar` `{data}` · `/api/contas/:id/desfazer` | logado |
| POST/DELETE | `/api/orcamentos[/:id]` | logado |

## O que protege contra vazamento (resumo)

Banco fora da internet (rede privada da hospedagem), acesso só pela API com
sessão, consultas parametrizadas, HTTPS, nada salvo no aparelho, senhas e
tokens só como hash, bloqueio de IP, auditoria. Criptografar campo a campo no
banco não foi adotado: a chave ficaria no mesmo servidor que a senha do banco,
então não protege contra quem invade o servidor, e impede somas no SQL.
