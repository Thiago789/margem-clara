if (!pageTitles.rules) {
  pageTitles.rules = "Regras de negocio";
}

if (!profileConfig.manager.views.includes("rules")) {
  const settingsIndex = profileConfig.manager.views.indexOf("settings");
  const insertAt = settingsIndex >= 0 ? settingsIndex : profileConfig.manager.views.length;
  profileConfig.manager.views.splice(insertAt, 0, "rules");
}

function ensureBusinessRulesView() {
  if (document.getElementById("rules-view")) return;

  const nav = document.querySelector(".nav-list");
  const settingsButton = document.querySelector('[data-view="settings"]');
  const auditButton = document.querySelector('[data-view="audit"]');
  const button = document.createElement("button");
  button.className = "nav-item";
  button.dataset.view = "rules";
  button.type = "button";
  button.textContent = "Regras";
  button.addEventListener("click", () => openView("rules"));
  nav?.insertBefore(button, settingsButton || auditButton || null);

  document.querySelector(".main-panel")?.insertAdjacentHTML(
    "beforeend",
    `
      <section class="view" id="rules-view" aria-labelledby="rules-title">
        <div class="section-heading row-heading">
          <div>
            <h2 id="rules-title">Regras de negocio</h2>
            <p>Base inicial para transformar o MVP em um motor de regras configuravel por convenio.</p>
          </div>
          <button class="primary-button" id="rules-audit-button" type="button">Registrar revisao</button>
        </div>

        <div class="rules-score-grid" id="rules-score-grid"></div>

        <section class="panel rules-matrix-panel">
          <div class="panel-heading">
            <h3>Matriz de regras basicas</h3>
          </div>
          <div class="rules-matrix" id="rules-matrix"></div>
        </section>

        <div class="content-grid rules-content">
          <section class="panel">
            <div class="panel-heading">
              <h3>Decisoes configuraveis</h3>
            </div>
            <div class="rules-list" id="rules-configurable"></div>
          </section>

          <section class="panel">
            <div class="panel-heading">
              <h3>Proximas regras para implementar</h3>
            </div>
            <div class="rules-list" id="rules-next"></div>
          </section>
        </div>
      </section>
    `
  );

  document.getElementById("rules-audit-button")?.addEventListener("click", () => {
    auditEvent("Revisao da matriz de regras de negocio registrada.", "Regras de negocio");
    saveState();
    render();
    openView("rules");
  });
}

function getBusinessRuleRows() {
  const policy = state.conventionPolicy || {};
  const requiresCode = policy.requireAuthorizationForReservation;
  const reserved = state.contracts.filter((contract) => marginReservationStatuses.includes(contract.status)).length;
  const sentToPayroll = state.contracts.filter((contract) => contract.status === "Enviado para folha").length;
  const returnIssues = state.contracts.filter(contractHasReturnIssue).length;
  const reviewEmployees = state.employees.filter((employee) => employee.status === "Em revisao").length;

  return [
    {
      area: "Calculo de margem",
      current: "Base simples: renda base menos descontos obrigatorios, aplicando percentual de margem.",
      status: "Parcial",
      className: "warning",
      next: "Permitir percentuais por produto, rubrica e convenio.",
    },
    {
      area: "Reserva",
      current: requiresCode ? "Reserva exige codigo ativo do servidor." : "Reserva imediata liberada para consignataria credenciada.",
      status: "Configuravel",
      className: "",
      next: "Adicionar validade da reserva, cancelamento automatico e motivo obrigatorio.",
    },
    {
      area: "Arquivo de margem",
      current: "Importa servidores, renda, descontos obrigatorios e status.",
      status: "MVP",
      className: "",
      next: "Validar layout por convenio e rejeitar linhas inconsistentes.",
    },
    {
      area: "Arquivo de insercao",
      current: `${reserved} reserva(s) entram como descontos para envio a folha.`,
      status: "MVP",
      className: "",
      next: "Gerar lote por competencia, rubrica e tipo de operacao.",
    },
    {
      area: "Arquivo retorno",
      current: `${sentToPayroll} enviado(s) e ${returnIssues} pendencia(s) de retorno no estado atual.`,
      status: returnIssues ? "Atencao" : "MVP",
      className: returnIssues ? "warning" : "",
      next: "Criar tabela de motivos, reprocessamento e notificacao automatica.",
    },
    {
      area: "Servidor em revisao",
      current: `${reviewEmployees} servidor(es) com situacao que exige conferencia.`,
      status: reviewEmployees ? "Atencao" : "MVP",
      className: reviewEmployees ? "warning" : "",
      next: "Bloquear novas reservas conforme regra do convenio.",
    },
    {
      area: "Auditoria",
      current: "Registra eventos operacionais principais.",
      status: "Parcial",
      className: "warning",
      next: "Tornar trilha imutavel com usuario, IP, antes/depois e correlacao.",
    },
  ];
}

