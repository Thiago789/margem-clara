# Arquitetura do Backend V1 - Margem Clara

Atualizado em: 2026-07-16

## 1. Decisao

Construir inicialmente um monolito modular em TypeScript. A complexidade principal esta nas regras e transacoes, nao na distribuicao. Modulos bem separados, eventos internos e outbox preservam a opcao de extrair servicos depois.

Stack recomendada:

- Node.js LTS;
- NestJS com adapter HTTP padrao;
- PostgreSQL;
- Prisma para migracoes e acesso comum;
- SQL explicito quando bloqueio, constraint ou relatorio exigir;
- Zod ou class-validator nos limites da API, adotando um unico padrao no scaffold;
- fila baseada em PostgreSQL no inicio, com adaptador para Redis/SQS no futuro;
- storage S3 compativel para arquivos;
- OpenAPI gerada pelo backend.

## 2. Estrutura de Modulos

```text
src/
  platform/
    auth
    access-control
    audit
    observability
    storage
    jobs
    integrations
  agreements/
  parties/
  people/
  products/
  payroll/
  margin/
  credit/
  cards/
  deductions/
  support/
```

Cada modulo pode conter `domain`, `application`, `infrastructure` e `http`, sem obrigar arquitetura cerimonial em operacoes simples.

## 3. Regras de Dependencia

- `platform` nao depende do dominio;
- `margin` conhece identificadores de folha e produto, mas nao interfaces HTTP;
- `credit`, `cards` e `deductions` solicitam movimentos ao modulo de margem;
- `payroll` chama handlers de conciliacao por tipo de obrigacao;
- integracoes consomem outbox e nao atualizam tabelas financeiras diretamente;
- IA acessa apenas APIs de leitura ou comandos explicitamente permitidos e auditados.

## 4. Isolamento e Autorizacao

O backend resolve o escopo a partir da sessao:

```text
usuario autenticado
-> memberships vigentes
-> convenio selecionado e permitido
-> parte conveniada, quando aplicavel
-> permissao da acao
-> filtro obrigatorio da consulta
```

Controles:

- negar por padrao;
- MFA para admin, gestor e operadores sensiveis;
- access token curto e refresh token rotativo;
- cookies seguros para portal web, evitando token persistido em `localStorage`;
- rate limit em login, codigo e consulta sensivel;
- mascaramento de CPF, renda e dados contratuais por perfil;
- testes de vazamento entre convenios e entre partes em toda rota operacional.

## 5. Transacoes Criticas

### Criar reserva

Uma unica transacao deve:

1. validar escopo, credenciamento, produto e politica vigente;
2. validar autorizacao quando exigida;
3. bloquear ou versionar `margin_account`;
4. confirmar saldo disponivel;
5. criar `reservation`;
6. criar `margin_movement`;
7. atualizar saldo corrente;
8. criar `audit_event` e `outbox_event`;
9. confirmar a transacao.

Reenvio com a mesma chave retorna o resultado original.

### Processar retorno

Cada linha valida idempotencia e referencia o lancamento enviado. O handler da obrigacao aplica desconto, rejeicao ou parcial, cria movimento/pendencia e avanca parcela somente quando houver valor efetivamente conciliado conforme politica.

## 6. Processamento de Arquivos

```text
Upload direto para storage por URL assinada
-> backend registra metadados e hash
-> job valida antivirus, tamanho e layout
-> parser normaliza linhas para staging
-> usuario revisa bloqueios
-> comando publica processamento
-> transacao por lote controlado
-> resumo e auditoria
```

Requisitos:

- arquivo nunca e executado;
- nome interno nao usa nome enviado pelo usuario;
- limite de tamanho e extensoes permitidas;
- hash antes do processamento;
- parser por versao de layout;
- staging separado das tabelas publicadas;
- retomada de job sem duplicar efeitos;
- arquivo de insercao recebe protocolo e assinatura/hash verificavel.

## 7. API e Integracoes

Padroes:

