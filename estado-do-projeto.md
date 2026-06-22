# Estado do Projeto - Margem Clara

Atualizado em: 2026-06-21

## Objetivo

Construir um MVP de sistema de gestao de margem consignavel para validar fluxo operacional, regras de negocio e experiencia de uso antes da versao com backend, banco de dados, autenticacao real e integracoes.

## URL e Repositorio

- GitHub Pages: https://thiago789.github.io/margem-clara/
- Repositorio: Thiago789/margem-clara
- Publicacao atual: MVP estatico no GitHub Pages.

## Estado Atual

O MVP ja possui uma base navegavel com:

- painel operacional;
- servidores e matriculas;
- margem explicada;
- contratos e reservas;
- tipos de contrato: novo, refinanciamento, portabilidade e compra de divida;
- produtos principais: emprestimo consignado, cartao consignado e cartao beneficio;
- fluxo de arquivos: arquivo de margem, arquivo de insercao e arquivo retorno;
- competencia da folha e data de corte configuravel;
- evolucao de parcelas por retorno confirmado;
- liquidacao automatica ao fim do prazo;
- auditoria de eventos;
- perfis de acesso conceituais;
- consignatarias, produtos, rubricas e credenciamento;
- integracoes/API em nivel conceitual;
- validacao/autenticidade do servidor em nivel de MVP;
- assistente/insights em nivel conceitual;
- catalogo e politica de campos do contrato.

## Regras de Negocio Ja Decididas

- A margem deve ser controlada por matricula/vinculo, nao apenas por CPF.
- O arquivo de margem vem do sistema de folha do convenio e alimenta a base de servidores, renda e descontos.
- O arquivo de insercao e gerado pelo sistema de margem com os descontos que devem entrar na folha.
- O arquivo retorno informa o que foi descontado, rejeitado ou nao descontado, com motivo.
- A parcela atual do contrato so deve avancar quando o retorno confirmar desconto.
- Rejeicao, pendencia ou ausencia de desconto nao deve liquidar parcela automaticamente.
- Ao atingir o prazo final, o contrato deve liquidar e liberar margem.
- Data de corte define quais reservas/contratos entram no arquivo de insercao da competencia.
- Codigo/senha para reserva deve ser configuravel por convenio.
- Alguns convenios podem permitir reserva imediata sem codigo.
- Taxa, CET e primeira competencia sao obrigatorios iniciais no MVP.
- Valor contratado e primeiro vencimento podem ser configuraveis por convenio.
- Refinanciamento exige contrato origem.
- Portabilidade exige contrato origem e banco/credor origem.
- Compra de divida exige banco/credor origem e valor de compra/saldo.
- O arquivo de insercao deve exportar tambem os campos financeiros e operacionais ja capturados na reserva.
- O arquivo retorno deve bloquear qualquer segunda leitura do mesmo contrato na mesma competencia; reprocessamento exige ajuste formal.
- Retorno marcado como descontado, mas com valor diferente da parcela esperada, deve virar pendencia de ajuste e nao deve avancar parcela automaticamente.
- Pendencia de retorno deve permitir decisao formal auditada: aceitar diferenca, reenviar para proxima insercao, cancelar/liberar margem ou manter pendente.
- Reserva/contrato deve ficar vinculado a uma matricula especifica; a margem e o arquivo de insercao devem usar essa matricula, nao apenas o CPF ou a matricula principal do servidor.
- Reserva deve ser bloqueada quando a matricula escolhida estiver inativa, em revisao ou sem margem disponivel.
- Contrato deve ter linha do tempo operacional visivel, reunindo reserva, envio para folha, retornos, ajustes, cancelamento e liquidacao.
- Ultimo arquivo retorno processado deve manter conciliacao detalhada com linhas conciliadas, divergentes, duplicadas, pendentes e nao localizadas.
- O fluxo piloto deve funcionar como central de jornada operacional, mostrando progresso do ciclo, proxima acao e atalhos para os modulos principais, para reduzir a sensacao de telas soltas.
- A homologacao do MVP deve destacar a proxima pendencia de aceite e validar tambem matricula/vinculo, campos financeiros do contrato, conciliacao de retorno e rastreabilidade.
- A tela de permissoes deve comparar a cobertura real de modulos por perfil e evidenciar quais modulos sensiveis ficam restritos ao gestor.
- Arquivo retorno com campo obrigatorio ausente, status desconhecido ou valor invalido deve ser bloqueado antes de alterar contratos; divergencias, duplicidades e contratos nao localizados devem aparecer na validacao da competencia.
- Arquivo de insercao deve passar por validacao final antes de sair para a folha, bloqueando contrato duplicado, campo obrigatorio ausente, matricula invalida, parcela/prazo invalidos, rubrica divergente e margem negativa apos reserva.
- Arquivo de margem deve ser validado antes de atualizar a base, bloqueando cabecalho/campo obrigatorio ausente, CPF ou matricula duplicados, renda invalida, desconto acima da renda e status funcional desconhecido.
- Layouts de margem, insercao e retorno devem ter versao por competencia e status de homologacao, para evitar misturar arquivos de convenios ou layouts diferentes.
- Protocolos de remessa devem refletir as validacoes reais de margem, insercao e retorno, incluindo linhas, erros criticos, alertas, layout, competencia e status operacional.
- Prontidao V1 deve ser calculada a partir do estado real do MVP, usando validacoes, homologacao, protocolos, permissoes, contratos, auditoria e integracoes mapeadas.
- Painel inicial do gestor deve exibir um cockpit operacional com proxima acao do fluxo piloto, fila de pendencias e prontidao V1.
- Atalhos para modulos inexistentes ou indisponiveis por perfil devem ser redirecionados com registro de auditoria, evitando queda silenciosa no painel.
- Massa de teste deve incluir roteiro de apresentacao com etapas marcaveis e atalhos para os modulos, facilitando demonstracao do MVP para terceiros.
- Cenarios de massa de teste devem preencher tambem validacoes, protocolos, conciliacao de retorno e prontidao, para que a demonstracao reflita o fluxo operacional completo.
- A tela de competencias deve evidenciar saldo de parcelas, contratos proximos da liquidacao e pendencias de retorno, pois a baixa de parcela depende de retorno confirmado.
- O consumo de margem deve usar uma regra central de status: descontando/averbado/enviado consomem, reservado bloqueia reserva, e liquidado/cancelado/rejeitado liberam a margem.
- Status de retorno com pendencia devem ser tratados por regra propria: rejeitado e nao descontado exigem fila operacional, mas nao descontado permanece pendente ate decisao formal.
- Leituras de margem por produto, endividamento e saldo devedor devem consumir as mesmas regras centrais de status para evitar divergencia entre paineis.
- Troca de arquivos, validacao e competencia da folha devem usar as regras centrais de reserva e pendencia de retorno para manter o ciclo mensal consistente.
- Fechamento, ajustes e validacao de insercao devem usar os mesmos helpers centrais de reserva e pendencia para evitar decisoes divergentes no fim da competencia.
- Regras de contrato e geradores de insercao com campos financeiros/operacionais devem usar os helpers centrais de status antes de enviar dados para a folha.
- A classificacao visual de status de contrato deve ser centralizada para evitar que a mesma situacao operacional apareca com severidades diferentes entre telas.
- Conciliacao do retorno deve selecionar contratos e pintar status usando os helpers centrais, mantendo consistencia com fechamento, ajustes e troca de arquivos.

