function getDebtOperationFormalBlockers(contract, nextStatus) {
  const formal = contract.debtOperationFormalData || {};
  const blockers = [];

  if (nextStatus === "Saldo recebido" && !formal.balanceProtocol) {
    blockers.push("Informe o protocolo do saldo formal.");
  }
  if (nextStatus === "Saldo recebido" && !formal.balanceValidUntil) {
    blockers.push("Informe a validade do saldo formal.");
  }
  if (nextStatus === "Aguardando aceite" && Number(formal.releasedAmount || 0) <= 0) {
    blockers.push("Informe o valor liberado ou valor de compra.");
  }
  if (nextStatus === "Aguardando comprovante" && !formal.originLender) {
    blockers.push("Informe o banco ou credor origem.");
  }
  if (nextStatus === "Quitado na origem" && !formal.evidenceNote) {
    blockers.push("Registre a evidencia, comprovante ou observacao operacional.");
  }

  return blockers;
}

function nextDebtOperationStatus(status) {
  const next = {
    "Aguardando saldo formal": "Saldo solicitado",
    "Saldo solicitado": "Saldo recebido",
    "Saldo recebido": "Aguardando aceite",
    "Aguardando aceite": "Aguardando comprovante",
    "Aguardando comprovante": "Quitado na origem",
    "Quitado na origem": "Novo contrato gerado",
  };
  return next[status] || status;
}

function currentDebtOperationStatus(contract) {
  return contract.debtOperationStatus || (contract.contractType === "Refinanciamento" ? "Aguardando saldo formal" : "Em analise");
}

function renderDebtOperationGuardMessages() {
  document.querySelectorAll("[data-debtops-row]").forEach((row) => {
    const contract = state.contracts.find((item) => item.id === row.dataset.debtopsRow);
    if (!contract) return;

    row.querySelector(".debtops-blocker-list")?.remove();

    const status = currentDebtOperationStatus(contract);
    const isTerminal = ["Novo contrato gerado", "Recusado", "Cancelado"].includes(status);
    const blockers = getDebtOperationFormalBlockers(contract, nextDebtOperationStatus(status));
    if (!blockers.length || isTerminal) return;

    row.insertAdjacentHTML(
      "beforeend",
      `
        <div class="debtops-blocker-list">
          <strong>Antes do proximo avanco</strong>
          ${blockers.map((blocker) => `<span>${blocker}</span>`).join("")}
        </div>
      `
    );
  });
}

document.addEventListener(
  "click",
  (event) => {
    const action = event.target.closest("[data-debtops-action='advance']");
    if (!action) return;

    const contract = state.contracts.find((item) => item.id === action.dataset.contractId);
    if (!contract) return;

    const nextStatus = nextDebtOperationStatus(currentDebtOperationStatus(contract));
    const blockers = getDebtOperationFormalBlockers(contract, nextStatus);
    if (!blockers.length) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    alert(`Antes de avancar:\n- ${blockers.join("\n- ")}`);
  },
  true
);

const debtOperationGuardsStyle = document.createElement("style");
debtOperationGuardsStyle.textContent = `
  .debtops-blocker-list {
    background: #fff7ed;
    border: 1px solid #fed7aa;
    border-radius: 8px;
    color: #9a3412;
    display: grid;
    gap: 4px;
    grid-column: 1 / -1;
    padding: 10px 12px;
  }
  .debtops-blocker-list strong,
  .debtops-blocker-list span {
    font-size: 13px;
  }
  .debtops-blocker-list span {
    display: block;
  }
`;
document.head.appendChild(debtOperationGuardsStyle);

const renderBeforeDebtOperationGuardsAddon = render;
render = function renderWithDebtOperationGuardsAddon() {
  renderBeforeDebtOperationGuardsAddon();
  renderDebtOperationGuardMessages();
};

render();
