if (!pageTitles.reconciliation) {
  pageTitles.reconciliation = "Conciliacao";
}

if (!profileConfig.manager.views.includes("reconciliation")) {
  const payrollIndex = profileConfig.manager.views.indexOf("payroll");
  profileConfig.manager.views.splice(payrollIndex >= 0 ? payrollIndex + 1 : profileConfig.manager.views.length, 0, "reconciliation");
}

function getPayrollSentContracts() {
  return state.contracts.filter((contract) =>
    contract.status === "Enviado para folha" || contract.status === "Descontando" || contractHasReturnIssue(contract)
  );
}

function getReconciliationRows() {
  return getPayrollSentContracts().map((contract) => {
    const employee = employeeById(contract.employeeId);
    const expected = Number(contract.installment || 0);
    const discounted = contract.status === "Descontando"
      ? Number(contract.discountedValue || contract.installment || 0)
      : Number(contract.discountedValue || 0);
    const difference = discounted - expected;
    const hasIssue = contract.status !== "Descontando" || Math.abs(difference) > 0.009;

    return {
      id: contract.id,
      employee: employee?.name || "Servidor nao localizado",
      enrollment: employee?.enrollment || "-",
      status: contract.status,
      expected,
      discounted,
      difference,
      reason: contract.returnReason || (hasIssue ? "Aguardando motivo do retorno" : "Sem divergencia"),
      hasIssue,
    };
  });
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function ensureReconciliationView() {
  if (document.getElementById("reconciliation-view")) return;

  const nav = document.querySelector(".nav-list");
  const payrollButton = document.querySelector('[data-view="payroll"]');
  const layoutsButton = document.querySelector('[data-view="layouts"]');
  const button = document.createElement("button");
  button.className = "nav-item";
  button.dataset.view = "reconciliation";
  button.type = "button";
  button.textContent = "Conciliacao";
  button.addEventListener("click", () => openView("reconciliation"));
  nav?.insertBefore(button, payrollButton?.nextSibling || layoutsButton || null);

  document.querySelector(".main-panel")?.insertAdjacentHTML(
    "beforeend",
    `
      <section class="view" id="reconciliation-view" aria-labelledby="reconciliation-title">
        <div class="section-heading row-heading">
          <div>
            <h2 id="reconciliation-title">Conciliacao do retorno da folha</h2>
            <p>Compare o que foi enviado para desconto com o que voltou processado pela folha.</p>
          </div>
          <button class="primary-button" id="reconciliation-audit-button" type="button">Registrar conferencia</button>
        </div>

        <div class="reconciliation-summary-grid" id="reconciliation-summary-grid"></div>

        <section class="panel reconciliation-panel">
          <div class="panel-heading">
            <h3>Contratos da competencia</h3>
          </div>
          <div class="reconciliation-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Contrato</th>
                  <th>Servidor</th>
                  <th>Status</th>
                  <th>Esperado</th>
                  <th>Descontado</th>
                  <th>Diferenca</th>
                </tr>
              </thead>
              <tbody id="reconciliation-table"></tbody>
            </table>
          </div>
        </section>

        <div class="content-grid reconciliation-content">
          <section class="panel">
            <div class="panel-heading">
              <h3>Pendencias geradas</h3>
            </div>
            <div class="reconciliation-list" id="reconciliation-issues"></div>
          </section>

          <section class="panel">
            <div class="panel-heading">
              <h3>Tratamento recomendado</h3>
            </div>
            <div class="reconciliation-list" id="reconciliation-actions"></div>
          </section>
        </div>
      </section>
    `
  );

  document.getElementById("reconciliation-audit-button")?.addEventListener("click", () => {
    auditEvent("Conferencia de retorno da folha registrada.", "Conciliacao");
    saveState();
    render();
    openView("reconciliation");
  });
}

function renderReconciliation() {
  ensureReconciliationView();

  const summary = document.getElementById("reconciliation-summary-grid");
  const table = document.getElementById("reconciliation-table");
  const issues = document.getElementById("reconciliation-issues");
  const actions = document.getElementById("reconciliation-actions");
  if (!summary || !table || !issues || !actions) return;

  const rows = getReconciliationRows();
  const expectedTotal = rows.reduce((total, row) => total + row.expected, 0);
  const discountedTotal = rows.reduce((total, row) => total + row.discounted, 0);
  const issueRows = rows.filter((row) => row.hasIssue);

  summary.innerHTML = [
    ["Contratos enviados", rows.length],
    ["Valor esperado", formatMoney(expectedTotal)],
    ["Valor descontado", formatMoney(discountedTotal)],
    ["Divergencias", issueRows.length],
  ]
    .map(
      ([label, value]) => `
        <article class="reconciliation-summary-card">
          <span>${label}</span>
          <strong>${value}</strong>
        </article>
      `
    )
    .join("");

  table.innerHTML = rows.length
    ? rows
        .map(
          (row) => `
            <tr>
              <td><strong>${row.id}</strong><span>${row.enrollment}</span></td>
              <td>${row.employee}</td>
              <td><span class="status ${contractStatusClass({ status: row.status }) || (row.hasIssue ? "warning" : "")}">${row.status}</span></td>
              <td>${formatMoney(row.expected)}</td>
              <td>${formatMoney(row.discounted)}</td>
              <td class="${row.hasIssue ? "reconciliation-diff" : ""}">${formatMoney(row.difference)}</td>
            </tr>
          `
        )
        .join("")
    : `<tr><td colspan="6">Nenhum contrato enviado para folha nesta competencia.</td></tr>`;

  issues.innerHTML = issueRows.length
    ? issueRows
        .map(
          (row) => `
            <div class="reconciliation-note">
              <strong>${row.id} - ${row.employee}</strong>
              <span>${row.reason}</span>
            </div>
          `
        )
        .join("")
    : `
      <div class="reconciliation-note">
        <strong>Sem pendencias de retorno</strong>
        <span>Os contratos enviados estao conciliados dentro da demonstracao atual.</span>
      </div>
    `;

  actions.innerHTML = `
    <div class="reconciliation-note">
      <strong>Rejeitado</strong>
      <span>Verificar motivo, corrigir cadastro/layout e decidir entre reenviar, cancelar ou liberar margem.</span>
    </div>
    <div class="reconciliation-note">
      <strong>Nao descontado</strong>
      <span>Manter contrato em acompanhamento e abrir pendencia para a proxima competencia.</span>
    </div>
    <div class="reconciliation-note">
      <strong>Valor divergente</strong>
      <span>Conferir rubrica, parcela esperada e retorno antes de confirmar fechamento.</span>
    </div>
  `;
}

const reconciliationStyle = document.createElement("style");
reconciliationStyle.textContent = `
  .reconciliation-summary-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(150px, 1fr));
    gap: 14px;
    margin-bottom: 18px;
  }
  .reconciliation-summary-card,
  .reconciliation-note {
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface-2);
  }
  .reconciliation-summary-card {
    padding: 16px;
    box-shadow: var(--shadow);
  }
  .reconciliation-summary-card span,
  .reconciliation-note span,
  #reconciliation-table td span {
    display: block;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.4;
  }
  .reconciliation-summary-card strong {
    display: block;
    margin-top: 8px;
    font-size: 22px;
  }
  .reconciliation-table-wrap {
    overflow-x: auto;
  }
  .reconciliation-content,
  .reconciliation-panel {
    margin-top: 18px;
  }
  .reconciliation-list {
    display: grid;
    gap: 10px;
  }
  .reconciliation-note {
    padding: 12px;
  }
  .reconciliation-note span {
    margin-top: 4px;
  }
  .reconciliation-diff {
    color: var(--danger);
    font-weight: 700;
  }
  @media (max-width: 1040px) {
    .reconciliation-summary-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 640px) {
    .reconciliation-summary-grid {
      grid-template-columns: 1fr;
    }
  }
`;
document.head.appendChild(reconciliationStyle);

const renderBeforeReconciliation = render;
render = function renderWithReconciliation() {
  renderBeforeReconciliation();
  renderReconciliation();
};

render();
