if (!pageTitles.api) {
  pageTitles.api = "API sandbox";
}

["manager", "lender"].forEach((profile) => {
  if (!profileConfig[profile].views.includes("api")) {
    const integrationsIndex = profileConfig[profile].views.indexOf("integrations");
    profileConfig[profile].views.splice(integrationsIndex >= 0 ? integrationsIndex + 1 : profileConfig[profile].views.length, 0, "api");
  }
});

function getApiSandboxEndpoints() {
  return [
    {
      method: "GET",
      path: "/api/v1/servidores/{cpf}/margem",
      owner: "Consignataria",
      status: "Planejado",
      description: "Consulta margem autorizada com escopo por convenio, servidor e finalidade.",
      payload: "{ cpf, matricula, produto, codigoAutorizacao }",
    },
    {
      method: "POST",
      path: "/api/v1/reservas",
      owner: "Consignataria",
      status: "MVP conceitual",
      description: "Cria reserva conforme regra do convenio: com codigo ou imediata.",
      payload: "{ cpf, matricula, produto, rubrica, valorParcela, prazo, instituicao }",
    },
    {
      method: "POST",
      path: "/api/v1/folha/insercoes",
      owner: "Folha",
      status: "Arquivo/API",
      description: "Recebe descontos que devem entrar, alterar ou sair da folha.",
      payload: "{ competencia, contrato, matricula, rubrica, valor, acao }",
    },
    {
      method: "POST",
      path: "/api/v1/folha/retornos",
      owner: "Folha",
      status: "Arquivo/API",
      description: "Confirma desconto, rejeicao ou nao desconto com motivo padronizado.",
      payload: "{ competencia, contrato, status, motivo, valorDescontado }",
    },
    {
      method: "POST",
      path: "/webhooks/contratos",
      owner: "Margem Clara",
      status: "Evento",
      description: "Notifica consignataria quando reserva muda para enviada, descontando ou rejeitada.",
      payload: "{ evento, contrato, status, motivo, dataProcessamento }",
    },
  ];
}

function getApiSandboxTokens() {
  return [
    {
      name: "Folha Prefeitura Modelo",
      scope: "margem:importar insercao:receber retorno:enviar",
      status: "Homologacao",
      expires: "90 dias",
    },
    {
      name: "Banco Horizonte",
      scope: "margem:consultar reserva:criar contratos:ler",
      status: "Ativo sandbox",
      expires: "30 dias",
    },
    {
      name: "CredMais Servidor",
      scope: "margem:consultar simulacao:criar",
      status: "Pendente",
      expires: "Nao emitido",
    },
  ];
}

function ensureApiSandboxView() {
  if (document.getElementById("api-view")) return;

  const nav = document.querySelector(".nav-list");
  const integrationsButton = document.querySelector('[data-view="integrations"]');
  const auditButton = document.querySelector('[data-view="audit"]');
  const button = document.createElement("button");
  button.className = "nav-item";
  button.dataset.view = "api";
  button.type = "button";
  button.textContent = "API sandbox";
  button.addEventListener("click", () => openView("api"));
  nav?.insertBefore(button, integrationsButton?.nextSibling || auditButton || null);

  document.querySelector(".main-panel")?.insertAdjacentHTML(
    "beforeend",
    `
      <section class="view" id="api-view" aria-labelledby="api-title">
        <div class="section-heading row-heading">
          <div>
            <h2 id="api-title">API sandbox</h2>
            <p>Desenhe contratos de integracao para folha, consignatarias, webhooks e auditoria.</p>
          </div>
          <button class="primary-button" id="api-audit-button" type="button">Registrar simulacao</button>
        </div>

        <div class="api-summary-grid" id="api-summary-grid"></div>

        <section class="panel api-panel">
          <div class="panel-heading">
            <h3>Contratos de API</h3>
          </div>
          <div class="api-endpoint-list" id="api-endpoint-list"></div>
        </section>

        <div class="content-grid api-content">
          <section class="panel">
            <div class="panel-heading">
              <h3>Credenciais sandbox</h3>
            </div>
            <div class="api-token-list" id="api-token-list"></div>
          </section>

          <section class="panel">
            <div class="panel-heading">
              <h3>Regras de seguranca</h3>
            </div>
            <div class="api-note-list" id="api-security-list"></div>
          </section>
        </div>
      </section>
    `
  );

  document.getElementById("api-audit-button")?.addEventListener("click", () => {
    auditEvent("Simulacao de API sandbox registrada.", "API sandbox");
    saveState();
    render();
    openView("api");
  });
}

