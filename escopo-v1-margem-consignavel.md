# Sistema de Gestao de Margem Consignavel - Escopo V1

## 1. Visao do Produto

O sistema tera como objetivo controlar a margem consignavel de servidores, empregados ou beneficiarios vinculados a convenios, permitindo que gestores, consignatarias e consignados acompanhem contratos, reservas, simulacoes e historico de movimentacoes.

A primeira versao deve ser mais enxuta que plataformas consolidadas como eConsig, Consignet, Neo Consig, Safe Consig, Consiglog e similares, mas deve se diferenciar pela clareza do calculo, rastreabilidade das operacoes, suporte operacional e experiencia simples para o usuario final.

## 2. Objetivos da V1

- Controlar a base cadastral de convenios, servidores, matriculas e consignatarias.
- Importar dados de folha por arquivo.
- Calcular margem consignavel com regras parametrizaveis.
- Permitir consulta de margem com explicacao detalhada do calculo.
- Permitir reserva, confirmacao, averbacao, cancelamento e liquidacao de contratos.
- Registrar historico completo de margem e operacoes.
- Permitir simulacao de emprestimo e ranking de taxas.
- Disponibilizar paineis separados para gestor/RH, consignataria e servidor.
- Manter trilha de auditoria para todas as alteracoes relevantes.

## 3. Perfis de Usuario

### 3.1 Administrador do Sistema

Responsavel por configurar a plataforma.

Permissoes principais:
- Gerenciar usuarios e perfis.
- Cadastrar convenios.
- Cadastrar regras globais.
- Configurar parametros de seguranca.
- Acessar logs de auditoria.

### 3.2 Gestor / RH

Responsavel pela gestao do convenio e controle da folha.

Permissoes principais:
- Cadastrar e atualizar servidores.
- Importar arquivo de folha.
- Consultar margem de servidores.
- Validar contratos e reservas.
- Cancelar, suspender ou liberar margem.
- Acompanhar inconsistencias.
- Gerar relatorios operacionais.

### 3.3 Consignataria / Banco

Responsavel pela oferta e operacao de contratos consignados.

Permissoes principais:
- Consultar margem mediante autorizacao.
- Simular operacoes.
- Solicitar reserva de margem.
- Confirmar contratos.
- Consultar seus proprios contratos.
- Cancelar solicitacoes pendentes.
- Acompanhar status das operacoes.
- Cadastrar taxas por produto e prazo.

### 3.4 Servidor / Consignado

Usuario final dono da margem.

Permissoes principais:
- Consultar margem total, utilizada, reservada e disponivel.
- Visualizar explicacao do calculo da margem.
- Consultar contratos ativos, quitados, cancelados e suspensos.
- Ver historico de descontos.
- Simular emprestimos.
- Comparar ranking de taxas.
- Gerar codigo de autorizacao para operacoes.
- Abrir solicitacao de suporte ou contestacao de margem.

## 4. Modulos da V1

### 4.1 Cadastros Basicos

Entidades:
- Convenios/orgaos/empregadores.
- Servidores/consignados.
- Matriculas ou beneficios.
- Consignatarias.
- Produtos consignaveis.
- Verbas de folha.
- Regras de margem.
- Usuarios e perfis.

Requisitos:
- Um servidor pode ter mais de uma matricula.
- Cada matricula pertence a um convenio.
- Cada convenio pode ter regras proprias de margem.
- Cada consignataria pode operar apenas nos convenios em que estiver habilitada.

### 4.2 Importacao de Folha

Entrada inicial:
- Arquivo CSV ou XLSX.

Campos minimos:
- CPF.
- Nome.
- Matricula.
- Convenio.
- Situacao funcional.
- Renda base.
- Verbas positivas.
- Descontos obrigatorios.
- Competencia da folha.

Funcionalidades:
- Upload de arquivo.
- Validacao de layout.
- Pre-visualizacao dos registros.
- Identificacao de erros.
- Processamento da competencia.
- Geracao de log de importacao.
- Recalculo automatico da margem apos importacao.

### 4.3 Motor de Calculo de Margem

Formula base:

```text
margem_total = base_calculo * percentual_margem
margem_disponivel = margem_total - contratos_ativos - reservas_pendentes - bloqueios
```

O sistema deve guardar o detalhamento do calculo:
- Competencia usada.
- Base de calculo.
- Percentual aplicado.
- Verbas consideradas.
- Verbas excluidas.
- Contratos ativos.
- Reservas pendentes.
- Bloqueios manuais ou judiciais.
- Resultado final.

