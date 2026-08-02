if (!pageTitles.demo) {
  pageTitles.demo = "Massa teste";
}

if (!profileConfig.manager.views.includes("demo")) {
  const qaIndex = profileConfig.manager.views.indexOf("qa");
  profileConfig.manager.views.splice(qaIndex >= 0 ? qaIndex + 1 : 3, 0, "demo");
}

function cloneInitialState() {
  return structuredClone(initialState);
}

function getDemoScenarios() {
  return [
    {
      id: "base",
      title: "Base limpa para demonstracao",
      tag: "Inicio",
      description: "Restaura a massa padrao com servidores, contratos, reserva aberta, ticket e codigo ativo.",
      result: "Bom para iniciar a apresentacao do zero e explicar cada modulo.",
    },
    {
      id: "competence-ok",
      title: "Competencia processada com sucesso",
      tag: "Fluxo feliz",
      description: "Simula reserva enviada para folha e retorno descontado, com auditoria do ciclo completo.",
      result: "Mostra o caminho ideal: margem recebida, reserva, insercao, retorno e contrato descontando.",
    },
    {
      id: "return-rejected",
      title: "Retorno com rejeicao",
      tag: "Pendencia",
      description: "Cria um contrato rejeitado pela folha com motivo operacional para alimentar fila de pendencias.",
      result: "Ajuda a demonstrar tratamento de excecao, suporte, retorno e proxima acao.",
    },
    {
      id: "margin-risk",
      title: "Margem em atencao",
      tag: "Risco",
      description: "Gera um servidor com margem pressionada, revisao ativa e contrato nao descontado.",
      result: "Bom para mostrar seguranca, bloqueios, saude da margem e fila operacional.",
    },
  ];
}

function demoValidationDetail(overrides = {}) {
  return {
    line: overrides.line || 2,
    cpf: overrides.cpf || "123.456.789-10",
    enrollment: overrides.enrollment || "MAT-1001",
    name: overrides.name || "Ana Paula Santos",
    contractId: overrides.contractId || "RSV-2026-003",
    competency: overrides.competency || today().slice(0, 7),
    status: overrides.status || "Apto",
    critical: overrides.critical || [],
    warnings: overrides.warnings || [],
    reason: overrides.reason || "Linha apta para demonstracao.",
    category: overrides.category || "ok",
  };
}

function applyDemoValidationArtifacts(kind) {
  const competency = today().slice(0, 7);

  state.demoScriptChecks = [];
  state.lastMarginValidation = {
    processedAt: today(),
    totalRows: state.employees.length,
    critical: 0,
    warnings: state.employees.filter((employee) => employee.status === "Em revisao").length,
    blocked: false,
    details: state.employees.map((employee, index) =>
      demoValidationDetail({
        line: index + 2,
        cpf: employee.cpf,
        enrollment: employee.enrollment,
        name: employee.name,
        status: employee.status === "Em revisao" ? "Revisar" : "Apto",
        warnings: employee.status === "Em revisao" ? ["Servidor importado em revisao"] : [],
      })
    ),
  };

  state.lastInsertionValidation = {
    processedAt: today(),
    totalRows: 1,
    critical: 0,
    warnings: kind === "base" ? 1 : 0,
    blocked: false,
    details: [
      {
        contractId: "RSV-2026-003",
        competency,
        status: kind === "base" ? "Revisar" : "Apto",
        critical: [],
        warnings: kind === "base" ? ["Primeiro vencimento nao informado"] : [],
      },
    ],
  };

  state.lastReturnReconciliation = {
    processedAt: today(),
    blocked: false,
    totalRows: kind === "base" ? 0 : 1,
    ok: kind === "competence-ok" ? 1 : 0,
    invalid: 0,
    divergent: 0,
    pending: ["return-rejected", "margin-risk"].includes(kind) ? 1 : 0,
    duplicate: 0,
    notFound: 0,
    details:
      kind === "base"
        ? []
        : [
            {
              contractId: kind === "return-rejected" ? "RSV-2026-004" : kind === "margin-risk" ? "CTR-2026-005" : "RSV-2026-003",
              competency,
              status: kind === "competence-ok" ? "Descontando" : "Nao descontado",
              amount: kind === "competence-ok" ? 210 : 0,
              expected: kind === "margin-risk" ? 680 : kind === "return-rejected" ? 380 : 210,
              difference: kind === "competence-ok" ? 0 : kind === "margin-risk" ? -680 : -380,
              reason:
                kind === "competence-ok"
                  ? "Conciliado."
                  : kind === "margin-risk"
                    ? "Margem insuficiente apos atualizacao da base."
                    : "Matricula sem vinculo ativo na competencia informada.",
              category: kind === "competence-ok" ? "ok" : "pending",
            },
          ],
  };
}