function renderBusinessRules() {
  ensureBusinessRulesView();

  const scoreGrid = document.getElementById("rules-score-grid");
  const matrix = document.getElementById("rules-matrix");
  const configurable = document.getElementById("rules-configurable");
  const next = document.getElementById("rules-next");
  if (!scoreGrid || !matrix || !configurable || !next) return;

  const rows = getBusinessRuleRows();
  const completed = rows.filter((row) => row.status === "MVP" || row.status === "Configuravel").length;
  const attention = rows.filter((row) => row.className === "warning" || row.className === "danger").length;
  const configuredPolicy = state.conventionPolicy?.requireAuthorizationForReservation
    ? "Codigo obrigatorio"
    : "Reserva imediata";

  scoreGrid.innerHTML = [
    ["Regras mapeadas", rows.length],
    ["Cobertura MVP", `${Math.round((completed / rows.length) * 100)}%`],
    ["Pontos de atencao", attention],
    ["Politica atual", configuredPolicy],
  ]
    .map(
      ([label, value]) => `
        <article class="panel rules-score-card">
          <span>${label}</span>
          <strong>${value}</strong>
        </article>
      `
    )
    .join("");

  matrix.innerHTML = rows
    .map(
      (row) => `
        <article class="rules-row">
          <div>
            <strong>${row.area}</strong>
            <p>${row.current}</p>
          </div>
          <span class="status ${row.className}">${row.status}</span>
          <small>${row.next}</small>
        </article>
      `
    )
    .join("");

  const configurableItems = [
    ["Percentual de margem", "Hoje existe configuracao do convenio, mas o motor deve permitir regra por produto."],
    ["Exigencia de codigo", "Pode ser obrigatorio ou opcional por convenio."],
    ["Validade da autorizacao", "Define por quanto tempo o codigo pode liberar consulta ou reserva."],
    ["Layouts de arquivo", "Nomes e formatos devem variar por convenio e folha."],
  ];

  configurable.innerHTML = configurableItems
    .map(
      ([title, description]) => `
        <div class="rules-note">
          <strong>${title}</strong>
          <span>${description}</span>
        </div>
      `
    )
    .join("");

  const nextItems = [
    ["Prioridade de desconto", "Definir o que acontece quando o retorno informa margem insuficiente."],
    ["Refinanciamento e portabilidade", "Separar nova reserva, troca de contrato, liquidacao e alteracao de parcela."],
    ["Bloqueio de servidor", "Bloquear por ordem judicial, afastamento, revisao cadastral ou contestacao critica."],
    ["Cancelamento automatico", "Expirar reserva nao enviada ou nao confirmada dentro do prazo."],
  ];

  next.innerHTML = nextItems
    .map(
      ([title, description]) => `
        <div class="rules-note">
          <strong>${title}</strong>
          <span>${description}</span>
        </div>
      `
    )
    .join("");
}

const rulesStyle = document.createElement("style");
rulesStyle.textContent = `
  .rules-score-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
  }
  .rules-score-card {
    min-height: 110px;
  }
  .rules-score-card span {
    display: block;
    color: var(--muted);
    font-size: 13px;
    margin-bottom: 10px;
  }
  .rules-score-card strong {
    font-size: 26px;
  }
  .rules-matrix-panel,
  .rules-content {
    margin-top: 18px;
  }
  .rules-matrix,
  .rules-list {
    display: grid;
    gap: 12px;
  }
  .rules-row {
    display: grid;
    grid-template-columns: minmax(0, 1.5fr) auto minmax(220px, 1fr);
    align-items: center;
    gap: 14px;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface-soft);
  }
  .rules-row p,
  .rules-row small,
  .rules-note span {
    margin: 4px 0 0;
    color: var(--muted);
    font-size: 13px;
  }
  .rules-note {
    display: grid;
    gap: 4px;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface-soft);
  }
  @media (max-width: 1100px) {
    .rules-score-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .rules-row {
      grid-template-columns: 1fr;
      align-items: start;
    }
  }
  @media (max-width: 720px) {
    .rules-score-grid {
      grid-template-columns: 1fr;
    }
  }
`;
document.head.appendChild(rulesStyle);

const renderBeforeBusinessRules = render;
render = function renderWithBusinessRules() {
  renderBeforeBusinessRules();
  ensureBusinessRulesView();
  renderBusinessRules();
};

render();
