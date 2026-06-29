# Estado do Projeto - Margem Clara

Atualizado em: 2026-06-28

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
- Assistente e regras de negocio devem usar os mesmos helpers centrais de reserva e pendencia para que indicadores executivos nao diverjam da operacao.
- Fluxo piloto e homologacao devem usar os helpers centrais para que prontidao, aceite e demonstracao reflitam a mesma regra operacional.
- Saude da margem, validacao do servidor e autenticidade devem usar a regra central de pendencia de retorno ao classificar risco operacional.
- Painel inicial, protocolos, consignatarias e massa de teste devem consumir os helpers centrais para manter os resumos alinhados ao fluxo de folha.
- Competencias, linha do tempo, conciliacao detalhada e operacoes de divida devem reutilizar os helpers centrais de status quando classificarem retorno ou reserva.
- Geracao de arquivo de insercao deve registrar lote por competencia e bloquear novo envio do mesmo contrato na mesma competencia sem ajuste formal.
- Retorno da folha deve atualizar o lote de insercao da competencia, separando retornados, pendentes, divergentes e duplicados.
- Fechamento da competencia deve considerar lotes de insercao sem retorno ou com pendencia nao resolvida como bloqueio operacional.
- Tela de fechamento deve indicar plano de desbloqueio com proxima acao e atalho para o modulo responsavel.
- Fila de pendencias deve reaproveitar o plano de desbloqueio do fechamento para manter prioridade operacional consistente.
- Decisao formal de ajuste deve atualizar tambem o lote de insercao, removendo bloqueios quando houver aceite, reprocessamento ou cancelamento.
- Navegacao deve reduzir complexidade percebida com uma jornada operacional permanente agrupando modulos por etapa.
- Menu lateral deve organizar modulos por grupos operacionais para reduzir sensacao de lista extensa.
- Jornada operacional deve mostrar progresso do ciclo, etapa atual e alertas para orientar o proximo passo.
- Botao principal da jornada deve priorizar pendencias altas ou medias da fila antes do roteiro comum.
- Etapas da jornada devem sinalizar onde estao concentradas pendencias altas ou medias.
- Modulos da jornada devem destacar quando sao destino direto de pendencias operacionais.
- Resumo da jornada deve mostrar a pendencia prioritaria com severidade, area e titulo, mantendo texto compacto.
- Jornada e menu lateral devem usar o mesmo agrupamento conceitual para evitar modulos soltos fora do fluxo.
- Cada etapa da jornada deve exibir um objetivo operacional curto e o proximo atalho sugerido.
- Atalhos da jornada devem usar os mesmos IDs reais das telas criadas pelos addons para evitar modulos invisiveis.
- Clique em uma etapa da jornada com pendencia deve abrir o modulo prioritario daquela etapa, nao apenas o primeiro modulo.
- Modulos da jornada com alerta devem expor o motivo principal da pendencia no proprio atalho.
- Menu lateral deve derivar os grupos principais da mesma configuracao da jornada para evitar divergencia.
- Checagem estatica deve validar se os modulos declarados na jornada possuem telas reais no MVP.
- Checagem estatica deve validar sintaxe de app.js, audit-addon.js e todos os addons carregados antes de publicar.
- Checagem estatica deve bloquear addon duplicado e manter a jornada como ultimo addon de consolidacao.
- Checagem estatica deve validar ordem de addons quando houver dependencia entre ciclo, fechamento, fila, painel, piloto e jornada.
- Checagem estatica deve proteger decisoes recentes de produto, como foco recomendado, fechamento no piloto, navegacao protegida e resumo de auditoria sensivel.
- Fluxo piloto deve evidenciar baixa de parcela e liquidacao automatica como etapa propria apos retorno e ajustes.
- Homologacao do MVP deve cobrar evidencia de baixa de parcela e liquidacao automatica, nao apenas retorno processado.
- Prontidao V1 deve considerar baixa de parcela e liquidacao automatica como item explicito do motor de margem.
- Fila de pendencias deve apontar contrato descontando sem parcela atual ou historico de baixa confirmado.
- Fechamento da competencia deve tratar baixa de parcela sem evidencia como ressalva antes de congelar o ciclo.
- Tela de competencias da folha deve evidenciar baixa de parcela, liquidacao e baixas sem evidencia antes do fechamento.
- Painel inicial do gestor deve resumir a decisao da competencia para reduzir cliques ate bloqueios de fechamento.
- Fila de pendencias deve indicar a proxima decisao recomendada, nao apenas listar itens.
- Fluxo piloto deve ter fechamento da competencia como etapa propria entre baixa de parcela e auditoria.
- Homologacao do MVP deve cobrar decisao de fechamento da competencia como criterio de aceite.
- Prontidao V1 deve considerar fechamento da competencia como item proprio de dados e folha.
- Roadmap deve apontar o proximo foco recomendado a partir da frente com menor prontidao.
- Painel inicial deve expor o foco recomendado do roadmap para orientar o proximo passo.
- Painel inicial e prontidao devem mostrar o proximo criterio pendente da frente mais fraca.
- Roadmap deve mostrar o proximo criterio pendente da prontidao, nao apenas a frente geral.
- Prontidao e homologacao devem reconhecer convenio piloto configurado, sem manter essa pendencia fixa.
- Homologacao deve registrar checkpoint de aceite com score para alimentar a prontidao operacional.
- Painel inicial deve mostrar o ultimo aceite de homologacao junto da prontidao.
- Roadmap deve abrir o modulo acionavel do criterio pendente, nao apenas a tela de prontidao.
- Jornada superior deve usar o foco acionavel do roadmap quando nao houver prioridade operacional.
- Jornada superior deve mostrar prioridade da fila ou foco recomendado sem exigir abrir o roadmap.
- Navegacao bloqueada por perfil deve redirecionar com aviso visivel e registro de auditoria.
- Tela de permissoes deve evidenciar que a navegacao protegida esta ativa no MVP.
- Auditoria deve resumir eventos sensiveis e redirecionamentos de navegacao protegida.
- Prontidao V1 deve considerar resumo de auditoria sensivel e navegacao protegida na frente de seguranca.
- Homologacao deve validar navegacao protegida e resumo de auditoria sensivel como criterios de seguranca.

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
- Manter checagem estatica para validar cache, addons carregados e duplicacao de regras centrais antes de publicar.

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
