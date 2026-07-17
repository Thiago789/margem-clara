# Estado do Projeto - Margem Clara

Atualizado em: 2026-07-16

## Objetivo

Construir um MVP de sistema de gestao de margem consignavel para validar fluxo operacional, regras de negocio e experiencia de uso antes da versao com backend, banco de dados, autenticacao real e integracoes.

## URL e Repositorio

- GitHub Pages: https://thiago789.github.io/margem-clara/
- Repositorio: Thiago789/margem-clara
- Publicacao atual: MVP estatico no GitHub Pages.

## Estado Atual

### Marco de consolidacao do MVP estatico

Em 2026-07-16 o MVP estatico entrou em consolidacao. Novas telas e funcionalidades demonstrativas ficam congeladas, salvo quando forem necessarias para corrigir uma regra essencial, um erro ou uma lacuna do fluxo ponta a ponta.

O foco imediato passa a ser:

- simplificar a experiencia de uso e a demonstracao;
- manter regras, evidencias e status consistentes;
- executar verificacoes automaticas antes de publicar;
- preparar a fundacao da versao real com backend, banco, autenticacao e auditoria persistente.

O GitHub Actions deve executar checagem de seguranca, integridade estatica e smoke test da jornada principal antes de liberar a publicacao no GitHub Pages.

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
- menu consolidado em frentes operacionais e contexto compacto da jornada;
- fila operacional agrupada por frente;
- fechamento com nivel e termo de aprovacao;
- trilha de decisoes na auditoria;
- snapshot de revisao de acessos;
- roteiro guiado para demonstracao.

## Regras de Negocio Ja Decididas

