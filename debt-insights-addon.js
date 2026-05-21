if (!pageTitles.debt) {
  pageTitles.debt = "Endividamento";
}

["manager", "employee"].forEach((profile) => {
  if (!profileConfig[profile].views.includes("debt")) {
    const healthIndex = profileConfig[profile].views.indexOf("health");
    profileConfig[profile].views.splice(healthIndex >= 0 ? healthIndex + 1 : profileConfig[profile].views.length, 0, "debt");
  }
});

function getDebtEmployeeOptions() {
  if (state.currentProfile === "employee") {
    return state.employees.slice(0, 1);
  }
  return state.employees;
}

function getDebtReading(employee) {
  const margin = calculateMargin(employee);
  const contracts = state.contracts.filter((contract) => contract.employeeId === employee.id);
  const active = contracts.filter((contract) => ["Averbado", "Descontando", "Enviado para folha"].includes(contract.status));
  const reserved = contracts.filter((contract) => contract.status === "Reservado");
  const rejected = contracts.filter((contract) => ["Rejeitado", "Nao descontado"].includes(contract.status));
  const openTickets = state.tickets.filter((ticket) => ticket.employeeId === employee.id && ticket.status === "Aberto");
  const usage = margin.total > 0 ? ((margin.used + margin.reserved + margin.blocked) / margin.total) * 100 : 0;
  const installmentLoad = employee.income > 0
    ? ((active.reduce((sum, contract) => sum + contract.installment, 0) + reserved.reduce((sum, contract) => sum + contract.installment, 0)) / employee.income) * 100
    : 0;

  let level = "Saudavel";
  let className = "";
  if (margin.available < 0 || rejected.length || usage >= 95) {
    level = "Critico";
    className = "danger";
  } else if (usage >= 75 || reserved.length || employee.status === "Em revisao") {
    level = "Atencao";
    className = "warning";
  }

  const signals = [
    {
      label: "Comprometimento da margem",
      value: `${Math.min(usage, 999).toFixed(0)}%`,
      detail: "Considera contratos ativos, reservas e bloqueios sobre a margem consignavel.",
      className: usage >= 95 ? "danger" : usage >= 75 ? "warning" : "",
    },
    {
      label: "Peso da parcela na renda",
      value: `${Math.min(installmentLoad, 999).toFixed(0)}%`,
      detail: "Leitura educativa do peso das parcelas sobre a renda bruta cadastrada.",
      className: installmentLoad >= 30 ? "warning" : "",
    },
    {
      label: "Reservas abertas",
      value: reserved.length,
      detail: "Reservas ainda podem virar desconto ou expirar conforme regra do convenio.",
      className: reserved.length ? "warning" : "",
    },
    {
      label: "Pendencias de retorno",
      value: rejected.length,
      detail: "Contratos rejeitados ou nao descontados precisam de motivo e proxima acao.",
      className: rejected.length ? "danger" : "",
    },
  ];

  const recommendations = [];
  if (level === "Critico") {
    recommendations.push("Priorizar conciliacao de retorno e revisar margem antes de nova reserva.");
  }
  if (level === "Atencao") {
    recommendations.push("Conferir reservas abertas e orientar o servidor antes de assumir nova parcela.");
  }
  if (employee.status === "Em revisao") {
    recommendations.push("Validar situacao funcional e base de calculo recebida da folha.");
  }
  if (openTickets.length) {
    recommendations.push("Responder ticket aberto com base em contratos, margem e retorno da folha.");
  }
  if (!recommendations.length) {
    recommendations.push("Sem sinais criticos no momento. Manter acompanhamento por competencia.");
  }

  return { margin, contracts, active, reserved, rejected, openTickets, usage, installmentLoad, level, className, signals, recommendations };
}

function ensureDebtInsightsView() {
  if (document.getElementById("debt-view")) return;

  const nav = document.querySelector(".nav-list");
  const healthButton = document.querySelector('[data-view="health"]');
  const contractsButton = document.querySelector('[data-view="contracts"]');
  const button = document.createElement("button");
  button.className = "nav-item";
  button.dataset.view = "debt";
  button.type = "button";
  button.textContent = "Endividamento";
  button.addEventListener("click", () => openView("debt"));
  nav?.insertBefore(button, healthButton?.nextSibling || contractsButton || null);

  document.querySelector(".main-panel")?.insertAdjacentHTML(
    "beforeend",
    `
      <section class="view" id="debt-view" aria-labelledby="debt-title">
        <div class="section-heading row-heading">
          <div>
            <h2 id="debt-title">Leitura de endividamento</h2>
            <p>Analise comprometimento, risco operacional e orientacoes para decisao responsavel.</p>
          </div>
          <select id="debt-employee-select" class="select-input"></select>
        </div>

        <div class="debt-summary-grid" id="debt-summary-grid"></div>

        <div class="content-grid debt-content">
          <section class="panel">
            <div class="panel-heading">
              <h3>Sinais analisados</h3>
            </div>
            <div class="debt-signal-list" id="debt-signal-list"></div>
          </section>

          <section class="panel">
            <div class="panel-heading">
              <h3>Recomendacoes</h3>
            </div>
            <div class="debt-note-list" id="debt-recommendations"></div>
          </section>
        </div>

        <section class="panel debt-governance">
          <div class="panel-heading">
            <h3>Uso responsavel da IA</h3>
          </div>
          <div class="debt-note-list" id="debt-governance"></div>
        </section>
      </section>
    `
  );

  document.getElementById("debt-employee-select")?.addEventListener("change", renderDebtInsights);
}

