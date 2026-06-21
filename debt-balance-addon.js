if (!pageTitles.debtbalance) {
  pageTitles.debtbalance = "Saldo devedor";
}

function estimateDebtBalance(contract) {
  const installments = Number(contract.installments || 0);
  const current = Number(contract.currentInstallment || 0);
  const remaining = Math.max(installments - current, 0);
  const installment = Number(contract.installment || 0);
  const grossBalance = remaining * installment;
  const discountFactor = contract.contractType === "Portabilidade" || contract.contractType === "Compra de divida" ? 0.94 : 0.97;
  const estimatedBalance = Math.max(grossBalance * discountFactor, 0);
  return {
    remaining,
    grossBalance,
    estimatedBalance,
  };
}

function getDebtBalanceRows() {
  return state.contracts
    .filter((contract) => !contractReleasesMargin(contract))
    .map((contract) => {
      const employee = employeeById(contract.employeeId);
      const balance = estimateDebtBalance(contract);
      const needsFormalBalance = ["Refinanciamento", "Portabilidade", "Compra de divida"].includes(contract.contractType);
      return {
        ...contract,
        employeeName: employee?.name || "Servidor",
        enrollment: employee?.enrollment || "",
        lenderName: lenderName(contract.lenderId),
        needsFormalBalance,
        balance,
      };
    });
}

function ensureDebtBalanceView() {
  if (document.getElementById("debtbalance-view")) return;

  const nav = document.querySelector(".nav-list");
  const debtButton = document.querySelector('[data-view="debt"]');
  const contractsButton = document.querySelector('[data-view="contracts"]');
  const button = document.createElement("button");
  button.className = "nav-item";
  button.dataset.view = "debtbalance";
  button.type = "button";
  button.textContent = "Saldo devedor";
  button.addEventListener("click", () => openView("debtbalance"));
  nav?.insertBefore(button, debtButton?.nextSibling || contractsButton?.nextSibling || null);

  ["manager", "employee", "lender"].forEach((profile) => {
    if (!profileConfig[profile].views.includes("debtbalance")) {
      const debtIndex = profileConfig[profile].views.indexOf("debt");
      const contractsIndex = profileConfig[profile].views.indexOf("contracts");
      profileConfig[profile].views.splice(debtIndex >= 0 ? debtIndex + 1 : contractsIndex + 1, 0, "debtbalance");
    }
  });

  document.querySelector(".main-panel")?.insertAdjacentHTML(
    "beforeend",
    `
      <section class="view" id="debtbalance-view" aria-labelledby="debtbalance-title">
        <div class="section-heading row-heading">
          <div>
            <h2 id="debtbalance-title">Saldo devedor e contrato de origem</h2>
            <p>Base para refinanciamento, portabilidade e compra de divida.</p>
          </div>
          <button class="primary-button" id="debtbalance-audit-button" type="button">Registrar revisao</button>
        </div>

        <div class="debt-balance-summary" id="debt-balance-summary"></div>

        <section class="panel">
          <div class="panel-heading">
            <h3>Contratos e saldos estimados</h3>
          </div>
          <div class="debt-balance-list" id="debt-balance-list"></div>
        </section>

        <div class="content-grid debt-balance-content">
          <section class="panel">
            <div class="panel-heading">
              <h3>Fluxos que exigem saldo</h3>
            </div>
            <div class="debt-balance-notes" id="debt-balance-flows"></div>
          </section>

          <section class="panel">
            <div class="panel-heading">
              <h3>Cuidados de auditoria</h3>
            </div>
            <div class="debt-balance-notes" id="debt-balance-audit"></div>
          </section>
        </div>
      </section>
    `
  );

  document.getElementById("debtbalance-audit-button")?.addEventListener("click", () => {
    auditEvent("Revisao de saldo devedor registrada.", "Saldo devedor");
    saveState();
    render();
    openView("debtbalance");
  });
}

