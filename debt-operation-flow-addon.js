if (!pageTitles.debtops) {
  pageTitles.debtops = "Operacoes divida";
}

const debtOperationStatuses = [
  "Aguardando saldo formal",
  "Saldo solicitado",
  "Saldo recebido",
  "Aguardando aceite",
  "Aguardando comprovante",
  "Quitado na origem",
  "Novo contrato gerado",
  "Recusado",
  "Cancelado",
];

const debtOperationNextStatus = {
  "Aguardando saldo formal": "Saldo solicitado",
  "Saldo solicitado": "Saldo recebido",
  "Saldo recebido": "Aguardando aceite",
  "Aguardando aceite": "Aguardando comprovante",
  "Aguardando comprovante": "Quitado na origem",
  "Quitado na origem": "Novo contrato gerado",
};

function getDebtOperationRows() {
  const candidates = state.contracts.filter((contract) =>
    ["Refinanciamento", "Portabilidade", "Compra de divida"].includes(contract.contractType)
  );

  const fallback = state.contracts.slice(0, 3).map((contract, index) => ({
    ...contract,
    contractType: ["Refinanciamento", "Portabilidade", "Compra de divida"][index] || "Refinanciamento",
    debtOperationStatus: ["Aguardando saldo formal", "Saldo solicitado", "Aguardando comprovante"][index] || "Aguardando saldo formal",
  }));

  return (candidates.length ? candidates : fallback).map((contract) => {
    const employee = employeeById(contract.employeeId);
    const balance = typeof estimateDebtBalance === "function"
      ? estimateDebtBalance(contract)
      : { remaining: Number(contract.installments || 0) - Number(contract.currentInstallment || 0), estimatedBalance: Number(contract.installment || 0) };
    const sourceContractId = contract.sourceContractId || contract.id;
    const status = contract.debtOperationStatus || (contract.contractType === "Refinanciamento" ? "Aguardando saldo formal" : "Em analise");
    return {
      ...contract,
      employeeName: employee?.name || "Servidor",
      enrollment: employee?.enrollment || "",
      balance,
      sourceContractId,
      status,
      nextStep: getDebtOperationNextStep(contract.contractType, status),
    };
  });
}

function getDebtOperationNextStep(type, status) {
  if (status === "Saldo recebido") return "Conferir validade, CET, parcela e valor liberado.";
  if (status === "Aguardando aceite") return "Registrar aceite antes de seguir para quitacao.";
  if (status === "Quitado na origem") return "Gerar ou vincular novo contrato substituto.";
  if (status === "Novo contrato gerado") return "Acompanhar envio para folha e retorno da competencia.";
  if (["Recusado", "Cancelado"].includes(status)) return "Manter evidencias e motivo para auditoria.";
  if (status === "Aguardando saldo formal") return "Solicitar saldo formal com validade e protocolo.";
  if (status === "Saldo solicitado") return "Aguardar retorno da instituicao origem.";
  if (status === "Aguardando comprovante") return "Anexar comprovante de quitacao antes de liberar margem.";
  if (type === "Refinanciamento") return "Comparar contrato origem com nova proposta.";
  if (type === "Portabilidade") return "Validar aceite da portabilidade e banco origem.";
  return "Validar credor original, valor de compra e evidencia.";
}