function renderDebtInsights() {
  ensureDebtInsightsView();

  const select = document.getElementById("debt-employee-select");
  const summary = document.getElementById("debt-summary-grid");
  const signals = document.getElementById("debt-signal-list");
  const recommendations = document.getElementById("debt-recommendations");
  const governance = document.getElementById("debt-governance");
  if (!select || !summary || !signals || !recommendations || !governance) return;

  const employees = getDebtEmployeeOptions();
  const previousValue = select.value;
  select.innerHTML = employees
    .map((employee) => `<option value="${employee.id}">${employee.name} - ${employee.enrollment}</option>`)
    .join("");
  if (previousValue && employees.some((employee) => employee.id === previousValue)) select.value = previousValue;

  const employee = employeeById(select.value) || employees[0];
  if (!employee) {
    summary.innerHTML = `<article class="debt-summary-card"><span>Sem dados</span><strong>0</strong></article>`;
    signals.innerHTML = "";
    recommendations.innerHTML = "";
    governance.innerHTML = "";
    return;
  }

  select.value = employee.id;
  select.disabled = state.currentProfile === "employee";
  const reading = getDebtReading(employee);

  const cards = [
    ["Status", `<span class="status ${reading.className}">${reading.level}</span>`],
    ["Margem disponivel", money.format(reading.margin.available)],
    ["Contratos", reading.contracts.length],
    ["Tickets abertos", reading.openTickets.length],
  ];

  summary.innerHTML = cards
    .map(
      ([label, value]) => `
        <article class="debt-summary-card">
          <span>${label}</span>
          <strong>${value}</strong>
        </article>
      `
    )
    .join("");

  signals.innerHTML = reading.signals
    .map(
      (signal) => `
        <article class="debt-signal">
          <div>
            <strong>${signal.label}</strong>
            <span>${signal.detail}</span>
          </div>
          <strong class="${signal.className}">${signal.value}</strong>
        </article>
      `
    )
    .join("");

  recommendations.innerHTML = reading.recommendations
    .map(
      (item) => `
        <div class="debt-note">
          <strong>Acao sugerida</strong>
          <span>${item}</span>
        </div>
      `
    )
    .join("");

  governance.innerHTML = `
    <div class="debt-note">
      <strong>Nao substituir analise humana</strong>
      <span>A leitura indica sinais, mas nao aprova credito, nao cancela contrato e nao altera margem sozinha.</span>
    </div>
    <div class="debt-note">
      <strong>Minimizacao de dados</strong>
      <span>Em uma IA real, enviar somente indicadores necessarios, evitando CPF completo e detalhes desnecessarios.</span>
    </div>
    <div class="debt-note">
      <strong>Explicabilidade</strong>
      <span>Cada recomendacao deve mostrar quais sinais foram usados: margem, reservas, retorno e contestacoes.</span>
    </div>
  `;
}

const debtStyle = document.createElement("style");
debtStyle.textContent = `
  .debt-summary-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(150px, 1fr));
    gap: 14px;
    margin-bottom: 18px;
  }
  .debt-summary-card,
  .debt-signal,
  .debt-note {
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
  }
  .debt-summary-card {
    padding: 16px;
    box-shadow: var(--shadow);
  }
  .debt-summary-card span,
  .debt-signal span,
  .debt-note span {
    display: block;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.4;
  }
  .debt-summary-card strong {
    display: block;
    margin-top: 8px;
    font-size: 24px;
  }
  .debt-content,
  .debt-governance {
    margin-top: 18px;
  }
  .debt-signal-list,
  .debt-note-list {
    display: grid;
    gap: 10px;
  }
  .debt-signal {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 12px;
    align-items: center;
    padding: 12px;
    background: var(--surface-2);
  }
  .debt-signal > strong {
    font-size: 22px;
  }
  .debt-signal .warning {
    color: #92400e;
  }
  .debt-signal .danger {
    color: #b42318;
  }
  .debt-note {
    padding: 12px;
    background: var(--surface-2);
  }
  .debt-note span {
    margin-top: 4px;
  }
  @media (max-width: 1040px) {
    .debt-summary-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 640px) {
    .debt-summary-grid,
    .debt-signal {
      grid-template-columns: 1fr;
    }
  }
`;
document.head.appendChild(debtStyle);

const renderBeforeDebtInsights = render;
render = function renderWithDebtInsights() {
  renderBeforeDebtInsights();
  renderDebtInsights();
};

render();
