if (!pageTitles.qa) {
  pageTitles.qa = "Homologacao";
}

if (!profileConfig.manager.views.includes("qa")) {
  const pilotIndex = profileConfig.manager.views.indexOf("pilot");
  profileConfig.manager.views.splice(pilotIndex >= 0 ? pilotIndex + 1 : 2, 0, "qa");
}

function getPilotQaScenarios() {
  const employees = state.employees || [];
  const contracts = state.contracts || [];
  const movements = state.movements || [];
  const codes = state.authorizationCodes || [];
  const policy = state.conventionPolicy || {};
  if (typeof normalizeEnrollments === "function") normalizeEnrollments();
  if (typeof normalizeContractRuleFields === "function") normalizeContractRuleFields();
  if (typeof normalizeContractFinancialFields === "function") normalizeContractFinancialFields();
  if (typeof normalizeContractOperationFields === "function") normalizeContractOperationFields();
  const enrollments = state.enrollments || [];
  const reserved = contracts.filter((contract) => marginReservationStatuses.includes(contract.status));
  const sent = contracts.filter((contract) => contract.status === "Enviado para folha");
  const active = contracts.filter((contract) => marginUsageStatuses.includes(contract.status) && contract.status !== "Enviado para folha");
  const rejected = contracts.filter(contractHasReturnIssue);
  const progressed = contracts.filter((contract) => Number(contract.currentInstallment || 0) > 0);
  const liquidated = contracts.filter((contract) => contract.status === "Liquidado");
  const closingData = typeof getPayrollClosingData === "function" ? getPayrollClosingData() : null;
  const closingBlockers = closingData?.blockers?.length || 0;
  const closingWarnings = closingData?.warnings?.length || 0;
  const hasReturnReconciliation = Boolean(state.lastReturnReconciliation);
  const hasContractTimeline = contracts.some((contract) => contract.adjustmentHistory?.length || contract.returnHistory?.length || contract.statusHistory?.length);
  const reviewEmployees = employees.filter((employee) => employee.status === "Em revisao");
  const hasAuditSources = movements.some((movement) => movement.source || movement.profile);
  const hasSensitiveAuditSummary = typeof getAuditSummaryCards === "function";
  const hasGuardedNavigation = typeof renderNavigationGuardNotice === "function";
  const hasPilotConvention = Boolean(state.conventionSettings?.name && state.conventionSettings?.code);
  const hasPublicValidationSource = Boolean(state.conventionSettings?.publicValidationSourceEnabled && typeof getPublicValidationEvidence === "function");
  const hasPublicValidationAudit = movements.some((movement) => movement.source === "Validacao do servidor" && /fonte publica/i.test(movement.text || ""));
  const activeCodes = codes.filter((code) => code.status === "Ativo");
  const requiresMarginConsult = policy.requireAuthorizationForMarginConsult !== false;
  const requiresReservationCode = policy.requireAuthorizationForReservation !== false;
  const accreditations = typeof getLenderProductAccreditations === "function" ? getLenderProductAccreditations() : [];
  const activeAccreditations = accreditations.filter((item) => item.status === "Ativo" && (typeof accreditationIsWithinValidity !== "function" || accreditationIsWithinValidity(item)));
  const hasAccreditationBlockAudit = movements.some((movement) => movement.source === "Bloqueio de credenciamento");

  return [
    {
      area: "Convenio",
      title: "Convenio piloto configurado",
      expected: "Piloto deve ter convenio, codigo interno, politica de margem, data de corte e layouts de arquivos definidos.",
      evidence: hasPilotConvention
        ? `${state.conventionSettings.name} (${state.conventionSettings.code}), corte dia ${policy.insertionCutoffDay || 20}.`
        : "Convenio piloto ainda nao configurado.",
      target: "settings",
      ok: hasPilotConvention && Boolean(policy.insertionCutoffDay),
    },
    {
      area: "Base de margem",
      title: "Importacao ou carga inicial valida",
      expected: "Servidor com CPF, matricula, renda base, desconto obrigatorio e status funcional.",
      evidence: `${employees.length} servidor(es) carregado(s), ${reviewEmployees.length} em revisao.`,
      target: "employees",
      ok: employees.length >= 3 && employees.every((employee) => employee.cpf && employee.enrollment && employee.income > 0),
    },
    {
      area: "Matricula/vinculo",
      title: "Margem controlada por vinculo",
      expected: "Cada contrato deve estar associado a uma matricula especifica do servidor.",
      evidence: `${enrollments.length} matricula(s) normalizada(s), ${contracts.filter((contract) => contract.enrollmentId).length} contrato(s) com vinculo.`,
      target: "enrollments",
      ok: enrollments.length >= employees.length && contracts.every((contract) => contract.enrollmentId),
    },
    {
      area: "Autorizacao",
      title: "Consulta e reserva configuraveis",
      expected: "Convenio pode exigir autorizacao para consulta de margem, exigir codigo para reserva ou liberar fluxo imediato.",
      evidence: `Consulta: ${requiresMarginConsult ? "exige autorizacao" : "liberada"}; reserva: ${requiresReservationCode ? "exige codigo" : "imediata"}; ${activeCodes.length} codigo(s) ativo(s).`,
      target: "authorizations",
      ok: requiresMarginConsult || requiresReservationCode ? activeCodes.length > 0 : true,
    },
    {
      area: "Validacao",
      title: "Fonte publica configuravel e auditavel",
      expected: "Convenio deve permitir fonte publica ou oficial para validar servidor e registrar evidencia auditavel.",
      evidence: hasPublicValidationAudit
        ? "Existe evidencia de fonte publica registrada na auditoria."
        : hasPublicValidationSource
          ? `${state.conventionSettings.publicValidationSourceName || "Fonte publica"} configurada; registre evidencia na tela de validacao.`
          : "Fonte publica ainda nao configurada no convenio.",
      target: "identity",
      ok: hasPublicValidationSource && hasPublicValidationAudit,
    },
    {
      area: "Consignataria",
      title: "Acesso condicionado por convenio",
      expected: "Consignataria precisa estar ativa e dentro do periodo de vigencia do convenio antes de consultar margem ou criar reserva operacional.",
      evidence: `${activeAccreditations.length} consignataria(s) ativa(s) de ${accreditations.length} credenciamento(s).`,
      target: "accreditation",
      ok: activeAccreditations.length > 0 && typeof lenderHasAgreementAccess === "function",
    },
    {
      area: "Produto",
      title: "Operacao respeita produto credenciado",
      expected: "Simulacao e reserva devem considerar apenas produtos habilitados para a consignataria no convenio.",
      evidence: typeof lenderProductEligibility === "function" ? `${lenderAllowedProducts("lender-1").length} produto(s) habilitado(s) e motivo de exclusao disponivel no ranking.` : "Filtro por produto pendente.",
      target: "accreditation",
      ok: typeof lenderProductEligibility === "function" && lenderAllowedProducts("lender-1").length > 0,
    },
    {
      area: "Auditoria",
      title: "Bloqueio de credenciamento auditavel",
      expected: "Tentativas de consulta ou reserva bloqueadas por credenciamento devem registrar motivo e origem na auditoria.",
      evidence: hasAccreditationBlockAudit
        ? "Existe evento de bloqueio de credenciamento registrado."
        : "Mecanismo implementado; gere uma tentativa bloqueada para evidenciar na auditoria.",
      target: "audit",
      ok: typeof lenderOperationBlockMessage === "function" && typeof auditEventOnce === "function",
    },
    {
      area: "Reserva",
      title: "Criacao e bloqueio de margem",
      expected: "Reserva deve consumir margem e guardar servidor, consignataria, valor e prazo.",
      evidence: `${reserved.length} reserva(s), ${contracts.length} contrato(s) totais.`,
      target: "contracts",
      ok: contracts.some((contract) => contract.employeeId && contract.lenderId && contract.enrollmentId && contract.installment > 0),
    },
    {
      area: "Contrato",
      title: "Campos financeiros e operacionais minimos",
      expected: "Contrato deve manter produto, tipo de operacao, taxa, CET, prazo, parcela atual e primeira competencia.",
      evidence: `${contracts.filter((contract) => contract.product && contract.contractType && contract.interestRate && contract.cetRate && contract.firstPayrollCompetency).length} contrato(s) com campos minimos.`,
      target: "contracts",
      ok: contracts.length > 0 && contracts.every((contract) => contract.product && contract.contractType && contract.interestRate && contract.cetRate && contract.firstPayrollCompetency),
    },
    {
      area: "Insercao",
      title: "Arquivo de descontos para folha",
      expected: "Reservas prontas geram registros de insercao com contrato, CPF, matricula, rubrica e valor.",
      evidence: sent.length
        ? `${sent.length} contrato(s) enviado(s) para folha.`
        : reserved.length
          ? `${reserved.length} reserva(s) pronta(s) para gerar insercao.`
          : "Sem reserva pendente para gerar insercao.",
      target: "import",
      ok: reserved.length > 0 || sent.length > 0,
    },
    {
      area: "Retorno",
      title: "Conciliacao do processamento da folha",
      expected: "Retorno deve confirmar desconto ou abrir pendencia com motivo.",
      evidence: hasReturnReconciliation
        ? "Ultimo retorno possui conciliacao detalhada por linha."
        : `${active.length} ativo(s), ${rejected.length} rejeitado(s) ou nao descontado(s).`,
      target: "import",
      ok: hasReturnReconciliation || active.length > 0 || rejected.length > 0,
    },
    {
      area: "Baixa de parcela",
      title: "Parcela atual e liquidacao automatica",
      expected: "Retorno descontado deve avancar parcela atual; ao atingir prazo final, contrato deve liquidar e liberar margem.",
      evidence: `${progressed.length} contrato(s) com parcela atualizada, ${liquidated.length} liquidado(s).`,
      target: "competencies",
      ok: progressed.length > 0 || liquidated.length > 0,
    },
    {
      area: "Fechamento",
      title: "Decisao da competencia",
      expected: "Competencia deve indicar se pode fechar, fechar com ressalva ou bloquear por retorno/baixa pendente.",
      evidence: closingData
        ? `${closingBlockers} bloqueio(s), ${closingWarnings} ressalva(s), decisao: ${closingData.decision}.`
        : "Fechamento ainda nao calculado.",
      target: "closing",
      ok: Boolean(closingData) && closingBlockers === 0,
    },
    {
      area: "Rastreabilidade",
      title: "Linha do tempo do contrato",
      expected: "Eventos de reserva, insercao, retorno, ajuste, cancelamento e liquidacao devem ser visiveis.",
      evidence: hasContractTimeline ? "Contratos possuem historico operacional registrado." : "Sem historico detalhado em contrato ainda.",
      target: "contracts",
      ok: hasContractTimeline || movements.length > 0,
    },
    {
      area: "Seguranca",
      title: "Separacao de visao por perfil",
      expected: "Gestor ve operacao completa; servidor e consignataria veem apenas escopo permitido.",
      evidence: "Menus por perfil e modulo de permissoes habilitados para gestor.",
      target: "access",
      ok: profileConfig.manager.views.includes("access") && !profileConfig.employee.views.includes("access"),
    },
    {
      area: "Seguranca",
      title: "Navegacao protegida e auditoria sensivel",
      expected: "Modulo indisponivel por perfil deve redirecionar com aviso e aparecer no resumo de auditoria.",
      evidence: `${hasGuardedNavigation ? "Navegacao protegida ativa" : "Navegacao protegida pendente"}; ${hasSensitiveAuditSummary ? "resumo sensivel ativo" : "resumo sensivel pendente"}.`,
      target: "access",
      ok: hasGuardedNavigation && hasSensitiveAuditSummary,
    },
    {
      area: "Auditoria",
      title: "Trilha operacional rastreavel",
      expected: "Eventos criticos devem registrar origem, perfil e data.",
      evidence: `${movements.length} evento(s), ${hasAuditSources ? "com" : "sem"} origem/perfil em parte da trilha.`,
      target: "audit",
      ok: movements.length > 0,
    },
  ];
}

