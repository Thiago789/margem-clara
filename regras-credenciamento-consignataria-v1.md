# Regras de Credenciamento de Consignataria - V1

Este documento registra a regra de que consignatarias devem ser habilitadas por convenio e produto.

## Regra Principal

- Consignataria so pode operar em convenio onde esteja credenciada.
- Credenciamento deve indicar quais produtos a instituicao pode operar.
- Produto nao credenciado deve bloquear simulacao, reserva e contrato.
- Instituicao em homologacao nao deve gerar arquivo real para folha.

## Campos Minimos

- lender_id
- agreement_id
- product_id
- status
- integration_mode
- valid_from
- valid_until
- operational_limit
- homologation_status

## Status Sugeridos

- active
- homologation
- suspended
- expired
- pending_contract

## Controles

- Registrar vigencia do credenciamento.
- Registrar canal operacional permitido: API, arquivo ou manual supervisionado.
- Auditar inclusao, suspensao e remocao de produto.
- Restringir visibilidade da consignataria aos produtos e contratos proprios.

## Riscos Evitados

- Instituicao operar produto sem autorizacao.
- Produto em teste entrar no arquivo real de folha.
- Consignataria consultar margem de produto/convenio indevido.
- Perder historico de quem liberou determinado produto.
