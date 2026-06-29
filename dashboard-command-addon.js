function ensureDashboardCommandCenter() {
  if (document.getElementById("dashboard-command-center")) return;
  const metrics = document.getElementById("metrics");
  if (!metrics) return;

  metrics.insertAdjacentHTML(
    "afterend",
    `
      <section class="panel dashboard-command-center" id="dashboard-command-center">
        <div class="dashboard-command-grid" id="dashboard-command-grid"></div>
      </section>
    `
  );
}

function dashboardReadinessDecision() {
  if (typeof getReadinessGroups !== "function" || typeof getReadinessCurrentDecision !== "function") {
    return {
      average: 0,
      label: "Prontidao nao calculada",
      nextGroup: { title: "Prontidao V1", score: 0 },
    };
  }

  return getReadinessCurrentDecision(getReadinessGroups());
}

function dashboardJourneyDecision() {
  if (typeof getPilotFlowSteps !== "function" || typeof getPilotJourneyHealth !== "function") {
    return {
      label: "Jornada operacional",
      current: {
        label: "Abrir fluxo piloto",
        detail: "Acompanhe o ciclo completo da competencia.",
        action: "Abrir fluxo",
        target: "pilot",
      },
      percent: 0,
    };
  }

  return getPilotJourneyHealth(getPilotFlowSteps());
}

function dashboardQueueDecision() {
  if (typeof getOperationalQueueData !== "function") {
    return { high: 0, total: 0, next: null };
  }

  const data = getOperationalQueueData();
  return {
    high: data.items.filter((item) => item.severity === "Alta").length,
    total: data.items.length,
    next: data.items[0] || null,
  };
}

function dashboardPayrollDecision() {
  if (typeof getPayrollClosingData !== "function") {
    return {
      month: new Date().toISOString().slice(0, 7),
      decision: "Competencia nao calculada",
      className: "",
      blockers: [],
      warnings: [],
      sent: [],
      missingInstallmentProgress: [],
      batchAwaitingReturn: [],
      batchUnresolved: [],
    };
  }

  return getPayrollClosingData();
}

function dashboardRoadmapFocus() {
  if (typeof getRoadmapCurrentFocus !== "function") {
    return {
      title: "Homologacao operacional",
      detail: "Validar o roteiro ponta a ponta antes de abrir novas frentes.",
      target: "qa",
      action: "Abrir homologacao",
    };
  }

  return getRoadmapCurrentFocus();
}

function dashboardQaApprovalLabel() {
  const approval = state.pilotQaApproval;
  if (!approval) return "aceite nao registrado";
  return `${approval.score || 0}% em ${approval.date || "data nao informada"}`;
}

function dashboardFocusOrigin(queue, focus) {
  if (queue.next) return `Fila: ${queue.next.severity}`;
  return focus?.target ? `Roadmap: ${pageTitles[focus.target] || focus.target}` : "Roadmap";
}

