if (!pageTitles.adjustments) {
  pageTitles.adjustments = "Ajustes";
}

if (!profileConfig.manager.views.includes("adjustments")) {
  const closingIndex = profileConfig.manager.views.indexOf("closing");
  profileConfig.manager.views.splice(closingIndex >= 0 ? closingIndex + 1 : profileConfig.manager.views.length, 0, "adjustments");
}

const payrollAdjustmentDecisionLabels = {
  accept_difference: "Aceitar diferenca",
  reprocess_next: "Reenviar",
  cancel_release: "Cancelar/liberar",
  keep_pending: "Manter pendente",
};

function normalizePayrollAdjustmentRecords() {
  state.payrollAdjustments = Array.isArray(state.payrollAdjustments) ? state.payrollAdjustments : [];
  state.contracts.forEach((contract) => {
    contract.adjustmentHistory = Array.isArray(contract.adjustmentHistory) ? contract.adjustmentHistory : [];
  });
}

function adjustmentTypeForContract(contract) {
  if (contract.returnDivergent) return "amount_difference";
  if (contract.status === "Rejeitado") return "return_rejected";
  return "not_discounted";
}

function pendingStatusForAdjustment(contract) {
  return contract.status === "Rejeitado" ? "Rejeitado" : "Nao descontado";
}

function adjustmentMarginEffectText(contract) {
  const effect = typeof contractMarginEffect === "function" ? contractMarginEffect(contract) : null;
  if (!effect) return "Efeito de margem nao mapeado.";
  return `${effect.label}: ${effect.detail}`;
}

function getPayrollAdjustmentItems() {
  normalizePayrollAdjustmentRecords();
  const rejected = state.contracts.filter(contractHasReturnIssue);
  const sent = state.contracts.filter((contract) => contract.status === "Enviado para folha");
  const reserved = state.contracts.filter((contract) => marginReservationStatuses.includes(contract.status));
  const reviewEmployees = state.employees.filter((employee) => employee.status === "Em revisao");

  return [
    ...rejected.map((contract) => {
      const employee = employeeById(contract.employeeId);
      return {
        id: `AJ-${contract.id}`,
        contractId: contract.id,
        adjustmentType: adjustmentTypeForContract(contract),
        origin: "Retorno da folha",
        title: contract.id,
        subject: employee?.name || "Servidor nao localizado",
        status: "Exige decisao",
        className: "danger",
        value: Number(contract.discountedValue || contract.installment || 0),
        reason: contract.returnReason || "Retorno sem motivo informado.",
        action: contract.returnDivergent
          ? "Conferir divergencia de valor antes de baixar parcela; decidir ajuste, reenvio ou aceite formal."
          : contract.status === "Nao descontado"
            ? "Nao descontado segura margem: decidir entre reenvio, cancelamento/liberacao ou manter acompanhamento formal."
            : "Rejeicao libera margem: corrigir cadastro/layout, reenviar somente com nova decisao ou manter rejeicao auditada.",
        marginEffect: adjustmentMarginEffectText(contract),
        expectedValue: Number(contract.expectedDiscountValue || contract.installment || 0),
        discountedValue: Number(contract.discountedValue || 0),
        differenceValue: Number(contract.discountDifference || 0),
        divergent: Boolean(contract.returnDivergent),
        decisions: contract.returnDivergent
          ? ["accept_difference", "reprocess_next", "cancel_release", "keep_pending"]
          : ["reprocess_next", "cancel_release", "keep_pending"],
        lastDecision: contract.adjustmentHistory?.[0]?.decision || "",
      };
    }),
    ...sent.map((contract) => {
      const employee = employeeById(contract.employeeId);
      return {
        id: `AJ-${contract.id}`,
        origin: "Retorno pendente",
        title: contract.id,
        subject: employee?.name || "Servidor nao localizado",
        status: "Aguardando",
        className: "warning",
        value: Number(contract.installment || 0),
        reason: "Contrato enviado para folha sem retorno processado.",
        action: "Cobrar retorno, registrar excecao ou impedir fechamento definitivo.",
        marginEffect: adjustmentMarginEffectText(contract),
      };
    }),
    ...reserved.map((contract) => {
      const employee = employeeById(contract.employeeId);
      return {
        id: `AJ-${contract.id}`,
        origin: "Reserva",
        title: contract.id,
        subject: employee?.name || "Servidor nao localizado",
        status: "Analisar",
        className: "warning",
        value: Number(contract.installment || 0),
        reason: "Reserva ainda nao enviada para insercao na folha.",
        action: "Gerar insercao, cancelar reserva expirada ou carregar para a proxima competencia.",
        marginEffect: adjustmentMarginEffectText(contract),
      };
    }),
    ...reviewEmployees.map((employee) => ({
      id: `AJ-${employee.enrollment}`,
      origin: "Cadastro",
      title: employee.enrollment,
      subject: employee.name,
      status: "Revisar",
      className: "warning",
      value: Number(employee.income || 0),
      reason: "Servidor com situacao em revisao na base atual.",
      action: "Conferir vinculo, status funcional e base de calculo antes de liberar margem.",
    })),
  ];
}

