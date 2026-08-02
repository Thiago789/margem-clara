if (!pageTitles.contracttimeline) {
  pageTitles.contracttimeline = "Historico contrato";
}

function contractTimelineEvents(contract) {
  if (!contract) return [];

  const events = [
    {
      date: contract.createdAt || contract.reservedAt || today(),
      title: "Reserva criada",
      detail: `${contract.product || "Produto"} - ${money.format(Number(contract.installment || 0))} em ${contract.installments || 0}x.`,
      type: "ok",
    },
  ];

  if (contract.sentToPayrollAt) {
    events.push({
      date: contract.sentToPayrollAt,
      title: "Enviado para folha",
      detail: "Contrato entrou no arquivo de insercao da competencia.",
      type: "info",
    });
  }

  if (Array.isArray(contract.installmentHistory)) {
    contract.installmentHistory.forEach((item) => {
      events.push({
        date: item.processedAt || contract.returnProcessedAt || today(),
        title: item.duplicate ? "Retorno duplicado bloqueado" : `Retorno: ${item.status}`,
        detail: [
          item.competency ? `Competencia ${item.competency}` : "",
          money.format(Number(item.amount || 0)),
          item.reason || (item.divergent ? "Valor divergente" : "Processado"),
        ]
          .filter(Boolean)
          .join(" - "),
        type: item.duplicate || item.divergent || returnIssueStatuses.includes(item.status) ? "warning" : "ok",
      });
    });
  } else if (contract.returnProcessedAt) {
    events.push({
      date: contract.returnProcessedAt,
      title: `Retorno: ${contract.status}`,
      detail: contract.returnReason || `Valor retornado ${money.format(Number(contract.discountedValue || 0))}.`,
      type: contractHasReturnIssue(contract) ? "warning" : "ok",
    });
  }

  if (Array.isArray(contract.adjustmentHistory)) {
    contract.adjustmentHistory.forEach((item) => {
      events.push({
        date: item.decidedAt || today(),
        title: `Ajuste: ${item.decisionLabel || item.decision}`,
        detail: `${item.previousStatus || "-"} -> ${item.nextStatus || "-"} por ${item.decidedBy || "Sistema"}.`,
        type: "warning",
      });
    });
  }

  if (contract.reprocessRequestedAt) {
    events.push({
      date: contract.reprocessRequestedAt,
      title: "Reenvio solicitado",
      detail: "Contrato retornou para reserva e deve entrar em nova insercao.",
      type: "warning",
    });
  }

  if (contract.adjustedAt) {
    events.push({
      date: contract.adjustedAt,
      title: "Baixa por ajuste formal",
      detail: contract.adjustmentResolution || "Parcela ajustada manualmente com auditoria.",
      type: "warning",
    });
  }

  if (contract.canceledAt) {
    events.push({
      date: contract.canceledAt,
      title: "Contrato cancelado",
      detail: contract.adjustmentResolution || "Margem liberada operacionalmente.",
      type: "danger",
    });
  }

  if (contract.liquidatedAt) {
    events.push({
      date: contract.liquidatedAt,
      title: "Contrato liquidado",
      detail: "Prazo final atingido e margem liberada conforme regra.",
      type: "ok",
    });
  }

  return events.sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function ensureContractTimelinePanel() {
  if (document.getElementById("contract-timeline-panel")) return;

  const tablePanel = document.querySelector("#contracts-view .table-panel");
  if (!tablePanel) return;

  tablePanel.insertAdjacentHTML(
    "afterend",
    `
      <section class="panel contract-timeline-panel" id="contract-timeline-panel">
        <div class="panel-heading">
          <h3>Linha do tempo do contrato</h3>
          <select id="contract-timeline-select" class="select-input compact-select"></select>
        </div>
        <div class="contract-timeline-summary" id="contract-timeline-summary"></div>
        <div class="contract-timeline-list" id="contract-timeline-list"></div>
      </section>
    `
  );

  document.getElementById("contract-timeline-select")?.addEventListener("change", renderContractTimelinePanel);
}

function renderContractTimelineOptions() {
  const select = document.getElementById("contract-timeline-select");
  if (!select) return;

  const previous = select.value;
  select.innerHTML = state.contracts
    .map((contract) => {
      const employee = employeeById(contract.employeeId);
      return `<option value="${contract.id}">${contract.id} - ${employee?.name || "Servidor"}</option>`;
    })
    .join("");

  if (state.contracts.some((contract) => contract.id === previous)) {
    select.value = previous;
  }
}

function renderContractTimelinePanel() {
  ensureContractTimelinePanel();
  renderContractTimelineOptions();

  const select = document.getElementById("contract-timeline-select");
  const summary = document.getElementById("contract-timeline-summary");
  const list = document.getElementById("contract-timeline-list");
  if (!select || !summary || !list) return;

  const contract = state.contracts.find((item) => item.id === select.value) || state.contracts[0];
  if (!contract) {
    summary.innerHTML = "";
    list.innerHTML = `<div class="empty-state">Nenhum contrato cadastrado.</div>`;
    return;
  }

  select.value = contract.id;
  const employee = employeeById(contract.employeeId);
  const events = contractTimelineEvents(contract);
  summary.innerHTML = `
    <div>
      <strong>${contract.id}</strong>
      <span>${employee?.name || "Servidor"} - ${contract.product || "Produto"} - ${contract.status}</span>
    </div>
    <div>
      <span>Parcela atual</span>
      <strong>${contract.currentInstallment || 0}/${contract.installments || 0}</strong>
    </div>
    <div>
      <span>Eventos</span>
      <strong>${events.length}</strong>
    </div>
  `;

  list.innerHTML = events.length
    ? events
        .map(
          (event) => `
            <article class="contract-timeline-item ${event.type}">
              <time>${event.date}</time>
              <div>
                <strong>${event.title}</strong>
                <span>${event.detail}</span>
              </div>
            </article>
          `
        )
        .join("")
    : `<div class="empty-state">Nenhum evento registrado para este contrato.</div>`;
}

const contractTimelineStyle = document.createElement("style");
contractTimelineStyle.textContent = `
  .contract-timeline-panel {
    margin-top: 18px;
  }
  .contract-timeline-summary {
    display: grid;
    grid-template-columns: 1.4fr 0.7fr 0.5fr;
    gap: 12px;
    margin-bottom: 12px;
  }
  .contract-timeline-summary > div,
  .contract-timeline-item {
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface-2);
    padding: 12px;
  }
  .contract-timeline-summary span,
  .contract-timeline-item span,
  .contract-timeline-item time {
    display: block;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.4;
  }
  .contract-timeline-list {
    display: grid;
    gap: 10px;
  }
  .contract-timeline-item {
    display: grid;
    grid-template-columns: 110px 1fr;
    gap: 12px;
    align-items: start;
  }
  .contract-timeline-item.warning {
    border-color: rgba(245, 158, 11, 0.45);
  }
  .contract-timeline-item.danger {
    border-color: rgba(239, 68, 68, 0.45);
  }
  @media (max-width: 760px) {
    .contract-timeline-summary,
    .contract-timeline-item {
      grid-template-columns: 1fr;
    }
  }
`;
document.head.appendChild(contractTimelineStyle);

const renderBeforeContractTimeline = render;
render = function renderWithContractTimeline() {
  renderBeforeContractTimeline();
  renderContractTimelinePanel();
};

render();
