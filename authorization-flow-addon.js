function ensureAuthorizationValidationPanel() {
  if (document.getElementById("validate-authorization-code")) return;

  const contentGrid = document.querySelector("#authorizations-view .content-grid");
  if (!contentGrid) return;

  contentGrid.insertAdjacentHTML(
    "afterbegin",
    `
      <section class="panel authorization-validation-panel">
        <div class="panel-heading">
          <h3>Validar codigo da consignataria</h3>
        </div>
        <div class="validation-grid">
          <label>
            Codigo informado pelo servidor
            <input id="validate-authorization-code" class="text-input" inputmode="numeric" maxlength="6" placeholder="Ex.: 482913" />
          </label>
          <button class="primary-button" id="validate-authorization-button" type="button">Validar codigo</button>
        </div>
        <div id="authorization-validation-result" class="validation-result muted">
          Informe o codigo para consultar a autorizacao antes de reservar margem.
        </div>
      </section>
    `
  );

  document.getElementById("validate-authorization-button").addEventListener("click", validateAuthorizationForReservation);
}

function findAuthorizationByCode(code) {
  return state.authorizationCodes.find(
    (authorization) =>
      authorization.code === code &&
      authorization.status === "Ativo" &&
      ["Reserva de margem", "Confirmacao de contrato", "Consulta de margem"].includes(authorization.purpose)
  );
}

function validateAuthorizationForReservation() {
  const input = document.getElementById("validate-authorization-code");
  const result = document.getElementById("authorization-validation-result");
  const code = input.value.trim();

  if (!code) {
    result.innerHTML = `<span class="status warning">Informe um codigo</span>`;
    return;
  }

  const authorization = findAuthorizationByCode(code);
  if (!authorization) {
    result.innerHTML = `
      <span class="status danger">Codigo invalido</span>
      <p>O codigo nao existe, expirou, ja foi usado ou nao autoriza operacao de margem.</p>
    `;
    state.movements.unshift({
      date: today(),
      text: `Tentativa de validar codigo ${code} sem autorizacao ativa.`,
      profile: profileConfig[state.currentProfile]?.label || "Sistema",
      source: "Autorizacao",
    });
    saveState();
    if (typeof renderAudit === "function") renderAudit();
    return;
  }

  const employee = employeeById(authorization.employeeId);
  const margin = employee ? calculateMargin(employee) : null;
  result.innerHTML = `
    <div class="validation-card">
      <span class="status">Codigo valido</span>
      <strong>${employee?.name ?? "Servidor"}</strong>
      <p>${authorization.purpose} - expira ${authorization.expiresAt}</p>
      ${margin ? `<p>Margem disponivel: <strong>${money.format(margin.available)}</strong></p>` : ""}
      <button class="primary-button" id="create-reservation-from-code" type="button">Criar reserva com autorizacao</button>
    </div>
  `;

  state.movements.unshift({
    date: today(),
    text: `Codigo ${authorization.code} validado para ${employee?.name ?? "servidor"}.`,
    profile: profileConfig[state.currentProfile]?.label || "Sistema",
    source: "Autorizacao",
  });
  saveState();
  if (typeof renderAudit === "function") renderAudit();

  document.getElementById("create-reservation-from-code").addEventListener("click", () => {
    document.getElementById("contract-employee").value = authorization.employeeId;
    const lenderSelect = document.getElementById("contract-lender");
    if (lenderSelect && state.currentProfile === "lender") lenderSelect.value = "lender-1";
    document.getElementById("contract-modal").showModal();
    setTimeout(() => document.getElementById("contract-installment")?.focus(), 0);
  });
}

const authorizationFlowStyle = document.createElement("style");
authorizationFlowStyle.textContent = `
  .authorization-validation-panel {
    grid-column: 1 / -1;
  }
  .validation-grid {
    display: grid;
    grid-template-columns: minmax(220px, 1fr) auto;
    gap: 12px;
    align-items: end;
  }
  .validation-grid label {
    display: grid;
    gap: 6px;
    color: var(--muted);
    font-size: 13px;
    font-weight: 700;
  }
  .validation-result {
    margin-top: 12px;
  }
  .validation-card {
    display: grid;
    gap: 8px;
    padding: 12px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface-2);
  }
  .validation-card p {
    margin: 0;
  }
  .validation-card .primary-button {
    justify-self: start;
  }
  @media (max-width: 760px) {
    .validation-grid {
      grid-template-columns: 1fr;
    }
    .validation-card .primary-button {
      width: 100%;
    }
  }
`;
document.head.appendChild(authorizationFlowStyle);

const renderBeforeAuthorizationFlow = render;
render = function renderWithAuthorizationFlow() {
  renderBeforeAuthorizationFlow();
  ensureAuthorizationValidationPanel();
};

render();
