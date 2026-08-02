state.contractFieldPolicy = {
  requirePrincipalAmount: false,
  requireInterestRate: true,
  requireCetRate: true,
  requireFirstDueDate: false,
  requireFirstPayrollCompetency: true,
  ...(state.contractFieldPolicy || {}),
};
saveState();

if (!pageTitles.contractfields) {
  pageTitles.contractfields = "Campos contrato";
}

function ensureContractFieldPolicyView() {
  if (document.getElementById("contractfields-view")) return;

  const nav = document.querySelector(".nav-list");
  const contractRulesButton = document.querySelector('[data-view="contractrules"]');
  const button = document.createElement("button");
  button.className = "nav-item";
  button.dataset.view = "contractfields";
  button.type = "button";
  button.textContent = "Campos contrato";
  button.addEventListener("click", () => openView("contractfields"));
  nav?.insertBefore(button, contractRulesButton?.nextSibling || null);

  if (!profileConfig.manager.views.includes("contractfields")) {
    const rulesIndex = profileConfig.manager.views.indexOf("contractrules");
    profileConfig.manager.views.splice(rulesIndex >= 0 ? rulesIndex + 1 : profileConfig.manager.views.length, 0, "contractfields");
  }

  document.querySelector(".main-panel")?.insertAdjacentHTML(
    "beforeend",
    `
      <section class="view" id="contractfields-view" aria-labelledby="contractfields-title">
        <div class="section-heading row-heading">
          <div>
            <h2 id="contractfields-title">Politica de campos do contrato</h2>
            <p>Classifique os campos essenciais, opcionais e configuraveis antes de endurecer a regra.</p>
          </div>
          <button class="primary-button" id="contractfields-save" type="button">Salvar politica</button>
        </div>

        <div class="contract-field-policy-grid">
          <section class="panel">
            <div class="panel-heading">
              <h3>Obrigatoriedade no MVP</h3>
            </div>
            <div class="contract-field-toggles" id="contract-field-toggles"></div>
          </section>

          <section class="panel">
            <div class="panel-heading">
              <h3>Classificacao inicial</h3>
            </div>
            <div class="contract-field-list" id="contract-field-classification"></div>
          </section>
        </div>

        <section class="panel contract-field-panel">
          <div class="panel-heading">
            <h3>Matriz por tipo de operacao</h3>
          </div>
          <div class="contract-field-matrix" id="contract-field-matrix"></div>
        </section>
      </section>
    `
  );

  document.getElementById("contractfields-save")?.addEventListener("click", saveContractFieldPolicy);
}

function contractFieldPolicyItems() {
  return [
    ["requirePrincipalAmount", "Valor contratado", "Complementar"],
    ["requireInterestRate", "Taxa mensal", "Obrigatorio"],
    ["requireCetRate", "CET mensal", "Obrigatorio"],
    ["requireFirstDueDate", "Primeiro vencimento", "Configuravel"],
    ["requireFirstPayrollCompetency", "Primeira competencia", "Obrigatorio"],
  ];
}

function renderContractFieldPolicyView() {
  ensureContractFieldPolicyView();

  const toggles = document.getElementById("contract-field-toggles");
  const classification = document.getElementById("contract-field-classification");
  const matrix = document.getElementById("contract-field-matrix");
  if (!toggles || !classification || !matrix) return;

  toggles.innerHTML = contractFieldPolicyItems()
    .map(
      ([key, label]) => `
        <label class="toggle-row">
          <input data-contract-field-policy="${key}" type="checkbox" ${state.contractFieldPolicy[key] ? "checked" : ""} />
          <span>${label}</span>
        </label>
      `
    )
    .join("");

  classification.innerHTML = contractFieldPolicyItems()
    .map(
      ([, label, type]) => `
        <article class="contract-field-note">
          <strong>${label}</strong>
          <span>${type}</span>
        </article>
      `
    )
    .join("");

  const rows = [
    ["Novo", "taxa, CET, primeira competencia e margem disponivel."],
    ["Refinanciamento", "contrato origem, saldo, taxa, CET, valor liberado e nova competencia."],
    ["Portabilidade", "banco origem, saldo formal, taxa, CET, aceite e competencia inicial."],
    ["Compra de divida", "credor origem, valor de compra, comprovante, taxa, CET e novo contrato."],
  ];

  matrix.innerHTML = rows
    .map(
      ([title, text]) => `
        <article class="contract-field-row">
          <strong>${title}</strong>
          <span>${text}</span>
        </article>
      `
    )
    .join("");
}

