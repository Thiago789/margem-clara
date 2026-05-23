# Regras de Matricula e Vinculo - V1

Este documento registra a decisao de tratar a margem por matricula/vinculo, e nao apenas por CPF.

## Regra Principal

- A margem deve ser calculada por matricula, beneficio ou vinculo funcional.
- Um servidor pode ter mais de uma matricula ativa.
- Cada matricula pode pertencer a convenio, folha, regra de margem e status funcional diferentes.
- Contrato, reserva, simulacao, autorizacao e retorno de folha devem apontar para a matricula correta.

## Motivo

Controlar apenas por CPF pode causar erro operacional quando o mesmo servidor possui mais de um vinculo. O risco principal e consumir ou liberar margem no vinculo errado.

## Campos Minimos do Vinculo

- employee_id
- agreement_id
- enrollment_number
- functional_status
- base_salary
- mandatory_deductions
- margin_base
- status

## Regras Operacionais

- Consignataria deve operar apenas a matricula autorizada.
- Portal do servidor deve permitir alternar entre matriculas quando houver mais de uma.
- Arquivo de margem deve identificar a matricula de forma unica dentro do convenio.
- Arquivo de insercao deve enviar a matricula vinculada ao contrato.
- Arquivo retorno deve atualizar apenas contrato e matricula correspondentes.

## Riscos Evitados

- Misturar contratos de convenios diferentes.
- Liberar margem em matricula incorreta.
- Permitir consulta de margem alem da autorizacao concedida.
- Calcular margem com base salarial de outro vinculo.
