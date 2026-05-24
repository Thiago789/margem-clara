# Regras de Contrato, Produto e Folha - V1

Este documento registra as regras iniciais para data de corte, evolucao de parcelas, liquidacao automatica, tipos de contrato e produtos principais do Margem Clara.

## Data de Corte

- Cada convenio deve configurar uma data de corte da competencia.
- Ao gerar o arquivo de insercao, entram apenas reservas criadas dentro da janela permitida.
- Reservas criadas apos a data de corte ficam para a proxima competencia ou exigem decisao operacional explicita.
- A competencia da folha deve ser configuravel por convenio para evitar usar apenas a data atual do sistema.
- O arquivo de insercao deve registrar a competencia configurada e nao somente o mes corrente do computador.
- Em versoes futuras, a regra deve considerar feriados, fim de semana e calendario proprio do convenio.

## Evolucao de Parcelas

- Todo contrato deve guardar prazo total e parcela atual.
- A parcela atual so avanca quando o arquivo retorno confirma desconto em folha.
- Retorno rejeitado, nao descontado ou pendente nao deve evoluir parcela automaticamente.
- Quando a parcela atual atingir o prazo total, o contrato deve mudar para Liquidado.
- Contrato liquidado deve liberar margem e gerar evento de auditoria.
- Cada desconto confirmado deve ser registrado por competencia.
- O mesmo contrato nao pode evoluir duas vezes a parcela para a mesma competencia.
- Reprocessamento do mesmo retorno deve ser identificado como duplicidade e manter trilha de auditoria.

## Tipos de Contrato

- Novo: consome nova margem disponivel.
- Refinanciamento: recalcula contrato existente e pode alterar parcela, prazo e valor liberado.
- Portabilidade: migra contrato de outra instituicao, exigindo banco origem, saldo e etapa de confirmacao.
- Compra de divida: quita divida anterior e cria novo contrato, exigindo credor original, valor de compra e comprovantes.

## Produtos Principais

- Emprestimo consignado: parcela fixa mensal, prazo definido e margem principal.
- Cartao consignado: produto com rubrica propria e limite separado conforme convenio.
- Cartao beneficio: produto com margem/rubrica propria conforme regra local.

## Campos Recomendados em Contrato

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
- origin_lender_id
- debt_purchase_amount
- portability_status
- liquidation_reason
- installment_history
- return_file_id
- return_competency

## Decisoes Pendentes

- Definir se data de corte sera por convenio, por folha ou por produto.
- Definir se cartao consignado e cartao beneficio terao margens independentes ou compartilhadas.
- Definir como refinanciamento substitui contrato anterior no calculo de margem.
- Definir documentos e comprovantes obrigatorios para portabilidade e compra de divida.