function renderDebtBalance() {
  ensureDebtBalanceView();

  const summary = document.getElementById("debt-balance-summary");
  const list = document.getElementById("debt-balance-list");
  const flows = document.getElementById("debt-balance-flows");
  const audit = document.getElementById("debt-balance-audit");
  if (!summary || !list || !flows || !audit) return;

  let rows = getDebtBalanceRows();
  if (state.currentProfile === "employee") rows = rows.filter((row) => row.employeeId === state.employees[0]?.id);
  if (state.currentProfile === "lender") rows = rows.filter((row) => row.lenderId === "lender-1");

  const totalEstimated = rows.reduce((sum, row) => sum + row.balance.estimatedBalance, 0);
  const formalNeeded = rows.filter((row) => row.needsFormalBalance).length;
  const nearEnd = rows.filter((row) => row.balance.remaining <= 3).length;

  summary.innerHTML = [
    ["Contratos", rows.length],
    ["Saldo estimado", money.format(totalEstimated)],
    ["Exigem saldo formal", formalNeeded],
    ["Ate 3 parcelas", nearEnd],
  ]
    .map(
      ([label, value]) => `
        <article class="debt-balance-card">
          <span>${label}</span>
          <strong>${value}</strong>
        </article>
      `
    )
    .join("");

  list.innerHTML = rows
    .map((row) => {
      const statusClass = row.needsFormalBalance ? "warning" : "";
      return `
        <article class="debt-balance-row">
          <div>
            <strong>${row.id}</strong>
            <span>${row.employeeName} - ${row.enrollment}</span>
          </div>
          <div><span>Tipo</span><strong>${row.contractType}</strong></div>
          <div><span>Parcelas restantes</span><strong>${row.balance.remaining}</strong></div>
          <div><span>Saldo estimado</span><strong>${money.format(row.balance.estimatedBalance)}</strong></div>
          <div><span class="status ${statusClass}">${row.needsFormalBalance ? "Saldo formal" : row.status}</span></div>
          <p>${row.lenderName} - ${row.product || "Emprestimo consignado"}.</p>
        </article>
      `;
    })
    .join("");

  flows.innerHTML = `
    <div class="debt-balance-note">
      <strong>Refinanciamento</strong>
      <span>Precisa vincular contrato origem, saldo atualizado, nova parcela, novo prazo e valor liberado.</span>
    </div>
    <div class="debt-balance-note">
      <strong>Portabilidade</strong>
      <span>Exige banco origem, saldo formal, protocolo e confirmacao de migracao.</span>
    </div>
    <div class="debt-balance-note">
      <strong>Compra de divida</strong>
      <span>Registra credor original, valor de compra, comprovante de quitacao e novo contrato.</span>
    </div>
  `;

  audit.innerHTML = `
    <div class="debt-balance-note">
      <strong>Saldo estimado vs formal</strong>
      <span>O MVP exibe estimativa. Operacao real deve guardar saldo formal enviado pela instituicao.</span>
    </div>
    <div class="debt-balance-note">
      <strong>Historico</strong>
      <span>Alteracao de saldo, quitacao ou contrato origem deve registrar usuario, data e evidencia.</span>
    </div>
    <div class="debt-balance-note">
      <strong>LGPD e seguranca</strong>
      <span>Saldo devedor e contrato origem sao dados sensiveis e devem respeitar permissao por perfil.</span>
    </div>
  `;
}

const debtBalanceStyle = document.createElement("style");
debtBalanceStyle.textContent = `
  .debt-balance-summary {
    display: grid;
    grid-template-columns: repeat(4, minmax(150px, 1fr));
    gap: 14px;
    margin-bottom: 18px;
  }
  .debt-balance-card,
  .debt-balance-row,
  .debt-balance-note {
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface-2);
  }
  .debt-balance-card {
    padding: 16px;
    box-shadow: var(--shadow);
  }
  .debt-balance-card span,
  .debt-balance-row span,
  .debt-balance-row p,
  .debt-balance-note span {
    display: block;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.4;
  }
  .debt-balance-card strong {
    display: block;
    margin-top: 8px;
    font-size: 24px;
  }
  .debt-balance-list,
  .debt-balance-notes {
    display: grid;
    gap: 10px;
  }
  .debt-balance-row {
    display: grid;
    grid-template-columns: 1.4fr 0.8fr 0.8fr 0.9fr auto;
    gap: 12px;
    align-items: center;
    padding: 12px;
  }
  .debt-balance-row p {
    grid-column: 1 / -1;
    margin: 0;
  }
  .debt-balance-content {
    margin-top: 18px;
  }
  .debt-balance-note {
    padding: 12px;
  }
  .debt-balance-note span {
    margin-top: 4px;
  }
  @media (max-width: 1040px) {
    .debt-balance-summary,
    .debt-balance-row {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 640px) {
    .debt-balance-summary,
    .debt-balance-row {
      grid-template-columns: 1fr;
    }
  }
`;
document.head.appendChild(debtBalanceStyle);

const renderBeforeDebtBalanceAddon = render;
render = function renderWithDebtBalanceAddon() {
  renderBeforeDebtBalanceAddon();
  renderDebtBalance();
};

render();