function ensureDebtOperationView() {
  if (document.getElementById("debtops-view")) return;

  const nav = document.querySelector(".nav-list");
  const balanceButton = document.querySelector('[data-view="debtbalance"]');
  const button = document.createElement("button");
  button.className = "nav-item";
  button.dataset.view = "debtops";
  button.type = "button";
  button.textContent = "Operacoes divida";
  button.addEventListener("click", () => openView("debtops"));
  nav?.insertBefore(button, balanceButton?.nextSibling || null);

  ["manager", "lender"].forEach((profile) => {
    if (!profileConfig[profile].views.includes("debtops")) {
      const balanceIndex = profileConfig[profile].views.indexOf("debtbalance");
      profileConfig[profile].views.splice(balanceIndex >= 0 ? balanceIndex + 1 : profileConfig[profile].views.length, 0, "debtops");
    }
  });

  document.querySelector(".main-panel")?.insertAdjacentHTML(
    "beforeend",
    `
      <section class="view" id="debtops-view" aria-labelledby="debtops-title">
        <div class="section-heading row-heading">
          <div>
            <h2 id="debtops-title">Fluxos de refin, portabilidade e compra</h2>
            <p>Acompanhe contrato origem, saldo formal, status e proxima acao.</p>
          </div>
          <button class="primary-button" id="debtops-audit-button" type="button">Registrar revisao</button>
        </div>

        <div class="debtops-summary" id="debtops-summary"></div>

        <section class="panel">
          <div class="panel-heading">
            <h3>Esteira operacional</h3>
          </div>
          <div class="debtops-list" id="debtops-list"></div>
        </section>

        <div class="content-grid debtops-content">
          <section class="panel">
            <div class="panel-heading">
              <h3>Checklist minimo</h3>
            </div>
            <div class="debtops-notes" id="debtops-checklist"></div>
          </section>

          <section class="panel">
            <div class="panel-heading">
              <h3>Bloqueios obrigatorios</h3>
            </div>
            <div class="debtops-notes" id="debtops-blockers"></div>
          </section>
        </div>
      </section>
    `
  );

  document.getElementById("debtops-audit-button")?.addEventListener("click", () => {
    auditEvent("Revisao de operacoes de divida registrada.", "Operacoes de divida");
    saveState();
    render();
    openView("debtops");
  });

  document.getElementById("debtops-list")?.addEventListener("click", (event) => {
    const action = event.target.closest("[data-debtops-action]");
    if (!action) return;

    const contract = state.contracts.find((item) => item.id === action.dataset.contractId);
    if (!contract) return;

    updateDebtOperationStatus(contract, action.dataset.debtopsAction);
  });
}

function updateDebtOperationStatus(contract, action) {
  const previousStatus = contract.debtOperationStatus || (contract.contractType === "Refinanciamento" ? "Aguardando saldo formal" : "Em analise");
  let nextStatus = previousStatus;

  if (action === "advance") {
    nextStatus = debtOperationNextStatus[previousStatus] || previousStatus;
  }
  if (action === "reject") {
    nextStatus = "Recusado";
  }
  if (action === "cancel") {
    nextStatus = "Cancelado";
  }

  if (nextStatus === previousStatus) return;

  contract.debtOperationStatus = nextStatus;
  contract.debtOperationUpdatedAt = today();

  if (nextStatus === "Novo contrato gerado" && contract.status === "Reservado") {
    contract.status = "Averbado";
  }

  auditEvent(
    `${contract.contractType} ${contract.id}: status alterado de ${previousStatus} para ${nextStatus}.`,
    "Operacoes de divida"
  );
  saveState();
  render();
  openView("debtops");
}

