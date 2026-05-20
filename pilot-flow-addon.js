if (!pageTitles.pilot) {
  pageTitles.pilot = "Fluxo piloto";
}

if (!profileConfig.manager.views.includes("pilot")) {
  const queueIndex = profileConfig.manager.views.indexOf("queue");
  profileConfig.manager.views.splice(queueIndex >= 0 ? queueIndex + 1 : 1, 0, "pilot");
}

function getPilotFlowSteps() {
  const employees = state.employees || [];
  const contracts = state.contracts || [];
  const movements = state.movements || [];
  const reserved = contracts.filter((contract) => contract.status === "Reservado");
  const sent = contracts.filter((contract) => contract.status === "Enviado para folha");
  const active = contracts.filter((contract) => ["Averbado", "Descontando"].includes(contract.status));
  const rejected = contracts.filter((contract) => ["Rejeitado", "Nao descontado"].includes(contract.status));
  const hasMarginImport = movements.some((movement) => /margem|folha/i.test(`${movement.text} ${movement.source || ""}`));
  const hasInsertion = movements.some((movement) => /insercao/i.test(`${movement.text} ${movement.source || ""}`));
  const hasReturn = movements.some((movement) => /retorno/i.test(`${movement.text} ${movement.source || ""}`)) || rejected.length > 0 || active.length > 0;

  return [
    {
      label: "1. Importar margem",
      status: employees.length ? "Pronto para testar" : "Pendente",
      className: employees.length ? "" : "warning",
      target: "import",
      detail: employees.length
        ? `${employees.length} servidor(es) disponiveis para calculo de margem.`
        : "Importe ou carregue dados exemplo para iniciar o ciclo.",
      done: employees.length > 0 || hasMarginImport,
    },
    {
      label: "2. Validar servidor",
      status: employees.some((employee) => employee.status === "Em revisao") ? "Requer atencao" : "Controlado",
      className: employees.some((employee) => employee.status === "Em revisao") ? "warning" : "",
      target: "identity",
      detail: "Confere se o servidor existe, esta ativo e pode operar no convenio.",
      done: employees.length > 0,
    },
    {
      label: "3. Simular e reservar",
      status: reserved.length || sent.length || active.length ? "Com operacao" : "Aguardando reserva",
      className: reserved.length || sent.length || active.length ? "" : "warning",
      target: "simulation",
      detail: `${contracts.length} contrato(s) no ambiente, sendo ${reserved.length} reserva(s) aberta(s).`,
      done: contracts.length > 0,
    },
    {
      label: "4. Gerar insercao",
      status: sent.length || hasInsertion ? "Enviado para folha" : reserved.length ? "Pronto para gerar" : "Aguardando reserva",
      className: sent.length || hasInsertion ? "" : "warning",
      target: "import",
      detail: "Transforma reservas em descontos que devem entrar na folha.",
      done: sent.length > 0 || hasInsertion,
    },
    {
      label: "5. Processar retorno",
      status: hasReturn ? "Retorno recebido" : sent.length ? "Aguardando retorno" : "Nao iniciado",
      className: hasReturn ? "" : "warning",
      target: "import",
      detail: `${active.length} contrato(s) descontando e ${rejected.length} com pendencia de retorno.`,
      done: hasReturn,
    },
    {
      label: "6. Auditar competencia",
      status: movements.length ? "Com trilha" : "Sem eventos",
      className: movements.length ? "" : "warning",
      target: "audit",
      detail: `${movements.length} evento(s) registrados na auditoria operacional.`,
      done: movements.length > 0,
    },
  ];
}

function ensurePilotFlowView() {
  if (document.getElementById("pilot-view")) return;

  const nav = document.querySelector(".nav-list");
  const employeesButton = document.querySelector('[data-view="employees"]');
  const queueButton = document.querySelector('[data-view="queue"]');
  const button = document.createElement("button");
  button.className = "nav-item";
  button.dataset.view = "pilot";
  button.type = "button";
  button.textContent = "Fluxo piloto";
  button.addEventListener("click", () => openView("pilot"));
  nav?.insertBefore(button, employeesButton || queueButton?.nextSibling || null);

  document.querySelector(".main-panel")?.insertAdjacentHTML(
    "beforeend",
    `
      <section class="view" id="pilot-view" aria-labelledby="pilot-title">
        <div class="section-heading row-heading">
          <div>
            <h2 id="pilot-title">Fluxo piloto de competencia</h2>
            <p>Teste o ciclo completo: margem, validacao, reserva, insercao, retorno e auditoria.</p>
          </div>
          <button class="primary-button" id="pilot-audit-button" type="button">Registrar teste</button>
        </div>

        <div class="pilot-summary-grid" id="pilot-summary-grid"></div>

        <section class="panel pilot-panel">
          <div class="panel-heading">
            <h3>Roteiro operacional</h3>
          </div>
          <div class="pilot-step-list" id="pilot-step-list"></div>
        </section>

        <div class="content-grid pilot-content">
          <section class="panel">
            <div class="panel-heading">
              <h3>Criterios para piloto</h3>
            </div>
            <div class="pilot-notes" id="pilot-criteria"></div>
          </section>

          <section class="panel">
            <div class="panel-heading">
              <h3>Riscos antes de cliente real</h3>
            </div>
            <div class="pilot-notes" id="pilot-risks"></div>
          </section>
        </div>
      </section>
    `
  );

  document.getElementById("pilot-audit-button")?.addEventListener("click", () => {
    auditEvent("Teste do fluxo piloto registrado.", "Fluxo piloto");
    saveState();
    render();
    openView("pilot");
  });
}

