# Inventario de Dominio V2 - Margem Clara

Atualizado em: 2026-07-16

## 1. Objetivo

Consolidar o vocabulario, os agregados, os estados e as invariantes que devem orientar a versao operacional do Margem Clara. Este documento complementa as regras V1 e evita transformar cada novo produto em um fluxo isolado.

## 2. Limites do Dominio

### Nucleo da V1 real

- convenio, politicas e calendario de folha;
- servidor e matricula/vinculo;
- consignataria ou prestador conveniado e seu credenciamento;
- produto, rubrica e grupo de margem;
- arquivo de margem, insercao e retorno;
- calculo, reserva, consumo, bloqueio e liberacao de margem;
- emprestimo consignado;
- cartao consignado e cartao beneficio;
- descontos facultativos configuraveis;
- identidade, autorizacao, permissao e auditoria.

### Fora do primeiro fluxo operacional

- decisao automatica de credito por IA;
- Open Finance direto;
- marketplace de credito;
- pagamento de compra com consignado e liquidacao Pix;
- validacao de vinculo baseada apenas em fonte publica.

Essas frentes permanecem no backlog e devem usar as mesmas APIs, eventos e controles de acesso do nucleo quando forem implementadas.

## 3. Linguagem Ubiqua

- Organizacao: prefeitura, autarquia, empresa ou entidade que possui convenios.
- Convenio: contexto operacional e de isolamento no qual regras, usuarios, folha e credenciamentos sao configurados.
- Servidor: pessoa titular dos dados e dos vinculos.
- Matricula: vinculo funcional ou beneficio que possui folha e margem proprias.
- Parte conveniada: instituicao financeira, plano, seguradora, associacao, sindicato, comercio ou prestador.
- Credenciamento: permissao vigente para uma parte operar determinado produto em um convenio.
- Produto: regra comercial e operacional que gera reserva, contrato, limite ou desconto.
- Grupo de margem: limite separado ou compartilhado consumido por um ou mais produtos.
- Rubrica: codigo usado pela folha para identificar o desconto.
- Competencia: periodo da folha ao qual um movimento pertence.
- Ciclo de folha: janela operacional de uma competencia, incluindo corte, insercao, retorno e fechamento.
- Snapshot de margem: fotografia imutavel do calculo em um instante.
- Movimento de margem: lancamento imutavel que explica reserva, consumo, bloqueio ou liberacao.
- Reserva: retencao temporaria e atomica de valor em um grupo de margem.
- Contrato de credito: obrigacao financeira com prazo, parcelas e custo.
- Autorizacao de desconto: consentimento e regra para desconto facultativo que pode nao ser credito.
- Instrumento de cartao: conta de limite reservado vinculada a cartao consignado ou cartao beneficio.
- Lancamento de folha: item elegivel para compor um lote de insercao.
- Conciliacao: vinculacao do retorno da folha ao lancamento enviado e seu efeito financeiro.
- Ajuste: correcao formal e auditada; nunca reescrita silenciosa do historico.

## 4. Agregados e Responsabilidades

### 4.1 Convenio

Raiz: `agreement`.

Inclui:

- politicas versionadas;
- calendario e data de corte;
- layouts de arquivo versionados;
- produtos, grupos de margem e rubricas habilitados;
- exigencia configuravel de autorizacao do servidor;
- regras de retencao, fechamento e reprocessamento.

Invariantes:

- politica aplicada deve estar vigente na data efetiva da operacao;
- mudanca de regra nao altera competencia fechada;
- reabertura de competencia exige motivo, permissao e auditoria.

### 4.2 Servidor e Matricula

Raizes: `person` e `enrollment`.

Invariantes:

- margem, reserva, contrato, autorizacao e retorno apontam para uma matricula;
- CPF identifica a pessoa, mas nao substitui a matricula;
- status funcional inelegivel bloqueia novas operacoes conforme politica, sem apagar contratos existentes;
- dado importado da folha preserva origem, competencia e versao.

### 4.3 Parte Conveniada e Credenciamento

Raizes: `party` e `accreditation`.

Categorias iniciais de `party`:

- financial_institution;
- health_plan;
- insurer;
- pension_provider;
- association;
- union;
- cooperative;
- commerce;
- service_provider;
- law_office;
- other.

Invariantes:

- parte so opera produto e convenio cobertos por credenciamento ativo;
- homologacao nao gera lancamento para folha de producao;
- usuario da parte acessa somente contratos, descontos e matriculas autorizados para sua parte;
- suspensao preserva historico e impede novas operacoes.

### 4.4 Catalogo de Produtos

Raizes: `product`, `product_agreement_rule`, `margin_group` e `payroll_rubric`.

Familias:

- payroll_loan;
- payroll_card;
- benefit_card;
- optional_deduction.

Modos de cobranca:

- fixed_installments;
- indefinite_recurring;
- percentage;
- variable_by_competency;
- occasional;
- single_charge;
- reserved_limit.

Invariantes:

- produto bloqueado nao aceita simulacao, reserva ou lancamento;
- produto deve apontar para rubrica e grupo de margem vigentes;
- compartilhamento de margem e configurado no grupo, nao codificado na tela;
- regra usada em operacao fica versionada e referenciada.

### 4.5 Margem

Raizes: `margin_snapshot`, `margin_account` e `margin_movement`.

Invariantes:

- toda alteracao de saldo possui movimento e chave de idempotencia;
- snapshot publicado e imutavel;
- saldo disponivel nunca e reduzido sem transacao e bloqueio concorrente;
- saldo negativo so existe quando a politica permitir ou quando um evento posterior documentado o provocar;
- liberacao referencia o movimento original sempre que possivel.

### 4.6 Operacoes de Credito

