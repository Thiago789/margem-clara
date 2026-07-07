const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const failures = [];
const consoleErrors = [];
const pageErrors = [];

function fail(message) {
  failures.push(message);
}

function getRuntimeNodeModules() {
  const userProfile = process.env.USERPROFILE || process.env.HOME;
  if (!userProfile) return [];

  return [
    path.join(userProfile, ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "node", "node_modules"),
  ];
}

function loadPlaywright() {
  try {
    return require("playwright");
  } catch (error) {
    const runtimeModules = getRuntimeNodeModules();
    for (const modulesDir of runtimeModules) {
      const pnpmDir = path.join(modulesDir, ".pnpm");
      if (!fs.existsSync(pnpmDir)) continue;

      const candidate = fs
        .readdirSync(pnpmDir)
        .find((entry) => entry.startsWith("playwright@") && fs.existsSync(path.join(pnpmDir, entry, "node_modules", "playwright")));
      if (!candidate) continue;

      return require(path.join(pnpmDir, candidate, "node_modules", "playwright"));
    }

    throw error;
  }
}

function fileUrl(filePath) {
  return `file:///${filePath.replace(/\\/g, "/").replace(/^([A-Za-z]):/, "$1:")}`;
}

function findSystemChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    path.join(process.env.PROGRAMFILES || "", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env["PROGRAMFILES(X86)"] || "", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env.PROGRAMFILES || "", "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(process.env["PROGRAMFILES(X86)"] || "", "Microsoft", "Edge", "Application", "msedge.exe"),
  ];

  return candidates.find((candidate) => candidate && fs.existsSync(candidate));
}

async function expectVisible(page, selector, label) {
  try {
    await page.locator(selector).first().waitFor({ state: "visible", timeout: 5000 });
  } catch (error) {
    const count = await page.locator(selector).count();
    if (!count) {
      fail(`${label}: seletor nao encontrado (${selector}).`);
      return;
    }
    fail(`${label}: elemento nao ficou visivel (${selector}).`);
  }
}

async function openView(page, view) {
  await page.evaluate((target) => {
    if (typeof openView !== "function") throw new Error(`openView indisponivel para ${target}`);
    openView(target);
  }, view);
  await expectVisible(page, `#${view}-view.view.active`, `Modulo ${view}`);
}

async function exercisePublicValidationBatch(page, scenarioName) {
  await openView(page, "identity");
  await expectVisible(page, "#identity-public-batch-button", `${scenarioName}: botao de validacao publica em lote`);
  await page.locator("#identity-public-batch-button").click();
  await expectVisible(page, "#identity-public-coverage", `${scenarioName}: cobertura de fonte publica`);

  const result = await page.evaluate(() => {
    const coverage = typeof getPublicValidationCoverage === "function" ? getPublicValidationCoverage() : null;
    const qaPublicScenario = typeof getPilotQaScenarios === "function"
      ? getPilotQaScenarios().find((scenario) => scenario.title === "Fonte publica configuravel e auditavel")
      : null;
    const readinessPublicItem = typeof getReadinessGroups === "function"
      ? getReadinessGroups()
          .flatMap((group) => group.items)
          .find(([label]) => label === "Consulta de fonte publica")
      : null;
    const auditFound = state.movements.some(
      (movement) =>
        movement.source === "Validacao do servidor" &&
        /fonte publica em lote/i.test(movement.text || "")
    );
    return {
      recorded: coverage?.recorded || 0,
      fresh: coverage?.fresh || 0,
      total: coverage?.total || 0,
      auditFound,
      qaOk: Boolean(qaPublicScenario?.ok),
      readinessStatus: readinessPublicItem?.[1] || "",
    };
  });

  if (result.total <= 0) {
    fail(`${scenarioName}: cobertura de fonte publica sem servidores.`);
  }
  if (result.recorded <= 0 || result.fresh <= 0) {
    fail(`${scenarioName}: registro em lote nao gerou evidencia fresca.`);
  }
  if (!result.auditFound) {
    fail(`${scenarioName}: registro em lote nao gerou auditoria.`);
  }
  if (!result.qaOk) {
    fail(`${scenarioName}: homologacao nao reconheceu cobertura fresca de fonte publica.`);
  }
  if (result.readinessStatus !== "Demo") {
    fail(`${scenarioName}: prontidao nao marcou fonte publica como Demo apos lote.`);
  }

  const staleResult = await page.evaluate(() => {
    const employee = state.employees.find((item) => item.status === "Ativo") || state.employees[0];
    if (!employee) return { hasEmployee: false };

    employee.enrollment = `${employee.enrollment}-ALT`;
    saveState();

    const evidence = getPublicValidationEvidence(employee);
    const marginFreshness = typeof getFileValidationFreshness === "function"
      ? getFileValidationFreshness("margin")
      : null;
    const queue = typeof getOperationalQueueData === "function" ? getOperationalQueueData() : null;
    const queueFound = Boolean(
      queue?.items.some(
        (item) => item.area === "Validacao publica" && /desatualizada/i.test(item.detail || "")
      )
    );
    const marginQueueFound = Boolean(
      queue?.items.some(
        (item) => item.area === "Validacao de arquivos" && item.title === "Arquivo de margem desatualizado"
      )
    );

    return {
      hasEmployee: true,
      stale: Boolean(evidence?.stale),
      status: evidence?.status || "",
      marginFresh: Boolean(marginFreshness?.fresh),
      marginLabel: marginFreshness?.label || "",
      queueFound,
      marginQueueFound,
    };
  });

  if (!staleResult.hasEmployee) {
    fail(`${scenarioName}: massa sem servidor para teste de evidencia desatualizada.`);
  }
  if (!staleResult.stale || staleResult.status !== "Desatualizada") {
    fail(`${scenarioName}: mudanca no servidor nao marcou fonte publica como desatualizada.`);
  }
  if (!staleResult.queueFound) {
    fail(`${scenarioName}: fila nao cobrou evidencia publica desatualizada.`);
  }
  if (staleResult.marginFresh || staleResult.marginLabel !== "Desatualizado") {
    fail(`${scenarioName}: mudanca no servidor nao invalidou validacao de margem.`);
  }
  if (!staleResult.marginQueueFound) {
    fail(`${scenarioName}: fila nao cobrou validacao de margem desatualizada.`);
  }
}