function renderDebtOperations() {
  ensureDebtOperationView();

  const summary = document.getElementById("debtops-summary");
  const list = document.getElementById("debtops-list");
  const checklist = document.getElementById("debtops-checklist");
  const blockers = document.getElementById("debtops-blockers");
  if (!summary || !list || !checklist || !blockers) return;

  let rows = getDebtOperationRows();
  if (state.currentProfile === "lender") rows = rows.filter((row) => row.lenderId === "lender-1");

  const refin = rows.filter((row) => row.contractType === "Refinanciamento").length;
  const portability = rows.filter((row) => row.contractType === "Portabilidade").length;
  const purchase = rows.filter((row) => row.contractType === "Compra de divida").length;
  const waitingEvidence = rows.filter((row) => ["Aguardando saldo formal", "Aguardando comprovante"].includes(row.status)).length;

  summary.innerHTML = [
    ["Refin", refin],
    ["Portabilidade", portability],
    ["Compra divida", purchase],
    ["Aguardando evidencia", waitingEvidence],
  ]
    .map(
      ([label, value]) => `
        <article class="debtops-card">
          <span>${label}</span>
          <strong>${value}</strong>
        </article>
      `
    )
    .join("");

  list.innerHTML = rows
    .map((row) => {
      const statusClass = ["Aguardando saldo formal", "Aguardando comprovante"].includes(row.status) ? "warning" : "";
      const isTerminal = ["Novo contrato gerado", "Recusado", "Cancelado"].includes(row.status);
      return `
        <article class="debtops-row">
          <div>
            <strong>${row.contractType}</strong>
            <span>${row.employeeName} - contrato origem ${row.sourceContractId}</span>
          </div>
          <div><span>Saldo estimado</span><strong>${money.format(row.balance.estimatedBalance)}</strong></div>
          <div><span>Status</span><strong class="status ${statusClass}">${row.status}</strong></div>
          <p>${row.nextStep}</p>
          <div class="debtops-actions">
            <button class="secondary-button" type="button" data-debtops-action="advance" data-contract-id="${row.id}" ${isTerminal ? "disabled" : ""}>
              Avancar
            </button>
            <button class="secondary-button" type="button" data-debtops-action="reject" data-contract-id="${row.id}" ${isTerminal ? "disabled" : ""}>
              Recusar
            </button>
            <button class="ghost-button" type="button" data-debtops-action="cancel" data-contract-id="${row.id}" ${isTerminal ? "disabled" : ""}>
              Cancelar
            </button>
          </div>
        </article>
      `;
    })
    .join("");

  checklist.innerHTML = `
    <div class="debtops-note">
      <strong>Contrato origem</strong>
      <span>Identificar contrato, banco origem, matricula, produto e rubrica.</span>
    </div>
    <div class="debtops-note">
      <strong>Saldo formal</strong>
      <span>Guardar valor, fonte, protocolo, data de emissao e validade.</span>
    </div>
    <div class="debtops-note">
      <strong>Nova operacao</strong>
      <span>Comparar parcela antiga, nova parcela, prazo e valor liberado.</span>
    </div>
  `;

  blockers.innerHTML = `
    <div class="debtops-note">
      <strong>Sem evidencia</strong>
      <span>Nao liquidar origem nem liberar margem sem comprovante exigido.</span>
    </div>
    <div class="debtops-note">
      <strong>Instituicao nao credenciada</strong>
      <span>Bloquear operacao se produto/convenio nao estiver liberado.</span>
    </div>
    <div class="debtops-note">
      <strong>Competencia fechada</strong>
      <span>Ajuste apos fechamento deve virar ocorrencia auditada, nao sobrescrita.</span>
    </div>
  `;
}

const debtOpsStyle = document.createElement("style");
debtOpsStyle.textContent = `
  .debtops-summary {
    display: grid;
    grid-template-columns: repeat(4, minmax(150px, 1fr));
    gap: 14px;
    margin-bottom: 18px;
  }
  .debtops-card,
  .debtops-row,
  .debtops-note {
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface-2);
  }
  .debtops-card {
    padding: 16px;
    box-shadow: var(--shadow);
  }
  .debtops-card span,
  .debtops-row span,
  .debtops-row p,
  .debtops-note span {
    display: block;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.4;
  }
  .debtops-card strong {
    display: block;
    margin-top: 8px;
    font-size: 24px;
  }
  .debtops-list,
  .debtops-notes {
    display: grid;
    gap: 10px;
  }
  .debtops-row {
    display: grid;
    grid-template-columns: 1.5fr 0.9fr 0.9fr;
    gap: 12px;
    align-items: center;
    padding: 12px;
  }
  .debtops-row p {
    grid-column: 1 / -1;
    margin: 0;
  }
  .debtops-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    grid-column: 1 / -1;
  }
  .debtops-actions .secondary-button,
  .debtops-actions .ghost-button {
    min-height: 36px;
    padding: 8px 12px;
  }
  .debtops-actions .ghost-button {
    background: transparent;
    border: 1px solid var(--line);
    border-radius: 8px;
    color: var(--muted);
    font-weight: 700;
  }
  .debtops-actions button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
  .debtops-content {
    margin-top: 18px;
  }
  .debtops-note {
    padding: 12px;
  }
  .debtops-note span {
    margin-top: 4px;
  }
  @media (max-width: 1040px) {
    .debtops-summary,
    .debtops-row {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 640px) {
    .debtops-summary,
    .debtops-row {
      grid-template-columns: 1fr;
    }
  }
`;
document.head.appendChild(debtOpsStyle);

const renderBeforeDebtOpsAddon = render;
render = function renderWithDebtOpsAddon() {
  renderBeforeDebtOpsAddon();
  renderDebtOperations();
};

render();
