if (!pageTitles.validation) {
  pageTitles.validation = "Validacao";
}

if (!profileConfig.manager.views.includes("validation")) {
  const importIndex = profileConfig.manager.views.indexOf("import");
  profileConfig.manager.views.splice(importIndex >= 0 ? importIndex + 1 : profileConfig.manager.views.length, 0, "validation");
}

function getFileValidationSchemas() {
  return [
    {
      type: "Arquivo de margem",
      stage: "Entrada",
      required: ["nome", "cpf", "matricula", "renda_base", "descontos_obrigatorios", "status"],
      critical: ["CPF vazio", "matricula vazia", "renda invalida", "servidor duplicado"],
      warnings: ["status em revisao", "descontos acima da renda", "nome divergente da base anterior"],
    },
    {
      type: "Arquivo de insercao",
      stage: "Saida",
      required: ["contrato", "cpf", "matricula", "rubrica", "parcela", "prazo", "competencia", "acao"],
      critical: ["reserva expirada", "margem insuficiente", "consignataria sem permissao", "rubrica invalida"],
      warnings: ["prazo fora do padrao", "contrato sem codigo usado", "competencia perto do fechamento"],
    },
    {
      type: "Arquivo retorno",
      stage: "Entrada",
      required: ["contrato", "status", "motivo", "valor_descontado", "competencia"],
      critical: ["campo obrigatorio ausente", "contrato nao localizado", "status desconhecido", "valor invalido", "retorno duplicado"],
      warnings: ["valor divergente", "nao descontado", "retorno parcial", "competencia diferente da enviada"],
    },
  ];
}

function getFileValidationMetrics() {
  const reviewEmployees = state.employees.filter((employee) => employee.status === "Em revisao");
  const invalidIncome = state.employees.filter((employee) => Number(employee.income || 0) <= 0);
  const reserved = state.contracts.filter((contract) => marginReservationStatuses.includes(contract.status));
  const sent = state.contracts.filter((contract) => contract.status === "Enviado para folha");
  const returned = state.contracts.filter((contract) => contract.status === "Descontando" || contractHasReturnIssue(contract));
  const rejected = state.contracts.filter(contractHasReturnIssue);
  const withoutReason = rejected.filter((contract) => !contract.returnReason);
  const reconciliation = state.lastReturnReconciliation || {};
  const returnCritical = Number(reconciliation.invalid || 0) + Number(reconciliation.notFound || 0) + Number(reconciliation.duplicate || 0) + withoutReason.length;
  const returnWarnings = Number(reconciliation.divergent || 0) + Number(reconciliation.pending || 0) + rejected.length;

  return {
    margin: {
      rows: state.employees.length,
      critical: invalidIncome.length,
      warnings: reviewEmployees.length,
      status: invalidIncome.length ? "Bloquear" : reviewEmployees.length ? "Revisar" : "Apto",
    },
    insertion: {
      rows: reserved.length,
      critical: 0,
      warnings: reserved.length,
      status: reserved.length ? "Apto com alerta" : "Sem movimento",
    },
    returnFile: {
      rows: reconciliation.totalRows || sent.length + returned.length,
      critical: returnCritical,
      warnings: returnWarnings,
      status: returnCritical ? "Bloquear" : returnWarnings ? "Revisar" : returned.length || reconciliation.totalRows ? "Apto" : "Pendente",
      detail: reconciliation.totalRows
        ? `${reconciliation.totalRows} linha(s), ${reconciliation.invalid || 0} invalida(s), ${reconciliation.notFound || 0} nao localizada(s), ${reconciliation.duplicate || 0} duplicada(s).`
        : "Nenhum retorno detalhado processado ainda.",
    },
  };
}

function getValidationDecision(metrics) {
  const entries = [
    ["Arquivo de margem", metrics.margin, "employees"],
    ["Arquivo de insercao", metrics.insertion, "import"],
    ["Arquivo retorno", metrics.returnFile, "import"],
  ];
  const blocked = entries.find(([, item]) => item.status === "Bloquear");
  const warning = entries.find(([, item]) => ["Revisar", "Apto com alerta", "Pendente"].includes(item.status));
  const current = blocked || warning || entries[entries.length - 1];

  return {
    title: current[0],
    item: current[1],
    target: current[2],
    status: blocked ? "Processamento bloqueado" : warning ? "Conferencia recomendada" : "Arquivos aptos",
  };
}

