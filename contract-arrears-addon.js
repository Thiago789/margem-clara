const CONTRACT_ARREARS_MODE_KEY = "margem-clara-contract-mode";

function normalizeContractArrearsState() {
  state.arrearsPayments = Array.isArray(state.arrearsPayments) ? state.arrearsPayments : [];
  state.contracts.forEach((contract) => {
    contract.arrearsAmount = Number(contract.arrearsAmount || 0);
    contract.partialDiscounts = Array.isArray(contract.partialDiscounts) ? contract.partialDiscounts : [];
  });

  if (!state.arrearsDemoSeeded && !state.contracts.some((contract) => contract.arrearsAmount > 0)) {
    const sample = state.contracts.find((contract) => contract.status === "Descontando");
    if (sample) {
      const expected = Number(sample.installment || 0);
      const shortfall = Math.min(120, expected);
      sample.arrearsAmount = shortfall;
      sample.partialDiscounts.push({
        competency: state.conventionSettings?.payrollCompetency || today().slice(0, 7),
        installmentNumber: Math.max(Number(sample.currentInstallment || 1), 1),
        expectedAmount: expected,
        discountedAmount: Math.max(expected - shortfall, 0),
        shortfallAmount: shortfall,
        reason: "Margem disponivel inferior ao valor da parcela.",
        processedAt: today(),
      });
    }
    state.arrearsDemoSeeded = true;
    saveState();
  }
}

function currentContractMode() {
  return sessionStorage.getItem(CONTRACT_ARREARS_MODE_KEY) === "recovery" ? "recovery" : "portfolio";
}