- REST JSON para operacao sincrona;
- `Idempotency-Key` obrigatoria em comandos financeiros e uploads;
- `X-Correlation-Id` propagado em logs, auditoria e eventos;
- paginacao por cursor em listas grandes;
- erros com codigo estavel, mensagem segura e detalhes de campo;
- webhooks assinados, com tentativa, backoff e caixa de entrega;
- versionamento de API apenas quando houver quebra de contrato.

Primeiros grupos:

```text
/auth
/agreements
/parties
/people
/enrollments
/products
/payroll-cycles
/payroll-files
/margin-accounts
/authorization-grants
/reservations
/credit-contracts
/payroll-batches
/reconciliations
/audit-events
```

## 8. Auditoria e Observabilidade

- log tecnico estruturado sem CPF, token, senha ou arquivo bruto;
- auditoria de negocio separada do log tecnico;
- metricas de latencia, erro, fila, importacao e conciliacao;
- tracing por `correlation_id`;
- alertas para lote travado, retorno nao conciliado, reserva expirada e divergencia de saldo;
- painel de saude sem expor dados pessoais;
- backup testado e procedimento de restauracao documentado.

## 9. Primeiro Fluxo Vertical Real

Objetivo: provar isolamento, arquivo, calculo, concorrencia, auditoria e conciliacao com emprestimo consignado antes de ampliar produtos.

### Entrada

- um convenio ficticio;
- dois perfis de gestor em convenios diferentes;
- uma parte financeira credenciada;
- servidores e matriculas ficticios;
- layout CSV versionado;
- politica de margem, corte e autorizacao.

### Jornada

```text
autenticar gestor
-> abrir ciclo da competencia
-> importar arquivo de margem
-> revisar e publicar registros
-> calcular e explicar margem
-> autenticar operador da consignataria
-> consultar matricula autorizada
-> criar reserva atomica
-> converter em contrato
-> gerar lote de insercao no corte
-> importar retorno
-> conciliar desconto
-> avancar parcela
-> liquidar na ultima parcela
-> liberar margem
-> consultar auditoria completa
```

### Criterios de aceite

- usuario de outro convenio recebe `403` ou resultado vazio sem inferir existencia;
- parte nao credenciada nao consulta nem reserva;
- duas reservas concorrentes nao ultrapassam a margem;
- reenvio da mesma operacao nao duplica movimento;
- arquivo duplicado nao e processado novamente;
- contrato apos o corte fica para a competencia seguinte;
- retorno rejeitado nao avanca parcela;
- retorno parcial registra valor e pendencia conforme politica;
- retorno confirmado avanca uma unica vez;
- ultima parcela liquida e libera margem uma unica vez;
- toda etapa sensivel aparece na auditoria com correlacao.

## 10. Estrategia de Testes

- unitarios para calculo, elegibilidade, estados e politica de corte;
- integracao com PostgreSQL real para constraints e transacoes;
- concorrencia para reservas e conciliacoes;
- contrato de API gerado e validado;
- E2E por perfil no fluxo vertical;
- testes de autorizacao negativos como requisito de cada endpoint;
- arquivos dourados para cada versao de layout;
- seguranca automatizada para segredo, dependencia, cabecalhos e upload.

## 11. Entregas Tecnicas em Ordem

1. criar workspace `backend` com lint, testes e configuracao por ambiente;
2. subir PostgreSQL local por container sem credencial real versionada;
3. implementar identidade, escopo e auditoria;
4. criar migracoes do Incremento 1 do modelo V2;
5. implementar ciclo, upload e staging do arquivo de margem;
6. implementar conta, snapshot e razao de margem;
7. implementar reserva atomica e contrato;
8. implementar insercao e retorno;
9. executar testes E2E e de isolamento;
10. publicar ambiente de homologacao com dados ficticios.

## 12. Gate para Iniciar o Scaffold

O scaffold pode comecar quando estiverem confirmados:

- monolito modular e stack;
- nomes canonicos `party`, `enrollment`, `margin_account` e `credit_contract`;
- isolamento por `agreement_id`;
- primeira politica de autenticacao;
- primeiro layout CSV ficticio;
- criterios do fluxo vertical acima.

As regras ainda desconhecidas nao bloqueiam o scaffold: entram por versoes de politica e migracoes pequenas.
