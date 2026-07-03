if (!pageTitles.authenticity) {
  pageTitles.authenticity = "Autenticidade";
}

["manager", "lender"].forEach((profile) => {
  if (!profileConfig[profile].views.includes("authenticity")) {
    const identityIndex = profileConfig[profile].views.indexOf("identity");
    profileConfig[profile].views.splice(identityIndex >= 0 ? identityIndex + 1 : profileConfig[profile].views.length, 0, "authenticity");
  }
});

function getAuthenticityEmployees() {
  if (state.currentProfile === "lender") {
    const employeeIds = new Set(state.contracts.filter((contract) => contract.lenderId === "lender-1").map((contract) => contract.employeeId));
    return state.employees.filter((employee) => employeeIds.has(employee.id));
  }
  return state.employees;
}

function maskCpf(cpf) {
  return cpf.replace(/^(\d{3})\.(\d{3})\.(\d{3})-(\d{2})$/, "$1.***.***-$4");
}

function getAuthenticityReading(employee) {
  const margin = calculateMargin(employee);
  const contracts = state.contracts.filter((contract) => contract.employeeId === employee.id);
  const activeCode = typeof activeAuthorizationFor === "function"
    ? activeAuthorizationFor(employee.id, ["Consulta de margem", "Reserva de margem", "Confirmacao de contrato"])
    : state.authorizationCodes.find((authorization) => authorization.employeeId === employee.id && authorization.status === "Ativo");
  const openTickets = state.tickets.filter((ticket) => ticket.employeeId === employee.id && ticket.status === "Aberto");
  const returnIssue = contracts.some(contractHasReturnIssue);
  const hasCpfShape = /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(employee.cpf);
  const hasEnrollment = Boolean(employee.enrollment);
  const hasPayrollBase = employee.income > 0 && employee.mandatoryDeductions >= 0;
  const isReviewed = employee.status !== "Em revisao";
  const hasConsent = Boolean(activeCode) || !state.conventionPolicy.requireAuthorizationForMarginConsult;
  const publicEvidence = typeof getPublicValidationEvidence === "function" ? getPublicValidationEvidence(employee) : null;
  const hasPublicEvidence = !publicEvidence || !publicEvidence.configured || (publicEvidence.status === "Encontrado" && !publicEvidence.stale);

  const signals = [
    {
      label: "Documento consistente",
      detail: state.currentProfile === "lender" ? maskCpf(employee.cpf) : employee.cpf,
      ok: hasCpfShape,
      risk: hasCpfShape ? "Baixo" : "Medio",
    },
    {
      label: "Matricula na folha",
      detail: employee.enrollment || "Nao informada",
      ok: hasEnrollment && hasPayrollBase,
      risk: hasEnrollment && hasPayrollBase ? "Baixo" : "Alto",
    },
    {
      label: "Situacao funcional",
      detail: employee.status,
      ok: isReviewed,
      risk: isReviewed ? "Baixo" : "Medio",
    },
    {
      label: "Consentimento/autorizacao",
      detail: activeCode
        ? `Codigo ${activeCode.code} ativo`
        : state.conventionPolicy.requireAuthorizationForMarginConsult
          ? "Sem codigo ativo"
          : "Consulta liberada por convenio",
      ok: hasConsent,
      risk: hasConsent ? "Baixo" : "Alto",
    },
    {
      label: "Fonte publica",
      detail: publicEvidence ? `${publicEvidence.sourceName}: ${publicEvidence.status}` : "Sem fonte publica configurada",
      ok: hasPublicEvidence,
      risk: hasPublicEvidence ? "Baixo" : "Medio",
    },
    {
      label: "Retorno da folha",
      detail: returnIssue ? "Existe rejeicao ou nao desconto" : "Sem pendencia critica",
      ok: !returnIssue,
      risk: returnIssue ? "Alto" : "Baixo",
    },
    {
      label: "Contestacao",
      detail: `${openTickets.length} ticket(s) aberto(s)`,
      ok: openTickets.length === 0,
      risk: openTickets.length ? "Medio" : "Baixo",
    },
  ];

  const riskScore = signals.reduce((score, signal) => score + (signal.risk === "Alto" ? 2 : signal.risk === "Medio" ? 1 : 0), 0);
  const label = riskScore >= 4 ? "Bloquear e revisar" : riskScore >= 2 ? "Exigir conferencia" : "Autenticidade compativel";
  const className = riskScore >= 4 ? "danger" : riskScore >= 2 ? "warning" : "";

  const evidence = [
    ["Folha importada", hasPayrollBase ? "Encontrada" : "Pendente"],
    ["Documento", hasCpfShape ? "Formato valido" : "Formato inconsistente"],
    ["Fonte publica", publicEvidence ? `${publicEvidence.mode}: ${publicEvidence.status}` : "Nao configurada"],
    ["Consentimento", hasConsent ? "Atendido" : "Pendente"],
    ["Margem", margin.available < 0 ? "Critica" : "Calculada"],
  ];

  return { signals, evidence, margin, label, className, riskScore };
}

