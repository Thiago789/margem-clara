state.conventionPolicy = {
  requireAuthorizationForMarginConsult: true,
  requireAuthorizationForReservation: true,
  authorizationValidityHours: 24,
  ...(state.conventionPolicy || {}),
};
saveState();

function renderConventionPolicyAddon() {
  const requireMarginConsult = document.getElementById("policy-require-margin-consult-code");
  const requireReservation = document.getElementById("policy-require-reservation-code");
  const validityHours = document.getElementById("policy-code-validity");
  const summary = document.getElementById("policy-summary");
  if (!requireReservation || !validityHours || !summary) return;

  if (requireMarginConsult) requireMarginConsult.checked = state.conventionPolicy.requireAuthorizationForMarginConsult;
  requireReservation.checked = state.conventionPolicy.requireAuthorizationForReservation;
  validityHours.value = state.conventionPolicy.authorizationValidityHours;
  summary.textContent = `${
    state.conventionPolicy.requireAuthorizationForMarginConsult
      ? "Consulta de margem exige autorizacao do servidor"
      : "Consulta de margem liberada para consignataria credenciada"
  }; ${
    state.conventionPolicy.requireAuthorizationForReservation
      ? "reserva exige codigo"
      : "reserva imediata liberada"
  }. Validade padrao: ${state.conventionPolicy.authorizationValidityHours}h.`;
}

function ensureConventionPolicyPanel() {
  if (document.getElementById("policy-require-reservation-code")) return;

  const contentGrid = document.querySelector("#authorizations-view .content-grid");
  if (!contentGrid) return;

  contentGrid.insertAdjacentHTML(
    "afterbegin",
    `
      <section class="panel">
        <div class="panel-heading">
          <h3>Politica do convenio</h3>
        </div>
        <div class="policy-grid">
          <label class="toggle-row">
            <input id="policy-require-margin-consult-code" type="checkbox" />
            <span>Exigir autorizacao para consulta de margem</span>
          </label>
          <label class="toggle-row">
            <input id="policy-require-reservation-code" type="checkbox" />
            <span>Exigir codigo para reserva</span>
          </label>
          <label>
            Validade do codigo
            <select id="policy-code-validity" class="select-input">
              <option value="2">2 horas</option>
              <option value="12">12 horas</option>
              <option value="24">24 horas</option>
              <option value="48">48 horas</option>
            </select>
          </label>
        </div>
        <p class="muted" id="policy-summary"></p>
      </section>
    `
  );

  document.getElementById("policy-require-margin-consult-code").addEventListener("change", (event) => {
    state.conventionPolicy.requireAuthorizationForMarginConsult = event.target.checked;
    state.movements.unshift({
      date: today(),
      text: event.target.checked
        ? "Politica do convenio atualizada: consulta de margem exige autorizacao do servidor."
        : "Politica do convenio atualizada: consulta de margem liberada para consignataria credenciada.",
      profile: profileConfig[state.currentProfile]?.label || "Sistema",
      source: "Configuracao",
    });
    saveState();
    renderConventionPolicyAddon();
    if (typeof renderAudit === "function") renderAudit();
  });

  document.getElementById("policy-require-reservation-code").addEventListener("change", (event) => {
    state.conventionPolicy.requireAuthorizationForReservation = event.target.checked;
    state.movements.unshift({
      date: today(),
      text: event.target.checked
        ? "Politica do convenio atualizada: reserva exige codigo do servidor."
        : "Politica do convenio atualizada: reserva imediata liberada.",
      profile: profileConfig[state.currentProfile]?.label || "Sistema",
      source: "Configuracao",
    });
    saveState();
    renderConventionPolicyAddon();
    if (typeof renderAudit === "function") renderAudit();
  });

  document.getElementById("policy-code-validity").addEventListener("change", (event) => {
    state.conventionPolicy.authorizationValidityHours = Number(event.target.value || 24);
    state.movements.unshift({
      date: today(),
      text: `Validade do codigo alterada para ${state.conventionPolicy.authorizationValidityHours}h.`,
      profile: profileConfig[state.currentProfile]?.label || "Sistema",
      source: "Configuracao",
    });
    saveState();
    renderConventionPolicyAddon();
    if (typeof renderAudit === "function") renderAudit();
  });

  renderConventionPolicyAddon();
}

const policyStyle = document.createElement("style");
policyStyle.textContent = `
  .policy-grid {
    display: grid;
    gap: 12px;
  }
  .toggle-row {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--text);
    font-weight: 700;
  }
  .toggle-row input {
    width: 18px;
    height: 18px;
  }
`;
document.head.appendChild(policyStyle);

const renderBeforePolicyAddon = render;
render = function renderWithConventionPolicy() {
  renderBeforePolicyAddon();
  ensureConventionPolicyPanel();
  renderConventionPolicyAddon();
};

document.getElementById("contract-form")?.addEventListener(
  "submit",
  (event) => {
    if (event.submitter?.value === "cancel") return;

    const employeeId = document.getElementById("contract-employee").value;
    const activeCode = typeof activeAuthorizationFor === "function"
      ? activeAuthorizationFor(employeeId, ["Reserva de margem", "Confirmacao de contrato"])
      : state.authorizationCodes.find(
          (authorization) =>
            authorization.employeeId === employeeId &&
            authorization.status === "Ativo" &&
            ["Reserva de margem", "Confirmacao de contrato"].includes(authorization.purpose)
        );

    if (state.conventionPolicy.requireAuthorizationForReservation && !activeCode) {
      event.preventDefault();
      event.stopImmediatePropagation();
      alert("Este convenio exige codigo do servidor para criar reserva.");
    }
  },
  true
);

document.getElementById("authorization-form")?.addEventListener("submit", () => {
  setTimeout(() => {
    const active = state.authorizationCodes[0];
    if (active && active.status === "Ativo") {
      active.expiresAt = `${today()} +${state.conventionPolicy.authorizationValidityHours}h`;
      saveState();
      render();
    }
  }, 0);
});

render();
