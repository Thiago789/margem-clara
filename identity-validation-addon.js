if (!pageTitles.identity) {
  pageTitles.identity = "Validacao do servidor";
}

["manager", "lender"].forEach((profile) => {
  if (!profileConfig[profile].views.includes("identity")) {
    const marginIndex = profileConfig[profile].views.indexOf("margin");
    profileConfig[profile].views.splice(marginIndex + 1, 0, "identity");
  }
});

function ensureIdentityValidationView() {
  if (document.getElementById("identity-view")) return;

  const nav = document.querySelector(".nav-list");
  const healthButton = document.querySelector('[data-view="health"]');
  const contractsButton = document.querySelector('[data-view="contracts"]');
  const button = document.createElement("button");
  button.className = "nav-item";
  button.dataset.view = "identity";
  button.type = "button";
  button.textContent = "Validacao";
  button.addEventListener("click", () => openView("identity"));
  nav?.insertBefore(button, healthButton || contractsButton || null);

  document.querySelector(".main-panel")?.insertAdjacentHTML(
    "beforeend",
    `
      <section class="view" id="identity-view" aria-labelledby="identity-title">
        <div class="section-heading row-heading">
          <div>
            <h2 id="identity-title">Validacao do servidor</h2>
            <p>Conferencia operacional antes de consulta, reserva ou integracao externa.</p>
          </div>
          <div class="identity-actions">
            <select id="identity-employee-select" class="select-input"></select>
            <button class="secondary-button" id="identity-public-evidence-button" type="button">Registrar evidencia</button>
          </div>
        </div>

        <div class="identity-grid" id="identity-grid"></div>

        <div class="content-grid identity-content">
          <section class="panel">
            <div class="panel-heading">
              <h3>Sinais de consistencia</h3>
            </div>
            <div class="validation-list" id="identity-checks"></div>
          </section>

          <section class="panel">
            <div class="panel-heading">
              <h3>Proximas verificacoes</h3>
            </div>
            <div class="flow-list">
              <div><strong>Documento oficial</strong><span>Conferencia assistida no cadastro ou portal do servidor.</span></div>
              <div><strong>Base da folha</strong><span>Confirmacao de vinculo ativo pela ultima competencia importada.</span></div>
              <div><strong>Fonte publica</strong><span>Portal da transparencia, API municipal ou arquivo oficial configuravel por convenio.</span></div>
              <div><strong>Consentimento</strong><span>Codigo temporario ou politica de reserva imediata por convenio.</span></div>
            </div>
          </section>
        </div>
      </section>
    `
  );

  document.getElementById("identity-employee-select")?.addEventListener("change", renderIdentityValidation);
  document.getElementById("identity-public-evidence-button")?.addEventListener("click", recordPublicValidationEvidence);
}

function getIdentityScore(employee) {
  const margin = calculateMargin(employee);
  const contracts = state.contracts.filter((contract) => contract.employeeId === employee.id);
  const authorizations = state.authorizationCodes.filter((authorization) => authorization.employeeId === employee.id);
  const openTickets = state.tickets.filter((ticket) => ticket.employeeId === employee.id && ticket.status === "Aberto");
  const hasCpfShape = /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(employee.cpf);
  const hasEnrollment = Boolean(employee.enrollment);
  const hasActiveAuthorization = typeof activeAuthorizationFor === "function"
    ? Boolean(activeAuthorizationFor(employee.id, ["Consulta de margem", "Reserva de margem", "Confirmacao de contrato"]))
    : authorizations.some((authorization) => authorization.status === "Ativo");
  const requiresMarginConsultAuthorization = state.conventionPolicy.requireAuthorizationForMarginConsult;
  const hasPayrollIssue = employee.status === "Em revisao" || margin.available < 0;
  const hasReturnIssue = contracts.some(contractHasReturnIssue);
  const publicEvidence = typeof getPublicValidationEvidence === "function" ? getPublicValidationEvidence(employee) : null;
  const hasPublicEvidence = !publicEvidence || !publicEvidence.configured || (publicEvidence.status === "Encontrado" && !publicEvidence.stale);

  const checks = [
    {
      title: "CPF em formato valido",
      detail: employee.cpf,
      status: hasCpfShape ? "OK" : "Revisar",
      className: hasCpfShape ? "" : "warning",
    },
    {
      title: "Matricula vinculada",
      detail: employee.enrollment || "Matricula nao informada",
      status: hasEnrollment ? "OK" : "Revisar",
      className: hasEnrollment ? "" : "warning",
    },
    {
      title: "Situacao na folha",
      detail: employee.status,
      status: hasPayrollIssue ? "Atencao" : "OK",
      className: hasPayrollIssue ? "warning" : "",
    },
    {
      title: "Autorizacao para operacao",
      detail: hasActiveAuthorization
        ? "Codigo ativo localizado"
        : requiresMarginConsultAuthorization
          ? "Sem codigo ativo"
          : "Consulta liberada por convenio",
      status: hasActiveAuthorization || !requiresMarginConsultAuthorization ? "OK" : "Pendente",
      className: hasActiveAuthorization || !requiresMarginConsultAuthorization ? "" : "warning",
    },
    {
      title: "Retorno da folha",
      detail: hasReturnIssue ? "Existe desconto rejeitado ou nao descontado" : "Sem pendencia critica",
      status: hasReturnIssue ? "Atencao" : "OK",
      className: hasReturnIssue ? "danger" : "",
    },
    {
      title: "Fonte publica",
      detail: publicEvidence ? publicEvidence.detail : "Fonte publica ainda nao configurada",
      status: publicEvidence ? publicEvidence.status : "Pendente",
      className: hasPublicEvidence ? "" : "warning",
    },
    {
      title: "Contestacoes abertas",
      detail: `${openTickets.length} ticket(s) aberto(s)`,
      status: openTickets.length ? "Atencao" : "OK",
      className: openTickets.length ? "warning" : "",
    },
  ];

  const riskPoints = checks.filter((check) => check.className === "warning").length + checks.filter((check) => check.className === "danger").length * 2;
  const label = riskPoints >= 3 ? "Validar manualmente" : riskPoints >= 1 ? "Acompanhar" : "Apto no MVP";
  const className = riskPoints >= 3 ? "danger" : riskPoints >= 1 ? "warning" : "";

  return { checks, label, className, margin, contracts, authorizations, openTickets };
}

