# Backlog V1 - Sistema de Gestao de Margem Consignavel

Este backlog organiza a primeira versao em epicos, historias e criterios de aceite. A ordem sugerida prioriza construir primeiro o nucleo confiavel: cadastros, folha, margem, reserva, contrato e auditoria.

## Epico 1 - Fundacao do Sistema

### Historia 1.1 - Configurar projeto base

Como administrador tecnico, quero uma aplicacao web com backend, frontend e banco configurados para iniciar o desenvolvimento da V1.

Criterios de aceite:
- Projeto backend criado.
- Projeto frontend criado.
- Banco PostgreSQL configurado.
- Variaveis de ambiente documentadas.
- Script de inicializacao disponivel.
- Health check da API funcionando.

### Historia 1.2 - Autenticacao de usuarios

Como usuario, quero acessar o sistema com login e senha para visualizar apenas as funcionalidades permitidas ao meu perfil.

Criterios de aceite:
- Login com email ou CPF.
- Senha armazenada com hash seguro.
- Sessao via token.
- Logout.
- Bloqueio de usuario inativo.
- Registro de login em auditoria.

### Historia 1.3 - Controle de perfis

Como administrador, quero definir perfis de acesso para separar administradores, gestores, consignatarias e servidores.

Criterios de aceite:
- Perfis iniciais cadastrados.
- Usuario pode ter mais de um perfil.
- Perfil pode ser restrito a convenio e/ou consignataria.
- Rotas protegidas por permissao.

## Epico 2 - Cadastros Operacionais

### Historia 2.1 - Cadastro de organizacoes e convenios

Como administrador, quero cadastrar organizacoes e convenios para estruturar a operacao por cliente.

Criterios de aceite:
- Criar, editar, listar e inativar organizacoes.
- Criar, editar, listar e inativar convenios.
- Convenio deve pertencer a uma organizacao.
- Nao permitir codigos duplicados no mesmo contexto.

### Historia 2.2 - Cadastro de servidores e matriculas

Como gestor/RH, quero cadastrar servidores e suas matriculas para controlar a margem por vinculo.

Criterios de aceite:
- Criar e editar servidor.
- Validar CPF.
- Criar mais de uma matricula para o mesmo CPF.
- Matricula deve pertencer a um convenio.
- Consultar servidor por nome, CPF ou matricula.

### Historia 2.3 - Cadastro de consignatarias

Como administrador, quero cadastrar consignatarias e habilita-las por convenio.

Criterios de aceite:
- Criar, editar, listar e inativar consignatarias.
- Vincular consignataria a convenio.
- Bloquear operacao de consignataria nao habilitada no convenio.

### Historia 2.4 - Cadastro de produtos e regras de margem

Como administrador, quero configurar produtos e regras de margem para cada convenio.

Criterios de aceite:
- Criar produtos consignaveis.
- Definir percentual de margem por convenio/produto.
- Definir limites de prazo e valor de parcela.
- Definir vigencia da regra.
- Impedir duas regras ativas conflitantes para o mesmo convenio/produto.

## Epico 3 - Importacao de Folha

### Historia 3.1 - Upload de arquivo de folha

Como gestor/RH, quero enviar arquivo CSV ou XLSX de folha para atualizar dados dos servidores.

Criterios de aceite:
- Upload de CSV.
- Upload de XLSX.
- Registro da importacao com status.
- Armazenar nome do arquivo e hash.
- Rejeitar arquivo vazio ou formato invalido.

### Historia 3.2 - Validacao de layout

Como gestor/RH, quero validar o arquivo antes de processar para corrigir erros sem afetar a base.

Criterios de aceite:
- Validar colunas obrigatorias.
- Validar CPF, matricula, competencia e valores numericos.
- Exibir linhas validas e invalidas.
- Permitir cancelar importacao antes do processamento.

### Historia 3.3 - Processamento de competencia

Como gestor/RH, quero processar uma competencia para atualizar renda, situacao funcional e base de calculo.

