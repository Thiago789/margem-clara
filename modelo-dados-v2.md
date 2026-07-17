# Modelo de Dados V2 - Margem Clara

Atualizado em: 2026-07-16

## 1. Objetivo e Convencoes

Este e o modelo logico alvo da primeira versao operacional. Ele substitui nomes estreitos do V1 sem exigir que todas as tabelas sejam implementadas no primeiro incremento.

Convencoes:

- PostgreSQL;
- UUID v7 ou UUID aleatorio como chave primaria;
- `numeric(18,2)` para dinheiro e `numeric(9,6)` para taxas;
- `timestamptz` para instantes e `date` para datas civis;
- competencia armazenada como primeiro dia do mes;
- `created_at`, `updated_at` e `version` em agregados mutaveis;
- `agreement_id` obrigatorio nas tabelas operacionais para isolamento;
- exclusao logica somente onde fizer sentido; historico financeiro nao e apagado;
- nomes internos em ingles e linguagem da interface em portugues.

## 2. Mapa de Contextos

```text
Identity and Access
  -> Agreements and Parties
    -> People and Enrollments
      -> Product Catalog
        -> Payroll and Margin
          -> Credit, Cards and Deductions
            -> Files and Reconciliation
              -> Audit, Support and Integrations
```

## 3. Tabelas da Fundacao

### organizations e agreements

Preservam o conceito V1. `agreements` recebe:

- `tenant_key` unico;
- `timezone`;
- `payroll_frequency`;
- `status`;
- `data_classification`;
- `created_at`, `updated_at`, `version`.

### agreement_policy_versions

- id
- agreement_id
- policy_type
- version_number
- payload JSONB
- valid_from
- valid_until
- status
- approved_by_user_id
- approved_at
- created_at

Restricao: apenas uma versao ativa por `agreement_id`, `policy_type` e instante de vigencia.

Politicas iniciais:

- authorization;
- margin_calculation;
- payroll_calendar;
- reservation;
- file_processing;
- data_retention.

### parties

Substitui `lenders` como entidade geral.

- id
- legal_name
- trade_name
- document_number
- party_type
- regulatory_identifier
- status
- contact_email
- contact_phone
- metadata JSONB
- created_at, updated_at, version

### accreditations

Substitui `lender_agreements` e inclui produto.

- id
- agreement_id
- party_id
- product_id
- status
- environment
- integration_mode
- operational_limit
- valid_from
- valid_until
- approved_by_user_id
- suspension_reason
- created_at, updated_at, version

Restricao: nao sobrepor credenciamentos ativos para a mesma combinacao e ambiente.

### people e enrollments

`people` substitui `employees` para representar servidor, empregado ou beneficiario.

`people`:

- id, full_name, social_name
- cpf_encrypted, cpf_lookup_hash
- birth_date
- contact fields encrypted when required
- status
- created_at, updated_at, version

`enrollments`:

- id
- agreement_id
- person_id
- enrollment_number
- enrollment_lookup_key
- functional_status
- employment_type
- admission_date, termination_date
- payroll_group, department, cost_center
- base_salary, mandatory_deductions, margin_base
- source_updated_at
- status
- created_at, updated_at, version

Restricao: `agreement_id + enrollment_lookup_key` unico.

## 4. Catalogo de Produtos e Margem

### products

- id
- code
- name
- family
- charge_mode
- requires_credit_contract
- requires_consent
- supports_variable_amount
- status
- created_at, updated_at

### margin_groups

- id
- agreement_id
- code
- name
- calculation_mode
- percentage
- allows_negative
- priority
- status
- valid_from, valid_until
- policy_version_id
- created_at, updated_at, version

### product_agreement_rules

- id
- agreement_id
- product_id
- margin_group_id
- payroll_rubric_id
- min_amount, max_amount
- min_term, max_term
- reservation_ttl_minutes
- first_competency_rule
- cutoff_rule
- field_policy JSONB
- status
- valid_from, valid_until
- policy_version_id
- created_at, updated_at, version

### payroll_rubrics

- id
- agreement_id
- code
- description
- rubric_type
- direction
- status
- valid_from, valid_until
- created_at, updated_at

## 5. Folha e Contas de Margem

### payroll_cycles

- id
- agreement_id
- competency
- cutoff_at
- insertion_due_at
- return_due_at
- status
- policy_version_id
- closed_by_user_id, closed_at
- reopened_by_user_id, reopened_at, reopen_reason
- created_at, updated_at, version

Restricao: uma competencia por convenio.

### payroll_files e payroll_file_rows

