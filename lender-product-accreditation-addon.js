if (!pageTitles.accreditation) {
  pageTitles.accreditation = "Credenciamento";
}

function getLenderProductAccreditations() {
  return [
    {
      lenderId: "lender-1",
      agreement: "Prefeitura Modelo",
      agreementCode: "PM-001",
      products: ["Emprestimo consignado", "Cartao consignado"],
      status: "Ativo",
      accessMode: "Acesso operacional completo",
      integration: "API ativa",
      validUntil: "2026-12-31",
    },
    {
      lenderId: "lender-2",
      agreement: "Prefeitura Modelo",
      agreementCode: "PM-001",
      products: ["Emprestimo consignado"],
      status: "Ativo",
      accessMode: "Acesso operacional completo",
      integration: "Arquivo manual",
      validUntil: "2026-10-31",
    },
    {
      lenderId: "lender-3",
      agreement: "Prefeitura Modelo",
      agreementCode: "PM-001",
      products: ["Emprestimo consignado", "Cartao beneficio"],
      status: "Em homologacao",
      accessMode: "Somente massa de teste",
      integration: "API em teste",
      validUntil: "2026-08-31",
    },
    {
      lenderId: "lender-4",
      agreement: "Prefeitura Modelo",
      agreementCode: "PM-001",
      products: ["Emprestimo consignado"],
      status: "Pendente",
      accessMode: "Acesso bloqueado",
      integration: "Sem integracao",
      validUntil: "2026-07-31",
    },
  ];
}

function getCurrentAgreementCode() {
  return state.conventionSettings?.code || "PM-001";
}

function lenderAccreditationFor(lenderId) {
  const agreementCode = getCurrentAgreementCode();
  return getLenderProductAccreditations().find((item) => item.lenderId === lenderId && item.agreementCode === agreementCode);
}

function lenderHasAgreementAccess(lenderId) {
  const accreditation = lenderAccreditationFor(lenderId);
  return !!accreditation && accreditation.status === "Ativo";
}

function lenderAllowedProducts(lenderId) {
  const accreditation = lenderAccreditationFor(lenderId);
  if (!accreditation || accreditation.status !== "Ativo") return [];
  return accreditation.products;
}

function lenderProductEligibility(lenderId, product) {
  const accreditation = lenderAccreditationFor(lenderId);
  if (!accreditation) {
    return { ok: false, reason: "Sem credenciamento neste convenio" };
  }
  if (accreditation.status !== "Ativo") {
    return { ok: false, reason: `Credenciamento ${accreditation.status.toLowerCase()}` };
  }
  if (!accreditation.products.includes(product)) {
    return { ok: false, reason: "Produto nao habilitado" };
  }
  return { ok: true, reason: "Habilitada" };
}

function lenderCanOperateProduct(lenderId, product) {
  return lenderProductEligibility(lenderId, product).ok;
}

function refreshContractProductOptions() {
  const lenderSelect = document.getElementById("contract-lender");
  const productSelect = document.getElementById("contract-product");
  if (!lenderSelect || !productSelect) return;

  const allowedProducts = lenderAllowedProducts(lenderSelect.value);
  const currentProduct = productSelect.value;
  productSelect.innerHTML = allowedProducts.length
    ? allowedProducts.map((product) => `<option>${product}</option>`).join("")
    : `<option>Nenhum produto habilitado</option>`;
  productSelect.disabled = allowedProducts.length === 0;
  if (allowedProducts.includes(currentProduct)) productSelect.value = currentProduct;
}

