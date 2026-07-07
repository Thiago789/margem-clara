const STORAGE_KEY = "margem-clara-v1";
const marginPercent = 0.35;
const marginUsageStatuses = ["Descontando", "Averbado", "Enviado para folha", "Nao descontado"];
const marginReservationStatuses = ["Reservado"];
const marginReleasedStatuses = ["Liquidado", "Cancelado", "Rejeitado"];
const returnIssueStatuses = ["Rejeitado", "Nao descontado"];

const lenders = [
  { id: "lender-1", name: "Banco Horizonte", rate: 1.72, cet: 1.91 },
  { id: "lender-2", name: "CredMais Servidor", rate: 1.86, cet: 2.04 },
  { id: "lender-3", name: "Capital Consig", rate: 2.05, cet: 2.18 },
  { id: "lender-4", name: "Norte Financeira", rate: 2.18, cet: 2.32 },
];

const initialState = {
  currentProfile: "manager",
  employees: [
    {
      id: "emp-1",
      name: "Ana Paula Santos",
      cpf: "123.456.789-10",
      enrollment: "MAT-1001",
      income: 5200,
      mandatoryDeductions: 480,
      status: "Ativo",
    },
    {
      id: "emp-2",
      name: "Carlos Eduardo Lima",
      cpf: "234.567.890-11",
      enrollment: "MAT-1002",
      income: 3600,
      mandatoryDeductions: 320,
      status: "Ativo",
    },
    {
      id: "emp-3",
      name: "Marina Ribeiro Costa",
      cpf: "345.678.901-12",
      enrollment: "MAT-1003",
      income: 2900,
      mandatoryDeductions: 260,
      status: "Em revisao",
    },
  ],
  contracts: [
    {
      id: "CTR-2026-001",
      employeeId: "emp-1",
      lenderId: "lender-1",
      installment: 520,
      installments: 72,
      status: "Descontando",
      createdAt: "2026-05-15",
    },
    {
      id: "CTR-2026-002",
      employeeId: "emp-2",
      lenderId: "lender-2",
      installment: 430,
      installments: 60,
      status: "Averbado",
      createdAt: "2026-05-16",
    },
    {
      id: "RSV-2026-003",
      employeeId: "emp-1",
      lenderId: "lender-3",
      installment: 210,
      installments: 36,
      status: "Reservado",
      createdAt: "2026-05-18",
    },
  ],
  tickets: [
    {
      id: "SUP-001",
      employeeId: "emp-3",
      type: "Contestacao de margem",
      description: "Servidor informa que uma verba fixa nao entrou na base de calculo.",
      status: "Aberto",
      createdAt: "2026-05-18",
    },
  ],
  authorizationCodes: [
    {
      id: "AUTH-001",
      employeeId: "emp-1",
      code: "482913",
      purpose: "Reserva de margem",
      status: "Ativo",
      expiresAt: "2026-05-19 22:30",
      createdAt: "2026-05-18",
    },
  ],
  movements: [
    {
      date: "2026-05-18",
      text: "Reserva de R$ 210,00 criada para Ana Paula Santos.",
    },
    {
      date: "2026-05-18",
      text: "Ticket de contestacao aberto para Marina Ribeiro Costa.",
    },
    {
      date: "2026-05-16",
      text: "Contrato CTR-2026-002 averbado para Carlos Eduardo Lima.",
    },
  ],
  conventionPolicy: {
    requireAuthorizationForMarginConsult: true,
    requireAuthorizationForReservation: true,
    authorizationValidityHours: 24,
  },
};

let state = loadState();
normalizeState();

const pageTitles = {
  dashboard: "Painel",
  employees: "Servidores",
  margin: "Margem explicada",
  contracts: "Contratos",
  import: "Troca de arquivos",
  simulation: "Simulacao",
  authorizations: "Autorizacoes",
  tickets: "Suporte",
  audit: "Auditoria",
};

const profileConfig = {
  manager: {
    label: "Gestor/RH",
    scope: "Prefeitura Modelo",
    views: ["dashboard", "employees", "margin", "contracts", "import", "simulation", "authorizations", "tickets", "audit"],
  },
  employee: {
    label: "Servidor",
    scope: "Portal do consignado",
    views: ["dashboard", "margin", "contracts", "simulation", "authorizations", "tickets"],
  },
  lender: {
    label: "Consignataria",
    scope: "Banco Horizonte",
    views: ["dashboard", "margin", "contracts", "simulation", "authorizations", "tickets"],
  },
};

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return structuredClone(initialState);

  try {
    return JSON.parse(saved);
  } catch {
    return structuredClone(initialState);
  }
}

