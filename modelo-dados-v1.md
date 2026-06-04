# Modelo de Dados V1 - Sistema de Margem Consignavel

Este documento descreve o modelo logico inicial da V1. A ideia e ter uma base suficiente para construir o nucleo operacional: convenios, servidores, folha, margem, reservas, contratos, simulacoes, autorizacoes, suporte e auditoria.

## 1. Convencoes

- Banco recomendado: PostgreSQL.
- Chaves primarias: UUID.
- Campos monetarios: numeric(14,2).
- Percentuais: numeric(7,4).
- Datas com hora: timestamptz.
- Status: enums ou check constraints.
- Exclusao fisica deve ser evitada em entidades sensiveis.
- Toda tabela operacional relevante deve ter created_at, updated_at e, quando fizer sentido, deleted_at.

## 2. Entidades Principais

### 2.1 organizations

Representa orgaos, empresas, prefeituras, autarquias ou entidades empregadoras.

Campos:
- id
- name
- document_number
- organization_type
- status
- created_at
- updated_at

Relacionamentos:
- Uma organization possui varios agreements.

### 2.2 agreements

Representa um convenio operacional dentro de uma organizacao.

Campos:
- id
- organization_id
- name
- code
- status
- payroll_frequency
- margin_calculation_mode
- created_at
- updated_at

Relacionamentos:
- Pertence a uma organization.
- Possui varias enrollments.
- Possui varias margin_rules.
- Possui varias lender_agreements.

### 2.3 employees

Representa a pessoa fisica do servidor, empregado ou beneficiario.

Campos:
- id
- full_name
- cpf
- birth_date
- email
- phone
- status
- created_at
- updated_at

Relacionamentos:
- Um employee pode ter varias enrollments.
- Um employee pode ter varios users vinculados, se o portal do servidor usar login proprio.

Observacao:
- A margem deve ser controlada por enrollment, nao apenas por employee.

### 2.4 enrollments

Representa matricula, beneficio ou vinculo funcional.

Campos:
- id
- employee_id
- agreement_id
- enrollment_number
- functional_status
- admission_date
- termination_date
- base_salary
- status
- created_at
- updated_at

Relacionamentos:
- Pertence a um employee.
- Pertence a um agreement.
- Possui margin_snapshots.
- Possui contracts.
- Possui reservations.

### 2.5 lenders

Representa bancos, financeiras ou consignatarias.

Campos:
- id
- legal_name
- trade_name
- document_number
- contact_email
- contact_phone
- status
- created_at
- updated_at

Relacionamentos:
- Possui lender_agreements.
- Possui lender_product_rates.
- Possui contracts.

### 2.6 lender_agreements

Define quais consignatarias podem operar em quais convenios.

Campos:
- id
- lender_id
- agreement_id
- status
- start_date
- end_date
- created_at
- updated_at

Regra:
- Consignataria so pode consultar margem, reservar ou contratar dentro de convenio habilitado.

### 2.7 products

Representa os tipos de produto consignavel.

Exemplos:
- Emprestimo consignado.
- Cartao consignado.
- Mensalidade.
- Seguro.

Campos:
- id
- name
- code
- product_type
- status
- created_at
- updated_at

### 2.8 margin_rules

Define como a margem e calculada por convenio e produto.

Campos:
- id
- agreement_id
- product_id
- name
- base_mode
- margin_percentage
- max_installments
- min_installment_value
- max_installment_value
- allow_negative_margin
- status
- valid_from
- valid_until
- created_at
- updated_at

Campos de regra:
- base_mode: gross_income, net_income, custom_base.
- margin_percentage: percentual aplicado sobre a base.
- allow_negative_margin: indica se contrato pode ser mantido fora da margem.

### 2.9 payroll_imports

Controla cada importacao de folha.

Campos:
- id
- agreement_id
- competency
- original_file_name
- file_hash
- status
- total_rows
- valid_rows
- invalid_rows
- processed_by_user_id
- processed_at
- created_at
- updated_at

Status:
- uploaded
- validating
- validated
- processing
- processed
- failed
- canceled

### 2.10 payroll_records

Registro consolidado da folha para uma matricula em uma competencia.

Campos:
- id
- payroll_import_id
- enrollment_id
- competency
- gross_income
- net_income
- base_income
- mandatory_deductions
- functional_status
- raw_data
- status
- created_at
- updated_at

### 2.11 payroll_items

Itens detalhados da folha, positivos ou negativos.

Campos:
- id
- payroll_record_id
- code
- description
- item_type
- amount
- affects_margin_base
- created_at