function saveContractFieldPolicy() {
  document.querySelectorAll("[data-contract-field-policy]").forEach((input) => {
    state.contractFieldPolicy[input.dataset.contractFieldPolicy] = input.checked;
  });
  auditEvent("Politica de campos obrigatorios do contrato atualizada.", "Campos contrato");
  saveState();
  render();
  openView("contractfields");
}

function getContractFieldMissingItems() {
  const policy = state.contractFieldPolicy || {};
  const missing = [];
  const principal = Number(document.getElementById("contract-principal-amount")?.value || 0);
  const interest = Number(document.getElementById("contract-interest-rate")?.value || 0);
  const cet = Number(document.getElementById("contract-cet-rate")?.value || 0);
  const firstDue = document.getElementById("contract-first-due-date")?.value || "";
  const firstCompetency = document.getElementById("contract-first-payroll-competency")?.value || "";

  if (policy.requirePrincipalAmount && principal <= 0) missing.push("Valor contratado");
  if (policy.requireInterestRate && interest <= 0) missing.push("Taxa mensal");
  if (policy.requireCetRate && cet <= 0) missing.push("CET mensal");
  if (policy.requireFirstDueDate && !firstDue) missing.push("Primeiro vencimento");
  if (policy.requireFirstPayrollCompetency && !firstCompetency) missing.push("Primeira competencia");

  return missing;
}

function ensureContractFieldPolicyValidation() {
  const form = document.getElementById("contract-form");
  if (!form || form.dataset.contractFieldPolicyBound) return;
  form.dataset.contractFieldPolicyBound = "true";

  document.getElementById("new-contract-open")?.addEventListener("click", () => {
    setTimeout(() => {
      const competency = document.getElementById("contract-first-payroll-competency");
      if (competency && !competency.value) {
        competency.value = state.conventionSettings?.payrollCompetency || today().slice(0, 7);
      }
    }, 0);
  });

  form.addEventListener(
    "submit",
    (event) => {
      if (event.submitter?.value === "cancel") return;
      const missing = getContractFieldMissingItems();
      if (!missing.length) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      alert(`Campos obrigatorios do contrato:\n- ${missing.join("\n- ")}`);
    },
    true
  );
}

const contractFieldPolicyStyle = document.createElement("style");
contractFieldPolicyStyle.textContent = `
  .contract-field-policy-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 18px;
  }
  .contract-field-panel {
    margin-top: 18px;
  }
  .contract-field-list,
  .contract-field-matrix,
  .contract-field-toggles {
    display: grid;
    gap: 10px;
  }
  .contract-field-note,
  .contract-field-row {
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 12px;
  }
  .contract-field-note span,
  .contract-field-row span {
    color: var(--muted);
    display: block;
    font-size: 13px;
    margin-top: 4px;
  }
  @media (max-width: 900px) {
    .contract-field-policy-grid {
      grid-template-columns: 1fr;
    }
  }
`;
document.head.appendChild(contractFieldPolicyStyle);

const renderBeforeContractFieldPolicy = render;
render = function renderWithContractFieldPolicy() {
  renderBeforeContractFieldPolicy();
  renderContractFieldPolicyView();
  ensureContractFieldPolicyValidation();
};

render();
