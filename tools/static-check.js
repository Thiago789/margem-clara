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

checkCacheVersion();
checkAddonFiles();
checkAddonListIntegrity();
checkAddonDependencyOrder();
checkJavaScriptSyntax();
checkDuplicatedStatusRules();
checkJourneyViewAliases();
checkJourneyViewsExist();

if (failures.length) {
  console.error("Static check failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Static check passed: cache, addons e regras centrais consistentes.");
