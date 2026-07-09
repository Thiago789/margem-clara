if (!pageTitles.queue) {
  pageTitles.queue = "Pendencias";
}

if (!profileConfig.manager.views.includes("queue")) {
  const dashboardIndex = profileConfig.manager.views.indexOf("dashboard");
  profileConfig.manager.views.splice(dashboardIndex + 1, 0, "queue");
}

function ensureOperationalQueueView() {
  if (document.getElementById("queue-view")) return;

  const nav = document.querySelector(".nav-list");
  const employeesButton = document.querySelector('[data-view="employees"]');
  const button = document.createElement("button");
  button.className = "nav-item";
  button.dataset.view = "queue";
  button.type = "button";
  button.textContent = "Pendencias";
  button.addEventListener("click", () => openView("queue"));
  nav?.insertBefore(button, employeesButton || null);

  document.querySelector(".main-panel")?.insertAdjacentHTML(
    "beforeend",
    `
      <section class="view" id="queue-view" aria-labelledby="queue-title">
        <div class="section-heading row-heading">
          <div>
            <h2 id="queue-title">Fila de pendencias</h2>
            <p>Priorize o que precisa de decisao antes de fechar margem, reservas e folha.</p>
          </div>
          <button class="primary-button" id="queue-refresh-button" type="button">Atualizar fila</button>
        </div>

        <div class="queue-summary-grid" id="queue-summary-grid"></div>
        <div class="queue-stage-board" id="queue-stage-board"></div>

        <div class="content-grid queue-content">
          <section class="panel">
            <div class="panel-heading">
              <h3>Prioridade operacional</h3>
            </div>
            <div class="queue-list" id="queue-priority-list"></div>
          </section>

          <section class="panel">
            <div class="panel-heading">
              <h3>Proximas acoes</h3>
            </div>
            <div class="queue-actions" id="queue-actions"></div>
          </section>
        </div>
      </section>
    `
  );

  document.getElementById("queue-refresh-button")?.addEventListener("click", () => {
    auditEvent("Fila de pendencias recalculada pelo gestor.", "Pendencias");
    saveState();
    render();
    openView("queue");
  });
}

