const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const failures = [];

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function exists(file) {
  return fs.existsSync(path.join(root, file));
}

function fail(message) {
  failures.push(message);
}

function checkCacheVersion() {
  const index = read("index.html");
  const audit = read("audit-addon.js");
  const indexVersion = index.match(/audit-addon\.js\?v=([^"]+)/)?.[1];
  const loaderVersion = audit.match(/script\.src\s*=\s*`\$\{filename\}\?v=([^`]+)`/)?.[1];

  if (!indexVersion) {
    fail("index.html nao informa a versao do audit-addon.js.");
    return;
  }

  if (!loaderVersion) {
    fail("audit-addon.js nao informa a versao dos addons carregados.");
    return;
  }

  if (indexVersion !== loaderVersion) {
    fail(`Versao de cache divergente: index=${indexVersion}, audit=${loaderVersion}.`);
  }
}

function checkAddonFiles() {
  const addons = getLoadedAddons();
  if (!addons.length) {
    fail("Nao foi possivel localizar a lista de addons em audit-addon.js.");
    return;
  }

  addons.forEach((addon) => {
    if (!exists(addon)) {
      fail(`Addon listado mas nao encontrado: ${addon}.`);
    }
  });
}

function getLoadedAddons() {
  const audit = read("audit-addon.js");
  const addonBlock = audit.match(/function loadMissingAddons\(\) \{[\s\S]*?\[([\s\S]*?)\]\.forEach\(loadAddonScript\);/);
  if (!addonBlock) return [];
  return Array.from(addonBlock[1].matchAll(/"([^"]+\.js)"/g), (match) => match[1]);
}

function checkAddonListIntegrity() {
  const addons = getLoadedAddons();
  const duplicates = addons.filter((addon, index) => addons.indexOf(addon) !== index);
  Array.from(new Set(duplicates)).forEach((addon) => {
    fail(`audit-addon.js carrega addon duplicado: ${addon}.`);
  });

  if (addons.at(-1) !== "journey-shell-addon.js") {
    fail("journey-shell-addon.js deve ser o ultimo addon carregado para consolidar navegacao e jornada.");
  }
}

function checkAddonDependencyOrder() {
  const addons = getLoadedAddons();
  const mustLoadBefore = [
    ["payroll-cycle-addon.js", "payroll-closing-addon.js"],
    ["file-validation-addon.js", "payroll-closing-addon.js"],
    ["file-protocol-addon.js", "payroll-closing-addon.js"],
    ["file-reconciliation-addon.js", "payroll-closing-addon.js"],
    ["audit-enhancements-addon.js", "readiness-addon.js"],
    ["audit-enhancements-addon.js", "pilot-qa-addon.js"],
    ["payroll-closing-addon.js", "operational-queue-addon.js"],
    ["payroll-closing-addon.js", "readiness-addon.js"],
    ["operational-queue-addon.js", "dashboard-command-addon.js"],
    ["pilot-flow-addon.js", "pilot-qa-addon.js"],
    ["navigation-guard-addon.js", "pilot-qa-addon.js"],
    ["pilot-flow-addon.js", "dashboard-command-addon.js"],
    ["readiness-addon.js", "dashboard-command-addon.js"],
    ["roadmap-addon.js", "dashboard-command-addon.js"],
    ["operational-queue-addon.js", "journey-shell-addon.js"],
    ["pilot-flow-addon.js", "journey-shell-addon.js"],
    ["roadmap-addon.js", "journey-shell-addon.js"],
    ["navigation-guard-addon.js", "journey-shell-addon.js"],
    ["navigation-guard-addon.js", "readiness-addon.js"],
  ];

  mustLoadBefore.forEach(([before, after]) => {
    const beforeIndex = addons.indexOf(before);
    const afterIndex = addons.indexOf(after);
    if (beforeIndex === -1 || afterIndex === -1) return;
    if (beforeIndex > afterIndex) {
      fail(`Ordem de addons invalida: ${before} deve carregar antes de ${after}.`);
    }
  });
}

function checkJavaScriptSyntax() {
  ["app.js", "audit-addon.js", ...getLoadedAddons()].forEach((file) => {
    if (!exists(file)) return;
    try {
      new vm.Script(read(file), { filename: file });
    } catch (error) {
      fail(`${file}: erro de sintaxe JavaScript: ${error.message}`);
    }
  });
}

function removeAllowedSnippets(file, content) {
  const allowed = {
    "app.js": [
      'const marginUsageStatuses = ["Descontando", "Averbado", "Enviado para folha"];',
      'const marginReservationStatuses = ["Reservado"];',
      'const returnIssueStatuses = ["Rejeitado", "Nao descontado"];',
    ],
  };

  return (allowed[file] || []).reduce((current, snippet) => current.replace(snippet, ""), content);
}

function checkDuplicatedStatusRules() {
  const ignoredFiles = new Set(["file-exchange-addon.js"]);
  const checks = [
    {
      label: "array direto de ocorrencias de retorno",
      snippet: '["Rejeitado", "Nao descontado"]',
      helper: "contractHasReturnIssue(contract)",
    },
    {
      label: "comparacao direta de reserva",
      snippet: 'contract.status === "Reservado"',
      helper: "contractConsumesMargin(contract) ou marginReservationStatuses",
    },
    {
      label: "array direto de contratos ativos",
      snippet: '["Averbado", "Descontando"]',
      helper: "contractConsumesMargin(contract)",
    },
    {
      label: "array direto de consumo de margem",
      snippet: '["Descontando", "Averbado", "Enviado para folha"]',
      helper: "contractConsumesMargin(contract)",
    },
    {
      label: "array direto de estados operacionais mistos",
      snippet: '["Reservado", "Enviado para folha", "Nao descontado"]',
      helper: "helpers centrais de status em app.js",
    },
  ];

  fs.readdirSync(root)
    .filter((file) => file.endsWith(".js") && !ignoredFiles.has(file))
    .forEach((file) => {
      const content = removeAllowedSnippets(file, read(file));
      checks.forEach((check) => {
        if (content.includes(check.snippet)) {
          fail(`${file}: ${check.label}. Use ${check.helper}.`);
        }
      });
    });
}

function checkJourneyViewAliases() {
  const journey = read("journey-shell-addon.js");
  const staleViews = ["enrollment", "marginhealth", "debtinsights", "apisandbox", "accesscontrol"];
  staleViews.forEach((view) => {
    if (journey.includes(`"${view}"`)) {
      fail(`journey-shell-addon.js usa alias de tela obsoleto: ${view}.`);
    }
  });
}

function getJourneyViews() {
  const journey = read("journey-shell-addon.js");
  const viewBlocks = Array.from(journey.matchAll(/views:\s*\[([^\]]+)\]/g), (match) => match[1]);
  return viewBlocks.flatMap((block) => Array.from(block.matchAll(/"([^"]+)"/g), (match) => match[1]));
}

function viewExists(view) {
  const viewId = `${view}-view`;
  return fs.readdirSync(root)
    .filter((file) => file.endsWith(".html") || file.endsWith(".js"))
    .some((file) => read(file).includes(viewId));
}

function checkJourneyViewsExist() {
  const views = getJourneyViews();
  const duplicates = views.filter((view, index) => views.indexOf(view) !== index);
  Array.from(new Set(duplicates)).forEach((view) => {
    fail(`journey-shell-addon.js declara o modulo ${view} mais de uma vez na jornada.`);
  });

  Array.from(new Set(views)).forEach((view) => {
    if (!viewExists(view)) {
      fail(`journey-shell-addon.js declara modulo sem tela correspondente: ${view}.`);
    }
  });
}

function checkRecentDecisionCoverage() {
  const requiredSnippets = [
    {
      file: "navigation-guard-addon.js",
      snippet: "navigation-guard-notice",
      message: "Aviso visual de navegacao protegida deve continuar ativo.",
    },
    {
      file: "audit-enhancements-addon.js",
      snippet: "getAuditSummaryCards",
      message: "Auditoria deve manter resumo de eventos sensiveis.",
    },
    {
      file: "audit-enhancements-addon.js",
      snippet: "audit-accreditation-blocks",
      message: "Auditoria deve manter atalho para bloqueios de credenciamento.",
    },
    {
      file: "audit-enhancements-addon.js",
      snippet: "audit-simulate-accreditation-block",
      message: "Auditoria deve permitir gerar evidencia controlada de bloqueio de credenciamento.",
    },
    {
      file: "audit-enhancements-addon.js",
      snippet: 'lenderOperationBlockMessage("lender-2", "Emprestimo consignado")',
      message: "Teste de auditoria deve reutilizar regra real de bloqueio por credenciamento.",
    },
    {
      file: "audit-enhancements-addon.js",
      snippet: "Bloqueio de credenciamento",
      message: "Atalho de auditoria deve filtrar origem de bloqueio de credenciamento.",
    },
    {
      file: "pilot-qa-addon.js",
      snippet: "Navegacao protegida e auditoria sensivel",
      message: "Homologacao deve validar controles de seguranca recentes.",
    },
    {
      file: "readiness-addon.js",
      snippet: "Convenio piloto definido",
      message: "Prontidao V1 deve medir convenio piloto configurado.",
    },
    {
      file: "readiness-addon.js",
      snippet: "Navegacao protegida por perfil",
      message: "Prontidao V1 deve medir navegacao protegida.",
    },
    {
      file: "access-control-addon.js",
      snippet: "getMvpSecurityChecklist",
      message: "Permissoes deve expor checklist de seguranca e limites do MVP.",
    },
    {
      file: "access-control-addon.js",
      snippet: "Limites do MVP",
      message: "Tela de permissoes deve diferenciar demo estatica de operacao real.",
    },
    {
      file: "readiness-addon.js",
      snippet: "Checklist de seguranca do MVP",
      message: "Prontidao deve medir checklist de seguranca do MVP.",
    },
    {
      file: "file-exchange-addon.js",
      snippet: "const stages = [",
      message: "Troca de arquivos deve mostrar situacao por etapa da competencia.",
    },
    {
      file: "file-exchange-addon.js",
      snippet: "Ver fechamento",
      message: "Troca de arquivos deve indicar proxima acao ate fechamento.",
    },
    {
      file: "file-exchange-addon.js",
      snippet: 'data-target-view="${stage.target}"',
      message: "Cards da troca de arquivos devem abrir o modulo correspondente.",
    },
    {
      file: "file-exchange-addon.js",
      snippet: "Etapa de arquivo aberta",
      message: "Clique em etapa da troca de arquivos deve gerar auditoria.",
    },
    {
      file: "operational-queue-addon.js",
      snippet: "marginValidationPending",
      message: "Fila operacional deve cobrar validacao de margem pendente.",
    },
    {
      file: "operational-queue-addon.js",
      snippet: "insertionValidationPending",
      message: "Fila operacional deve cobrar validacao de insercao antes da remessa.",
    },
    {
      file: "app.js",
      snippet: "requireAuthorizationForMarginConsult",
      message: "Politica de convenio deve separar consulta de margem da reserva.",
    },
    {
      file: "convention-settings-addon.js",
      snippet: "settings-require-margin-consult-code",
      message: "Configuracao do convenio deve permitir exigir autorizacao para consulta de margem.",
    },
    {
      file: "convention-settings-addon.js",
      snippet: "settings-public-validation-enabled",
      message: "Configuracao do convenio deve permitir fonte publica de validacao do servidor.",
    },
    {
      file: "convention-settings-addon.js",
      snippet: "getPublicValidationEvidence",
      message: "Fonte publica deve ter helper reutilizavel por validacao, autenticidade e prontidao.",
    },
    {
      file: "identity-validation-addon.js",
      snippet: "Fonte publica",
      message: "Validacao do servidor deve exibir fonte publica configurada.",
    },
    {
      file: "identity-validation-addon.js",
      snippet: "identity-public-evidence-button",
      message: "Validacao do servidor deve registrar evidencia de fonte publica na auditoria.",
    },
    {
      file: "identity-validation-addon.js",
      snippet: "recordPublicValidationEvidence",
      message: "Validacao do servidor deve centralizar registro auditavel da evidencia publica.",
    },
    {
      file: "pilot-qa-addon.js",
      snippet: "Fonte publica configuravel e auditavel",
      message: "Homologacao deve cobrar fonte publica configuravel e auditavel.",
    },
    {
      file: "pilot-qa-addon.js",
      snippet: "Abrir proxima evidencia",
      message: "Homologacao deve nomear a acao da proxima evidencia pendente.",
    },
    {
      file: "pilot-qa-addon.js",
      snippet: "Proxima evidencia",
      message: "Homologacao deve destacar a proxima evidencia pendente na lista.",
    },
    {
      file: "pilot-qa-addon.js",
      snippet: "hasPublicValidationAudit",
      message: "Homologacao deve exigir evidencia auditada de fonte publica.",
    },
    {
      file: "operational-queue-addon.js",
      snippet: "publicValidationPending",
      message: "Fila operacional deve cobrar evidencia publica configurada e ainda nao auditada.",
    },
    {
      file: "operational-queue-addon.js",
      snippet: "Validacao publica",
      message: "Fila operacional deve abrir pendencia de validacao publica.",
    },
    {
      file: "roadmap-addon.js",
      snippet: "Validar servidor",
      message: "Roadmap deve direcionar criterio de fonte publica para validacao do servidor.",
    },
    {
      file: "authenticity-addon.js",
      snippet: "requireAuthorizationForMarginConsult",
      message: "Autenticidade deve avaliar consentimento pela regra de consulta de margem.",
    },
    {
      file: "authenticity-addon.js",
      snippet: "getPublicValidationEvidence",
      message: "Autenticidade deve considerar fonte publica configurada.",
    },
    {
      file: "readiness-addon.js",
      snippet: "hasPublicValidationSource",
      message: "Prontidao deve reconhecer consulta de fonte publica configuravel.",
    },
    {
      file: "pilot-qa-addon.js",
      snippet: "Consulta e reserva configuraveis",
      message: "Homologacao deve validar consulta e reserva como politicas separadas.",
    },
    {
      file: "readiness-addon.js",
      snippet: "Consulta de margem condicionada por convenio",
      message: "Prontidao V1 deve medir consulta de margem condicionada por convenio.",
    },
    {
      file: "lender-product-accreditation-addon.js",
      snippet: "lenderHasAgreementAccess",
      message: "Credenciamento deve bloquear consignataria sem acesso ativo ao convenio.",
    },
    {
      file: "app.js",
      snippet: "Consignataria sem acesso ao convenio",
      message: "Consulta de margem deve bloquear consignataria sem acesso ativo ao convenio.",
    },
    {
      file: "pilot-qa-addon.js",
      snippet: "Acesso condicionado por convenio",
      message: "Homologacao deve validar acesso condicionado da consignataria.",
    },
    {
      file: "readiness-addon.js",
      snippet: "Consignataria habilitada por convenio",
      message: "Prontidao V1 deve medir consignataria habilitada por convenio.",
    },
    {
      file: "app.js",
      snippet: "simulation-product",
      message: "Simulacao deve considerar produto ao ranquear consignatarias.",
    },
    {
      file: "lender-product-accreditation-addon.js",
      snippet: "lenderAllowedProducts",
      message: "Credenciamento deve expor produtos habilitados por consignataria.",
    },
    {
      file: "lender-product-accreditation-addon.js",
      snippet: "lenderProductEligibility",
      message: "Credenciamento deve explicar elegibilidade da consignataria por produto.",
    },
    {
      file: "lender-product-accreditation-addon.js",
      snippet: "accreditationIsExpired",
      message: "Credenciamento deve aplicar vigencia como regra operacional.",
    },
    {
      file: "lender-product-accreditation-addon.js",
      snippet: "accreditationIsNotStarted",
      message: "Credenciamento deve bloquear operacao antes do inicio da vigencia.",
    },
    {
      file: "lender-product-accreditation-addon.js",
      snippet: "accreditationIsWithinValidity",
      message: "Credenciamento deve centralizar periodo valido de operacao.",
    },
    {
      file: "lender-product-accreditation-addon.js",
      snippet: "accreditationOperationalStatus",
      message: "Credenciamento deve consolidar status operacional para a tela e regras.",
    },
    {
      file: "lender-product-accreditation-addon.js",
      snippet: "Status operacional",
      message: "Tela de credenciamento deve exibir status operacional consolidado.",
    },
    {
      file: "lender-product-accreditation-addon.js",
      snippet: "lenderOperationBlockMessage",
      message: "Bloqueio de reserva deve informar motivo de elegibilidade.",
    },
    {
      file: "lender-product-accreditation-addon.js",
      snippet: "Bloqueio de credenciamento",
      message: "Bloqueio de reserva por credenciamento deve entrar na auditoria.",
    },
    {
      file: "pilot-qa-addon.js",
      snippet: "Bloqueio de credenciamento auditavel",
      message: "Homologacao deve cobrar auditoria de bloqueio por credenciamento.",
    },
    {
      file: "readiness-addon.js",
      snippet: "Bloqueio de credenciamento auditavel",
      message: "Prontidao V1 deve medir auditoria de bloqueio por credenciamento.",
    },
    {
      file: "app.js",
      snippet: "auditEventOnce",
      message: "Consulta bloqueada por credenciamento deve auditar sem duplicar a cada render.",
    },
    {
      file: "app.js",
      snippet: "Motivo: ${accessReason}",
      message: "Consulta de margem bloqueada deve explicar motivo de credenciamento.",
    },
    {
      file: "lender-product-accreditation-addon.js",
      snippet: "Vigencia inicia em",
      message: "Motivo de exclusao deve informar credenciamento ainda nao iniciado.",
    },
    {
      file: "lender-product-accreditation-addon.js",
      snippet: "Vigencia encerrada em",
      message: "Motivo de exclusao deve informar credenciamento vencido.",
    },
    {
      file: "app.js",
      snippet: "consignataria(s) fora do ranking",
      message: "Simulacao deve explicar consignatarias excluidas do ranking.",
    },
    {
      file: "lender-product-accreditation-addon.js",
      snippet: "refreshContractProductOptions",
      message: "Formulario de reserva deve filtrar produtos pelo credenciamento.",
    },
    {
      file: "pilot-qa-addon.js",
      snippet: "Operacao respeita produto credenciado",
      message: "Homologacao deve validar filtro por produto credenciado.",
    },
    {
      file: "pilot-qa-addon.js",
      snippet: "Convenio piloto configurado",
      message: "Homologacao deve validar convenio piloto antes da operacao.",
    },
    {
      file: "pilot-qa-addon.js",
      snippet: "hasMarginValidation",
      message: "Homologacao deve exigir validacao de margem registrada.",
    },
    {
      file: "pilot-qa-addon.js",
      snippet: "registre a validacao da margem",
      message: "Homologacao deve orientar evidencia pendente de validacao de margem.",
    },
    {
      file: "file-validation-addon.js",
      snippet: "recordFileValidationSnapshot",
      message: "Tela de validacao deve registrar evidencia reutilizavel pela homologacao e fila.",
    },
    {
      file: "file-validation-addon.js",
      snippet: "state.lastMarginValidation =",
      message: "Validacao de arquivos deve gravar evidencia da margem processada.",
    },
    {
      file: "file-validation-addon.js",
      snippet: "state.lastInsertionValidation =",
      message: "Validacao de arquivos deve gravar evidencia da insercao processada.",
    },
    {
      file: "file-validation-addon.js",
      snippet: "Evidencia margem",
      message: "Tela de validacao deve exibir o ultimo snapshot da margem.",
    },
    {
      file: "file-validation-addon.js",
      snippet: "Evidencia insercao",
      message: "Tela de validacao deve exibir o ultimo snapshot da insercao.",
    },
    {
      file: "file-protocol-addon.js",
      snippet: "recordFileProtocolSnapshot",
      message: "Tela de protocolos deve registrar snapshot operacional da competencia.",
    },
    {
      file: "file-protocol-addon.js",
      snippet: "state.lastFileProtocol =",
      message: "Protocolos devem guardar evidencia reutilizavel pela prontidao.",
    },
    {
      file: "file-protocol-addon.js",
      snippet: "Ultimo protocolo",
      message: "Tela de protocolos deve exibir o ultimo protocolo registrado.",
    },
    {
      file: "readiness-addon.js",
      snippet: "state.lastFileProtocol",
      message: "Prontidao deve reconhecer protocolo registrado da competencia.",
    },
    {
      file: "payroll-closing-addon.js",
      snippet: "recordPayrollClosingDecision",
      message: "Fechamento deve registrar decisao operacional da competencia.",
    },
    {
      file: "payroll-closing-addon.js",
      snippet: "state.lastPayrollClosingDecision =",
      message: "Fechamento deve guardar evidencia reutilizavel pela homologacao.",
    },
    {
      file: "payroll-closing-addon.js",
      snippet: "Decisao registrada",
      message: "Tela de fechamento deve exibir a ultima decisao registrada.",
    },
    {
      file: "pilot-qa-addon.js",
      snippet: "closingDecision",
      message: "Homologacao deve cobrar decisao de fechamento registrada.",
    },
    {
      file: "readiness-addon.js",
      snippet: "state.lastPayrollClosingDecision",
      message: "Prontidao deve reconhecer fechamento registrado.",
    },
    {
      file: "pilot-qa-addon.js",
      snippet: "fileProtocol",
      message: "Homologacao deve cobrar protocolo da competencia registrado.",
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
      file: "pilot-qa-addon.js",
      snippet: "recordPilotQaApproval",
      message: "Homologacao deve registrar checkpoint reutilizavel pela prontidao.",
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
        "Atualizado em: 2026-06-30",
        "Navegacao bloqueada por perfil",
        "Auditoria deve resumir eventos sensiveis",
        "Homologacao deve validar navegacao protegida",
        "Auditoria deve permitir gerar evidencia controlada de bloqueio de credenciamento",
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
checkAsciiMarkdownDocs();

if (failures.length) {
  console.error("Static check failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Static check passed: cache, addons e regras centrais consistentes.");