function getPilotQaDecision(scenarios) {
  const approved = scenarios.filter((scenario) => scenario.ok).length;
  const pending = scenarios.length - approved;
  const next = scenarios.find((scenario) => !scenario.ok) || scenarios[scenarios.length - 1];
  const score = Math.round((approved / scenarios.length) * 100);

  return {
    approved,
    pending,
    next,
    score,
    actionLabel: pending ? "Abrir pendencia" : "Abrir auditoria",
    status: pending ? "Homologacao em andamento" : "MVP pronto para demonstracao guiada",
  };
}

function getPilotQaStage(decision) {
  if (decision.score >= 100) {
    return {
      label: "Pronto para demo guiada",
      detail: "Todos os criterios do MVP estatico estao atendidos para apresentacao controlada.",
      realOperation: "Operacao real ainda exige backend, login seguro, banco, LGPD e homologacao externa.",
    };
  }

  if (decision.score >= 80) {
    return {
      label: "Quase pronto para piloto controlado",
      detail: "A massa ja sustenta conversa de negocio, mas ainda ha criterios pendentes antes do aceite.",
      realOperation: "Nao usar como ambiente real; fechar pendencias e registrar aceite antes do piloto.",
    };
  }

  return {
    label: "Demo em maturacao",
    detail: "Use a fila de criterios para completar o fluxo minimo antes de tratar como demonstracao forte.",
    realOperation: "Ainda distante de operacao real; priorize criterio pendente e evidencias de homologacao.",
  };
}