function payrollAdjustmentDecisionText(decision) {
  return payrollAdjustmentDecisionLabels[decision] || decision;
}

function clearReturnPendencies(contract) {
  contract.returnDivergent = false;
  contract.returnReason = "";
  contract.discountDifference = 0;
}

function getPayrollAdjustmentSnapshot(contract) {
  return {
    amount: Number(contract.discountedValue || contract.installment || 0),
    expectedAmount: Number(contract.expectedDiscountValue || contract.installment || 0),
    differenceAmount: Number(contract.discountDifference || 0),
    reason: contract.returnReason || "Decisao operacional registrada.",
  };
}

function appendPayrollAdjustmentRecord(contract, decision, previousStatus, nextStatus, adjustmentType, snapshot = getPayrollAdjustmentSnapshot(contract)) {
  const record = {
    id: `PADJ-${today().replaceAll("-", "")}-${state.payrollAdjustments.length + 1}`,
    contractId: contract.id,
    adjustmentType,
    decision,
    decisionLabel: payrollAdjustmentDecisionText(decision),
    previousStatus,
    nextStatus,
    amount: snapshot.amount,
    expectedAmount: snapshot.expectedAmount,
    differenceAmount: snapshot.differenceAmount,
    reason: snapshot.reason,
    decidedAt: today(),
    decidedBy: profileConfig[state.currentProfile]?.label || "Sistema",
  };

  state.payrollAdjustments.unshift(record);
  contract.adjustmentHistory.unshift(record);
  return record;
}

function applyPayrollAdjustmentDecision(contractId, decision) {
  normalizePayrollAdjustmentRecords();
  const contract = state.contracts.find((item) => item.id === contractId);
  if (!contract) return;

  const previousStatus = contract.status;
  const adjustmentType = adjustmentTypeForContract(contract);
  const wasDivergent = Boolean(contract.returnDivergent);
  const decisionSnapshot = getPayrollAdjustmentSnapshot(contract);
  let nextStatus = previousStatus;
  let auditText = "";

  if (decision === "accept_difference" && wasDivergent) {
    contract.currentInstallment = Number(contract.currentInstallment || 0) + 1;
    nextStatus = "Descontando";
    contract.status = nextStatus;
    contract.adjustedAt = today();
    contract.adjustmentResolution = "Diferenca aceita formalmente";
    clearReturnPendencies(contract);

    if (contract.currentInstallment >= Number(contract.installments || 0)) {
      contract.status = "Liquidado";
      contract.liquidatedAt = today();
      nextStatus = "Liquidado";
    }

    auditText = `Diferenca de retorno aceita formalmente no contrato ${contract.id}. Parcela avancada por ajuste auditado.`;
  } else if (decision === "reprocess_next") {
    nextStatus = "Reservado";
    contract.status = nextStatus;
    contract.reprocessRequestedAt = today();
    contract.adjustmentResolution = "Reenvio para proxima insercao";
    clearReturnPendencies(contract);
    auditText = `Contrato ${contract.id} marcado para reenvio na proxima insercao da folha.`;
  } else if (decision === "cancel_release") {
    nextStatus = "Cancelado";
    contract.status = nextStatus;
    contract.canceledAt = today();
    contract.adjustmentResolution = "Cancelado com liberacao operacional da margem";
    clearReturnPendencies(contract);
    auditText = `Contrato ${contract.id} cancelado em ajuste formal para liberacao operacional da margem.`;
  } else {
    nextStatus = pendingStatusForAdjustment(contract);
    contract.status = nextStatus;
    contract.adjustmentResolution = nextStatus === "Nao descontado"
      ? "Nao desconto mantido pendente segurando margem"
      : "Rejeicao mantida pendente com margem liberada";
    auditText = `Contrato ${contract.id} mantido como ${nextStatus} para analise operacional.`;
  }

  appendPayrollAdjustmentRecord(contract, decision, previousStatus, nextStatus, adjustmentType, decisionSnapshot);
  auditEvent(auditText, "Ajustes da competencia");
  saveState();
  render();
  openView("adjustments");
}

