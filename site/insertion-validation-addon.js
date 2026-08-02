function validateInsertionRows() {
  if (typeof normalizeContractRuleFields === "function") normalizeContractRuleFields();
  if (typeof normalizeContractFinancialFields === "function") normalizeContractFinancialFields();
  if (typeof normalizeContractOperationFields === "function") normalizeContractOperationFields();
  if (typeof normalizeEnrollments === "function") normalizeEnrollments();

  const rows = buildInsertionRows();
  const details = [];
  const seenContracts = new Set();

  rows.forEach((row) => {
    const contract = state.contracts.find((item) => item.id === row.contrato);
    const issues = [];
    const warnings = [];
    const required = ["contrato", "cpf", "matricula", "rubrica", "parcela", "prazo", "competencia", "acao"];

    required.forEach((field) => {
      if (!String(row[field] ?? "").trim()) issues.push(`Campo obrigatorio ausente: ${field}`);
    });

    if (seenContracts.has(row.contrato)) issues.push("Contrato duplicado no arquivo de insercao");
    seenContracts.add(row.contrato);

    if (!contract) {
      issues.push("Contrato nao localizado na base");
    } else {
      const employee = employeeById(contract.employeeId);
      const enrollment = typeof enrollmentById === "function" ? enrollmentById(contract.enrollmentId) : null;
      const installment = Number(row.parcela || 0);
      const term = Number(row.prazo || 0);
      const expectedRubric = typeof contractRulesPayrollCode === "function" ? contractRulesPayrollCode(contract.product) : row.rubrica;

      if (!marginReservationStatuses.includes(contract.status)) issues.push(`Contrato com status ${contract.status}, esperado Reservado`);
      if (!employee) issues.push("Servidor do contrato nao localizado");
      if (contract.enrollmentId && !enrollment) issues.push("Matricula/vinculo do contrato nao localizado");
      if (enrollment && enrollment.status !== "Ativo") issues.push(`Matricula com status ${enrollment.status}`);
      if (!Number.isFinite(installment) || installment <= 0) issues.push("Parcela invalida");
      if (!Number.isFinite(term) || term <= 0) issues.push("Prazo invalido");
      if (expectedRubric && row.rubrica !== expectedRubric) issues.push("Rubrica divergente do produto");

      if (enrollment && typeof calculateEnrollmentMargin === "function") {
        const margin = calculateEnrollmentMargin(enrollment);
        if (margin.available < -0.01) issues.push("Matricula com margem negativa apos reserva");
      }

      if (!contract.firstDueDate) warnings.push("Primeiro vencimento nao informado");
      if (!contract.principalAmount || Number(contract.principalAmount) <= 0) warnings.push("Valor contratado nao informado");
      if (contract.firstPayrollCompetency && contract.firstPayrollCompetency !== row.competencia) {
        warnings.push("Primeira competencia diferente da competencia do arquivo");
      }
      if (Number(contract.currentInstallment || 0) > Number(contract.installments || 0)) {
        warnings.push("Parcela atual maior que o prazo");
      }
    }

    details.push({
      contractId: row.contrato || "-",
      competency: row.competencia || "-",
      status: issues.length ? "Bloquear" : warnings.length ? "Revisar" : "Apto",
      critical: issues,
      warnings,
      row,
    });
  });

  return {
    processedAt: today(),
    totalRows: rows.length,
    critical: details.reduce((sum, item) => sum + item.critical.length, 0),
    warnings: details.reduce((sum, item) => sum + item.warnings.length, 0),
    blocked: details.some((item) => item.critical.length),
    details,
  };
}

const getFileValidationMetricsBeforeInsertionValidation = getFileValidationMetrics;
getFileValidationMetrics = function getFileValidationMetricsWithInsertionValidation() {
  const metrics = getFileValidationMetricsBeforeInsertionValidation();
  const insertion = state.lastInsertionValidation;
  if (!insertion) return metrics;

  metrics.insertion = {
    ...metrics.insertion,
    rows: insertion.totalRows,
    critical: insertion.critical,
    warnings: insertion.warnings,
    status: insertion.blocked ? "Bloquear" : insertion.warnings ? "Revisar" : insertion.totalRows ? "Apto" : metrics.insertion.status,
    detail: insertion.totalRows
      ? `${insertion.totalRows} linha(s), ${insertion.critical} erro(s) critico(s), ${insertion.warnings} alerta(s).`
      : "Nenhuma linha de insercao validada ainda.",
  };

  return metrics;
};

