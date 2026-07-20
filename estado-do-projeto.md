# Estado do Projeto - Margem Clara

Atualizado em: 2026-07-20

## Objetivo

Construir um MVP de sistema de gestao de margem consignavel para validar fluxo operacional, regras de negocio e experiencia de uso antes da versao com backend, banco de dados, autenticacao real e integracoes.

## URL e Repositorio

- GitHub Pages: https://thiago789.github.io/margem-clara/
- Repositorio: Thiago789/margem-clara
- Publicacao atual: MVP estatico no GitHub Pages.

## Estado Atual

### Marco de consolidacao do MVP estatico

Em 2026-07-16 o MVP estatico entrou em consolidacao. Novas telas e funcionalidades demonstrativas ficam congeladas, s…15208 tokens truncated… file: "payroll-closing-addon.js",
      snippet: "Decisao registrada",
      message: "Tela de fechamento deve exibir a ultima decisao registrada.",
    },
    {
      file: "payroll-closing-addon.js",
      snippet: "getPayrollClosingApproval",
      message: "Fechamento deve classificar o nivel de aceite operacional exigido.",
    },
    {
      file: "payroll-closing-addon.js",
      snippet: "approvalTerms",
      message: "Fechamento deve congelar os termos da decisao para auditoria.",
    },
    {
      file: "payroll-closing-addon.js",
      snippet: "closing-approval-panel",
      message: "Tela de fechamento deve mostrar termo operacional antes do registro.",
    },
    {
      file: "pilot-qa-addon.js",
      snippet: "closingDecision",
      message: "Homologacao deve cobrar decisao de fechamento registrada.",
    },
    {
      file: "pilot-qa-addon.js",
      snippet: "closingFreshness.fresh",
      message: "Homologacao deve rejeitar fechamento registrado desatualizado.",
    },
    {
      file: "readiness-addon.js",
      snippet: "state.lastPayrollClosingDecision",
      message: "Prontidao deve reconhecer fechamento registrado.",
    },
    {
      file: "readiness-addon.js",
      snippet: "closingFreshness.fresh",
      message: "Prontidao deve considerar somente fechamento registrado atualizado.",
    },
    {
      file: "pilot-qa-addon.js",
      snippet: "fileProtocol",
      message: "Homologacao deve cobrar protocolo da competencia registrado.",
    },
    {
      file: "pilot-qa-addon.js",
      snippet: "fileProtocolFreshness.fresh",
      message: "Homologacao deve aceitar somente protocolo atualizado.",
    },
    {
      file: "pilot-qa-addon.js",
      snippet: "Protocolos da competencia registrados",
      message: "Homologacao deve ter criterio explicito para rastreabilidade de protocolos.",
    },
    {
      file: "operational-queue-addon.js",
      snippet: "protocolRegistrationPending",
      message: "Fila operacional deve cobrar protocolo pendente quando houver evidencia de arquivo.",
    },
    {
      file: "operational-queue-addon.js",
      snippet: "Protocolo pendente",
      message: "Fila operacional deve abrir pendencia acionavel para protocolos.",
    },
    {
      file: "operational-queue-addon.js",
      snippet: "protocolRegistrationStale",
      message: "Fila operacional deve cobrar protocolo desatualizado.",
    },
    {
      file: "roadmap-addon.js",
      snippet: 'text.includes("protocolos")) return { target: "protocols"',
      message: "Roadmap deve abrir a tela de protocolos quando o criterio for rastreabilidade de protocolo.",
    },
    {
      file: "pilot-flow-addon.js",
      snippet: "Protocolar competencia",
      message: "Fluxo piloto deve incluir protocolo da competencia antes do fechamento.",
    },
    {
      file: "pilot-flow-addon.js",
      snippet: "state.lastFileProtocol",
      message: "Fluxo piloto deve reconhecer protocolo registrado como etapa concluida.",
    },
    {
      file: "demo-script-addon.js",
      snippet: "Protocolar competencia",
      message: "Roteiro de apresentacao deve demonstrar protocolo da competencia como etapa propria.",
    },
    {
      file: "demo-script-addon.js",
      snippet: 'target: "protocols"',
      message: "Roteiro de apresentacao deve abrir diretamente a tela de protocolos.",
    },
    {
      file: "demo-script-addon.js",
      snippet: "demo-script-guide",
      message: "Roteiro de apresentacao deve ter modo guiado para demonstracao assistida.",
    },
    {
      file: "demo-script-addon.js",
      snippet: "setDemoScriptGuideIndex",
      message: "Modo guiado do roteiro deve permitir avancar e voltar entre etapas.",
    },
    {
      file: "demo-script-addon.js",
      snippet: "demo-script-current-check",
      message: "Modo guiado do roteiro deve marcar evidencia da etapa atual.",
    },
    {
      file: "pilot-qa-addon.js",
      snippet: "recordPilotQaApproval",
      message: "Homologacao deve registrar checkpoint reutilizavel pela prontidao.",
    },
    {
      file: "pilot-qa-addon.js",
      snippet: "getPilotQaApprovalFreshness",
      message: "Homologacao deve detectar aceite registrado desatualizado.",
    },
    {
      file: "pilot-qa-addon.js",
      snippet: "getPilotQaApprovalSnapshot",
      message: "Homologacao deve comparar o checkpoint com as evidencias atuais.",
    },
    {
      file: "pilot-qa-addon.js",
      snippet: "Evidencias do aceite",
      message: "Homologacao deve exibir evidencias criticas do ultimo aceite.",
    },
    {
      file: "pilot-qa-addon.js",
      snippet: "nextPending",
      message: "Homologacao deve guardar a proxima pendencia no checkpoint.",
    },
    {
      file: "pilot-qa-addon.js",
      snippet: "state.lastPayrollClosingDecision",
      message: "Checkpoint de homologacao deve registrar decisao de fechamento.",
    },
    {
      file: "pilot-qa-addon.js",
      snippet: "getPilotQaStage",
      message: "Homologacao deve diferenciar demo, piloto controlado e operacao real.",
    },
    {
      file: "pilot-qa-addon.js",
      snippet: "getPilotQaStageSummary",
      message: "Homologacao deve expor resumo reutilizavel do estagio operacional.",
    },
    {
      file: "pilot-flow-addon.js",
      snippet: "getPilotDemoScriptSummary",
      message: "Fluxo piloto deve expor progresso do roteiro de apresentacao.",
    },
    {
      file: "pilot-flow-addon.js",
      snippet: "pilot-demo-script-action",
      message: "Fluxo piloto deve abrir o roteiro de apresentacao sem depender da lateral.",
    },
    {
      file: "pilot-qa-addon.js",
      snippet: "Limite de uso",
      message: "Homologacao deve evidenciar limite antes de operacao real.",
    },
    {
      file: "readiness-addon.js",
      snippet: "qaApprovalScore",
      message: "Prontidao deve considerar aceite registrado na homologacao.",
    },
    {
      file: "readiness-addon.js",
      snippet: "qaApprovalFreshness.fresh",
      message: "Prontidao deve considerar somente aceite de homologacao atualizado.",
    },
    {
      file: "readiness-addon.js",
      snippet: "getReadinessNextAction",
      message: "Prontidao deve abrir o modulo acionavel do proximo criterio.",
    },
    {
      file: "readiness-addon.js",
      snippet: "proximo foco",
      message: "Prontidao deve destacar a frente do proximo criterio.",
    },
    {
      file: "readiness-addon.js",
      snippet: ".readiness-item.next",
      message: "Prontidao deve destacar o criterio pendente atual.",
    },
    {
      file: "readiness-addon.js",
      snippet: "getReadinessApprovalLabel",
      message: "Prontidao deve exibir o aceite registrado da homologacao.",
    },
    {
      file: "readiness-addon.js",
      snippet: "getReadinessApprovalEvidence",
      message: "Prontidao deve exibir evidencias do aceite de homologacao.",
    },
    {
      file: "readiness-addon.js",
      snippet: "Evidencias do aceite",
      message: "Prontidao deve listar protocolo, fechamento e proxima pendencia do aceite.",
    },
    {
      file: "roadmap-addon.js",
      snippet: "Proximo criterio",
      message: "Roadmap deve manter foco recomendado com criterio pendente da prontidao.",
    },
    {
      file: "roadmap-addon.js",
      snippet: "getRoadmapCriterionTarget",
      message: "Roadmap deve direcionar o foco para o modulo acionavel do criterio.",
    },
    {
      file: "journey-shell-addon.js",
      snippet: "actionSource.target",
      message: "Jornada superior deve abrir o foco acionavel do roadmap quando nao houver prioridade.",
    },
    {
      file: "journey-shell-addon.js",
      snippet: "getJourneyActionSource",
      message: "Jornada superior deve explicar a origem da proxima acao.",
    },
    {
      file: "journey-shell-addon.js",
      snippet: "getJourneyWorkstreams",
      message: "Jornada superior deve agrupar modulos por frente operacional.",
    },
    {
      file: "journey-shell-addon.js",
      snippet: "getPrimarySidebarNavigation",
      message: "Menu lateral deve mostrar frentes principais em vez de todos os modulos.",
    },
    {
      file: "journey-shell-addon.js",
      snippet: "getPrimarySidebarTarget",
      message: "Menu lateral principal deve abrir a proxima acao da frente operacional.",
    },
    {
      file: "journey-shell-addon.js",
      snippet: "data-primary-nav",
      message: "Itens principais do menu devem carregar alvo operacional calculado.",
    },
    {
      file: "journey-shell-addon.js",
      snippet: "nav-secondary",
      message: "Modulos secundarios devem sair do menu lateral e continuar acessiveis pela jornada.",
    },
    {
      file: "module-jump-addon.js",
      snippet: "getModuleJumpGroups",
      message: "Seletor superior deve agrupar modulos por etapa da jornada.",
    },
    {
      file: "module-jump-addon.js",
      snippet: "optgroup",
      message: "Seletor superior deve usar grupos para reduzir sensacao de lista longa.",
    },
    {
      file: "journey-shell-addon.js",
      snippet: "journey-workstream",
      message: "Jornada superior deve renderizar grupos de trabalho, nao apenas lista plana.",
    },
    {
      file: "journey-shell-addon.js",
      snippet: "journey-context-bar",
      message: "Jornada superior deve mostrar contexto atual da frente, grupo, modulo e proxima acao.",
    },
    {
      file: "journey-shell-addon.js",
      snippet: "journey-context-summary",
      message: "Jornada superior deve manter o contexto em um resumo compacto.",
    },
    {
      file: "journey-shell-addon.js",
      snippet: "getActiveJourneyWorkstream",
      message: "Jornada superior deve identificar o grupo operacional ativo.",
    },
    {
      file: "journey-shell-addon.js",
      snippet: "getJourneyWorkstreamTarget",
      message: "Grupos compactos da jornada devem apontar para um modulo acionavel.",
    },
    {
      file: "journey-shell-addon.js",
      snippet: "journey-workstream-open",
      message: "Jornada superior deve compactar grupos inativos sem perder acesso.",
    },
    {
      file: "dashboard-command-addon.js",
      snippet: "dashboardRoadmapFocus",
      message: "Painel inicial deve expor foco recomendado do roadmap.",
    },
    {
      file: "dashboard-command-addon.js",
      snippet: "dashboardQaApprovalLabel",
      message: "Painel inicial deve expor ultimo aceite de homologacao.",
    },
    {
      file: "dashboard-command-addon.js",
      snippet: "dashboardQaApprovalEvidence",
      message: "Painel inicial deve expor evidencias do aceite de homologacao.",
    },
    {
      file: "dashboard-command-addon.js",
      snippet: "getPilotQaApprovalFreshness",
      message: "Painel inicial deve avisar quando o aceite de homologacao estiver desatualizado.",
    },
    {
      file: "dashboard-command-addon.js",
      snippet: 'data-target-view="qa"',
      message: "Painel inicial deve abrir homologacao a partir do resumo de aceite.",
    },
    {
      file: "dashboard-command-addon.js",
      snippet: "dashboardQaStageLabel",
      message: "Painel inicial deve expor estagio atual da homologacao.",
    },
    {
      file: "dashboard-command-addon.js",
      snippet: "dashboardFocusOrigin",
      message: "Painel inicial deve explicar a origem do foco recomendado.",
    },
    {
      file: "dashboard-command-addon.js",
      snippet: "dashboard-command-primary",
      message: "Painel inicial deve destacar o foco recomendado como acao principal.",
    },
    {
      file: "dashboard-command-addon.js",
      snippet: "dashboardCompactText",
      message: "Painel inicial deve compactar textos longos no cockpit operacional.",
    },
    {
      file: "roadmap-addon.js",
      snippet: "labelWithScore",
      message: "Roadmap deve mostrar o estagio de homologacao junto do foco.",
    },
    {
      file: "roadmap-addon.js",
      snippet: "getRoadmapApprovalEvidence",
      message: "Roadmap deve explicar evidencias do aceite quando o foco for homologacao.",
    },
    {
      file: "pilot-flow-addon.js",
      snippet: "9. Fechar competencia",
      message: "Fluxo piloto deve manter fechamento antes da auditoria, apos protocolo e baixa.",
    },
  ];

  requiredSnippets.forEach(({ file, snippet, message }) => {
    if (!exists(file)) {
      fail(`${file}: arquivo esperado para decisao recente nao existe.`);
      return;
    }

    if (!read(file).includes(snippet)) {
      fail(`${file}: ${message}`);
    }
  });
}