Criterios de aceite:
- Criar payroll_records.
- Criar payroll_items quando houver detalhe de verbas.
- Atualizar dados basicos da matricula quando permitido.
- Gerar resumo de processamento.
- Registrar evento em auditoria.

## Epico 4 - Motor de Margem

### Historia 4.1 - Calcular margem por matricula

Como sistema, quero calcular a margem de cada matricula processada para manter saldo disponivel atualizado.

Criterios de aceite:
- Calcular margem total.
- Calcular margem usada por contratos ativos.
- Calcular margem reservada.
- Calcular margem bloqueada.
- Calcular margem disponivel.
- Criar margin_snapshot por competencia.

### Historia 4.2 - Explicar calculo de margem

Como servidor ou gestor, quero entender como a margem foi calculada.

Criterios de aceite:
- Exibir base de calculo.
- Exibir percentual aplicado.
- Exibir verbas consideradas e excluidas.
- Exibir contratos que consomem margem.
- Exibir reservas pendentes.
- Exibir motivo de margem negativa quando existir.

### Historia 4.3 - Historico de movimentos de margem

Como gestor, quero ver tudo que alterou a margem de uma matricula.

Criterios de aceite:
- Registrar movimento em importacao de folha.
- Registrar movimento em reserva criada, cancelada ou expirada.
- Registrar movimento em contrato confirmado, cancelado ou liquidado.
- Exibir linha do tempo por data.

## Epico 5 - Portal do Gestor/RH

### Historia 5.1 - Dashboard do gestor

Como gestor/RH, quero ver um painel operacional do convenio.

Criterios de aceite:
- Total de servidores ativos.
- Total de margem calculada.
- Total de margem usada.
- Total de reservas pendentes.
- Contratos aguardando acao.
- Tickets abertos.
- Erros da ultima importacao.

### Historia 5.2 - Consulta de margem do servidor

Como gestor/RH, quero consultar a margem detalhada de uma matricula.

Criterios de aceite:
- Buscar por CPF, nome ou matricula.
- Exibir margem total, usada, reservada, bloqueada e disponivel.
- Exibir contratos ativos.
- Exibir historico da margem.
- Abrir contestacao ou anotacao interna.

## Epico 6 - Portal da Consignataria

### Historia 6.1 - Consulta autorizada de margem

Como consignataria, quero consultar margem mediante autorizacao do servidor.

Criterios de aceite:
- Informar CPF, matricula e codigo de autorizacao.
- Validar codigo ativo, finalidade e validade.
- Exibir apenas dados necessarios para operacao.
- Registrar consulta em auditoria.

### Historia 6.2 - Cadastro de taxas

Como consignataria, quero cadastrar taxas por produto e prazo para aparecer no ranking.

Criterios de aceite:
- Cadastrar taxa por convenio, produto e faixa de prazo.
- Informar taxa de juros.
- Informar CET quando disponivel.
- Definir vigencia.
- Inativar taxa.

### Historia 6.3 - Solicitar reserva de margem

Como consignataria, quero reservar margem para uma operacao aprovada pelo servidor.

Criterios de aceite:
- Validar margem disponivel.
- Validar produto e prazo permitidos.
- Validar consignataria habilitada no convenio.
- Criar reserva com expiracao.
- Reduzir margem disponivel enquanto a reserva estiver ativa.

### Historia 6.4 - Confirmar contrato

Como consignataria, quero converter uma reserva em contrato.

Criterios de aceite:
- Confirmar reserva ativa.
- Criar contrato.
- Atualizar status da reserva.
- Registrar movimento de margem.
- Registrar evento em auditoria.

## Epico 7 - Portal do Servidor

### Historia 7.1 - Resumo de margem

Como servidor, quero visualizar minha margem de forma simples e explicada.

Criterios de aceite:
- Exibir todas as matriculas do servidor.
- Exibir resumo por matricula.
- Exibir margem total, usada, reservada e disponivel.
- Exibir explicacao do calculo.
- Mostrar alerta quando margem estiver negativa.

### Historia 7.2 - Meus contratos

Como servidor, quero ver meus contratos e descontos.

