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

  const coreViews = [
    ["dashboard", "#dashboard-command-center"],
    ["queue", "#queue-priority-list"],
    ["pilot", "#pilot-step-list"],
    ["identity", "#identity-public-evidence-button"],
    ["authenticity", "#authenticity-signal-list"],
    ["validation", "#validation-audit-button"],
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