function recordPublicValidationEvidence() {
  const select = document.getElementById("identity-employee-select");
  const employee = employeeById(select?.value) || state.employees[0];
  if (!employee) return;

  const evidence = typeof getPublicValidationEvidence === "function" ? getPublicValidationEvidence(employee) : null;
  const status = evidence?.status || "Pendente";
  const sourceName = evidence?.sourceName || "Fonte publica";
  const record = typeof savePublicValidationEvidence === "function" ? savePublicValidationEvidence(employee, evidence) : null;
  const reference = evidence?.reference ? ` Referencia: ${evidence.reference}.` : "";
  const snapshot = record ? ` Snapshot: CPF ${record.cpf}, matricula ${record.enrollment}.` : "";
  auditEvent(
    `Validacao por fonte publica registrada para ${employee.name}: ${status} em ${sourceName}.${reference}${snapshot}`,
    "Validacao do servidor"
  );
  saveState();
  render();
  openView("identity");
}

function renderIdentityValidation() {
  ensureIdentityValidationView();

  const select = document.getElementById("identity-employee-select");
  const grid = document.getElementById("identity-grid");
  const checksContainer = document.getElementById("identity-checks");
  if (!select || !grid || !checksContainer) return;

  const previousValue = select.value;
  select.innerHTML = state.employees
    .map((employee) => `<option value="${employee.id}">${employee.name} - ${employee.enrollment}</option>`)
    .join("");
  if (previousValue) select.value = previousValue;

  const employee = employeeById(select.value) || state.employees[0];
  if (!employee) {
    grid.innerHTML = `<section class="panel">Nenhum servidor cadastrado.</section>`;
    checksContainer.innerHTML = "";
    return;
  }

  select.value = employee.id;
  const result = getIdentityScore(employee);

  grid.innerHTML = `
    <article class="panel identity-card">
      <span>Status da validacao</span>
      <strong><span class="status ${result.className}">${result.label}</span></strong>
      <p>${employee.name}</p>
    </article>
    <article class="panel identity-card">
      <span>CPF</span>
      <strong>${employee.cpf}</strong>
      <p>Documento base do cadastro.</p>
    </article>
    <article class="panel identity-card">
      <span>Matricula</span>
      <strong>${employee.enrollment}</strong>
      <p>Vinculo usado na folha.</p>
    </article>
    <article class="panel identity-card">
      <span>Margem atual</span>
      <strong>${money.format(result.margin.available)}</strong>
      <p>${result.margin.status}</p>
    </article>
  `;

  checksContainer.innerHTML = result.checks
    .map(
      (check) => `
        <div class="validation-item">
          <div>
            <strong>${check.title}</strong>
            <span>${check.detail}</span>
          </div>
          <span class="status ${check.className}">${check.status}</span>
        </div>
      `
    )
    .join("");
}

const identityStyle = document.createElement("style");
identityStyle.textContent = `
  .identity-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
  }
  .identity-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    flex-wrap: wrap;
  }
  .identity-actions .select-input {
    min-width: 260px;
  }
  .identity-card {
    min-height: 132px;
  }
  .identity-card > span {
    display: block;
    color: var(--muted);
    font-size: 13px;
    margin-bottom: 8px;
  }
  .identity-card strong {
    display: block;
    font-size: 22px;
    margin-bottom: 8px;
    word-break: break-word;
  }
  .identity-card p {
    margin: 0;
    color: var(--muted);
    font-size: 13px;
  }
  .identity-content {
    margin-top: 18px;
  }
  .validation-list {
    display: grid;
    gap: 10px;
  }
  .validation-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface-soft);
  }
  .validation-item div {
    display: grid;
    gap: 4px;
  }
  .validation-item span:not(.status) {
    color: var(--muted);
    font-size: 13px;
  }
  @media (max-width: 1100px) {
    .identity-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 720px) {
    .identity-grid {
      grid-template-columns: 1fr;
    }
    .identity-actions,
    .identity-actions .select-input,
    .identity-actions button {
      width: 100%;
    }
    .validation-item {
      align-items: flex-start;
      flex-direction: column;
    }
  }
`;
document.head.appendChild(identityStyle);

const renderBeforeIdentity = render;
render = function renderWithIdentityValidation() {
  renderBeforeIdentity();
  ensureIdentityValidationView();
  renderIdentityValidation();
};

render();
