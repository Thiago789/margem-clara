# Regras de Saldo Devedor - V1

Este documento registra a base para tratar refinanciamento, portabilidade e compra de divida.

## Regra Principal

- Saldo devedor deve ser controlado por contrato.
- Refinanciamento, portabilidade e compra de divida devem apontar para contrato origem.
- Saldo estimado pode apoiar analise, mas operacao real deve guardar saldo formal.
- Saldo formal deve ter fonte, data de emissao, validade e evidencia.

## Fluxos

### Refinanciamento

- Usa contrato existente como origem.
- Recalcula prazo, parcela, saldo e eventual valor liberado.
- Deve registrar contrato substituido ou renegociado.

### Portabilidade

- Migra contrato de outra instituicao.
- Exige banco origem, saldo formal, protocolo e confirmacao.
- Deve controlar status de solicitacao, aceite, liquidacao e novo contrato.

### Compra de Divida

- Quita contrato anterior ou externo.
- Registra credor original, valor de compra, comprovante e novo contrato.

## Campos Minimos

- source_contract_id
- origin_lender_id
- formal_balance_amount
- estimated_balance_amount
- balance_reference_date
- balance_valid_until
- balance_source
- balance_protocol
- payoff_proof_id
- portability_status

## Cuidados

- Nao liquidar contrato origem sem evidencia ou retorno operacional.
- Nao liberar margem antes da confirmacao de quitacao quando o fluxo exigir.
- Auditar qualquer alteracao de saldo, origem ou comprovante.
- Restringir visibilidade por perfil e por instituicao.
