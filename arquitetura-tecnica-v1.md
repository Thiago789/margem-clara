# Arquitetura Tecnica V1 - Sistema de Margem Consignavel

## 1. Objetivo

Definir uma arquitetura simples, segura e escalavel para a primeira versao do sistema de gestao de margem consignavel.

A V1 deve priorizar:
- velocidade de desenvolvimento;
- clareza de regras de negocio;
- auditoria confiavel;
- facilidade de manutencao;
- interface web responsiva;
- integracao inicial por arquivos.

## 2. Stack Recomendada

### Backend

Opcao recomendada:
- Node.js
- NestJS
- TypeScript
- Prisma ORM
- PostgreSQL

Motivos:
- Boa organizacao por modulos.
- Forte tipagem.
- Produtividade alta.
- Prisma acelera criacao do modelo de dados.
- NestJS favorece separacao entre controller, service, repository e regras de dominio.

### Frontend

Opcao recomendada:
- React
- Vite
- TypeScript
- React Router
- TanStack Query
- React Hook Form
- Zod
- Tailwind CSS

Motivos:
- Rapido para construir dashboards e portais.
- Bom controle de formularios.
- Validacao reaproveitavel.
- Interface responsiva sem depender de aplicativo nativo na V1.

### Banco de Dados

Opcao recomendada:
- PostgreSQL

Motivos:
- Excelente suporte a dados relacionais.
- JSONB para campos de auditoria e explicacao de calculo.
- Boa maturidade para relatorios.
- Facil evolucao para integracoes futuras.

### Armazenamento de Arquivos

V1:
- armazenamento local em diretorio controlado do servidor, com metadados no banco.

Futuro:
- S3, Azure Blob ou storage equivalente.

Arquivos:
- importacoes de folha;
- anexos de contratos;
- anexos de tickets;
- relatorios exportados.

## 3. Estrutura de Modulos Backend

Modulos sugeridos:

```text
auth
users
organizations
agreements
employees
enrollments
lenders
products
payroll-imports
margin
reservations
contracts
simulations
authorization-codes
tickets
attachments
audit
reports
```

## 4. Separacao de Responsabilidades

### Controllers

Responsaveis por:
- receber requisicoes HTTP;
- validar entrada basica;
- chamar services;
- retornar DTOs.

### Services

Responsaveis por:
- regras de negocio;
- validacoes operacionais;
- orquestracao de operacoes.

### Repositories / Prisma

Responsaveis por:
- leitura e escrita no banco;
- queries transacionais;
- filtros e paginacao.

### Domain Services

Responsaveis por regras centrais:
- calculo de margem;
- expiracao de reservas;
- conversao de reserva em contrato;
- geracao e validacao de codigo de autorizacao.

## 5. Fluxos Tecnicos Principais

### 5.1 Importacao de Folha

```text
upload arquivo
-> cria payroll_import
-> valida layout
-> exibe pre-visualizacao
-> processa registros
-> cria payroll_records/payroll_items
-> recalcula margem
-> cria margin_snapshots
-> cria margin_movements
-> registra audit_logs
```

### 5.2 Calculo de Margem

```text
buscar matricula
-> buscar regra vigente
-> buscar folha da competencia
-> calcular base
-> aplicar percentual
-> somar contratos ativos
-> somar reservas ativas
-> somar bloqueios
-> gerar snapshot
-> gerar explicacao em JSONB
```

### 5.3 Reserva de Margem

```text
validar consignataria no convenio
-> validar codigo de autorizacao
-> buscar margem disponivel
-> validar valor da parcela
-> criar reserva
-> criar movimento de margem
-> registrar auditoria
```

### 5.4 Confirmacao de Contrato

```text
buscar reserva ativa
-> validar prazo de expiracao
-> criar contrato
-> criar parcelas
-> atualizar reserva
-> atualizar margem usada/reservada
-> registrar auditoria
```

### 5.5 Contestacao de Margem

