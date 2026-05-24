state.conventionSettings = {
  name: "Prefeitura Modelo",
  code: "PM-001",
  marginPercentage: 35,
  reservationExpirationDays: 2,
  payrollCompetency: today().slice(0, 7),
  marginFileLayout: "CSV margem padrao",
  insertionFileLayout: "CSV insercao padrao",
  returnFileLayout: "CSV retorno padrao",
  ...(state.conventionSettings || {}),
};

state.conventionPolicy = {
  insertionCutoffDay: 20,
  ...(state.conventionPolicy || {}),
};

saveState();

if (!pageTitles.settings) {
  pageTitles.settings = "Configuracao do convenio";
}

if (!profileConfig.manager.views.includes("settings")) {
  const auditIndex = profileConfig.manager.views.indexOf("audit");
  if (auditIndex >= 0) {
    profileConfig.manager.views.splice(auditIndex, 0, "settings");
  } else {
    profileConfig.manager.views.push("settings");
  }
}

function ensureConventionSettingsView() {
  if (document.getElementById("settings-view")) return;

  const nav = document.querySelector(".nav-list");
  const auditButton = document.querySelector('[data-view="audit"]');
  const button = document.createElement("button");
  button.className = "nav-item";
  button.dataset.view = "settings";
  button.type = "button";
  button.textContent = "Config convenio";
  button.addEventListener("click", () => openView("settings"));
  nav?.insertBefore(button, auditButton || null);

  document.querySelector(".main-panel")?.insertAdjacentHTML(
    "beforeend",
    `
      <section class="view" id="settings-view" aria-labelledby="settings-title">
        <div class="section-heading">
          <h2 id="settings-title">Configuracao do convenio</h2>
          <p>Defina politicas operacionais usadas no calculo, autorizacao e troca de arquivos.</p>
        </div>

        <div class="settings-grid">
          <section class="panel">
            <div class="panel-heading">
              <h3>Identificacao</h3>
            </div>
            <div class="form-grid">
              <label>
                Nome do convenio
                <input id="settings-name" class="text-input" />
              </label>
              <label>
                Codigo interno
                <input id="settings-code" class="text-input" />
              </label>
            </div>
          </section>

          <section class="panel">
            <div class="panel-heading">
              <h3>Regras de margem</h3>
            </div>
            <div class="form-grid">
              <label>
                Percentual de margem
                <input id="settings-margin-percentage" class="text-input" type="number" min="1" max="100" step="0.5" />
              </label>
              <label>
                Expiracao da reserva
                <select id="settings-reservation-expiration" class="select-input">
                  <option value="1">1 dia</option>
                  <option value="2">2 dias</option>
                  <option value="3">3 dias</option>
                  <option value="5">5 dias</option>
                  <option value="7">7 dias</option>
                </select>
              </label>
            </div>
          </section>

          <section class="panel">
            <div class="panel-heading">
              <h3>Folha e competencia</h3>
            </div>
            <div class="form-grid">
              <label>
                Competencia da folha
                <input id="settings-payroll-competency" class="text-input" type="month" />
              </label>
              <label>
                Data de corte
                <input id="settings-insertion-cutoff" class="text-input" type="number" min="1" max="31" step="1" />
              </label>
            </div>
          </section>

          <section class="panel">
            <div class="panel-heading">
              <h3>Autorizacao</h3>
            </div>
            <div class="policy-grid">
              <label class="toggle-row">
                <input id="settings-require-reservation-code" type="checkbox" />
                <span>Exigir codigo para reserva</span>
              </label>
              <label>
                Validade do codigo
                <select id="settings-code-validity" class="select-input">
                  <option value="2">2 horas</option>
                  <option value="12">12 horas</option>
                  <option value="24">24 horas</option>
                  <option value="48">48 horas</option>
                </select>
              </label>
            </div>
          </section>

          <section class="panel">
            <div class="panel-heading">
              <h3>Layouts de arquivos</h3>
            </div>
            <div class="form-grid">
              <label>
                Arquivo de margem
                <input id="settings-margin-layout" class="text-input" />
              </label>
              <label>
                Arquivo de insercao
                <input id="settings-insertion-layout" class="text-input" />
              </label>
              <label>
                Arquivo retorno
                <input id="settings-return-layout" class="text-input" />
              </label>
            </div>
          </section>
        </div>

        <section class="panel settings-summary-panel">
          <div class="panel-heading">
            <h3>Resumo operacional</h3>
            <button class="primary-button" id="settings-save" type="button">Salvar configuracao</button>
          </div>
          <div class="settings-summary" id="settings-summary"></div>
        </section>
      </section>
    `
  );

  document.getElementById("settings-save")?.addEventListener("click", saveConventionSettings);
  document.querySelectorAll("#settings-view input, #settings-view select").forEach((input) => {
    input.addEventListener("change", renderConventionSettings);
  });
}

const calculateMarginBeforeSettings = calculateMargin;
calculateMargin = function calculateMarginWithConventionSettings(employee) {
  const calculationBase = Math.max(employee.income - employee.mandatoryDeductions, 0);
  const total = calculationBase * (Number(state.conventionSettings.marginPercentage || 35) / 100);
  const used = activeContracts(employee.id).reduce((sum, contract) => sum + contract.installment, 0);
  const reserved = reservedContracts(employee.id).reduce((sum, contract) => sum + contract.installment, 0);
  const blocked = employee.status === "Em revisao" ? total * 0.1 : 0;
  const available = total - used - reserved - blocked;

  return {
    calculationBase,
    total,
    used,
    reserved,
    blocked,
    available,
    status: available < 0 ? "Negativa" : employee.status === "Em revisao" ? "Em revisao" : "Disponivel",
  };
};