function getValidationStatusClass(status) {
  if (["Bloquear"].includes(status)) return "danger";
  if (["Revisar", "Apto com alerta", "Pendente", "Desatualizado"].includes(status)) return "warning";
  return "";
}

function fileValidationCompetency() {
  return state.conventionSettings?.payrollCompetency || today().slice(0, 7);
}

function getMarginValidationSnapshot(metrics = getFileValidationMetrics()) {
  const competency = fileValidationCompetency();
  return {
    competency,
    totalRows: metrics.margin.rows,
    critical: metrics.margin.critical,
    warnings: metrics.margin.warnings,
    blocked: metrics.margin.status === "Bloquear",
    status: metrics.margin.status,
    details: state.employees.map((employee, index) => {
      const income = Number(employee.income || 0);
      const critical = income <= 0 ? ["Renda invalida"] : [];
      const warnings = employee.status === "Em revisao" ? ["Servidor em revisao"] : [];

      return {
        line: index + 2,
        cpf: employee.cpf,
        enrollment: employee.enrollment,
        name: employee.name,
        status: critical.length ? "Bloquear" : warnings.length ? "Revisar" : "Apto",
        critical,
        warnings,
      };
    }),
  };
}

function getInsertionValidationSnapshot(metrics = getFileValidationMetrics()) {
  if (typeof validateInsertionRows === "function") {
    const validation = validateInsertionRows();
    const { processedAt, ...snapshot } = validation;
    return {
      ...snapshot,
      competency: fileValidationCompetency(),
      status: validation.blocked ? "Bloquear" : validation.warnings ? "Revisar" : validation.totalRows ? "Apto" : "Sem movimento",
    };
  }

  const reservedContracts = state.contracts.filter((contract) => marginReservationStatuses.includes(contract.status));
  return {
    competency: fileValidationCompetency(),
    totalRows: metrics.insertion.rows,
    critical: metrics.insertion.critical,
    warnings: metrics.insertion.warnings,
    blocked: metrics.insertion.status === "Bloquear",
    status: metrics.insertion.status,
    details: reservedContracts.map((contract) => ({
      contractId: contract.id,
      employeeId: contract.employeeId,
      enrollment: contract.enrollment,
      installmentValue: contract.installmentValue,
      status: "Apto com alerta",
      critical: [],
      warnings: ["Reserva aguardando geracao do arquivo de insercao"],
    })),
  };
}

function getReturnValidationSnapshot() {
  const reconciliation = state.lastReturnReconciliation;
  if (!reconciliation) return null;

  return {
    competency: fileValidationCompetency(),
    totalRows: reconciliation.totalRows || 0,
    blocked: Boolean(reconciliation.blocked),
    ok: reconciliation.ok || 0,
    invalid: reconciliation.invalid || 0,
    divergent: reconciliation.divergent || 0,
    pending: reconciliation.pending || 0,
    duplicate: reconciliation.duplicate || 0,
    notFound: reconciliation.notFound || 0,
    details: (reconciliation.details || []).map((item) => {
      const contract = state.contracts.find((contractItem) => contractItem.id === item.contractId);
      const expected = contract ? Number(contract.installment || 0) : Number(item.expected || 0);
      return {
        contractId: item.contractId,
        competency: item.competency,
        status: item.status,
        amount: Number(item.amount || 0),
        expected,
        difference: Number((Number(item.amount || 0) - expected).toFixed(2)),
        category: item.category,
      };
    }),
  };
}

function normalizeFileValidationSnapshot(value) {
  return JSON.stringify(value || null);
}

function compactFileValidationDetails(details) {
  return (details || []).map((item) => ({
    line: item.line,
    cpf: item.cpf,
    enrollment: item.enrollment,
    name: item.name,
    contractId: item.contractId,
    competency: item.competency || item.row?.competencia,
    status: item.status,
    critical: item.critical || [],
    warnings: item.warnings || [],
    row: item.row
      ? {
          contrato: item.row.contrato,
          cpf: item.row.cpf,
          matricula: item.row.matricula,
          rubrica: item.row.rubrica,
          parcela: item.row.parcela,
          prazo: item.row.prazo,
          competencia: item.row.competencia,
          acao: item.row.acao,
        }
      : undefined,
  }));
}

