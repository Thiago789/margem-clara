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
```

## Limites atuais

- health check e fundacao de configuracao;
- contexto de correlacao;
- regra pura de isolamento por convenio e parte;
- fabrica de evento de auditoria;
- esquema Prisma do primeiro incremento.
- migracao SQL inicial gerada e revisavel, ainda nao aplicada em banco local.

Autenticacao, persistencia de auditoria e endpoints operacionais ainda nao estao implementados. Nenhuma protecao demonstrativa do frontend deve ser considerada seguranca do backend.
