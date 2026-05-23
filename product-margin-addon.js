if (!pageTitles.productmargins) {
  pageTitles.productmargins = "Margem produto";
}

function getProductMarginRules() {
  return [
    {
      product: "Emprestimo consignado",
      code: "EMPRESTIMO",
      percentage: 35,
      sharingMode: "Margem principal",
      payrollCode: "CONSIG",
    },
    {
      product: "Cartao consignado",
      code: "CARTAO",
      percentage: 5,
      sharingMode: "Margem separada quando convenio exigir",
      payrollCode: "CARTAO",
    },
    {
      product: "Cartao beneficio",
      code: "BENEFICIO",
      percentage: 5,
      sharingMode: "Margem propria por regra local",
      payrollCode: "BENEF",
    },
  ];
}

function productMarginForEnrollment(enrollment, rule) {
  const calculationBase = Math.max(Number(enrollment.baseSalary || 0) - Number(enrollment.mandatoryDeductions || 0), 0);
  const total = calculationBase * (rule.percentage / 100);
  const used = state.contracts
    .filter((contract) => contract.enrollmentId === enrollment.id && contract.product === rule.product)
    .filter((contract) => ["Descontando", "Averbado", "Enviado para folha", "Reservado"].includes(contract.status))
    .reduce((sum, contract) => sum + Number(contract.installment || 0), 0);
  return {
    total,
    used,
    available: total - used,
  };
}

function ensureProductMarginView() {
  if (document.getElementById("productmargins-view")) return;

  const nav = document.querySelector(".nav-list");
  const productsButton = document.querySelector('[data-view="products"]');
  const button = document.createElement("button");
  button.className = "nav-item";
  button.dataset.view = "productmargins";
  button.type = "button";
  button.textContent = "Margem produto";
  button.addEventListener("click", () => openView("productmargins"));
  nav?.insertBefore(button, productsButton?.nextSibling || null);

  if (!profileConfig.manager.views.includes("productmargins")) {
    const productsIndex = profileConfig.manager.views.indexOf("products");
    profileConfig.manager.views.splice(productsIndex >= 0 ? productsIndex + 1 : profileConfig.manager.views.length, 0, "productmargins");
  }

  document.querySelector(".main-panel")?.insertAdjacentHTML(
    "beforeend",
    `
      <section class="view" id="productmargins-view" aria-labelledby="productmargins-title">
        <div class="section-heading row-heading">
          <div>
            <h2 id="productmargins-title">Margem por produto</h2>
            <p>Separe limites de emprestimo, cartao consignado e cartao beneficio por matricula.</p>
          </div>
          <button class="primary-button" id="productmargins-audit-button" type="button">Registrar revisao</button>
        </div>

        <div class="product-margin-summary" id="product-margin-summary"></div>

        <section class="panel">
          <div class="panel-heading">
            <h3>Limites por matricula</h3>
          </div>
          <div class="product-margin-list" id="product-margin-list"></div>
        </section>

        <div class="content-grid product-margin-content">
          <section class="panel">
            <div class="panel-heading">
              <h3>Regras de separacao</h3>
            </div>
            <div class="product-margin-notes" id="product-margin-rules"></div>
          </section>

          <section class="panel">
            <div class="panel-heading">
              <h3>Pontos pendentes</h3>
            </div>
            <div class="product-margin-notes" id="product-margin-pending"></div>
          </section>
        </div>
      </section>
    `
  );

  document.getElementById("productmargins-audit-button")?.addEventListener("click", () => {
    auditEvent("Revisao de margem por produto registrada.", "Margem por produto");
    saveState();
    render();
    openView("productmargins");
  });
}