function renderPilotFlow() {
  ensurePilotFlowView();

  const summary = document.getElementById("pilot-summary-grid");
  const list = document.getElementById("pilot-step-list");
  const criteria = document.getElementById("pilot-criteria");
  const risks = document.getElementById("pilot-risks");
  if (!summary || !list || !criteria || !risks) return;

  const steps = getPilotFlowSteps();
  const done = steps.filter((step) => step.done).length;
  const pending = steps.length - done;
  const contracts = state.contracts || [];
  const rejected = contracts.filter((contract) => ["Rejeitado", "Nao descontado"].includes(contract.status)).length;

  const cards = [
    ["Etapas", steps.length],
    ["Concluidas", done],
    ["Pendentes", pending],
    ["Retornos criticos", rejected],
  ];

  summary.innerHTML = cards
    .map(
      ([label, value]) => `
        <article class="pilot-summary-card">
          <span>${label}</span>
          <strong>${value}</strong>
        </article>
      `
    )
    .join("");

  list.innerHTML = steps
    .map(
      (step) => `
        <article class="pilot-step">
          <div class="pilot-step-status ${step.done ? "done" : ""}">${step.done ? "OK" : "!"}</div>
          <div>
            <strong>${step.label}</strong>
            <span>${step.detail}</span>
          </div>
          <span class="status ${step.className}">${step.status}</span>
          <button class="secondary-button pilot-jump" data-target-view="${step.target}" type="button">Abrir</button>
        </article>
      `
    )
    .join("");

  document.querySelectorAll(".pilot-jump").forEach((button) => {
    button.addEventListener("click", () => openView(button.dataset.targetView));
  });

  criteria.innerHTML = `
    <div class="pilot-note">
      <strong>Fluxo minimo</strong>
      <span>O piloto precisa provar uma competencia completa sem ajuste manual invisivel.</span>
    </div>
    <div class="pilot-note">
      <strong>Dados rastreaveis</strong>
      <span>Cada contrato deve manter servidor, produto, rubrica, consignataria, competencia e status.</span>
    </div>
    <div class="pilot-note">
      <strong>Retorno explicado</strong>
      <span>Todo desconto nao processado precisa virar pendencia com motivo claro e proxima acao.</span>
    </div>
  `;

  risks.innerHTML = `
    <div class="pilot-note">
      <strong>Persistencia real</strong>
      <span>A versao estatica demonstra o produto, mas operacao real exigira backend, banco e controle de login.</span>
    </div>
    <div class="pilot-note">
      <strong>Homologacao da folha</strong>
      <span>Antes de cliente real, cada convenio precisa validar layout, rubricas e codigos de retorno.</span>
    </div>
    <div class="pilot-note">
      <strong>Seguranca</strong>
      <span>Consulta de margem, reserva e arquivos de folha devem ter autorizacao, logs e permissao por perfil.</span>
    </div>
  `;
}

const pilotStyle = document.createElement("style");
pilotStyle.textContent = `
  .pilot-summary-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(150px, 1fr));
    gap: 14px;
    margin-bottom: 18px;
  }
  .pilot-summary-card,
  .pilot-step,
  .pilot-note {
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
  }
  .pilot-summary-card {
    padding: 16px;
    box-shadow: var(--shadow);
  }
  .pilot-summary-card span,
  .pilot-step span,
  .pilot-note span {
    display: block;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.4;
  }
  .pilot-summary-card strong {
    display: block;
    margin-top: 8px;
    font-size: 26px;
  }
  .pilot-step-list,
  .pilot-notes {
    display: grid;
    gap: 10px;
  }
  .pilot-step {
    display: grid;
    grid-template-columns: 42px 1fr auto auto;
    gap: 12px;
    align-items: center;
    padding: 12px;
    background: var(--surface-2);
  }
  .pilot-step-status {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 999px;
    background: #fff7ed;
    color: #9a3412;
    font-weight: 800;
    font-size: 12px;
  }
  .pilot-step-status.done {
    background: #ecfdf3;
    color: #047857;
  }
  .pilot-note {
    padding: 12px;
    background: var(--surface-2);
  }
  .pilot-note span {
    margin-top: 4px;
  }
  @media (max-width: 1040px) {
    .pilot-summary-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .pilot-step {
      grid-template-columns: 42px 1fr;
    }
    .pilot-step .status,
    .pilot-step .pilot-jump {
      grid-column: 2;
      justify-self: start;
    }
  }
  @media (max-width: 640px) {
    .pilot-summary-grid {
      grid-template-columns: 1fr;
    }
  }
`;
document.head.appendChild(pilotStyle);

const renderBeforePilotFlow = render;
render = function renderWithPilotFlow() {
  renderBeforePilotFlow();
  renderPilotFlow();
};

render();
