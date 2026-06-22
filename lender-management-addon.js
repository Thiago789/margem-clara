if (!pageTitles.lenders) {
  pageTitles.lenders = "Consignatarias";
}

["manager", "lender"].forEach((profile) => {
  if (!profileConfig[profile].views.includes("lenders")) {
    const integrationsIndex = profileConfig[profile].views.indexOf("integrations");
    const contractsIndex = profileConfig[profile].views.indexOf("contracts");
    const insertAt = integrationsIndex >= 0 ? integrationsIndex : contractsIndex + 1;
    profileConfig[profile].views.splice(insertAt, 0, "lenders");
  }
});

function getLenderManagementRows() {
  return lenders.map((lender, index) => {
    const contracts = state.contracts.filter((contract) => contract.lenderId === lender.id);
    const reserved = contracts.filter((contract) => marginReservationStatuses.includes(contract.status)).length;
    const active = contracts.filter((contract) => marginUsageStatuses.includes(contract.status) && contract.status !== "Enviado para folha").length;
    const sent = contracts.filter((contract) => contract.status === "Enviado para folha").length;
    const rejected = contracts.filter(contractHasReturnIssue).length;
    const statuses = ["Homologada", "Em homologacao", "Ativa", "Pendente de contrato"];
    const integration = ["API ativa", "Arquivo manual", "API em teste", "Sem integracao"];
    const products = index === 0
      ? ["Emprestimo", "Cartao"]
      : index === 1
        ? ["Emprestimo"]
        : ["Emprestimo", "Refinanciamento"];

    return {
      ...lender,
      contracts,
      reserved,
      active,
      sent,
      rejected,
      status: statuses[index] || "Ativa",
      integration: integration[index] || "Arquivo manual",
      products,
      needsAttention: rejected > 0 || sent > 0 || statuses[index] !== "Ativa" && statuses[index] !== "Homologada",
    };
  });
}

function ensureLenderManagementView() {
  if (document.getElementById("lenders-view")) return;

  const nav = document.querySelector(".nav-list");
  const integrationsButton = document.querySelector('[data-view="integrations"]');
  const auditButton = document.querySelector('[data-view="audit"]');
  const button = document.createElement("button");
  button.className = "nav-item";
  button.dataset.view = "lenders";
  button.type = "button";
  button.textContent = "Consignatarias";
  button.addEventListener("click", () => openView("lenders"));
  nav?.insertBefore(button, integrationsButton || auditButton || null);

  document.querySelector(".main-panel")?.insertAdjacentHTML(
    "beforeend",
    `
      <section class="view" id="lenders-view" aria-labelledby="lenders-title">
        <div class="section-heading row-heading">
          <div>
            <h2 id="lenders-title">Consignatarias e credenciamento</h2>
            <p>Controle instituicoes, produtos liberados, integracao e pendencias operacionais.</p>
          </div>
          <button class="primary-button" id="lenders-audit-button" type="button">Registrar avaliacao</button>
        </div>

        <div class="lender-summary-grid" id="lender-summary-grid"></div>

        <section class="panel lender-panel">
          <div class="panel-heading">
            <h3>Instituicoes credenciadas</h3>
          </div>
          <div class="lender-list" id="lender-list"></div>
        </section>

        <div class="content-grid lender-content">
          <section class="panel">
            <div class="panel-heading">
              <h3>Controles obrigatorios</h3>
            </div>
            <div class="lender-notes" id="lender-controls"></div>
          </section>

          <section class="panel">
            <div class="panel-heading">
              <h3>Riscos a acompanhar</h3>
            </div>
            <div class="lender-notes" id="lender-risks"></div>
          </section>
        </div>
      </section>
    `
  );

  document.getElementById("lenders-audit-button")?.addEventListener("click", () => {
    auditEvent("Avaliacao de consignatarias e credenciamento registrada.", "Consignatarias");
    saveState();
    render();
    openView("lenders");
  });
}