Raizes: `reservation`, `credit_contract` e `contract_installment`.

Tipos:

- new;
- refinancing;
- portability;
- debt_purchase.

Invariantes:

- reserva expirada ou cancelada libera margem uma unica vez;
- contrato nasce de reserva confirmada, salvo migracao formal identificada;
- refinanciamento referencia contrato origem;
- portabilidade e compra de divida registram credor e saldo de origem;
- parcela atual avanca somente por retorno conciliado ou ajuste aprovado;
- ultima parcela confirmada liquida o contrato e libera a margem conforme regra do produto.

### 4.7 Cartoes

Raiz: `card_account`.

Inclui:

- produto e grupo de margem;
- limite concedido e limite reservado em folha;
- saldo utilizado;
- lancamentos, faturas, pagamentos, estornos e ajustes;
- status do instrumento.

Invariantes:

- limite de compra e margem reservada nao sao o mesmo valor por definicao; a regra do convenio relaciona os dois;
- fatura nao e modelada como parcela de emprestimo;
- estorno nao apaga lancamento original;
- cancelamento do cartao libera margem somente apos liquidacao das obrigacoes e confirmacao operacional.

### 4.8 Descontos Facultativos

Raiz: `deduction_authorization`.

Aplicacoes:

- plano de saude;
- seguro;
- previdencia;
- associacao ou sindicato;
- mensalidade;
- comercio ou servico conveniado.

Invariantes:

- deve existir fundamento/autorizacao e vigencia;
- valor variavel por competencia exige lancamento identificado;
- desconto por percentual registra a base usada;
- recorrencia sem prazo nao e tratada como contrato de prazo zero;
- cancelamento impede lancamentos futuros, mas preserva conciliacoes passadas.

### 4.9 Ciclo de Folha

Raizes: `payroll_cycle`, `payroll_file`, `payroll_batch`, `payroll_entry` e `reconciliation`.

Invariantes:

- arquivo original e hash sao preservados;
- layout aplicado e versionado;
- contrato ou desconto nao entra duas vezes na mesma competencia;
- data de corte define elegibilidade, com excecao apenas por decisao auditada;
- retorno duplicado e idempotente;
- rejeicao e desconto parcial geram pendencia, nao baixa integral;
- fechamento exige tratamento ou aceitacao formal dos bloqueios.

### 4.10 Identidade, Autorizacao e Auditoria

Raizes: `user`, `membership`, `authorization_grant` e `audit_event`.

Invariantes:

- acesso e sempre limitado por convenio e, quando aplicavel, por parte conveniada;
- codigo temporario e armazenado como hash, tem finalidade, validade e limite de tentativas;
- autorizacao pode ser dispensada por politica do convenio, sem dispensar auditoria;
- operacao sensivel registra ator, escopo, motivo, IP, instante e correlacao;
- IA atua com as mesmas permissoes do usuario e nao executa decisao financeira autonoma.

## 5. Maquinas de Estado Canonicas

### Reserva

```text
pending -> authorized -> confirmed -> converted
pending/authorized -> expired
pending/authorized/confirmed -> canceled
```

### Contrato de credito

```text
draft -> reserved -> awaiting_confirmation -> active
active -> sent_to_payroll -> discounting -> settled
active/sent_to_payroll/discounting -> suspended
draft/reserved/awaiting_confirmation -> refused|canceled
suspended -> discounting|canceled|settled
```

`settled` e o estado canonico para obrigacao encerrada. `liquidated` fica como motivo ou alias legado durante migracao, evitando dois estados equivalentes.

### Autorizacao de desconto

```text
draft -> awaiting_consent -> active -> suspended -> active
draft/awaiting_consent -> canceled
active/suspended -> canceled|ended
```

### Ciclo de folha

```text
open -> margin_imported -> operations_cut -> insertion_generated
insertion_generated -> awaiting_return -> reconciled -> closed
qualquer estado operacional -> blocked
closed -> reopened somente por comando privilegiado e auditado
```

## 6. Comandos Criticos

- ImportMarginFile
- PublishMarginSnapshot
- CreateReservation
- AuthorizeReservation
- ConvertReservationToContract
- CreateDeductionAuthorization
- OpenCardAccount
- GenerateInsertionBatch
- ImportReturnFile
- ReconcilePayrollEntry
- ApprovePayrollAdjustment
- ClosePayrollCycle
- CancelOrSettleObligation

Cada comando deve declarar ator, convenio, chave de idempotencia e identificador de correlacao.

## 7. Eventos de Dominio

- MarginFileImported
- MarginSnapshotPublished
- ReservationCreated
- ReservationAuthorized
- ReservationExpired
- ReservationReleased
- ContractActivated
- PayrollInsertionGenerated
- PayrollDiscountConfirmed
- PayrollDiscountPartiallyConfirmed
- PayrollDiscountRejected
- InstallmentAdvanced
- ContractSettled
- DeductionAuthorizationActivated
- CardMarginReserved
- PayrollCycleClosed
- OperationalAdjustmentApproved

Eventos devem ser gravados na mesma transacao da alteracao principal por uma outbox. Integracoes e IA consomem eventos depois, sem controlar o nucleo transacional.

## 8. Questoes de Descoberta sem Bloqueio

- percentuais e limites legais exatos por convenio;
- relacao entre limite do cartao e margem reservada;
- documentos obrigatorios por produto e tipo de operacao;
- tratamento de afastamento, exoneracao, falecimento e ordem judicial;
- regra de desconto parcial e saldo residual;
- calendario de feriados e antecipacoes de corte;
- retencao de dados e documentos por cliente.

Esses pontos entram como politicas versionadas. Nenhum exige abandonar os agregados definidos acima.