function getOperationalQueueData() {
  const reserved = state.contracts.filter((contract) => marginReservationStatuses.includes(contract.status));
  const sent = state.contracts.filter((contract) => contract.status === "Enviado para folha");
  const rejected = state.contracts.filter(contractHasReturnIssue);
  const reviewEmployees = state.employees.filter((employee) => employee.status === "Em revisao");
  const negativeEmployees = state.employees.filter((employee) => calculateMargin(employee).available < 0);
  const openTickets = state.tickets.filter((ticket) => ticket.status === "Aberto");
  const marginValidationPending = Boolean(state.employees.length && !state.lastMarginValidation);
  const insertionValidationPending = Boolean(reserved.length && !state.lastInsertionValidation);
  const marginValidationFreshness = typeof getFileValidationFreshness === "function"
    ? getFileValidationFreshness("margin")
    : { fresh: Boolean(state.lastMarginValidation), detail: "" };
  const insertionValidationFreshness = typeof getFileValidationFreshness === "function"
    ? getFileValidationFreshness("insertion")
    : { fresh: Boolean(state.lastInsertionValidation), detail: "" };
  const returnValidationFreshness = typeof getFileValidationFreshness === "function"
    ? getFileValidationFreshness("returnFile")
    : { fresh: Boolean(state.lastReturnReconciliation), detail: "" };
  const staleFileValidations = [
    state.lastMarginValidation && !marginValidationFreshness.fresh
      ? ["Arquivo de margem", marginValidationFreshness.detail]
      : null,
    state.lastInsertionValidation && !insertionValidationFreshness.fresh
      ? ["Arquivo de insercao", insertionValidationFreshness.detail]
      : null,
    state.lastReturnReconciliation && !returnValidationFreshness.fresh
      ? ["Arquivo retorno", returnValidationFreshness.detail]
      : null,
  ].filter(Boolean);
  const protocolRegistrationPending = Boolean(
    !state.lastFileProtocol &&
      (state.lastMarginValidation || state.lastInsertionValidation || state.lastReturnReconciliation)
  );
  const protocolFreshness = typeof getFileProtocolFreshness === "function"
    ? getFileProtocolFreshness()
    : { fresh: Boolean(state.lastFileProtocol), label: state.lastFileProtocol ? state.lastFileProtocol.status : "Pendente", detail: "" };
  const protocolRegistrationStale = Boolean(state.lastFileProtocol && !protocolFreshness.fresh);
  const publicValidationCoverage = typeof getPublicValidationCoverage === "function"
    ? getPublicValidationCoverage()
    : null;
  const publicValidationPending = Boolean(
    publicValidationCoverage?.configured &&
      publicValidationCoverage.pending > 0
  );
  const stalePublicValidations = typeof getPublicValidationEvidence === "function"
    ? state.employees.filter((employee) => getPublicValidationEvidence(employee)?.stale)
    : [];
  const missingInstallmentProgress = state.contracts.filter(
    (contract) =>
      contract.status === "Descontando" &&
      Number(contract.currentInstallment || 0) === 0 &&
      !contract.installmentHistory?.some((item) => item.status === "Descontando")
  );
  const closingData = typeof getPayrollClosingData === "function" ? getPayrollClosingData() : null;
  const closingItems = closingData?.actions?.map(([title, detail, target, severity]) => ({
    severity,
    className: severity === "Alta" ? "danger" : "warning",
    area: "Fechamento",
    title,
    detail,
    target,
  })) || [];

  const items = [
    ...closingItems,
    ...negativeEmployees.map((employee) => ({
      severity: "Alta",
      className: "danger",
      area: "Margem negativa",
      title: employee.name,
      detail: "Servidor com margem abaixo de zero. Revisar contratos, bloqueios ou base de calculo.",
      target: "margin",
    })),
    ...rejected.map((contract) => ({
      severity: "Alta",
      className: "danger",
      area: "Retorno da folha",
      title: contract.id,
      detail: contract.returnReason || "Contrato retornou rejeitado ou nao descontado.",
      target: "import",
    })),
    ...reviewEmployees.map((employee) => ({
      severity: "Media",
      className: "warning",
      area: "Servidor em revisao",
      title: employee.name,
      detail: "Conferir vinculo, situacao funcional e base de calculo antes de liberar operacoes.",
      target: "identity",
    })),
    ...(marginValidationPending
      ? [
          {
            severity: "Media",
            className: "warning",
            area: "Arquivo de margem",
            title: "Validacao pendente",
            detail: "Base de servidores carregada, mas ainda sem validacao registrada para a competencia.",
            target: "validation",
          },
        ]
      : []),
    ...(insertionValidationPending
      ? [
          {
            severity: "Media",
            className: "warning",
            area: "Arquivo de insercao",
            title: "Validacao pendente",
            detail: "Existem reservas prontas, mas a validacao final da insercao ainda nao foi registrada.",
            target: "validation",
          },
        ]
      : []),
    ...staleFileValidations.map(([title, detail]) => ({
      severity: "Media",
      className: "warning",
      area: "Validacao de arquivos",
      title: `${title} desatualizado`,
      detail,
      target: "validation",
    })),
    ...(protocolRegistrationPending
      ? [
          {
            severity: "Media",
            className: "warning",
            area: "Protocolos",
            title: "Protocolo pendente",
            detail: "Existem evidencias de arquivos da competencia, mas o protocolo operacional ainda nao foi registrado.",
            target: "protocols",
          },
        ]
      : []),
    ...(protocolRegistrationStale
      ? [
          {
            severity: "Media",
            className: "warning",
            area: "Protocolos",
            title: "Protocolo desatualizado",
            detail: protocolFreshness.detail || "As evidencias da competencia mudaram depois do ultimo protocolo.",
            target: "protocols",
          },
        ]
      : []),
    ...(publicValidationPending
      ? [
          {
            severity: "Media",
            className: "warning",
            area: "Validacao publica",
            title: state.conventionSettings.publicValidationSourceName || "Fonte publica",
            detail: `Cobertura incompleta: ${publicValidationCoverage.recorded}/${publicValidationCoverage.total} servidor(es) registrado(s), ${publicValidationCoverage.pending} pendente(s).`,
            target: "identity",
          },
        ]
      : []),
    ...stalePublicValidations.map((employee) => ({
      severity: "Media",
      className: "warning",
      area: "Validacao publica",
      title: employee.name,
      detail: "Evidencia de fonte publica ficou desatualizada apos mudanca no servidor ou na configuracao do convenio.",
      target: "identity",
    })),
    ...reserved.map((contract) => ({
      severity: "Media",
      className: "warning",
      area: "Reserva pendente",
      title: contract.id,
      detail: "Reserva ainda nao entrou no arquivo de insercao da folha.",
      target: "import",
    })),
    ...sent.map((contract) => ({
      severity: "Media",
      className: "warning",
      area: "Aguardando retorno",
      title: contract.id,
      detail: "Desconto enviado para folha, aguardando retorno de processamento.",
      target: "import",
    })),
    ...missingInstallmentProgress.map((contract) => ({
      severity: "Media",
      className: "warning",
      area: "Baixa de parcela",
      title: contract.id,
      detail: "Contrato consta como descontando, mas ainda nao possui parcela atual ou historico de baixa confirmado.",
      target: "competencies",
    })),
    ...openTickets.map((ticket) => ({
      severity: "Baixa",
      className: "",
      area: "Suporte",
      title: ticket.id,
      detail: ticket.description,
      target: "tickets",
    })),
  ];

  return { reserved, sent, rejected, reviewEmployees, negativeEmployees, publicValidationCoverage, stalePublicValidations, missingInstallmentProgress, openTickets, items };
}