Criterios de aceite:
- Listar contratos ativos, quitados, cancelados e suspensos.
- Exibir detalhe do contrato.
- Exibir historico de parcelas.
- Exibir consignataria e produto.

### Historia 7.3 - Gerar codigo de autorizacao

Como servidor, quero gerar um codigo temporario para autorizar operacoes.

Criterios de aceite:
- Escolher finalidade do codigo.
- Gerar codigo com validade.
- Exibir codigo uma unica vez.
- Permitir cancelar codigo ativo.
- Registrar geracao e uso em auditoria.

### Historia 7.4 - Simular emprestimo

Como servidor, quero simular emprestimo e comparar opcoes.

Criterios de aceite:
- Informar valor desejado ou valor de parcela.
- Informar prazo.
- Listar consignatarias habilitadas.
- Ordenar por menor taxa/CET.
- Indicar se a simulacao cabe na margem.
- Permitir selecionar uma opcao para iniciar solicitacao.

## Epico 8 - Contratos e Operacoes

### Historia 8.1 - Gerir contratos

Como gestor/RH ou consignataria, quero acompanhar contratos por status.

Criterios de aceite:
- Listagem com filtros por status, convenio, consignataria, servidor e competencia.
- Detalhe do contrato.
- Historico de eventos.
- Anexos.

### Historia 8.2 - Cancelar contrato

Como usuario autorizado, quero cancelar contrato para interromper descontos futuros.

Criterios de aceite:
- Exigir motivo.
- Atualizar status do contrato.
- Liberar margem futura quando aplicavel.
- Registrar auditoria.

### Historia 8.3 - Liquidar contrato

Como usuario autorizado, quero liquidar contrato para liberar a margem remanescente.

Criterios de aceite:
- Exigir motivo.
- Atualizar status para liquidado.
- Cancelar parcelas futuras.
- Liberar margem.
- Registrar auditoria.

## Epico 9 - Suporte e Contestacao

### Historia 9.1 - Abrir ticket

Como servidor, quero abrir uma contestacao ou solicitacao de suporte.

Criterios de aceite:
- Selecionar tipo de ticket.
- Vincular matricula e, opcionalmente, contrato.
- Escrever descricao.
- Anexar arquivo.
- Receber numero do protocolo.

### Historia 9.2 - Responder ticket

Como gestor/RH ou consignataria, quero responder tickets vinculados a minha responsabilidade.

Criterios de aceite:
- Listar tickets por status.
- Responder mensagem.
- Alterar responsavel.
- Alterar status.
- Registrar historico.

## Epico 10 - Auditoria e Relatorios

### Historia 10.1 - Auditoria operacional

Como administrador ou gestor, quero consultar logs de auditoria.

Criterios de aceite:
- Filtrar por usuario, acao, entidade e periodo.
- Visualizar dados anteriores e novos.
- Exportar resultado em CSV.

### Historia 10.2 - Relatorios da V1

Como gestor/RH, quero extrair relatorios essenciais da operacao.

Criterios de aceite:
- Relatorio de servidores por convenio.
- Relatorio de margem por servidor.
- Relatorio de margens negativas.
- Relatorio de contratos ativos por consignataria.
- Relatorio de reservas pendentes.
- Relatorio de tickets por status.

## Ordem Recomendada de Implementacao

1. Fundacao do sistema.
2. Cadastros operacionais.
3. Importacao de folha.
4. Motor de calculo de margem.
5. Consulta de margem explicada.
6. Reserva de margem.
7. Contratos.
8. Portal do servidor.
9. Portal da consignataria.
10. Suporte, auditoria e relatorios.

## Marco de MVP

O MVP sera considerado pronto quando for possivel:

1. Cadastrar convenio, servidor, matricula e consignataria.
2. Importar uma folha CSV.
3. Calcular margem por matricula.
4. Consultar margem explicada.
5. Gerar codigo de autorizacao.
6. Criar reserva de margem.
7. Converter reserva em contrato.
8. Visualizar contrato no portal do servidor.
9. Registrar auditoria das operacoes.
