if (!pageTitles.integrations) {
  pageTitles.integrations = "Integracoes";
}

["manager", "lender"].forEach((profile) => {
  if (!profileConfig[profile].views.includes("integrations")) {
    const auditIndex = profileConfig[profile].views.indexOf("audit");
    const insertAt = auditIndex >= 0 ? auditIndex : profileConfig[profile].views.length;
    profileConfig[profile].views.splice(insertAt, 0, "integrations");
  }
});

function ensureIntegrationView() {
  if (document.getElementById("integrations-view")) return;

  const nav = document.querySelector(".nav-list");
  const auditButton = document.querySelector('[data-view="audit"]');
  const button = document.createElement("button");
  button.className = "nav-item";
  button.dataset.view = "integrations";
  button.type = "button";
  button.textContent = "Integracoes";
  button.addEventListener("click", () => openView("integrations"));
  nav?.insertBefore(button, auditButton || null);

  document.querySelector(".main-panel")?.insertAdjacentHTML(
    "beforeend",
    `
      <section class="view" id="integrations-view" aria-labelledby="integrations-title">
        <div class="section-heading row-heading">
          <div>
            <h2 id="integrations-title">Integracoes</h2>
            <p>Mapa inicial para APIs, folha de pagamento, consignatarias e eventos externos.</p>
          </div>
          <button class="primary-button" id="sync-integrations" type="button">Simular sincronizacao</button>
        </div>

        <div class="integration-grid" id="integration-grid"></div>

        <div class="content-grid integration-content">
          <section class="panel">
            <div class="panel-heading">
              <h3>Endpoints planejados</h3>
            </div>
            <div class="endpoint-list">
              <div><code>GET /api/servidores/{cpf}/margem</code><span>Consulta margem autorizada.</span></div>
              <div><code>POST /api/reservas</code><span>Cria reserva conforme politica do convenio.</span></div>
              <div><code>POST /api/folha/insercoes</code><span>Envia descontos para folha.</span></div>
              <div><code>POST /api/folha/retornos</code><span>Recebe retorno de processamento.</span></div>
            </div>
          </section>

          <section class="panel">
            <div class="panel-heading">
              <h3>Webhooks</h3>
            </div>
            <div class="flow-list">
              <div><strong>margem.atualizada</strong><span>Disparado apos importacao da folha.</span></div>
              <div><strong>reserva.criada</strong><span>Informa nova reserva para auditoria e parceiros.</span></div>
              <div><strong>contrato.retornado</strong><span>Notifica aceite, rejeicao ou nao desconto.</span></div>
            </div>
          </section>
        </div>

        <section class="panel security-panel">
          <div class="panel-heading">
            <h3>Controles minimos antes de integrar dados reais</h3>
          </div>
          <div class="security-checklist" id="integration-security"></div>
        </section>
      </section>
    `
  );

  document.getElementById("sync-integrations")?.addEventListener("click", simulateIntegrationSync);
}

function renderIntegrations() {
  ensureIntegrationView();

  const grid = document.getElementById("integration-grid");
  const checklist = document.getElementById("integration-security");
  if (!grid || !checklist) return;

  const sentToPayroll = state.contracts.filter((contract) => contract.status === "Enviado para folha").length;
  const pendingReturns = state.contracts.filter((contract) => ["Enviado para folha", "Nao descontado"].includes(contract.status)).length;
  const activeAuthorizations = state.authorizationCodes.filter((authorization) => authorization.status === "Ativo").length;

  const cards = [
    {
      title: "Folha de pagamento",
      status: sentToPayroll ? "Pendente retorno" : "Pronto para homologar",
      detail: `${sentToPayroll} desconto(s) enviados para processamento.`,
      className: sentToPayroll ? "warning" : "",
    },
    {
      title: "Consignatarias",
      status: "API planejada",
      detail: "Consulta, simulacao e reserva com autorizacao do servidor.",
      className: "",
    },
    {
      title: "Webhooks",
      status: pendingReturns ? "Eventos pendentes" : "Modelo definido",
      detail: `${pendingReturns} evento(s) aguardam consolidacao operacional.`,
      className: pendingReturns ? "warning" : "",
    },
    {
      title: "Autorizacoes",
      status: activeAuthorizations ? "Codigos ativos" : "Sem codigos ativos",
      detail: `${activeAuthorizations} codigo(s) podem liberar consulta ou reserva.`,
      className: activeAuthorizations ? "" : "warning",
    },
  ];

  grid.innerHTML = cards
    .map(
      (card) => `
        <article class="panel integration-card">
          <span>${card.title}</span>
          <strong><span class="status ${card.className}">${card.status}</span></strong>
          <p>${card.detail}</p>
        </article>
      `
    )
    .join("");

  const controls = [
    ["OAuth2 ou chaves por instituicao", "Cada parceiro deve ter credencial propria, escopo e data de expiracao."],
    ["Assinatura de payload", "Arquivos, callbacks e webhooks precisam ter integridade verificavel."],
    ["Rate limit e trilha de auditoria", "Toda consulta de margem deve registrar quem consultou, quando e por qual motivo."],
    ["Homologacao por convenio", "Layout, rubricas, retorno e regras de reserva devem ser configurados antes da producao."],
  ];

  checklist.innerHTML = controls
    .map(
      ([title, description]) => `
        <div class="security-item">
          <strong>${title}</strong>
          <span>${description}</span>
        </div>
      `
    )
    .join("");
}

function simulateIntegrationSync() {
  auditEvent("Sincronizacao de integracoes simulada para validacao do MVP.", "Integracoes");
  saveState();
  render();
  openView("integrations");
}

const integrationStyle = document.createElement("style");
integrationStyle.textContent = `
  .integration-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
  }
  .integration-card {
    min-height: 132px;
  }
  .integration-card > span {
    display: block;
    color: var(--muted);
    font-size: 13px;
    margin-bottom: 8px;
  }
  .integration-card strong {
    display: block;
    margin-bottom: 10px;
  }
  .integration-card p {
    margin: 0;
    color: var(--muted);
    font-size: 13px;
  }
  .integration-content {
    margin-top: 18px;
  }
  .endpoint-list,
  .security-checklist {
    display: grid;
    gap: 12px;
  }
  .endpoint-list div,
  .security-item {
    display: grid;
    gap: 4px;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface-soft);
  }
  .endpoint-list code {
    font-size: 13px;
    white-space: normal;
    word-break: break-word;
  }
  .endpoint-list span,
  .security-item span {
    color: var(--muted);
    font-size: 13px;
  }
  .security-panel {
    margin-top: 18px;
  }
  @media (max-width: 1100px) {
    .integration-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 720px) {
    .integration-grid {
      grid-template-columns: 1fr;
    }
  }
`;
document.head.appendChild(integrationStyle);

const renderBeforeIntegrations = render;
render = function renderWithIntegrations() {
  renderBeforeIntegrations();
  ensureIntegrationView();
  renderIntegrations();
};

render();