function getPilotQaStageSummary() {
  const scenarios = getPilotQaScenarios();
  const decision = getPilotQaDecision(scenarios);
  const stage = getPilotQaStage(decision);
  return {
    ...stage,
    score: decision.score,
    pending: decision.pending,
    labelWithScore: `${stage.label} (${decision.score}%)`,
  };
}

function recordPilotQaApproval(decision) {
  state.pilotQaApproval = {
    date: today(),
    approved: decision.approved,
    total: decision.approved + decision.pending,
    score: decision.score,
    status: decision.pending ? "Checkpoint parcial" : "Aceite completo",
  };
}

function ensurePilotQaView() {
  if (document.getElementById("qa-view")) return;

  const nav = document.querySelector(".nav-list");
  const pilotButton = document.querySelector('[data-view="pilot"]');
  const employeesButton = document.querySelector('[data-view="employees"]');
  const button = document.createElement("button");
  button.className = "nav-item";
  button.dataset.view = "qa";
  button.type = "button";
  button.textContent = "Homologacao";
  button.addEventListener("click", () => openView("qa"));
  nav?.insertBefore(button, pilotButton?.nextSibling || employeesButton || null);

  document.querySelector(".main-panel")?.insertAdjacentHTML(
    "beforeend",
    `
      <section class="view" id="qa-view" aria-labelledby="qa-title">
        <div class="section-heading row-heading">
          <div>
            <h2 id="qa-title">Homologacao do MVP</h2>
            <p>Veja criterios de aceite, evidencias e pontos pendentes antes de apresentar o piloto.</p>
          </div>
          <button class="primary-button" id="qa-audit-button" type="button">Registrar homologacao</button>
        </div>

        <section class="panel qa-command" id="qa-command"></section>

        <div class="qa-summary-grid" id="qa-summary-grid"></div>

        <section class="panel qa-panel">
          <div class="panel-heading">
            <h3>Cenarios de aceite</h3>
          </div>
          <div class="qa-list" id="qa-list"></div>
        </section>

        <div class="content-grid qa-content">
          <section class="panel">
            <div class="panel-heading">
              <h3>Pronto para demonstracao</h3>
            </div>
            <div class="qa-notes" id="qa-ready"></div>
          </section>

          <section class="panel">
            <div class="panel-heading">
              <h3>Antes de operacao real</h3>
            </div>
            <div class="qa-notes" id="qa-real"></div>
          </section>
        </div>
      </section>
    `
  );

  document.getElementById("qa-audit-button")?.addEventListener("click", () => {
    const scenarios = getPilotQaScenarios();
    const decision = getPilotQaDecision(scenarios);
    recordPilotQaApproval(decision);
    auditEvent(`Homologacao do MVP registrada: ${decision.approved}/${scenarios.length} criterios atendidos (${decision.score}%).`, "Homologacao");
    saveState();
    render();
    openView("qa");
  });
}