Estados possiveis da margem:
- Disponivel.
- Reservada.
- Averbada.
- Bloqueada.
- Negativa.
- Em revisao.

### 4.4 Consulta de Margem Explicada

Tela central do sistema.

Deve exibir:
- Margem total.
- Margem utilizada.
- Margem reservada.
- Margem bloqueada.
- Margem disponivel.
- Grafico simples de composicao.
- Detalhamento do calculo.
- Contratos que consomem margem.
- Historico da margem por competencia.
- Botao para contestacao de margem.

Diferencial da V1:
- O usuario deve entender por que a margem tem aquele valor.
- Em caso de margem negativa, o sistema deve mostrar a causa provavel.

### 4.5 Contratos Consignados

Dados minimos:
- Servidor.
- Matricula.
- Convenio.
- Consignataria.
- Produto.
- Valor contratado.
- Valor da parcela.
- Quantidade de parcelas.
- Parcela atual.
- Taxa de juros.
- CET, quando informado.
- Data de inicio.
- Data prevista de fim.
- Status.

Status principais:
- Simulado.
- Reservado.
- Aguardando confirmacao.
- Averbado.
- Enviado para folha.
- Descontando.
- Quitado.
- Cancelado.
- Suspenso.
- Liquidado.
- Recusado.

### 4.6 Reserva e Averbacao

Fluxo padrao:

```text
simulacao -> reserva de margem -> autorizacao do servidor -> confirmacao da consignataria -> averbacao -> envio para folha -> desconto confirmado
```

Regras:
- Reserva so pode ocorrer se houver margem disponivel.
- Reserva deve ter prazo de expiracao.
- Reserva expirada libera margem automaticamente.
- Confirmacao exige codigo de autorizacao do servidor ou validacao equivalente.
- Averbacao reduz a margem disponivel.
- Cancelamento de reserva libera margem imediatamente.

### 4.7 Simulacao e Ranking de Taxas

O servidor ou consignataria podera informar:
- Valor desejado.
- Valor maximo de parcela.
- Prazo.
- Produto.

O sistema deve retornar:
- Consignatarias habilitadas.
- Taxa de juros.
- CET, quando disponivel.
- Valor estimado da parcela.
- Valor total estimado.
- Indicacao se cabe na margem.

Ordenacao padrao:
- Menor taxa.
- Menor CET.
- Menor valor total.

### 4.8 Codigo de Autorizacao

O servidor podera gerar um codigo temporario para autorizar operacoes.

Regras:
- Codigo unico.
- Prazo de validade configuravel.
- Uso unico.
- Vinculado ao servidor, matricula e tipo de operacao.
- Registro em auditoria.

Usos na V1:
- Autorizar consulta de margem por consignataria.
- Autorizar reserva de margem.
- Autorizar confirmacao de contrato.

### 4.9 Suporte e Contestacao de Margem

Funcionalidades:
- Abrir ticket vinculado a servidor, matricula, contrato ou margem.
- Informar tipo da solicitacao.
- Anexar arquivo.
- Registrar mensagens entre servidor, RH e consignataria.
- Controlar status e prazo.

Tipos iniciais:
- Contestacao de margem.
- Duvida sobre contrato.
- Contrato desconhecido.
- Erro de desconto.
- Solicitacao de cancelamento.
- Problema de acesso.

### 4.10 Auditoria

Eventos auditados:
- Login e logout.
- Criacao, alteracao e bloqueio de usuario.
- Importacao de folha.
- Recalculo de margem.
- Consulta de margem por consignataria.
- Geracao e uso de codigo de autorizacao.
- Reserva, confirmacao, averbacao e cancelamento.
- Alteracao de contrato.
- Abertura e resposta de ticket.

Dados minimos:
- Data e hora.
- Usuario.
- Perfil.
- IP, quando disponivel.
- Entidade afetada.
- Valor anterior.
- Valor novo.
- Motivo informado.

## 5. Telas Principais

### 5.1 Painel do Gestor/RH

Componentes:
- Indicadores de servidores ativos.
- Total de margem disponivel no convenio.
- Total de margem utilizada.
- Reservas pendentes.
- Contratos aguardando folha.
- Inconsistencias da ultima importacao.
- Tickets abertos.

### 5.2 Servidores