`payroll_files`:

- id
- agreement_id
- payroll_cycle_id
- file_type
- direction
- environment
- layout_version_id
- protocol_number
- original_file_name, internal_object_key
- content_hash, size_bytes, media_type
- status
- total_rows, valid_rows, invalid_rows, total_amount
- idempotency_key
- uploaded_by_user_id, processed_by_user_id
- created_at, processed_at

`payroll_file_rows`:

- id
- agreement_id
- payroll_file_id
- row_number
- enrollment_id
- external_reference
- amount
- status
- raw_data JSONB
- normalized_data JSONB
- errors JSONB
- created_at

### payroll_records e payroll_items

Mantem a estrutura V1, adicionando `agreement_id`, `payroll_cycle_id`, `source_file_row_id` e chave unica por matricula/competencia/versao publicada.

### margin_accounts

Saldo corrente por matricula e grupo, usado para controle concorrente.

- id
- agreement_id
- enrollment_id
- margin_group_id
- current_snapshot_id
- total_amount
- consumed_amount
- reserved_amount
- blocked_amount
- available_amount
- status
- lock_version
- updated_at

Restricao: `agreement_id + enrollment_id + margin_group_id` unico.

### margin_snapshots

- id
- agreement_id
- payroll_cycle_id
- enrollment_id
- margin_group_id
- calculation_base
- percentage
- total_amount
- consumed_amount
- reserved_amount
- blocked_amount
- available_amount
- calculation_version
- explanation JSONB
- source_record_id
- status
- published_at
- created_at

Snapshot publicado e imutavel.

### margin_movements

- id
- agreement_id
- margin_account_id
- enrollment_id
- movement_type
- direction
- amount
- balance_before, balance_after
- source_type, source_id
- reversal_of_id
- idempotency_key
- correlation_id
- actor_user_id
- reason
- created_at

Restricoes:

- `agreement_id + idempotency_key` unico;
- movimento nao e atualizado ou apagado;
- estorno cria novo movimento com `reversal_of_id`.

## 6. Operacoes

### reservations

- id
- agreement_id
- enrollment_id
- party_id
- accreditation_id
- product_id
- margin_account_id
- margin_snapshot_id
- operation_type
- requested_amount
- reserved_amount
- installment_amount
- term
- interest_rate, cet_rate
- status
- authorization_grant_id
- idempotency_key
- expires_at, confirmed_at, canceled_at
- created_by_user_id
- created_at, updated_at, version

### credit_contracts

Substitui `contracts` para operacoes de credito.

- id
- agreement_id, enrollment_id, party_id, accreditation_id, product_id
- reservation_id
- contract_number
- operation_type
- principal_amount, financed_amount, net_released_amount
- installment_amount, term, current_installment
- interest_rate, cet_rate, iof_amount, fee_amount, insurance_amount
- first_due_date, last_due_date
- first_payroll_competency, final_payroll_competency
- source_contract_id
- origin_party_id, origin_party_name, origin_debt_amount
- status
- activated_at, suspended_at, settled_at, canceled_at
- settlement_reason, cancellation_reason
- created_by_user_id
- created_at, updated_at, version

Restricao: numero unico por convenio e parte, conforme politica versionada.

### contract_installments

- id
- agreement_id
- credit_contract_id
- installment_number
- due_competency
- expected_amount
- discounted_amount
- outstanding_amount
- status
- last_reconciliation_id
- discounted_at
- created_at, updated_at, version

Restricao: numero de parcela unico no contrato; baixa por competencia e conciliacao idempotente.

### deduction_authorizations

- id
- agreement_id, enrollment_id, party_id, accreditation_id, product_id
- authorization_number
- charge_mode
- fixed_amount, percentage_rate
- percentage_base_type
- start_competency, end_competency
- consent_grant_id
- status
- suspended_at, ended_at, canceled_at
- cancellation_reason
- created_by_user_id
- created_at, updated_at, version

### deduction_charges

- id
- agreement_id
- deduction_authorization_id
- competency
- calculation_base
- expected_amount
- status
- source_reference
- idempotency_key
- created_at, updated_at

Restricao: chave unica por autorizacao, competencia e referencia de origem.

### card_accounts

- id
- agreement_id, enrollment_id, party_id, accreditation_id, product_id
- account_number_masked
- margin_account_id
- granted_limit
- reserved_payroll_margin
- utilized_balance
- available_limit
- status
- opened_at, blocked_at, closed_at
- created_at, updated_at, version

### card_transactions e card_statements