function getFileValidationFreshness(kind, currentSnapshot) {
  const evidenceByKind = {
    margin: state.lastMarginValidation,
    insertion: state.lastInsertionValidation,
    returnFile: state.lastReturnReconciliation,
  };
  const evidence = evidenceByKind[kind];
  if (!evidence) {
    return {
      fresh: false,
      label: "Pendente",
      detail: "Registre a validacao para congelar o snapshot da competencia.",
    };
  }

  let current = currentSnapshot || (
    kind === "margin"
      ? getMarginValidationSnapshot()
      : kind === "insertion"
        ? getInsertionValidationSnapshot()
        : getReturnValidationSnapshot()
  );
  const evidenceSnapshot = kind === "returnFile"
    ? {
        competency: evidence.competency || fileValidationCompetency(),
        totalRows: evidence.totalRows || 0,
        blocked: Boolean(evidence.blocked),
        ok: evidence.ok || 0,
        invalid: evidence.invalid || 0,
        divergent: evidence.divergent || 0,
        pending: evidence.pending || 0,
        duplicate: evidence.duplicate || 0,
        notFound: evidence.notFound || 0,
        details: (evidence.details || []).map((item) => ({
          contractId: item.contractId,
          competency: item.competency,
          status: item.status,
          amount: Number(item.amount || 0),
          expected: Number(item.expected || 0),
          difference: Number(item.difference || 0),
          category: item.category,
        })),
      }
    : {
        competency: evidence.competency || fileValidationCompetency(),
        totalRows: evidence.totalRows,
        critical: evidence.critical,
        warnings: evidence.warnings,
        blocked: Boolean(evidence.blocked),
        status: evidence.status || (evidence.blocked ? "Bloquear" : evidence.warnings ? "Revisar" : evidence.totalRows ? "Apto" : "Sem movimento"),
        details: compactFileValidationDetails(evidence.details),
      };
  if (current && kind !== "returnFile") {
    current = {
      competency: current.competency || fileValidationCompetency(),
      totalRows: current.totalRows,
      critical: current.critical,
      warnings: current.warnings,
      blocked: Boolean(current.blocked),
      status: current.status || (current.blocked ? "Bloquear" : current.warnings ? "Revisar" : current.totalRows ? "Apto" : "Sem movimento"),
      details: compactFileValidationDetails(current.details),
    };
  }
  const changed = normalizeFileValidationSnapshot(evidenceSnapshot) !== normalizeFileValidationSnapshot(current);

  return {
    fresh: !changed,
    label: changed ? "Desatualizado" : evidenceSnapshot.status || (evidenceSnapshot.blocked ? "Bloqueado" : "Registrado"),
    detail: changed
      ? "Os dados atuais mudaram depois do ultimo snapshot. Registre a validacao novamente."
      : `${evidence.processedAt || "data nao informada"} - ${evidenceSnapshot.totalRows} item(ns), ${evidenceSnapshot.critical || evidenceSnapshot.invalid || 0} erro(s), ${evidenceSnapshot.warnings || evidenceSnapshot.divergent || 0} alerta(s).`,
  };
}

function recordFileValidationSnapshot() {
  const metrics = getFileValidationMetrics();
  const marginSnapshot = getMarginValidationSnapshot(metrics);
  const insertionSnapshot = getInsertionValidationSnapshot(metrics);

  state.lastMarginValidation = {
    ...marginSnapshot,
    processedAt: today(),
  };

  state.lastInsertionValidation = {
    ...insertionSnapshot,
    processedAt: today(),
  };

  auditEvent(
    `Validacao dos arquivos registrada: margem ${metrics.margin.rows} linha(s), ${metrics.margin.critical} erro(s), ${metrics.margin.warnings} alerta(s); insercao ${metrics.insertion.rows} item(ns), ${metrics.insertion.warnings} alerta(s).`,
    "Validacao de arquivos"
  );
  saveState();
  render();
  openView("validation");
}

