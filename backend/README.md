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

Endpoints de login, cookie seguro, guardas de sessao e persistencia de auditoria ainda nao estao implementados. Nenhuma protecao demonstrativa do frontend deve ser considerada seguranca do backend.