Tabelas especializadas para compras, saques, encargos, pagamentos, estornos, faturas e vencimentos. Nao reutilizam `contract_installments`.

## 7. Insercao e Conciliacao

### payroll_batches

- id
- agreement_id
- payroll_cycle_id
- batch_type
- status
- cutoff_at
- protocol_number
- output_file_id
- total_entries, total_amount
- idempotency_key
- generated_by_user_id, generated_at
- created_at, updated_at, version

### payroll_entries

- id
- agreement_id
- payroll_batch_id
- enrollment_id
- party_id
- product_id
- payroll_rubric_id
- obligation_type
- obligation_id
- competency
- expected_amount
- sequence_number
- status
- eligibility_explanation JSONB
- idempotency_key
- created_at, updated_at

Restricao: uma obrigacao, sequencia e competencia nao entram duas vezes em lote efetivo.

### reconciliations

- id
- agreement_id
- payroll_cycle_id
- return_file_row_id
- payroll_entry_id
- enrollment_id
- result
- expected_amount, returned_amount, applied_amount
- reason_code, reason_description
- idempotency_key
- applied_at
- created_at

Resultados:

- discounted;
- partially_discounted;
- rejected;
- not_discounted;
- unmatched;
- duplicate.

### operational_adjustments

Evolui `payroll_adjustments` com fluxo de dupla aprovacao configuravel, referencia ao movimento original, motivo padronizado e evidencias.

## 8. Identidade, Consentimento e Auditoria

### users, roles, permissions e memberships

`memberships` substitui o escopo opcional de `user_roles`:

- id
- user_id
- role_id
- agreement_id opcional apenas para admin global
- party_id opcional
- status
- valid_from, valid_until
- created_at

Toda consulta operacional deve receber escopo resolvido do backend; nunca confiar em `agreement_id` fornecido livremente pelo frontend.

### authorization_grants

- id
- agreement_id
- person_id, enrollment_id
- purpose
- method
- code_hash opcional
- status
- max_attempts, failed_attempts
- expires_at, used_at
- used_by_user_id, party_id
- correlation_id
- created_at

### audit_events

- id
- agreement_id opcional para evento global
- actor_user_id, actor_role, actor_party_id
- action, outcome
- entity_type, entity_id
- correlation_id, request_id
- previous_data, new_data JSONB
- reason
- ip_address, user_agent
- occurred_at

Aplicacao comum somente insere; politica de banco impede update/delete.

### outbox_events

- id
- agreement_id
- aggregate_type, aggregate_id
- event_type
- payload JSONB
- correlation_id
- occurred_at
- published_at
- attempts
- status

## 9. Indices e Controles Obrigatorios

- indices compostos sempre iniciados por `agreement_id` nas consultas do tenant;
- CPF pesquisavel por hash normalizado, valor completo criptografado;
- `SELECT FOR UPDATE` ou update otimista em `margin_accounts` durante reserva;
- constraints de idempotencia em arquivo, lote, movimento, entrada e conciliacao;
- foreign keys sem `ON DELETE CASCADE` em dados financeiros;
- RLS do PostgreSQL como defesa adicional, depois que o escopo da aplicacao estiver testado;
- particao futura de auditoria e arquivos por data, sem antecipar no primeiro incremento.

## 10. Compatibilidade com o V1

Mapeamentos:

- `employees` -> `people`;
- `lenders` -> `parties`;
- `lender_agreements` -> `accreditations`;
- `lender_product_rates` -> tabela futura `party_product_offers`;
- `contracts` -> `credit_contracts`;
- `authorization_codes` -> `authorization_grants`;
- `payroll_adjustments` -> `operational_adjustments`.

Dados demonstrativos nao serao migrados automaticamente para producao. Uma carga ficticia controlada sera criada para homologacao.

## 11. Ordem de Implementacao

### Incremento 1 - Fundacao segura

- organizations, agreements e policy versions;
- users, roles, permissions e memberships;
- parties e accreditations;
- people e enrollments;
- audit_events e outbox_events.

### Incremento 2 - Margem por arquivo

- payroll_cycles e arquivos;
- records e items;
- products, rubrics, margin groups e rules;
- margin accounts, snapshots e movements.

### Incremento 3 - Emprestimo ponta a ponta

- authorization grants;
- reservations;
- credit contracts e installments;
- batches, entries e reconciliations;
- liquidacao e liberacao de margem.

### Incremento 4 - Produtos ampliados

- card accounts, transactions e statements;
- deduction authorizations e charges;
- regras de compartilhamento de margem;
- conciliacao por familia de produto.