function checkDocumentationBasics() {
  const docs = [
    {
      file: "README.md",
      snippets: [
        "https://thiago789.github.io/margem-clara/",
        "Jornada operacional guiada",
        "navegacao protegida",
        "node tools/static-check.js",
      ],
    },
    {
      file: "estado-do-projeto.md",
      snippets: [
        "Atualizado em: 2026-07-20",
        "Marco de consolidacao do MVP estatico",
        "Navegacao bloqueada por perfil",
        "Auditoria deve resumir eventos sensiveis",
        "Homologacao deve validar navegacao protegida",
        "Auditoria deve permitir gerar evidencia controlada de bloqueio de credenciamento",
      ],
    },
    {
      file: "ideias-e-decisoes-produto.md",
      snippets: [
        "Visao Estrategica Ampliada",
        "Emprestimo consignado, cartao consignado e cartao beneficio sao produtos essenciais",
        "IA para a consignataria ou prestador",
        "Inteligencia de Fontes Publicas",
        "Consignado Integrado a Compras e Pix",
      ],
    },
    {
      file: "inventario-dominio-v2.md",
      snippets: [
        "Parte Conveniada e Credenciamento",
        "Cartoes",
        "Descontos Facultativos",
        "Ciclo de Folha",
        "Eventos de Dominio",
      ],
    },
    {
      file: "modelo-dados-v2.md",
      snippets: [
        "parties",
        "margin_accounts",
        "credit_contracts",
        "deduction_authorizations",
        "card_accounts",
        "payroll_entries",
        "reconciliations",
      ],
    },
    {
      file: "arquitetura-backend-v1.md",
      snippets: [
        "monolito modular",
        "Transacoes Criticas",
        "Primeiro Fluxo Vertical Real",
        "duas reservas concorrentes nao ultrapassam a margem",
        "Gate para Iniciar o Scaffold",
      ],
    },
    {
      file: "backend/package.json",
      snippets: [
        "@margem-clara/backend",
        "prisma:validate",
        "pnpm typecheck && pnpm test",
      ],
    },
    {
      file: "backend/prisma/schema.prisma",
      snippets: [
        "model Agreement",
        "model Accreditation",
        "model Enrollment",
        "model AuditEvent",
        "model OutboxEvent",
      ],
    },
    {
      file: "backend/src/platform/access-control/agreement-scope.ts",
      snippets: [
        "requireAgreementScope",
        "AccessDeniedError",
        "membership.partyId === requiredPartyId",
      ],
    },
  ];

  docs.forEach(({ file, snippets }) => {
    if (!exists(file)) {
      fail(`${file}: documento essencial nao encontrado.`);
      return;
    }

    const content = read(file);
    snippets.forEach((snippet) => {
      if (!content.includes(snippet)) {
        fail(`${file}: documentacao essencial ausente ou desatualizada: ${snippet}.`);
      }
    });
  });
}