function ensurePayrollAdjustmentsView() {
  if (document.getElementById("adjustments-view")) return;

  const nav = document.querySelector(".nav-list");
  const closingButton = document.querySelector('[data-view="closing"]');
  const protocolsButton = document.querySelector('[data-view="protocols"]');
  const button = document.createElement("button");
  button.className = "nav-item";
  button.dataset.view = "adjustments";
  button.type = "button";
  button.textContent = "Ajustes";
  button.addEventListener("click", () => openView("adjustments"));
  nav?.insertBefore(button, closingButton?.nextSibling || protocolsButton || null);

  document.querySelector(".main-panel")?.insertAdjacentHTML(
    "beforeend",
    `
      <section class="view" id="adjustments-view" aria-labelledby="adjustments-title">
        <div class="section-heading row-heading">
          <div>
            <h2 id="adjustments-title">Ajustes da competencia</h2>
            <p>Controle excecoes que nao podem ser reprocessadas sem decisao e auditoria.</p>
          </div>
          <button class="primary-button" id="adjustments-audit-button" type="button">Registrar analise</button>
        </div>

        <div class="adjustments-summary-grid" id="adjustments-summary-grid"></div>

        <section class="panel adjustments-panel">
          <div class="panel-heading">
            <h3>Fila de ajustes</h3>
          </div>
          <div class="adjustments-list" id="adjustments-list"></div>
        </section>

        <div class="content-grid adjustments-content">
          <section class="panel">
            <div class="panel-heading">
              <h3>Regras de tratamento</h3>
            </div>
            <div class="adjustments-note-list" id="adjustments-rules"></div>
          </section>

          <section class="panel">
            <div class="panel-heading">
              <h3>Efeito na margem</h3>
            </div>
            <div class="adjustments-note-list" id="adjustments-effects"></div>
          </section>
        </div>
      </section>
    `
  );

  document.getElementById("adjustments-audit-button")?.addEventListener("click", () => {
    const total = getPayrollAdjustmentItems().length;
    auditEvent(`Analise de ajustes registrada com ${total} item(ns).`, "Ajustes da competencia");
    saveState();
    render();
    openView("adjustments");
  });
}

