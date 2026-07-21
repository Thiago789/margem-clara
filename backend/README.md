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

No ambiente local Windows, prefira o assistente com senha mascarada:

```text
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-admin.ps1
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

## Convenios e politicas

O primeiro modulo de dominio real esta disponivel em `/api/v1/agreements` e exige sessao e permissao:

- criar e listar convenios;
- consultar convenio dentro do escopo autorizado;
- criar politica operacional em rascunho com versao sequencial;
- ativar uma versao, expirando a anterior na mesma transacao;
- consultar a politica operacional ativa;
- auditar criacao e ativacao.

A politica `OPERATIONAL_RULES` valida autorizacao de consulta, confirmacao por codigo ou imediata, dia de corte, familias de produto, campos contratuais obrigatorios e fonte publica para validacao do servidor.

## Protecao de dados pessoais

CPF, e-mail, telefone e matricula devem ser persistidos somente pelo `DataProtectionService`. O servico usa AES-256-GCM com vetor aleatorio, autenticacao do conteudo e separacao por finalidade do campo. Buscas exatas usam HMAC-SHA-256 separado; o dado original nao e usado como indice.

As chaves `DATA_ENCRYPTION_KEY` e `DATA_LOOKUP_SECRET` sao independentes de `AUTH_LOOKUP_SECRET` e nao devem ser versionadas. Gere a chave de criptografia com 32 bytes aleatorios em base64url e mantenha as chaves em um gerenciador de segredos nos ambientes publicados. A troca de chaves exigira um procedimento versionado de rotacao antes de haver dados reais.

## Servidores e vinculos

O cadastro operacional esta disponivel em `/api/v1/agreements/:agreementId/servants` e exige permissao explicita no convenio:

- `POST /`: cria identidade, vinculo e evidencia de auditoria na mesma transacao;
- `GET /`: lista no maximo 100 vinculos com CPF e matricula mascarados;
- `GET /:enrollmentId`: consulta somente dentro do convenio da rota;
- `POST /lookup`: localiza por CPF ou matricula conhecidos usando indices HMAC.

O CPF tem digitos verificadores validados, a matricula e unica por convenio e valores basicos de folha inconsistentes sao recusados. As respostas nunca incluem texto cifrado, hashes de busca, CPF integral, matricula integral, e-mail ou telefone.

## Ciclo e arquivo de margem

O primeiro fluxo de folha esta disponivel em `/api/v1/agreements/:agreementId/payroll-cycles`:

- `POST /`: abre uma competencia e fixa a versao da politica operacional ativa;
- `GET /`: lista as 36 competencias mais recentes;
- `POST /:cycleId/margin-files`: recebe CSV multipart de ate 5 MB com `Idempotency-Key`;
- `GET /:cycleId/files/:fileId`: consulta o staging sem expor a linha bruta;
- `POST /:cycleId/files/:fileId/publish`: aplica um arquivo integralmente validado.

O layout `MARGIN_V1` usa ponto e virgula. Colunas obrigatorias: `matricula`, `situacao_funcional`, `remuneracao_base`, `descontos_obrigatorios` e `base_margem`. Colunas opcionais: `tipo_vinculo`, `grupo_folha`, `lotacao`, `centro_custo` e `data_atualizacao`.

O arquivo original existe apenas na memoria durante o processamento. Cada linha bruta e persistida criptografada; o staging normalizado nao contem matricula. Arquivo repetido no mesmo ciclo nao e processado novamente, qualquer linha invalida impede publicacao e cada atualizacao publicada gera snapshot antes/depois ligado a competencia e a linha de origem.
