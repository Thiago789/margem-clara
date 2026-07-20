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
  const styleVersion = index.match(/styles\.css\?v=([^"]+)/)?.[1];
  const loaderVersion = audit.match(/script\.src\s*=\s*`\$\{filename\}\?v=([^`]+)`/)?.[1];

  if (!indexVersion) {
    fail("index.html nao informa a versao do audit-addon.js.");
    return;
  }

  if (!loaderVersion) {
    fail("audit-addon.js nao informa a versao dos addons carregados.");
    return;
  }

  if (!styleVersion) {
    fail("index.html nao informa a versao do styles.css.");
    return;
  }

  if (indexVersion !== loaderVersion) {
    fail(`Versao de cache divergente: index=${indexVersion}, audit=${loaderVersion}.`);
  }

  if (styleVersion !== indexVersion) {
    fail(`Versao de cache divergente: styles=${styleVersion}, index=${indexVersion}.`);
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
  const stagesBlock = journey.match(/function getJourneyStages\(\) \{[\s\S]*?\nfunction getSidebarGroups/);
  const source = stagesBlock ? stagesBlock[0] : journey;
  const viewBlocks = Array.from(source.matchAll(/views:\s*\[([^\]]+)\]/g), (match) => match[1]);
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
      file: "access-control-addon.js",
      snippet: "getAccessReviewSnapshot",
      message: "Permissoes deve congelar snapshot estruturado da matriz de acesso.",
    },
    {
      file: "access-control-addon.js",
      snippet: "state.lastAccessReview",
      message: "Permissoes deve guardar a ultima revisao para auditoria e evidencia.",
    },
    {
      file: "access-control-addon.js",
      snippet: "access-review-panel",
      message: "Tela de permissoes deve exibir evidencia da ultima revisao registrada.",
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
      file: "convention-settings-addon.js",
      snippet: "getPublicValidationSignature",
      message: "Fonte publica deve calcular assinatura para detectar evidencia desatualizada.",
    },
    {
      file: "convention-settings-addon.js",
      snippet: "savePublicValidationEvidence",
      message: "Fonte publica deve salvar evidencia estruturada por servidor.",
    },
    {
      file: "convention-settings-addon.js",
      snippet: "getPublicValidationCoverage",
      message: "Fonte publica deve expor cobertura estruturada para homologacao e prontidao.",
    },
    {
      file: "convention-settings-addon.js",
      snippet: "Desatualizada",
      message: "Fonte publica deve marcar evidencia antiga como desatualizada.",
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
      snippet: "identity-public-batch-button",
      message: "Validacao do servidor deve permitir registro em lote da fonte publica.",
    },
    {
      file: "identity-validation-addon.js",
      snippet: "recordPublicValidationEvidence",
      message: "Validacao do servidor deve centralizar registro auditavel da evidencia publica.",
    },
    {
      file: "identity-validation-addon.js",
      snippet: "identity-public-coverage",
      message: "Validacao do servidor deve exibir cobertura da fonte publica.",
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
      file: "pilot-qa-addon.js",
      snippet: "publicValidationCoverage.complete",
      message: "Homologacao deve exigir cobertura fresca de fonte publica.",
    },
    {
      file: "operational-queue-addon.js",
      snippet: "publicValidationPending",
      message: "Fila operacional deve cobrar evidencia publica configurada e ainda nao auditada.",
    },
    {
      file: "operational-queue-addon.js",
      snippet: "staleFileValidations",
      message: "Fila operacië]9¶‰žËkºwµçM…È”Ù½±Ñ…È•¹ÑÉ”•Ñ…Á…Ì¸ˆ°(€€€ô°(€€€ì(€€€€€™¥±”è€‰‘•µ¼µÍÉ¥ÁÐµ…‘‘½¸¹©Ìˆ°(€€€€€Í¹¥ÁÁ•Ðè€‰‘•µ¼µÍÉ¥ÁÐµÕÉÉ•¹Ðµ¡•¬ˆ°(€€€€€µ•ÍÍ…”è€‰5½‘¼Õ¥…‘¼‘¼É½Ñ•¥É¼‘•Ù”µ…É…È•Ù¥‘•¹¥„‘„•Ñ…Á„…ÑÕ…°¸ˆ°(€€€ô°(€€€ì(€€€€€™¥±”è€‰Á¥±½ÐµÅ„µ…‘‘½¸¹©Ìˆ°(€€€€€Í¹¥ÁÁ•Ðè€‰É•½É‘A¥±½ÑE…ÁÁÉ½Ù…°ˆ°(€€€€€µ•ÍÍ…”è€‰!½µ½±½……¼‘•Ù”É•¥ÍÑÉ…È¡•­Á½¥¹ÐÉ•ÕÑ¥±¥é…Ù•°Á•±„ÁÉ½¹Ñ¥‘…¼¸ˆ°(€€€ô°(€€€ì(€€€€€™¥±”è€‰Á¥±½ÐµÅ„µ…‘‘½¸¹©Ìˆ°(€€€€€Í¹¥ÁÁ•Ðè€‰•ÑA¥±½ÑE…ÁÁÉ½Ù…±É•Í¡¹•ÍÌˆ°(€€€€€µ•ÍÍ…”è€‰!½µ½±½……¼‘•Ù”‘•Ñ•Ñ…È…•¥Ñ”É•¥ÍÑÉ…‘¼‘•Í…ÑÕ…±¥é…‘¼¸ˆ°(€€€ô°(€€€ì(€€€€€™¥±”è€‰Á¥±½ÐµÅ„µ…‘‘½¸¹©Ìˆ°(€€€€€Í¹¥ÁÁ•Ðè€‰•ÑA¥±½ÑE…ÁÁÉ½Ù…±M¹…ÁÍ¡½Ðˆ°(€€€€€µ•ÍÍ…”è€‰!½µ½±½……¼‘•Ù”½µÁ…É…È¼¡•­Á½¥¹Ð½´…Ì•Ù¥‘•¹¥…Ì…ÑÕ…¥Ì¸ˆ°(€€€ô°(€€€ì(€€€€€™¥±”è€‰Á¥±½ÐµÅ„µ…‘‘½¸¹©Ìˆ°(€€€€€Í¹¥ÁÁ•Ðè€‰Ù¥‘•¹¥…Ì‘¼…•¥Ñ”ˆ°(€€€€€µ•ÍÍ…”è€‰!½µ½±½……¼‘•Ù”•á¥‰¥È•Ù¥‘•¹¥…ÌÉ¥Ñ¥…Ì‘¼Õ±Ñ¥µ¼…•¥Ñ”¸ˆ°(€€€ô°(€€€ì(€€€€€™¥±”è€‰Á¥±½ÐµÅ„µ…‘‘½¸¹©Ìˆ°(€€€€€Í¹¥ÁÁ•Ðè€‰¹•áÑA•¹‘¥¹œˆ°(€€€€€µ•ÍÍ…”è€‰!½µ½±½……¼‘•Ù”Õ…É‘…È„ÁÉ½á¥µ„Á•¹‘•¹¥„¹¼¡•­Á½¥¹Ð¸ˆ°(€€€ô°(€€€ì(€€€€€™¥±”è€‰Á¥±½ÐµÅ„µ…‘‘½¸¹©Ìˆ°(€€€€€Í¹¥ÁÁ•Ðè€‰ÍÑ…Ñ”¹±…ÍÑA…åÉ½±±±½Í¥¹•¥Í¥½¸ˆ°(€€€€€µ•ÍÍ…”è€‰¡•­Á½¥¹Ð‘”¡½µ½±½……¼‘•Ù”É•¥ÍÑÉ…È‘•¥Í…¼‘”™•¡…µ•¹Ñ¼¸ˆ°(€€€ô°(€€€ì(€€€€€™¥±”è€‰Á¥±½ÐµÅ„µ…‘‘½¸¹©Ìˆ°(€€€€€Í¹¥ÁÁ•Ðè€‰•ÑA¥±½ÑE…MÑ…”ˆ°(€€€€€µ•ÍÍ…”è€‰!½µ½±½……¼‘•Ù”‘¥™•É•¹¥…È‘•µ¼°Á¥±½Ñ¼½¹ÑÉ½±…‘¼”½Á•É……¼É•…°¸ˆ°(€€€ô°(€€€ì(€€€€€™¥±”è€‰Á¥±½ÐµÅ„µ…‘‘½¸¹©Ìˆ°(€€€€€Í¹¥ÁÁ•Ðè€‰•ÑA¥±½ÑE…MÑ…•MÕµµ…Éäˆ°(€€€€€µ•ÍÍ…”è€‰!½µ½±½……¼‘•Ù”•áÁ½ÈÉ•ÍÕµ¼É•ÕÑ¥±¥é…Ù•°‘¼•ÍÑ…¥¼½Á•É…¥½¹…°¸ˆ°(€€€ô°(€€€ì(€€€€€™¥±”è€‰Á¥±½Ðµ™±½Üµ…‘‘½¸¹©Ìˆ°(€€€€€Í¹¥ÁÁ•Ðè€‰•ÑA¥±½Ñ•µ½MÉ¥ÁÑMÕµµ…Éäˆ°(€€€€€µ•ÍÍ…”è€‰±Õá¼Á¥±½Ñ¼‘•Ù”•áÁ½ÈÁÉ½É•ÍÍ¼‘¼É½Ñ•¥É¼‘”…ÁÉ•Í•¹Ñ……¼¸ˆ°(€€€ô°(€€€ì(€€€€€™¥±”è€‰Á¥±½Ðµ™±½Üµ…‘‘½¸¹©Ìˆ°(€€€€€Í¹¥ÁÁ•Ðè€‰Á¥±½Ðµ‘•µ¼µÍÉ¥ÁÐµ…Ñ¥½¸ˆ°(€€€€€µ•ÍÍ…”è€‰±Õá¼Á¥±½Ñ¼‘•Ù”…‰É¥È¼É½Ñ•¥É¼‘”…ÁÉ•Í•¹Ñ……¼Í•´‘•Á•¹‘•È‘„±…Ñ•É…°¸ˆ°(€€€ô°(€€€ì(€€€€€™¥±”è€‰Á¥±½ÐµÅ„µ…‘‘½¸¹©Ìˆ°(€€€€€Í¹¥ÁÁ•Ðè€‰1¥µ¥Ñ”‘”ÕÍ¼ˆ°(€€€€€µ•ÍÍ…”è€‰!½µ½±½……¼‘•Ù”•Ù¥‘•¹¥…È±¥µ¥Ñ”…¹Ñ•Ì‘”½Á•É……¼É•…°¸ˆ°(€€€ô°(€€€ì(€€€€€™¥±”è€‰É•…‘¥¹•ÍÌµ…‘‘½¸¹©Ìˆ°(€€€€€Í¹¥ÁÁ•Ðè€‰Å…ÁÁÉ½Ù…±M½É”ˆ°(€€€€€µ•ÍÍ…”è€‰AÉ½¹Ñ¥‘…¼‘•Ù”½¹Í¥‘•É…È…•¥Ñ”É•¥ÍÑÉ…‘¼¹„¡½µ½±½……¼¸ˆ°(€€€ô°(€€€ì(€€€€€™¥±”è€‰É•…‘¥¹•ÍÌµ…‘‘½¸¹©Ìˆ°(€€€€€Í¹¥ÁÁ•Ðè€‰Å…ÁÁÉ½Ù…±É•Í¡¹•ÍÌ¹™É•Í ˆ°(€€€€€µ•ÍÍ…”è€‰AÉ½¹Ñ¥‘…¼‘•Ù”½¹Í¥‘•É…ÈÍ½µ•¹Ñ”…•¥Ñ”‘”¡½µ½±½……¼…ÑÕ…±¥é…‘¼¸ˆ°(€€€ô°(€€€ì(€€€€€™¥±”è€‰É•…‘¥¹•ÍÌµ…‘‘½¸¹©Ìˆ°(€€€€€Í¹¥ÁÁ•Ðè€‰•ÑI•…‘¥¹•ÍÍ9•áÑÑ¥½¸ˆ°(€€€€€µ•ÍÍ…”è€‰AÉ½¹Ñ¥‘…¼‘•Ù”…‰É¥È¼µ½‘Õ±¼…¥½¹…Ù•°‘¼ÁÉ½á¥µ¼É¥Ñ•É¥¼¸ˆ°(€€€ô°(€€€ì(€€€€€™¥±”è€‰É•…‘¥¹•ÍÌµ…‘‘½¸¹©Ìˆ°(€€€€€Í¹¥ÁÁ•Ðè€‰ÁÉ½á¥µ¼™½¼ˆ°(€€€€€µ•ÍÍ…”è€‰AÉ½¹Ñ¥‘…¼‘•Ù”‘•ÍÑ……È„™É•¹Ñ”‘¼ÁÉ½á¥µ¼É¥Ñ•É¥¼¸ˆ°(€€€ô°(€€€ì(€€€€€™¥±”è€‰É•…‘¥¹•ÍÌµ…‘‘½¸¹©Ìˆ°(€€€€€Í¹¥ÁÁ•Ðè€ˆ¹É•…‘¥¹•ÍÌµ¥Ñ•´¹¹•áÐˆ°(€€€€€µ•ÍÍ…”è€‰AÉ½¹Ñ¥‘…¼‘•Ù”‘•ÍÑ……È¼É¥Ñ•É¥¼Á•¹‘•¹Ñ”…ÑÕ…°¸ˆ°(€€€ô°(€€€ì(€€€€€™¥±”è€‰É•…‘¥¹•ÍÌµ…‘‘½¸¹©Ìˆ°(€€€€€Í¹¥ÁÁ•Ðè€‰•ÑI•…‘¥¹•ÍÍÁÁÉ½Ù…±1…‰•°ˆ°(€€€€€µ•ÍÍ…”è€‰AÉ½¹Ñ¥‘…¼‘•Ù”•á¥‰¥È¼…•¥Ñ”É•¥ÍÑÉ…‘¼‘„¡½µ½±½……¼¸ˆ°(€€€ô°(€€€ì(€€€€€™¥±”è€‰É•…‘¥¹•ÍÌµ…‘‘½¸¹©Ìˆ°(€€€€€Í¹¥ÁÁ•Ðè€‰•ÑI•…‘¥¹•ÍÍÁÁÉ½Ù…±Ù¥‘•¹”ˆ°(€€€€€µ•ÍÍ…”è€‰AÉ½¹Ñ¥‘…¼‘•Ù”•á¥‰¥È•Ù¥‘•¹¥…Ì‘¼…•¥Ñ”‘”¡½µ½±½……¼¸ˆ°(€€€ô°(€€€ì(€€€€€™¥±”è€‰É•…‘¥¹•ÍÌµ…‘‘½¸¹©Ìˆ°(€€€€€Í¹¥ÁÁ•Ðè€‰Ù¥‘•¹¥…Ì‘¼…•¥Ñ”ˆ°(€€€€€µ•ÍÍ…”è€‰AÉ½¹Ñ¥‘…¼‘•Ù”±¥ÍÑ…ÈÁÉ½Ñ½½±¼°™•¡…µ•¹Ñ¼”ÁÉ½á¥µ„Á•¹‘•¹¥„‘¼…•¥Ñ”¸ˆ°(€€€ô°(€€€ì(€€€€€™¥±”è€‰É½…‘µ…Àµ…‘‘½¸¹©Ìˆ°(€€€€€Í¹¥ÁÁ•Ðè€‰AÉ½á¥µ¼É¥Ñ•É¥¼ˆ°(€€€€€µ•ÍÍ…”è€‰I½…‘µ…À‘•Ù”µ…¹Ñ•È™½¼É•½µ•¹‘…‘¼½´É¥Ñ•É¥¼Á•¹‘•¹Ñ”‘„ÁÉ½¹Ñ¥‘…¼¸ˆ°(€€€ô°(€€€ì(€€€€€™¥±”è€‰É½…‘µ…Àµ…‘‘½¸¹©Ìˆ°(€€€€€Í¹¥ÁÁ•Ðè€‰•ÑI½…‘µ…ÁÉ¥Ñ•É¥½¹Q…É•Ðˆ°(€€€€€µ•ÍÍ…”è€‰I½…‘µ…À‘•Ù”‘¥É•¥½¹…È¼™½¼Á…É„¼µ½‘Õ±¼…¥½¹…Ù•°‘¼É¥Ñ•É¥¼¸ˆ°(€€€ô°(€€€ì(€€€€€™¥±”è€‰©½ÕÉ¹•äµÍ¡•±°µ…‘‘½¸¹©Ìˆ°(€€€€€Í¹¥ÁÁ•Ðè€‰…Ñ¥½¹M½ÕÉ”¹Ñ…É•Ðˆ°(€€€€€µ•ÍÍ…”è€‰)½É¹…‘„ÍÕÁ•É¥½È‘•Ù”…‰É¥È¼™½¼…¥½¹…Ù•°‘¼É½…‘µ…ÀÅÕ…¹‘¼¹…¼¡½ÕÙ•ÈÁÉ¥½É¥‘…‘”¸ˆ°(€€€ô°(€€€ì(€€€€€™¥±”è€‰©½ÕÉ¹•äµÍ¡•±°µ…‘‘½¸¹©Ìˆ°(€€€€€Í¹¥ÁÁ•Ðè€‰•Ñ)½ÕÉ¹•åÑ¥½¹M½ÕÉ”ˆ°(€€€€€µ•ÍÍ…”è€‰)½É¹…‘„ÍÕÁ•É¥½È‘•Ù”•áÁ±¥…È„½É¥•´‘„ÁÉ½á¥µ„……¼¸ˆ°(€€€ô°(€€€ì(€€€€€™¥±”è€‰©½ÕÉ¹•äµÍ¡•±°µ…‘‘½¸¹©Ìˆ°(€€€€€Í¹¥ÁÁ•Ðè€‰•Ñ)½ÕÉ¹•å]½É­ÍÑÉ•…µÌˆ°(€€€€€µ•ÍÍ…”è€‰)½É¹…‘„ÍÕÁ•É¥½È‘•Ù”…ÉÕÁ…Èµ½‘Õ±½ÌÁ½È™É•¹Ñ”½Á•É…¥½¹…°¸ˆ°(€€€ô°(€€€ì(€€€€€™¥±”è€‰©½ÕÉ¹•äµÍ¡•±°µ…‘‘½¸¹©Ìˆ°(€€€€€Í¹¥ÁÁ•Ðè€‰•ÑAÉ¥µ…ÉåM¥‘•‰…É9…Ù¥…Ñ¥½¸ˆ°(€€€€€µ•ÍÍ…”è€‰5•¹Ô±…Ñ•É…°‘•Ù”µ½ÍÑÉ…È™É•¹Ñ•ÌÁÉ¥¹¥Á…¥Ì•´Ù•è‘”Ñ½‘½Ì½Ìµ½‘Õ±½Ì¸ˆ°(€€€ô°(€€€ì(€€€€€™¥±”è€‰©½ÕÉ¹•äµÍ¡•±°µ…‘‘½¸¹©Ìˆ°(€€€€€Í¹¥ÁÁ•Ðè€‰•ÑAÉ¥µ…ÉåM¥‘•‰…ÉQ…É•Ðˆ°(€€€€€µ•ÍÍ…”è€‰5•¹Ô±…Ñ•É…°ÁÉ¥¹¥Á…°‘•Ù”…‰É¥È„ÁÉ½á¥µ„……¼‘„™É•¹Ñ”½Á•É…¥½¹…°¸ˆ°(€€€ô°(€€€ì(€€€€€™¥±”è€‰©½ÕÉ¹•äµÍ¡•±°µ…‘‘½¸¹©Ìˆ°(€€€€€Í¹¥ÁÁ•Ðè€‰‘…Ñ„µÁÉ¥µ…Éäµ¹…Øˆ°(€€€€€µ•ÍÍ…”è€‰%Ñ•¹ÌÁÉ¥¹¥Á…¥Ì‘¼µ•¹Ô‘•Ù•´…ÉÉ•…È…±Ù¼½Á•É…¥½¹…°…±Õ±…‘¼¸ˆ°(€€€ô°(€€€ì(€€€€€™¥±”è€‰©½ÕÉ¹•äµÍ¡•±°µ…‘‘½¸¹©Ìˆ°(€€€€€Í¹¥ÁÁ•Ðè€‰¹…ØµÍ•½¹‘…Éäˆ°(€€€€€µ•ÍÍ…”è€‰5½‘Õ±½ÌÍ•Õ¹‘…É¥½Ì‘•Ù•´Í…¥È‘¼µ•¹Ô±…Ñ•É…°”½¹Ñ¥¹Õ…È…•ÍÍ¥Ù•¥ÌÁ•±„©½É¹…‘„¸ˆ°(€€€ô°(€€€ì(€€€€€™¥±”è€‰µ½‘Õ±”µ©ÕµÀµ…‘‘½¸¹©Ìˆ°(€€€€€Í¹¥ÁÁ•Ðè€‰•Ñ5½‘Õ±•)ÕµÁÉ½ÕÁÌˆ°(€€€€€µ•ÍÍ…”è€‰M•±•Ñ½ÈÍÕÁ•É¥½È‘•Ù”…ÉÕÁ…Èµ½‘Õ±½ÌÁ½È•Ñ…Á„‘„©½É¹…‘„¸ˆ°(€€€ô°(€€€ì(€€€€€™¥±”è€‰µ½‘Õ±”µ©ÕµÀµ…‘‘½¸¹©Ìˆ°(€€€€€Í¹¥ÁÁ•Ðè€‰½ÁÑÉ½ÕÀˆ°(€€€€€µ•ÍÍ…”è€‰M•±•Ñ½ÈÍÕÁ•É¥½È‘•Ù”ÕÍ…ÈÉÕÁ½ÌÁ…É„É•‘Õé¥ÈÍ•¹Í……¼‘”±¥ÍÑ„±½¹„¸ˆ°(€€€ô°(€€€ì(€€€€€™¥±”è€‰©½ÕÉ¹•äµÍ¡•±°µ…‘‘½¸¹©Ìˆ°(€€€€€Í¹¥ÁÁ•Ðè€‰©½ÕÉ¹•äµÝ½É­ÍÑÉ•…´ˆ°(€€€€€µ•ÍÍ…”è€‰)½É¹…‘„ÍÕÁ•É¥½È‘•Ù”É•¹‘•É¥é…ÈÉÕÁ½Ì‘”ÑÉ…‰…±¡¼°¹…¼…Á•¹…Ì±¥ÍÑ„Á±…¹„¸ˆ°(€€€ô°(€€€ì(€€€€€™¥±”è€‰©½ÕÉ¹•äµÍ¡•±°µ…‘‘½¸¹©Ìˆ°(€€€€€Í¹¥ÁÁ•Ðè€‰©½ÕÉ¹•äµ½¹Ñ•áÐµ‰…Èˆ°(€€€€€µ•ÍÍ…”è€‰)½É¹…‘„ÍÕÁ•É¥½È‘•Ù”µ½ÍÑÉ…È½¹Ñ•áÑ¼…ÑÕ…°‘„™É•¹Ñ”°ÉÕÁ¼°µ½‘Õ±¼”ÁÉ½á¥µ„……¼¸ˆ°(€€€ô°(€€€ì(€€€€€™¥±”è€‰©½ÕÉ¹•äµÍ¡•±°µ…‘‘½¸¹©Ìˆ°(€€€€€Í¹¥ÁÁ•Ðè€‰©½ÕÉ¹•äµ½¹Ñ•áÐµÍÕµµ…Éäˆ°(€€€€€µ•ÍÍ…”è€‰)½É¹…‘„ÍÕÁ•É¥½È‘•Ù”µ…¹Ñ•È¼½¹Ñ•áÑ¼•´Õ´É•ÍÕµ¼½µÁ…Ñ¼¸ˆ°(€€€ô°(€€€ì(€€€€€™¥±”è€‰©½ÕÉ¹•äµÍ¡•±°µ…‘‘½¸¹©Ìˆ°(€€€€€Í¹¥ÁÁ•Ðè€‰•ÑÑ¥Ù•)½ÕÉ¹•å]½É­ÍÑÉ•…´ˆ°(€€€€€µ•ÍÍ…”è€‰)½É¹…‘„ÍÕÁ•É¥½È‘•Ù”¥‘•¹Ñ¥™¥…È¼ÉÕÁ¼½Á•É…¥½¹…°…Ñ¥Ù¼¸ˆ°(€€€ô°(€€€ì(€€€€€™¥±”è€‰©½ÕÉ¹•äµÍ¡•±°µ…‘‘½¸¹©Ìˆ°(€€€€€Í¹¥ÁÁ•Ðè€‰•Ñ)½ÕÉ¹•å]½É­ÍÑÉ•…µQ…É•Ðˆ°(€€€€€µ•ÍÍ…”è€‰ÉÕÁ½Ì½µÁ…Ñ½Ì‘„©½É¹…‘„‘•Ù•´…Á½¹Ñ…ÈÁ…É„Õ´µ½‘Õ±¼…¥½¹…Ù•°¸ˆ°(€€€ô°(€€€ì(€€€€€™¥±”è€‰©½ÕÉ¹•äµÍ¡•±°µ…‘‘½¸¹©Ìˆ°(€€€€€Í¹¥ÁÁ•Ðè€‰©½ÕÉ¹•äµÝ½É­ÍÑÉ•…´µ½Á•¸ˆ°(€€€€€µ•ÍÍ…”è€‰)½É¹…‘„ÍÕÁ•É¥½È‘•Ù”½µÁ…Ñ…ÈÉÕÁ½Ì¥¹…Ñ¥Ù½ÌÍ•´Á•É‘•È…•ÍÍ¼¸ˆ°(€€€ô°(€€€ì(€€€€€™¥±”è€‰‘…Í¡‰½…Éµ½µµ…¹µ…‘‘½¸¹©Ìˆ°(€€€€€Í¹¥ÁÁ•Ðè€‰‘…Í¡‰½…É‘I½…‘µ…Á½ÕÌˆ°(€€€€€µ•ÍÍ…”è€‰A…¥¹•°¥¹¥¥…°‘•Ù”•áÁ½È™½¼É•½µ•¹‘…‘¼‘¼É½…‘µ…À¸ˆ°(€€€ô°(€€€ì(€€€€€™¥±”è€‰‘…Í¡‰½…Éµ½µµ…¹µ…‘‘½¸¹©Ìˆ°(€€€€€Í¹¥ÁÁ•Ðè€‰‘…Í¡‰½…É‘E…ÁÁÉ½Ù…±1…‰•°ˆ°(€€€€€µ•ÍÍ…”è€‰A…¥¹•°¥¹¥¥…°‘•Ù”•áÁ½ÈÕ±Ñ¥µ¼…•¥Ñ”‘”¡½µ½±½……¼¸ˆ°(€€€ô°(€€€ì(€€€€€™¥±”è€‰‘…Í¡‰½…Éµ½µµ…¹µ…‘‘½¸¹©Ìˆ°(€€€€€Í¹¥ÁÁ•Ðè€‰‘…Í¡‰½…É‘E…ÁÁÉ½Ù…±Ù¥‘•¹”ˆ°(€€€€€µ•ÍÍ…”è€‰A…¥¹•°¥¹¥¥…°‘•Ù”•áÁ½È•Ù¥‘•¹¥…Ì‘¼…•¥Ñ”‘”¡½µ½±½……¼¸ˆ°(€€€ô°(€€€ì(€€€€€™¥±”è€‰‘…Í¡‰½…Éµ½µµ…¹µ…‘‘½¸¹©Ìˆ°(€€€€€Í¹¥ÁÁ•Ðè€‰•ÑA¥±½ÑE…ÁÁÉ½Ù…±É•Í¡¹•ÍÌˆ°(€€€€€µ•ÍÍ…”è€‰A…¥¹•°¥¹¥¥…°‘•Ù”…Ù¥Í…ÈÅÕ…¹‘¼¼…•¥Ñ”‘”¡½µ½±½……¼•ÍÑ¥Ù•È‘•Í…ÑÕ…±¥é…‘¼¸ˆ°(€€€ô°(€€€ì(€€€€€™¥±”è€‰‘…Í¡‰½…Éµ½µµ…¹µ…‘‘½¸¹©Ìˆ°(€€€€€Í¹¥ÁÁ•Ðè€‘…Ñ„µÑ…É•ÐµÙ¥•Üô‰Å„ˆœ°(€€€€€µ•ÍÍ…”è€‰A…¥¹•°¥¹¥¥…°‘•Ù”…‰É¥È¡½µ½±½……¼„Á…ÉÑ¥È‘¼É•ÍÕµ¼‘”…•¥Ñ”¸ˆ°(€€€ô°(€€€ì(€€€€€™¥±”è€‰‘…Í¡‰½…Éµ½µµ…¹µ…‘‘½¸¹©Ìˆ°(€€€€€Í¹¥ÁÁ•Ðè€‰‘…Í¡‰½…É‘E…MÑ…•1…‰•°ˆ°(€€€€€µ•ÍÍ…”è€‰A…¥¹•°¥¹¥¥…°‘•Ù”•áÁ½È•ÍÑ…¥¼…ÑÕ…°‘„¡½µ½±½……¼¸ˆ°(€€€ô°(€€€ì(€€€€€™¥±”è€‰‘…Í¡‰½…Éµ½µµ…¹µ…‘‘½¸¹©Ìˆ°(€€€€€Í¹¥ÁÁ•Ðè€‰‘…Í¡‰½…É‘½ÕÍ=É¥¥¸ˆ°(€€€€€µ•ÍÍ…”è€‰A…¥¹•°¥¹¥¥…°‘•Ù”•áÁ±¥…È„½É¥•´‘¼™½¼É•½µ•¹‘…‘¼¸ˆ°(€€€ô°(€€€ì(€€€€€™¥±”è€‰‘…Í¡‰½…Éµ½µµ…¹µ…‘‘½¸¹©Ìˆ°(€€€€€Í¹¥ÁÁ•Ðè€‰‘…Í¡‰½…Éµ½µµ…¹µÁÉ¥µ…Éäˆ°(€€€€€µ•ÍÍ…”è€‰A…¥¹•°¥¹¥¥…°‘•Ù”‘•ÍÑ……È¼™½¼É•½µ•¹‘…‘¼½µ¼……¼ÁÉ¥¹¥Á…°¸ˆ°(€€€ô°(€€€ì(€€€€€™¥±”è€‰‘…Í¡‰½…Éµ½µµ…¹µ…‘‘½¸¹©Ìˆ°(€€€€€Í¹¥ÁÁ•Ðè€‰‘…Í¡‰½…É‘½µÁ…ÑQ•áÐˆ°(€€€€€µ•ÍÍ…”è€‰A…¥¹•°¥¹¥¥…°‘•Ù”½µÁ…Ñ…ÈÑ•áÑ½Ì±½¹½Ì¹¼½­Á¥Ð½Á•É…¥½¹…°¸ˆ°(€€€ô°(€€€ì(€€€€€™¥±”è€‰É½…‘µ…Àµ…‘‘½¸¹©Ìˆ°(€€€€€Í¹¥ÁÁ•Ðè€‰±…‰•±]¥Ñ¡M½É”ˆ°(€€€€€µ•ÍÍ…”è€‰I½…‘µ…À‘•Ù”µ½ÍÑÉ…È¼•ÍÑ…¥¼‘”¡½µ½±½……¼©Õ¹Ñ¼‘¼™½¼¸ˆ°(€€€ô°(€€€ì(€€€€€™¥±”è€‰É½…‘µ…Àµ…‘‘½¸¹©Ìˆ°(€€€€€Í¹¥ÁÁ•Ðè€‰•ÑI½…‘µ…ÁÁÁÉ½Ù…±Ù¥‘•¹”ˆ°(€€€€€µ•ÍÍ…”è€‰I½…‘µ…À‘•Ù”•áÁ±¥…È•Ù¥‘•¹¥…Ì‘¼…•¥Ñ”ÅÕ…¹‘¼¼™½¼™½È¡½µ½±½……¼¸ˆ°(€€€ô°(€€€ì(€€€€€™¥±”è€‰Á¥±½Ðµ™±½Üµ…‘‘½¸¹©Ìˆ°(€€€€€Í¹¥ÁÁ•Ðè€ˆä¸•¡…È½µÁ•Ñ•¹¥„ˆ°(€€€€€µ•ÍÍ…”è€‰±Õá¼Á¥±½Ñ¼‘•Ù”µ…¹Ñ•È™•¡…µ•¹Ñ¼…¹Ñ•Ì‘„…Õ‘¥Ñ½É¥„°…Á½ÌÁÉ½Ñ½½±¼”‰…¥á„¸ˆ°(€€€ô°(€tì((€É•ÅÕ¥É•‘M¹¥ÁÁ•ÑÌ¹™½É…  ¡ì™¥±”°Í¹¥ÁÁ•Ð°µ•ÍÍ…”ô¤€ôøì(€€€¥˜€ …•á¥ÍÑÌ¡™¥±”¤¤ì(€€€€€™…¥°¡€‘í™¥±•ôè…ÉÅÕ¥Ù¼•ÍÁ•É…‘¼Á…É„‘•¥Í…¼É••¹Ñ”¹…¼•á¥ÍÑ”¹€¤ì(€€€€€É•ÑÕÉ¸ì(€€€ô((€€€¥˜€ …É•…¡™¥±”¤¹¥¹±Õ‘•Ì¡Í¹¥ÁÁ•Ð¤¤ì(€€€€€™…¥°¡€‘í™¥±•ôè€‘íµ•ÍÍ…•õ€¤ì(€€€ô(€ô¤ì)ô()™Õ¹Ñ¥½¸¡•­½Õµ•¹Ñ…Ñ¥½¹	…Í¥Ì ¤ì(€½¹ÍÐ‘½Ì€ôl(€€€ì(€€€€€™¥±”è€‰I5¹µˆ°(€€€€€Í¹¥ÁÁ•ÑÌèl(€€€€€€€€‰¡ÑÑÁÌè¼½Ñ¡¥…¼Üàä¹¥Ñ¡Õˆ¹¥¼½µ…É•´µ±…É„¼ˆ°(€€€€€€€€‰)½É¹…‘„½Á•É…¥½¹…°Õ¥…‘„ˆ°(€€€€€€€€‰¹…Ù•……¼ÁÉ½Ñ•¥‘„ˆ°(€€€€€€€€‰¹½‘”Ñ½½±Ì½ÍÑ…Ñ¥Œµ¡•¬¹©Ìˆ°(€€€€€t°(€€€ô°(€€€ì(€€€€€™¥±”è€‰•ÍÑ…‘¼µ‘¼µÁÉ½©•Ñ¼¹µˆ°(€€€€€Í¹¥ÁÁ•ÑÌèl(€€€€€€€€‰ÑÕ…±¥é…‘¼•´è€ÈÀÈØ´ÀÜ´ÈÀˆ°(€€€€€€€€‰5…É¼‘”½¹Í½±¥‘……¼‘¼5Y@•ÍÑ…Ñ¥¼ˆ°(€€€€€€€€‰9…Ù•……¼‰±½ÅÕ•…‘„Á½ÈÁ•É™¥°ˆ°(€€€€€€€€‰Õ‘¥Ñ½É¥„‘•Ù”É•ÍÕµ¥È•Ù•¹Ñ½ÌÍ•¹Í¥Ù•¥Ìˆ°(€€€€€€€€‰!½µ½±½……¼‘•Ù”Ù…±¥‘…È¹…Ù•……¼ÁÉ½Ñ•¥‘„ˆ°(€€€€€€€€‰Õ‘¥Ñ½É¥„‘•Ù”Á•Éµ¥Ñ¥È•É…È•Ù¥‘•¹¥„½¹ÑÉ½±…‘„‘”‰±½ÅÕ•¥¼‘”É•‘•¹¥…µ•¹Ñ¼ˆ°(€€€€€t°(€€€ô°(€€€ì(€€€€€™¥±”è€‰¥‘•¥…Ìµ”µ‘•¥Í½•ÌµÁÉ½‘ÕÑ¼¹µˆ°(€€€€€Í¹¥ÁÁ•ÑÌèl(€€€€€€€€‰Y¥Í…¼ÍÑÉ…Ñ•¥„µÁ±¥…‘„ˆ°(€€€€€€€€‰µÁÉ•ÍÑ¥µ¼½¹Í¥¹…‘¼°…ÉÑ…¼½¹Í¥¹…‘¼”…ÉÑ…¼‰•¹•™¥¥¼Í…¼ÁÉ½‘ÕÑ½Ì•ÍÍ•¹¥…¥Ìˆ°(€€€€€€€€‰%Á…É„„½¹Í¥¹…Ñ…É¥„½ÔÁÉ•ÍÑ…‘½Èˆ°(€€€€€€€€‰%¹Ñ•±¥•¹¥„‘”½¹Ñ•ÌAÕ‰±¥…Ìˆ°(€€€€€€€€‰½¹Í¥¹…‘¼%¹Ñ•É…‘¼„½µÁÉ…Ì”A¥àˆ°(€€€€€t°(€€€ô°(€€€ì(€€€€€™¥±”è€‰¥¹Ù•¹Ñ…É¥¼µ‘½µ¥¹¥¼µØÈ¹µˆ°(€€€€€Í¹¥ÁÁ•ÑÌèl(€€€€€€€€‰A…ÉÑ”½¹Ù•¹¥…‘„”É•‘•¹¥…µ•¹Ñ¼ˆ°(€€€€€€€€‰…ÉÑ½•Ìˆ°(€€€€€€€€‰•Í½¹Ñ½Ì…Õ±Ñ…Ñ¥Ù½Ìˆ°(€€€€€€€€‰¥±¼‘”½±¡„ˆ°(€€€€€€€€‰Ù•¹Ñ½Ì‘”½µ¥¹¥¼ˆ°(€€€€€t°(€€€ô°(€€€ì(€€€€€™¥±”è€‰µ½‘•±¼µ‘…‘½ÌµØÈ¹µˆ°(€€€€€Í¹¥ÁÁ•ÑÌèl(€€€€€€€€‰Á…ÉÑ¥•Ìˆ°(€€€€€€€€‰µ…É¥¹}…½Õ¹ÑÌˆ°(€€€€€€€€‰É•‘¥Ñ}½¹ÑÉ…ÑÌˆ°(€€€€€€€€‰‘•‘ÕÑ¥½¹}…ÕÑ¡½É¥é…Ñ¥½¹Ìˆ°(€€€€€€€€‰…É‘}…½Õ¹ÑÌˆ°(€€€€€€€€‰Á…åÉ½±±}•¹ÑÉ¥•Ìˆ°(€€€€€€€€‰É•½¹¥±¥…Ñ¥½¹Ìˆ°(€€€€€t°(€€€ô°(€€€ì(€€€€€™¥±”è€‰…ÉÅÕ¥Ñ•ÑÕÉ„µ‰…­•¹µØÄ¹µˆ°(€€€€€Í¹¥ÁÁ•ÑÌèl(€€€€€€€€‰µ½¹½±¥Ñ¼µ½‘Õ±…Èˆ°(€€€€€€€€‰QÉ…¹Í…½•ÌÉ¥Ñ¥…Ìˆ°(€€€€€€€€‰AÉ¥µ•¥É¼±Õá¼Y•ÉÑ¥…°I•…°ˆ°(€€€€€€€€‰‘Õ…ÌÉ•Í•ÉÙ…Ì½¹½ÉÉ•¹Ñ•Ì¹…¼Õ±ÑÉ…Á…ÍÍ…´„µ…É•´ˆ°(€€€€€€€€‰…Ñ”Á…É„%¹¥¥…È¼M…™™½±ˆ°(€€€€€t°(€€€ô°(€€€ì(€€€€€™¥±”è€‰‰…­•¹½Á…­…”¹©Í½¸ˆ°(€€€€€Í¹¥ÁÁ•ÑÌèl(€€€€€€€€‰µ…É•´µ±…É„½‰…­•¹ˆ°(€€€€€€€€‰ÁÉ¥Íµ„éÙ…±¥‘…Ñ”ˆ°(€€€€€€€€‰Á¹Á´ÑåÁ•¡•¬€˜˜Á¹Á´Ñ•ÍÐˆ°(€€€€€t°(€€€ô°(€€€ì(€€€€€™¥±”è€‰‰…­•¹½ÁÉ¥Íµ„½Í¡•µ„¹ÁÉ¥Íµ„ˆ°(€€€€€Í¹¥ÁÁ•ÑÌèl(€€€€€€€€‰µ½‘•°É••µ•¹Ðˆ°(€€€€€€€€‰µ½‘•°É•‘¥Ñ…Ñ¥½¸ˆ°(€€€€€€€€‰µ½‘•°¹É½±±µ•¹Ðˆ°(€€€€€€€€‰µ½‘•°Õ‘¥ÑÙ•¹Ðˆ°(€€€€€€€€‰µ½‘•°=ÕÑ‰½áÙ•¹Ðˆ°(€€€€€t°(€€€ô°(€€€ì(€€€€€™¥±”è€‰‰…­•¹½ÍÉŒ½Á±…Ñ™½É´½…•ÍÌµ½¹ÑÉ½°½…É••µ•¹ÐµÍ½Á”¹ÑÌˆ°(€€€€€Í¹¥ÁÁ•ÑÌèl(€€€€€€€€‰É•ÅÕ¥É•É••µ•¹ÑM½Á”ˆ°(€€€€€€€€‰•ÍÍ•¹¥•‘ÉÉ½Èˆ°(€€€€€€€€‰µ•µ‰•ÉÍ¡¥À¹Á…ÉÑå%€ôôôÉ•ÅÕ¥É•‘A…ÉÑå%ˆ°(€€€€€t°(€€€ô°(€tì((€‘½Ì¹™½É…  ¡ì™¥±”°Í¹¥ÁÁ•ÑÌô¤€ôøì(€€€¥˜€ …•á¥ÍÑÌ¡™¥±”¤¤ì(€€€€€™…¥°¡€‘í™¥±•ôè‘½Õµ•¹Ñ¼•ÍÍ•¹¥…°¹…¼•¹½¹ÑÉ…‘¼¹€¤ì(€€€€€É•ÑÕÉ¸ì(€€€ô((€€€½¹ÍÐ½¹Ñ•¹Ð€ôÉ•…¡™¥±”¤ì(€€€Í¹¥ÁÁ•ÑÌ¹™½É…  ¡Í¹¥ÁÁ•Ð¤€ôøì(€€€€€¥˜€ …½¹Ñ•¹Ð¹¥¹±Õ‘•Ì¡Í¹¥ÁÁ•Ð¤¤ì(€€€€€€€™…¥°¡€‘í™¥±•ôè‘½Õµ•¹Ñ……¼•ÍÍ•¹¥…°…ÕÍ•¹Ñ”½Ô‘•Í…ÑÕ…±¥é…‘„è€‘íÍ¹¥ÁÁ•Ñô¹€¤ì(€€€€€ô(€€€ô¤ì(€ô¤ì)ô()™Õ¹Ñ¥½¸¡•­Mµ½­•Q•ÍÑá¥ÍÑÌ ¤ì(€½¹ÍÐÍµ½­”€ô€‰Ñ½½±Ì½Íµ½­”µÑ•ÍÐ¹©Ìˆì(€¥˜€ …•á¥ÍÑÌ¡Íµ½­”¤¤ì(€€€™…¥° ‰Mµ½­”Ñ•ÍÐ‘”©½É¹…‘„¹…¼•¹½¹ÑÉ…‘¼•´Ñ½½±Ì½Íµ½­”µÑ•ÍÐ¹©Ì¸ˆ¤ì(€€€É•ÑÕÉ¸ì(€ô((€½¹ÍÐ½¹Ñ•¹Ð€ôÉ•…¡Íµ½­”¤ì(€l(€€€€‰±½…‘A±…åÝÉ¥¡Ðˆ°(€€€€‰½É•Y¥•ÝÌˆ°(€€€€‰µ½‰¥±”ˆ°(€€€€‰•áÁ•ÑA…•UÍ…‰±”ˆ°(€€€€‰•á•É¥Í•¥±•Y…±¥‘…Ñ¥½¹M¹…ÁÍ¡½Ðˆ°(€€€€‰•á•É¥Í•5…É¥¹I•±•…Í•A½±¥äˆ°(€€€€‰•á•É¥Í•AÕ‰±¥Y…±¥‘…Ñ¥½¹	…Ñ ˆ°(€€€€‰•á•É¥Í•¥±•AÉ½Ñ½½±M¹…ÁÍ¡½Ðˆ°(€€€€‰•á•É¥Í•A…åÉ½±±±½Í¥¹•¥Í¥½¸ˆ°(€€€€‰•á•É¥Í•A¥±½ÑE…ÁÁÉ½Ù…±É•Í¡¹•ÍÌˆ°(€€€€‰¥‘•¹Ñ¥ÑäµÁÕ‰±¥Œµ‰…Ñ µ‰ÕÑÑ½¸ˆ°(€€€€‰•ÑA¥±½ÑE…M•¹…É¥½Ìˆ°(€€€€‰½¹ÍÕ±Ñ„‘”™½¹Ñ”ÁÕ‰±¥„ˆ°(€€€€‰•Í…ÑÕ…±¥é…‘„ˆ°(€€€€‰•Ñ=Á•É…Ñ¥½¹…±EÕ•Õ•…Ñ„ˆ°(€€€€‰•Ñ=Á•É…Ñ¥½¹…±I¥Í­MÕµµ…Éäˆ°(€€€€‰‘…Í¡‰½…Éµ½µµ…¹µ•¹Ñ•Èˆ°(€€€€‰©½ÕÉ¹•äµÝ½É­ÍÑÉ•…´ˆ°(€€€€‰•Ñ)½ÕÉ¹•å]½É­ÍÑÉ•…µÌˆ°(€€€€‰	…Í””µ…É•´ˆ°(€€€€‰µ½‘Õ±½ÌÍ•Õ¹‘…É¥½Ì¹…¼™½É…´É•½±¡¥‘½Ìˆ°(€€€€‰µ•¹ÔÁÉ¥¹¥Á…°¹…¼…Á½¹Ñ„Á…É„…±Ù½Ì½Á•É…¥½¹…¥Ìˆ°(€€€€‰Í•±•Ñ½ÈÍÕÁ•É¥½È¹…¼½É…¹¥é½Ôµ½‘Õ±½ÌÁ½È•Ñ…Á„ˆ°(€€€€‰I¥Í½Ì½Á•É…¥½¹…¥Ìˆ°(€€€€‰¥‘•¹Ñ¥ÑäµÁÕ‰±¥Œµ•Ù¥‘•¹”µ‰ÕÑÑ½¸ˆ°(€€€€‰…ÕÑ¡•¹Ñ¥¥ÑäµÍ¥¹…°µ±¥ÍÐˆ°(€€€€‰Ù…±¥‘…Ñ¥½¸µ…Õ‘¥Ðµ‰ÕÑÑ½¸ˆ°(€€€€‰É•Í•ÉÙ…Ñ¥½¸µÍÕµµ…ÉäµÉ¥ˆ°(€€€€‰…‘©ÕÍÑµ•¹ÑÌµ±¥ÍÐˆ°(€€€€‰5…¹Ñ•´µ…É•´ˆ°(€€€€‰Q5@µ(µI)Qˆ°(€€€€‰Q5@µ(µ%YI9Pˆ°(€€€€‰¡¥ÍÑ½É¥¼‘¼…©ÕÍÑ”¹…¼ÁÉ•Í•ÉÙ½Ô•Ù¥‘•¹¥„½É¥¥¹…°ˆ°(€€€€‰•Ñ¥±•Y…±¥‘…Ñ¥½¹É•Í¡¹•ÍÌˆ°(€€€€‰ÉÅÕ¥Ù¼‘”µ…É•´‘•Í…ÑÕ…±¥é…‘¼ˆ°(€€€€‰ÁÉ½Ñ½½±Ìµ…Õ‘¥Ðµ‰ÕÑÑ½¸ˆ°(€€€€‰AÉ½Ñ½½±¼‘”É•µ•ÍÍ„É•¥ÍÑÉ…‘¼ˆ°(€€€€‰•Ñ¥±•AÉ½Ñ½½±É•Í¡¹•ÍÌˆ°(€€€€‰AÉ½Ñ½½±¼‘•Í…ÑÕ…±¥é…‘¼ˆ°(€€€€‰±½Í¥¹œµ…Õ‘¥Ðµ‰ÕÑÑ½¸ˆ°(€€€€‰•¥Í…¼‘”™•¡…µ•¹Ñ¼É•¥ÍÑÉ…‘„ˆ°(€€€€‰Q5@µ1=M%9µ	Q ˆ°(€€€€‰µÕ‘…¹„•´±½Ñ”¹…¼¥¹Ù…±¥‘½Ô‘•¥Í…¼‘”™•¡…µ•¹Ñ¼ˆ°(€€€€‰•ÑA…åÉ½±±±½Í¥¹•¥Í¥½¹É•Í¡¹•ÍÌˆ°(€€€€‰Å„µ…Õ‘¥Ðµ‰ÕÑÑ½¸ˆ°(€€€€‰•ÑA¥±½ÑE…ÁÁÉ½Ù…±É•Í¡¹•ÍÌˆ°(€t¹™½É…  ¡Í¹¥ÁÁ•Ð¤€ôøì(€€€¥˜€ …½¹Ñ•¹Ð¹¥¹±Õ‘•Ì¡Í¹¥ÁÁ•Ð¤¤ì(€€€€€™…¥°¡Ñ½½±Ì½Íµ½­”µÑ•ÍÐ¹©Ì¹…¼½‰É”¼ÑÉ•¡¼•ÍÁ•É…‘¼è€‘íÍ¹¥ÁÁ•Ñô¹€¤ì(€€€ô(€ô¤ì)ô()™Õ¹Ñ¥½¸¡•­M•ÕÉ¥Ñå¡•­á¥ÍÑÌ ¤ì(€½¹ÍÐÍ•ÕÉ¥Ñä€ô€‰Ñ½½±Ì½Í•ÕÉ¥Ñäµ¡•¬¹©Ìˆì(€¥˜€ …•á¥ÍÑÌ¡Í•ÕÉ¥Ñä¤¤ì(€€€™…¥° ‰M•ÕÉ¥Ñä¡•¬¹…¼•¹½¹ÑÉ…‘¼•´Ñ½½±Ì½Í•ÕÉ¥Ñäµ¡•¬¹©Ì¸ˆ¤ì(€€€É•ÑÕÉ¸ì(€ô((€½¹ÍÐ½¹Ñ•¹Ð€ôÉ•…¡Í•ÕÉ¥Ñä¤ì(€l(€€€€‰Í•É•ÑA…ÑÑ•É¹Ìˆ°(€€€€‰Ñ½­•¸=Á•¹$ˆ°(€€€€‰Ñ½­•¸¥Ñ!Õˆˆ°(€€€€ˆ¹•¹Øˆ°(€€€€‰M•ÕÉ¥Ñä¡•¬Á…ÍÍ•ˆ°(€t¹™½É…  ¡Í¹¥ÁÁ•Ð¤€ôøì(€€€¥˜€ …½¹Ñ•¹Ð¹¥¹±Õ‘•Ì¡Í¹¥ÁÁ•Ð¤¤ì(€€€€€™…¥°¡Ñ½½±Ì½Í•ÕÉ¥Ñäµ¡•¬¹©Ì¹…¼½‰É”¼ÑÉ•¡¼•ÍÁ•É…‘¼è€‘íÍ¹¥ÁÁ•Ñô¹€¤ì(€€€ô(€ô¤ì)ô()™Õ¹Ñ¥½¸¡•­Í¥¥5…É­‘½Ý¹½Ì ¤ì(€™Ì¹É•…‘‘¥ÉMå¹Œ¡É½½Ð¤(€€€€¹™¥±Ñ•È ¡™¥±”¤€ôø™¥±”¹•¹‘Í]¥Ñ  ˆ¹µˆ¤¤(€€€€¹™½É…  ¡™¥±”¤€ôøì(€€€€€½¹ÍÐ½¹Ñ•¹Ð€ôÉ•…¡™¥±”¤ì(€€€€€½¹ÍÐµ…Ñ €ô½¹Ñ•¹Ð¹µ…Ñ  ½myqàÀÀµqàÝt¼¤ì(€€€€€¥˜€¡µ…Ñ ¤ì(€€€€€€€™…¥°¡€‘í™¥±•ôè…É…Ñ•É”¹…¼M%$•¹½¹ÑÉ…‘¼¸A…‘É½¹¥é”‘½Õµ•¹Ñ½Ì•´M%$Á…É„•Ù¥Ñ…ÈÁÉ½‰±•µ…Ì‘”•¹½‘¥¹œ¹€¤ì(€€€€€ô(€€€ô¤ì)ô()¡•­…¡•Y•ÉÍ¥½¸ ¤ì)¡•­‘‘½¹¥±•Ì ¤ì)¡•­‘‘½¹1¥ÍÑ%¹Ñ•É¥Ñä ¤ì)¡•­‘‘½¹•Á•¹‘•¹å=É‘•È ¤ì)¡•­)…Ù…MÉ¥ÁÑMå¹Ñ…à ¤ì)¡•­ÕÁ±¥…Ñ•‘MÑ…ÑÕÍIÕ±•Ì ¤ì)¡•­)½ÕÉ¹•åY¥•Ý±¥…Í•Ì ¤ì)¡•­)½ÕÉ¹•åY¥•ÝÍá¥ÍÐ ¤ì)¡•­I••¹Ñ•¥Í¥½¹½Ù•É…” ¤ì)¡•­½Õµ•¹Ñ…Ñ¥½¹	…Í¥Ì ¤ì)¡•­Mµ½­•Q•ÍÑá¥ÍÑÌ ¤ì)¡•­M•ÕÉ¥Ñå¡•­á¥ÍÑÌ ¤ì)¡•­Í¥¥5…É­‘½Ý¹½Ì ¤ì()¥˜€¡™…¥±ÕÉ•Ì¹±•¹Ñ ¤ì(€½¹Í½±”¹•ÉÉ½È ‰MÑ…Ñ¥Œ¡•¬™…¥±•èˆ¤ì(€™…¥±ÕÉ•Ì¹™½É…  ¡™…¥±ÕÉ”¤€ôø½¹Í½±”¹•ÉÉ½È¡€´€‘í™…¥±ÕÉ•õ€¤¤ì(€ÁÉ½•ÍÌ¹•á¥Ð Ä¤ì)ô()½¹Í½±”¹±½œ ‰MÑ…Ñ¥Œ¡•¬Á…ÍÍ•è…¡”°…‘‘½¹Ì”É•É…Ì•¹ÑÉ…¥Ì½¹Í¥ÍÑ•¹Ñ•Ì¸ˆ¤ì(