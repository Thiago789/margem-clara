if (!pageTitles.products) {
  pageTitles.products = "Produtos";
}

if (!profileConfig.manager.views.includes("products")) {
  const rulesIndex = profileConfig.manager.views.indexOf("rules");
  const insertAt = rulesIndex >= 0 ? rulesIndex : profileConfig.manager.views.indexOf("settings");
  profileConfig.manager.views.splice(insertAt >= 0 ? insertAt : profileConfig.manager.views.length, 0, "products");
}

function getProductRules() {
  return [
    {
      name: "Emprestimo consignado",
      code: "EMPRESTIMO",
      payrollCode: "CONSIG",
      marginLimit: 35,
      priority: 2,
      reservationMode: "Com codigo quando exigido pelo convenio",
      status: "Ativo",
    },
    {
      name: "Cartao consignado",
      code: "CARTAO",
      payrollCode: "CARTAO",
      marginLimit: 5,
      priority: 3,
      reservationMode: "Reserva separada por produto",
      status: "Ativo",
    },
    {
      name: "Cartao beneficio",
      code: "BENEFICIO",
      payrollCode: "BENEF",
      marginLimit: 5,
      priority: 4,
      reservationMode: "Margem propria conforme convenio",
      status: "Ativo",
    },
  ];
}

function getContractTypeRules() {
  return [
    {
      name: "Novo",
      marginEffect: "Consome nova margem",
      attention: "Validar margem disponivel, autorizacao e data de corte.",
    },
    {
      name: "Refinanciamento",
      marginEffect: "Pode manter, reduzir ou ampliar parcela",
      attention: "Precisa vincular contrato anterior e regra de liquidacao/refin.",
    },
    {
      name: "Portabilidade",
      marginEffect: "Substitui contrato de outra instituicao",
      attention: "Exige controle de saldo, banco origem e etapa de confirmacao.",
    },
    {
      name: "Compra de divida",
      marginEffect: "Quita divida anterior e cria novo contrato",
      attention: "Precisa registrar credor original, valor de compra e comprovantes.",
    },
  ];
}

function getPayrollCycleRules() {
  return [
    {
      title: "Data de corte",
      text: "Define quais reservas entram no arquivo de insercao da competencia. Reservas apos o corte ficam para a proxima janela.",
    },
    {
      title: "Parcela atual",
      text: "Avanca a cada retorno descontado. Se a folha nao descontar, a parcela nao deve evoluir automaticamente.",
    },
    {
      title: "Liquidacao automatica",
      text: "Quando parcela atual atinge o prazo, o contrato muda para Liquidado e a margem deixa de ser consumida.",
    },
  ];
}

function ensureProductRulesView() {
  if (document.getElementById("products-view")) return;

  const nav = document.querySelector(".nav-list");
  const rulesButton = document.querySelector('[data-view="rules"]');
  const settingsButton = document.querySelector('[data-view="settings"]');
  const button = document.createElement("button");
  button.className = "nav-item";
  button.dataset.view = "products";
  button.type = "button";
  button.textContent = "Produtos";
  button.addEventListener("click", () => openView("products"));
  nav?.insertBefore(button, rulesButton || settingsButton || null);

  document.querySelector(".main-panel")?.insertAdjacentHTML(
    "beforeend",
    `
      <section class="view" id="products-view" aria-labelledby="products-title">
        <div class="section-heading row-heading">
          <div>
            <h2 id="products-title">Produtos e rubricas</h2>
            <p>Configure como cada produto consome margem, entra na folha e respeita prioridade.</p>
          </div>
          <button class="primary-button" id="products-audit-button" type="button">Registrar revisao</button>
        </div>

        <div class="product-summary-grid" id="product-summary-grid"></div>

        <section class="panel product-panel">
          <div class="panel-heading">
            <h3>Matriz inicial de produtos</h3>
          </div>
          <div class="product-table" id="product-table"></div>
        </section>

        <div class="content-grid product-content">
          <section class="panel">
            <div class="panel-heading">
              <h3>Impacto no MVP</h3>
            </div>
            <div class="product-notes" id="product-impact"></div>
          </section>

          <section class="panel">
            <div class="panel-heading">
              <h3>Decisoes pendentes</h3>
            </div>
            <div class="product-notes" id="product-decisions"></div>
          </section>
        </div>

        <div class="content-grid product-content">
          <section class="panel">
            <div class="panel-heading">
              <h3>Tipos de contrato</h3>
            </div>
            <div class="product-notes" id="contract-type-rules"></div>
          </section>

          <section class="panel">
            <div class="panel-heading">
              <h3>Ciclo de folha</h3>
            </div>
            <div class="product-notes" id="payroll-cycle-rules"></div>
          </section>
        </div>
      </section>
    `
  );

  document.getElementById("products-audit-button")?.addEventListener("click", () => {
    auditEvent("Revisao de produtos e rubricas registrada.", "Produtos");
    saveState();
    render();
    openView("products");
  });
}