## Campos Importantes Ja Mapeados

Contrato:

- valor contratado;
- taxa mensal;
- CET mensal;
- primeiro vencimento;
- primeira competencia;
- parcela atual;
- prazo total;
- tipo de contrato;
- produto;
- contrato origem;
- banco/credor origem;
- valor compra/saldo;
- observacao operacional.

Folha/arquivo:

- competencia;
- data de corte;
- layout;
- protocolo;
- status;
- retorno por contrato;
- motivo de rejeicao;
- valor descontado.

Servidor/matricula:

- CPF;
- nome;
- matricula;
- situacao funcional;
- renda/base de calculo;
- descontos obrigatorios;
- margem disponivel;
- convenio.

## Prioridade de Desenvolvimento

1. Consolidar fluxo ponta a ponta:
   servidor/matricula -> margem -> reserva -> contrato -> insercao -> retorno -> baixa de parcela/liquidacao.

2. Corrigir erros e testar:
   validar no GitHub Pages apos cada mudanca relevante.

3. Melhorar usabilidade:
   reduzir sensacao de muitas telas, agrupar modulos e guiar melhor a jornada.

4. Completar regras e campos:
   contrato, servidor, convenio, consignataria, produtos, rubricas, competencia, data de corte e tipos de operacao.

5. Preparar versao real:
   backend, banco, autenticacao, seguranca, APIs e logs robustos.

## Cuidados de Arquitetura

- O MVP estatico serve para validar regra e experiencia, nao para producao.
- Producao exigira backend, banco de dados, autenticacao real, controle de permissoes, criptografia, logs auditaveis e LGPD.
- Evitar crescer apenas criando novas telas; priorizar fluxos completos e consistentes.
- Manter modelo de dados evolutivo, pois novos campos e regras aparecerao durante a descoberta.
- Registrar ideias novas no backlog antes de implementar, salvo quando forem essenciais ao fluxo principal.

## Backlog Importante

- Validacao complementar do servidor em fonte publica, como portal da transparencia quando disponivel.
- Integracoes reais via API com folha, consignatarias e possiveis fontes de autenticidade.
- IA para leitura de endividamento, assistente financeiro e apoio operacional.
- Versionamento de layouts de arquivo por convenio.
- Regras de rubrica por produto.
- Anexos e comprovantes por tipo de operacao.
- Relatorios gerenciais e trilhas de auditoria mais robustas.
- Testes automatizados.
- Transicao para backend e banco relacional.

## Modo de Trabalho Combinado

Quando o usuario disser "continuar", a ordem padrao deve ser:

1. verificar o estado local e publicado;
2. escolher o proximo item mais importante da prioridade de desenvolvimento;
3. implementar de forma pequena e testavel;
4. validar sintaxe e comportamento;
5. publicar no GitHub Pages quando aplicavel;
6. atualizar este documento se houver nova decisao relevante.

Pausar e pedir decisao quando houver:

- mudanca grande de arquitetura;
- regra de negocio ambigua com impacto financeiro;
- decisao de seguranca ou privacidade;
- mudanca que possa quebrar o fluxo principal;
- necessidade de credenciais, plugins ou acesso externo sensivel.