item_type:
- earning
- deduction

### 2.12 margin_snapshots

Fotografia da margem calculada em uma competencia.

Campos:
- id
- enrollment_id
- agreement_id
- competency
- margin_rule_id
- calculation_base
- margin_percentage
- total_margin
- used_margin
- reserved_margin
- blocked_margin
- available_margin
- status
- explanation
- calculated_at
- created_at

Status:
- available
- reserved
- blocked
- negative
- reviewing

Observacao:
- explanation deve guardar um JSON com detalhes do calculo para auditoria e exibicao ao usuario.

### 2.13 margin_movements

Historico de qualquer evento que altere ou explique a margem.

Campos:
- id
- enrollment_id
- margin_snapshot_id
- movement_type
- amount
- previous_available_margin
- new_available_margin
- source_type
- source_id
- description
- created_by_user_id
- created_at

movement_type:
- payroll_import
- reservation_created
- reservation_expired
- reservation_canceled
- contract_confirmed
- contract_canceled
- contract_liquidated
- manual_block
- manual_release
- recalculation

### 2.14 reservations

Reserva temporaria de margem.

Campos:
- id
- enrollment_id
- lender_id
- product_id
- margin_snapshot_id
- amount
- installment_value
- installments
- interest_rate
- cet_rate
- status
- expires_at
- authorized_by_code_id
- created_by_user_id
- confirmed_at
- canceled_at
- created_at
- updated_at

Status:
- pending
- authorized
- confirmed
- expired
- canceled
- converted_to_contract

### 2.15 contracts

Contrato consignado.

Campos:
- id
- enrollment_id
- lender_id
- product_id
- reservation_id
- contract_number
- principal_amount
- installment_value
- installments
- current_installment
- interest_rate
- cet_rate
- start_date
- expected_end_date
- status
- created_by_user_id
- created_at
- updated_at

Status:
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

### 2.16 contract_installments

Parcelas e descontos de contrato.

Campos:
- id
- contract_id
- installment_number
- due_competency
- amount
- discounted_amount
- status
- payroll_record_id
- discount_date
- created_at
- updated_at

Status:
- pending
- sent_to_payroll
- discounted
- partially_discounted
- rejected
- paid_directly
- canceled

### 2.17 lender_product_rates

Taxas cadastradas por consignataria, produto e prazo.

Campos:
- id
- lender_id
- agreement_id
- product_id
- min_installments
- max_installments
- interest_rate
- cet_rate
- status
- valid_from
- valid_until
- created_at
- updated_at

### 2.18 simulations

Simulacoes realizadas por servidor, gestor ou consignataria.

Campos:
- id
- enrollment_id
- lender_id
- product_id
- requested_amount
- requested_installment_value
- installments
- estimated_installment_value
- estimated_total_amount
- interest_rate
- cet_rate
- fits_margin
- status
- created_by_user_id
- created_at

Status:
- draft
- presented
- selected
- canceled
- converted_to_reservation

### 2.19 authorization_codes

Codigo temporario para autorizar consulta, reserva ou confirmacao.

Campos:
- id
- employee_id
- enrollment_id
- code_hash
- purpose
- status
- expires_at
- used_at
- used_by_user_id
- created_at

purpose:
- margin_query
- margin_reservation
- contract_confirmation

Status:
- active
- used
- expired
- canceled

### 2.20 tickets

Solicitacoes de suporte ou contestacao.

Campos:
- id
- agreement_id
- employee_id
- enrollment_id
- contract_id
- ticket_type
- subject
- status
- priority
- opened_by_user_id
- assigned_to_user_id
- closed_at
- created_at
- updated_at

ticket_type:
- margin_dispute
- contract_question
- unknown_contract
- payroll_discount_error
- cancellation_request
- access_problem

Status:
- open
- waiting_rh
- waiting_lender
- waiting_employee
- resolved
- closed
- canceled

### 2.21 ticket_messages

Mensagens do ticket.

Campos:
- id
- ticket_id
- sender_user_id
- message
- visibility
- created_at

visibility:
- internal
- public

### 2.22 attachments

Anexos de contratos, tickets ou importacoes.

Campos:
- id
- owner_type
- owner_id
- file_name
- file_type
- file_size
- storage_path
- uploaded_by_user_id
- created_at

### 2.23 users

Usuarios de acesso ao sistema.

Campos:
- id
- name
- email
- cpf
- password_hash
- status
- last_login_at
- created_at
- updated_at

### 2.24 roles

Perfis de acesso.

