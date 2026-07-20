# Margem Clara Backend

Fundacao executavel da versao operacional do Margem Clara.

## Requisitos

- Node.js 20.19 ou superior;
- pnpm 11;
- Docker Desktop com Compose para o PostgreSQL local.

## Configuracao

Crie um `.env` local a partir de `.env.example`, gere uma senha local longa e use o mesmo valor em `POSTGRES_PASSWORD` e na senha da `DATABASE_URL`. Nunca versione credenciais ou dados reais.

O PostgreSQL fica exposto apenas em `127.0.0.1`. O volume `postgres-data` preserva os dados entre reinicios do container.

## Banco local

Suba o banco e aplique as migracoes existentes:

```text
pnpm db:setup
```

Comandos separados para operacao e diagnostico:

```text
pnpm db:up
pnpm db:status
pnpm db:logs
pnpm db:down
```

`db:down` para o ambiente sem apagar o volume. A exclusao do volume deve ser uma decisao manual e consciente.

## Comandos

```text
pnpm install
pnpm typecheck
pnpm test
pnpm prisma:validate
pnpm prisma:generate
pnpm dev
```

Health check local:

```text
GET http://127.0.0.1:3333/api/v1/health
GET http://127.0.0.1:3333/api/v1/health/ready
```

O primeiro endpoint verifica apenas o processo da API. O segundo consulta o PostgreSQL e retorna `503` sem detalhes internos quando a dependencia nao esta pronta.

## Limites atuais

- health check e fundacao de configuracao;
- contexto de correlacao;
- regra pura de isolamento por convenio e parte;
- fabrica de evento de auditoria;
- esquema Prisma e migracoes aplicadas no PostgreSQL local;
- tabelas de sessao e tentativas de autenticacao;
- hash de senha com `scrypt`, salt aleatorio e comparacao em tempo constante;
- token de sessao opaco com persistencia apenas do hash.
- login e logout reais em `POST /api/v1/auth/login` e `POST /api/v1/auth/logout`;
- sessao atual em `GET /api/v1/auth/me`, protegida por guard;
- cookie `HttpOnly`, `SameSite=Strict` e `Secure` em producao;
- limite de falhas por identificador de e-mail e IP em janela configuravel;
- identificadores de tentativas protegidos com HMAC e chave independente;
- auditoria persistente de login, bloqueio, falha e logout.

Recuperacao de senha, MFA, rotacao de sessao, administracao de usuarios e autorizacao por permissao em endpoints de dominio ainda nao estao implementados. Nenhuma protecao demonstrativa do frontend deve ser considerada seguranca do backend.

Exemplo de login local, sempre com credenciais ficticias:

```text
POST /api/v1/auth/login
Content-Type: application/json

{"email":"gestora@example.test","password":"senha-local"}
```

O token nunca e retornado no JSON. O cliente recebe apenas o cookie de sessao. Nenhum usuario inicial e criado automaticamente.

## Primeiro administrador

O primeiro administrador e criado somente por comando no ambiente do servidor. O processo exige banco vazio, senha com pelo menos 16 caracteres e cria uma associacao global com permissao curinga. Nao existe endpoint publico de bootstrap.

No PowerShell, defina temporariamente `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_EMAIL` e `BOOTSTRAP_ADMIN_PASSWORD` e execute:

```text
pnpm admin:bootstrap
```

O comando e recusado assim que existir qualquer usuario. A senha nao e exibida nem gravada em arquivo pelo comando.

## Autorizacao

Endpoints de dominio devem usar o decorator `Authorize`. Ele combina sessao obrigatoria com permissao explicita e pode resolver o escopo pelos parametros da rota:

```text
@Authorize("margin:read", { agreementParam: "agreementId" })
@Authorize("accreditation:write", { agreementParam: "agreementId", partyParam: "partyId" })
```

- associacao global com `*`: acesso administrativo da plataforma;
- associacao de convenio sem parte: acesso permitido dentro daquele convenio;
- associacao com parte: acesso restrito a consignataria correspondente;
- negacao de acesso: resposta `403` e evento persistente de auditoria.
