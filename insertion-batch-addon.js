function insertionBatchCurrentCompetency(rows) {
  return rows.find((row) => row.competencia)?.competencia || (typeof contractRulesCurrentCompetency === "function" ? contractRulesCurrentCompetency() : today().slice(0, 7));
}

function normalizeInsertionBatches() {
  state.contracts.forEach((contract) => {
    contract.insertionBatches = Array.isArray(contract.insertionBatches) ? contract.insertionBatches : [];
  });
}

function contractHasInsertionBatch(contract, competency) {
  normalizeInsertionBatches();
  return contract.insertionBatches.some((batch) => batch.competency === competency && batch.status !== "Cancelado");
}

function createInsertionBatchId(competency) {
  const existingIds = new Set();
  state.contracts.forEach((contract) => {
    (contract.insertionBatches || [])
      .filter((batch) => batch.competency === competency)
      .forEach((batch) => existingIds.add(batch.id));
  });
  const sequence = existingIds.size + 1;
  return `INS-${competency}-${String(sequence).padStart(3, "0")}`;
}

function registerInsertionBatch(rows) {
  normalizeInsertionBatches();
  const competency = insertionBatchCurrentCompetency(rows);
  const batchId = createInsertionBatchId(competency);
  const generatedAt = today();

  rows.forEach((row) => {
    const contract = state.contracts.find((item) => item.id === row.contrato);
    if (!contract || contractHasInsertionBatch(contract, competency)) return;
    contract.insertionBatches.push({
      id: batchId,
      competency,
      generatedAt,
      installment: Number(row.parcela || 0),
      currentInstallment: Number(row.parcela_atual || contract.currentInstallment || 0),
      status: "Enviado",
      returnStatus: "",
      returnedAt: "",
      returnReason: "",
    });
  });

  state.lastInsertionBatch = {
    id: batchId,
    competency,
    generatedAt,
    contracts: rows.map((row) => row.contrato),
    totalRows: rows.length,
  };
}

function findInsertionBatch(contract, competency) {
  normalizeInsertionBatches();
  return contract.insertionBatches.find((batch) => batch.competency === competency && batch.status !== "Cancelado");
}

function updateInsertionBatchFromReturn(row, detail) {
  const contract = state.contracts.find((item) => item.id === row.contrato);
  if (!contract) return;

  const competency = row.competencia || detail?.competency || (typeof currentCompetency === "function" ? currentCompetency() : today().slice(0, 7));
  const batch = findInsertionBatch(contract, competency);
  if (!batch) return;

  const normalizedStatus = detail?.status || normalizeReturnStatus(row.status);
  batch.returnStatus = normalizedStatus;
  batch.returnedAt = today();
  batch.returnReason = detail?.reason || row.motivo || "";
  batch.returnAmount = Number(row.valor_descontado || detail?.amount || 0);

  if (detail?.category === "duplicate") {
    batch.status = "Retorno duplicado";
  } else if (detail?.category === "divergent") {
    batch.status = "Divergente";
  } else if (detail?.category === "pending" || returnIssueStatuses.includes(normalizedStatus)) {
    batch.status = "Pendente";
  } else if (normalizedStatus === "Descontando") {
    batch.status = "Retornado";
  } else {
    batch.status = "Retorno recebido";
  }
}

function syncInsertionBatchesFromLastReturn() {
  const reconciliation = state.lastReturnReconciliation;
  if (!reconciliation?.details?.length) return;

  reconciliation.details.forEach((detail) => {
    if (!["ok", "pending", "divergent", "duplicate"].includes(detail.category)) return;
    updateInsertionBatchFromReturn(
      {
        contrato: detail.contractId,
        competencia: detail.competency,
        status: detail.status,
        motivo: detail.reason,
        valor_descontado: detail.amount,
      },
      detail
    );
  });
}