function syncMarginPercentageLabel() {
  document.querySelectorAll(".breakdown-row").forEach((row) => {
    const label = row.querySelector("span")?.textContent;
    const value = row.querySelector("strong");
    if (label === "Percentual de margem" && value) {
      value.textContent = `${Number(state.conventionSettings.marginPercentage || 35).toFixed(1).replace(".0", "")}%`;
    }
  });
}

function renderConventionSettings() {
  ensureConventionSettingsView();

  const settings = state.conventionSettings;
  const policy = state.conventionPolicy || {};
  const values = {
    name: document.getElementById("settings-name"),
    code: document.getElementById("settings-code"),
    marginPercentage: document.getElementById("settings-margin-percentage"),
    reservationExpiration: document.getElementById("settings-reservation-expiration"),
    payrollCompetency: document.getElementById("settings-payroll-competency"),
    insertionCutoff: document.getElementById("settings-insertion-cutoff"),
    requireReservationCode: document.getElementById("settings-require-reservation-code"),
    codeValidity: document.getElementById("settings-code-validity"),
    marginLayout: document.getElementById("settings-margin-layout"),
    insertionLayout: document.getElementById("settings-insertion-layout"),
    returnLayout: document.getElementById("settings-return-layout"),
  };

  if (!values.name) return;
  values.name.value = settings.name;
  values.code.value = settings.code;
  values.marginPercentage.value = settings.marginPercentage;
  values.reservationExpiration.value = settings.reservationExpirationDays;
  values.payrollCompetency.value = settings.payrollCompetency || today().slice(0, 7);
  values.insertionCutoff.value = policy.insertionCutoffDay || 20;
  values.requireReservationCode.checked = Boolean(policy.requireAuthorizationForReservation);
  values.codeValidity.value = policy.authorizationValidityHours || 24;
  values.marginLayout.value = settings.marginFileLayout;
  values.insertionLayout.value = settings.insertionFileLayout;
  values.returnLayout.value = settings.returnFileLayout;

  const summary = document.getElementById("settings-summary");
  if (summary) {
    summary.innerHTML = `
      <article><span>Convenio</span><strong>${settings.name}</strong></article>
      <article><span>Margem</span><strong>${settings.marginPercentage}%</strong></article>
      <article><span>Competencia</span><strong>${settings.payrollCompetency || today().slice(0, 7)}</strong></article>
      <article><span>Corte</span><strong>Dia ${policy.insertionCutoffDay || 20}</strong></article>
      <article><span>Reserva</span><strong>${settings.reservationExpirationDays} dia(s)</strong></article>
      <article><span>Codigo</span><strong>${policy.requireAuthorizationForReservation ? "Obrigatorio" : "Opcional"}</strong></article>
    `;
  }
}

function saveConventionSettings() {
  const previous = {
    ...state.conventionSettings,
    requireAuthorizationForReservation: state.conventionPolicy?.requireAuthorizationForReservation,
    authorizationValidityHours: state.conventionPolicy?.authorizationValidityHours,
  };

  state.conventionSettings = {
    name: document.getElementById("settings-name").value.trim() || "Prefeitura Modelo",
    code: document.getElementById("settings-code").value.trim() || "PM-001",
    marginPercentage: Number(document.getElementById("settings-margin-percentage").value || 35),
    reservationExpirationDays: Number(document.getElementById("settings-reservation-expiration").value || 2),
    payrollCompetency: document.getElementById("settings-payroll-competency").value || today().slice(0, 7),
    marginFileLayout: document.getElementById("settings-margin-layout").value.trim() || "CSV margem padrao",
    insertionFileLayout: document.getElementById("settings-insertion-layout").value.trim() || "CSV insercao padrao",
    returnFileLayout: document.getElementById("settings-return-layout").value.trim() || "CSV retorno padrao",
  };

  state.conventionPolicy = {
    ...state.conventionPolicy,
    insertionCutoffDay: Number(document.getElementById("settings-insertion-cutoff").value || 20),
    requireAuthorizationForReservation: document.getElementById("settings-require-reservation-code").checked,
    authorizationValidityHours: Number(document.getElementById("settings-code-validity").value || 24),
  };

  state.movements.unshift({
    date: today(),
    text: `Configuracao do convenio atualizada: margem ${previous.marginPercentage}% -> ${state.conventionSettings.marginPercentage}%, corte dia ${state.conventionPolicy.insertionCutoffDay}.`,
    profile: profileConfig[state.currentProfile]?.label || "Sistema",
    source: "Configuracao",
  });

  saveState();
  render();
  openView("settings");
}

const settingsStyle = document.createElement("style");
settingsStyle.textContent = `
  .settings-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 18px;
  }
  .settings-summary-panel {
    margin-top: 18px;
  }
  .settings-summary {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }
  .settings-summary article {
    padding: 12px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface-2);
  }
  .settings-summary span {
    display: block;
    color: var(--muted);
    font-size: 12px;
  }
  .settings-summary strong {
    display: block;
    margin-top: 4px;
  }
  @media (max-width: 900px) {
    .settings-grid,
    .settings-summary {
      grid-template-columns: 1fr;
    }
  }
`;
document.head.appendChild(settingsStyle);

const renderBeforeSettings = render;
render = function renderWithConventionSettings() {
  renderBeforeSettings();
  ensureConventionSettingsView();
  renderConventionSettings();
  syncMarginPercentageLabel();
};

render();