function renderProductRules() {
  ensureProductRulesView();

  const summary = document.getElementById("product-summary-grid");
  const table = document.getElementById("product-table");
  const impact = document.getElementById("product-impact");
  const decisions = document.getElementById("product-decisions");
  const contractTypes = document.getElementById("contract-type-rules");
  const cycleRules = document.getElementById("payroll-cycle-rules");
  if (!summary || !table || !impact || !decisions || !contractTypes || !cycleRules) return;

  const products = getProductRules();
  const active = products.filter((product) => product.status === "Ativo").length;
  const planned = products.filter((product) => product.status !== "Ativo").length;
  const payrollCodes = new Set(products.map((product) => product.payrollCode)).size;

  const cards = [
    ["Produtos mapeados", products.length],
    ["Ativos no MVP", active],
    ["Planejados", planned],
    ["Rubricas", payrollCodes],
  ];

  summary.innerHTML = cards
    .map(
      ([label, value]) => `
        <article class="product-summary-card">
          <span>${label}</span>
          <strong>${value}</strong>
        </article>
      `
    )
    .join("");

  table.innerHTML = products
    .map((product) => {
      const statusClass = product.status === "Ativo" ? "" : product.status === "Planejado" ? "warning" : "danger";
      return `
        <article class="product-row">
          <div>
            <strong>${product.name}</strong>
            <span>${product.code} - rubrica ${product.payrollCode}</span>
          </div>
          <div><span>Margem</span><strong>${product.marginLimit}%</strong></div>
          <div><span>Prioridade</span><strong>${product.priority}</strong></div>
          <div><span class="status ${statusClass}">${product.status}</span></div>
          <p>${product.reservationMode}</p>
        </article>
      `;
    })
    .join("");

  impact.innerHTML = `
    <div class="product-note">
      <strong>Calculo de margem</strong>
      <span>Hoje o MVP calcula a margem principal em ${Math.round(marginPercent * 100)}%. A evolucao natural e separar limites por produto e convenio.</span>
    </div>
    <div class="product-note">
      <strong>Arquivo de insercao</strong>
      <span>Cada produto deve levar rubrica propria para a folha processar corretamente.</span>
    </div>
    <div class="product-note">
      <strong>Reserva</strong>
      <span>A reserva precisa guardar produto, rubrica e validade para evitar conflito entre tipos de desconto.</span>
    </div>
  `;

  decisions.innerHTML = `
    <div class="product-note">
      <strong>Percentuais por convenio</strong>
      <span>Definir se o percentual sera global, por produto ou por combinacao convenio/produto.</span>
    </div>
    <div class="product-note">
      <strong>Prioridade entre descontos</strong>
      <span>Decidir se judicial, obrigatorio ou legado consome margem antes dos demais produtos.</span>
    </div>
    <div class="product-note">
      <strong>Produto visivel para consignataria</strong>
      <span>Definir quais produtos cada instituicao pode operar por contrato ou credenciamento.</span>
    </div>
  `;

  contractTypes.innerHTML = getContractTypeRules()
    .map(
      (rule) => `
        <div class="product-note">
          <strong>${rule.name}</strong>
          <span>${rule.marginEffect}</span>
          <span>${rule.attention}</span>
        </div>
      `
    )
    .join("");

  cycleRules.innerHTML = getPayrollCycleRules()
    .map(
      (rule) => `
        <div class="product-note">
          <strong>${rule.title}</strong>
          <span>${rule.text}</span>
        </div>
      `
    )
    .join("");
}

const productStyle = document.createElement("style");
productStyle.textContent = `
  .product-summary-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(150px, 1fr));
    gap: 14px;
    margin-bottom: 18px;
  }
  .product-summary-card,
  .product-row,
  .product-note {
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
  }
  .product-summary-card {
    padding: 16px;
    box-shadow: var(--shadow);
  }
  .product-summary-card span,
  .product-row span,
  .product-row p,
  .product-note span {
    display: block;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.4;
  }
  .product-summary-card strong {
    display: block;
    margin-top: 8px;
    font-size: 26px;
  }
  .product-table,
  .product-notes {
    display: grid;
    gap: 10px;
  }
  .product-row {
    display: grid;
    grid-template-columns: 1.6fr 0.7fr 0.7fr auto;
    gap: 12px;
    align-items: center;
    padding: 12px;
    background: var(--surface-2);
  }
  .product-row p {
    grid-column: 1 / -1;
    margin: 0;
  }
  .product-note {
    padding: 12px;
    background: var(--surface-2);
  }
  .product-note span {
    margin-top: 4px;
  }
  @media (max-width: 1040px) {
    .product-summary-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .product-row {
      grid-template-columns: 1fr 1fr;
    }
  }
  @media (max-width: 640px) {
    .product-summary-grid,
    .product-row {
      grid-template-columns: 1fr;
    }
  }
`;
document.head.appendChild(productStyle);

const renderBeforeProductRules = render;
render = function renderWithProductRules() {
  renderBeforeProductRules();
  renderProductRules();
};

render();
