# Ideias e Decisoes de Produto - Margem Clara

Atualizado em: 2026-07-16

Este documento e um espaco vivo para registrar ideias, hipoteses, pontos de atencao e decisoes futuras do Margem Clara.

Objetivo: capturar boas ideias sem interromper o desenvolvimento do MVP. Cada item pode virar backlog, arquitetura, pesquisa ou ficar em observacao.

## Como usar

Cada ideia deve ser classificada em uma das categorias:

- Agora: faz sentido para o MVP/demo atual.
- Proximo: importante para a V1 real ou para uma demo comercial mais forte.
- Futuro: boa ideia, mas nao deve entrar agora.
- Pesquisa: precisa de estudo tecnico, juridico, comercial ou operacional.
- Nao fazer agora: ideia valida, mas com alto risco de distrair o produto.

## 1. Integracoes via API

### Ideia

O sistema deve ser facil de integrar com outros sistemas por API.

Possiveis integracoes:

- sistemas de folha de pagamento;
- portais de servidor;
- sistemas internos do convenio;
- consignatarias e bancos;
- bureaus antifraude ou validacao cadastral;
- servicos de notificacao;
- BI e data warehouse.

### Valor

- Reduz dependencia de troca manual de arquivos.
- Permite operacao em tempo quase real.
- Facilita parceria com instituicoes financeiras.
- Aumenta maturidade tecnica do produto.

### Decisao preliminar

Classificacao: Proximo.

Nao implementar API externa no MVP estatico. Mas a arquitetura real deve nascer API-first.

### Direcao futura

Criar uma camada de API com:

- autenticacao por OAuth2/client credentials para sistemas;
- escopos por convenio e consignataria;
- rate limit;
- logs de consumo;
- versionamento de endpoints;
- webhooks para eventos importantes.

Eventos candidatos para webhook:

- margem atualizada;
- codigo gerado;
- reserva criada;
- contrato enviado para folha;
- retorno processado;
- contrato rejeitado;
- ticket aberto.

## 2. Inteligencia Artificial no Produto

### Ideia

Embutir IA no Margem Clara para ajudar servidores, RH, consignatarias e gestores.

Possiveis usos:

- explicar margem em linguagem simples;
- ajudar servidor a entender endividamento;
- agente de educacao financeira;
- detectar risco de superendividamento;
- resumir contestacoes e tickets;
- sugerir motivo provavel de retorno/rejeicao;
- auxiliar RH na leitura de inconsistencias da folha;
- classificar documentos ou anexos;
- gerar relatorios operacionais;
- apoiar atendimento via assistente conversacional.

### Valor

- Diferencia o produto dos sistemas tradicionais.
- Reduz suporte repetitivo.
- Aumenta clareza para o servidor.
- Ajuda o RH a priorizar problemas.

### Riscos

- Dados financeiros e pessoais exigem cuidado extremo.
- IA nao pode tomar decisao automatica sensivel sem explicacao e controle humano.
- Respostas devem ser auditaveis quando influenciarem operacoes.
- Necessario evitar recomendacao financeira inadequada.

### Decisao preliminar

Classificacao: Pesquisa.

IA e estrategica, mas nao deve entrar no nucleo operacional antes de seguranca, permissao, dados e auditoria estarem bem definidos.

### Direcao futura

Comecar com IA assistiva, nao decisoria.

Bons primeiros casos:

- explicar margem para o servidor;
- resumir tickets;
- explicar motivos de rejeicao do retorno;
- gerar checklist para RH;
- criar perguntas frequentes contextualizadas.

Evitar no inicio:

- recomendacao direta de credito;
- score automatico de servidor;
- decisao de aprovar/negar operacao;
- conexao automatica com banco sem regra clara.

## 3. Leitura de Endividamento

### Ideia

Criar uma visao para entender o grau de comprometimento financeiro do servidor.

Possiveis indicadores:

- margem total;
- margem utilizada;
- margem reservada;
- contratos ativos;
- quantidade de consignatarias;
- evolucao de descontos por competencia;
- ocorrencias de retorno nao descontado;
- margem negativa;
- contestacoes abertas.

### Valor

- Ajuda o servidor a entender sua situacao.
- Ajuda RH a identificar casos sensiveis.
- Pode reduzir superendividamento.

### Riscos