async function exerciseFileValidationSnapshot(page, scenarioName) {
  await openView(page, "validation");
  await expectVisible(page, "#validation-audit-button", `${scenarioName}: botao de validacao de arquivos`);
  await page.locator("#validation-audit-button").click();
  await expectVisible(page, "#validation-summary-grid", `${scenarioName}: resumo de validacao de arquivos`);

  const result = await page.evaluate(() => {
    const marginFreshness = typeof getFileValidationFreshness === "function" ? getFileValidationFreshness("margin") : null;
    const insertionFreshness = typeof getFileValidationFreshness === "function" ? getFileValidationFreshness("insertion") : null;
    const auditFound = state.movements.some(
      (movement) =>
        movement.source === "Validacao de arquivos" &&
        /Validacao dos arquivos registrada/i.test(movement.text || "")
    );

    return {
      hasMargin: Boolean(state.lastMarginValidation),
      hasInsertion: Boolean(state.lastInsertionValidation),
      marginFresh: Boolean(marginFreshness?.fresh),
      insertionFresh: Boolean(insertionFreshness?.fresh),
      marginLabel: marginFreshness?.label || "",
      insertionLabel: insertionFreshness?.label || "",
      auditFound,
    };
  });

  if (!result.hasMargin || !result.hasInsertion) {
    fail(`${scenarioName}: validacao nao gravou snapshots de margem e insercao.`);
  }
  if (!result.marginFresh) {
    fail(`${scenarioName}: validacao de margem registrada ja nasceu desatualizada (${result.marginLabel}).`);
  }
  if (!result.insertionFresh) {
    fail(`${scenarioName}: validacao de insercao registrada ja nasceu desatualizada (${result.insertionLabel}).`);
  }
  if (!result.auditFound) {
    fail(`${scenarioName}: validacao de arquivos nao gerou auditoria.`);
  }
}