function ensureAuthenticityView() {
  if (document.getElementById("authenticity-view")) return;

  const nav = document.querySelector(".nav-list");
  const identityButton = document.querySelector('[data-view="identity"]');
  const healthButton = document.querySelector('[data-view="health"]');
  const button = document.createElement("button");
  button.className = "nav-item";
  button.dataset.view = "authenticity";
  button.type = "button";
  button.textContent = "Autenticidade";
  button.addEventListener("click", () => openView("authenticity"));
  nav?.insertBefore(button, identityButton?.nextSibling || healthButton || null);

  document.querySelector(".main-panel")?.insertAdjacentHTML(
    "beforeend",
    `
      <section class="view" id="authenticity-view" aria-labelledby="authenticity-title">
        <div class="section-heading row-heading">
          <div>
            <h2 id="authenticity-title">Autenticidade do servidor</h2>
            <p>Verifique sinais de existencia real, vinculo na folha, consentimento e risco operacional.</p>
          </div>
          <select id="authenticity-employee-select" class="select-input"></select>
        </div>

        <div class="authenticity-summary-grid" id="authenticity-summary-grid"></div>

        <div class="content-grid authenticity-content">
          <section class="panel">
            <div class="panel-heading">
              <h3>Sinais de autenticidade</h3>
            </div>
            <div class="authenticity-signal-list" id="authenticity-signal-list"></div>
          </section>

          <section class="panel">
            <div class="panel-heading">
              <h3>Evidencias exigidas</h3>
            </div>
            <div class="authenticity-evidence-list" id="authenticity-evidence-list"></div>
          </section>
        </div>

        <section class="panel authenticity-governance">
          <div class="panel-heading">
            <h3>Politica recomendada</h3>
          </div>
          <div class="authenticity-note-list" id="authenticity-policy-list"></div>
        </section>
      </section>
    `
  );

  document.getElementById("authenticity-employee-select")?.addEventListener("change", renderAuthenticity);
}