function ensureFileValidationView() {
  if (document.getElementById("validation-view")) return;

  const nav = document.querySelector(".nav-list");
  const importButton = document.querySelector('[data-view="import"]');
  const payrollButton = document.querySelector('[data-view="payroll"]');
  const button = document.createElement("button");
  button.className = "nav-item";
  button.dataset.view = "validation";
  button.type = "button";
  button.textContent = "Validacao";
  button.addEventListener("click", () => openView("validation"));
  nav?.insertBefore(button, importButton?.nextSibling || payrollButton || null);

  document.querySelector(".main-panel")?.insertAdjacentHTML(
    "beforeend",
    `
      <section class="view" id="validation-view" aria-labelledby="validation-title">
        <div class="section-heading row-heading">
          <div>
            <h2 id="validation-title">Validacao de arquivos da folha</h2>
            <p>Confira campos obrigatorios, erros criticos e alertas antes de processar a competencia.</p>
          </div>
          <button class="primary-button" id="validation-audit-button" type="button">Registrar validacao</button>
        </div>

        <section class="panel validation-command" id="validation-command"></section>

        <div class="validation-summary-grid" id="validation-summary-grid"></div>

        <section class="panel validation-panel">
          <div class="panel-heading">
            <h3>Regras por tipo de arquivo</h3>
          </div>
          <div class="validation-schema-list" id="validation-schema-list"></div>
        </section>

        <div class="content-grid validation-content">
          <section class="panel">
            <div class="panel-heading">
              <h3>Resultado da competencia</h3>
            </div>
            <div class="validation-result-list" id="validation-result-list"></div>
          </section>

          <section class="panel">
            <div class="panel-heading">
              <h3>Politica de bloqueio</h3>
            </div>
            <div class="validation-result-list" id="validation-policy-list"></div>
          </section>
        </div>
      </section>
    `
  );

  document.getElementById("validation-audit-button")?.addEventListener("click", recordFileValidationSnapshot);
}

function renderFileValidation() {
  ensureFileValidationView();

  const summary = document.getElementById("validation-summary-grid");
  const command = document.getElementById("validation-command");
  const schemaList = document.getElementById("validation-schema-list");
  const resultList = document.getElementById("validation-result-list");
  const policyList = document.getElementById("validation-policy-list");
  if (!summary || !command || !schemaList || !resultList || !policyList) return;

  const schemas = getFileValidationSchemas();
  const metrics = getFileValidationMetrics();
  const decision = getValidationDecision(metrics);
  const marginEvidence = state.lastMarginValidation;
  const insertionEvidence = state.lastInsertionValidation;
  const returnEvidence = state.lastReturnReconciliation;
  const marginFreshness = getFileValidationFreshness("margin", getMarginValidationSnapshot(metrics));
  const insertionFreshness = getFileValidationFreshness("insertion", getInsertionValidationSnapshot(metrics));
  const returnFreshness = returnEvidence
    ? getFileValidationFreshness("returnFile", getReturnValidationSnapshot())
    : { label: "Pendente", detail: "Nenhum retorno detalhado processado ainda." };
  const totals = Object.values(metrics).reduce(
    (acc, item) => ({
      rows: acc.rows + item.rows,
      critical: acc.critical + item.critical,
      warnings: acc.warnings + item.warnings,
    }),
    { rows: 0, critical: 0, warnings: 0 }
  );

  command.innerHTML = `
    <div>
      <span class="validation-command-label">${decision.status}</span>
      <strong>${decision.title}</strong>
      <p>${decision.item.detail || `${decision.item.rows} item(ns), ${decision.item.critical} erro(s) critico(s), ${decision.item.warnings} alerta(s).`}</p>
    </div>
    <div class="validation-command-actions">
      <span class="status ${getValidationStatusClass(decision.item.status)}">${decision.item.status}</span>
      <button class="primary-button validation-next-action" data-target-view="${decision.target}" type="button">Abrir modulo</button>
    </div>
  `;

  summary.innerHTML = [
    { label: "Tipos validados", value: schemas.length },
    { label: "Linhas/itens avaliados", value: totals.rows },
    { label: "Erros criticos", value: totals.critical },
    { label: "Alertas", value: totals.warnings },
    {
      label: "Evidencia margem",
      value: marginEvidence ? marginFreshness.label : "Pendente",
      detail: marginEvidence
        ? marginFreshness.detail
        : "Clique em Registrar validacao para gerar o snapshot.",
    },
    {
      label: "Evidencia insercao",
      value: insertionEvidence ? insertionFreshness.label : "Pendente",
      detail: insertionEvidence
        ? insertionFreshness.detail
        : "Reservas validadas antes da geracao do arquivo.",
    },
    {
      label: "Evidencia retorno",
      value: returnEvidence ? returnFreshness.label : "Pendente",
      detail: returnEvidence ? returnFreshness.detail : "Retorno conciliado gera evidencia propria.",
    },
  ]
    .map(
      (item) => `
        <article class="validation-summary-card">
          <span>${item.label}</span>
          <strong>${item.value}</strong>
          ${item.detail ? `<small>${item.detail}</small>` : ""}
        </article>
      `
    )
    .join("");

  schemaList.innerHTML = schemas
    .map(
      (schema) => `
        <article class="validation-schema-card">
          <div>
            <strong>${schema.type}</strong>
            <span>${schema.stage}</span>
          </div>
          <p><strong>Obrigatorios:</strong> ${schema.required.join(", ")}.</p>
          <p><strong>Criticos:</strong> ${schema.critical.join("; ")}.</p>
          <p><strong>Alertas:</strong> ${schema.warnings.join("; ")}.</p>
        </article>
      `
    )
    .join("");

  resultList.innerHTML = [
    ["Arquivo de margem", metrics.margin],
    ["Arquivo de insercao", metrics.insertion],
    ["Arquivo retorno", metrics.returnFile],
  ]
    .map(
      ([label, item]) => `
        <div class="validation-result">
          <div>
            <strong>${label}</strong>
            <span>${item.rows} item(ns), ${item.critical} erro(s) critico(s), ${item.warnings} alerta(s).</span>
            ${item.detail ? `<small>${item.detail}</small>` : ""}
          </div>
          <span class="status ${getValidationStatusClass(item.status)}">${item.status}</span>
        </div>
      `
    )
    .join("");

  document.querySelector(".validation-next-action")?.addEventListener("click", (event) => {
    openView(event.currentTarget.dataset.targetView);
  });

  policyList.innerHTML = `
    <div class="validation-policy">
      <strong>Erro critico bloqueia processamento</strong>
      <span>CPF, matricula, contrato, valor e status precisam ser validos antes de gravar movimentacao.</span>
    </div>
    <div class="validation-policy">
      <strong>Alerta exige conferencia</strong>
      <span>Itens em revisao, retorno nao descontado e divergencia leve devem virar pendencia operacional.</span>
    </div>
    <div class="validation-policy">
      <strong>Resultado precisa ser auditado</strong>
      <span>Guardar usuario, horario, arquivo, versao do layout, totais e motivo de bloqueio.</span>
    </div>
  `;
}

