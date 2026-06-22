const fs = require("fs");
const path = require("path");

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
  const audit = read("audit-addon.js");
  const addonBlock = audit.match(/function loadMissingAddons\(\) \{[\s\S]*?\[([\s\S]*?)\]\.forEach\(loadAddonScript\);/);

  if (!addonBlock) {
    fail("Nao foi possivel localizar a lista de addons em audit-addon.js.");
    return;
  }

  const addons = Array.from(addonBlock[1].matchAll(/"([^"]+\.js)"/g), (match) => match[1]);
  if (!addons.length) {
    fail("A lista de addons em audit-addon.js esta vazia.");
    return;
  }

  addons.forEach((addon) => {
    if (!exists(addon)) {
      fail(`Addon listado mas nao encontrado: ${addon}.`);
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

checkCacheVersion();
checkAddonFiles();
checkDuplicatedStatusRules();

if (failures.length) {
  console.error("Static check failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Static check passed: cache, addons e regras centrais consistentes.");