function ensureAccreditationView() {
  if (document.getElementById("accreditation-view")) return;

  const nav = document.querySelector(".nav-list");
  const lendersButton = document.querySelector('[data-view="lenders"]');
  const button = document.createElement("button");
  button.className = "nav-item";
  button.dataset.view = "accreditation";
  button.type = "button";
  button.textContent = "Credenciamento";
  button.addEventListener("click", () => openView("accreditation"));
  nav?.insertBefore(button, lendersButton?.nextSibling || null);

  ["manager", "lender"].forEach((profile) => {
    if (!profileConfig[profile].views.includes("accreditation")) {
      const lendersIndex = profileConfig[profile].views.indexOf("lenders");
      profileConfig[profile].views.splice(lendersIndex >= 0 ? lendersIndex + 1 : profileConfig[profile].views.length, 0, "accreditation");
    }
  });

  document.querySelector(".main-panel")?.insertAdjacentHTML(
    "beforeend",
    `
      <section class="view" id="accreditation-view" aria-labelledby="accreditation-title">
        <div class="section-heading row-heading">
          <div>
            <h2 id="accreditation-title">Credenciamento por produto</h2>
            <p>Controle quais consignatarias podem operar cada produto em cada convenio.</p>
          </div>
          <button class="primary-button" id="accreditation-audit-button" type="button">Registrar revisao</button>
        </div>

        <div class="accreditation-summary" id="accreditation-summary"></div>

        <section class="panel">
          <div class="panel-heading">
            <h3>Matriz de credenciamento</h3>
          </div>
          <div class="accreditation-list" id="accreditation-list"></div>
        </section>

        <div class="content-grid accreditation-content">
          <section class="panel">
            <div class="panel-heading">
              <h3>Controles de seguranca</h3>
            </div>
            <div class="accreditation-notes" id="accreditation-controls"></div>
          </section>

          <section class="panel">
            <div class="panel-heading">
              <h3>Regras operacionais</h3>
            </div>
            <div class="accreditation-notes" id="accreditation-rules"></div>
          </section>
        </div>
      </section>
    `
  );

  document.getElementById("accreditation-audit-button")?.addEventListener("click", () => {
    auditEvent("Revisao de credenciamento por produto registrada.", "Credenciamento");
    saveState();
    render();
    openView("accreditation");
  });
}

function renderAccreditationView() {
  ensureAccreditationView();

  const summary = document.getElementById("accreditation-summary");
  const list = document.getElementById("accreditation-list");
  const controls = document.getElementById("accreditation-controls");
  const rules = document.getElementById("accreditation-rules");
  if (!summary || !list || !controls || !rules) return;

  const rows = state.currentProfile === "lender"
    ? getLenderProductAccreditations().filter((item) => item.lenderId === "lender-1")
    : getLenderProductAccreditations();
  const active = rows.filter((item) => item.status === "Ativo").length;
  const products = new Set(rows.flatMap((item) => item.products)).size;
  const pending = rows.filter((item) => item.status !== "Ativo").length;

  summary.innerHTML = [
    ["Instituicoes", rows.length],
    ["Ativas", active],
    ["Produtos liberados", products],
    ["Pendentes", pending],
  ]
    .map(
      ([label, value]) => `
        <article class="accreditation-card">
          <span>${label}</span>
          <strong>${value}</strong>
        </article>
      `
    )
    .join("");

  list.innerHTML = rows
    .map((row) => {
      const lender = lenders.find((item) => item.id === row.lenderId);
      const statusClass = row.status === "Ativo" ? "" : "warning";
      return `
        <article class="accreditation-row">
          <div>
            <strong>${lender?.name || "Consignataria"}</strong>
            <span>${row.agreement} - vigencia ate ${row.validUntil}</span>
          </div>
          <div><span>Status</span><strong class="status ${statusClass}">${row.status}</strong></div>
          <div><span>Integracao</span><strong>${row.integration}</strong></div>
          <p>Produtos: ${row.products.join(", ")}. Acesso: ${row.accessMode}.</p>
        </article>
      `;
    })
    .join("");

  controls.innerHTML = `
    <div class="accreditation-note">
      <strong>Filtro por produto</strong>
      <span>Reserva e simulacao devem bloquear produto nao credenciado para a instituicao.</span>
    </div>
    <div class="accreditation-note">
      <strong>Acesso ao convenio</strong>
      <span>Consignataria sem credenciamento ativo nao deve consultar margem nem criar reserva operacional.</span>
    </div>
    <div class="accreditation-note">
      <strong>Vigencia</strong>
      <span>Credenciamento precisa ter inicio, fim e historico de renovacao.</span>
    </div>
    <div class="accreditation-note">
      <strong>Visibilidade</strong>
      <span>Consignataria deve ver apenas produtos e contratos do proprio credenciamento.</span>
    </div>
  `;

  rules.innerHTML = `
    <div class="accreditation-note">
      <strong>Homologacao</strong>
      <span>Instituicao em homologacao pode testar fluxo, mas nao deve gerar folha real.</span>
    </div>
    <div class="accreditation-note">
      <strong>API ou arquivo</strong>
      <span>Credenciamento deve indicar o canal operacional permitido.</span>
    </div>
    <div class="accreditation-note">
      <strong>Auditoria</strong>
      <span>Toda alteracao de produto liberado precisa registrar usuario, data e motivo.</span>
    </div>
  `;
}

