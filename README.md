# Margem Clara - MVP V1

Primeiro MVP web do sistema de gestao de margem consignavel.

## Ambiente de demonstracao

Quando o GitHub Pages estiver habilitado, o MVP ficara disponivel em:

https://thiago789.github.io/margem-clara/

## Como abrir localmente

Abra o arquivo `index.html` no navegador.

No Windows, voce pode dar duplo clique no arquivo:

```text
C:\Users\Thiago Moreira\Documents\Codex\2026-05-18\boa-noite-preciso-desenvolver-um-sistema\index.html
```

## O que ja funciona

- Painel operacional com foco recomendado em destaque, fila de pendencias e decisao da competencia.
- Jornada operacional guiada por etapas: base, operacao, folha e gestao.
- Servidores, matriculas/vinculos e margem controlada por matricula.
- Contratos, reservas, produtos, tipos de operacao e campos financeiros essenciais.
- Fluxo de arquivos: margem, insercao, retorno, validacao, protocolos e conciliacao.
- Baixa de parcela, liquidacao automatica e fechamento da competencia.
- Homologacao do MVP, prontidao V1 e roadmap orientado pelo menor indicador de maturidade.
- Permissoes por perfil, navegacao protegida com aviso e auditoria de eventos sensiveis.
- Consignatarias, produtos, rubricas, credenciamento e integracoes/API em nivel de MVP.
- Massa de demonstracao e persistencia local via `localStorage`.

## Arquivo de exemplo

Use `folha-exemplo.csv` para testar a importacao de folha.

Formato esperado:

```csv
nome,cpf,matricula,renda_base,descontos_obrigatorios,status
Joao Martins,456.789.012-33,MAT-1004,4100,350,Ativo
```

## Observacoes

Este MVP ainda nao possui backend, banco de dados ou autenticacao real. Ele foi feito como prototipo funcional para validar fluxo, regra de margem e experiencia de uso antes da implementacao completa da API.

## Backend operacional em construcao

A fundacao da API real esta em `backend/`, separada da demonstracao estatica.

Ela ja possui:

- NestJS e TypeScript em modo estrito;
- esquema Prisma para PostgreSQL;
- contexto de correlacao e health check;
- isolamento de acesso por convenio e parte conveniada;
- fabrica de eventos de auditoria;
- testes unitarios e de endpoint.

O backend ainda nao deve receber dados reais. Autenticacao, persistencia operacional e migracoes aplicadas em banco serao os proximos incrementos.

## Checagem estatica

Antes de publicar uma mudanca, rode:

```text
node tools/static-check.js
```

Essa checagem valida cache, addons carregados, ordem de dependencias, sintaxe JavaScript, regras centrais de status, jornada e decisoes recentes de produto.

## Smoke test de jornada

Para validar a jornada principal do gestor no navegador headless, rode:

```text
node tools/smoke-test.js
```

Esse teste abre o MVP localmente em desktop e mobile, percorre Dashboard, Fila, Fluxo Piloto, Validacao, Protocolos, Fechamento, Homologacao, Prontidao, Roadmap e Auditoria, e falha se houver erro JavaScript, tela essencial ausente, estouro horizontal ou rolagem travada.

## Checagem de seguranca

Antes de publicar alteracoes em repositorio publico, rode:

```text
node tools/security-check.js
```

Essa checagem procura segredos obvios, como `.env`, chaves privadas e tokens reais. O MVP publicado no GitHub Pages nao deve receber dados reais, credenciais, certificados ou chaves de API.

Validacoes tecnicas realizadas:

- Arquivos principais criados: `index.html`, `styles.css`, `app.js`.
- Sintaxe JavaScript validada.
- Estrutura servida por HTTP local chegou a responder no ambiente, mas o navegador interno bloqueou acesso a `localhost` e `file://` por politica de seguranca.