async function exerciseFileProtocolSnapshot(page, scenarioName) {
  await openView(page, "protocols");
  await expectVisible(page, "#protocols-audit-button", `${scenarioName}: botao de protocolo de arquivo`);
  await page.locator("#protocols-audit-button").click();
  await expectVisible(page, "#protocol-summary-grid", `${scenarioName}: resumo de protocolos`);

  const result = await page.evaluate(() => {
    const protocol = state.lastFileProtocol;
    const freshness = typeof getFileProtocolFreshness === "function" ? getFileProtocolFreshness() : null;
    const auditFound = state.movements.some(
      (movement) =>
        movement.source === "Protocolos de arquivo" &&
        /Protocolo de remessa registrado/i.test(movement.text || "")
    );

    return {
      hasProtocol: Boolean(protocol),
      totalBatches: protocol?.totalBatches || 0,
      records: protocol?.records || 0,
      status: protocol?.status || "",
      fresh: Boolean(freshness?.fresh),
      freshnessLabel: freshness?.label || "",
      auditFound,
    };
  });

  if (!result.hasProtocol) {
    fail(`${scenarioName}: protocolo de arquivo nao congelou snapshot.`);
  }
  if (result.totalBatches <= 0 || result.records <= 0) {
    fail(`${scenarioName}: protocolo registrado sem lotes ou registros.`);
  }
  if (!["Com pendencia", "Parcial", "Registrado"].includes(result.status)) {
    fail(`${scenarioName}: protocolo registrado com status inesperado: ${result.status}.`);
  }
  if (!result.fresh) {
    fail(`${scenarioName}: protocolo registrado ja nasceu desatualizado (${result.freshnessLabel}).`);
  }
  if (!result.auditFound) {
    fail(`${scenarioName}: protocolo registrado nao gerou auditoria.`);
  }
}

async function exerciseMarginReleasePolicy(page, scenarioName) {
  await openView(page, "reservations");
  await expectVisible(page, "#reservation-summary-grid", `${scenarioName}: resumo da esteira de reservas`);

  const result = await page.evaluate(() => {
    const employee = state.employees[0];
    if (!employee) return { hasEmployee: false };

    const before = calculateMargin(employee).available;
    const contract = {
      id: "TMP-MARGIN-HOLD",
      employeeId: employee.id,
      lenderId: "lender-1",
      installment: 123,
      installments: 12,
      status: "Nao descontado",
      createdAt: today(),
    };
    state.contracts.push(contract);

    const noDiscount = calculateMargin(employee).available;
    const holdEffect = typeof contractMarginEffect === "function" ? contractMarginEffect(contract) : null;
    contract.status = "Rejeitado";
    const rejected = calculateMargin(employee).available;
    const releaseEffect = typeof contractMarginEffect === "function" ? contractMarginEffect(contract) : null;
    state.contracts = state.contracts.filter((item) => item.id !== contract.id);

    return {
      hasEmployee: true,
      before,
      noDiscount,
      rejected,
      holdLabel: holdEffect?.label || "",
      releaseLabel: releaseEffect?.label || "",
    };
  });

  if (!result.hasEmployee) {
    fail(`${scenarioName}: massa sem servidor para testar efeito de margem.`);
  }
  if (Math.abs((result.before - result.noDiscount) - 123) > 0.01) {
    fail(`${scenarioName}: Nao descontado nao segurou margem ate decisao formal.`);
  }
  if (Math.abs(result.rejected - result.before) > 0.01) {
    fail(`${scenarioName}: Rejeitado nao liberou margem.`);
  }
  if (result.holdLabel !== "Mantem margem" || result.releaseLabel !== "Libera margem") {
    fail(`${scenarioName}: efeito de margem por status nao esta explicito.`);
  }
}

async function exercisePayrollClosingDecision(page, scenarioName) {
  await openView(page, "closing");
  await expectVisible(page, "#closing-audit-button", `${scenarioName}: botao de decisao de fechamento`);
  await page.locator("#closing-audit-button").click();
  await expectVisible(page, "#closing-decision-panel", `${scenarioName}: painel de decisao de fechamento`);

  const result = await page.evaluate(() => {
    const data = typeof getPayrollClosingData === "function" ? getPayrollClosingData() : null;
    const freshness = typeof getPayrollClosingDecisionFreshness === "function"
      ? getPayrollClosingDecisionFreshness(data)
      : null;
    const auditFound = state.movements.some(
      (movement) =>
        movement.source === "Fechamento" &&
        /Decisao de fechamento registrada/i.test(movement.text || "")
    );

    return {
      hasDecision: Boolean(state.lastPayrollClosingDecision),
      fresh: Boolean(freshness?.fresh),
      label: freshness?.label || "",
      auditFound,
    };
  });

  if (!result.hasDecision) {
    fail(`${scenarioName}: decisao de fechamento nao foi registrada.`);
  }
  if (!result.fresh) {
    fail(`${scenarioName}: decisao de fechamento registrada ja nasceu desatualizada (${result.label}).`);
  }
  if (!result.auditFound) {
    fail(`${scenarioName}: decisao de fechamento nao gerou auditoria.`);
  }
}