function getOperationalQueueStages() {
  return [
    {
      id: "base",
      title: "Base e margem",
      views: ["employees", "identity", "enrollments", "margin", "validation", "health", "authenticity"],
    },
    {
      id: "operation",
      title: "Reserva e contrato",
      views: ["simulation", "contracts", "reservations", "authorizations", "contractrules", "contractfields", "debtops", "debtbalance", "debt"],
    },
    {
      id: "payroll",
      title: "Folha e retorno",
      views: ["import", "payroll", "protocols", "reconciliation", "competencies", "adjustments", "closing", "layouts"],
    },
    {
      id: "management",
      title: "Gestao",
      views: ["dashboard", "queue", "pilot", "readiness", "audit", "roadmap", "tickets", "lenders", "integrations", "api", "access", "qa"],
    },
  ];
}

function getOperationalQueueStageData(items) {
  const severityRank = { Alta: 0, Media: 1, Baixa: 2 };

  return getOperationalQueueStages().map((stage) => {
    const stageItems = items
      .filter((item) => stage.views.includes(item.target))
      .sort((a, b) => (severityRank[a.severity] ?? 3) - (severityRank[b.severity] ?? 3));
    const high = stageItems.filter((item) => item.severity === "Alta").length;
    const medium = stageItems.filter((item) => item.severity === "Media").length;
    const low = stageItems.filter((item) => item.severity === "Baixa").length;
    const next = stageItems[0] || null;

    return {
      ...stage,
      high,
      medium,
      low,
      total: stageItems.length,
      next,
      className: high ? "danger" : medium ? "warning" : "",
      status: high ? "Bloqueio" : medium ? "Atencao" : stageItems.length ? "Acompanhar" : "Livre",
    };
  });
}