function applyDemoScenario(scenarioId) {
  state = cloneInitialState();
  state.currentProfile = "manager";
  normalizeState();
  applyDemoValidationArtifacts(scenarioId);

  if (scenarioId === "competence-ok") {
    state.contracts = state.contracts.map((contract) => {
      if (contract.id !== "RSV-2026-003") return contract;
      return {
        ...contract,
        status: "Descontando",
        currentInstallment: 1,
        sentToPayrollAt: today(),
        returnProcessedAt: today(),
        discountedValue: contract.installment,
        returnReason: "Desconto processado com sucesso.",
        installmentHistory: [
          {
            competency: today().slice(0, 7),
            status: "Descontando",
            amount: contract.installment,
            reason: "Processado pela massa de teste.",
            duplicate: false,
            processedAt: today(),
          },
        ],
      };
    });
    state.movements.unshift(
      {
        date: today(),
        text: "Arquivo de insercao gerado com 1 desconto para a folha.",
        profile: "Gestor/RH",
        source: "Arquivo de insercao",
      },
      {
        date: today(),
        text: "Arquivo retorno processado: 1 contrato, 1 descontado, 0 com pendencia.",
        profile: "Gestor/RH",
        source: "Arquivo retorno",
      }
    );
  }

  if (scenarioId === "return-rejected") {
    state.contracts.push({
      id: "RSV-2026-004",
      employeeId: "emp-2",
      lenderId: "lender-4",
      installment: 380,
      installments: 48,
      status: "Rejeitado",
      createdAt: today(),
      sentToPayrollAt: today(),
      returnProcessedAt: today(),
      discountedValue: 0,
      returnReason: "Matricula sem vinculo ativo na competencia informada.",
      installmentHistory: [
        {
          competency: today().slice(0, 7),
          status: "Rejeitado",
          amount: 0,
          reason: "Matricula sem vinculo ativo na competencia informada.",
          duplicate: false,
          processedAt: today(),
        },
      ],
    });
    state.tickets.unshift({
      id: "SUP-002",
      employeeId: "emp-2",
      type: "Erro de desconto",
      description: "Contrato rejeitado pela folha por divergencia de matricula.",
      status: "Aberto",
      createdAt: today(),
    });
    state.movements.unshift({
      date: today(),
      text: "Retorno com rejeicao criado para demonstracao de pendencia operacional.",
      profile: "Gestor/RH",
      source: "Massa de teste",
    });
  }

  if (scenarioId === "margin-risk") {
    state.employees = state.employees.map((employee) => {
      if (employee.id !== "emp-3") return employee;
      return {
        ...employee,
        income: 2800,
        mandatoryDeductions: 740,
        status: "Em revisao",
      };
    });
    state.contracts.push({
      id: "CTR-2026-005",
      employeeId: "emp-3",
      lenderId: "lender-2",
      installment: 680,
      installments: 72,
      status: "Nao descontado",
      createdAt: today(),
      returnProcessedAt: today(),
      discountedValue: 0,
      returnReason: "Margem insuficiente apos atualizacao da base.",
      installmentHistory: [
        {
          competency: today().slice(0, 7),
          status: "Nao descontado",
          amount: 0,
          reason: "Margem insuficiente apos atualizacao da base.",
          duplicate: false,
          processedAt: today(),
        },
      ],
    });
    state.movements.unshift({
      date: today(),
      text: "Cenario de margem em atencao aplicado para teste de bloqueios e pendencias.",
      profile: "Gestor/RH",
      source: "Massa de teste",
    });
  }

  if (scenarioId === "base") {
    state.movements.unshift({
      date: today(),
      text: "Massa padrao restaurada para demonstracao.",
      profile: "Gestor/RH",
      source: "Massa de teste",
    });
  }

  saveState();
  render();
  openView("demo");
}

window.applyDemoScenario = applyDemoScenario;

function ensureDemoDataView() {
  if (document.getElementById("demo-view")) return;

  const nav = document.querySelector(".nav-list");
  const qaButton = document.querySelector('[data-view="qa"]');
  const employeesButton = document.querySelector('[data-view="employees"]');
  const button = document.createElement("button");
  button.className = "nav-item";
  button.dataset.view = "demo";
  button.type = "button";
  button.textContent = "Massa teste";
  button.addEventListener("click", () => openView("demo"));
  nav?.insertBefore(button, qaButton?.nextSibling || employeesButton || null);

  document.querySelector(".main-panel")?.insertAdjacentHTML(
    "beforeend",
    `
      <section class="view" id="demo-view" aria-labelledby="demo-title">
        <div class="section-heading row-heading">
          <div>
            <h2 id="demo-title">Massa de teste</h2>
            <p>Escolha cenarios prontos para demonstrar, validar e comparar comportamentos do MVP.</p>
          </div>
          <button class="primary-button" id="demo-refresh-button" type="button">Atualizar leitura</button>
        </div>

        <div class="demo-summary-grid" id="demo-summary-grid"></div>

        <section class="panel demo-panel">
          <div class="panel-heading">
            <h3>Cenarios prontos</h3>
          </div>
          <div class="demo-list" id="demo-list"></div>
        </section>

        <div class="content-grid demo-content">
          <section class="panel">
            <div class="panel-heading">
              <h3>Quando usar</h3>
            </div>
            <div class="demo-notes" id="demo-usage"></div>
          </section>

          <section class="panel">
            <div class="panel-heading">
              <h3>Cuidados</h3>
            </div>
            <div class="demo-notes" id="demo-care"></div>
          </section>
        </div>
      </section>
    `
  );

  document.getElementById("demo-refresh-button")?.addEventListener("click", () => {
    render();
    openView("demo");
  });
}

