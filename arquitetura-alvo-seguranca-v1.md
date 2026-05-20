# Arquitetura Alvo e Seguranca V1 - Margem Clara

## 1. Objetivo

Este documento define a direcao tecnica e de seguranca do Margem Clara para sair do MVP estatico e evoluir para um sistema real de gestao de margem consignavel.

O MVP atual serve para validar produto, fluxo operacional e experiencia. Ele nao deve receber dados reais de servidores, contratos, folha ou convenios.

A arquitetura alvo deve proteger tres coisas:

- dados pessoais e financeiros do servidor;
- operacoes que alteram margem, reservas e contratos;
- arquivos trocados com a folha de pagamento.

## 2. Principios do Produto

O Margem Clara deve responder com clareza:

1. Qual e a margem disponivel?
2. Por que esse e o valor?
3. Quem fez cada operacao que alterou margem, contrato ou arquivo?

Esses principios afetam interface, banco, auditoria, permissoes e integracoes.

## 3. Estado Atual do MVP

O MVP publicado no GitHub Pages e estatico.

Ele demonstra:

- perfis Gestor/RH, Servidor e Consignataria;
- servidores e margem explicada;
- contratos e reservas;
- simulacao e ranking;
- codigos de autorizacao;
- suporte e contestacao;
- auditoria;
- troca de arquivos com folha: margem, insercao e retorno;
- politica configuravel do convenio para exigir ou dispensar codigo na reserva.

Limites atuais:

- sem login real;
- sem banco de dados;
- sem criptografia de dados armazenados;
- sem backend;
- sem isolamento real entre usuarios;
- dados salvos apenas no navegador;
- auditoria demonstrativa, nao imutavel.

Conclusao: e uma demo de produto, nao um ambiente operacional.

## 4. Arquitetura Alvo

Arquitetura recomendada para a primeira versao real:

```text
Frontend Web
  -> API Backend
    -> Banco PostgreSQL
    -> Storage seguro de arquivos
    -> Fila/jobs para processamento
    -> Servico de auditoria
```

### Frontend

Recomendado:

- React;
- TypeScript;
- Vite ou Next.js;
- TanStack Query;
- React Hook Form;
- Zod;
- design system simples e responsivo.

Responsabilidades:

- entregar experiencia por perfil;
- evitar telas carregadas demais;
- explicar margem e operacoes;
- validar campos antes de enviar;
- nunca confiar apenas em validacao do navegador.

### Backend

Recomendado:

- Node.js;
- NestJS;
- TypeScript;
- Prisma;
- PostgreSQL.

Responsabilidades:

- autenticar usuarios;
- aplicar permissoes;
- calcular margem;
- validar reservas;
- controlar contratos;
- processar arquivos;
- gravar auditoria;
- expor API segura.

### Banco de Dados

Recomendado:

- PostgreSQL;
- JSONB para explicacao de calculo, auditoria e raw data de arquivos;
- transacoes para operacoes de margem;
- indices por convenio, matricula, contrato, consignataria e competencia.

### Storage de Arquivos

Opcoes:

- S3;
- Azure Blob;
- storage equivalente com criptografia.

Arquivos nunca devem ficar soltos no servidor sem controle.

Cada arquivo deve ter:

- hash;
- nome original;
- nome interno seguro;
- tipo;
- tamanho;
- usuario que enviou;
- convenio;
- competencia;
- status de processamento;
- data/hora;
- trilha de auditoria.

## 5. Modulos Alvo

Modulos principais:

- autenticacao e usuarios;
- convenios e politicas;
- perfis e permissoes;
- servidores e matriculas;
- consignatarias;
- regras de margem;
- motor de calculo;
- contratos e reservas;
- codigos de autorizacao;
- troca de arquivos;
- suporte e contestacao;
- auditoria;
- relatorios;
- notificacoes.

## 6. Perfis e Permissoes

### Administrador da Plataforma

Pode:

- configurar plataforma;
- criar convenios;
- gerenciar usuarios globais;
- acessar auditoria tecnica.

Nao deve operar contratos do dia a dia sem rastreabilidade especifica.

### Gestor/RH

Pode:

- ver servidores do convenio;
- importar arquivo de margem;
- gerar arquivo de insercao;
- processar arquivo retorno;
- configurar politicas do convenio;
- ver contratos e auditoria do convenio;
- responder tickets.

Nao pode ver dados de outro convenio.

### Consignataria

Pode:

- operar apenas convenios habilitados;
- consultar margem conforme politica;
- criar reserva conforme politica;
- ver contratos proprios;
- acompanhar retornos de suas operacoes.

Nao pode ver contratos de outra consignataria.

### Servidor

Pode:

- ver suas matriculas;
- consultar margem explicada;
- ver seus contratos;
- gerar codigo de autorizacao;
- abrir contestacao.

Nao pode acessar dados de outros servidores.

## 7. Politicas por Convenio

O sistema nao deve assumir uma regra unica para todos os convenios.

Politicas configuraveis:

- exigir codigo para consulta de margem;
- exigir codigo para reserva;
- exigir codigo para confirmacao de contrato;
- permitir reserva imediata por consignataria credenciada;
- validade do codigo;
- prazo de expiracao da reserva;
- percentual de margem;
- produtos permitidos;
- rubricas de folha;
- regras de bloqueio;
- layout dos arquivos.

Essa abordagem e essencial para atender diferentes clientes sem customizacao quebradica.

## 8. Seguranca

### Autenticacao

Requisitos:

- login individual;
- senha com hash forte;
- MFA para perfis sensiveis, especialmente RH e admin;
- politica de senha;
- expiracao de sessao;
- bloqueio por tentativas invalidas;
- recuperacao de senha auditada.

### Autorizacao

Toda API deve validar:

- usuario autenticado;
- perfil;
- convenio permitido;
- consignataria permitida;
- entidade acessada;
- acao permitida.

Regra importante: o frontend apenas esconde botoes; quem protege de verdade e o backend.

### Dados Sensiveis

Dados sensiveis:

- CPF;
- nome;
- matricula;
- renda;
- descontos;
- margem;
- contratos;
- taxas;
- arquivos de folha;
- historico de operacoes.

Controles:

- criptografia em transito;
- criptografia em repouso;
- mascaramento parcial quando possivel;
- minimo acesso necessario;
- logs sem dados sensiveis desnecessarios.

### Codigos de Autorizacao

O codigo deve funcionar como autorizacao temporaria, nao como senha permanente.

Requisitos:

- uso unico;
- prazo configuravel;
- tentativas limitadas;
- armazenamento como hash;
- vinculacao a servidor/matricula/finalidade;
- auditoria de geracao, validacao, uso, expiracao e cancelamento;
- impossibilidade de prever sequencia.

### Auditoria

Auditoria deve ser tratada como modulo central.

Eventos auditados:

- login e logout;
- falhas de login;
- upload e processamento de arquivos;
- geracao de arquivo de insercao;
- processamento de retorno;
- calculo e recalculo de margem;
- consulta de margem;
- geracao e uso de codigo;
- criacao, cancelamento e confirmacao de reserva;
- alteracao de contrato;
- alteracao de politica do convenio;
- abertura e resposta de ticket.

Campos minimos:

- usuario;
- perfil;
- convenio;
- IP;
- user agent;
- data/hora;
- acao;
- entidade afetada;
- dados anteriores;
- dados novos;
- motivo, quando aplicavel.

Auditoria nao deve ser editavel pela aplicacao comum.

## 9. Troca de Arquivos com Folha

O modulo de arquivos e critico.

Fluxo:

```text
Folha gera arquivo de margem
-> Margem Clara importa e calcula margem
-> Operacoes geram reservas/contratos
-> Margem Clara gera arquivo de insercao
-> Folha processa descontos
-> Folha devolve arquivo retorno
-> Margem Clara concilia contratos e status
```

### Arquivo de Margem

Entrada vinda da folha.

Deve:

- validar layout;
- validar competencia;
- identificar servidor e matricula;
- atualizar base de calculo;
- recalcular margem;
- gerar resumo e erros;
- preservar arquivo original.

### Arquivo de Insercao

Saida enviada para a folha.

Deve:

- incluir apenas operacoes elegiveis;
- marcar contratos como enviados;
- gerar protocolo/hash;
- impedir duplicidade;
- guardar versao gerada.