function getOperationalRiskSummary() {
  const risks = [];
  const pushRisk = (area, title, status, detail, target, severity = "Media") => {
    risks.push({ area, title, status, detail, target, severity });
  };

  const marginFreshness = typeof getFileValidationFreshness === "function"
    ? getFileValidationFreshness("margin")
    : { fresh: Boolean(state.lastMarginValidation), label: state.lastMarginValidation ? "Registrado" : "Pendente", detail: "" };
  const insertionFreshness = typeof getFileValidationFreshness === "function"
    ? getFileValidationFreshness("insertion")
    : { fresh: Boolean(state.lastInsertionValidation), label: state.lastInsertionValidation ? "Registrado" : "Pendente", detail: "" };
  const returnFreshness = typeof getFileValidationFreshness === "function"
    ? getFileValidationFreshness("returnFile")
    : { fresh: Boolean(state.lastReturnReconciliation), label: state.lastReturnReconciliation ? "Registrado" : "Pendente", detail: "" };
  const protocolFreshness = typeof getFileProtocolFreshness === "function"
    ? getFileProtocolFreshness()
    : { fresh: Boolean(state.lastFileProtocol), label: state.lastFileProtocol ? state.lastFileProtocol.status : "Pendente", detail: "" };
  const closingFreshness = typeof getPayrollClosingDecisionFreshness === "function"
    ? getPayrollClosingDecisionFreshness()
    : { fresh: Boolean(state.lastPayrollClosingDecision), label: state.lastPayrollClosingDecision ? state.lastPayrollClosingDecision.decision : "Pendente", detail: "" };
  const qaFreshness = typeof getPilotQaApprovalFreshness === "function"
    ? getPilotQaApprovalFreshness()
    : { fresh: Boolean(state.pilotQaApproval), label: state.pilotQaApproval ? state.pilotQaApproval.status : "Pendente", detail: "" };
  const publicCoverage = typeof getPublicValidationCoverage === "function" ? getPublicValidationCoverage() : null;

  [
    ["Arquivos", "Margem", marginFreshness, "validation"],
    ["Arquivos", "Insercao", insertionFreshness, "validation"],
    ["Arquivos", "Retorno", returnFreshness, "validation"],
    ["Protocolos", "Protocolo da competencia", protocolFreshness, "protocols"],
    ["Fechamento", "Decisao da competencia", closingFreshness, "closing"],
    ["Homologacao", "Aceite do MVP", qaFreshness, "qa"],
  ].forEach(([area, title, freshness, target]) => {
    if (!freshness.fresh) {
      pushRisk(area, title, freshness.label || "Pendente", freshness.detail || "Evidencia pendente ou desatualizada.", target);
    }
  });

  if (publicCoverage?.configured && !publicCoverage.complete) {
    pushRisk(
      "Validacao publica",
      "Fonte publica",
      publicCoverage.stale ? "Desatualizada" : "Incompleta",
      `${publicCoverage.fresh}/${publicCoverage.total} fresco(s), ${publicCoverage.pending} pendente(s), ${publicCoverage.stale} desatualizado(s).`,
      "identity"
    );
  }

  const critical = risks.filter((risk) => risk.severity === "Alta").length;
  const stale = risks.filter((risk) => /desatualizad/i.test(`${risk.status} ${risk.detail}`)).length;
  const pending = risks.length - stale;
  const next = risks[0] || null;

  return {
    total: risks.length,
    critical,
    stale,
    pending,
    next,
    risks,
    label: risks.length ? `${risks.length} risco(s) operacional(is)` : "Controles atualizados",
    detail: risks.length
      ? `${stale} desatualizado(s), ${pending} pendente(s). Proximo: ${next.area} - ${next.title}.`
      : "Snapshots criticos estao coerentes com a base atual.",
  };
}

function renderOperationalQueue() {
  ensureOperationalQueueView();

  const summary = document.getElementById("queue-summary-grid");
  const stageBoard = document.getElementById("queue-stage-board");
  const list = document.getElementById("queue-priority-list");
  const actions = document.getElementById("queue-actions");
  if (!summary || !stageBoard || !list || !actions) return;

  const data = getOperationalQueueData();
  const highPriority = data.items.filter((item) => item.severity === "Alta").length;
  const mediumPriority = data.items.filter((item) => item.severity === "Media").length;
  const nextItem = data.items[0] || null;
  const stageData = getOperationalQueueStageData(data.items);

  const cards = [
    ["Prioridade alta", highPriority, highPriority ? "danger" : ""],
    ["Prioridade media", mediumPriority, mediumPriority ? "warning" : ""],
    ["Bloqueios fechamento", data.items.filter((item) => item.area === "Fechamento" && item.severity === "Alta").length, data.items.some((item) => item.area === "Fechamento" && item.severity === "Alta") ? "danger" : ""],
    ["Tickets abertos", data.openTickets.length, data.openTickets.length ? "warning" : ""],
    ["Total na fila", data.items.length, data.items.length ? "" : ""],
  ];

  summary.innerHTML = cards
    .map(
      ([label, value, className]) => `
        <article class="queue-summary-card">
          <span>${label}</span>
          <strong class="${className}">${value}</strong>
        </article>
      `
    )
    .join("");

  stageBoard.innerHTML = stageData
    .map((stage) => {
      const target = stage.next?.target || stage.views[0] || "queue";
      const detail = stage.next
        ? `${stage.next.area}: ${stage.next.title}`
        : "Sem pendencia acionavel nesta frente.";
      return `
        <button class="queue-stage-card ${stage.className}" type="button" data-target-view="${target}">
          <span>${stage.title}</span>
          <strong>${stage.status}</strong>
          <small>${stage.high} alta(s), ${stage.medium} media(s), ${stage.low} baixa(s)</small>
          <em>${detail}</em>
        </button>
      `;
    })
    .join("");

  list.innerHTML = data.items.length
    ? data.items
        .map(
          (item) => `
            <article class="queue-item">
              <div>
                <span class="status ${item.className}">${item.severity}</span>
                <strong>${item.area}: ${item.title}</strong>
                <p>${item.detail}</p>
              </div>
              <button class="secondary-button queue-open" data-target-view="${item.target}" type="button">Abrir</button>
            </article>
          `
        )
        .join("")
    : `<div class="empty-state">Nenhuma pendencia operacional critica no momento.</div>`;

  actions.innerHTML = nextItem
    ? `
      <div class="queue-action-row queue-next-action">
        <div>
          <strong>1. ${nextItem.area}: ${nextItem.title}</strong>
          <span>${nextItem.detail}</span>
        </div>
        <button class="primary-button queue-open" data-target-view="${nextItem.target}" type="button">Abrir prioridade</button>
      </div>
      <div class="queue-action-row">
        <strong>2. Resolver itens relacionados</strong>
        <span>Depois da prioridade, trate pendencias da mesma etapa antes de avancar para novo ciclo.</span>
      </div>
      <div class="queue-action-row">
        <strong>3. Registrar decisao</strong>
        <span>Use Auditoria para manter rastro das revisoes manuais e excecoes.</span>
      </div>
    `
    : `
      <div class="queue-action-row">
        <strong>1. Fila limpa</strong>
        <span>Nenhuma decisao operacional critica no momento. Avance para prontidao ou homologacao do fluxo piloto.</span>
      </div>
      <div class="queue-action-row">
        <strong>2. Conferir competencia</strong>
        <span>Valide retorno, baixa de parcela e fechamento antes de encerrar a demonstracao.</span>
      </div>
    `;

  document.querySelectorAll(".queue-open").forEach((button) => {
    button.addEventListener("click", () => openView(button.dataset.targetView));
  });

  document.querySelectorAll(".queue-stage-card").forEach((button) => {
    button.addEventListener("click", () => openView(button.dataset.targetView));
  });
}