const fileValidationStyle = document.createElement("style");
fileValidationStyle.textContent = `
  .validation-summary-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(150px, 1fr));
    gap: 14px;
    margin-bottom: 18px;
  }
  .validation-command {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(220px, 300px);
    gap: 16px;
    align-items: center;
    margin-bottom: 18px;
    background: linear-gradient(135deg, #f8fafc, #eef6ff);
  }
  .validation-command-label {
    display: block;
    color: var(--muted);
    font-size: 13px;
    font-weight: 700;
    margin-bottom: 6px;
  }
  .validation-command strong {
    display: block;
    font-size: 20px;
  }
  .validation-command p {
    margin: 6px 0 0;
    color: var(--muted);
    line-height: 1.4;
  }
  .validation-command-actions {
    display: grid;
    gap: 10px;
  }
  .validation-summary-card,
  .validation-schema-card,
  .validation-result,
  .validation-policy {
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface-2);
  }
  .validation-summary-card {
    padding: 16px;
    box-shadow: var(--shadow);
  }
  .validation-summary-card span,
  .validation-summary-card small,
  .validation-schema-card span,
  .validation-schema-card p,
  .validation-result span,
  .validation-result small,
  .validation-policy span {
    display: block;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.4;
  }
  .validation-summary-card strong {
    display: block;
    margin-top: 8px;
    font-size: 24px;
  }
  .validation-summary-card small {
    margin-top: 6px;
  }
  .validation-panel,
  .validation-content {
    margin-top: 18px;
  }
  .validation-schema-list,
  .validation-result-list {
    display: grid;
    gap: 10px;
  }
  .validation-schema-card {
    display: grid;
    grid-template-columns: 0.8fr 1fr;
    gap: 8px 14px;
    padding: 12px;
  }
  .validation-schema-card p {
    margin: 0;
  }
  .validation-schema-card p strong {
    color: var(--text);
    font-size: 13px;
  }
  .validation-result {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 12px;
    align-items: center;
    padding: 12px;
  }
  .validation-policy {
    padding: 12px;
  }
  .validation-policy span {
    margin-top: 4px;
  }
  @media (max-width: 1040px) {
    .validation-summary-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .validation-schema-card {
      grid-template-columns: 1fr;
    }
    .validation-command {
      grid-template-columns: 1fr;
    }
  }
  @media (max-width: 640px) {
    .validation-summary-grid,
    .validation-result {
      grid-template-columns: 1fr;
    }
  }
`;
document.head.appendChild(fileValidationStyle);

const renderBeforeFileValidation = render;
render = function renderWithFileValidation() {
  renderBeforeFileValidation();
  renderFileValidation();
};

render();
