# Modelo de Dados V1 - Margem Clara

Este documento registra o modelo logico evolutivo do Margem Clara. A decisao principal e manter um nucleo estavel, mas permitir evolucao por convenio, produto, layout de folha e regra operacional.

## Principios

- A margem deve ser controlada por matricula/vinculo, nao apenas por CPF.
- Campos usados em filtro, permissao, calculo ou relatorio recorrente devem virar colunas normais.
- Dados brutos, explicacoes e resumos variaveis podem usar JSONB com governanca.
- Competencia fechada nao deve ser sobrescrita; correcao vira ajuste auditado.
- Layouts, regras de margem e regras de produto devem ser versionados.

## Entidades Nucleo

- organizations
- agreements
- employees
- enrollments
- lenders
- lender_agreements
- products
- margin_rules
- payroll_files
- payroll_file_errors
- payroll_records
- payroll_items
- margin_snapshots
- margin_movements
- reservations
- contracts
- contract_installments
- payroll_closings
- payroll_adjustments
- authorization_codes
- simulations
- tickets
- ticket_messages
- attachments
- users
- roles
- user_roles
- audit_logs
- agreement_settings

## Servidor e Matricula

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
- status funcionais que permitem margem;
- verbas que compoem a base;
- identificador principal: matricula, beneficio ou vinculo;
- se CPF pode ter mais de uma matricula ativa;
- se servidor em revisao pode gerar codigo, reserva ou simulacao.

## Contrato

Campos essenciais:
- enrollment_id
- lender_id
- product_id
- reservation_id
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

Varia por produto/convenio:
- prazo maximo;
- valor minimo e maximo de parcela;
- exigencia de CET;
- exigencia de autorizacao por codigo;
- rubrica de desconto;
- competencia inicial permitida;
- tolerancia para divergencia no valor descontado.

## Arquivos e Competencias

### payroll_files

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

### payroll_file_errors

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

### payroll_closings

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

## Ajustes Operacionais

### payroll_adjustments

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

## Configuracoes por Convenio

### agreement_settings

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

## JSONB Controlado

Uso recomendado:
- raw_data em payroll_records;
- explanation em margin_snapshots;
- previous_data e new_data em audit_logs;
- validation_summary em payroll_files;
- blockers_summary e warnings_summary em payroll_closings.

Regra: campo recorrente de operacao vira coluna; campo bruto, explicativo ou muito variavel pode ficar em JSONB.

## Backlog de Descoberta

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