const generateInsertionFileBeforeInsertionValidation = generateInsertionFile;
generateInsertionFile = function generateInsertionFileWithValidationGuard() {
  const validation = validateInsertionRows();
  state.lastInsertionValidation = validation;

  if (validation.totalRows && validation.blocked) {
    auditEvent(`Arquivo de insercao bloqueado: ${validation.critical} erro(s) critico(s).`, "Validacao de insercao");
    saveState();
    render();
    const result = document.getElementById("insertion-result");
    if (result) {
      result.innerHTML = `
        <strong>Insercao bloqueada</strong>
        <p>${validation.totalRows} linha(s) avaliadas.</p>
        <p>${validation.critical} erro(s) critico(s). Corrija antes de gerar o arquivo para a folha.</p>
      `;
    }
    return;
  }

  generateInsertionFileBeforeInsertionValidation();
};

function ensureInsertionValidationPanel() {
  if (document.getElementById("insertion-validation-panel")) return;
  const validationContent = document.querySelector("#validation-view .validation-content");
  if (!validationContent) return;

  validationContent.insertAdjacentHTML(
    "afterend",
    `
      <section class="panel insertion-validation-panel" id="insertion-validation-panel">
        <div class="panel-heading">
          <h3>Ultima insercao validada</h3>
        </div>
        <div class="insertion-validation-summary" id="insertion-validation-summary"></div>
        <div class="insertion-validation-list" id="insertion-validation-list"></div>
      </section>
    `
  );
}

function renderInsertionValidationPanel() {
  ensureInsertionValidationPanel();
  const summary = document.getElementById("insertion-validation-summary");
  const list = document.getElementById("insertion-validation-list");
  if (!summary || !list) return;

  const validation = state.lastInsertionValidation;
  if (!validation) {
    summary.innerHTML = "";
    list.innerHTML = `<div class="empty-state">Nenhuma insercao validada ainda.</div>`;
    return;
  }

  summary.innerHTML = [
    ["Linhas", validation.totalRows],
    ["Erros criticos", validation.critical],
    ["Alertas", validation.warnings],
    ["Status", validation.blocked ? "Bloqueado" : "Apto"],
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

  list.innerHTML = validation.details.length
    ? validation.details
        .map((item) => {
          const messages = [...item.critical, ...item.warnings];
          return `
            <article class="insertion-validation-row ${item.critical.length ? "danger" : item.warnings.length ? "warning" : ""}">
              <div>
                <strong>${item.contractId}</strong>
                <span>${item.competency} - ${item.status}</span>
              </div>
              <p>${messages.length ? messages.join("; ") : "Linha apta para insercao."}</p>
            </article>
          `;
        })
        .join("")
    : `<div class="empty-state">Nenhuma linha apta para a data de corte atual.</div>`;
}

const insertionValidationStyle = document.createElement("style");
insertionValidationStyle.textContent = `
  .insertion-validation-panel {
    margin-top: 18px;
  }
  .insertion-validation-summary {
    display: grid;
    grid-template-columns: repeat(4, minmax(130px, 1fr));
    gap: 12px;
    margin-bottom: 12px;
  }
  .insertion-validation-summary article,
  .insertion-validation-row {
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface-2);
    padding: 12px;
  }
  .insertion-validation-summary span,
  .insertion-validation-row span,
  .insertion-validation-row p {
    display: block;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.4;
  }
  .insertion-validation-list {
    display: grid;
    gap: 10px;
  }
  .insertion-validation-row p {
    margin: 6px 0 0;
  }
  .insertion-validation-row.warning {
    border-color: rgba(245, 158, 11, 0.45);
  }
  .insertion-validation-row.danger {
    border-color: rgba(239, 68, 68, 0.45);
  }
  @media (max-width: 1040px) {
    .insertion-validation-summary {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 640px) {
    .insertion-validation-summary {
      grid-template-columns: 1fr;
    }
  }
`;
document.head.appendChild(insertionValidationStyle);

const renderBeforeInsertionValidation = render;
render = function renderWithInsertionValidation() {
  renderBeforeInsertionValidation();
  renderInsertionValidationPanel();
};

render();
