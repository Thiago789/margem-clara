# Regras de Margem por Produto - V1

Este documento registra a decisao de tratar limites por produto de forma configuravel por convenio.

## Produtos Iniciais

- Emprestimo consignado.
- Cartao consignado.
- Cartao beneficio.

## Regra Principal

- Cada produto pode ter percentual, rubrica e politica de margem propria.
- A regra deve ser configuravel por convenio.
- O emprestimo consignado usa a margem principal no MVP.
- Cartao consignado e cartao beneficio podem ter margem separada, compartilhada ou bloqueada conforme convenio.

## Campos Minimos da Regra

- agreement_id
- product_id
- margin_percentage
- payroll_rubric_code
- sharing_mode
- priority
- status
- valid_from
- valid_until

## Modos de Compartilhamento

- separate: produto possui margem propria.
- shared: produto consome a mesma margem de outro grupo.
- blocked: produto nao esta habilitado no convenio.

## Pontos de Atencao

- Consignataria deve operar apenas produtos em que esteja credenciada.
- Arquivo de insercao deve enviar a rubrica correta de cada produto.
- Relatorios devem separar consumo por produto.
- Mudanca de percentual deve preservar historico por competencia.