```text
servidor abre ticket
-> vincula matricula e snapshot de margem
-> RH analisa detalhe do calculo
-> responde ou corrige base
-> se necessario recalcula margem
-> registra historico completo
```

## 6. Seguranca

Requisitos minimos da V1:
- Senhas com hash forte.
- Token de sessao com expiracao.
- Controle por perfil.
- Restricao por convenio.
- Restricao por consignataria.
- Auditoria de acoes sensiveis.
- Codigo de autorizacao armazenado como hash.
- Logs sem dados sensiveis desnecessarios.

Regras:
- Servidor so acessa suas matriculas.
- Consignataria so acessa contratos proprios.
- Gestor so acessa convenios autorizados.
- Administrador acessa configuracoes globais.

## 7. Jobs e Rotinas Agendadas

Rotinas da V1:
- Expirar reservas vencidas.
- Expirar codigos de autorizacao.
- Recalcular margem apos importacao.
- Gerar alertas de inconsistencias.

Rotinas futuras:
- Processar retorno de folha.
- Conciliar arquivos externos.
- Enviar notificacoes.

## 8. Padrao de Status

Reservas:
- pending
- authorized
- confirmed
- expired
- canceled
- converted_to_contract

Contratos:
- simulated
- reserved
- waiting_confirmation
- active
- sent_to_payroll
- discounting
- settled
- canceled
- suspended
- liquidated
- refused

Tickets:
- open
- waiting_rh
- waiting_lender
- waiting_employee
- resolved
- closed
- canceled

## 9. API Inicial

Endpoints por grupo:

```text
POST   /auth/login
POST   /auth/logout
GET    /me

GET    /agreements
POST   /agreements
GET    /employees
POST   /employees
GET    /enrollments/:id/margin

POST   /payroll-imports
GET    /payroll-imports/:id
POST   /payroll-imports/:id/process

POST   /authorization-codes
POST   /authorization-codes/validate

POST   /simulations
GET    /simulations/:id/ranking

POST   /reservations
POST   /reservations/:id/cancel
POST   /reservations/:id/confirm

GET    /contracts
GET    /contracts/:id
POST   /contracts/:id/cancel
POST   /contracts/:id/liquidate

GET    /tickets
POST   /tickets
POST   /tickets/:id/messages

GET    /audit-logs
GET    /reports/margins
GET    /reports/contracts
```

## 10. Estrutura Frontend

Areas:
- Login.
- Layout administrativo.
- Painel gestor/RH.
- Portal consignataria.
- Portal servidor.

Telas iniciais:
- Dashboard gestor.
- Servidores.
- Detalhe do servidor.
- Margem explicada.
- Importacao de folha.
- Consignatarias.
- Contratos.
- Simulador/ranking.
- Codigos de autorizacao.
- Tickets.
- Auditoria.

## 11. Decisoes para V1

- Fazer web responsivo em vez de app nativo.
- Comecar com importacao CSV/XLSX em vez de integracao direta com folha.
- Usar PostgreSQL com JSONB para explicacao de margem e auditoria.
- Implementar ranking de taxas simples antes de qualquer leilao reverso.
- Implementar ticket de contestacao antes de modulo completo de comunicacao.
- Implementar codigo de autorizacao antes de assinatura digital complexa.

## 12. Riscos Tecnicos

- Regras de margem podem variar muito por convenio.
- Layouts de folha podem mudar por cliente.
- Margem negativa exige explicacao clara para nao gerar suporte excessivo.
- Auditoria precisa ser planejada desde o inicio.
- Permissoes por convenio e consignataria devem ser testadas com rigor.

## 13. Primeiro Incremento Desenvolvivel

O primeiro incremento deve entregar:
- autenticacao;
- cadastro de convenio;
- cadastro de servidor/matricula;
- cadastro de consignataria;
- regra de margem;
- importacao CSV simples;
- calculo de margem;
- tela de margem explicada.

Esse incremento ja prova o diferencial central do produto.