- A margem deve ser controlada por matricula/vinculo, nao apenas por CPF.
- O arquivo de margem vem do sistema de folha do convenio e alimenta a base de servidores, renda e descontos.
- O arquivo de insercao e gerado pelo sistema de margem com os descontos que devem entrar na folha.
- O arquivo retorno informa o que foi descontado, rejeitado ou nao descontado, com motivo.
- A parcela atual do contrato so deve avancar quando o retorno confirmar desconto.
- Rejeicao, pendencia ou ausencia de desconto nao deve liquidar parcela automaticamente.
- Ao atingir o prazo final, o contrato deve liquidar e liberar margem.
- Data de corte define quais reservas/contratos entram no arquivo de insercao da competencia.
- Autorizacao para consulta de margem pela consignataria deve ser configuravel por convenio.
- Codigo/senha para reserva deve ser configuravel por convenio.
- Alguns convenios podem permitir reserva imediata sem codigo.
- Fonte publica para validacao do servidor deve ser configuravel por convenio, podendo representar portal da transparencia, API municipal ou arquivo oficial.
- No MVP estatico, consulta de fonte publica e evidencia simulada/controlada; integracao real deve ficar para backend/API.
- Validacao por fonte publica deve poder gerar evento auditavel com servidor, status, fonte e referencia configurada.
- Homologacao deve cobrar fonte publica configurada e evidencia registrada em auditoria antes de marcar o criterio como atendido.
- Homologacao deve destacar a proxima evidencia pendente e abrir o modulo exato para resolver o aceite.
- Fila operacional deve cobrar evidencia de fonte publica quando a fonte estiver configurada, mas ainda nao houver registro na auditoria.
- Consignataria deve estar habilitada no convenio antes de consultar margem ou criar reserva operacional.
- Simulacao e reserva devem considerar apenas produtos habilitados para a consignataria no convenio.
- Ranking de simulacao deve explicar consignatarias excluidas por credenciamento, produto ou status.
- Credenciamento vencido deve bloquear consulta, simulacao e reserva mesmo com status ativo.
- Credenciamento ainda nao iniciado deve bloquear operacao ate o inicio da vigencia.
- Tela de credenciamento deve separar consignatarias aptas, futuras, vencidas e bloqueadas.
- Bloqueios de operacao por credenciamento devem informar o motivo operacional ao usuario.
- Bloqueios por credenciamento devem gerar auditoria com motivo, perfil e origem.
- Homologacao e prontidao V1 devem cobrar bloqueio de credenciamento auditavel.
- Tela de auditoria deve ter filtro rapido para bloqueios de credenciamento.
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
- Tela de troca de arquivos deve mostrar situacao por etapa da competencia: margem, insercao, retorno e fechamento, com status e proxima acao.
- Cards da troca de arquivos devem abrir diretamente o modulo responsavel pela proxima acao da etapa.
- Clique em etapa da troca de arquivos deve registrar auditoria, preservando rastro da navegacao operacional durante testes.
- Fila operacional deve cobrar validacao de margem e insercao quando houver base ou reservas sem evidencia registrada.
- Homologacao deve exigir evidencia de validacao de margem registrada, nao apenas base carregada.
- Tela de validacao deve registrar evidencia operacional de margem e insercao, alimentando fila, homologacao e prontidao com o mesmo snapshot da competencia.
- Tela de validacao deve exibir o ultimo snapshot de margem e insercao, para deixar claro quando a competencia foi validada e quais totais foram usados.
- Layouts de margem, insercao e retorno devem ter versao por competencia e status de homologacao, para evitar misturar arquivos de convenios ou layouts diferentes.
- Protocolos de remessa devem refletir as validacoes reais de margem, insercao e retorno, incluindo linhas, erros criticos, alertas, layout, competencia e status operacional.
- Tela de protocolos deve registrar e exibir o snapshot da competencia, congelando lotes, registros, pendencias e divergencias para auditoria e prontidao.
- Homologacao deve cobrar protocolo da competencia registrado, ligando validacao, remessa, retorno e fechamento em uma cadeia de evidencia.
- Fila operacional deve cobrar protocolo pendente quando ja houver evidencia de margem, insercao ou retorno sem snapshot protocolado.
- Roadmap e prontidao devem abrir diretamente Protocolos quando o criterio pendente for rastreabilidade de protocolo.
- Fluxo piloto deve ter etapa propria para protocolar a competencia antes de baixa, fechamento e auditoria final.
- Roteiro de apresentacao deve mostrar protocolo da competencia como etapa propria, separada de insercao e retorno.
- Homologacao deve guardar no checkpoint de aceite o protocolo, a decisao de fechamento e a proxima pendencia.
- Prontidao V1 deve exibir as evidencias do ultimo aceite de homologacao, incluindo protocolo, fechamento e proxima pendencia.
- Painel inicial deve resumir as evidencias do ultimo aceite de homologacao sem exigir abrir a prontidao.
- Painel inicial deve permitir abrir a homologacao diretamente a partir do resumo de aceite.
- Roadmap deve explicar as evidencias do aceite quando o foco recomendado apontar para homologacao.
- Prontidao V1 deve ser calculada a partir do estado real do MVP, usando validacoes, homologacao, protocolos, permissoes, contratos, auditoria e integracoes mapeadas.
- Painel inicial do gestor deve exibir um cockpit operacional com proxima acao do fluxo piloto, fila de pendencias e prontidao V1.
- Atalhos para modulos inexistentes ou indisponiveis por perfil devem ser redirecionados com registro de auditoria, evitando queda silenciosa no painel.
- Massa de teste deve incluir roteiro de apresentacao com etapas marcaveis e atalhos para os modulos, facilitando demonstracao do MVP para terceiros.
- Fluxo piloto deve mostrar o progresso do roteiro de apresentacao e abrir o roteiro diretamente, reduzindo cliques durante demonstracao.
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
- Tela de fechamento deve registrar e exibir a decisao operacional da competencia, para que homologacao e prontidao usem evidencia congelada e nao apenas calculo momentaneo.
- Decisao de fechamento registrada deve ser marcada como desatualizada quando bloqueios, ressalvas, protocolos ou conciliacao mudarem depois do registro.
- Smoke test automatico deve percorrer a jornada principal do gestor em navegador headless, cobrindo cockpit, fila, fluxo piloto, validacao, protocolos, fechamento, homologacao, prontidao, roadmap, auditoria, responsividade mobile, overflow horizontal e rolagem vertical.
- Smoke test deve executar pelo menos uma acao operacional real e validar persistencia/auditoria, comecando pelo registro em lote da fonte publica.
- Smoke test de fonte publica deve validar tambem reflexo em homologacao e prontidao, nao apenas gravacao local.
- Smoke test deve validar que mudanca posterior no servidor torna a fonte publica desatualizada e abre pendencia na fila.
- Repositorio publico deve ter checagem local de seguranca para bloquear `.env`, chaves privadas e tokens reais antes de publicar no GitHub Pages.
- Evidencia de fonte publica deve ser registrada com snapshot do servidor/convenio e marcada como desatualizada quando dados ou configuracao mudarem.
- Homologacao e prontidao devem aceitar fonte publica apenas quando houver cobertura estruturada e atualizada da massa piloto.
- Cobertura atualizada de fonte publica significa snapshot fresco para todos os servidores; o status `Conferir` continua sendo tratado como risco operacional, nao como ausencia de evidencia.
- Tela de validacao do servidor deve permitir registro em lote e mostrar cobertura de fonte publica por total, registrados, frescos, desatualizados e pendentes.
- Registro em lote de fonte publica deve salvar snapshot tambem para servidores com status `Conferir`, mantendo o risco visivel sem perder cobertura.
- Fila operacional deve cobrar fonte publica pela cobertura estruturada, nao apenas por existencia de evento antigo na auditoria.
- Painel inicial deve mostrar a cobertura de fonte publica e abrir a validacao do servidor quando houver pendencia.
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
- Jornada superior e painel inicial devem explicar a origem da proxima acao: fila, roadmap ou fluxo piloto.
- Painel inicial deve destacar a acao principal e compactar indicadores de apoio para reduzir carga visual.
- Prontidao deve abrir o modulo acionavel do proximo criterio e exibir o aceite registrado.
- Homologacao deve diferenciar demo guiada, piloto controlado e limite antes de operacao real.
- Painel inicial e roadmap devem reutilizar o estagio de homologacao para orientar decisao.
- Jornada superior deve mostrar prioridade da fila ou foco recomendado sem exigir abrir o roadmap.
- Prontidao deve destacar a frente e o criterio pendente atual para reduzir busca manual no checklist.
- Navegacao bloqueada por perfil deve redirecionar com aviso visivel e registro de auditoria.
- Tela de permissoes deve evidenciar que a navegacao protegida esta ativa no MVP.
- Tela de permissoes deve evidenciar limites do MVP estatico: dados ficticios/localStorage, auditoria parcial, RBAC/backend e LGPD antes de producao.
- Auditoria deve resumir eventos sensiveis e redirecionamentos de navegacao protegida.
- Prontidao V1 deve considerar resumo de auditoria sensivel e navegacao protegida na frente de seguranca.
- Homologacao deve validar navegacao protegida e resumo de auditoria sensivel como criterios de seguranca.
- Consulta de margem e reserva devem ter politicas separadas por convenio, pois alguns convenios podem exigir autorizacao antes da leitura e outros apenas antes da reserva.
- Credenciamento de consignataria deve condicionar acesso ao convenio, produtos permitidos, vigencia e canal operacional.
- Ranking de simulacao e formulario de reserva devem filtrar produtos conforme credenciamento ativo da consignataria.
- Experiencia de simulacao deve mostrar motivo de exclusao de consignataria para evitar duvida operacional.
- Vigencia do credenciamento deve ser aplicada como regra operacional, nao apenas informativa.
- Vigencia de credenciamento deve ter inicio e fim para diferenciar operacao futura de operacao vencida.
- Status operacional de credenciamento deve consolidar status cadastral, inicio/fim de vigencia e aptidao para operar.
- Mensagens de bloqueio devem reutilizar a mesma elegibilidade usada no ranking e na reserva.
- Tentativas de consulta ou reserva bloqueadas por credenciamento devem entrar no resumo de eventos sensiveis.
- Aceite do MVP deve verificar que bloqueios por credenciamento aparecem na auditoria.
- Auditoria deve permitir localizar rapidamente bloqueios de credenciamento sem busca manual.
- Auditoria deve permitir gerar evidencia controlada de bloqueio de credenciamento para homologacao, sem depender de erro manual no formulario.

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

