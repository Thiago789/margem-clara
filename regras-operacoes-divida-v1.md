# Regras de Operacoes de Divida - V1

Este documento complementa as regras de saldo devedor com a esteira operacional de refinanciamento, portabilidade e compra de divida.

## Estados Sugeridos

- Aguardando saldo formal.
- Saldo solicitado.
- Saldo recebido.
- Aguardando aceite.
- Aguardando comprovante.
- Quitado na origem.
- Novo contrato gerado.
- Recusado.
- Cancelado.

## Refinanciamento

- Deve comparar contrato origem e nova proposta.
- Deve registrar saldo formal, nova parcela, novo prazo, taxa, CET e valor liberado.
- So deve liquidar ou substituir contrato origem conforme regra do convenio e retorno operacional.

## Portabilidade

- Deve registrar banco origem, protocolo, saldo formal e aceite.
- Deve impedir duplicidade de margem durante a transicao.
- Deve controlar etapas ate a confirmacao do novo contrato.

## Compra de Divida

- Deve registrar credor original, valor de compra, comprovante de quitacao e novo contrato.
- Nao deve liberar margem sem evidencia de quitacao quando o fluxo exigir.

## Bloqueios

- Instituicao nao credenciada para produto/convenio.
- Saldo formal vencido.
- Ausencia de comprovante exigido.
- Competencia fechada sem ajuste auditado.
- Contrato origem inexistente ou divergente da matricula.
