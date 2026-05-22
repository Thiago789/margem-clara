# Ideias e Decisoes de Produto - Margem Clara

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

O foco atual continua:

1. demo forte do fluxo operacional;
2. troca de arquivos;
3. reserva e autorizacao configuravel;
4. margem explicada;
5. auditoria;
6. arquitetura segura para a versao real.

Novas ideias devem ser registradas aqui e avaliadas antes de entrar no desenvolvimento.

## 9. Proximos Itens Candidatos

- Fluxo "consignataria valida codigo e cria reserva".
- Tela de configuracao de convenio.
- Melhorar auditoria com filtros e exportacao.
- Documento de API futura.
- Rascunho de casos de uso com IA assistiva.
- Regras de validacao de identidade do servidor.