function renderPayrollAdjustments() {
  ensurePayrollAdjustmentsView();

  const summary = document.getElementById("adjustments-summary-grid");
  const list = document.getElementById("adjustments-list");
  const rules = document.getElementById("adjustments-rules");
  const effects = document.getElementById("adjustments-effects");
  if (!summary || !list || !rules || !effects) return;

  const items = getPayrollAdjustmentItems();
  const decisionItems = items.filter((item) => item.className === "danger").length;
  const warningItems = items.filter((item) => item.className === "warning").length;
  const totalValue = items.reduce((total, item) => total + item.value, 0);

  summary.innerHTML = [
    ["Ajustes abertos", items.length],
    ["Exigem decisao", decisionItems],
    ["Em analise", warningItems],
    ["Valor envolvido", formatAdjustmentMoney(totalValue)],
  ]
    .map(
      ([label, value]) => `
        <article class="adjustments-summary-card">
          <span>${label}</span>
          <strong>${value}</strong>
        </article>
      `
    )
    .join("");

  list.innerHTML = items.length
    ? items
        .map(
          (item) => `
            <article class="adjustment-row">
              <div>
                <strong>${item.id}</strong>
                <span>${item.origin} - ${item.subject}</span>
              </div>
              <div>
                <span>Referencia</span>
                <strong>${item.title}</strong>
              </div>
              <div>
                <span>Valor</span>
                <strong>${formatAdjustmentMoney(item.value)}</strong>
              </div>
              <span class="status ${item.className}">${item.status}</span>
              <p><strong>Motivo:</strong> ${item.reason}</p>
              ${
                item.divergent
                  ? `<p><strong>Divergencia:</strong> esperado ${formatAdjustmentMoney(item.expectedValue)}, retornado ${formatAdjustmentMoney(item.discountedValue)}, diferenca ${formatAdjustmentMoney(item.differenceValue)}.</p>`
                  : ""
              }
              <p><strong>Tratamento:</strong> ${item.action}</p>
              <p><strong>Efeito na margem:</strong> ${item.marginEffect || "Nao aplicavel."}</p>
              ${
                item.lastDecision
                  ? `<p><strong>Ultima decisao:</strong> ${payrollAdjustmentDecisionText(item.lastDecision)}</p>`
                  : ""
              }
              ${
                item.decisions?.length
                  ? `<div class="adjustment-actions">${item.decisions
                      .map(
                        (decision) => `
                          <button class="secondary-button adjustment-action-button" type="button" data-adjustment-contract="${item.contractId}" data-adjustment-decision="${decision}">
                            ${payrollAdjustmentDecisionText(decision)}
                          </button>
                        `
                      )
                      .join("")}</div>`
                  : ""
              }
            </article>
          `
        )
        .join("")
    : `<div class="empty-state">Nenhum ajuste pendente para a competencia atual.</div>`;

  rules.innerHTML = `
    <div class="adjustment-note">
      <strong>Nao alterar historico fechado</strong>
      <span>Apos fechamento, qualquer correcao deve virar ajuste identificado e auditado.</span>
    </div>
    <div class="adjustment-note">
      <strong>Motivo obrigatorio</strong>
      <span>Cancelamento, reenvio, liberacao de margem ou carregamento para proxima competencia exigem justificativa.</span>
    </div>
    <div class="adjustment-note">
      <strong>Responsavel definido</strong>
      <span>Cada ajuste precisa indicar se a acao e do RH, consignataria, sistema de folha ou administrador.</span>
    </div>
  `;

  effects.innerHTML = `
    <div class="adjustment-note">
      <strong>Liberar margem</strong>
      <span>Rejeitado, cancelado e liquidado liberam margem; manter rejeicao pendente nao deve transformar em nao desconto.</span>
    </div>
    <div class="adjustment-note">
      <strong>Manter margem presa</strong>
      <span>Nao descontado permanece consumindo margem ate reenvio, cancelamento/liberacao ou baixa formal.</span>
    </div>
    <div class="adjustment-note">
      <strong>Gerar movimento</strong>
      <span>Todo impacto em margem precisa gerar movimento historico separado do processamento original.</span>
    </div>
    <div class="adjustment-note">
      <strong>Decisao formal</strong>
      <span>Aceitar diferenca, reenviar ou cancelar deve registrar responsavel, data e efeito operacional.</span>
    </div>
  `;
}

function formatAdjustmentMoney(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const payrollAdjustmentsStyle = document.createElement("style");
payrollAdjustmentsStyle.textContent = `
  .adjustments-summary-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(150px, 1fr));
    gap: 14px;
    margin-bottom: 18px;
  }
  .adjustments-summary-card,
  .adjustment-row,
  .adjustment-note {
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface-2);
  }
  .adjustments-summary-card {
    padding: 16px;
    box-shadow: var(--shadow);
  }
  .adjustments-summary-card span,
  .adjustment-row span,
  .adjustment-row p,
  .adjustment-note span {
    display: block;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.4;
  }
  .adjustments-summary-card strong {
    display: block;
    margin-top: 8px;
    font-size: 24px;
  }
  .adjustments-panel,
  .adjustments-content {
    margin-top: 18px;
  }
  .adjustments-list,
  .adjustments-note-list {
    display: grid;
    gap: 10px;
  }
  .adjustment-row {
    display: grid;
    grid-template-columns: 1.2fr 0.7fr 0.7fr auto;
    gap: 12px;
    align-items: center;
    padding: 12px;
  }
  .adjustment-row p {
    grid-column: 1 / -1;
    margin: 0;
  }
  .adjustment-actions {
    grid-column: 1 / -1;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .adjustment-action-button {
    min-height: 36px;
  }
  .adjustment-row p strong {
    color: var(--text);
    font-size: 13px;
  }
  .adjustment-note {
    padding: 12px;
  }
  .adjustment-note span {
    margin-top: 4px;
  }
  @media (max-width: 1040px) {
    .adjustments-summary-grid,
    .adjustment-row {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 640px) {
    .adjustments-summary-grid,
    .adjustment-row {
      grid-template-columns: 1fr;
    }
  }
`;
document.head.appendChild(payrollAdjustmentsStyle);

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-adjustment-contract][data-adjustment-decision]");
  if (!button) return;
  applyPayrollAdjustmentDecision(button.dataset.adjustmentContract, button.dataset.adjustmentDecision);
});

const renderBeforePayrollAdjustments = render;
render = function renderWithPayrollAdjustments() {
  renderBeforePayrollAdjustments();
  renderPayrollAdjustments();
};

render();