function bindAccreditationFormGuard() {
  const form = document.getElementById("contract-form");
  if (!form || form.dataset.accreditationBound) return;
  form.dataset.accreditationBound = "true";
  document.getElementById("contract-lender")?.addEventListener("change", refreshContractProductOptions);
  document.getElementById("new-contract-open")?.addEventListener("click", () => setTimeout(refreshContractProductOptions, 0));
  refreshContractProductOptions();
  form.addEventListener(
    "submit",
    (event) => {
      if (event.submitter?.value === "cancel") return;
      const lenderId = document.getElementById("contract-lender")?.value;
      const product = document.getElementById("contract-product")?.value || "Emprestimo consignado";
      if (!lenderHasAgreementAccess(lenderId)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        alert("Esta consignataria nao esta habilitada para operar este convenio.");
        return;
      }
      if (!lenderCanOperateProduct(lenderId, product)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        alert("Esta consignataria nao esta credenciada para operar este produto neste convenio.");
      }
    },
    true
  );
}

const accreditationStyle = document.createElement("style");
accreditationStyle.textContent = `
  .accreditation-summary {
    display: grid;
    grid-template-columns: repeat(4, minmax(150px, 1fr));
    gap: 14px;
    margin-bottom: 18px;
  }
  .accreditation-card,
  .accreditation-row,
  .accreditation-note {
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface-2);
  }
  .accreditation-card {
    padding: 16px;
    box-shadow: var(--shadow);
  }
  .accreditation-card span,
  .accreditation-row span,
  .accreditation-row p,
  .accreditation-note span {
    display: block;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.4;
  }
  .accreditation-card strong {
    display: block;
    margin-top: 8px;
    font-size: 24px;
  }
  .accreditation-list,
  .accreditation-notes {
    display: grid;
    gap: 10px;
  }
  .accreditation-row {
    display: grid;
    grid-template-columns: 1.5fr 0.7fr 1fr;
    gap: 12px;
    align-items: center;
    padding: 12px;
  }
  .accreditation-row p {
    grid-column: 1 / -1;
    margin: 0;
  }
  .accreditation-content {
    margin-top: 18px;
  }
  .accreditation-note {
    padding: 12px;
  }
  .accreditation-note span {
    margin-top: 4px;
  }
  @media (max-width: 1040px) {
    .accreditation-summary,
    .accreditation-row {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 640px) {
    .accreditation-summary,
    .accreditation-row {
      grid-template-columns: 1fr;
    }
  }
`;
document.head.appendChild(accreditationStyle);

const renderBeforeAccreditationAddon = render;
render = function renderWithAccreditationAddon() {
  renderBeforeAccreditationAddon();
  bindAccreditationFormGuard();
  renderAccreditationView();
};

render();