function renderProductMargins() {
  if (typeof normalizeEnrollments === "function") normalizeEnrollments();
  ensureProductMarginView();

  const summary = document.getElementById("product-margin-summary");
  const list = document.getElementById("product-margin-list");
  const rules = document.getElementById("product-margin-rules");
  const pending = document.getElementById("product-margin-pending");
  if (!summary || !list || !rules || !pending) return;

  const productRules = getProductMarginRules();
  const enrollments = state.enrollments || [];
  const totals = productRules.map((rule) => {
    const amount = enrollments.reduce((sum, enrollment) => sum + productMarginForEnrollment(enrollment, rule).available, 0);
    return [rule.product, amount];
  });

  summary.innerHTML = totals
    .map(
      ([label, value]) => `
        <article class="product-margin-card">
          <span>${label}</span>
          <strong>${money.format(value)}</strong>
        </article>
      `
    )
    .join("");

  list.innerHTML = enrollments
    .map((enrollment) => {
      const employee = employeeById(enrollment.employeeId);
      const rows = productRules
        .map((rule) => {
          const margin = productMarginForEnrollment(enrollment, rule);
          const statusClass = margin.available < 0 ? "danger" : "";
          return `
            <div class="product-margin-line">
              <span>${rule.product}</span>
              <strong>${rule.percentage}%</strong>
              <span>${money.format(margin.used)} usado</span>
              <span class="status ${statusClass}">${money.format(margin.available)} livre</span>
            </div>
          `;
        })
        .join("");
      return `
        <article class="product-margin-row">
          <div>
            <strong>${employee?.name || "Servidor"}</strong>
            <span>${enrollment.number} - ${enrollment.agreement}</span>
          </div>
          <div class="product-margin-lines">${rows}</div>
        </article>
      `;
    })
    .join("");

  rules.innerHTML = `
    <div class="product-margin-note">
      <strong>Emprestimo consignado</strong>
      <span>Usa a margem principal do convenio, hoje simulada em 35%.</span>
    </div>
    <div class="product-margin-note">
      <strong>Cartoes</strong>
      <span>Podem ter limite separado, compartilhado ou bloqueado conforme regra do convenio.</span>
    </div>
    <div class="product-margin-note">
      <strong>Rubrica</strong>
      <span>Cada produto deve sair no arquivo de insercao com rubrica propria.</span>
    </div>
  `;

  pending.innerHTML = `
    <div class="product-margin-note">
      <strong>Regra por convenio</strong>
      <span>Definir se os percentuais serao fixos ou configuraveis por convenio/produto.</span>
    </div>
    <div class="product-margin-note">
      <strong>Prioridade</strong>
      <span>Definir ordem quando a margem de um produto ficar negativa ou houver desconto obrigatorio.</span>
    </div>
    <div class="product-margin-note">
      <strong>Visibilidade</strong>
      <span>Consignataria deve enxergar apenas produtos em que esteja credenciada.</span>
    </div>
  `;
}

const productMarginStyle = document.createElement("style");
productMarginStyle.textContent = `
  .product-margin-summary {
    display: grid;
    grid-template-columns: repeat(3, minmax(180px, 1fr));
    gap: 14px;
    margin-bottom: 18px;
  }
  .product-margin-card,
  .product-margin-row,
  .product-margin-line,
  .product-margin-note {
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface-2);
  }
  .product-margin-card {
    padding: 16px;
    box-shadow: var(--shadow);
  }
  .product-margin-card span,
  .product-margin-row span,
  .product-margin-line span,
  .product-margin-note span {
    display: block;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.4;
  }
  .product-margin-card strong {
    display: block;
    margin-top: 8px;
    font-size: 22px;
  }
  .product-margin-list,
  .product-margin-lines,
  .product-margin-notes {
    display: grid;
    gap: 10px;
  }
  .product-margin-row {
    display: grid;
    gap: 10px;
    padding: 12px;
  }
  .product-margin-line {
    display: grid;
    grid-template-columns: 1.4fr 0.5fr 0.8fr 0.8fr;
    gap: 10px;
    align-items: center;
    padding: 10px;
  }
  .product-margin-content {
    margin-top: 18px;
  }
  .product-margin-note {
    padding: 12px;
  }
  .product-margin-note span {
    margin-top: 4px;
  }
  @media (max-width: 1040px) {
    .product-margin-summary,
    .product-margin-line {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 640px) {
    .product-margin-summary,
    .product-margin-line {
      grid-template-columns: 1fr;
    }
  }
`;
document.head.appendChild(productMarginStyle);

const renderBeforeProductMarginAddon = render;
render = function renderWithProductMarginAddon() {
  renderBeforeProductMarginAddon();
  renderProductMargins();
};

render();