const queueStyle = document.createElement("style");
queueStyle.textContent = `
  .queue-summary-grid {
    display: grid;
    grid-template-columns: repeat(5, minmax(130px, 1fr));
    gap: 14px;
    margin-bottom: 18px;
  }
  .queue-summary-card {
    padding: 16px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
    box-shadow: var(--shadow);
  }
  .queue-summary-card span {
    display: block;
    color: var(--muted);
    font-size: 13px;
  }
  .queue-summary-card strong {
    display: block;
    margin-top: 8px;
    font-size: 26px;
  }
  .queue-summary-card strong.warning {
    color: var(--accent);
  }
  .queue-summary-card strong.danger {
    color: var(--danger);
  }
  .queue-list,
  .queue-actions {
    display: grid;
    gap: 10px;
  }
  .queue-stage-board {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
    margin: 0 0 18px;
  }
  .queue-stage-card {
    display: grid;
    gap: 5px;
    min-height: 128px;
    padding: 12px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface-2);
    color: var(--text);
    text-align: left;
  }
  .queue-stage-card.warning {
    border-color: rgba(217, 119, 6, 0.35);
    background: rgba(217, 119, 6, 0.07);
  }
  .queue-stage-card.danger {
    border-color: rgba(185, 28, 28, 0.35);
    background: rgba(185, 28, 28, 0.07);
  }
  .queue-stage-card span,
  .queue-stage-card small,
  .queue-stage-card em {
    color: var(--muted);
    font-size: 12px;
    font-style: normal;
    line-height: 1.35;
  }
  .queue-stage-card strong {
    font-size: 18px;
  }
  .queue-stage-card.warning strong {
    color: var(--accent);
  }
  .queue-stage-card.danger strong {
    color: var(--danger);
  }
  .queue-stage-card em {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .queue-item {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 12px;
    align-items: center;
    padding: 12px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface-2);
  }
  .queue-item strong,
  .queue-action-row strong {
    display: block;
    margin-top: 6px;
  }
  .queue-item p,
  .queue-action-row span {
    display: block;
    margin: 4px 0 0;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.4;
  }
  .queue-action-row {
    padding: 12px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface-2);
  }
  .queue-next-action {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 12px;
    align-items: center;
  }
  @media (max-width: 1040px) {
    .queue-summary-grid,
    .queue-stage-board {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 640px) {
    .queue-summary-grid,
    .queue-stage-board,
    .queue-item,
    .queue-next-action {
      grid-template-columns: 1fr;
    }
    .queue-stage-card {
      min-height: auto;
    }
  }
`;
document.head.appendChild(queueStyle);

const renderBeforeOperationalQueue = render;
render = function renderWithOperationalQueue() {
  renderBeforeOperationalQueue();
  renderOperationalQueue();
};

render();