Funcionalidades:
- Listagem com filtros.
- Cadastro/edicao.
- Visualizacao de matriculas.
- Consulta de margem.
- Contratos vinculados.
- Historico de alteracoes.

### 5.3 Importacao de Folha

Etapas:
- Selecionar arquivo.
- Validar layout.
- Pre-visualizar dados.
- Corrigir erros ou rejeitar linhas invalidas.
- Processar competencia.
- Ver resumo do processamento.

### 5.4 Margem do Servidor

Componentes:
- Cartoes de margem total, usada, reservada e disponivel.
- Detalhamento do calculo.
- Linha do tempo da margem.
- Contratos ativos.
- Reservas pendentes.
- Botao de contestacao.

### 5.5 Contratos

Funcionalidades:
- Listagem por status.
- Criacao de contrato a partir de reserva.
- Visualizacao de detalhes.
- Historico de parcelas/descontos.
- Anexos.
- Cancelamento, suspensao ou liquidacao conforme permissao.

### 5.6 Portal do Servidor

Componentes:
- Resumo da margem.
- Meus contratos.
- Historico de descontos.
- Simulador.
- Ranking de taxas.
- Codigo de autorizacao.
- Suporte/contestacao.

### 5.7 Portal da Consignataria

Componentes:
- Consulta autorizada de margem.
- Simulador.
- Solicitar reserva.
- Confirmar contrato.
- Meus contratos.
- Taxas cadastradas.
- Pendencias operacionais.

## 6. Modelo Inicial de Dados

Tabelas sugeridas:

- users
- roles
- permissions
- organizations
- agreements
- employees
- enrollments
- payroll_imports
- payroll_records
- payroll_earnings
- payroll_deductions
- margin_rules
- margin_snapshots
- margin_movements
- lenders
- lender_agreements
- products
- lender_product_rates
- authorization_codes
- simulations
- contracts
- contract_installments
- reservations
- tickets
- ticket_messages
- attachments
- audit_logs

## 7. Regras de Negocio Essenciais

- A margem deve ser sempre calculada por matricula/beneficio, nao apenas por CPF.
- Um CPF pode ter multiplas matriculas.
- Contratos devem consumir margem somente da matricula vinculada.
- Reserva pendente deve reduzir margem disponivel ate expirar ou ser cancelada.
- Contrato cancelado deve liberar parcelas futuras.
- Contrato liquidado deve liberar a margem remanescente.
- Importacao de nova competencia deve gerar novo snapshot de margem.
- Toda mudanca de margem deve gerar movimento historico.
- Consignataria so pode visualizar contratos proprios.
- Gestor/RH pode visualizar todos os contratos do convenio.
- Servidor so pode visualizar seus proprios dados.

## 8. Relatorios da V1

- Servidores por convenio.
- Margem por servidor.
- Margens negativas.
- Contratos ativos por consignataria.
- Reservas pendentes e expiradas.
- Movimentacao por competencia.
- Inconsistencias da folha.
- Auditoria por usuario.
- Tickets por status.

## 9. Fora do Escopo da V1

- Portabilidade completa.
- Saldo devedor formal com prazos regulados.
- Integracao CNAB/FEBRABAN.
- API SOAP/XML.
- Totem.
- Leilao reverso.
- Gestao de beneficio de saude.
- Financiamento de divida de cartao.
- Gerador avancado de relatorios por SQL.
- Aplicativo nativo Android/iOS.

## 10. Roadmap Sugerido

### V1 - Nucleo Operacional

- Cadastros.
- Importacao de folha.
- Calculo de margem.
- Consulta explicada.
- Reserva e contrato.
- Simulacao e ranking.
- Auditoria.
- Portal web responsivo.

### V2 - Operacao Avancada

- Portabilidade.
- Saldo devedor.
- Conciliacao de retorno da folha.
- Regras avancadas por verba.
- Notificacoes.
- SLA de atendimento.

### V3 - Integracoes e Escala

- APIs externas.
- CNAB/FEBRABAN.
- Integracoes diretas com sistemas de folha.
- BI gerencial.
- Aplicativo mobile nativo.

## 11. Principio Central do Produto

O sistema deve ser desenhado para responder rapidamente tres perguntas:

1. Qual e a margem disponivel?
2. Por que esse e o valor da margem?
3. Quem fez cada operacao que alterou essa margem?

Esse principio deve orientar a interface, o banco de dados, os relatorios e a auditoria.
