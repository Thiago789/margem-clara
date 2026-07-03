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
  const protocolRegistrationPending = Boolean(
    !state.lastFileProtocol &&
      (state.lastMarginValidation || state.lastInsertionValidation || state.lastReturnReconciliation)
  );
  const publicValidationPending = Boolean(
    state.conventionSettings?.publicValidationSourceEnabled &&
      typeof getPublicValidationEvidence === "function" &&
      !state.movements.some((movement) => movement.source === "Validacao do servidor" && /fonte publica/i.test(movement.text || ""))
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
    ...(publicValidationPending
      ? [
          {
            severity: "Media",
            className: "warning",
            area: "Validacao publica",
            title: state.conventionSettings.publicValidationSourceName || "Fonte publica",
            detail: "Fonte publica configurada, mas ainda sem evidencia registrada na auditoria da validacao do servidor.",
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

  return { reserved, sent, rejected, reviewEmployees, negativeEmployees, stalePublicValidations, missingInstallmentProgress, openTickets, items };
}

function renderOperationalQueue() {
  ensureOperationalQueueView();

  const summary = document.getElementById("queue-summary-grid");
  const list = document.getElementById("queue-priority-list");
  const actions = document.getElementById("queue-actions");
  if (!summary || !list || !actions) return;

  const data = getOperationalQueueData();
  const highPriority = data.items.filter((item) => item.severity === "Alta").length;
  const mediumPriority = data.items.filter((item) => item.severity === "Media").length;
  const nextItem = data.items[0] || null;

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
    .queue-summary-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 640px) {
    .queue-summary-grid,
    .queue-item,
    .queue-next-action {
      grid-template-columns: 1fr;
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
