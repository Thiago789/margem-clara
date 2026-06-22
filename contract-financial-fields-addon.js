function defaultContractFinancialFields(contract) {
  const lender = lenders.find((item) => item.id === contract.lenderId) || {};
  return {
    principalAmount: Number(contract.principalAmount || 0),
    interestRate: Number(contract.interestRate ?? lender.rate ?? 0),
    cetRate: Number(contract.cetRate ?? lender.cet ?? 0),
    firstDueDate: contract.firstDueDate || "",
    firstPayrollCompetency: contract.firstPayrollCompetency || state.conventionSettings?.payrollCompetency || today().slice(0, 7),
  };
}

function normalizeContractFinancialFields() {
  state.contracts.forEach((contract) => {
    Object.assign(contract, defaultContractFinancialFields(contract), {
      principalAmount: Number(contract.principalAmount || 0),
    });
  });
}

function ensureContractFinancialFields() {
  const form = document.getElementById("contract-form");
  if (!form || document.getElementById("contract-principal-amount")) return;

  const submitButton = form.querySelector("button[type='submit']");
  submitButton?.insertAdjacentHTML(
    "beforebegin",
    `
      <label>
        Valor contratado
        <input id="contract-principal-amount" class="text-input" type="number" min="0" step="0.01" placeholder="Opcional" />
      </label>
      <label>
        Taxa mensal (%)
        <input id="contract-interest-rate" class="text-input" type="number" min="0" step="0.01" placeholder="Ex.: 1.72" />
      </label>
      <label>
        CET mensal (%)
        <input id="contract-cet-rate" class="text-input" type="number" min="0" step="0.01" placeholder="Ex.: 1.91" />
      </label>
      <label>
        Primeiro vencimento
        <input id="contract-first-due-date" class="text-input" type="date" />
      </label>
      <label>
        Primeira competencia
        <input id="contract-first-payroll-competency" class="text-input" type="month" />
      </label>
    `
  );

  form.addEventListener(
    "submit",
    (event) => {
      if (event.submitter?.value === "cancel") return;

      const existingIds = new Set(state.contracts.map((contract) => contract.id));
      const values = {
        principalAmount: Number(document.getElementById("contract-principal-amount")?.value || 0),
        interestRate: Number(document.getElementById("contract-interest-rate")?.value || 0),
        cetRate: Number(document.getElementById("contract-cet-rate")?.value || 0),
        firstDueDate: document.getElementById("contract-first-due-date")?.value || "",
        firstPayrollCompetency: document.getElementById("contract-first-payroll-competency")?.value || state.conventionSettings?.payrollCompetency || today().slice(0, 7),
      };

      setTimeout(() => {
        const created = state.contracts.find((contract) => !existingIds.has(contract.id));
        if (!created) return;

        const lender = lenders.find((item) => item.id === created.lenderId) || {};
        created.principalAmount = values.principalAmount;
        created.interestRate = values.interestRate || Number(lender.rate || 0);
        created.cetRate = values.cetRate || Number(lender.cet || 0);
        created.firstDueDate = values.firstDueDate;
        created.firstPayrollCompetency = values.firstPayrollCompetency;
        auditEvent(`Campos financeiros registrados para ${created.id}.`, "Contrato");
        saveState();
        render();
      }, 0);
    },
    true
  );
}

function renderContractFinancialDetails() {
  normalizeContractFinancialFields();

  document.querySelectorAll("#contracts-table tr").forEach((row) => {
    const contractId = row.querySelector("td strong")?.textContent;
    const contract = state.contracts.find((item) => item.id === contractId);
    if (!contract || row.dataset.financialFieldsRendered) return;

    const statusCell = row.querySelector("td:last-child");
    statusCell?.insertAdjacentHTML(
      "beforeend",
      `
        <div class="muted contract-financial-summary">
          Taxa ${Number(contract.interestRate || 0).toFixed(2)}% | CET ${Number(contract.cetRate || 0).toFixed(2)}%
          ${contract.firstPayrollCompetency ? ` | 1a comp. ${contract.firstPayrollCompetency}` : ""}
          ${contract.firstDueDate ? ` | 1o venc. ${contract.firstDueDate}` : ""}
        </div>
      `
    );
    row.dataset.financialFieldsRendered = "true";
  });
}

const buildInsertionRowsBeforeFinancialFields = buildInsertionRows;
buildInsertionRows = function buildInsertionRowsWithFinancialFields() {
  normalizeContractFinancialFields();
  return buildInsertionRowsBeforeFinancialFields().map((row) => {
    const contract = state.contracts.find((item) => item.id === row.contrato);
    return {
      ...row,
      valor_contratado: Number(contract?.principalAmount || 0).toFixed(2),
      taxa_mensal: Number(contract?.interestRate || 0).toFixed(2),
      cet_mensal: Number(contract?.cetRate || 0).toFixed(2),
      primeiro_vencimento: contract?.firstDueDate || "",
      primeira_competencia: contract?.firstPayrollCompetency || row.competencia,
    };
  });
};

generateInsertionFile = function generateInsertionFileWithFinancialFields() {
  const reservedCount = state.contracts.filter((contract) => marginReservationStatuses.includes(contract.status)).length;
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

  auditEvent(`Arquivo de insercao gerado com campos financeiros para ${rows.length} desconto(s).`, "Arquivo de insercao");
  saveState();
  render();
  downloadCsv(`insercao-folha-${today()}.csv`, content);
  result.innerHTML = `
    <strong>Arquivo de insercao gerado</strong>
    <p>${rows.length} desconto(s) enviados para a folha.</p>
    <p>Inclui valor contratado, taxa, CET, primeiro vencimento e primeira competencia.</p>
  `;
};

const contractFinancialFieldsStyle = document.createElement("style");
contractFinancialFieldsStyle.textContent = `
  .contract-financial-summary {
    margin-top: 4px;
  }
`;
document.head.appendChild(contractFinancialFieldsStyle);

const renderBeforeContractFinancialFields = render;
render = function renderWithContractFinancialFields() {
  renderBeforeContractFinancialFields();
  ensureContractFinancialFields();
  renderContractFinancialDetails();
};

render();