1. Consolidar e congelar o MVP demonstravel:
   simplificar a jornada, revisar campos essenciais e corrigir lacunas do fluxo ponta a ponta.

2. Proteger a publicacao:
   executar seguranca, integridade estatica e smoke test automaticamente antes do deploy.

3. Iniciar a fundacao da versao real:
   backend, PostgreSQL, autenticacao, permissoes, auditoria e isolamento por convenio.

4. Migrar o nucleo de dominio:
   convenio, servidor/matricula, margem, reserva, contrato e ciclo de arquivos.

5. Homologar a operacao real:
   testes de permissao, concorrencia, arquivos, seguranca, LGPD e recuperacao.

## Decisoes Estrategicas de Produto

- O Margem Clara deve atender consignacoes e descontos facultativos, nao apenas emprestimos.
- Emprestimo consignado, cartao consignado e cartao beneficio sao produtos essenciais da V1 real.
- Cartoes exigem modelo proprio de limite, reserva, lancamentos, fatura, saldo, estorno e liberacao de margem.
- O dominio deve generalizar bancos e financeiras para consignatarias ou prestadores conveniados de varias categorias.
- O motor deve suportar parcela fixa, recorrencia, percentual, valor variavel, lancamento eventual, parcela unica e reserva de limite.
- Plano de saude, seguro, previdencia, associacao, sindicato, comercio e servicos devem entrar por produtos configuraveis.
- IA sera planejada para servidor, gestor/RH e consignataria, com atuacao assistiva, explicavel e auditavel.
- Fonte publica municipal sera evidencia complementar e nunca substituira o arquivo oficial da folha.
- Consignado integrado a compras com liquidacao via Pix e uma frente futura, dependente de parceiros financeiros e de pagamento habilitados.
- A arquitetura deve preservar essas frentes futuras sem inclui-las prematuramente no primeiro backend operacional.
- O documento `ideias-e-decisoes-produto.md` e a memoria oficial das hipoteses, guardrails e sequenciamento estrategico.