function renderPilotQa() {
  ensurePilotQaView();

  const command = document.getElementById("qa-command");
  const summary = document.getElementById("qa-summary-grid");
  const list = document.getElementById("qa-list");
  const ready = document.getElementById("qa-ready");
  const real = document.getElementById("qa-real");
  if (!command || !summary || !list || !ready || !real) return;

  const scenarios = getPilotQaScenarios();
  const decision = getPilotQaDecision(scenarios);
  const stage = getPilotQaStage(decision);
  const approval = state.pilotQaApproval;
  const approvalLabel = approval ? `${approval.score || 0}% em ${approval.date || "data nao informada"}` : "Nao registrado";

  command.innerHTML = `
    <div>
      <span class="qa-command-label">${decision.status} - ${stage.label}</span>
      <strong>${decision.next.title}</strong>
      <p>${decision.next.expected}</p>
      <small>${decision.next.evidence} ${stage.detail}</small>
    </div>
    <div class="qa-command-actions">
      <div class="qa-progress" aria-label="${decision.score}% de homologacao">
        <span style="width: ${decision.score}%"></span>
      </div>
      <button class="primary-button qa-next-action" data-target-view="${decision.pending ? decision.next.target : "audit"}" type="button">${decision.actionLabel}</button>
    </div>
  `;

  const cards = [
    ["Cenarios", scenarios.length],
    ["Atendidos", decision.approved],
    ["Pendentes", decision.pending],
    ["Maturidade", `${decision.score}%`],
    ["Ultimo aceite", approvalLabel],
    ["Estagio", stage.label],
  ];

  summary.innerHTML = cards
    .map(
      ([label, value]) => `
        <article class="qa-summary-card">
          <span>${label}</span>
          <strong>${value}</strong>
        </article>
      `
    )
    .join("");

  list.innerHTML = scenarios
    .map(
      (scenario) => `
        <article class="qa-row">
          <div class="qa-status ${scenario.ok ? "done" : ""}">${scenario.ok ? "OK" : "!"}</div>
          <div>
            <strong>${scenario.title}</strong>
            <span>${scenario.area}</span>
          </div>
          <p><strong>Esperado:</strong> ${scenario.expected}</p>
          <p><strong>Evidencia:</strong> ${scenario.evidence}</p>
          <button class="secondary-button qa-jump" data-target-view="${scenario.target}" type="button">Ver modulo</button>
        </article>
      `
    )
    .join("");

  document.querySelectorAll(".qa-jump").forEach((button) => {
    button.addEventListener("click", () => openView(button.dataset.targetView));
  });

  document.querySelector(".qa-next-action")?.addEventListener("click", (event) => {
    openView(event.currentTarget.dataset.targetView);
  });

  ready.innerHTML = `
    <div class="qa-note">
      <strong>Demonstra fluxo real</strong>
      <span>Ja e possivel explicar a jornada de margem, reserva, arquivo de insercao, retorno, pendencia e auditoria.</span>
    </div>
    <div class="qa-note">
      <strong>Boa conversa comercial</strong>
      <span>O MVP mostra diferenca clara: mais simples que os grandes, com foco em rastreabilidade e usabilidade.</span>
    </div>
    <div class="qa-note">
      <strong>Teste guiado</strong>
      <span>O gestor consegue navegar pelos modulos principais sem depender de memoria do fluxo.</span>
    </div>
    <div class="qa-note">
      <strong>Estagio atual</strong>
      <span>${stage.detail}</span>
    </div>
  `;

  real.innerHTML = `
    <div class="qa-note">
      <strong>Backend e banco</strong>
      <span>Operacao real precisa persistencia segura, login, permissoes finas e isolamento por convenio.</span>
    </div>
    <div class="qa-note">
      <strong>Motor de layouts</strong>
      <span>Arquivos de margem, insercao e retorno precisam parser configuravel, validacao e historico de versao.</span>
    </div>
    <div class="qa-note">
      <strong>Homologacao externa</strong>
      <span>Cada folha e cada consignataria devem passar por massa de teste antes de qualquer processamento real.</span>
    </div>
    <div class="qa-note">
      <strong>Limite de uso</strong>
      <span>${stage.realOperation}</span>
    </div>
  `;
}

