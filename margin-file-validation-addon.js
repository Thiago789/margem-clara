function marginFileHeaders(text) {
  const firstLine = String(text || "").split(/\r?\n/).find(Boolean) || "";
  return firstLine.split(",").map((header) => header.trim());
}

function validateMarginRows(text) {
  const headers = marginFileHeaders(text);
  const rows = parseCsv(text);
  const required = ["nome", "cpf", "matricula", "renda_base", "descontos_obrigatorios", "status"];
  const allowedStatus = ["Ativo", "Em revisao", "Inativo"];
  const seenCpf = new Set();
  const seenEnrollment = new Set();
  const details = [];

  const missingHeaders = required.filter((field) => !headers.includes(field));

  rows.forEach((row, index) => {
    const issues = [...missingHeaders.map((field) => `Cabecalho obrigatorio ausente: ${field}`)];
    const warnings = [];
    const income = Number(row.renda_base || 0);
    const deductions = Number(row.descontos_obrigatorios || 0);
    const existingByCpf = state.employees.find((employee) => employee.cpf === row.cpf);
    const existingByEnrollment = state.employees.find((employee) => employee.enrollment === row.matricula);

    required.forEach((field) => {
      if (!String(row[field] ?? "").trim()) issues.push(`Campo obrigatorio ausente: ${field}`);
    });

    if (row.cpf && seenCpf.has(row.cpf)) issues.push("CPF duplicado no arquivo");
    if (row.matricula && seenEnrollment.has(row.matricula)) issues.push("Matricula duplicada no arquivo");
    if (row.cpf) seenCpf.add(row.cpf);
    if (row.matricula) seenEnrollment.add(row.matricula);

    if (!Number.isFinite(income) || income <= 0) issues.push("Renda base invalida");
    if (!Number.isFinite(deductions) || deductions < 0) issues.push("Descontos obrigatorios invalidos");
    if (Number.isFinite(income) && Number.isFinite(deductions) && deductions > income) issues.push("Descontos obrigatorios acima da renda");
    if (row.status && !allowedStatus.includes(row.status)) issues.push("Status funcional desconhecido");

    if (existingByCpf && existingByCpf.enrollment !== row.matricula) {
      warnings.push("CPF ja existe com matricula diferente na base");
    }
    if (existingByEnrollment && existingByEnrollment.cpf !== row.cpf) {
      warnings.push("Matricula ja existe com CPF diferente na base");
    }
    if (existingByCpf && row.nome && existingByCpf.name !== row.nome) {
      warnings.push("Nome divergente da base atual para o mesmo CPF");
    }
    if (row.status === "Em revisao") warnings.push("Servidor importado em revisao");

    details.push({
      line: index + 2,
      cpf: row.cpf || "-",
      enrollment: row.matricula || "-",
      name: row.nome || "-",
      status: issues.length ? "Bloquear" : warnings.length ? "Revisar" : "Apto",
      critical: issues,
      warnings,
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

const getFileValidationMetricsBeforeMarginFileValidation = getFileValidationMetrics;
getFileValidationMetrics = function getFileValidationMetricsWithMarginFileValidation() {
  const metrics = getFileValidationMetricsBeforeMarginFileValidation();
  const validation = state.lastMarginValidation;
  if (!validation) return metrics;

  metrics.margin = {
    ...metrics.margin,
    rows: validation.totalRows,
    critical: validation.critical,
    warnings: validation.warnings,
    status: validation.blocked ? "Bloquear" : validation.warnings ? "Revisar" : validation.totalRows ? "Apto" : metrics.margin.status,
    detail: validation.totalRows
      ? `${validation.totalRows} linha(s), ${validation.critical} erro(s) critico(s), ${validation.warnings} alerta(s).`
      : "Nenhuma margem validada ainda.",
  };

  return metrics;
};

const processCsvBeforeMarginFileValidation = processCsv;
processCsv = function processCsvWithMarginValidation(text) {
  const validation = validateMarginRows(text);
  state.lastMarginValidation = validation;

  if (!validation.totalRows) {
    saveState();
    render();
    document.getElementById("import-result").innerHTML = `
      <strong>Arquivo de margem vazio</strong>
      <p>Nenhuma linha valida encontrada para processamento.</p>
    `;
    return;
  }

  if (validation.blocked) {
    auditEvent(`Arquivo de margem bloqueado: ${validation.critical} erro(s) critico(s).`, "Validacao de margem");
    saveState();
    render();
    document.getElementById("import-result").innerHTML = `
      <strong>Importacao bloqueada</strong>
      <p>${validation.totalRows} linha(s) avaliadas.</p>
      <p>${validation.critical} erro(s) critico(s). Corrija o arquivo antes de atualizar a base.</p>
    `;
    return;
  }

  processCsvBeforeMarginFileValidation(text);
};

function ensureMarginValidationPanel() {
  if (document.getElementById("margin-validation-panel")) return;
  const validationContent = document.querySelector("#validation-view .validation-content");
  if (!validationContent) return;

  validationContent.insertAdjacentHTML(
    "afterend",
    `
      <section class="panel margin-validation-panel" id="margin-validation-panel">
        <div class="panel-heading">
          <h3>Ultima margem validada</h3>
        </div>
        <div class="margin-validation-summary" id="margin-validation-summary"></div>
        <div class="margin-validation-list" id="margin-validation-list"></div>
      </section>
    `
  );
}

function renderMarginValidationPanel() {
  ensureMarginValidationPanel();
  const summary = document.getElementById("margin-validation-summary");
  const list = document.getElementById("margin-validation-list");
  if (!summary || !list) return;

  const validation = state.lastMarginValidation;
  if (!validation) {
    summary.innerHTML = "";
    list.innerHTML = `<div class="empty-state">Nenhum arquivo de margem validado ainda.</div>`;
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
            <article class="margin-validation-row ${item.critical.length ? "danger" : item.warnings.length ? "warning" : ""}">
              <div>
                <strong>${item.name}</strong>
                <span>Linha ${item.line} - ${item.cpf} - ${item.enrollment}</span>
              </div>
              <p>${messages.length ? messages.join("; ") : "Linha apta para importacao."}</p>
            </article>
          `;
        })
        .join("")
    : `<div class="empty-state">Nenhuma linha avaliada.</div>`;
}

const marginValidationStyle = document.createElement("style");
marginValidationStyle.textContent = `
  .margin-validation-panel {
    margin-top: 18px;
  }
  .margin-validation-summary {
    display: grid;
    grid-template-columns: repeat(4, minmax(130px, 1fr));
    gap: 12px;
    margin-bottom: 12px;
  }
  .margin-validation-summary article,
  .margin-validation-row {
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface-2);
    padding: 12px;
  }
  .margin-validation-summary span,
  .margin-validation-row span,
  .margin-validation-row p {
    display: block;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.4;
  }
  .margin-validation-list {
    display: grid;
    gap: 10px;
  }
  .margin-validation-row p {
    margin: 6px 0 0;
  }
  .margin-validation-row.warning {
    border-color: rgba(245, 158, 11, 0.45);
  }
  .margin-validation-row.danger {
    border-color: rgba(239, 68, 68, 0.45);
  }
  @media (max-width: 1040px) {
    .margin-validation-summary {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 640px) {
    .margin-validation-summary {
      grid-template-columns: 1fr;
    }
  }
`;
document.head.appendChild(marginValidationStyle);

const renderBeforeMarginFileValidation = render;
render = function renderWithMarginFileValidation() {
  renderBeforeMarginFileValidation();
  renderMarginValidationPanel();
};

render();