## Fundacao da Versao Real

- `inventario-dominio-v2.md` consolida a linguagem, agregados, estados e invariantes do dominio ampliado.
- `modelo-dados-v2.md` define o modelo logico evolutivo para emprestimos, cartoes e descontos facultativos.
- `arquitetura-backend-v1.md` define monolito modular, isolamento por convenio, transacoes criticas e o primeiro fluxo vertical real.
- O nome canonico da entidade externa sera `party`, substituindo o conceito estreito de `lender` no backend real.
- Contrato de credito, instrumento de cartao e autorizacao de desconto serao estruturas diferentes, ligadas pelo mesmo catalogo de produtos e motor de margem.
- A proxima entrega tecnica e o scaffold do backend com identidade, escopo, auditoria e migracoes do primeiro incremento.
- O scaffold executavel foi iniciado em `backend/` com NestJS, TypeScript, Prisma e PostgreSQL como banco alvo.
- A configuracao falha ao iniciar quando variaveis obrigatorias estao invalidas e nao contem segredo versionado.
- O health check responde em `/api/v1/health` e propaga identificador de correlacao.
- O controle inicial de escopo nega acesso a outro convenio, outra parte ou permissao ausente.
- O esquema inicial inclui organizacao, convenio, politica versionada, parte conveniada, produto, credenciamento, pessoa, matricula, usuarios, permissoes, auditoria e outbox.
- O CI deve compilar, testar e validar o esquema do backend antes de publicar a demo estatica.
- Proximo incremento: autenticacao real, persistencia da auditoria e primeira migracao PostgreSQL aplicada em ambiente local/homologacao.

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