### Arquivo Retorno

Entrada vinda da folha apos processamento.

Deve:

- conciliar contrato;
- atualizar parcela/status;
- registrar motivo de rejeicao;
- manter historico;
- gerar pendencias operacionais.

## 10. Usabilidade

O diferencial do produto deve ser clareza operacional.

Diretrizes:

- cada perfil deve ver primeiro sua tarefa principal;
- telas devem explicar o necessario sem virar manual;
- margem deve ser explicada por base, percentual, contratos, reservas e bloqueios;
- status devem ser consistentes;
- erros de arquivo devem ser traduzidos para linguagem operacional;
- auditoria deve ser pesquisavel;
- fluxo da consignataria deve ser rapido;
- fluxo do servidor deve ser simples e confiavel;
- RH deve enxergar pendencias por competencia.

Risco de usabilidade: colocar todos os recursos em uma unica tela. O ideal e guiar por jornada.

## 11. Requisitos Nao Funcionais

### Disponibilidade

Sistema deve ser preparado para horario comercial estendido e janelas de fechamento de folha.

### Performance

Operacoes criticas:

- consulta de margem;
- importacao de arquivo;
- geracao de arquivo de insercao;
- processamento de retorno;
- listagem de contratos.

### Escalabilidade

Escala por:

- convenios;
- servidores/matriculas;
- consignatarias;
- contratos;
- arquivos por competencia.

### Observabilidade

Deve haver:

- logs tecnicos;
- metricas;
- rastreio de jobs;
- alertas de falha de arquivo;
- painel de processamento.

## 12. LGPD

Pontos de atencao:

- finalidade clara para tratamento dos dados;
- controle de acesso;
- minimizacao de dados exibidos;
- retencao configuravel;
- registro de operacoes;
- resposta a solicitacoes do titular conforme politica do convenio;
- contratos com operadores/suboperadores;
- cuidado especial com exportacoes.

O sistema deve evitar exportacoes amplas sem justificativa e auditoria.

## 13. Decisoes Recomendadas Agora

Manter MVP estatico para demonstracao.

Nao inserir dados reais no GitHub Pages.

Continuar refinando fluxos principais:

- autorizacao;
- reserva;
- troca de arquivos;
- retorno da folha;
- auditoria.

Antes da versao real, iniciar backend com:

- login;
- convenio;
- usuario/permissao;
- servidor/matricula;
- regra de margem;
- auditoria;
- storage de arquivos.

## 14. Roadmap Tecnico Sugerido

### Fase 1 - Demo Forte

- fechar fluxo servidor -> autorizacao -> reserva;
- fechar troca de arquivos;
- melhorar auditoria visual;
- preparar apresentacao comercial.

### Fase 2 - Backend Base

- autenticar usuarios;
- criar banco;
- modelar convenio, servidor, matricula e consignataria;
- implementar permissoes;
- persistir auditoria.

### Fase 3 - Motor de Margem

- importar arquivo de margem;
- configurar regras;
- calcular snapshots;
- explicar margem;
- registrar movimentos.

### Fase 4 - Operacao Consignavel

- reserva;
- autorizacao configuravel;
- contrato;
- arquivo de insercao;
- arquivo retorno;
- contestacao.

### Fase 5 - Homologacao

- ambiente de teste;
- dados ficticios realistas;
- testes de seguranca;
- testes de permissao;
- testes de arquivo;
- roteiro de demo por perfil.

## 15. Riscos Principais

- subestimar variacao de regras entre convenios;
- tratar arquivo de folha como simples upload sem governanca;
- deixar auditoria para depois;
- permitir dados reais no prototipo;
- criar uma interface completa demais e dificil de operar;
- nao isolar consignatarias corretamente;
- nao planejar LGPD desde o inicio.

## 16. Conclusao

O produto faz sentido, mas deve evoluir com disciplina.

O MVP esta validando a experiencia e o modelo operacional. A versao real precisa nascer com seguranca, permissao por perfil, auditoria forte e troca de arquivos governada.

A melhor direcao e continuar simples na interface, mas rigoroso no dominio: margem, autorizacao, reserva, contrato, arquivo e auditoria.
