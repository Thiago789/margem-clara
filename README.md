# Margem Clara - MVP V1

Primeiro MVP web do sistema de gestao de margem consignavel.

## Ambiente de demonstracao

Quando o GitHub Pages estiver habilitado, o MVP ficara disponivel em:

https://thiago789.github.io/margem-clara/

## Como abrir localmente

Abra o arquivo `index.html` no navegador.

No Windows, voce pode dar duplo clique no arquivo:

```text
C:\Users\Thiago Moreira\Documents\Codex\2026-05-18\boa-noite-preciso-desenvolver-um-sistema\index.html
```

## O que ja funciona

- Painel operacional com indicadores.
- Listagem de servidores.
- Cadastro de novo servidor.
- Consulta de margem explicada.
- Calculo de margem por renda base, descontos obrigatorios, contratos e reservas.
- Contratos e reservas.
- Criacao de nova reserva com validacao de margem disponivel.
- Importacao de folha via CSV.
- Simulacao de emprestimo.
- Ranking de taxas.
- Alternancia visual de perfil: Gestor/RH, Servidor e Consignataria.
- Tela de autorizacoes/contrassenha com codigo temporario.
- Uso automatico de codigo ativo ao criar uma reserva para o servidor.
- Abertura de ticket de suporte/contestacao.
- Persistencia local via `localStorage`.

## Arquivo de exemplo

Use `folha-exemplo.csv` para testar a importacao de folha.

Formato esperado:

```csv
nome,cpf,matricula,renda_base,descontos_obrigatorios,status
Joao Martins,456.789.012-33,MAT-1004,4100,350,Ativo
```

## Observacoes

Este MVP ainda nao possui backend, banco de dados ou autenticacao real. Ele foi feito como prototipo funcional para validar fluxo, regra de margem e experiencia de uso antes da implementacao completa da API.

## Checagem estatica

Antes de publicar uma mudanca, rode:

```text
node tools/static-check.js
```

Essa checagem valida a versao de cache, a lista de addons carregados e duplicacoes de regras centrais de status.

Validacoes tecnicas realizadas:

- Arquivos principais criados: `index.html`, `styles.css`, `app.js`.
- Sintaxe JavaScript validada.
- Estrutura servida por HTTP local chegou a responder no ambiente, mas o navegador interno bloqueou acesso a `localhost` e `file://` por politica de seguranca.