function renderLenderManagement() {
  ensureLenderManagementView();

  const summary = document.getElementById("lender-summary-grid");
  const list = document.getElementById("lender-list");
  const controls = document.getElementById("lender-controls");
  const risks = document.getElementById("lender-risks");
  if (!summary || !list || !controls || !risks) return;

  const rows = state.currentProfile === "lender"
    ? getLenderManagementRows().filter((row) => row.id === "lender-1")
    : getLenderManagementRows();
  const activeLenders = rows.filter((row) => ["Ativa", "Homologada"].includes(row.status)).length;
  const withApi = rows.filter((row) => row.integration.includes("API")).length;
  const attention = rows.filter((row) => row.needsAttention).length;
  const totalContracts = rows.reduce((sum, row) => sum + row.contracts.length, 0);

  const cards = [
    ["Instituicoes", rows.length],
    ["Ativas/homologadas", activeLenders],
    ["Com API", withApi],
    ["Em atencao", attention],
  ];

  summary.innerHTML = cards
    .map(
      ([label, value]) => `
        <article class="lender-summary-card">
          <span>${label}</span>
          <strong>${value}</strong>
        </article>
      `
    )
    .join("");

  list.innerHTML = rows
    .map((row) => {
      const statusClass = row.needsAttention ? "warning" : "";
      return `
        <article class="lender-row">
          <div>
            <strong>${row.name}</strong>
            <span>Taxa ref. ${row.rate.toFixed(2)}% - CET ${row.cet.toFixed(2)}%</span>
          </div>
          <div>
            <span>Status</span>
            <strong class="status ${statusClass}">${row.status}</strong>
          </div>
          <div>
            <span>Integracao</span>
            <strong>${row.integration}</strong>
          </div>
          <div>
            <span>Contratos</span>
            <strong>${row.contracts.length}</strong>
          </div>
          <p>
            Produtos: ${row.products.join(", ")}.
            ${row.reserved} reserva(s), ${row.sent} aguardando retorno, ${row.active} ativo(s), ${row.rejected} com pendencia.
          </p>
        </article>
      `;
    })
    .join("");

  controls.innerHTML = `
    <div class="lender-note">
      <strong>Credenciamento</strong>
      <span>Registrar contrato, produtos permitidos, limite operacional e vigencia por instituicao.</span>
    </div>
    <div class="lender-note">
      <strong>Integracao</strong>
      <span>Definir se a operacao sera por API, arquivo ou fluxo manual supervisionado.</span>
    </div>
    <div class="lender-note">
      <strong>Permissoes</strong>
      <span>Consignataria deve enxergar apenas suas operacoes, reservas e retornos.</span>
    </div>
  `;

  risks.innerHTML = `
    <div class="lender-note">
      <strong>Uso indevido de margem</strong>
      <span>Validar codigo/autorizacao do servidor antes de consulta sensivel ou reserva.</span>
    </div>
    <div class="lender-note">
      <strong>Fila de retorno</strong>
      <span>${totalContracts} contrato(s) no escopo atual precisam manter trilha de status e retorno da folha.</span>
    </div>
    <div class="lender-note">
      <strong>Homologacao</strong>
      <span>Instituicoes em teste nao devem afetar folha real ate concluir validacao.</span>
    </div>
  `;
}

const lenderStyle = document.createElement("style");
lenderStyle.textContent = `
  .lender-summary-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(150px, 1fr));
    gap: 14px;
    margin-bottom: 18px;
  }
  .lender-summary-card,
  .lender-row,
  .lender-note {
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
  }
  .lender-summary-card {
    padding: 16px;
    box-shadow: var(--shadow);
  }
  .lender-summary-card span,
  .lender-row span,
  .lender-row p,
  .lender-note span {
    display: block;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.4;
  }
  .lender-summary-card strong {
    display: block;
    margin-top: 8px;
    font-size: 26px;
  }
  .lender-list,
  .lender-notes {
    display: grid;
    gap: 10px;
  }
  .lender-row {
    display: grid;
    grid-template-columns: 1.5fr 0.9fr 0.9fr 0.6fr;
    gap: 12px;
    align-items: center;
    padding: 12px;
    background: var(--surface-2);
  }
  .lender-row p {
    grid-column: 1 / -1;
    margin: 0;
  }
  .lender-note {
    padding: 12px;
    background: var(--surface-2);
  }
  .lender-note span {
    margin-top: 4px;
  }
  @media (max-width: 1040px) {
    .lender-summary-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .lender-row {
      grid-template-columns: 1fr 1fr;
    }
  }
  @media (max-width: 640px) {
    .lender-summary-grid,
    .lender-row {
      grid-template-columns: 1fr;
    }
  }
`;
document.head.appendChild(lenderStyle);

const renderBeforeLenderManagement = render;
render = function renderWithLenderManagement() {
  renderBeforeLenderManagement();
  renderLenderManagement();
};

render();
