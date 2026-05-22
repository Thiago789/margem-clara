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
      required: ["contrato", "status", "motivo", "valor_descontado"],
      critical: ["contrato nao localizado", "status desconhecido", "valor divergente", "rejeicao sem motivo"],
      warnings: ["nao descontado", "retorno parcial", "competencia diferente da enviada"],
    },
  ];
}

function getFileValidationMetrics() {
  const reviewEmployees = state.employees.filter((employee) => employee.status === "Em revisao");
  const invalidIncome = state.employees.filter((employee) => Number(employee.income || 0) <= 0);
  const reserved = state.contracts.filter((contract) => contract.status === "Reservado");
  const sent = state.contracts.filter((contract) => contract.status === "Enviado para folha");
  const returned = state.contracts.filter((contract) => ["Descontando", "Rejeitado", "Nao descontado"].includes(contract.status));
  const rejected = state.contracts.filter((contract) => ["Rejeitado", "Nao descontado"].includes(contract.status));
  const withoutReason = rejected.filter((contract) => !contract.returnReason);

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
      rows: sent.length + returned.length,
      critical: withoutReason.length,
      warnings: rejected.length,
      status: withoutReason.length ? "Bloquear" : rejected.length ? "Revisar" : returned.length ? "Apto" : "Pendente",
    },
  };
}

function getValidationStatusClass(status) {
  if (["Bloquear"].includes(status)) return "danger";
  if (["Revisar", "Apto com alerta", "Pendente"].includes(status)) return "warning";
  return "";
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

  document.getElementById("validation-audit-button")?.addEventListener("click", () => {
    auditEvent("Validacao dos arquivos da competencia registrada.", "Validacao de arquivos");
    saveState();
    render();
    openView("validation");
  });
}

function renderFileValidation() {
  ensureFileValidationView();

  const summary = document.getElementById("validation-summary-grid");
  const schemaList = document.getElementById("validation-schema-list");
  const resultList = document.getElementById("validation-result-list");
  const policyList = document.getElementById("validation-policy-list");
  if (!summary || !schemaList || !resultList || !policyList) return;

  const schemas = getFileValidationSchemas();
  const metrics = getFileValidationMetrics();
  const totals = Object.values(metrics).reduce(
    (acc, item) => ({
      rows: acc.rows + item.rows,
      critical: acc.critical + item.critical,
      warnings: acc.warnings + item.warnings,
    }),
    { rows: 0, critical: 0, warnings: 0 }
  );

  summary.innerHTML = [
    ["Tipos validados", schemas.length],
    ["Linhas/itens avaliados", totals.rows],
    ["Erros criticos", totals.critical],
    ["Alertas", totals.warnings],
  ]
    .map(
      ([label, value]) => `
        <article class="validation-summary-card">
          <span>${label}</span>
          <strong>${value}</strong>
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
          </div>
          <span class="status ${getValidationStatusClass(item.status)}">${item.status}</span>
        </div>
      `
    )
    .join("");

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
  .validation-schema-card span,
  .validation-schema-card p,
  .validation-result span,
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
