function renderAudit() {
  const table = document.getElementById("audit-table");
  if (!table) return;

  const rows = state.movements.map((movement) => {
    const profile = movement.profile || "Sistema";
    const source = movement.source || "MVP";
    return `
      <tr>
        <td>${movement.date}</td>
        <td>${movement.text}</td>
        <td><span class="status">${profile}</span></td>
        <td>${source}</td>
      </tr>
    `;
  });

  table.innerHTML = rows.length
    ? rows.join("")
    : `<tr><td colspan="4">Nenhum evento registrado ainda.</td></tr>`;
}

if (!pageTitles.audit) {
  pageTitles.audit = "Auditoria";
}

if (!profileConfig.manager.views.includes("audit")) {
  profileConfig.manager.views.push("audit");
}

const renderWithoutAuditAddon = render;
render = function renderWithAuditAddon() {
  renderWithoutAuditAddon();
  renderAudit();
};

render();

function hasAddonScript(filename) {
  return Array.from(document.scripts).some((script) => script.src.split("?")[0].endsWith(filename));
}

function loadAddonScript(filename) {
  if (hasAddonScript(filename)) return;
  const script = document.createElement("script");
  script.src = `${filename}?v=20260521-1`;
  document.body.appendChild(script);
}

function loadMissingAddons() {
  [
    "file-exchange-addon.js",
    "file-validation-addon.js",
    "convention-policy-addon.js",
    "authorization-flow-addon.js",
    "audit-enhancements-addon.js",
    "convention-settings-addon.js",
    "margin-health-addon.js",
    "payroll-cycle-addon.js",
    "file-reconciliation-addon.js",
    "file-protocol-addon.js",
    "payroll-closing-addon.js",
    "payroll-adjustments-addon.js",
    "integration-addon.js",
    "api-sandbox-addon.js",
    "identity-validation-addon.js",
    "authenticity-addon.js",
    "assistant-insights-addon.js",
    "debt-insights-addon.js",
    "business-rules-addon.js",
    "module-jump-addon.js",
    "operational-queue-addon.js",
    "pilot-flow-addon.js",
    "pilot-qa-addon.js",
    "roadmap-addon.js",
    "data-model-addon.js",
    "field-catalog-addon.js",
    "enrollment-addon.js",
    "readiness-addon.js",
    "demo-data-addon.js",
    "reservation-lifecycle-addon.js",
    "product-rules-addon.js",
    "product-margin-addon.js",
    "lender-product-accreditation-addon.js",
    "contract-rules-addon.js",
    "competency-installments-addon.js",
    "lender-management-addon.js",
    "file-layouts-addon.js",
    "access-control-addon.js",
  ].forEach(loadAddonScript);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", loadMissingAddons, { once: true });
} else {
  loadMissingAddons();
}
