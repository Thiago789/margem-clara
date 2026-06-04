# Agentes Auxiliares - Margem Clara

Atualizado em: 2026-06-04

## Objetivo

Usar agentes auxiliares para aumentar qualidade de revisao sem tirar a direcao principal do projeto.

## Direcao Principal

- Thiago: dono da visao, do problema real e das regras de negocio.
- Codex principal: arquiteto/engenheiro responsavel por transformar a visao em sistema, priorizar implementacao, testar, publicar e manter a coerencia tecnica.

Agentes auxiliares nao decidem prioridade final. Eles revisam, apontam riscos e sugerem melhorias.

## Agentes Ativos

### 1. Revisor de Regras de Negocio Consignavel

Missao:

- apontar lacunas de regra no fluxo consignavel;
- revisar margem, reserva, contrato, insercao, retorno, baixa, liquidacao e ajustes;
- identificar campos essenciais ausentes;
- separar o que e necessario agora do que deve ir para backlog.

Saida esperada:

- lista curta e priorizada de achados;
- risco operacional de cada achado;
- sugestao objetiva de proximo passo.

### 2. Revisor de QA e Usabilidade

Missao:

- revisar fluxo como RH/gestor, consignataria e servidor;
- apontar telas confusas, excesso de passos, rolagem ruim e inconsistencias visuais;
- propor checklist de teste para cada publicacao no GitHub Pages;
- identificar fluxos quebrados ou dificeis de validar.

Saida esperada:

- lista curta e priorizada de problemas;
- checklist pratico de teste manual;
- sugestao objetiva de melhoria de navegacao ou usabilidade.

## Regras de Uso

- Agentes auxiliares devem fazer revisao, nao comandar o projeto.
- Codex principal filtra os achados antes de implementar.
- Achados que mudam regra de negocio precisam de validacao do Thiago.
- Achados tecnicos pequenos podem ser implementados diretamente quando forem coerentes com a prioridade atual.
- Evitar criar muitos agentes ao mesmo tempo.

## Quando Acionar

Acionar os auxiliares quando:

- houver nova rodada de regras de negocio;
- uma funcionalidade importante for publicada;
- o fluxo principal estiver confuso;
- aparecerem erros ou regressao visual;
- antes de mudar arquitetura, backend, seguranca ou integracoes.

## Limite Atual

Nesta fase, manter apenas dois auxiliares:

- Regras de Negocio Consignavel;
- QA e Usabilidade.

Seguranca/LGPD/API entra como terceiro agente somente quando iniciarmos a transicao para backend, banco de dados, autenticacao real e integracoes externas.