const validateInsertionRowsBeforeBatchGuard = validateInsertionRows;
validateInsertionRows = function validateInsertionRowsWithBatchGuard() {
  const validation = validateInsertionRowsBeforeBatchGuard();
  const rows = validation.details.map((detail) => detail.row).filter(Boolean);
  const competency = insertionBatchCurrentCompetency(rows);

  validation.details.forEach((detail) => {
    const contract = state.contracts.find((item) => item.id === detail.contractId);
    if (!contract) return;
    if (contractHasInsertionBatch(contract, competency)) {
      detail.critical.push(`Contrato ja possui lote de insercao na competencia ${competency}`);
      detail.status = "Bloquear";
    }
  });

  validation.critical = validation.details.reduce((sum, item) => sum + item.critical.length, 0);
  validation.blocked = validation.details.some((item) => item.critical.length);
  validation.batchCompetency = competency;

  return validation;
};

const processReturnCsvBeforeInsertionBatch = processReturnCsv;
processReturnCsv = function processReturnCsvWithInsertionBatchStatus(text) {
  const rows = parseCsv(text);
  processReturnCsvBeforeInsertionBatch(text);

  const details = state.lastReturnReconciliation?.details || [];
  rows.forEach((row, index) => updateInsertionBatchFromReturn(row, details[index]));
  syncInsertionBatchesFromLastReturn();
  saveState();
  render();
};

const generateInsertionFileBeforeBatchGuard = generateInsertionFile;
generateInsertionFile = function generateInsertionFileWithBatchGuard() {
  const rowsBeforeGeneration = buildInsertionRows();
  const competency = insertionBatchCurrentCompetency(rowsBeforeGeneration);
  const duplicated = rowsBeforeGeneration.filter((row) => {
    const contract = state.contracts.find((item) => item.id === row.contrato);
    return contract && contractHasInsertionBatch(contract, competency);
  });

  if (duplicated.length) {
    state.lastInsertionValidation = validateInsertionRows();
    auditEvent(`Arquivo de insercao bloqueado por lote duplicado na competencia ${competency}.`, "Validacao de insercao");
    saveState();
    render();
    const result = document.getElementById("insertion-result");
    if (result) {
      result.innerHTML = `
        <strong>Insercao bloqueada</strong>
        <p>${duplicated.length} contrato(s) ja possuem lote de insercao na competencia ${competency}.</p>
        <p>Para reenviar, registre ajuste formal antes de gerar nova remessa.</p>
      `;
    }
    return;
  }

  generateInsertionFileBeforeBatchGuard();

  const blocked = state.lastInsertionValidation?.blocked;
  const sentRows = rowsBeforeGeneration.filter((row) => {
    const contract = state.contracts.find((item) => item.id === row.contrato);
    return contract?.status === "Enviado para folha";
  });

  if (!blocked && sentRows.length) {
    registerInsertionBatch(sentRows);
    auditEvent(`Lote ${state.lastInsertionBatch.id} registrado para competencia ${competency}.`, "Arquivo de insercao");
    saveState();
    render();
  }
};

function renderInsertionBatchSummary() {
  const summary = document.getElementById("insertion-validation-summary");
  if (!summary) return;

  const batch = state.lastInsertionBatch;
  const contracts = batch ? state.contracts.filter((contract) => batch.contracts.includes(contract.id)) : [];
  const batchRows = contracts.flatMap((contract) => (contract.insertionBatches || []).filter((item) => item.id === batch.id));
  const returned = batchRows.filter((item) => ["Retornado", "Retorno recebido"].includes(item.status)).length;
  const pending = batchRows.filter((item) => ["Pendente", "Divergente", "Retorno duplicado"].includes(item.status)).length;
  summary.insertAdjacentHTML(
    "beforeend",
    `
      <article>
        <span>Ultimo lote</span>
        <strong>${batch ? batch.id : "Nenhum"}</strong>
      </article>
      <article>
        <span>Competencia lote</span>
        <strong>${batch ? batch.competency : "-"}</strong>
      </article>
      <article>
        <span>Retornados lote</span>
        <strong>${batch ? returned : "-"}</strong>
      </article>
      <article>
        <span>Pendencias lote</span>
        <strong>${batch ? pending : "-"}</strong>
      </article>
    `
  );
}

const renderBeforeInsertionBatch = render;
render = function renderWithInsertionBatch() {
  renderBeforeInsertionBatch();
  normalizeInsertionBatches();
  renderInsertionBatchSummary();
};

render();