async function exercisePilotQaApprovalFreshness(page, scenarioName) {
  await openView(page, "qa");
  await expectVisible(page, "#qa-audit-button", `${scenarioName}: botao de homologacao`);
  await page.locator("#qa-audit-button").click();
  await expectVisible(page, "#qa-summary-grid", `${scenarioName}: resumo de homologacao`);

  const result = await page.evaluate(() => {
    const freshness = typeof getPilotQaApprovalFreshness === "function" ? getPilotQaApprovalFreshness() : null;
    const auditFound = state.movements.some(
      (movement) =>
        movement.source === "Homologacao" &&
        /Homologacao do MVP registrada/i.test(movement.text || "")
    );

    return {
      hasApproval: Boolean(state.pilotQaApproval),
      fresh: Boolean(freshness?.fresh),
      label: freshness?.label || "",
      auditFound,
    };
  });

  if (!result.hasApproval) {
    fail(`${scenarioName}: homologacao nao registrou checkpoint.`);
  }
  if (!result.fresh) {
    fail(`${scenarioName}: homologacao registrada ja nasceu desatualizada (${result.label}).`);
  }
  if (!result.auditFound) {
    fail(`${scenarioName}: homologacao registrada nao gerou auditoria.`);
  }

  const staleResult = await page.evaluate(() => {
    const contract = state.contracts[0];
    if (!contract) return { hasContract: false };

    contract.status = contract.status === "Enviado para folha" ? "Reservado" : "Enviado para folha";
    saveState();

    const protocolFreshness = getFileProtocolFreshness();
    const closingFreshness = getPayrollClosingDecisionFreshness();
    const approvalFreshness = getPilotQaApprovalFreshness();
    const queue = typeof getOperationalQueueData === "function" ? getOperationalQueueData() : null;
    const queueFound = Boolean(
      queue?.items.some(
        (item) => item.area === "Protocolos" && item.title === "Protocolo desatualizado"
      )
    );
    return {
      hasContract: true,
      protocolFresh: Boolean(protocolFreshness?.fresh),
      protocolLabel: protocolFreshness?.label || "",
      closingFresh: Boolean(closingFreshness?.fresh),
      closingLabel: closingFreshness?.label || "",
      approvalFresh: Boolean(approvalFreshness?.fresh),
      approvalLabel: approvalFreshness?.label || "",
      queueFound,
    };
  });

  if (!staleResult.hasContract) {
    fail(`${scenarioName}: massa sem contrato para testar fechamento desatualizado.`);
  }
  if (staleResult.protocolFresh || staleResult.protocolLabel !== "Desatualizado") {
    fail(`${scenarioName}: mudanca contratual nao invalidou protocolo de arquivo.`);
  }
  if (staleResult.closingFresh || staleResult.closingLabel !== "Desatualizada") {
    fail(`${scenarioName}: mudanca contratual nao invalidou decisao de fechamento.`);
  }
  if (staleResult.approvalFresh || staleResult.approvalLabel !== "Desatualizado") {
    fail(`${scenarioName}: mudanca contratual nao invalidou aceite de homologacao.`);
  }
  if (!staleResult.queueFound) {
    fail(`${scenarioName}: fila nao cobrou protocolo desatualizado.`);
  }
}

