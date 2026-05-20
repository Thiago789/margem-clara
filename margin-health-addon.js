if (!pageTitles.health) {
  pageTitles.health = "Saude da margem";
}

["manager", "employee", "lender"].forEach((profile) => {
  if (!profileConfig[profile].views.includes("health")) {
    const marginIndex = profileConfig[profile].views.indexOf("margin");
    profileConfig[profile].views.splice(marginIndex + 1, 0, "health");
  }
});

function ensureMarginHealthView() {
  if (document.getElementById("health-view")) return;

  const nav = document.querySelector(".nav-list");
  const contractsButton = document.querySelector('[data-view="contracts"]');
  const button = document.createElement("button");
  button.className = "nav-item";
  button.dataset.view = "health";
  button.type = "button";
  button.textContent = "Saude margem";
  button.addEventListener("click", () => openView("health"));
  nav?.insertBefore(button, contractsButton || null);

  document.querySelector(".main-panel")?.insertAdjacentHTML(
    "beforeend",
    `
      <section class="view" id="health-view" aria-labelledby="health-title">
        <div class="section-heading row-heading">
          <div>
            <h2 id="health-title">Saude da margem</h2>
            <p>Leitura educativa do comprometimento, pendencias e sinais de atencao.</p>
          </div>
          <select id="health-employee-select" class="select-input"></select>
        </div>

        <div class="health-grid" id="health-grid"></div>

        <section class="panel health-advice-panel">
          <div class="panel-heading">
            <h3>Orientacoes</h3>
          </div>
          <div class="health-advice" id="health-advice"></div>
        </section>
      </section>
    `
  );

  document.getElementById("health-employee-select")?.addEventListener("change", renderMarginHealth);
}

function getHealthLevel(margin, contracts) {
  const usage = margin.total > 0 ? ((margin.used + margin.reserved + margin.blocked) / margin.total) * 100 : 0;
  const hasRejected = contracts.some((contract) => ["Rejeitado", "Nao descontado"].includes(contract.status));

  if (margin.available < 0 || usage >= 95 || hasRejected) {
    return { label: "Critica", className: "danger", usage };
  }

  if (usage >= 75 || margin.status === "Em revisao") {
    return { label: "Atencao", className: "warning", usage };
  }

  return { label: "Saudavel", className: "", usage };
}

function renderMarginHealth() {
  ensureMarginHealthView();

  const select = document.getElementById("health-employee-select");
  const grid = document.getElementById("health-grid");
  const advice = document.getElementById("health-advice");
  if (!select || !grid || !advice) return;

  const options = state.employees
    .map((employee) => `<option value="${employee.id}">${employee.name} - ${employee.enrollment}</option>`)
    .join("");
  const previousValue = select.value;
  select.innerHTML = options;
  if (previousValue) select.value = previousValue;

  const employee = employeeById(select.value) || state.employees[0];
  if (!employee) {
    grid.innerHTML = `<section class="panel">Nenhum servidor cadastrado.</section>`;
    advice.innerHTML = "";
    return;
  }

  select.value = employee.id;
  const margin = calculateMargin(employee);
  const contracts = state.contracts.filter((contract) => contract.employeeId === employee.id);
  const active = activeContracts(employee.id);
  const reserved = reservedContracts(employee.id);
  const rejected = contracts.filter((contract) => ["Rejeitado", "Nao descontado"].includes(contract.status));
  const level = getHealthLevel(margin, contracts);
  const usageLabel = Number.isFinite(level.usage) ? `${Math.min(level.usage, 100).toFixed(0)}%` : "0%";

  grid.innerHTML = `
    <article class="panel health-card">
      <span>Status geral</span>
      <strong><span class="status ${level.className}">${level.label}</span></strong>
      <p>${employee.name}</p>
    </article>
    <article class="panel health-card">
      <span>Comprometimento</span>
      <strong>${usageLabel}</strong>
      <div class="progress-bar"><span style="width:${Math.min(level.usage, 100)}%"></span></div>
    </article>
    <article class="panel health-card">
      <span>Margem disponivel</span>
      <strong>${money.format(margin.available)}</strong>
      <p>Total: ${money.format(margin.total)}</p>
    </article>
    <article class="panel health-card">
      <span>Contratos ativos</span>
      <strong>${active.length}</strong>
      <p>Reservas pendentes: ${reserved.length}</p>
    </article>
    <article class="panel health-card">
      <span>Pendencias</span>
      <strong>${rejected.length}</strong>
      <p>Retornos rejeitados ou nao descontados.</p>
    </article>
    <article class="panel health-card">
      <span>Contestacoes</span>
      <strong>${state.tickets.filter((ticket) => ticket.employeeId === employee.id && ticket.status === "Aberto").length}</strong>
      <p>Tickets abertos para esta matricula.</p>
    </article>
  `;

  const adviceItems = [];
  if (level.label === "Critica") {
    adviceItems.push("Priorizar revisao da margem antes de criar novas reservas.");
  }
  if (level.label === "Atencao") {
    adviceItems.push("Acompanhar novas reservas e conferir contratos que consomem maior parcela.");
  }
  if (!reserved.length && level.label === "Saudavel") {
    adviceItems.push("Margem sem sinais criticos no momento. Manter acompanhamento por competencia.");
  }
  if (rejected.length) {
    adviceItems.push("Verificar motivos de retorno da folha e tratar pendencias com RH/consignataria.");
  }
  if (margin.status === "Em revisao") {
    adviceItems.push("Conferir base de calculo e descontos obrigatorios da folha.");
  }

  advice.innerHTML = adviceItems.map((item) => `<div class="alert-item">${item}</div>`).join("");
}

const healthStyle = document.createElement("style");
healthStyle.textContent = `
  .health-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
  }
  .health-card {
    min-height: 140px;
  }
  .health-card span:first-child {
    display: block;
    color: var(--muted);
    font-size: 13px;
    margin-bottom: 8px;
  }
  .health-card strong {
    display: block;
    font-size: 26px;
    margin-bottom: 8px;
  }
  .health-card p {
    margin: 0;
    color: var(--muted);
    font-size: 13px;
  }
  .health-advice-panel {
    margin-top: 18px;
  }
  .health-advice {
    display: grid;
    gap: 10px;
  }
  @media (max-width: 980px) {
    .health-grid {
      grid-template-columns: 1fr;
    }
  }
`;
document.head.appendChild(healthStyle);

const renderBeforeHealth = render;
render = function renderWithMarginHealth() {
  renderBeforeHealth();
  ensureMarginHealthView();
  renderMarginHealth();
};

render();