Campos:
- id
- name
- description
- created_at
- updated_at

Perfis iniciais:
- admin
- manager
- lender_user
- employee_user

### 2.25 user_roles

Associacao entre usuarios e perfis.

Campos:
- id
- user_id
- role_id
- agreement_id
- lender_id
- created_at

Observacao:
- agreement_id e lender_id permitem restringir usuario a um convenio ou consignataria.

### 2.26 audit_logs

Trilha de auditoria.

Campos:
- id
- actor_user_id
- actor_role
- action
- entity_type
- entity_id
- previous_data
- new_data
- ip_address
- user_agent
- reason
- created_at

## 3. Relacionamentos Criticos

```text
organization 1:N agreements
agreement 1:N enrollments
employee 1:N enrollments
agreement N:N lenders via lender_agreements
enrollment 1:N margin_snapshots
enrollment 1:N reservations
enrollment 1:N contracts
contract 1:N contract_installments
payroll_import 1:N payroll_records
payroll_record 1:N payroll_items
margin_snapshot 1:N margin_movements
ticket 1:N ticket_messages
```

## 4. Regras de Integridade

- CPF de employee deve ser unico, salvo parametrizacao futura para bases legadas.
- enrollment_number deve ser unico dentro de um agreement.
- contract_number deve ser unico por lender ou por agreement, conforme regra do convenio.
- Nao permitir reservation ativa vencida; rotina de expiracao deve liberar margem.
- Nao permitir contrato ativo sem enrollment, lender e product.
- Nao permitir consignataria operar em convenio sem lender_agreement ativo.
- Nao recalcular snapshot antigo sem registrar novo movement ou versao.

## 5. Eventos de Dominio da V1

- PayrollImported
- MarginCalculated
- MarginRecalculated
- AuthorizationCodeGenerated
- AuthorizationCodeUsed
- ReservationCreated
- ReservationExpired
- ReservationCanceled
- ContractConfirmed
- ContractSentToPayroll
- InstallmentDiscounted
- ContractCanceled
- ContractLiquidated
- TicketOpened
- TicketAnswered

## 6. Observacoes para Implementacao

- margin_snapshots devem ser imutaveis depois de calculados, salvo campos tecnicos de status.
- margin_movements explicam a variacao da margem e sustentam auditoria.
- authorization_codes devem armazenar hash do codigo, nunca o codigo puro.
- raw_data em payroll_records ajuda a rastrear problemas de layout sem perder o dado original.
- previous_data e new_data em audit_logs devem ser JSONB.
- explanation em margin_snapshots deve ser JSONB para montar a tela de margem explicada.

## 7. Modelo Evolutivo de Campos

O modelo deve nascer com um nucleo estavel, mas permitir evolucao por convenio, produto, layout de folha e regra operacional. A V1 real nao deve travar todos os campos como obrigatorios desde o primeiro dia; alguns campos serao obrigatorios, outros opcionais e outros configuraveis por convenio.

### 7.1 Principio

- Separar campo essencial de campo complementar.
- Guardar dados brutos de arquivos para rastreabilidade.
- Permitir configuracao por convenio quando a regra variar.
- Evitar alterar historico fechado; usar ajustes e movimentos auditados.
- Versionar layout, regra de margem e regra de produto quando mudarem.

### 7.2 Servidor e Matricula

Campos essenciais de employee:
- full_name
- cpf
- birth_date
- email
- phone
- status

Campos complementares de employee:
- social_name
- mother_name
- document_rg
- document_issuer
- marital_status
- address
- city
- state
- zip_code
- preferred_contact_channel

Campos essenciais de enrollment:
- employee_id
- agreement_id
- enrollment_number
- functional_status
- base_salary
- status

Campos complementares de enrollment:
- admission_date
- termination_date
- job_title
- department
- workplace
- employment_type
- regime_type
- payroll_group
- cost_center
- bank_account_reference
- public_registration_number

Campos que podem variar por convenio:
- quais status funcionais permitem margem;
- quais verbas compoem a base;
- se matricula, beneficio ou vinculo e o identificador principal;
- se CPF pode ter mais de uma matricula ativa;
- se servidor em revisao pode gerar codigo, reserva ou simulacao.

### 7.3 Contrato

Campos essenciais:
- enrollment_id
- lender_id
- product_id
- contract_number
- principal_amount
- financed_amount
- installment_value
- installments
- current_installment
- interest_rate
- cet_rate
- status

