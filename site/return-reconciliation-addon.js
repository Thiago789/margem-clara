function classifyReturnReconciliationRow(row) {
  const contract = state.contracts.find((item) => item.id === row.contrato);
  const competency = row.competencia || (typeof currentCompetency === "function" ? currentCompetency() : today().slice(0, 7));
  const rawAmount = String(row.valor_descontado ?? "").trim();
  const amount = Number(rawAmount || 0);
  const normalizedStatus = normalizeReturnStatus(row.status);
  const missingFields = [];

  if (!String(row.contrato || "").trim()) missingFields.push("contrato");
  if (!String(row.status || "").trim()) missingFields.push("status");
  if (!String(row.competencia || "").trim()) missingFields.push("competencia");
  if (!String(row.valor_descontado ?? "").trim()) missingFields.push("valor_descontado");

  if (missingFields.length || !Number.isFinite(amount) || normalizedStatus === "Pendente") {
    return {
      contractId: row.contrato || "-",
      competency,
      status: "Invalido",
      amount: Number.isFinite(amount) ? amount : 0,
      expected: contract ? Number(contract.installment || 0) : 0,
      difference: 0,
      reason: missingFields.length
        ? `Campo(s) obrigatorio(s) ausente(s): ${missingFields.join(", ")}.`
        : "Status ou valor de retorno invalido para processamento automatico.",
      category: "invalid",
    };
  }

  if (!contract) {
    return {
      contractId: row.contrato || "-",
      competency,
      status: "Nao localizado",
      amount,
      expected: 0,
      difference: amount,
      reason: row.motivo || "Contrato informado no retorno nao existe na base atual.",
      category: "not_found",
    };
  }

  const expected = Number(contract.installment || 0);
  const difference = Number((amount - expected).toFixed(2));
  const existingReturn =
    typeof findProcessedCompetency === "function" ? findProcessedCompetency(contract, competency) : null;

  if (existingReturn) {
    return {
      contractId: contract.id,
      competency,
      status: "Duplicado",
      amount,
      expected,
      difference,
      reason: `Competencia ja processada como ${existingReturn.status}.`,
      category: "duplicate",
    };
  }

  if (normalizedStatus === "Descontando" && Math.abs(difference) > 0.01) {
    return {
      contractId: contract.id,
      competency,
      status: "Divergente",
      amount,
      expected,
      difference,
      reason: row.motivo || "Valor descontado diferente da parcela esperada.",
      category: "divergent",
    };
  }

  if (returnIssueStatuses.includes(normalizedStatus)) {
    return {
      contractId: contract.id,
      competency,
      status: normalizedStatus,
      amount,
      expected,
      difference,
      reason: row.motivo || "Retorno sem motivo informado.",
      category: "pending",
    };
  }

  return {
    contractId: contract.id,
    competency,
    status: normalizedStatus,
    amount,
    expected,
    difference,
    reason: row.motivo || "Conciliado.",
    category: "ok",
  };
}

const processReturnCsvBeforeReconciliationDetails = processReturnCsv;
processReturnCsv = function processReturnCsvWithReconciliationDetails(text) {
  const rows = parseCsv(text);
  const details = rows.map(classifyReturnReconciliationRow);
  const invalid = details.filter((item) => item.category === "invalid");

  if (invalid.length) {
    state.lastReturnReconciliation = {
      processedAt: today(),
      competency: rows[0]?.competencia || (typeof currentCompetency === "function" ? currentCompetency() : today().slice(0, 7)),
      blocked: true,
      totalRows: rows.length,
      ok: details.filter((item) => item.category === "ok").length,
      invalid: invalid.length,
      divergent: details.filter((item) => item.category === "divergent").length,
      pending: details.filter((item) => item.category === "pending").length,
      duplicate: details.filter((item) => item.category === "duplicate").length,
      notFound: details.filter((item) => item.category === "not_found").length,
      details,
    };

    auditEvent(`Arquivo retorno bloqueado: ${invalid.length} linha(s) com erro critico de validacao.`, "Conciliacao");
    saveState();
    render();
    document.getElementById("return-result").innerHTML = `
      <strong>Retorno bloqueado</strong>
      <p>${rows.length} linha(s) lidas.</p>
      <p>${invalid.length} linha(s) com erro critico. Corrija o arquivo antes de processar.</p>
    `;
    return;
  }

  processReturnCsvBeforeReconciliationDetails(text);

  state.lastReturnReconciliation = {
    processedAt: today(),
    competency: rows[0]?.competencia || (typeof currentCompetency === "function" ? currentCompetency() : today().slice(0, 7)),
    blocked: false,
    totalRows: rows.length,
    ok: details.filter((item) => item.category === "ok").length,
    invalid: 0,
    divergent: details.filter((item) => item.category === "divergent").length,
    pending: details.filter((item) => item.category === "pending").length,
    duplicate: details.filter((item) => item.category === "duplicate").length,
    notFound: details.filter((item) => item.category === "not_found").length,
    details,
  };

  auditEvent(
    `Conciliacao detalhada do retorno: ${state.lastReturnReconciliation.ok} ok, ${state.lastReturnReconciliation.divergent} divergente(s), ${state.lastReturnReconciliation.duplicate} duplicado(s), ${state.lastReturnReconciliation.notFound} nao localizado(s).`,
    "Conciliacao"
  );
  saveState();
  render();
};