- Pode parecer analise de credito ou score.
- Exige linguagem cuidadosa.
- Deve evitar julgamento do servidor.

### Decisao preliminar

Classificacao: Proximo.

Pode virar uma tela de "Saude da margem" ou "Resumo financeiro consignavel" no futuro, com foco educativo.

## 4. Agente de Controle Financeiro

### Ideia

Um agente assistivo para o servidor entender contratos, margem, simulacoes e alertas.

Exemplos:

- "Por que minha margem diminuiu?"
- "Tenho contrato novo na folha?"
- "Quanto da minha margem esta comprometida?"
- "Qual contrato vence primeiro?"
- "O que significa retorno rejeitado?"

### Valor

- Torna o portal do servidor mais humano.
- Reduz duvidas repetitivas.
- Diferencia o produto.

### Decisao preliminar

Classificacao: Futuro/Pesquisa.

Entrar somente depois de haver dados reais estruturados, seguranca e trilha de auditoria.

## 5. Conexao com Instituicoes Financeiras

### Ideia

Permitir conexao com instituicoes financeiras por API para consulta, reserva, confirmacao ou acompanhamento de contratos.

### Valor

- Aumenta automacao.
- Reduz operacao manual.
- Torna o produto mais atraente para bancos e financeiras.

### Riscos

- Alta complexidade de seguranca.
- Necessidade de contratos, homologacao e controle por convenio.
- Variacao de API entre instituicoes.

### Decisao preliminar

Classificacao: Futuro.

Antes disso, fechar bem:

- fluxo manual;
- troca de arquivos;
- permissao por consignataria;
- auditoria;
- API interna bem desenhada.

## 6. Identificacao e Validacao do Servidor

### Ideia

Criar mecanismos para confirmar que o servidor e real e que esta autorizado a operar.

Possibilidades:

- validacao por CPF e matricula;
- data de nascimento;
- e-mail ou celular cadastrado no convenio;
- codigo enviado por SMS/e-mail;
- login gov.br, se fizer sentido futuramente;
- validacao contra arquivo de margem mais recente;
- prova de vida ou biometria em cenarios especificos;
- validacao documental.

### Valor

- Reduz fraude.
- Aumenta confianca na geracao de codigo.
- Protege servidor e convenio.

### Riscos

- Biometria e documentos elevam requisitos de LGPD.
- Login externo pode aumentar complexidade.
- Dados do convenio podem estar desatualizados.

### Decisao preliminar

Classificacao: Proximo/Pesquisa.

Para V1 real, comecar simples:

- servidor existe no convenio;
- matricula ativa;
- CPF confere;
- contato confirmado;
- codigo temporario com validade e uso unico.

### Fonte publica como sinal complementar

Ideia registrada: usar fontes publicas, como portal da transparencia da prefeitura, para confirmar se o servidor aparece em base publica do municipio.

Classificacao: Pesquisa/Proximo.

Direcao:

- tratar portal publico como sinal complementar, nao como verdade absoluta;
- priorizar API oficial, arquivo de folha ou fonte estruturada quando existir;
- registrar fonte, data, usuario e motivo da consulta;
- limitar uso por consignataria, exigindo autorizacao e escopo;
- exibir resultado como evidencias: encontrado, nao encontrado, divergente, desatualizado ou fonte indisponivel.

Riscos:

- portais podem estar desatualizados;
- layout do portal pode mudar;
- dados publicos ainda exigem finalidade, minimizacao e auditoria;
- nomes e matriculas podem divergir entre folha e transparencia.

## 7. Ideias que Nao Devem Entrar Agora

- IA tomando decisao de concessao.
- Score de credito automatico.
- Integracao direta com muitos bancos ao mesmo tempo.
- Biometria obrigatoria no MVP.
- API publica antes de autenticacao, auditoria e permissoes estarem maduras.
- App mobile nativo antes do portal web estar validado.

## 8. Decisoes de Foco Atual

O foco atual, apos a consolidacao do MVP estatico, passa a ser:

1. consolidar o inventario definitivo da V1;
2. ampliar o modelo de emprestimo para plataforma de consignacoes e descontos facultativos;
3. modelar corretamente emprestimo, cartao consignado e cartao beneficio;
4. preparar portabilidade e compra de divida sem liberar fluxos incompletos;
5. atualizar o modelo de dados antes de iniciar o backend;
6. iniciar a arquitetura segura da versao real com API, banco, identidade, permissoes e auditoria.