const qaStyle = document.createElement("style");
qaStyle.textContent = `
  .qa-summary-grid {
    display: grid;
    grid-template-columns: repeat(6, minmax(130px, 1fr));
    gap: 14px;
    margin-bottom: 18px;
  }
  .qa-command {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(220px, 300px);
    gap: 16px;
    align-items: center;
    margin-bottom: 18px;
    background: linear-gradient(135deg, #f8fafc, #eef6ff);
  }
  .qa-command-label {
    display: block;
    color: var(--muted);
    font-size: 13px;
    font-weight: 700;
    margin-bottom: 6px;
  }
  .qa-command strong {
    display: block;
    font-size: 20px;
  }
  .qa-command p,
  .qa-command small {
    display: block;
    margin: 6px 0 0;
    color: var(--muted);
    line-height: 1.4;
  }
  .qa-command-actions {
    display: grid;
    gap: 10px;
  }
  .qa-progress {
    height: 10px;
    overflow: hidden;
    border-radius: 999px;
    background: #e5e7eb;
  }
  .qa-progress span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: #2563eb;
  }
  .qa-summary-card,
  .qa-row,
  .qa-note {
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
  }
  .qa-summary-card {
    padding: 16px;
    box-shadow: var(--shadow);
  }
  .qa-summary-card span,
  .qa-row span,
  .qa-row p,
  .qa-note span {
    display: block;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.4;
  }
  .qa-summary-card strong {
    display: block;
    margin-top: 8px;
    font-size: 26px;
  }
  .qa-list,
  .qa-notes {
    display: grid;
    gap: 10px;
  }
  .qa-row {
    display: grid;
    grid-template-columns: 42px 1fr auto;
    gap: 12px;
    align-items: center;
    padding: 12px;
    background: var(--surface-2);
  }
  .qa-row p {
    grid-column: 2 / -1;
    margin: 0;
  }
  .qa-row p strong {
    color: var(--text);
    font-size: 13px;
  }
  .qa-status {
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
  .qa-status.done {
    background: #ecfdf3;
    color: #047857;
  }
  .qa-note {
    padding: 12px;
    background: var(--surface-2);
  }
  .qa-note span {
    margin-top: 4px;
  }
  @media (max-width: 1040px) {
    .qa-summary-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .qa-command {
      grid-template-columns: 1fr;
    }
    .qa-row {
      grid-template-columns: 42px 1fr;
    }
    .qa-row .qa-jump {
      grid-column: 2;
      justify-self: start;
    }
  }
  @media (max-width: 640px) {
    .qa-summary-grid {
      grid-template-columns: 1fr;
    }
  }
`;
document.head.appendChild(qaStyle);

const renderBeforePilotQa = render;
render = function renderWithPilotQa() {
  renderBeforePilotQa();
  renderPilotQa();
};

render();