function renderDashboardCommandCenter() {
  ensureDashboardCommandCenter();
  const grid = document.getElementById("dashboard-command-grid");
  const panel = document.getElementById("dashboard-command-center");
  if (!grid || !panel) return;

  panel.hidden = state.currentProfile !== "manager";
  if (panel.hidden) return;

  const journey = dashboardJourneyDecision();
  const queue = dashboardQueueDecision();
  const readiness = dashboardReadinessDecision();
  const payroll = dashboardPayrollDecision();
  const focus = dashboardRoadmapFocus();
  const qaApproval = dashboardQaApprovalLabel();
  const queueTarget = queue.next?.target || "queue";
  const queueTitle = queue.next ? `${queue.next.area}: ${queue.next.title}` : "Fila sem pendencias criticas";
  const queueDetail = queue.next ? queue.next.detail : "Nenhuma decisao operacional critica no momento.";
  const focusOrigin = dashboardFocusOrigin(queue, focus);
  const payrollBlockers = payroll.blockers.length;
  const payrollWarnings = payroll.warnings.length;
  const payrollPendingReturns = payroll.sent.length + payroll.batchAwaitingReturn.length;
  const payrollPayoffWarnings = payroll.missingInstallmentProgress.length;

  grid.innerHTML = `
    <article class="dashboard-command-card">
      <span>${journey.label}</span>
      <strong>${journey.current.label}</strong>
      <p>${journey.current.detail}</p>
      <div class="dashboard-command-meter" aria-label="${journey.percent}% do fluxo piloto">
        <span style="width: ${journey.percent}%"></span>
      </div>
      <button class="primary-button dashboard-command-action" data-target-view="${journey.current.target}" type="button">${journey.current.action}</button>
    </article>
    <article class="dashboard-command-card">
      <span>${queue.high} alta(s), ${queue.total} total</span>
      <strong>${queueTitle}</strong>
      <p>${queueDetail}</p>
      <button class="secondary-button dashboard-command-action" data-target-view="${queueTarget}" type="button">Abrir fila</button>
    </article>
    <article class="dashboard-command-card">
      <span>Competencia ${payroll.month}</span>
      <strong>${payroll.decision}</strong>
      <p>${payrollBlockers} bloqueio(s), ${payrollWarnings} ressalva(s), ${payrollPendingReturns} retorno(s) pendente(s), ${payrollPayoffWarnings} baixa(s) sem evidencia.</p>
      <button class="secondary-button dashboard-command-action" data-target-view="closing" type="button">Ver fechamento</button>
    </article>
    <article class="dashboard-command-card">
      <span>${readiness.average}% de prontidao</span>
      <strong>${readiness.nextGroup.title}</strong>
      <p>${readiness.nextGroup.score}% de maturidade. Proximo criterio: ${readiness.nextItem[0]} (${readiness.nextItem[1]}). Ultimo aceite: ${qaApproval}.</p>
      <button class="secondary-button dashboard-command-action" data-target-view="readiness" type="button">Ver prontidao</button>
    </article>
    <article class="dashboard-command-card">
      <span>Foco recomendado - ${focusOrigin}</span>
      <strong>${focus.title}</strong>
      <p>${focus.detail}</p>
      <button class="secondary-button dashboard-command-action" data-target-view="${focus.target}" type="button">${focus.action}</button>
    </article>
  `;

  document.querySelectorAll(".dashboard-command-action").forEach((button) => {
    button.addEventListener("click", () => openView(button.dataset.targetView));
  });
}

const dashboardCommandStyle = document.createElement("style");
dashboardCommandStyle.textContent = `
  .dashboard-command-center {
    margin: 18px 0;
  }
  .dashboard-command-grid {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 14px;
  }
  .dashboard-command-card {
    display: grid;
    gap: 10px;
    align-content: start;
    min-height: 190px;
    padding: 14px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface-2);
  }
  .dashboard-command-card span,
  .dashboard-command-card p {
    display: block;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.4;
  }
  .dashboard-command-card strong {
    display: block;
    font-size: 18px;
  }
  .dashboard-command-card p {
    margin: 0;
  }
  .dashboard-command-meter {
    height: 9px;
    overflow: hidden;
    border-radius: 999px;
    background: var(--line);
  }
  .dashboard-command-meter span {
    display: block;
    height: 100%;
    background: var(--primary);
  }
  .dashboard-command-card .primary-button,
  .dashboard-command-card .secondary-button {
    align-self: end;
    justify-self: start;
  }
  @media (max-width: 1040px) {
    .dashboard-command-grid {
      grid-template-columns: 1fr;
    }
    .dashboard-command-card {
      min-height: auto;
    }
  }
`;
document.head.appendChild(dashboardCommandStyle);

const renderBeforeDashboardCommand = render;
render = function renderWithDashboardCommand() {
  renderBeforeDashboardCommand();
  renderDashboardCommandCenter();
};

render();