function renderAuthenticity() {
  ensureAuthenticityView();

  const select = document.getElementById("authenticity-employee-select");
  const summary = document.getElementById("authenticity-summary-grid");
  const signalList = document.getElementById("authenticity-signal-list");
  const evidenceList = document.getElementById("authenticity-evidence-list");
  const policyList = document.getElementById("authenticity-policy-list");
  if (!select || !summary || !signalList || !evidenceList || !policyList) return;

  const employees = getAuthenticityEmployees();
  const previousValue = select.value;
  select.innerHTML = employees
    .map((employee) => `<option value="${employee.id}">${employee.name} - ${employee.enrollment}</option>`)
    .join("");
  if (previousValue && employees.some((employee) => employee.id === previousValue)) select.value = previousValue;

  const employee = employeeById(select.value) || employees[0];
  if (!employee) {
    summary.innerHTML = `<article class="authenticity-summary-card"><span>Sem escopo</span><strong>0</strong></article>`;
    signalList.innerHTML = "";
    evidenceList.innerHTML = "";
    policyList.innerHTML = "";
    return;
  }

  select.value = employee.id;
  const reading = getAuthenticityReading(employee);
  const okSignals = reading.signals.filter((signal) => signal.ok).length;
  const blockedSignals = reading.signals.length - okSignals;
  const displayCpf = state.currentProfile === "lender" ? maskCpf(employee.cpf) : employee.cpf;

  const cards = [
    ["Status", `<span class="status ${reading.className}">${reading.label}</span>`],
    ["Sinais OK", okSignals],
    ["Pontos de atencao", blockedSignals],
    ["CPF", displayCpf],
  ];

  summary.innerHTML = cards
    .map(
      ([label, value]) => `
        <article class="authenticity-summary-card">
          <span>${label}</span>
          <strong>${value}</strong>
        </article>
      `
    )
    .join("");

  signalList.innerHTML = reading.signals
    .map((signal) => {
      const className = signal.risk === "Alto" ? "danger" : signal.risk === "Medio" ? "warning" : "";
      return `
        <article class="authenticity-signal">
          <div>
            <strong>${signal.label}</strong>
            <span>${signal.detail}</span>
          </div>
          <span class="status ${className}">${signal.risk}</span>
        </article>
      `;
    })
    .join("");

  evidenceList.innerHTML = reading.evidence
    .map(
      ([label, value]) => `
        <div class="authenticity-note">
          <strong>${label}</strong>
          <span>${value}</span>
        </div>
      `
    )
    .join("");

  policyList.innerHTML = `
    <div class="authenticity-note">
      <strong>Antes da consulta de margem</strong>
      <span>Exigir CPF/matricula consistentes, escopo da instituicao e consentimento conforme regra do convenio.</span>
    </div>
    <div class="authenticity-note">
      <strong>Antes da reserva</strong>
      <span>Bloquear se houver divergencia de folha, retorno pendente critico ou ausencia de autorizacao quando obrigatoria.</span>
    </div>
    <div class="authenticity-note">
      <strong>Em producao</strong>
      <span>Integrar com login forte, fonte publica oficial, prova documental e auditoria imutavel de cada validacao.</span>
    </div>
  `;
}

const authenticityStyle = document.createElement("style");
authenticityStyle.textContent = `
  .authenticity-summary-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(150px, 1fr));
    gap: 14px;
    margin-bottom: 18px;
  }
  .authenticity-summary-card,
  .authenticity-signal,
  .authenticity-note {
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
  }
  .authenticity-summary-card {
    padding: 16px;
    box-shadow: var(--shadow);
  }
  .authenticity-summary-card span,
  .authenticity-signal span,
  .authenticity-note span {
    display: block;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.4;
  }
  .authenticity-summary-card strong {
    display: block;
    margin-top: 8px;
    font-size: 22px;
    word-break: break-word;
  }
  .authenticity-content,
  .authenticity-governance {
    margin-top: 18px;
  }
  .authenticity-signal-list,
  .authenticity-evidence-list,
  .authenticity-note-list {
    display: grid;
    gap: 10px;
  }
  .authenticity-signal {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 12px;
    align-items: center;
    padding: 12px;
    background: var(--surface-2);
  }
  .authenticity-note {
    padding: 12px;
    background: var(--surface-2);
  }
  .authenticity-note span {
    margin-top: 4px;
  }
  @media (max-width: 1040px) {
    .authenticity-summary-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 640px) {
    .authenticity-summary-grid,
    .authenticity-signal {
      grid-template-columns: 1fr;
    }
  }
`;
document.head.appendChild(authenticityStyle);

const renderBeforeAuthenticity = render;
render = function renderWithAuthenticity() {
  renderBeforeAuthenticity();
  renderAuthenticity();
};

render();