Campos financeiros complementares:
- iof_amount
- insurance_amount
- fee_amount
- net_released_amount
- total_financed_amount
- total_repayment_amount
- monthly_effective_rate
- annual_effective_rate
- first_due_date
- last_due_date
- first_payroll_competency
- final_payroll_competency

Campos operacionais:
- reservation_id
- authorization_code_id
- payroll_rubric_code
- payroll_inclusion_protocol
- payroll_return_protocol
- sent_to_payroll_at
- first_discount_confirmed_at
- canceled_at
- liquidated_at
- suspension_reason
- cancellation_reason

Campos que podem variar por produto/convenio:
- prazo maximo;
- valor minimo e maximo de parcela;
- exigencia de CET;
- exigencia de autorizacao por codigo;
- rubrica de desconto;
- competencia inicial permitida;
- tolerancia para divergencia no valor descontado.
- obrigatoriedade de valor contratado, taxa, CET, primeiro vencimento e primeira competencia.

### 7.4 Arquivos e Competencias

Novas entidades candidatas para V1 real:

#### payroll_files

Representa qualquer arquivo recebido ou gerado no ciclo da folha.

Campos:
- id
- agreement_id
- competency
- file_type
- direction
- protocol_number
- original_file_name
- generated_file_name
- layout_version
- file_hash
- status
- total_rows
- valid_rows
- invalid_rows
- total_amount
- generated_by_user_id
- processed_by_user_id
- generated_at
- processed_at
- created_at

file_type:
- margin_file
- insertion_file
- return_file
- adjustment_file

direction:
- inbound
- outbound

#### payroll_file_errors

Campos:
- id
- payroll_file_id
- row_number
- severity
- field_name
- error_code
- message
- raw_value
- created_at

severity:
- warning
- blocking

#### payroll_closings

Representa a decisao de fechamento da competencia.

Campos:
- id
- agreement_id
- competency
- status
- decision
- closed_by_user_id
- closed_at
- blockers_summary
- warnings_summary
- audit_log_id
- created_at

status:
- open
- blocked
- closed_with_notes
- closed
- reopened

### 7.5 Ajustes Operacionais

#### payroll_adjustments

Representa excecoes apos retorno, fechamento ou reprocessamento controlado.

Campos:
- id
- agreement_id
- enrollment_id
- contract_id
- competency
- adjustment_type
- status
- amount
- reason
- decision
- requested_by_user_id
- approved_by_user_id
- resolved_at
- audit_log_id
- created_at
- updated_at

adjustment_type:
- return_rejected
- not_discounted
- amount_difference
- manual_margin_release
- manual_margin_block
- carry_to_next_competency
- contract_cancelation
- contract_reprocess

status:
- open
- waiting_decision
- approved
- rejected
- resolved
- canceled

### 7.6 Configuracoes por Convenio

#### agreement_settings

Campos:
- id
- agreement_id
- setting_key
- setting_value
- value_type
- valid_from
- valid_until
- created_at
- updated_at

Chaves candidatas:
- require_authorization_for_reservation
- authorization_validity_hours
- allow_immediate_reservation
- default_margin_percentage
- margin_base_mode
- allow_negative_margin
- reservation_expiration_hours
- payroll_file_delimiter
- payroll_file_encoding
- first_installment_rule
- return_required_for_closing
- public_source_validation_enabled

### 7.7 Campos JSONB Controlados

JSONB pode ser usado, mas com cuidado, para campos que variam por convenio ou layout.

Uso recomendado:
- raw_data em payroll_records;
- explanation em margin_snapshots;
- previous_data e new_data em audit_logs;
- validation_summary em payroll_files;
- blockers_summary e warnings_summary em payroll_closings.

Regra:
- Campo usado para filtro, permissao, calculo ou relatorio recorrente deve virar coluna normal.
- Campo apenas informativo, bruto ou variavel pode ficar em JSONB.

### 7.8 Campos que Devem Entrar no Backlog de Descoberta

- lista completa de verbas por convenio;
- regras de rubrica por produto;
- vencimento da primeira parcela;
- carencia entre reserva e primeiro desconto;
- regras de suspensao, liquidacao e cancelamento;
- anexos obrigatorios por produto;
- documentos exigidos pela consignataria;
- tolerancia para retorno parcial;
- historico de saldo devedor, se entrar no escopo futuro;
- validacao complementar em fonte publica;
- evidencias para contestacao de contrato desconhecido.

### 7.9 Catalogo de Campos

O catalogo de campos deve classificar cada campo em uma das categorias abaixo:

- Obrigatorio: sem ele o fluxo principal nao funciona ou existe risco operacional, financeiro, juridico ou de auditoria.
- Opcional: melhora atendimento, relatorio ou experiencia, mas nao impede o fluxo base.
- Configuravel: varia por convenio, produto, folha ou politica local.
- Futuro: relevante, mas fora do escopo da V1 operacional.

Campos obrigatorios iniciais:

- Servidor: CPF, nome completo, data de nascimento e status.
- Matricula: matricula, convenio, situacao funcional e base de calculo.
- Contrato: consignataria, produto, parcela, prazo, taxa, CET e status.
- Folha: competencia, layout, protocolo, hash e status.
- Convenio: nome, codigo, status e frequencia da folha.

Campos opcionais iniciais:

- Servidor: e-mail, telefone, endereco e nome social.
- Matricula: cargo, lotacao, regime e data de admissao.
- Contrato: IOF, seguro, valor liberado, valor financiado e anexos.
- Folha: arquivo original, arquivo gerado e erros por linha.
- Convenio: orgao superior, contatos e SLA operacional.

Campos configuraveis iniciais:

- Servidor: validacao complementar e campos publicos do municipio.
- Matricula: status que permite margem, verbas consideradas e identificador principal.
- Contrato: primeiro vencimento, rubrica, prazo maximo e exigencia de autorizacao.
- Folha: delimitador, encoding, versao de layout e retorno obrigatorio.
- Convenio: percentual de margem, validade da reserva, politica de fechamento e produtos permitidos.

Regra de seguranca:

- Consignataria deve ver apenas campos necessarios para operar.
- Campos financeiros ou funcionais exigem auditoria de alteracao.
- Dados pessoais devem seguir minimizacao e finalidade.

### 7.10 Regras de Contrato, Produto e Folha

Data de corte:

- Cada convenio deve configurar o dia de corte da competencia.
- Ao gerar o arquivo de insercao, somente reservas dentro da janela permitida entram no arquivo.
- Reservas criadas apos a data de corte devem ficar para a proxima competencia ou exigir autorizacao operacional explicita.
- A regra precisa considerar feriado, fim de semana e calendario especifico do convenio em versoes futuras.

Evolucao de parcelas:

- Todo contrato deve guardar prazo total e parcela atual.
- A parcela atual so deve avancar quando o arquivo retorno confirmar desconto em folha.
- Retorno rejeitado, nao descontado ou pendente nao liquida parcela automaticamente.
- Quando parcela atual atingir o prazo total, o contrato deve mudar para Liquidado e liberar margem.
- Liquidacao, cancelamento e suspensao devem gerar movimento de margem e evento de auditoria.

Tipos de contrato:

- Novo: consome nova margem disponivel.
- Refinanciamento: substitui ou recalcula contrato existente, podendo alterar parcela, prazo e valor liberado.
- Portabilidade: migra contrato de outra instituicao, exigindo controle de banco origem, saldo e etapas de confirmacao.
- Compra de divida: quita contrato externo ou anterior e cria novo contrato, exigindo valor de compra, credor original e comprovantes.

Produtos principais:

- Emprestimo consignado: parcela fixa mensal, prazo definido e margem principal.
- Cartao consignado: produto com rubrica e limite especificos, podendo ter regra de margem separada.
- Cartao beneficio: produto com margem/rubrica propria conforme convenio e regras locais.

Campos adicionais recomendados para contrato:

- principal_amount
- interest_rate
- cet_rate
- product_code
- contract_type
- current_installment
- first_due_date
- first_payroll_competency
- cutoff_competency
- source_contract_id
- origin_lender_name
- origin_lender_id
- debt_purchase_amount
- operation_note
- portability_status
- liquidation_reason

### 7.11 Matricula e Vinculo como Centro da Margem

Regra principal:

- A margem deve ser calculada e consumida por matricula/vinculo, nao apenas por CPF.
- Um servidor pode ter mais de uma matricula ativa no mesmo convenio ou em convenios diferentes.
- Contrato, reserva, simulacao, autorizacao e retorno de folha devem apontar para a matricula correta.
- Consignataria deve consultar e reservar margem apenas da matricula autorizada.
- Portal do servidor deve permitir alternar entre matriculas quando houver mais de uma.

Campos minimos de enrollment:

- employee_id
- agreement_id
- enrollment_number
- functional_status
- base_salary
- mandatory_deductions
- margin_base
- status

Riscos que essa regra evita:

- consumir margem de uma matricula errada;
- liberar margem em vinculo incorreto;
- misturar contratos de convenios diferentes;
- permitir que uma consignataria veja dados alem da matricula autorizada.