Novas ideias devem ser registradas aqui e avaliadas antes de entrar no desenvolvimento.

## 9. Proximos Itens Candidatos

- Fluxo "consignataria valida codigo e cria reserva".
- Tela de configuracao de convenio.
- Melhorar auditoria com filtros e exportacao.
- Documento de API futura.
- Rascunho de casos de uso com IA assistiva.
- Regras de validacao de identidade do servidor.

## 10. Visao Estrategica Ampliada

### Tese do produto

O Margem Clara deve evoluir de um sistema de controle de emprestimos para uma plataforma de consignacoes, descontos facultativos, saude financeira e credito integrado a folha.

Proposta de posicionamento:

> Margem Clara: plataforma de consignacoes, saude financeira e credito integrado a folha.

Pilares:

- gestao confiavel de margem e descontos facultativos;
- transparencia e educacao financeira para o servidor;
- operacao orientada por evidencias para o convenio;
- integracao eficiente e responsavel para consignatarias e prestadores;
- infraestrutura futura para credito integrado a compras e pagamentos.

### Decisao de escopo

Classificacao: Agora/Proximo.

- Emprestimo consignado, cartao consignado e cartao beneficio sao produtos essenciais da V1 real.
- Cartoes nao devem reutilizar o modelo de parcelas fixas do emprestimo.
- A fundacao da V1 deve incluir um motor generico de descontos facultativos.
- Novos prestadores e produtos devem entrar por configuracao e especializacao de regras, nao por duplicacao do sistema.

## 11. Consignatarias e Prestadores Conveniados

### Decisao de dominio

O conceito atual de `lender` e insuficiente para representar todo o ecossistema. A arquitetura real deve adotar uma entidade mais ampla de consignataria ou prestador conveniado, mantendo instituicao financeira como uma categoria.

Categorias iniciais:

- instituicao financeira;
- operadora de plano de saude;
- seguradora;
- previdencia complementar;
- associacao;
- sindicato;
- cooperativa;
- comercio;
- prestador de servico;
- escritorio de advocacia;
- categoria configuravel pelo convenio.

Formas de desconto que o motor deve suportar:

- parcela fixa com prazo;
- recorrente sem prazo definido;
- percentual sobre base configurada;
- valor variavel por competencia;
- lancamento eventual;
- parcela unica;
- reserva de limite.

Cada produto ou servico deve configurar rubrica, margem, prioridade, forma de calculo, vigencia, reajuste, autorizacao, documentos, desconto parcial, reprocessamento e comportamento nos arquivos de insercao e retorno.

## 12. Inteligencia Artificial por Perfil

### Principio comum

A IA deve comecar assistiva, explicavel e auditavel. Ela pode recomendar proximas acoes e explicar dados, mas nao deve aprovar credito, negar direitos, alterar margem ou executar operacoes financeiras sem regra deterministica, permissao e confirmacao humana.

Respostas operacionais relevantes devem indicar os dados e as regras utilizados. Quando influenciar uma decisao sensivel, a interacao deve poder ser registrada em auditoria.

### IA para o servidor

Objetivos:

- explicar margem, contratos, parcelas, CET e retorno da folha;
- mostrar comprometimento atual e futuro;
- projetar liquidacoes e liberacao de margem;
- alertar sobre concentracao de dividas e multiplas contratacoes;
- comparar cenarios sem favorecer oferta por comissao;
- criar orientacoes e metas de educacao financeira;
- encaminhar situacoes sensiveis para atendimento humano.

Nao deve criar score oculto, pressionar contratacao ou apresentar aconselhamento financeiro como garantia de resultado.

### IA para o gestor e RH

Objetivos:

- detectar arquivos fora do padrao, duplicidades e divergencias;
- explicar rejeicoes e pendencias da folha;
- prever riscos para corte e fechamento;
- comparar competencias e qualidade operacional;
- priorizar fila de trabalho;
- produzir relatorios narrativos;
- responder regras citando regulamento, politica e evidencia do convenio.

### IA para a consignataria ou prestador

Objetivos:

- explicar por que uma consulta, proposta, reserva ou contrato foi bloqueado;
- indicar documentos e evidencias pendentes;
- acompanhar prazos de saldo devedor, portabilidade, retorno e conciliacao;
- analisar rejeicoes e qualidade da carteira;
- detectar contratos sem retorno, parcelas divergentes e risco de reprocessamento;
- revisar tabelas de taxa, CET, prazo e produto contra as regras do convenio;
- resumir comunicacoes e tickets;
- recomendar a proxima acao operacional para resolver pendencias;
- gerar visoes por convenio, produto, correspondente e competencia.

Limites:

- nao pode selecionar servidores para assedio comercial;
- nao pode inferir vulnerabilidade para aumentar taxa ou pressionar venda;
- nao pode burlar credenciamento, autorizacao ou regra de margem;
- nao pode aprovar ou rejeitar automaticamente uma operacao sensivel sem regra formal e supervisao.

### Ordem recomendada de entrega

1. Copiloto operacional do gestor.
2. Explicador de pendencias para consignataria.
3. Assistente de educacao financeira do servidor.
4. Analise consentida de dados financeiros e ofertas.

## 13. Inteligencia de Fontes Publicas

### Direcao

Conectar fontes oficiais, como portal da transparencia municipal, para produzir sinais complementares de existencia, vinculo, atualizacao cadastral e analise agregada da folha quando os dados estiverem legal e tecnicamente disponiveis.

Ordem de integracao:

1. API oficial;
2. arquivo ou dado aberto estruturado;
3. integracao especifica fornecida pelo municipio;
4. leitura automatizada de pagina apenas como ultimo recurso.

Regras:

- fonte publica nao substitui o arquivo oficial da folha;
- dado encontrado deve guardar fonte, data, referencia e snapshot;
- divergencia deve gerar sinal para conferencia, nao bloqueio automatico definitivo;
- disponibilidade publica nao significa uso irrestrito;
- analise individual exige finalidade, minimizacao e controle de acesso;
- nao criar score financeiro secreto a partir de remuneracao publica.

## 14. Consignado Integrado a Compras e Pix

### Ideia

Permitir que o servidor escolha pagar uma compra com credito consignado no ponto de venda. O comercio recebe via Pix, enquanto uma instituicao financeira parceira formaliza o credito e recebe as parcelas pela folha.

Fluxo futuro:

1. servidor escolhe o produto ou servico;
2. comercio inicia a solicitacao de pagamento com consignado;
3. Margem Clara consulta elegibilidade e margem autorizada;
4. parceiros financeiros apresentam propostas comparaveis;
5. servidor confere parcela, prazo, juros, CET e total;
6. servidor autoriza e assina o contrato;
7. instituicao financeira liquida o comercio via Pix;
8. contrato segue para insercao, retorno e desconto em folha.

Papel inicial do Margem Clara:

- orquestrador tecnologico e de regras;
- nao originar credito por conta propria;
- nao custodiar ou movimentar recursos;
- integrar instituicoes financeiras e de pagamento habilitadas;
- preservar consentimento, rastreabilidade e comparabilidade das ofertas.

Casos obrigatorios antes de lancar:

- cancelamento e devolucao da compra;
- produto ou servico nao entregue;
- estorno total ou parcial;
- falha no Pix;
- credito assinado sem liquidacao do comercio;
- compra liquidada com falha no contrato;
- fraude de identidade;
- desfazimento do contrato e liberacao de margem;
- responsabilidade e remuneracao de cada participante.

Classificacao: Futuro estrategico/Pesquisa regulatoria e comercial.

## 15. Sequenciamento Confirmado

### Agora

- congelar novas telas da demo, salvo correcao essencial;
- concluir inventario do dominio;
- modelar produtos e descontos facultativos;
- atualizar modelo de dados e arquitetura alvo;
- iniciar backend, banco, identidade, permissoes e auditoria.

### Proximo

- motor de margem e folha para os tres produtos essenciais;
- motor generico de descontos facultativos;
- APIs e webhooks;
- conectores de fontes publicas;
- primeiros copilotos assistivos por perfil.

### Futuro

- Open Finance por parceiro habilitado;
- marketplace responsavel de ofertas;
- consignado integrado ao comercio;
- liquidacao do estabelecimento via Pix;
- educacao financeira baseada em dados consentidos.
