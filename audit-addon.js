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
  return Array.from(document.scripts).some((script) => script.src.endsWith(filename));
}

if (!hasAddonScript("file-exchange-addon.js")) {
  const fileExchangeScript = document.createElement("script");
  fileExchangeScript.src = "file-exchange-addon.js";
  document.body.appendChild(fileExchangeScript);
}

if (!hasAddonScript("convention-policy-addon.js")) {
  const conventionPolicyScript = document.createElement("script");
  conventionPolicyScript.src = "convention-policy-addon.js";
  document.body.appendChild(conventionPolicyScript);
}

if (!hasAddonScript("authorization-flow-addon.js")) {
  const authorizationFlowScript = document.createElement("script");
  authorizationFlowScript.src = "authorization-flow-addon.js";
  document.body.appendChild(authorizationFlowScript);
}

if (!hasAddonScript("audit-enhancements-addon.js")) {
  const auditEnhancementsScript = document.createElement("script");
  auditEnhancementsScript.src = "audit-enhancements-addon.js";
  document.body.appendChild(auditEnhancementsScript);
}

if (!hasAddonScript("convention-settings-addon.js")) {
  const conventionSettingsScript = document.createElement("script");
  conventionSettingsScript.src = "convention-settings-addon.js";
  document.body.appendChild(conventionSettingsScript);
}

if (!hasAddonScript("margin-health-addon.js")) {
  const marginHealthScript = document.createElement("script");
  marginHealthScript.src = "margin-health-addon.js";
  document.body.appendChild(marginHealthScript);
}

if (!hasAddonScript("integration-addon.js")) {
  const integrationScript = document.createElement("script");
  integrationScript.src = "integration-addon.js";
  document.body.appendChild(integrationScript);
}

if (!hasAddonScript("identity-validation-addon.js")) {
  const identityValidationScript = document.createElement("script");
  identityValidationScript.src = "identity-validation-addon.js";
  document.body.appendChild(identityValidationScript);
}

if (!hasAddonScript("assistant-insights-addon.js")) {
  const assistantInsightsScript = document.createElement("script");
  assistantInsightsScript.src = "assistant-insights-addon.js";
  document.body.appendChild(assistantInsightsScript);
}

if (!hasAddonScript("business-rules-addon.js")) {
  const businessRulesScript = document.createElement("script");
  businessRulesScript.src = "business-rules-addon.js";
  document.body.appendChild(businessRulesScript);
}