function normalizeState() {
  state.currentProfile = state.currentProfile || "manager";
  state.authorizationCodes = state.authorizationCodes || [];
  state.movements = state.movements || [];
  state.conventionPolicy = {
    requireAuthorizationForMarginConsult: true,
    requireAuthorizationForReservation: true,
    authorizationValidityHours: 24,
    ...(state.conventionPolicy || {}),
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function resetState() {
  state = structuredClone(initialState);
  normalizeState();
  saveState();
  render();
}

function activeContracts(employeeId) {
  return state.contracts.filter(
    (contract) =>
      contract.employeeId === employeeId &&
      marginUsageStatuses.includes(contract.status)
  );
}

function reservedContracts(employeeId) {
  return state.contracts.filter(
    (contract) => contract.employeeId === employeeId && marginReservationStatuses.includes(contract.status)
  );
}

function contractConsumesMargin(contract) {
  return marginUsageStatuses.includes(contract.status) || marginReservationStatuses.includes(contract.status);
}

function contractReleasesMargin(contract) {
  return marginReleasedStatuses.includes(contract.status);
}

function contractMarginEffect(contract) {
  if (contractReleasesMargin(contract)) {
    return {
      label: "Libera margem",
      className: "",
      detail: "Status final ou rejeitado; parcela nao deve continuar consumindo margem.",
    };
  }

  if (marginReservationStatuses.includes(contract.status)) {
    return {
      label: "Reserva margem",
      className: "warning",
      detail: "Reserva bloqueia saldo ate envio, cancelamento ou expiracao formal.",
    };
  }

  if (contract.status === "Nao descontado") {
    return {
      label: "Mantem margem",
      className: "warning",
      detail: "Nao desconto fica pendente e segura margem ate decisao operacional.",
    };
  }

  if (marginUsageStatuses.includes(contract.status)) {
    return {
      label: "Consome margem",
      className: "",
      detail: "Contrato ativo ou enviado para folha consome margem consignavel.",
    };
  }

  return {
    label: "Revisar regra",
    className: "warning",
    detail: "Status sem efeito de margem mapeado; exigir decisao operacional.",
  };
}

function contractHasReturnIssue(contract) {
  return returnIssueStatuses.includes(contract.status);
}

function contractStatusClass(contract) {
  if (["Cancelado", "Rejeitado"].includes(contract.status)) return "danger";
  if (marginReservationStatuses.includes(contract.status) || contract.status === "Enviado para folha" || contract.status === "Nao descontado") {
    return "warning";
  }
  return "";
}

function calculateMargin(employee) {
  const calculationBase = Math.max(employee.income - employee.mandatoryDeductions, 0);
  const total = calculationBase * marginPercent;
  const used = activeContracts(employee.id).reduce((sum, contract) => sum + contract.installment, 0);
  const reserved = reservedContracts(employee.id).reduce((sum, contract) => sum + contract.installment, 0);
  const blocked = employee.status === "Em revisao" ? total * 0.1 : 0;
  const available = total - used - reserved - blocked;

  return {
    calculationBase,
    total,
    used,
    reserved,
    blocked,
    available,
    status: available < 0 ? "Negativa" : employee.status === "Em revisao" ? "Em revisao" : "Disponivel",
  };
}

function lenderName(lenderId) {
  return lenders.find((lender) => lender.id === lenderId)?.name ?? "Consignataria";
}

function employeeById(id) {
  return state.employees.find((employee) => employee.id === id);
}

function activeAuthorizationFor(employeeId, purposes) {
  return state.authorizationCodes.find(
    (authorization) =>
      authorization.employeeId === employeeId &&
      authorization.status === "Ativo" &&
      purposes.includes(authorization.purpose)
  );
}

function hasMarginConsultAuthorization(employeeId) {
  if (!state.conventionPolicy.requireAuthorizationForMarginConsult) return true;
  return Boolean(activeAuthorizationFor(employeeId, ["Consulta de margem", "Reserva de margem", "Confirmacao de contrato"]));
}

function render() {
  renderProfile();
  renderMetrics();
  renderAlerts();
  renderGuidedFlow();
  renderMovements();
  renderEmployees();
  renderSelects();
  renderMargin();
  renderContracts();
  renderAuthorizations();
  renderTickets();
  renderAudit();
  renderFileExchange();
}

function renderProfile() {
  const config = profileConfig[state.currentProfile] || profileConfig.manager;
  document.getElementById("profile-select").value = state.currentProfile;
  document.getElementById("active-profile-label").textContent = config.label;
  document.getElementById("active-profile-scope").textContent = config.scope;
  document.getElementById("dashboard-subtitle").textContent =
    state.currentProfile === "employee"
      ? "Resumo da sua margem, contratos e autorizacoes."
      : state.currentProfile === "lender"
        ? "Resumo das operacoes da consignataria Banco Horizonte."
        : "Resumo operacional do convenio Prefeitura Modelo.";
  document.querySelectorAll(".nav-item").forEach((button) => {
    const allowed = config.views.includes(button.dataset.view);
    button.hidden = !allowed;
  });
  document.getElementById("new-employee-open").hidden = state.currentProfile !== "manager";
}

function renderMetrics() {
  if (state.currentProfile === "employee") {
    renderEmployeeMetrics();
    return;
  }

  if (state.currentProfile === "lender") {
    renderLenderMetrics();
    return;
  }

  const totals = state.employees.reduce(
    (acc, employee) => {
      const margin = calculateMargin(employee);
      acc.total += margin.total;
      acc.used += margin.used;
      acc.reserved += margin.reserved;
      acc.available += margin.available;
      return acc;
    },
    { total: 0, used: 0, reserved: 0, available: 0 }
  );

  const cards = [
    ["Servidores ativos", state.employees.filter((employee) => employee.status === "Ativo").length],
    ["Margem total", money.format(totals.total)],
    ["Margem utilizada", money.format(totals.used)],
    ["Margem disponivel", money.format(totals.available)],
  ];

  document.getElementById("metrics").innerHTML = cards
    .map(([label, value]) => `<article class="metric-card"><span>${label}</span><strong>${value}</strong></article>`)
    .join("");
}

function renderEmployeeMetrics() {
  const employee = state.employees[0];
  const margin = calculateMargin(employee);
  const cards = [
    ["Minha margem", money.format(margin.available)],
    ["Contratos ativos", activeContracts(employee.id).length],
    ["Reservas pendentes", reservedContracts(employee.id).length],
    ["Status da margem", margin.status],
  ];

  document.getElementById("metrics").innerHTML = cards
    .map(([label, value]) => `<article class="metric-card"><span>${label}</span><strong>${value}</strong></article>`)
    .join("");
}

function renderLenderMetrics() {
  const lenderContracts = state.contracts.filter((contract) => contract.lenderId === "lender-1");
  const activeValue = lenderContracts
    .filter((contract) => marginUsageStatuses.includes(contract.status))
    .reduce((sum, contract) => sum + contract.installment, 0);
  const cards = [
    ["Contratos proprios", lenderContracts.length],
    ["Carteira mensal", money.format(activeValue)],
    ["Reservas pendentes", lenderContracts.filter((contract) => marginReservationStatuses.includes(contract.status)).length],
    ["Codigos ativos", state.authorizationCodes.filter((authorization) => authorization.status === "Ativo").length],
  ];

  document.getElementById("metrics").innerHTML = cards
    .map(([label, value]) => `<article class="metric-card"><span>${label}</span><strong>${value}</strong></article>`)
    .join("");
}

function renderAlerts() {
  if (state.currentProfile === "employee") {
    const employee = state.employees[0];
    const margin = calculateMargin(employee);
    const alerts = [
      `Margem disponivel atual: ${money.format(margin.available)}.`,
      "Use Autorizacoes para liberar consulta ou reserva com codigo temporario.",
      "Abra um ticket se algum contrato ou desconto parecer incorreto.",
    ];
    document.getElementById("alerts").innerHTML = alerts.map((alert) => `<div class="alert-item">${alert}</div>`).join("");
    return;
  }

  if (state.currentProfile === "lender") {
    const reserved = state.contracts.filter((contract) => contract.lenderId === "lender-1" && marginReservationStatuses.includes(contract.status));
    const alerts = [
      ...reserved.map((contract) => `${contract.id} precisa ser confirmado ou cancelado.`),
      `${state.authorizationCodes.filter((authorization) => authorization.status === "Ativo").length} codigo(s) ativo(s) disponiveis para operacao.`,
    ];
    document.getElementById("alerts").innerHTML = alerts.map((alert) => `<div class="alert-item">${alert}</div>`).join("");
    return;
  }

  const negativeEmployees = state.employees.filter((employee) => calculateMargin(employee).available < 0);
  const reviewEmployees = state.employees.filter((employee) => employee.status === "Em revisao");
  const reserved = state.contracts.filter((contract) => marginReservationStatuses.includes(contract.status));

  const alerts = [
    ...negativeEmployees.map((employee) => `${employee.name} esta com margem negativa.`),
    ...reviewEmployees.map((employee) => `${employee.name} possui margem em revisao.`),
    ...reserved.map((contract) => `${contract.id} aguarda confirmacao da consignataria.`),
  ];

  document.getElementById("alerts").innerHTML = alerts.length
    ? alerts.map((alert) => `<div class="alert-item">${alert}</div>`).join("")
    : `<div class="alert-item">Nenhum alerta operacional no momento.</div>`;
}

function renderGuidedFlow() {
  const title = document.getElementById("guided-title");
  const flow = document.getElementById("guided-flow");
  if (!title || !flow) return;

  const flows = {
    manager: {
      title: "Jornada do Gestor/RH",
      steps: [
        ["Troca de arquivos", "Receba margem, envie insercoes e processe o retorno da folha."],
        ["Revisar alertas", "Confira margem negativa, reservas pendentes e inconsistencias."],
        ["Abrir margem explicada", "Veja base, percentual, contratos, reservas e bloqueios."],
        ["Tratar suporte", "Responda contestacoes e registre decisoes com rastreabilidade."],
      ],
    },
    employee: {
      title: "Jornada do Servidor",
      steps: [
        ["Consultar margem", "Entenda quanto esta disponivel e por que esse e o valor."],
        ["Simular credito", "Compare ofertas pelo ranking de taxas e valor da parcela."],
        ["Gerar autorizacao", "Crie um codigo temporario para consulta ou reserva."],
        ["Acompanhar contratos", "Veja descontos, reservas e abra suporte quando necessario."],
      ],
    },
    lender: {
      title: "Jornada da Consignataria",
      steps: [
        ["Validar autorizacao", "Use o codigo do servidor para iniciar a operacao."],
        ["Consultar margem", "Confira se a parcela cabe na margem disponivel."],
        ["Criar reserva", "Registre a reserva e acompanhe o status operacional."],
        ["Gerir contratos", "Monitore contratos proprios, pendencias e confirmacoes."],
      ],
    },
  };

  const current = flows[state.currentProfile] || flows.manager;
  title.textContent = current.title;
  flow.innerHTML = current.steps
    .map(
      ([stepTitle, description], index) => `
        <article class="guided-step">
          <span>${index + 1}</span>
          <strong>${stepTitle}</strong>
          <p>${description}</p>
        </article>
      `
    )
    .join("");
}

function renderMovements() {
  document.getElementById("recent-movements").innerHTML = state.movements
    .slice(0, 6)
    .map((movement) => `<div class="timeline-item"><time>${movement.date}</time><div>${movement.text}</div></div>`)
    .join("");
}

function renderEmployees() {
  const query = document.getElementById("employee-search").value.trim().toLowerCase();
  const rows = state.employees
    .filter((employee) => {
      const searchable = `${employee.name} ${employee.cpf} ${employee.enrollment}`.toLowerCase();
      return searchable.includes(query);
    })
    .map((employee) => {
      const margin = calculateMargin(employee);
      const statusClass = margin.available < 0 ? "danger" : employee.status === "Em revisao" ? "warning" : "";
      return `
        <tr class="clickable" data-employee-id="${employee.id}">
          <td><strong>${employee.name}</strong></td>
          <td>${employee.cpf}</td>
          <td>${employee.enrollment}</td>
          <td>${money.format(employee.income)}</td>
          <td>${money.format(margin.available)}</td>
          <td><span class="status ${statusClass}">${margin.status}</span></td>
        </tr>
      `;
    })
    .join("");

  document.getElementById("employees-table").innerHTML = rows;
}

function renderSelects() {
  const employeeOptions = state.employees
    .map((employee) => `<option value="${employee.id}">${employee.name} - ${employee.enrollment}</option>`)
    .join("");
  const lenderOptions = lenders.map((lender) => `<option value="${lender.id}">${lender.name}</option>`).join("");

  ["margin-employee-select", "simulation-employee", "contract-employee", "ticket-employee", "authorization-employee"].forEach((id) => {
    const select = document.getElementById(id);
    const currentValue = select.value;
    select.innerHTML = employeeOptions;
    if (currentValue) select.value = currentValue;
  });

  document.getElementById("contract-lender").innerHTML = lenderOptions;
}

function renderMargin() {
  const select = document.getElementById("margin-employee-select");
  const employee = employeeById(select.value) || state.employees[0];
  if (!employee) {
    document.getElementById("margin-detail").innerHTML = "<p>Nenhum servidor cadastrado.</p>";
    return;
  }

  select.value = employee.id;

  if (state.currentProfile === "lender" && typeof lenderHasAgreementAccess === "function" && !lenderHasAgreementAccess("lender-1")) {
    const accessReason = typeof lenderProductEligibility === "function"
      ? lenderProductEligibility("lender-1", "Emprestimo consignado").reason
      : "Credenciamento indisponivel";
    auditEventOnce(
      `margin-access-block-lender-1-${accessReason}`,
      `Consulta de margem bloqueada para Banco Horizonte: ${accessReason}.`,
      "Bloqueio de credenciamento"
    );
    document.getElementById("margin-detail").innerHTML = `
      <section class="panel">
        <div class="panel-heading">
          <h3>Consignataria sem acesso ao convenio</h3>
          <span class="status warning">Acesso condicionado</span>
        </div>
        <p class="muted">${employee.name} - ${employee.enrollment}</p>
        <div class="alert-item">
          A consignataria precisa estar com credenciamento ativo neste convenio antes de consultar margem. Motivo: ${accessReason}.
        </div>
        <p class="muted" style="margin-top:12px">
          Revise a tela de Credenciamento para liberar produtos, vigencia e canal operacional.
        </p>
      </section>
    `;
    return;
  }

  if (state.currentProfile === "lender" && !hasMarginConsultAuthorization(employee.id)) {
    document.getElementById("margin-detail").innerHTML = `
      <section class="panel">
        <div class="panel-heading">
          <h3>Consulta condicionada por convenio</h3>
          <span class="status warning">Autorizacao pendente</span>
        </div>
        <p class="muted">${employee.name} - ${employee.enrollment}</p>
        <div class="alert-item">
          Este convenio exige autorizacao do servidor para consulta de margem pela consignataria.
        </div>
        <p class="muted" style="margin-top:12px">
          Gere um codigo com finalidade Consulta de margem, Reserva de margem ou Confirmacao de contrato para liberar a leitura operacional.
        </p>
      </section>
    `;
    return;
  }

  const margin = calculateMargin(employee);
  const consumption = margin.total > 0 ? Math.min(((margin.used + margin.reserved + margin.blocked) / margin.total) * 100, 100) : 0;
  const marginStatusClass = margin.available < 0 ? "danger" : margin.status === "Em revisao" ? "warning" : "";
  const employeeContracts = state.contracts.filter((contract) => contract.employeeId === employee.id);

  document.getElementById("margin-detail").innerHTML = `
    <div class="margin-layout">
      <section class="panel">
        <div class="panel-heading">
          <h3>${employee.name}</h3>
          <span class="status ${marginStatusClass}">${margin.status}</span>
        </div>
        <p class="muted">${employee.cpf} - ${employee.enrollment}</p>
        <div class="progress-bar" aria-label="Consumo da margem">
          <span style="width:${consumption}%"></span>
        </div>
        <div class="margin-breakdown" style="margin-top:14px">
          <div class="breakdown-row"><span>Margem total</span><strong>${money.format(margin.total)}</strong></div>
          <div class="breakdown-row"><span>Utilizada</span><strong>${money.format(margin.used)}</strong></div>
          <div class="breakdown-row"><span>Reservada</span><strong>${money.format(margin.reserved)}</strong></div>
          <div class="breakdown-row"><span>Bloqueada</span><strong>${money.format(margin.blocked)}</strong></div>
          <div class="breakdown-row"><span>Disponivel</span><strong>${money.format(margin.available)}</strong></div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-heading">
          <h3>Como o calculo foi feito</h3>
        </div>
        <div class="margin-breakdown">
          <div class="breakdown-row"><span>Renda base informada</span><strong>${money.format(employee.income)}</strong></div>
          <div class="breakdown-row"><span>Descontos obrigatorios</span><strong>${money.format(employee.mandatoryDeductions)}</strong></div>
          <div class="breakdown-row"><span>Base considerada</span><strong>${money.format(margin.calculationBase)}</strong></div>
          <div class="breakdown-row"><span>Percentual de margem</span><strong>${(marginPercent * 100).toFixed(0)}%</strong></div>
        </div>
        <p class="muted" style="margin-top:14px">
          Margem disponivel = margem total - contratos ativos - reservas pendentes - bloqueios.
          ${margin.available < 0 ? "A margem esta negativa porque os compromissos superam a margem calculada." : ""}
        </p>
      </section>
    </div>

    <section class="panel" style="margin-top:18px">
      <div class="panel-heading">
        <h3>Contratos e reservas que impactam a margem</h3>
      </div>
      <div class="timeline">
        ${
          employeeContracts.length
            ? employeeContracts
                .map(
                  (contract) => `
                    <div class="timeline-item">
                      <time>${contract.status}</time>
                      <div>${contract.id} - ${lenderName(contract.lenderId)} - parcela de ${money.format(contract.installment)}</div>
                    </div>`
                )
                .join("")
            : `<div class="timeline-item"><time>Sem contratos</time><div>Nenhum contrato consome margem nesta matricula.</div></div>`
        }
      </div>
    </section>
  `;
}

function renderContracts() {
  const visibleContracts = state.currentProfile === "lender"
    ? state.contracts.filter((contract) => contract.lenderId === "lender-1")
    : state.contracts;

  document.getElementById("contracts-table").innerHTML = visibleContracts
    .map((contract) => {
      const employee = employeeById(contract.employeeId);
      const statusClass = contractStatusClass(contract);
      return `
        <tr>
          <td><strong>${contract.id}</strong></td>
          <td>${employee?.name ?? "Servidor removido"}</td>
          <td>${lenderName(contract.lenderId)}</td>
          <td>${money.format(contract.installment)}</td>
          <td>${contract.installments}x</td>
          <td>
            <span class="status ${statusClass}">${contract.status}</span>
            ${contract.returnReason ? `<div class="muted">${contract.returnReason}</div>` : ""}
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderAuthorizations() {
  renderConventionPolicy();
  const list = document.getElementById("authorization-list");
  if (!list) return;

  list.innerHTML = state.authorizationCodes
    .map((authorization) => {
      const employee = employeeById(authorization.employeeId);
      const statusClass = authorization.status === "Ativo" ? "" : "warning";
      return `
        <article class="authorization-card">
          <div>
            <strong>${authorization.code}</strong>
            <span>${authorization.purpose}</span>
          </div>
          <div>
            <span class="status ${statusClass}">${authorization.status}</span>
            <small>${employee?.name ?? "Servidor"} - expira ${authorization.expiresAt}</small>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderConventionPolicy() {
  const requireReservation = document.getElementById("policy-require-reservation-code");
  const requireMarginConsult = document.getElementById("policy-require-margin-consult-code");
  const validityHours = document.getElementById("policy-code-validity");
  const summary = document.getElementById("policy-summary");
  if (!requireReservation || !validityHours || !summary) return;

  if (requireMarginConsult) requireMarginConsult.checked = state.conventionPolicy.requireAuthorizationForMarginConsult;
  requireReservation.checked = state.conventionPolicy.requireAuthorizationForReservation;
  validityHours.value = state.conventionPolicy.authorizationValidityHours;
  const consultText = state.conventionPolicy.requireAuthorizationForMarginConsult
    ? "Consulta de margem exige autorizacao do servidor"
    : "Consulta de margem liberada para consignataria credenciada";
  const reservationText = state.conventionPolicy.requireAuthorizationForReservation
    ? "reserva exige codigo"
    : "reserva imediata liberada";
  summary.textContent = `${consultText}; ${reservationText}. Validade padrao: ${state.conventionPolicy.authorizationValidityHours}h.`;
}

function renderTickets() {
  document.getElementById("ticket-list").innerHTML = state.tickets
    .map((ticket) => {
      const employee = employeeById(ticket.employeeId);
      return `
        <article class="ticket-card">
          <strong>${ticket.id} - ${ticket.type}</strong>
          <div>${employee?.name ?? "Servidor"} - <span class="status warning">${ticket.status}</span></div>
          <p class="muted">${ticket.description}</p>
        </article>
      `;
    })
    .join("");
}

function renderAudit() {
  const table = document.getElementById("audit-table");
  if (!table) return;

  const rows = state.movements.map((movement) => {
    const profile = movement.profile || "Sistema";
    const source = movement.source || "MVP";
    return `
      <tr>
        <td>${movement.date}</td>
        <td>${movement.text}</td>
        <td><span class="status">${profile}</span></td>
        <td>${source}</td>
      </tr>
    `;
  });

  table.innerHTML = rows.length
    ? rows.join("")
    : `<tr><td colspan="4">Nenhum evento registrado ainda.</td></tr>`;
}

function renderFileExchange() {
  const summary = document.getElementById("exchange-summary");
  if (!summary) return;

  const reserved = state.contracts.filter((contract) => marginReservationStatuses.includes(contract.status)).length;
  const sent = state.contracts.filter((contract) => contract.status === "Enviado para folha").length;
  const discounted = state.contracts.filter((contract) => contract.status === "Descontando").length;
  const rejected = state.contracts.filter(contractHasReturnIssue).length;

  const cards = [
    ["Reservas prontas", reserved],
    ["Enviadas a folha", sent],
    ["Descontando", discounted],
    ["Com pendencia", rejected],
  ];

  summary.innerHTML = cards
    .map(
      ([label, value]) => `
        <article class="exchange-status-card">
          <span>${label}</span>
          <strong>${value}</strong>
        </article>
      `
    )
    .join("");
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((value) => value.trim());
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function processCsv(text) {
  const rows = parseCsv(text);
  let updated = 0;
  let inserted = 0;

  rows.forEach((row) => {
    if (!row.cpf || !row.matricula || !row.nome) return;

    const existing = state.employees.find((employee) => employee.cpf === row.cpf || employee.enrollment === row.matricula);
    const payload = {
      name: row.nome,
      cpf: row.cpf,
      enrollment: row.matricula,
      income: Number(row.renda_base || 0),
      mandatoryDeductions: Number(row.descontos_obrigatorios || 0),
      status: row.status || "Ativo",
    };

    if (existing) {
      Object.assign(existing, payload);
      updated += 1;
    } else {
      state.employees.push({ id: crypto.randomUUID(), ...payload });
      inserted += 1;
    }
  });

  auditEvent(`Folha importada: ${inserted} novos servidores e ${updated} atualizados.`, "Importacao");
  saveState();
  render();
  document.getElementById("import-result").innerHTML = `
    <strong>Importacao concluida</strong>
    <p>${rows.length} linhas lidas.</p>
    <p>${inserted} servidores incluidos e ${updated} atualizados.</p>
    <p>Margens recalculadas automaticamente.</p>
  `;
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function buildCsv(headers, rows) {
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ].join("\n");
}

function downloadCsv(filename, content) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function buildInsertionRows() {
  return state.contracts
    .filter((contract) => marginReservationStatuses.includes(contract.status))
    .map((contract) => {
      const employee = employeeById(contract.employeeId);
      return {
        contrato: contract.id,
        cpf: employee?.cpf ?? "",
        matricula: employee?.enrollment ?? "",
        rubrica: "CONSIG",
        parcela: contract.installment.toFixed(2),
        prazo: contract.installments,
        competencia: today().slice(0, 7),
        acao: "INCLUIR",
      };
    });
}

function generateInsertionFile() {
  const rows = buildInsertionRows();
  const result = document.getElementById("insertion-result");

  if (!rows.length) {
    result.textContent = "Nenhuma reserva pendente para enviar a folha.";
    return;
  }

  const content = buildCsv(["contrato", "cpf", "matricula", "rubrica", "parcela", "prazo", "competencia", "acao"], rows);
  state.contracts.forEach((contract) => {
    if (marginReservationStatuses.includes(contract.status)) {
      contract.status = "Enviado para folha";
      contract.sentToPayrollAt = today();
    }
  });

  auditEvent(`Arquivo de insercao gerado com ${rows.length} desconto(s) para a folha.`, "Arquivo de insercao");
  saveState();
  render();
  downloadCsv(`insercao-folha-${today()}.csv`, content);
  result.innerHTML = `
    <strong>Arquivo de insercao gerado</strong>
    <p>${rows.length} desconto(s) enviados para a folha.</p>
    <p>Status atualizado para Enviado para folha.</p>
  `;
}

function normalizeReturnStatus(status) {
  const normalized = String(status || "").trim().toUpperCase();
  if (["DESCONTADO", "ACEITO", "OK"].includes(normalized)) return "Descontando";
  if (["REJEITADO", "ERRO", "RECUSADO"].includes(normalized)) return "Rejeitado";
  if (["NAO_DESCONTADO", "NAO DESCONTADO", "PENDENTE"].includes(normalized)) return "Nao descontado";
  return "Pendente";
}

function processReturnCsv(text) {
  const rows = parseCsv(text);
  let processed = 0;
  let discounted = 0;
  let rejected = 0;
  let notFound = 0;

  rows.forEach((row) => {
    const contract = state.contracts.find((item) => item.id === row.contrato);
    if (!contract) {
      notFound += 1;
      return;
    }

    const nextStatus = normalizeReturnStatus(row.status);
    contract.status = nextStatus;
    contract.returnReason = row.motivo || "";
    contract.discountedValue = Number(row.valor_descontado || 0);
    contract.returnProcessedAt = today();
    processed += 1;
    if (nextStatus === "Descontando") discounted += 1;
    if (returnIssueStatuses.includes(nextStatus)) rejected += 1;
  });

  auditEvent(
    `Arquivo retorno processado: ${processed} contrato(s), ${discounted} descontado(s), ${rejected} com pendencia.`,
    "Arquivo retorno"
  );
  saveState();
  render();
  document.getElementById("return-result").innerHTML = `
    <strong>Retorno processado</strong>
    <p>${rows.length} linha(s) lidas.</p>
    <p>${processed} contrato(s) atualizados, ${discounted} descontado(s), ${rejected} com pendencia.</p>
    <p>${notFound} contrato(s) nao localizado(s).</p>
  `;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function auditEvent(text, source = "Operacao") {
  state.movements.unshift({
    date: today(),
    text,
    profile: profileConfig[state.currentProfile]?.label || "Sistema",
    source,
  });
}

function auditEventOnce(key, text, source = "Operacao") {
  const marker = `audit-once:${today()}:${key}`;
  if (sessionStorage.getItem(marker)) return;
  sessionStorage.setItem(marker, "1");
  auditEvent(text, source);
}

function openView(viewName) {
  const config = profileConfig[state.currentProfile] || profileConfig.manager;
  const nextView = config.views.includes(viewName) ? viewName : config.views[0];

  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === nextView);
  });

  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("active", view.id === `${nextView}-view`);
  });

  document.getElementById("page-title").textContent = pageTitles[nextView] ?? "Painel";
}

function bindEvents() {
  document.querySelectorAll('.modal .icon-button[value="cancel"]').forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      button.closest("dialog")?.close();
    });
  });

  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => openView(button.dataset.view));
  });

  document.getElementById("profile-select").addEventListener("change", (event) => {
    state.currentProfile = event.target.value;
    saveState();
    render();
    const activeView = document.querySelector(".view.active")?.id?.replace("-view", "") || "dashboard";
    openView(activeView);
  });

  document.getElementById("seed-data-button").addEventListener("click", resetState);
  document.getElementById("employee-search").addEventListener("input", renderEmployees);
  document.getElementById("margin-employee-select").addEventListener("change", renderMargin);

  document.getElementById("new-employee-open").addEventListener("click", () => {
    document.getElementById("employee-modal").showModal();
  });

  document.getElementById("employee-form").addEventListener("submit", (event) => {
    if (event.submitter?.value === "cancel") return;
    event.preventDefault();
    const employee = {
      id: crypto.randomUUID(),
      name: document.getElementById("employee-name").value,
      cpf: document.getElementById("employee-cpf").value,
      enrollment: document.getElementById("employee-enrollment").value,
      income: Number(document.getElementById("employee-income").value),
      mandatoryDeductions: Number(document.getElementById("employee-deductions").value),
      status: "Ativo",
    };
    state.employees.push(employee);
    auditEvent(`Servidor ${employee.name} cadastrado.`, "Cadastro");
    saveState();
    event.target.reset();
    document.getElementById("employee-modal").close();
    render();
  });

  document.getElementById("new-contract-open").addEventListener("click", () => {
    document.getElementById("contract-modal").showModal();
  });

  document.getElementById("contract-form").addEventListener("submit", (event) => {
    if (event.submitter?.value === "cancel") return;
    event.preventDefault();
    const employeeId = document.getElementById("contract-employee").value;
    const employee = employeeById(employeeId);
    const installment = Number(document.getElementById("contract-installment").value);
    const margin = calculateMargin(employee);
    const activeCode = activeAuthorizationFor(employeeId, ["Reserva de margem", "Confirmacao de contrato"]);

    if (state.conventionPolicy.requireAuthorizationForReservation && !activeCode) {
      alert("Este convenio exige codigo do servidor para criar reserva.");
      return;
    }

    if (installment > margin.available) {
      alert("A parcela informada supera a margem disponivel.");
      return;
    }

    const contract = {
      id: `RSV-${Date.now().toString().slice(-6)}`,
      employeeId,
      lenderId: document.getElementById("contract-lender").value,
      installment,
      installments: Number(document.getElementById("contract-installments").value),
      status: "Reservado",
      createdAt: today(),
    };
    state.contracts.push(contract);
    if (activeCode) {
      activeCode.status = "Usado";
      activeCode.usedAt = today();
    }
    auditEvent(
      `Reserva de ${money.format(installment)} criada para ${employee.name}${activeCode ? " com autorizacao do servidor" : ""}.`,
      "Reserva"
    );
    saveState();
    event.target.reset();
    document.getElementById("contract-modal").close();
    render();
  });

  document.getElementById("process-csv").addEventListener("click", () => {
    const file = document.getElementById("csv-file").files[0];
    if (!file) {
      document.getElementById("import-result").textContent = "Selecione um arquivo CSV antes de processar.";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => processCsv(String(reader.result));
    reader.readAsText(file, "utf-8");
  });

  document.getElementById("download-sample").addEventListener("click", () => {
    const content = "nome,cpf,matricula,renda_base,descontos_obrigatorios,status\nJoao Martins,456.789.012-33,MAT-1004,4100,350,Ativo\nLucia Almeida,567.890.123-44,MAT-1005,6200,720,Ativo\n";
    downloadCsv("arquivo-margem-exemplo.csv", content);
  });

  document.getElementById("download-insertion-sample").addEventListener("click", () => {
    const content = buildCsv(
      ["contrato", "cpf", "matricula", "rubrica", "parcela", "prazo", "competencia", "acao"],
      [
        {
          contrato: "RSV-2026-003",
          cpf: "123.456.789-10",
          matricula: "MAT-1001",
          rubrica: "CONSIG",
          parcela: "210.00",
          prazo: "36",
          competencia: today().slice(0, 7),
          acao: "INCLUIR",
        },
      ]
    );
    downloadCsv("insercao-folha-modelo.csv", content);
  });

  document.getElementById("generate-insertion").addEventListener("click", generateInsertionFile);

  document.getElementById("download-return-sample").addEventListener("click", () => {
    const content = buildCsv(
      ["contrato", "competencia", "status", "motivo", "valor_descontado"],
      [
        { contrato: "RSV-2026-003", competencia: today().slice(0, 7), status: "DESCONTADO", motivo: "", valor_descontado: "210.00" },
        { contrato: "RSV-2026-999", competencia: today().slice(0, 7), status: "REJEITADO", motivo: "Matricula sem vinculo ativo", valor_descontado: "0.00" },
      ]
    );
    downloadCsv("retorno-folha-exemplo.csv", content);
  });

  document.getElementById("process-return").addEventListener("click", () => {
    const file = document.getElementById("return-file").files[0];
    if (!file) {
      document.getElementById("return-result").textContent = "Selecione um arquivo retorno antes de processar.";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => processReturnCsv(String(reader.result));
    reader.readAsText(file, "utf-8");
  });

  document.getElementById("simulation-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const employee = employeeById(document.getElementById("simulation-employee").value);
    const product = document.getElementById("simulation-product")?.value || "Emprestimo consignado";
    const amount = Number(document.getElementById("simulation-amount").value);
    const installments = Number(document.getElementById("simulation-installments").value);
    const margin = calculateMargin(employee);
    const simulatedLenders = lenders.map((lender) => {
      const eligibility = typeof lenderProductEligibility === "function"
        ? lenderProductEligibility(lender.id, product)
        : { ok: true, reason: "Habilitada" };
      return { ...lender, eligibility };
    });
    const ranking = simulatedLenders
      .filter((lender) => lender.eligibility.ok)
      .map((lender) => {
        const monthlyRate = lender.rate / 100;
        const installment = (amount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -installments));
        return { ...lender, installment };
      })
      .sort((a, b) => a.cet - b.cet);
    const blocked = simulatedLenders.filter((lender) => !lender.eligibility.ok);

    document.getElementById("ranking-list").innerHTML = ranking.length
      ? ranking
      .map(
        (item) => `
          <article class="ranking-item">
            <div>
              <strong>${item.name}</strong>
              <span class="muted">${product} - Taxa ${item.rate.toFixed(2)}% - CET ${item.cet.toFixed(2)}%</span>
            </div>
            <div>
              <strong>${money.format(item.installment)}</strong>
              <span class="status ${item.installment <= margin.available ? "" : "danger"}">${item.installment <= margin.available ? "Cabe" : "Nao cabe"}</span>
            </div>
          </article>
        `
      )
      .join("")
      : `<article class="ranking-item"><div><strong>Nenhuma consignataria habilitada</strong><span class="muted">Revise o credenciamento do produto ${product} neste convenio.</span></div></article>`;

    if (blocked.length) {
      document.getElementById("ranking-list").insertAdjacentHTML(
        "beforeend",
        `
          <article class="ranking-item ranking-exclusions">
            <div>
              <strong>${blocked.length} consignataria(s) fora do ranking</strong>
              <span class="muted">${blocked.map((lender) => `${lender.name}: ${lender.eligibility.reason}`).join(" | ")}</span>
            </div>
          </article>
        `
      );
    }
  });

  document.getElementById("new-ticket-open").addEventListener("click", () => {
    document.getElementById("ticket-modal").showModal();
  });

  document.getElementById("new-authorization-open").addEventListener("click", () => {
    document.getElementById("authorization-modal").showModal();
  });

  document.getElementById("authorization-form").addEventListener("submit", (event) => {
    if (event.submitter?.value === "cancel") return;
    event.preventDefault();
    const employeeId = document.getElementById("authorization-employee").value;
    const employee = employeeById(employeeId);
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const authorization = {
      id: `AUTH-${Date.now().toString().slice(-5)}`,
      employeeId,
      code,
      purpose: document.getElementById("authorization-purpose").value,
      status: "Ativo",
      expiresAt: `${today()} +${state.conventionPolicy.authorizationValidityHours}h`,
      createdAt: today(),
    };
    state.authorizationCodes.unshift(authorization);
    auditEvent(`Codigo ${code} gerado para ${employee.name} (${authorization.purpose}).`, "Autorizacao");
    saveState();
    event.target.reset();
    document.getElementById("authorization-modal").close();
    render();
  });

  document.getElementById("policy-require-reservation-code")?.addEventListener("change", (event) => {
    state.conventionPolicy.requireAuthorizationForReservation = event.target.checked;
    auditEvent(
      event.target.checked
        ? "Politica do convenio atualizada: reserva exige codigo do servidor."
        : "Politica do convenio atualizada: reserva imediata liberada.",
      "Configuracao"
    );
    saveState();
    renderConventionPolicy();
  });

  document.getElementById("policy-require-margin-consult-code")?.addEventListener("change", (event) => {
    state.conventionPolicy.requireAuthorizationForMarginConsult = event.target.checked;
    auditEvent(
      event.target.checked
        ? "Politica do convenio atualizada: consulta de margem exige autorizacao do servidor."
        : "Politica do convenio atualizada: consulta de margem liberada para consignataria credenciada.",
      "Configuracao"
    );
    saveState();
    renderConventionPolicy();
  });

  document.getElementById("policy-code-validity")?.addEventListener("change", (event) => {
    state.conventionPolicy.authorizationValidityHours = Number(event.target.value || 24);
    auditEvent(`Validade do codigo alterada para ${state.conventionPolicy.authorizationValidityHours}h.`, "Configuracao");
    saveState();
    renderConventionPolicy();
  });

  document.getElementById("ticket-form").addEventListener("submit", (event) => {
    if (event.submitter?.value === "cancel") return;
    event.preventDefault();
    const employeeId = document.getElementById("ticket-employee").value;
    const ticket = {
      id: `SUP-${Date.now().toString().slice(-5)}`,
      employeeId,
      type: document.getElementById("ticket-type").value,
      description: document.getElementById("ticket-description").value,
      status: "Aberto",
      createdAt: today(),
    };
    state.tickets.unshift(ticket);
    auditEvent(`Ticket ${ticket.id} aberto para ${employeeById(employeeId).name}.`, "Suporte");
    saveState();
    event.target.reset();
    document.getElementById("ticket-modal").close();
    render();
  });

  document.getElementById("employees-table").addEventListener("click", (event) => {
    const row = event.target.closest("[data-employee-id]");
    if (!row) return;
    document.getElementById("margin-employee-select").value = row.dataset.employeeId;
    openView("margin");
    renderMargin();
  });
}

bindEvents();
render();