async function expectPageUsable(page, label) {
  const layout = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
  }));

  if (layout.scrollWidth > layout.clientWidth + 6) {
    fail(`${label}: pagina com overflow horizontal (${layout.scrollWidth}px > ${layout.clientWidth}px).`);
  }

  if (layout.scrollHeight <= layout.innerHeight + 24) return;

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => window.scrollTo(0, 900));
  const scrollY = await page.evaluate(() => window.scrollY);
  if (scrollY <= 0) {
    fail(`${label}: conteudo maior que a tela, mas rolagem vertical nao funcionou.`);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function runScenario(browser, scenario) {
  const page = await browser.newPage({ viewport: scenario.viewport });

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(`${scenario.name}: ${message.text()}`);
  });
  page.on("pageerror", (error) => {
    pageErrors.push(`${scenario.name}: ${error.message}`);
  });

  await page.goto(fileUrl(path.join(root, "index.html")), { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#dashboard-view", { state: "visible", timeout: 5000 });

  await expectVisible(page, "#dashboard-command-center", `${scenario.name}: Cockpit inicial`);
  await expectVisible(page, "#journey-shell", `${scenario.name}: Jornada operacional`);
  await expectVisible(page, ".journey-workstream", `${scenario.name}: grupos da jornada operacional`);
  await expectVisible(page, ".dashboard-command-card:has-text(\"Riscos operacionais\")", `${scenario.name}: resumo de riscos operacionais`);

  const riskSummary = await page.evaluate(() => {
    const summary = typeof getOperationalRiskSummary === "function" ? getOperationalRiskSummary() : null;
    const workstreams = typeof getJourneyWorkstreams === "function" ? getJourneyWorkstreams(getJourneyStages()[0]) : [];
    return {
      available: Boolean(summary),
      total: summary?.total ?? -1,
      hasLabel: Boolean(summary?.label),
      risksArray: Array.isArray(summary?.risks),
      workstreams: workstreams.length,
    };
  });

  if (!riskSummary.available || !riskSummary.hasLabel || !riskSummary.risksArray || riskSummary.total < 0) {
    fail(`${scenario.name}: resumo de riscos operacionais nao esta estruturado.`);
  }
  if (riskSummary.workstreams < 2) {
    fail(`${scenario.name}: jornada operacional nao agrupou modulos por frente.`);
  }

  const coreViews = [
    ["dashboard", "#dashboard-command-center"],
    ["queue", "#queue-priority-list"],
    ["pilot", "#pilot-step-list"],
    ["identity", "#identity-public-evidence-button"],
    ["authenticity", "#authenticity-signal-list"],
    ["validation", "#validation-audit-button"],
    ["reservations", "#reservation-summary-grid"],
    ["protocols", "#protocols-audit-button"],
    ["closing", "#closing-audit-button"],
    ["qa", "#qa-audit-button"],
    ["readiness", "#readiness-grid"],
    ["roadmap", "#roadmap-list"],
    ["audit", "#audit-view"],
  ];

  for (const [view, selector] of coreViews) {
    await openView(page, view);
    await expectVisible(page, selector, `${scenario.name}: Conteudo principal de ${view}`);
    await expectPageUsable(page, `${scenario.name}: ${view}`);
  }

  await exerciseFileValidationSnapshot(page, scenario.name);
  await exerciseMarginReleasePolicy(page, scenario.name);
  await exerciseFileProtocolSnapshot(page, scenario.name);
  await exercisePayrollClosingDecision(page, scenario.name);
  await exercisePilotQaApprovalFreshness(page, scenario.name);
  await exercisePublicValidationBatch(page, scenario.name);

  const guardedViews = await page.evaluate(() => {
    const config = profileConfig?.manager || { views: [] };
    return config.views.filter((view) => !document.getElementById(`${view}-view`));
  });

  if (guardedViews.length) {
    fail(`${scenario.name}: perfil gestor aponta para tela sem DOM: ${guardedViews.join(", ")}.`);
  }

  await page.close();
}

async function run() {
  const { chromium } = loadPlaywright();
  const chromePath = findSystemChrome();
  const browser = await chromium.launch({
    headless: true,
    ...(chromePath ? { executablePath: chromePath } : {}),
  });

  const scenarios = [
    { name: "desktop", viewport: { width: 1440, height: 1100 } },
    { name: "mobile", viewport: { width: 390, height: 844 } },
  ];

  for (const scenario of scenarios) {
    await runScenario(browser, scenario);
  }

  if (consoleErrors.length) {
    fail(`Console error no navegador: ${consoleErrors.join(" | ")}`);
  }

  if (pageErrors.length) {
    fail(`Erro JavaScript no navegador: ${pageErrors.join(" | ")}`);
  }

  await browser.close();
}

run()
  .then(() => {
    if (failures.length) {
      console.error(`Smoke test failed:\n- ${failures.join("\n- ")}`);
      process.exit(1);
    }
    console.log("Smoke test passed: jornada principal do gestor carregou sem erros.");
  })
  .catch((error) => {
    console.error(`Smoke test failed:\n- ${error.message}`);
    process.exit(1);
  });