function checkSmokeTestExists() {
  const smoke = "tools/smoke-test.js";
  if (!exists(smoke)) {
    fail("Smoke test de jornada nao encontrado em tools/smoke-test.js.");
    return;
  }

  const content = read(smoke);
  [
    "loadPlaywright",
    "coreViews",
    "mobile",
    "expectPageUsable",
    "exerciseFileValidationSnapshot",
    "exerciseMarginReleasePolicy",
    "exercisePublicValidationBatch",
    "exerciseFileProtocolSnapshot",
    "exercisePayrollClosingDecision",
    "exercisePilotQaApprovalFreshness",
    "identity-public-batch-button",
    "getPilotQaScenarios",
    "Consulta de fonte publica",
    "Desatualizada",
    "getOperationalQueueData",
    "getOperationalRiskSummary",
    "dashboard-command-center",
    "journey-workstream",
    "getJourneyWorkstreams",
    "Base e margem",
    "modulos secundarios nao foram recolhidos",
    "menu principal nao aponta para alvos operacionais",
    "seletor superior nao organizou modulos por etapa",
    "Riscos operacionais",
    "identity-public-evidence-button",
    "authenticity-signal-list",
    "validation-audit-button",
    "reservation-summary-grid",
    "adjustments-list",
    "Mantem margem",
    "TMP-ADJ-REJECTED",
    "TMP-ADJ-DIVERGENT",
    "historico do ajuste nao preservou evidencia original",
    "getFileValidationFreshness",
    "Arquivo de margem desatualizado",
    "protocols-audit-button",
    "Protocolo de remessa registrado",
    "getFileProtocolFreshness",
    "Protocolo desatualizado",
    "closing-audit-button",
    "Decisao de fechamento registrada",
    "TMP-CLOSING-BATCH",
    "mudanca em lote nao invalidou decisao de fechamento",
    "getPayrollClosingDecisionFreshness",
    "qa-audit-button",
    "getPilotQaApprovalFreshness",
  ].forEach((snippet) => {
    if (!content.includes(snippet)) {
      fail(`tools/smoke-test.js nao cobre o trecho esperado: ${snippet}.`);
    }
  });
}

