if (!pageTitles.reservations) {
  pageTitles.reservations = "Reservas";
}

["manager", "lender"].forEach((profile) => {
  if (!profileConfig[profile].views.includes("reservations")) {
    const contractsIndex = profileConfig[profile].views.indexOf("contracts");
    profileConfig[profile].views.splice(contractsIndex + 1, 0, "reservations");
  }
});

function ensureReservationLifecycleView() {
  if (document.getElementById("reservations-view")) return;

  const nav = document.querySelector(".nav-list");
  const importButton = document.querySelector('[data-view="import"]');
  const button = document.createElement("button");
  button.className = "nav-item";
  button.dataset.view = "reservations";
  button.type = "button";
  button.textContent = "Reservas";
  button.addEventListener("click", () => openView("reservations"));
  nav?.insertBefore(button, importButton || null);

  document.querySelector(".main-panel")?.insertAdjacentHTML(
    "beforeend",
    `
      <section class="view" id="reservations-view" aria-labelledby="reservations-title">
        <div class="section-heading row-heading">
          <div>
            <h2 id="reservations-title">Esteira de reservas</h2>
            <p>Acompanhe reservas desde a criacao ate envio para folha, retorno ou expiracao.</p>
          </div>
          <button class="primary-button" id="reservations-audit-button" type="button">Registrar conferencia</button>
        </div>

        <div class="reservation-summary-grid" id="reservation-summary-grid"></div>

        <div class="content-grid reservation-content">
          <section class="panel">
            <div class="panel-heading">
              <h3>Reservas em acompanhamento</h3>
            </div>
            <div class="reservation-list" id="reservation-list"></div>
          </section>

          <section class="panel">
            <div class="panel-heading">
              <h3>Regras da esteira</h3>
            </div>
            <div class="reservation-rules" id="reservation-rules"></div>
          </section>
        </div>
      </section>
    `
  );

  document.getElementById("reservations-audit-button")?.addEventListener("click", () => {
    auditEvent("Conferencia da esteira de reservas registrada.", "Reservas");
    saveState();
    render();
    openView("reservations");
  });
}

function getReservationLifecycleData() {
  const policy = state.conventionPolicy || {};
  const requiresCode = policy.requireAuthorizationForReservation;
  const contracts = state.currentProfile === "lender"
    ? state.contracts.filter((contract) => contract.lenderId === "lender-1")
    : state.contracts;
  const reserved = contracts.filter((contract) => contract.status === "Reservado");
  const sent = contracts.filter((contract) => contract.status === "Enviado para folha");
  const active = contracts.filter((contract) => ["Averbado", "Descontando"].includes(contract.status));
  const rejected = contracts.filter((contract) => ["Rejeitado", "Nao descontado"].includes(contract.status));
  const activeCodes = state.authorizationCodes.filter((authorization) => authorization.status === "Ativo");

  const rows = contracts
    .filter((contract) => ["Reservado", "Enviado para folha", "Rejeitado", "Nao descontado"].includes(contract.status))
    .map((contract) => {
      const employee = employeeById(contract.employeeId);
      const margin = employee ? calculateMargin(employee) : null;
      const code = activeCodes.find((authorization) => authorization.employeeId === contract.employeeId);
      const needsAction = contract.status === "Reservado" || ["Rejeitado", "Nao descontado"].includes(contract.status);
      return {
        contract,
        employee,
        margin,
        code,
        needsAction,
      };
    });

  return { requiresCode, reserved, sent, active, rejected, activeCodes, rows };
}

