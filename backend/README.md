# Margem Clara Backend

Fundacao executavel da versao operacional do Margem Clara.

## Requisitos

- Node.js 20.19 ou superior;
- pnpm 11;
- PostgreSQL para migracoes e testes de integracao futuros.

## Configuracao

Crie um `.env` local a partir de `.env.example`. Nunca versione credenciais ou dados reais.

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
