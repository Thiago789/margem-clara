function ensureContractOperationFields() {
  const form = document.getElementById("contract-form");
  if (!form || document.getElementById("contract-source-id")) return;

  const submitButton = form.querySelector("button[type='submit']");
  submitButton?.insertAdjacentHTML(
    "beforebegin",
    `
      <label>
        Contrato origem
        <input id="contract-source-id" class="text-input" placeholder="Obrigatorio em refin/portabilidade" />
      </label>
      <label>
        Banco ou credor origem
        <input id="contract-origin-lender" class="text-input" placeholder="Obrigatorio em portabilidade/compra" />
      </label>
      <label>
        Valor compra/saldo
        <input id="contract-debt-purchase-amount" class="text-input" type="number" min="0" step="0.01" />
      </label>
      <label>
        Observacao operacional
        <input id="contract-operation-note" class="text-input" placeholder="Protocolo, motivo ou evidencia inicial" />
      </label>
    `
  );

  form.addEventListener(
    "submit",
    (event) => {
      if (event.submitter?.value === "cancel") return;
      const missing = getContractOperationMissingItems();
      if (!missing.length) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      alert(`Campos exigidos pelo tipo de contrato:\n- ${missing.join("\n- ")}`);
    },
    true
  );

  form.addEventListener(
    "submit",
    (event) => {
      if (event.submitter?.value === "cancel") return;
      const existingIds = new Set(state.contracts.map((contract) => contract.id));
      const operationFields = readContractOperationFields();

      setTimeout(() => {
        const created = state.contracts.find((contract) => !existingIds.has(contract.id));
        if (!created) return;
        Object.assign(created, operationFields);
        auditEvent(`Campos operacionais registrados para ${created.id}.`, "Contrato");
        saveState();
        render();
      }, 0);
    },
    true
  );
}

function readContractOperationFields() {
  return {
    sourceContractId: document.getElementById("contract-source-id")?.value.trim() || "",
    originLenderName: document.getElementById("contract-origin-lender")?.value.trim() || "",
    debtPurchaseAmount: Number(document.getElementById("contract-debt-purchase-amount")?.value || 0),
    operationNote: document.getElementById("contract-operation-note")?.value.trim() || "",
  };
}

function getContractOperationMissingItems() {
  const contractType = document.getElementById("contract-type")?.value || "Novo";
  const values = readContractOperationFields();
  const missing = [];

  if (["Refinanciamento", "Portabilidade"].includes(contractType) && !values.sourceContractId) {
    missing.push("Contrato origem");
  }
  if (["Portabilidade", "Compra de divida"].includes(contractType) && !values.originLenderName) {
    missing.push("Banco ou credor origem");
  }
  if (contractType === "Compra de divida" && values.debtPurchaseAmount <= 0) {
    missing.push("Valor compra/saldo");
  }

  return missing;
}

function normalizeContractOperationFields() {
  state.contracts.forEach((contract) => {
    contract.sourceContractId = contract.sourceContractId || "";
    contract.originLenderName = contract.originLenderName || contract.debtOperationFormalData?.originLender || "";
    contract.debtPurchaseAmount = Number(contract.debtPurchaseAmount || contract.debtOperationFormalData?.releasedAmount || 0);
    contract.operationNote = contract.operationNote || "";
  });
}

function renderContractOperationDetails() {
  normalizeContractOperationFields();

  document.querySelectorAll("#contracts-table tr").forEach((row) => {
    const contractId = row.querySelector("td strong")?.textContent;
    const contract = state.contracts.find((item) => item.id === contractId);
    if (!contract || row.dataset.operationFieldsRendered) return;

    const details = [
      contract.sourceContractId ? `origem ${contract.sourceContractId}` : "",
      contract.originLenderName ? contract.originLenderName : "",
      contract.debtPurchaseAmount ? `valor ${money.format(contract.debtPurchaseAmount)}` : "",
    ].filter(Boolean);
    if (!details.length) return;

    row.querySelector("td:last-child")?.insertAdjacentHTML(
      "beforeend",
      `<div class="muted contract-operation-summary">${details.join(" | ")}</div>`
    );
    row.dataset.operationFieldsRendered = "true";
  });
}