function renderReservationLifecycle() {
  ensureReservationLifecycleView();

  const summary = document.getElementById("reservation-summary-grid");
  const list = document.getElementById("reservation-list");
  const rules = document.getElementById("reservation-rules");
  if (!summary || !list || !rules) return;

  const data = getReservationLifecycleData();
  const cards = [
    ["Reservadas", data.reserved.length, data.reserved.length ? "warning" : ""],
    ["Enviadas a folha", data.sent.length, data.sent.length ? "warning" : ""],
    ["Ativas", data.active.length, ""],
    ["Com pendencia", data.rejected.length, data.rejected.length ? "danger" : ""],
  ];

  summary.innerHTML = cards
    .map(
      ([label, value, className]) => `
        <article class="reservation-summary-card">
          <span>${label}</span>
          <strong class="${className}">${value}</strong>
        </article>
      `
    )
    .join("");

  list.innerHTML = data.rows.length
    ? data.rows
        .map(({ contract, employee, margin, code, needsAction }) => {
          const statusClass = ["Rejeitado", "Nao descontado"].includes(contract.status)
            ? "danger"
            : contract.status === "Reservado" || contract.status === "Enviado para folha"
              ? "warning"
              : "";
          return `
            <article class="reservation-item">
              <div>
                <div class="reservation-item-heading">
                  <strong>${contract.id}</strong>
                  <span class="status ${statusClass}">${contract.status}</span>
                </div>
                <p>${employee?.name ?? "Servidor removido"} - ${lenderName(contract.lenderId)} - parcela de ${money.format(contract.installment)}</p>
                <small>
                  ${margin ? `Margem disponivel: ${money.format(margin.available)}.` : "Margem indisponivel."}
                  ${code ? ` Codigo ativo: ${code.code}.` : data.requiresCode ? " Sem codigo ativo." : " Codigo opcional."}
                  ${contract.returnReason ? ` Motivo: ${contract.returnReason}.` : ""}
                </small>
              </div>
              <button class="secondary-button reservation-open" data-target-view="${needsAction ? "contracts" : "payroll"}" type="button">
                Abrir
              </button>
            </article>
          `;
        })
        .join("")
    : `<div class="empty-state">Nenhuma reserva pendente na esteira atual.</div>`;

  rules.innerHTML = `
    <div class="reservation-rule">
      <strong>Codigo do servidor</strong>
      <span>${data.requiresCode ? "Obrigatorio para criar reserva neste convenio." : "Opcional: convenio permite reserva imediata."}</span>
    </div>
    <div class="reservation-rule">
      <strong>Envio para folha</strong>
      <span>Reservas validas devem entrar no arquivo de insercao da competencia.</span>
    </div>
    <div class="reservation-rule">
      <strong>Retorno com erro</strong>
      <span>Rejeicao ou nao desconto deve liberar margem ou voltar para tratamento manual.</span>
    </div>
    <div class="reservation-rule">
      <strong>Auditoria</strong>
      <span>Cada excecao deve registrar perfil, origem e decisao operacional.</span>
    </div>
  `;

  document.querySelectorAll(".reservation-open").forEach((button) => {
    button.addEventListener("click", () => openView(button.dataset.targetView));
  });
}

const reservationStyle = document.createElement("style");
reservationStyle.textContent = `
  .reservation-summary-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(150px, 1fr));
    gap: 14px;
    margin-bottom: 18px;
  }
  .reservation-summary-card {
    padding: 16px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
    box-shadow: var(--shadow);
  }
  .reservation-summary-card span {
    display: block;
    color: var(--muted);
    font-size: 13px;
  }
  .reservation-summary-card strong {
    display: block;
    margin-top: 8px;
    font-size: 26px;
  }
  .reservation-summary-card strong.warning {
    color: var(--accent);
  }
  .reservation-summary-card strong.danger {
    color: var(--danger);
  }
  .reservation-list,
  .reservation-rules {
    display: grid;
    gap: 10px;
  }
  .reservation-item {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 12px;
    align-items: center;
    padding: 12px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface-2);
  }
  .reservation-item-heading {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .reservation-item p,
  .reservation-item small,
  .reservation-rule span {
    display: block;
    margin: 4px 0 0;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.4;
  }
  .reservation-rule {
    padding: 12px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface-2);
  }
  @media (max-width: 1040px) {
    .reservation-summary-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 640px) {
    .reservation-summary-grid,
    .reservation-item {
      grid-template-columns: 1fr;
    }
  }
`;
document.head.appendChild(reservationStyle);

const renderBeforeReservationLifecycle = render;
render = function renderWithReservationLifecycle() {
  renderBeforeReservationLifecycle();
  renderReservationLifecycle();
};

render();
