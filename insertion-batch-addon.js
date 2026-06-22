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