const buildInsertionRowsBeforeOperationFields = buildInsertionRows;
buildInsertionRows = function buildInsertionRowsWithOperationFields() {
  normalizeContractOperationFields();
  return buildInsertionRowsBeforeOperationFields().map((row) => {
    const contract = state.contracts.find((item) => item.id === row.contrato);
    return {
      ...row,
      contrato_origem: contract?.sourceContractId || "",
      credor_origem: contract?.originLenderName || "",
      valor_compra_saldo: Number(contract?.debtPurchaseAmount || 0).toFixed(2),
      observacao_operacional: contract?.operationNote || "",
    };
  });
};

generateInsertionFile = function generateInsertionFileWithOperationFields() {
  const reservedCount = state.contracts.filter((contract) => contract.status === "Reservado").length;
  const rows = buildInsertionRows();
  const result = document.getElementById("insertion-result");

  if (!rows.length) {
    result.textContent = reservedCount
      ? "Existem reservas pendentes, mas fora da data de corte configurada para esta competencia."
      : "Nenhuma reserva pendente para enviar a folha.";
    return;
  }

  const headers = [
    "contrato",
    "cpf",
    "matricula",
    "produto",
    "tipo_contrato",
    "rubrica",
    "parcela",
    "prazo",
    "parcela_atual",
    "competencia",
    "valor_contratado",
    "taxa_mensal",
    "cet_mensal",
    "primeiro_vencimento",
    "primeira_competencia",
    "contrato_origem",
    "credor_origem",
    "valor_compra_saldo",
    "observacao_operacional",
    "acao",
  ];
  const content = buildCsv(headers, rows);
  const sentContractIds = new Set(rows.map((row) => row.contrato));

  state.contracts.forEach((contract) => {
    if (sentContractIds.has(contract.id)) {
      contract.status = "Enviado para folha";
      contract.sentToPayrollAt = today();
    }
  });

  auditEvent(`Arquivo de insercao gerado com campos financeiros e operacionais para ${rows.length} desconto(s).`, "Arquivo de insercao");
  saveState();
  render();
  downloadCsv(`insercao-folha-${today()}.csv`, content);
  result.innerHTML = `
    <strong>Arquivo de insercao gerado</strong>
    <p>${rows.length} desconto(s) enviados para a folha.</p>
    <p>Inclui campos financeiros, competencia, contrato origem e credor origem quando aplicavel.</p>
  `;
};

function renderContractOperationPolicyNotes() {
  const matrix = document.getElementById("contract-field-matrix");
  if (!matrix || matrix.dataset.operationNotesRendered) return;
  matrix.dataset.operationNotesRendered = "true";
  matrix.insertAdjacentHTML(
    "beforeend",
    `
      <article class="contract-field-row">
        <strong>Validacoes na reserva</strong>
        <span>Refinanciamento exige contrato origem; portabilidade exige contrato e credor origem; compra de divida exige credor origem e valor de compra/saldo.</span>
      </article>
    `
  );
}

const contractOperationFieldsStyle = document.createElement("style");
contractOperationFieldsStyle.textContent = `
  .contract-operation-summary {
    margin-top: 4px;
  }
`;
document.head.appendChild(contractOperationFieldsStyle);

const renderBeforeContractOperationFields = render;
render = function renderWithContractOperationFields() {
  renderBeforeContractOperationFields();
  ensureContractOperationFields();
  renderContractOperationDetails();
  renderContractOperationPolicyNotes();
};

document.addEventListener("click", (event) => {
  if (!event.target.closest("[data-view='contractfields']")) return;
  setTimeout(renderContractOperationPolicyNotes, 0);
});

render();