function checkSecurityCheckExists() {
  const security = "tools/security-check.js";
  if (!exists(security)) {
    fail("Security check nao encontrado em tools/security-check.js.");
    return;
  }

  const content = read(security);
  [
    "secretPatterns",
    "token OpenAI",
    "token GitHub",
    ".env",
    "Security check passed",
  ].forEach((snippet) => {
    if (!content.includes(snippet)) {
      fail(`tools/security-check.js nao cobre o trecho esperado: ${snippet}.`);
    }
  });
}

function checkAsciiMarkdownDocs() {
  fs.readdirSync(root)
    .filter((file) => file.endsWith(".md"))
    .forEach((file) => {
      const content = read(file);
      const match = content.match(/[^\x00-\x7F]/);
      if (match) {
        fail(`${file}: caractere nao ASCII encontrado. Padronize documentos em ASCII para evitar problemas de encoding.`);
      }
    });
}

checkCacheVersion();
checkAddonFiles();
checkAddonListIntegrity();
checkAddonDependencyOrder();
checkJavaScriptSyntax();
checkDuplicatedStatusRules();
checkJourneyViewAliases();
checkJourneyViewsExist();
checkRecentDecisionCoverage();
checkDocumentationBasics();
checkSmokeTestExists();
checkSecurityCheckExists();
checkAsciiMarkdownDocs();

if (failures.length) {
  console.error("Static check failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Static check passed: cache, addons e regras centrais consistentes.");