function renderDemoData() {
  ensureDemoDataView();

  const summary = document.getElementById("demo-summary-grid");
  const list = document.getElementById("demo-list");
  const usage = document.getElementById("demo-usage");
  const care = document.getElementById("demo-care");
  if (!summary || !list || !usage || !care) return;

  const contracts = state.contracts || [];
  const pending = contracts.filter(contractHasReturnIssue).length;
  const reserved = contracts.filter((contract) => marginReservationStatuses.includes(contract.status)).length;
  const sent = contracts.filter((contract) => contract.status === "Enviado para folha").length;
  const active = contracts.filter((contract) => marginUsageStatuses.includes(contract.status) && contract.status !== "Enviado para folha").length;

  const cards = [
    ["Servidores", state.employees.length],
    ["Contratos", contracts.length],
    ["Reservas/envios", reserved + sent],
    ["Pendencias", pending],
  ];

  summary.innerHTML = cards
    .map(
      ([label, value]) => `
        <article class="demo-summary-card">
          <span>${label}</span>
          <strong>${value}</strong>
        </article>
      `
    )
    .join("");

  list.innerHTML = getDemoScenarios()
    .map(
      (scenario) => `
        <article class="demo-row">
          <div>
            <strong>${scenario.title}</strong>
            <span>${scenario.description}</span>
          </div>
          <span class="status">${scenario.tag}</span>
          <p>${scenario.result}</p>
          <button class="secondary-button demo-apply" data-scenario="${scenario.id}" type="button">Aplicar</button>
        </article>
      `
    )
    .join("");

  document.querySelectorAll(".demo-apply").forEach((button) => {
    button.addEventListener("click", () => applyDemoScenario(button.dataset.scenario));
  });

  usage.innerHTML = `
    <div class="demo-note">
      <strong>Apresentacao</strong>
      <span>Comece pela base limpa, depois mostre fluxo feliz e finalize com retorno rejeitado.</span>
    </div>
    <div class="demo-note">
      <strong>Teste funcional</strong>
      <span>Depois de aplicar um cenario, confira Fluxo piloto, Homologacao, Pendencias e Auditoria.</span>
    </div>
    <div class="demo-note">
      <strong>Comparacao</strong>
      <span>Use os cenarios para demonstrar que o sistema explica a regra sem exigir navegacao excessiva.</span>
    </div>
  `;

  care.innerHTML = `
    <div class="demo-note">
      <strong>Substitui dados atuais</strong>
      <span>Aplicar um cenario restaura a massa de exemplo antes de montar o caso escolhido.</span>
    </div>
    <div class="demo-note">
      <strong>Nao e dado real</strong>
      <span>CPF, matricula, valores e contratos sao ficticios e servem somente para demonstracao.</span>
    </div>
    <div class="demo-note">
      <strong>Operacao real</strong>
      <span>Em producao, massas de teste devem ficar separadas por ambiente e nunca misturadas ao convenio real.</span>
    </div>
  `;
}

const demoStyle = document.createElement("style");
demoStyle.textContent = `
  .demo-summary-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(150px, 1fr));
    gap: 14px;
    margin-bottom: 18px;
  }
  .demo-summary-card,
  .demo-row,
  .demo-note {
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
  }
  .demo-summary-card {
    padding: 16px;
    box-shadow: var(--shadow);
  }
  .demo-summary-card span,
  .demo-row span,
  .demo-row p,
  .demo-note span {
    display: block;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.4;
  }
  .demo-summary-card strong {
    display: block;
    margin-top: 8px;
    font-size: 26px;
  }
  .demo-list,
  .demo-notes {
    display: grid;
    gap: 10px;
  }
  .demo-row {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: 12px;
    align-items: center;
    padding: 12px;
    background: var(--surface-2);
  }
  .demo-row p {
    grid-column: 1 / -1;
    margin: 0;
  }
  .demo-note {
    padding: 12px;
    background: var(--surface-2);
  }
  .demo-note span {
    margin-top: 4px;
  }
  @media (max-width: 1040px) {
    .demo-summary-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .demo-row {
      grid-template-columns: 1fr;
    }
    .demo-row .status,
    .demo-row .demo-apply {
      justify-self: start;
    }
  }
  @media (max-width: 640px) {
    .demo-summary-grid {
      grid-template-columns: 1fr;
    }
  }
`;
document.head.appendChild(demoStyle);

const renderBeforeDemoData = render;
render = function renderWithDemoData() {
  renderBeforeDemoData();
  renderDemoData();
};

render();
