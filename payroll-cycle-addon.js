if (!pageTitles.payroll) {
  pageTitles.payroll = "Competencias";
}

if (!profileConfig.manager.views.includes("payroll")) {
  const importIndex = profileConfig.manager.views.indexOf("import");
  profileConfig.manager.views.splice(importIndex + 1, 0, "payroll");
}

function ensurePayrollCycleView() {
  if (document.getElementById("payroll-view")) return;

  const nav = document.querySelector(".nav-list");
  const simulationButton = document.querySelector('[data-view="simulation"]');
  const button = document.createElement("button");
  button.className = "nav-item";
  button.dataset.view = "payroll";
  button.type = "button";
  button.textContent = "Competencias";
  button.addEventListener("click", () => openView("payroll"));
  nav?.insertBefore(button, simulationButton || null);

  document.querySelector(".main-panel")?.insertAdjacentHTML(
    "beforeend",
    `
      <section class="view" id="payroll-view" aria-labelledby="payroll-title">
        <div class="section-heading row-heading">
          <div>
            <h2 id="payroll-title">Competencias da folha</h2>
            <p>Controle mensal do ciclo: margem recebida, insercao enviada, retorno processado e fechamento.</p>
          </div>
          <button class="primary-button" id="payroll-close-button" type="button">Simular fechamento</button>
        </div>

        <div class="payroll-summary-grid" id="payroll-summary-grid"></div>

        <section class="panel payroll-cycle-panel">
          <div class="panel-heading">
            <h3>Ciclo da competencia atual</h3>
          </div>
          <div class="payroll-steps" id="payroll-steps"></div>
        </section>

        <div class="content-grid payroll-content">
          <section class="panel">
            <div class="panel-heading">
              <h3>Pendencias antes do fechamento</h3>
            </div>
            <div class="payroll-list" id="payroll-pending-list"></div>
          </section>

          <section class="panel">
            <div class="panel-heading">
              <h3>Regras de fechamento</h3>
            </div>
            <div class="payroll-list" id="payroll-closing-rules"></div>
          </section>
        </div>
      </section>
    `
  );

  document.getElementById("payroll-close-button")?.addEventListener("click", () => {
    auditEvent("Fechamento de competencia simulado para validacao do fluxo da folha.", "Competencia");
    saveState();
    render();
    openView("payroll");
  });
}

function getPayrollCycleData() {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const reserved = state.contracts.filter((contract) => marginReservationStatuses.includes(contract.status));
  const sent = state.contracts.filter((contract) => contract.status === "Enviado para folha");
  const discounted = state.contracts.filter((contract) => contract.status === "Descontando");
  const rejected = state.contracts.filter(contractHasReturnIssue);
  const reviewEmployees = state.employees.filter((employee) => employee.status === "Em revisao");

  const steps = [
    {
      title: "1. Arquivo de margem",
      status: state.employees.length ? "Recebido" : "Pendente",
      className: state.employees.length ? "" : "warning",
      detail: `${state.employees.length} servidor(es) na base atual.`,
    },
    {
      title: "2. Reservas da competencia",
      status: reserved.length ? "Com reservas" : "Sem reservas",
      className: reserved.length ? "warning" : "",
      detail: `${reserved.length} reserva(s) ainda aguardam envio ou decisao.`,
    },
    {
      title: "3. Insercao enviada",
      status: sent.length ? "Aguardando retorno" : "Nao enviada",
      className: sent.length ? "warning" : "",
      detail: `${sent.length} contrato(s) enviados para folha.`,
    },
    {
      title: "4. Retorno processado",
      status: rejected.length ? "Com pendencia" : discounted.length ? "Processado" : "Pendente",
      className: rejected.length ? "danger" : discounted.length ? "" : "warning",
      detail: `${discounted.length} descontando, ${rejected.length} com rejeicao/nao desconto.`,
    },
  ];

  const pending = [];
  if (reserved.length) pending.push([`${reserved.length} reserva(s) sem insercao`, "Gerar arquivo de insercao ou cancelar reservas expiradas."]);
  if (sent.length) pending.push([`${sent.length} contrato(s) sem retorno`, "Aguardar retorno da folha ou registrar processamento manual."]);
  if (rejected.length) pending.push([`${rejected.length} retorno(s) com pendencia`, "Tratar motivo, reprocessar ou liberar margem conforme regra."]);
  if (reviewEmployees.length) pending.push([`${reviewEmployees.length} servidor(es) em revisao`, "Conferir vinculo e base de calculo antes do fechamento."]);
  if (!pending.length) pending.push(["Sem pendencias criticas", "Competencia pronta para revisao final no MVP."]);

  return { currentMonth, reserved, sent, discounted, rejected, reviewEmployees, steps, pending };
}