function renderApiSandbox() {
  ensureApiSandboxView();

  const summary = document.getElementById("api-summary-grid");
  const endpointsList = document.getElementById("api-endpoint-list");
  const tokenList = document.getElementById("api-token-list");
  const securityList = document.getElementById("api-security-list");
  if (!summary || !endpointsList || !tokenList || !securityList) return;

  const endpoints = getApiSandboxEndpoints();
  const tokens = state.currentProfile === "lender"
    ? getApiSandboxTokens().filter((token) => token.name === "Banco Horizonte")
    : getApiSandboxTokens();
  const webhookCount = endpoints.filter((endpoint) => endpoint.path.includes("webhooks")).length;
  const payrollCount = endpoints.filter((endpoint) => endpoint.owner === "Folha").length;

  const cards = [
    ["Endpoints", endpoints.length],
    ["Folha/API arquivo", payrollCount],
    ["Webhooks", webhookCount],
    ["Credenciais", tokens.length],
  ];

  summary.innerHTML = cards
    .map(
      ([label, value]) => `
        <article class="api-summary-card">
          <span>${label}</span>
          <strong>${value}</strong>
        </article>
      `
    )
    .join("");

  endpointsList.innerHTML = endpoints
    .map((endpoint) => {
      const statusClass = endpoint.status === "Pendente" ? "warning" : "";
      return `
        <article class="api-endpoint-row">
          <div>
            <strong><span>${endpoint.method}</span> ${endpoint.path}</strong>
            <small>${endpoint.description}</small>
          </div>
          <div>
            <span>Dono</span>
            <strong>${endpoint.owner}</strong>
          </div>
          <div>
            <span>Status</span>
            <strong class="status ${statusClass}">${endpoint.status}</strong>
          </div>
          <p><strong>Payload:</strong> ${endpoint.payload}</p>
        </article>
      `;
    })
    .join("");

  tokenList.innerHTML = tokens
    .map((token) => {
      const statusClass = token.status === "Pendente" ? "warning" : "";
      return `
        <div class="api-note">
          <strong>${token.name}</strong>
          <span>${token.scope}</span>
          <small><span class="status ${statusClass}">${token.status}</span> - validade ${token.expires}</small>
        </div>
      `;
    })
    .join("");

  securityList.innerHTML = `
    <div class="api-note">
      <strong>Escopo minimo</strong>
      <span>Credenciais devem ser emitidas por instituicao, convenio, produto e finalidade.</span>
    </div>
    <div class="api-note">
      <strong>Assinatura e idempotencia</strong>
      <span>Reservas, insercoes e retornos precisam evitar duplicidade e provar integridade do payload.</span>
    </div>
    <div class="api-note">
      <strong>Auditoria obrigatoria</strong>
      <span>Cada chamada sensivel deve registrar origem, IP, credencial, servidor, contrato e resultado.</span>
    </div>
  `;
}

const apiStyle = document.createElement("style");
apiStyle.textContent = `
  .api-summary-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(150px, 1fr));
    gap: 14px;
    margin-bottom: 18px;
  }
  .api-summary-card,
  .api-endpoint-row,
  .api-note {
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
  }
  .api-summary-card {
    padding: 16px;
    box-shadow: var(--shadow);
  }
  .api-summary-card span,
  .api-endpoint-row span,
  .api-endpoint-row small,
  .api-endpoint-row p,
  .api-note span,
  .api-note small {
    display: block;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.4;
  }
  .api-summary-card strong {
    display: block;
    margin-top: 8px;
    font-size: 26px;
  }
  .api-endpoint-list,
  .api-token-list,
  .api-note-list {
    display: grid;
    gap: 10px;
  }
  .api-endpoint-row {
    display: grid;
    grid-template-columns: 1.5fr 0.65fr 0.8fr;
    gap: 12px;
    align-items: start;
    padding: 12px;
    background: var(--surface-2);
  }
  .api-endpoint-row p {
    grid-column: 1 / -1;
    margin: 0;
  }
  .api-endpoint-row p strong {
    color: var(--text);
    font-size: 13px;
  }
  .api-endpoint-row code,
  .api-endpoint-row strong {
    word-break: break-word;
  }
  .api-note {
    padding: 12px;
    background: var(--surface-2);
  }
  .api-note span,
  .api-note small {
    margin-top: 4px;
  }
  @media (max-width: 1040px) {
    .api-summary-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .api-endpoint-row {
      grid-template-columns: 1fr;
    }
  }
  @media (max-width: 640px) {
    .api-summary-grid {
      grid-template-columns: 1fr;
    }
  }
`;
document.head.appendChild(apiStyle);

const renderBeforeApiSandbox = render;
render = function renderWithApiSandbox() {
  renderBeforeApiSandbox();
  renderApiSandbox();
};

render();