function ensureReturnReconciliationDetailsPanel() {
  if (document.getElementById("return-reconciliation-details")) return;
  const reconciliationPanel = document.querySelector("#reconciliation-view .reconciliation-panel");
  if (!reconciliationPanel) return;

  reconciliationPanel.insertAdjacentHTML(
    "afterend",
    `
      <section class="panel return-reconciliation-details" id="return-reconciliation-details">
        <div class="panel-heading">
          <h3>Ultimo retorno processado</h3>
        </div>
        <div class="return-reconciliation-summary" id="return-reconciliation-summary"></div>
        <div class="return-reconciliation-list" id="return-reconciliation-list"></div>
      </section>
    `
  );
}

function renderReturnReconciliationDetails() {
  ensureReturnReconciliationDetailsPanel();
  const summary = document.getElementById("return-reconciliation-summary");
  const list = document.getElementById("return-reconciliation-list");
  if (!summary || !list) return;

  const data = state.lastReturnReconciliation;
  if (!data) {
    summary.innerHTML = "";
    list.innerHTML = `<div class="empty-state">Nenhum retorno detalhado processado ainda.</div>`;
    return;
  }

  summary.innerHTML = [
    ["Linhas", data.totalRows],
    ["Invalidas", data.invalid || 0],
    ["Conciliadas", data.ok],
    ["Divergentes", data.divergent],
    ["Duplicadas", data.duplicate],
    ["Nao localizadas", data.notFound],
  ]
    .map(
      ([label, value]) => `
        <article>
          <span>${label}</span>
          <strong>${value}</strong>
        </article>
      `
    )
    .join("");

  list.innerHTML = data.details.length
    ? data.details
        .map(
          (item) => `
            <article class="return-reconciliation-row ${item.category}">
              <div>
                <strong>${item.contractId}</strong>
                <span>${item.competency} - ${item.status}</span>
              </div>
              <div><span>Esperado</span><strong>${money.format(Number(item.expected || 0))}</strong></div>
              <div><span>Retornado</span><strong>${money.format(Number(item.amount || 0))}</strong></div>
              <div><span>Diferenca</span><strong>${money.format(Number(item.difference || 0))}</strong></div>
              <p>${item.reason}</p>
            </article>
          `
        )
        .join("")
    : `<div class="empty-state">Nenhuma linha no ultimo retorno.</div>`;
}

const returnReconciliationStyle = document.createElement("style");
returnReconciliationStyle.textContent = `
  .return-reconciliation-details {
    margin-top: 18px;
  }
  .return-reconciliation-summary {
    display: grid;
    grid-template-columns: repeat(6, minmax(110px, 1fr));
    gap: 12px;
    margin-bottom: 12px;
  }
  .return-reconciliation-summary article,
  .return-reconciliation-row {
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface-2);
    padding: 12px;
  }
  .return-reconciliation-summary span,
  .return-reconciliation-row span,
  .return-reconciliation-row p {
    display: block;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.4;
  }
  .return-reconciliation-list {
    display: grid;
    gap: 10px;
  }
  .return-reconciliation-row {
    display: grid;
    grid-template-columns: 1.1fr 0.7fr 0.7fr 0.7fr;
    gap: 12px;
    align-items: center;
  }
  .return-reconciliation-row p {
    grid-column: 1 / -1;
    margin: 0;
  }
  .return-reconciliation-row.divergent,
  .return-reconciliation-row.duplicate,
  .return-reconciliation-row.pending {
    border-color: rgba(245, 158, 11, 0.45);
  }
  .return-reconciliation-row.invalid,
  .return-reconciliation-row.not_found {
    border-color: rgba(239, 68, 68, 0.45);
  }
  @media (max-width: 1040px) {
    .return-reconciliation-summary,
    .return-reconciliation-row {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 640px) {
    .return-reconciliation-summary,
    .return-reconciliation-row {
      grid-template-columns: 1fr;
    }
  }
`;
document.head.appendChild(returnReconciliationStyle);

const renderBeforeReturnReconciliationDetails = render;
render = function renderWithReturnReconciliationDetails() {
  renderBeforeReturnReconciliationDetails();
  renderReturnReconciliationDetails();
};

render();
