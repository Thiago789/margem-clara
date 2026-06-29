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
      validFrom: "2026-01-01",
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
      validFrom: "2026-01-01",
      validUntil: "2026-06-15",
    },
    {
      lenderId: "lender-3",
      agreement: "Prefeitura Modelo",
      agreementCode: "PM-001",
      products: ["Emprestimo consignado", "Cartao beneficio"],
      status: "Em homologacao",
      accessMode: "Somente massa de teste",
      integration: "API em teste",
      validFrom: "2026-07-01",
      validUntil: "2026-08-31",
    },
    {
      lenderId: "lender-4",
      agreement: "Prefeitura Modelo",
      agreementCode: "PM-001",
      products: ["Emprestimo consignado"],
      status: "Ativo",
      accessMode: "Aguardando inicio de vigencia",
      integration: "Sem integracao",
      validFrom: "2026-07-15",
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

function accreditationIsExpired(accreditation) {
  return Boolean(accreditation?.validUntil && accreditation.validUntil < today());
}

function accreditationIsNotStarted(accreditation) {
  return Boolean(accreditation?.validFrom && accreditation.validFrom > today());
}

function accreditationIsWithinValidity(accreditation) {
  return !accreditationIsNotStarted(accreditation) && !accreditationIsExpired(accreditation);
}

function accreditationOperationalStatus(accreditation) {
  if (!accreditation) return { label: "Sem credenciamento", className: "warning", group: "blocked" };
  if (accreditation.status !== "Ativo") return { label: accreditation.status, className: "warning", group: "blocked" };
  if (accreditationIsNotStarted(accreditation)) return { label: "Nao iniciado", className: "warning", group: "future" };
  if (accreditationIsExpired(accreditation)) return { label: "Vencido", className: "warning", group: "expired" };
  return { label: "Apto", className: "", group: "ready" };
}

function lenderHasAgreementAccess(lenderId) {
  return lenderProductEligibility(lenderId, "Emprestimo consignado").ok || lenderAllowedProducts(lenderId).length > 0;
}

function lenderAllowedProducts(lenderId) {
  const accreditation = lenderAccreditationFor(lenderId);
  if (!accreditation || accreditation.status !== "Ativo") return [];
  if (!accreditationIsWithinValidity(accreditation)) return [];
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
  if (accreditationIsNotStarted(accreditation)) {
    return { ok: false, reason: `Vigencia inicia em ${accreditation.validFrom}` };
  }
  if (accreditationIsExpired(accreditation)) {
    return { ok: false, reason: `Vigencia encerrada em ${accreditation.validUntil}` };
  }
  if (!accreditation.products.includes(product)) {
    return { ok: false, reason: "Produto nao habilitado" };
  }
  return { ok: true, reason: "Habilitada" };
}

function lenderCanOperateProduct(lenderId, product) {
  return lenderProductEligibility(lenderId, product).ok;
}

function lenderOperationBlockMessage(lenderId, product) {
  const lender = lenders.find((item) => item.id === lenderId);
  const eligibility = lenderProductEligibility(lenderId, product);
  if (eligibility.ok) return "";
  return `${lender?.name || "Consignataria"} nao pode operar ${product} neste convenio: ${eligibility.reason}.`;
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
  const operationalGroups = rows.reduce(
    (groups, item) => {
      groups[accreditationOperationalStatus(item).group] += 1;
      return groups;
    },
    { ready: 0, future: 0, expired: 0, blocked: 0 }
  );
  const products = new Set(rows.flatMap((item) => item.products)).size;

  summary.innerHTML = [
    ["Instituicoes", rows.length],
    ["Aptas", operationalGroups.ready],
    ["Futuras", operationalGroups.future],
    ["Vencidas", operationalGroups.expired],
    ["Produtos liberados", products],
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
      const operationalStatus = accreditationOperationalStatus(row);
      return `
        <article class="accreditation-row">
          <div>
            <strong>${lender?.name || "Consignataria"}</strong>
            <span>${row.agreement} - vigencia ${row.validFrom} ate ${row.validUntil}</span>
          </div>
          <div><span>Status operacional</span><strong class="status ${operationalStatus.className}">${operationalStatus.label}</strong></div>
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
      const blockMessage = lenderOperationBlockMessage(lenderId, product);
      if (blockMessage) {
        event.preventDefault();
        event.stopImmediatePropagation();
        auditEvent(blockMessage, "Bloqueio de credenciamento");
        saveState();
        alert(blockMessage);
      }
    },
    true
  );
}

const accreditationStyle = document.createElement("style");
accreditationStyle.textContent = `
  .accreditation-summary {
    display: grid;
    grid-template-columns: repeat(5, minmax(130px, 1fr));
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