function renderPayrollCycle() {
  ensurePayrollCycleView();

  const summary = document.getElementById("payroll-summary-grid");
  const steps = document.getElementById("payroll-steps");
  const pending = document.getElementById("payroll-pending-list");
  const closingRules = document.getElementById("payroll-closing-rules");
  if (!summary || !steps || !pending || !closingRules) return;

  const cycle = getPayrollCycleData();

  summary.innerHTML = [
    ["Competencia", cycle.currentMonth],
    ["Reservas abertas", cycle.reserved.length],
    ["Aguardando retorno", cycle.sent.length],
    ["Pendencias", cycle.rejected.length + cycle.reviewEmployees.length],
  ]
    .map(
      ([label, value]) => `
        <article class="panel payroll-summary-card">
          <span>${label}</span>
          <strong>${value}</strong>
        </article>
      `
    )
    .join("");

  steps.innerHTML = cycle.steps
    .map(
      (step) => `
        <article class="payroll-step">
          <span class="status ${step.className}">${step.status}</span>
          <strong>${step.title}</strong>
          <p>${step.detail}</p>
        </article>
      `
    )
    .join("");

  pending.innerHTML = cycle.pending
    .map(
      ([title, description]) => `
        <div class="payroll-note">
          <strong>${title}</strong>
          <span>${description}</span>
        </div>
      `
    )
    .join("");

  closingRules.innerHTML = [
    ["Nao fechar com retorno pendente", "Contratos enviados para folha precisam ter retorno processado ou justificativa."],
    ["Nao fechar com servidor em revisao", "Margem em revisao deve ser tratada ou formalmente liberada."],
    ["Congelar posicao da competencia", "Apos fechamento, alteracoes devem entrar como ajuste auditado."],
    ["Gerar resumo de divergencias", "Rejeicoes, nao descontos e contratos nao localizados precisam de relatorio."],
  ]
    .map(
      ([title, description]) => `
        <div class="payroll-note">
          <strong>${title}</strong>
          <span>${description}</span>
        </div>
      `
    )
    .join("");
}

const payrollStyle = document.createElement("style");
payrollStyle.textContent = `
  .payroll-summary-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
  }
  .payroll-summary-card {
    min-height: 110px;
  }
  .payroll-summary-card span {
    display: block;
    color: var(--muted);
    font-size: 13px;
    margin-bottom: 10px;
  }
  .payroll-summary-card strong {
    font-size: 26px;
  }
  .payroll-cycle-panel,
  .payroll-content {
    margin-top: 18px;
  }
  .payroll-steps {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }
  .payroll-step,
  .payroll-note {
    display: grid;
    gap: 8px;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface-soft);
  }
  .payroll-step p,
  .payroll-note span {
    margin: 0;
    color: var(--muted);
    font-size: 13px;
  }
  .payroll-list {
    display: grid;
    gap: 12px;
  }
  @media (max-width: 1100px) {
    .payroll-summary-grid,
    .payroll-steps {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 720px) {
    .payroll-summary-grid,
    .payroll-steps {
      grid-template-columns: 1fr;
    }
  }
`;
document.head.appendChild(payrollStyle);

const renderBeforePayrollCycle = render;
render = function renderWithPayrollCycle() {
  renderBeforePayrollCycle();
  ensurePayrollCycleView();
  renderPayrollCycle();
};

render();
