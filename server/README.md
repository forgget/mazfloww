# Servidor do MazFlow

Login seguro da Gráfica Mazart: cadastro com aprovação do dono, recuperação
de senha por e-mail e bloqueio de IP contra tentativas de invasão. Serve também a página do sistema (`demo/index.html`) no mesmo endereço.

Caixa, contas fixas, materiais e orçamentos ficam **só no MySQL**. A página
mantém os dados apenas na memória enquanto está aberta (nada é gravado no
aparelho) e toda alteração passa pela API, com login, validação e registro na
tabela `auditoria`.

Aberta pelo GitHub Pages (sem servidor), a mesma página continua funcionando
como demonstração, com dados de exemplo no navegador.

## Como funciona a segurança

| Ameaça | Proteção |
|---|---|
| Vazamento do banco | Senhas com hash **scrypt** (sem volta); sessões e links de redefinição guardados só como hash SHA-256 |
| SQL injection | Toda consulta usa parâmetros `?` (`mysql2`), nunca texto concatenado |
| Força bruta | 5 erros em 15 min bloqueiam o IP: 15 min → 1 h → 24 h → **permanente** (4º bloqueio em 7 dias). 10 erros no mesmo e-mail travam esse e-mail por 15 min |
| Cadastro de estranhos | Conta nova fica **pendente** até um administrador aprovar |
| Descobrir quem tem conta | "Esqueci a senha" e cadastro respondem igual para e-mails existentes e inexistentes |
| Sessão roubada por script | Cookie `httpOnly`, `SameSite=Lax` e `Secure` (produção) |
| Outro site enviando pedidos | Exige JSON e confere o cabeçalho `Origin` |
| Página dentro de outro site | `X-Frame-Options: DENY` e CSP `frame-ancestors 'none'` |
| Celular perdido/roubado | Dados financeiros não ficam salvos no aparelho; o dono tira o acesso e a sessão cai na hora |
| Dados forjados pelo navegador | Servidor valida cada campo e recalcula o valor dos orçamentos com os preços do banco |
| Descobrir o que um invasor fez | Tabela `auditoria`: quem, de qual IP, quando, valores antes/depois |

As regras de bloqueio estão em SQL: `database/07_acesso.sql`
(`sp_verificar_acesso`, `sp_registrar_tentativa`, `sp_liberar_ip`).

## Rodar no computador

Precisa de Node.js 22+ e MySQL 8.

```bash
cd server
npm install
cp .env.example .env      # preencha DB_*, DONO_EMAIL
npm run db:migrar         # cria tabelas e procedures (não apaga nada)
npm run dev               # http://localhost:3000
```

Sem `SMTP_HOST`, os e-mails (link de recuperação, aviso de cadastro) aparecem
no terminal.

Primeiro acesso: abra o sistema, clique em **Criar conta** e use o e-mail de
`DONO_EMAIL`. Essa conta já entra como administrador. As próximas ficam
aguardando a sua aprovação em **avatar → Usuários e acesso**.

## Testes

Usam um banco separado, `mazflow_teste` (criado sozinho):

```bash
npm test
```

## Publicar (exemplo com Railway)

1. Crie um projeto no [Railway](https://railway.app) a partir do repositório
   do GitHub, com o **Root Directory** vazio (raiz do repositório): o servidor
   precisa de `demo/` (a página) e `database/` (o SQL). O `package.json` da
   raiz já diz como instalar (`build`) e iniciar (`start`, que roda a
   migração antes).
2. Adicione o serviço **MySQL** ao projeto. Na aba de variáveis do servidor,
   crie `DATABASE_URL` apontando para a do MySQL (`${{MySQL.MYSQL_URL}}`).
3. Crie as variáveis:
   - `NODE_ENV=production`
   - `APP_URL=https://<endereço gerado pelo Railway ou seu domínio>`
   - `DONO_EMAIL=<e-mail do dono>`
   - `TRUST_PROXY=1`
   - `SMTP_*`, `EMAIL_FROM` (veja abaixo)
4. Abra o endereço, crie a conta do dono e pronto.

### E-mail (recuperação de senha e avisos)

Qualquer SMTP serve. Duas opções gratuitas:

- **Gmail** (até ~500 e-mails/dia): ative a verificação em duas etapas na
  conta e crie uma *senha de app* em <https://myaccount.google.com/apppasswords>.
  Use `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER=<seu gmail>`,
  `SMTP_PASS=<senha de app, 16 letras>` e `EMAIL_FROM=MazFlow <seu gmail>`.
  Nunca use a senha normal da conta.
- **[Brevo](https://www.brevo.com)** (até 300 e-mails/dia): **SMTP & API →
  SMTP**, com `SMTP_HOST=smtp-relay.brevo.com`, `SMTP_PORT=587` e o usuário e
  a senha mostrados lá. Valide o remetente de `EMAIL_FROM` no painel.

## Emergência: dono bloqueado

Todos da gráfica costumam sair para a internet pelo mesmo IP. Se alguém errar
a senha várias vezes, a rede inteira fica bloqueada. O dono libera em
**Usuários e acesso → Redes bloqueadas**. Se o próprio dono não consegue entrar,
rode no servidor (no Railway: aba do serviço → *Shell*):

```bash
npm run liberar-ip              # lista os bloqueios
npm run liberar-ip -- 200.1.2.3 # libera esse IP
```

## API

| Método | Caminho | Quem |
|---|---|---|
| GET | `/api/config` | todos |
| GET | `/api/auth/eu` | logado |
| POST | `/api/auth/cadastro` `{nome,email,senha}` | todos |
| POST | `/api/auth/login` `{email,senha}` | todos |
| POST | `/api/auth/sair` | logado |
| POST | `/api/auth/esqueci` `{email}` | todos |
| POST | `/api/auth/redefinir` `{token,senha}` | todos |
| GET | `/api/admin/usuarios` | administrador |
| POST | `/api/admin/usuarios/:id/aprovar` `{papel}` | administrador |
| POST | `/api/admin/usuarios/:id/recusar` | administrador |
| POST | `/api/admin/usuarios/:id/desativar` | administrador |
| GET | `/api/admin/bloqueios` | administrador |
| POST | `/api/admin/bloqueios/liberar` `{ip}` | administrador |
| GET | `/api/dados` | logado |
| POST · PUT · DELETE | `/api/materiais[/:id]` | administrador |
| POST · PUT · DELETE | `/api/lancamentos[/:id]` | logado |
| POST · DELETE | `/api/contas[/:id]` | logado |
| POST | `/api/contas/:id/pagar` `{data}` | logado |
| POST | `/api/contas/:id/desfazer` | logado |
| POST · DELETE | `/api/orcamentos[/:id]` | logado |

## Backup

Faça backup diário do MySQL (no Railway: aba do MySQL → *Backups*). Guarde
as cópias em lugar com acesso restrito: um backup vazado expõe tudo.