function setContractMode(mode) {
  const nextMode = mode === "recovery" ? "recovery" : "portfolio";
  sessionStorage.setItem(CONTRACT_ARREARS_MODE_KEY, nextMode);
  document.querySelectorAll("[data-contract-mode]").forEach((button) => {
    const active = button.dataset.contractMode === nextMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  document.getElementById("contracts-portfolio-panel")?.toggleAttribute("hidden", nextMode !== "portfolio");
  document.getElementById("contract-arrears-panel")?.toggleAttribute("hidden", nextMode !== "recovery");
  if (nextMode === "recovery") renderContractArrears();
}

function ensureContractArrearsPanel() {
  const view = document.getElementById("contracts-view");
  const tablePanel = view?.querySelector(".table-panel");
  if (!view || !tablePanel || document.getElementById("contract-arrears-panel")) return;

  tablePanel.id = "contracts-portfolio-panel";
  const heading = view.querySelector(".section-heading");
  const reserveButton = document.getElementById("new-contract-open");
  const actions = document.createElement("div");
  actions.className = "contract-heading-actions";
  actions.innerHTML = `
    <div class="segmented-control" role="tablist" aria-label="Modo de contratos">
      <button type="button" role="tab" data-contract-mode="portfolio">Carteira</button>
      <button type="button" role="tab" data-contract-mode="recovery">Recuperacao</button>
    </div>
  `;
  if (reserveButton) actions.appendChild(reserveButton);
  heading?.appendChild(actions);

  tablePanel.insertAdjacentHTML(
    "afterend",
    `
      <section id="contract-arrears-panel" hidden>
        <div class="arrears-toolbar" aria-label="Filtros de recuperacao">
          <label>
            <span>Contrato</span>
            <input class="search-input" id="arrears-contract-filter" type="search" placeholder="Numero exato ou parte" />
          </label>
          <label>
            <span>Situacao</span>
            <select class="select-input" id="arrears-status-filter">
              <option value="">Todas</option>
              <option value="ACTIVE">Folha ativa</option>
              <option value="PAYROLL_COMPLETED_WITH_ARREARS">Folha concluida</option>
            </select>
          </label>
          <label>
            <span>Saldo minimo</span>
            <input class="search-input" id="arrears-min-filter" type="number" min="0" step="0.01" value="0" />
          </label>
          <label id="arrears-lender-filter-wrap">
            <span>Consignataria</span>
            <select class="select-input" id="arrears-lender-filter"></select>
          </label>
        </div>
        <div class="arrears-summary" id="arrears-summary"></div>
        <div class="arrears-list" id="arrears-list"></div>
      </section>
    `
  );

  document.querySelectorAll("[data-contract-mode]").forEach((button) => {
    button.addEventListener("click", () => setContractMode(button.dataset.contractMode));
  });
  ["arrears-contract-filter", "arrears-status-filter", "arrears-min-filter", "arrears-lender-filter"]
    .forEach((id) => document.getElementById(id)?.addEventListener("input", renderContractArrears));

  document.body.insertAdjacentHTML(
    "beforeend",
    `
      <dialog class="modal" id="arrears-payment-modal">
        <form method="dialog" class="modal-content" id="arrears-payment-form">
          <div class="modal-heading">
            <div>
              <p class="eyebrow">Recuperacao externa</p>
              <h2>Registrar baixa</h2>
            </div>
            <button class="icon-button" value="cancel" type="button" data-close-arrears-modal title="Fechar">x</button>
          </div>
          <div class="arrears-payment-context" id="arrears-payment-context"></div>
          <input id="arrears-payment-contract" type="hidden" />
          <label>Valor recebido
            <input class="search-input" id="arrears-payment-amount" type="number" min="0.01" step="0.01" required />
          </label>
          <label>Meio de pagamento
            <select class="select-input" id="arrears-payment-method" required>
              <option value="PIX">Pix</option>
              <option value="BOLETO">Boleto</option>
              <option value="BANK_TRANSFER">Transferencia bancaria</option>
              <option value="CASH">Dinheiro</option>
              <option value="OTHER">Outro</option>
            </select>
          </label>
          <label>Data do pagamento
            <input class="search-input" id="arrears-payment-date" type="date" required />
          </label>
          <label>Referencia externa
            <input class="search-input" id="arrears-payment-reference" maxlength="120" placeholder="Comprovante ou protocolo" />
          </label>
          <button class="primary-button wide" value="default" type="submit">Confirmar baixa</button>
        </form>
      </dialog>
    `
  );

  document.querySelector("[data-close-arrears-modal]")?.addEventListener("click", () => {
    document.getElementById("arrears-payment-modal")?.close();
  });
  document.getElementById("arrears-payment-form")?.addEventListener("submit", recordArrearsPayment);
}

function contractArrearsPhase(contract) {
  return contract.status === "Folha concluida com atraso"
    ? "PAYROLL_COMPLETED_WITH_ARREARS"
    : "ACTIVE";
}

function visibleArrearsContracts() {
  const contractFilter = document.getElementById("arrears-contract-filter")?.value.trim().toLowerCase() || "";
  const statusFilter = document.getElementById("arrears-status-filter")?.value || "";
  const minAmount = Number(document.getElementById("arrears-min-filter")?.value || 0);
  const lenderFilter = document.getElementById("arrears-lender-filter")?.value || "";

  return state.contracts
    .filter((contract) => Number(contract.arrearsAmount || 0) > 0)
    .filter((contract) => state.currentProfile !== "lender" || contract.lenderId === "lender-1")
    .filter((contract) => !lenderFilter || contract.lenderId === lenderFilter)
    .filter((contract) => !statusFilter || contractArrearsPhase(contract) === statusFilter)
    .filter((contract) => Number(contract.arrearsAmount || 0) >= minAmount)
    .filter((contract) => !contractFilter || contract.id.toLowerCase().includes(contractFilter))
    .sort((left, right) => Number(right.arrearsAmount || 0) - Number(left.arrearsAmount || 0));
}

function renderArrearsLenderFilter() {
  const wrap = document.getElementById("arrears-lender-filter-wrap");
  const select = document.getElementById("arrears-lender-filter");
  if (!wrap || !select) return;
  wrap.hidden = state.currentProfile !== "manager";
  const selected = select.value;
  select.innerHTML = [
    `<option value="">Todas</option>`,
    ...lenders.map((lender) => `<option value="${lender.id}">${lender.name}</option>`),
  ].join("");
  select.value = selected;
}

function renderContractArrears() {
  ensureContractArrearsPanel();
  normalizeContractArrearsState();
  renderArrearsLenderFilter();
  const summary = document.getElementById("arrears-summary");
  const list = document.getElementById("arrears-list");
  if (!summary || !list) return;

  const contracts = visibleArrearsContracts();
  const total = contracts.reduce((sum, contract) => sum + Number(contract.arrearsAmount || 0), 0);
  const completed = contracts.filter((contract) => contractArrearsPhase(contract) === "PAYROLL_COMPLETED_WITH_ARREARS");
  const recovered = state.arrearsPayments
    .filter((payment) => contracts.some((contract) => contract.id === payment.contractId))
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

  summary.innerHTML = [
    ["Contratos com saldo", contracts.length],
    ["Saldo em atraso", money.format(total)],
    ["Folha concluida", completed.length],
    ["Recuperado", money.format(recovered)],
  ].map(([label, value]) => `
    <article>
      <span>${label}</span>
      <strong>${value}</strong>
    </article>
  `).join("");

  list.innerHTML = contracts.length
    ? contracts.map((contract) => {
      const latest = contract.partialDiscounts.at(-1);
      const canRecover = state.currentProfile === "lender";
      return `
        <article class="arrears-row">
          <div class="arrears-row-main">
            <div>
              <span class="arrears-contract-label">Contrato</span>
              <strong>${contract.id}</strong>
              <small>${lenderName(contract.lenderId)}</small>
            </div>
            <div>
              <span>Saldo em atraso</span>
              <strong class="arrears-amount">${money.format(Number(contract.arrearsAmount || 0))}</strong>
              <small>Parcela atual ${Number(contract.currentInstallment || 0)} de ${Number(contract.installments || 0)}</small>
            </div>
            <div>
              <span>Situacao</span>
              <strong>${contractArrearsPhase(contract) === "ACTIVE" ? "Folha ativa" : "Folha concluida"}</strong>
              <small>${latest ? `Ultimo parcial em ${latest.competency}` : "Historico importado"}</small>
            </div>
          </div>
          ${latest ? `
            <div class="arrears-partial-detail">
              Esperado ${money.format(Number(latest.expectedAmount || 0))};
              descontado ${money.format(Number(latest.discountedAmount || 0))};
              diferenca ${money.format(Number(latest.shortfallAmount || 0))}.
            </div>
          ` : ""}
          <div class="arrears-row-actions">
            <span>${latest?.reason || "Saldo disponivel para cobranca externa."}</span>
            ${canRecover
              ? `<button class="primary-button" type="button" data-record-arrears="${contract.id}">Registrar baixa</button>`
              : `<small>Baixa restrita a consignataria credenciada.</small>`}
          </div>
        </article>
      `;
    }).join("")
    : `<div class="empty-state">Nenhum contrato corresponde aos filtros de recuperacao.</div>`;

  list.querySelectorAll("[data-record-arrears]").forEach((button) => {
    button.addEventListener("click", () => openArrearsPaymentModal(button.dataset.recordArrears));
  });
}

function openArrearsPaymentModal(contractId) {
  const contract = state.contracts.find((item) => item.id === contractId);
  const modal = document.getElementById("arrears-payment-modal");
  if (!contract || !modal) return;
  document.getElementById("arrears-payment-contract").value = contract.id;
  document.getElementById("arrears-payment-amount").value = Number(contract.arrearsAmount || 0).toFixed(2);
  document.getElementById("arrears-payment-amount").max = Number(contract.arrearsAmount || 0).toFixed(2);
  document.getElementById("arrears-payment-date").value = today();
  document.getElementById("arrears-payment-date").max = today();
  document.getElementById("arrears-payment-reference").value = "";
  document.getElementById("arrears-payment-context").innerHTML = `
    <strong>${contract.id}</strong>
    <span>Saldo disponivel para baixa: ${money.format(Number(contract.arrearsAmount || 0))}</span>
  `;
  modal.showModal();
}

function recordArrearsPayment(event) {
  event.preventDefault();
  const contractId = document.getElementById("arrears-payment-contract").value;
  const contract = state.contracts.find((item) => item.id === contractId);
  const amount = Number(document.getElementById("arrears-payment-amount").value || 0);
  const paidAt = document.getElementById("arrears-payment-date").value;
  if (!contract || amount <= 0 || amount > Number(contract.arrearsAmount || 0) || paidAt > today()) return;

  const before = Number(contract.arrearsAmount || 0);
  contract.arrearsAmount = Number((before - amount).toFixed(2));
  if (contract.arrearsAmount === 0 && contract.status === "Folha concluida com atraso") {
    contract.status = "Liquidado";
    contract.liquidatedAt = paidAt;
  }
  state.arrearsPayments.unshift({
    id: `BAIXA-${Date.now()}`,
    contractId,
    amount,
    before,
    after: contract.arrearsAmount,
    method: document.getElementById("arrears-payment-method").value,
    paidAt,
    externalReference: document.getElementById("arrears-payment-reference").value.trim(),
    createdAt: new Date().toISOString(),
  });
  auditEvent(
    `Baixa externa de ${money.format(amount)} registrada no contrato ${contract.id}; saldo restante ${money.format(contract.arrearsAmount)}.`,
    "Recuperacao"
  );
  saveState();
  document.getElementById("arrears-payment-modal").close();
  render();
  setContractMode("recovery");
}

const resolveReturnProcessingStatusBeforeArrears = resolveReturnProcessingStatus;
resolveReturnProcessingStatus = function resolveReturnProcessingStatusWithArrears(contract, row, normalizedStatus, amount) {
  const expected = expectedReturnAmount(contract);
  if (normalizedStatus === "Descontando" && amount > 0 && amount < expected - returnAmountTolerance()) {
    return {
      status: "Descontando",
      reason: row.motivo || "Desconto parcial; diferenca encaminhada para recuperacao externa.",
      divergent: false,
      partial: true,
      expected,
      difference: Number((amount - expected).toFixed(2)),
    };
  }
  return resolveReturnProcessingStatusBeforeArrears(contract, row, normalizedStatus, amount);
};

const classifyReturnReconciliationRowBeforeArrears = classifyReturnReconciliationRow;
classifyReturnReconciliationRow = function classifyReturnReconciliationRowWithArrears(row) {
  const contract = state.contracts.find((item) => item.id === row.contrato);
  const amount = Number(row.valor_descontado || 0);
  const expected = Number(contract?.installment || 0);
  const status = normalizeReturnStatus(row.status);
  if (contract && status === "Descontando" && amount > 0 && amount < expected - returnAmountTolerance()) {
    return {
      contractId: contract.id,
      competency: row.competencia || currentCompetency(),
      status: "Parcial",
      amount,
      expected,
      difference: Number((amount - expected).toFixed(2)),
      reason: row.motivo || "Diferenca acumulada como saldo em atraso.",
      category: "partial",
    };
  }
  return classifyReturnReconciliationRowBeforeArrears(row);
};

const processReturnCsvBeforeArrears = processReturnCsv;
processReturnCsv = function processReturnCsvWithArrears(text) {
  normalizeContractArrearsState();
  const rows = parseCsv(text);
  const partials = rows.map((row) => {
    const contract = state.contracts.find((item) => item.id === row.contrato);
    if (!contract) return null;
    const competency = row.competencia || currentCompetency();
    const amount = Number(row.valor_descontado || 0);
    const expected = expectedReturnAmount(contract);
    const isPartial = normalizeReturnStatus(row.status) === "Descontando"
      && amount > 0
      && amount < expected - returnAmountTolerance()
      && !findProcessedCompetency(contract, competency);
    return isPartial ? { contract, row, competency, amount, expected } : null;
  }).filter(Boolean);

  processReturnCsvBeforeArrears(text);

  partials.forEach(({ contract, row, competency, amount, expected }) => {
    const shortfall = Number((expected - amount).toFixed(2));
    contract.arrearsAmount = Number((Number(contract.arrearsAmount || 0) + shortfall).toFixed(2));
    contract.partialDiscounts.push({
      competency,
      installmentNumber: Number(contract.currentInstallment || 0),
      expectedAmount: expected,
      discountedAmount: amount,
      shortfallAmount: shortfall,
      reason: row.motivo || "Desconto parcial; saldo encaminhado para recuperacao externa.",
      processedAt: today(),
    });
    if (Number(contract.currentInstallment || 0) >= Number(contract.installments || 0)) {
      contract.status = "Folha concluida com atraso";
    }
  });

  if (state.lastReturnReconciliation) {
    state.lastReturnReconciliation.partial = partials.length;
  }
  if (partials.length) {
    auditEvent(
      `${partials.length} desconto(s) parcial(is) avancaram a parcela e geraram saldo em atraso para recuperacao.`,
      "Recuperacao"
    );
  }
  saveState();
  render();
};

const renderBeforeContractArrears = render;
render = function renderWithContractArrears() {
  renderBeforeContractArrears();
  ensureContractArrearsPanel();
  normalizeContractArrearsState();
  setContractMode(currentContractMode());
};

const contractArrearsStyle = document.createElement("style");
contractArrearsStyle.textContent = `
  .contract-heading-actions,
  .segmented-control,
  .arrears-row-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .segmented-control {
    gap: 2px;
    padding: 3px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface-2);
  }
  .segmented-control button {
    min-height: 34px;
    border: 0;
    border-radius: 6px;
    padding: 6px 12px;
    background: transparent;
    color: var(--muted);
    font-weight: 700;
  }
  .segmented-control button.active {
    background: var(--surface);
    color: var(--text);
    box-shadow: 0 1px 4px rgba(29, 47, 39, 0.12);
  }
  .arrears-toolbar {
    display: grid;
    grid-template-columns: minmax(180px, 1.4fr) repeat(3, minmax(150px, 1fr));
    gap: 12px;
    margin-bottom: 16px;
  }
  .arrears-toolbar label,
  #arrears-payment-form label {
    display: grid;
    gap: 6px;
    color: var(--muted);
    font-size: 13px;
    font-weight: 700;
  }
  .arrears-toolbar label[hidden] {
    display: none;
  }
  .arrears-summary {
    display: grid;
    grid-template-columns: repeat(4, minmax(150px, 1fr));
    gap: 12px;
    margin-bottom: 16px;
  }
  .arrears-summary article,
  .arrears-row {
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
  }
  .arrears-summary article {
    padding: 14px;
  }
  .arrears-summary span,
  .arrears-summary strong,
  .arrears-row span,
  .arrears-row small {
    display: block;
  }
  .arrears-summary span,
  .arrears-row span,
  .arrears-row small {
    color: var(--muted);
    font-size: 12px;
  }
  .arrears-summary strong {
    margin-top: 6px;
    font-size: 21px;
  }
  .arrears-list {
    display: grid;
    gap: 10px;
  }
  .arrears-row {
    padding: 16px;
  }
  .arrears-row-main {
    display: grid;
    grid-template-columns: 1.3fr 1fr 1fr;
    gap: 16px;
  }
  .arrears-row-main strong {
    display: block;
    margin: 4px 0;
  }
  .arrears-amount {
    color: var(--danger);
  }
  .arrears-partial-detail {
    margin-top: 12px;
    padding: 10px 12px;
    border-left: 3px solid var(--accent);
    background: #fff8e6;
    color: #5f4708;
    font-size: 13px;
  }
  .arrears-row-actions {
    justify-content: space-between;
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--line);
  }
  .arrears-row-actions > span {
    max-width: 68ch;
  }
  .arrears-payment-context {
    display: grid;
    gap: 4px;
    padding: 12px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface-2);
  }
  @media (max-width: 900px) {
    .arrears-toolbar,
    .arrears-summary {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .arrears-row-main {
      grid-template-columns: 1fr 1fr;
    }
  }
  @media (max-width: 640px) {
    .contract-heading-actions,
    .arrears-toolbar,
    .arrears-summary,
    .arrears-row-main {
      display: grid;
      grid-template-columns: 1fr;
      width: 100%;
    }
    .segmented-control {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }
    .contract-heading-actions .primary-button,
    .arrears-row-actions .primary-button {
      width: 100%;
    }
  }
`;
document.head.appendChild(contractArrearsStyle);

render();
