if (!pageTitles.readiness) {
  pageTitles.readiness = "Prontidao V1";
}

if (!profileConfig.manager.views.includes("readiness")) {
  const roadmapIndex = profileConfig.manager.views.indexOf("roadmap");
  profileConfig.manager.views.splice(roadmapIndex >= 0 ? roadmapIndex + 1 : profileConfig.manager.views.length, 0, "readiness");
}

function getReadinessGroups() {
  const marginValidation = state.lastMarginValidation;
  const insertionValidation = state.lastInsertionValidation;
  const returnReconciliation = state.lastReturnReconciliation;
  const qaScenarios = typeof getPilotQaScenarios === "function" ? getPilotQaScenarios() : [];
  const qaApproved = qaScenarios.filter((scenario) => scenario.ok).length;
  const qaScore = qaScenarios.length ? Math.round((qaApproved / qaScenarios.length) * 100) : 0;
  const qaApprovalFreshness = typeof getPilotQaApprovalFreshness === "function"
    ? getPilotQaApprovalFreshness(qaScenarios)
    : { fresh: Boolean(state.pilotQaApproval), label: state.pilotQaApproval ? state.pilotQaApproval.status : "Nao registrado" };
  const qaApprovalScore = qaApprovalFreshness.fresh ? Number(state.pilotQaApproval?.score || 0) : 0;
  const homologationScore = Math.max(qaScore, qaApprovalScore);
  const closingData = typeof getPayrollClosingData === "function" ? getPayrollClosingData() : null;
  const closingFreshness = typeof getPayrollClosingDecisionFreshness === "function" && closingData
    ? getPayrollClosingDecisionFreshness(closingData)
    : { fresh: Boolean(state.lastPayrollClosingDecision) };
  const hasClosingDecision = Boolean(state.lastPayrollClosingDecision && closingFreshness.fresh);
  const hasClosingBlocker = Boolean(state.lastPayrollClosingDecision?.blockers || closingData?.blockers?.length || !closingFreshness.fresh);
  const protocolFreshness = typeof getFileProtocolFreshness === "function"
    ? getFileProtocolFreshness()
    : { fresh: Boolean(state.lastFileProtocol) };
  const hasProtocols = Boolean(state.lastFileProtocol && protocolFreshness.fresh);
  const hasFileEvidence = Boolean(marginValidation || insertionValidation || returnReconciliation);
  const hasAccessMatrix = profileConfig.manager.views.includes("access") && !profileConfig.employee.views.includes("access");
  const hasEnrollments = Array.isArray(state.enrollments) && state.enrollments.length >= state.employees.length;
  const hasFileGuards = Boolean(marginValidation || insertionValidation || returnReconciliation);
  const hasReturnGuard = Boolean(returnReconciliation);
  const hasInsertionGuard = Boolean(insertionValidation);
  const hasMarginGuard = Boolean(marginValidation);
  const hasContracts = state.contracts.length > 0;
  const hasInstallmentProgress = state.contracts.some((contract) => Number(contract.currentInstallment || 0) > 0 || contract.status === "Liquidado");
  const hasAudit = state.movements.length > 0;
  const hasSensitiveAuditSummary = typeof getAuditSummaryCards === "function";
  const hasGuardedNavigation = typeof renderNavigationGuardNotice === "function";
  const hasMvpSecurityChecklist = typeof getMvpSecurityChecklist === "function";
  const hasConventionConsultPolicy = typeof hasMarginConsultAuthorization === "function" && "requireAuthorizationForMarginConsult" in (state.conventionPolicy || {});
  const hasLenderAgreementAccess = typeof lenderHasAgreementAccess === "function";
  const hasAccreditationBlockAudit = typeof lenderOperationBlockMessage === "function" && typeof auditEventOnce === "function";
  const hasApiPlan = profileConfig.manager.views.includes("api") || profileConfig.manager.views.includes("integrations");
  const hasPilotConvention = Boolean(state.conventionSettings?.name && state.conventionSettings?.code);
  const hasPublicValidationSource = Boolean(state.conventionSettings?.publicValidationSourceEnabled && typeof getPublicValidationEvidence === "function");
  const publicValidationCoverage = typeof getPublicValidationCoverage === "function"
    ? getPublicValidationCoverage()
    : { complete: false, recorded: 0 };

  const status = (condition, mapped = "Mapeado", pending = "Pendente") => (condition ? mapped : pending);
  const scoreFromItems = (items) => {
    const weights = { Demo: 100, Mapeado: 85, Parcial: 55, Pesquisa: 35, Futuro: 20, Pendente: 0 };
    return Math.round(items.reduce((sum, [, itemStatus]) => sum + (weights[itemStatus] ?? 0), 0) / items.length);
  };

  const groups = [
    {
      title: "Seguranca e acesso",
      items: [
        ["Login real com sessao segura", "Pendente"],
        ["Permissoes por perfil e convenio", status(hasAccessMatrix)],
        ["Auditoria de operacoes sensiveis", status(hasAudit, "Parcial")],
        ["Resumo de eventos sensiveis", status(hasSensitiveAuditSummary, "Demo", "Pendente")],
        ["Navegacao protegida por perfil", status(hasGuardedNavigation, "Demo", "Pendente")],
        ["Checklist de seguranca do MVP", status(hasMvpSecurityChecklist, "Demo", "Pendente")],
        ["Consulta de margem condicionada por convenio", status(hasConventionConsultPolicy, "Demo", "Pendente")],
        ["Consignataria habilitada por convenio", status(hasLenderAgreementAccess, "Demo", "Pendente")],
        ["Bloqueio de credenciamento auditavel", status(hasAccreditationBlockAudit, "Demo", "Pendente")],
        ["Politica LGPD e minimizacao de dados", "Pendente"],
      ],
    },
    {
      title: "Dados e folha",
      items: [
        ["Layout de margem importada", status(hasMarginGuard, "Demo", "Parcial")],
        ["Arquivo de insercao para folha", status(hasInsertionGuard, "Demo", "Mapeado")],
        ["Arquivo retorno com motivos", status(hasReturnGuard, "Demo", "Mapeado")],
        ["Protocolos por competencia", hasProtocols ? "Parcial" : status(hasFileEvidence, "Pendente")],
        ["Fechamento da competencia", hasClosingDecision ? (hasClosingBlocker ? "Parcial" : "Demo") : "Pendente"],
      ],
    },
    {
      title: "Motor de margem",
      items: [
        ["Calculo por matricula", status(hasEnrollments)],
        ["Reserva reduzindo saldo", status(hasContracts, "Demo")],
        ["Contrato consumindo margem", status(hasContracts, "Demo")],
        ["Baixa de parcela e liquidacao", status(hasInstallmentProgress, "Demo", "Pendente")],
        ["Bloqueios e margem negativa", status(hasFileGuards, "Parcial")],
      ],
    },
    {
      title: "Operacao piloto",
      items: [
        ["Convenio piloto definido", status(hasPilotConvention, "Demo")],
        ["Massa homologada", homologationScore >= 100 ? "Mapeado" : homologationScore >= 80 ? "Parcial" : "Pendente"],
        ["Roteiro de teste de ponta a ponta", status(qaScenarios.length, "Parcial")],
        ["Aceite do gestor/RH", qaApprovalScore >= 100 ? "Mapeado" : qaApprovalScore >= 80 ? "Parcial" : "Pendente"],
      ],
    },
    {
      title: "Integracoes",
      items: [
        ["API interna desenhada", status(hasApiPlan)],
        ["Webhooks de eventos", "Pesquisa"],
        ["Conector de folha", "Futuro"],
        [
          "Consulta de fonte publica",
          publicValidationCoverage.complete
            ? "Demo"
            : publicValidationCoverage.recorded
              ? "Parcial"
              : status(hasPublicValidationSource, "Pesquisa", "Pendente"),
        ],
      ],
    },
  ];

  return groups.map((group) => ({ ...group, score: scoreFromItems(group.items) }));
}

function getReadinessCurrentDecision(groups) {
  const average = Math.round(groups.reduce((total, group) => total + group.score, 0) / groups.length);
  const critical = groups.flatMap((group) => group.items).filter(([, status]) => status === "Pendente").length;
  const nextGroup = groups.slice().sort((a, b) => a.score - b.score)[0];
  const nextItem = nextGroup.items.find(([, status]) => status === "Pendente") || nextGroup.items.find(([, status]) => !["Demo", "Mapeado"].includes(status)) || nextGroup.items[0];
  return {
    average,
    critical,
    nextGroup,
    nextItem,
    label: average >= 75 ? "MVP forte para demonstracao" : average >= 55 ? "MVP em maturacao operacional" : "MVP ainda exige consolidacao",
  };
}

function getReadinessStatusClass(status) {
  if (status === "Demo" || status === "Mapeado") return "";
  if (status === "Parcial" || status === "Pesquisa" || status === "Futuro") return "warning";
  return "danger";
}

function getReadinessNextAction(decision) {
  if (typeof getRoadmapCriterionTarget === "function") {
    return getRoadmapCriterionTarget(decision.nextItem[0]);
  }

  return { target: "qa", action: "Abrir homologacao" };
}

function getReadinessApprovalLabel() {
  const approval = state.pilotQaApproval;
  if (!approval) return "Aceite ainda nao registrado";
  const freshness = typeof getPilotQaApprovalFreshness === "function" ? getPilotQaApprovalFreshness() : { label: approval.status || "Checkpoint" };
  return `${freshness.label || approval.status || "Checkpoint"}: ${approval.score || 0}% em ${approval.date || "data nao informada"}`;
}

function getReadinessApprovalEvidence() {
  const approval = state.pilotQaApproval;
  if (!approval) return "Registre a homologacao para congelar protocolo, fechamento e proxima pendencia.";
  const freshness = typeof getPilotQaApprovalFreshness === "function" ? getPilotQaApprovalFreshness() : { detail: "" };
  return `Protocolo: ${approval.protocol || "nao informado"}. Fechamento: ${approval.closing || "nao informado"}. Proxima pendencia: ${approval.nextPending || "nao informada"}. ${freshness.detail || ""}`;
}

function ensureReadinessView() {
  if (document.getElementById("readiness-view")) return;

  const nav = document.querySelector(".nav-list");
  const roadmapButton = document.querySelector('[data-view="roadmap"]');
  const demoButton = document.querySelector('[data-view="demo"]');
  const button = document.createElement("button");
  button.className = "nav-item";
  button.dataset.view = "readiness";
  button.type = "button";
  button.textContent = "Prontidao V1";
  button.addEventListener("click", () => openView("readiness"));
  nav?.insertBefore(button, roadmapButton?.nextSibling || demoButton || null);

  document.querySelector(".main-panel")?.insertAdjacentHTML(
    "beforeend",
    `
      <section class="view" id="readiness-view" aria-labelledby="readiness-title">
        <div class="section-heading row-heading">
          <div>
            <h2 id="readiness-title">Prontidao para V1 operacional</h2>
            <p>Veja o que ja esta demonstrado, o que esta mapeado e o que precisa maturar antes do piloto real.</p>
          </div>
          <button class="primary-button" id="readiness-audit-button" type="button">Registrar checkpoint</button>
        </div>

        <section class="panel readiness-command" id="readiness-command"></section>

        <div class="readiness-summary-grid" id="readiness-summary-grid"></div>

        <section class="panel readiness-panel">
          <div class="panel-heading">
            <h3>Checklist por frente</h3>
          </div>
          <div class="readiness-grid" id="readiness-grid"></div>
        </section>

        <section class="panel">
          <div class="panel-heading">
            <h3>Decisao de engenharia</h3>
          </div>
          <div class="readiness-decision-list" id="readiness-decisions"></div>
        </section>
      </section>
    `
  );

  document.getElementById("readiness-audit-button")?.addEventListener("click", () => {
    auditEvent("Checkpoint de prontidao da V1 registrado.", "Prontidao V1");
    saveState();
    render();
    openView("readiness");
  });
}

function renderReadiness() {
  ensureReadinessView();

  const summary = document.getElementById("readiness-summary-grid");
  const command = document.getElementById("readiness-command");
  const grid = document.getElementById("readiness-grid");
  const decisions = document.getElementById("readiness-decisions");
  if (!summary || !command || !grid || !decisions) return;

  const groups = getReadinessGroups();
  const decision = getReadinessCurrentDecision(groups);
  const nextAction = getReadinessNextAction(decision);
  const approvalLabel = getReadinessApprovalLabel();
  const approvalEvidence = getReadinessApprovalEvidence();
  const average = decision.average;
  const mappedItems = groups.flatMap((group) => group.items).filter(([, status]) => ["Demo", "Mapeado", "Parcial"].includes(status)).length;
  const pendingItems = decision.critical;

  command.innerHTML = `
    <div>
      <span class="readiness-command-label">${decision.label}</span>
      <strong>${decision.nextGroup.title}</strong>
      <p>Frente com menor maturidade atual: ${decision.nextGroup.score}%. Proximo criterio: ${decision.nextItem[0]} (${decision.nextItem[1]}). ${approvalLabel}.</p>
    </div>
    <div class="readiness-command-actions">
      <div class="readiness-command-meter" aria-label="${average}% de prontidao geral">
        <span style="width: ${average}%"></span>
      </div>
      <button class="primary-button readiness-next-action" data-target-view="${nextAction.target}" type="button">${nextAction.action}</button>
    </div>
  `;

  summary.innerHTML = [
    ["Prontidao geral", `${average}%`],
    ["Frentes", groups.length],
    ["Itens mapeados", mappedItems],
    ["Pendencias criticas", pendingItems],
  ]
    .map(
      ([label, value]) => `
        <article class="readiness-summary-card">
          <span>${label}</span>
          <strong>${value}</strong>
        </article>
      `
    )
    .join("");

  grid.innerHTML = groups
    .map(
      (group) => `
        <article class="readiness-card ${group.title === decision.nextGroup.title ? "next" : ""}">
          <div class="readiness-card-heading">
            <div>
              <strong>${group.title}</strong>
              <span>${group.score}% de maturidade${group.title === decision.nextGroup.title ? " - proximo foco" : ""}</span>
            </div>
            <div class="readiness-meter" aria-label="${group.score}%">
              <span style="width: ${group.score}%"></span>
            </div>
          </div>
          <div class="readiness-item-list">
            ${group.items
              .map(
                ([label, status]) => `
                  <div class="readiness-item ${group.title === decision.nextGroup.title && label === decision.nextItem[0] ? "next" : ""}">
                    <span>${label}</span>
                    <strong class="status ${getReadinessStatusClass(status)}">${status}</strong>
                  </div>
                `
              )
              .join("")}
          </div>
        </article>
      `
    )
    .join("");

  decisions.innerHTML = `
    <div class="readiness-decision">
      <strong>Evidencias do aceite</strong>
      <span>${approvalEvidence}</span>
    </div>
    <div class="readiness-decision">
      <strong>Manter a demo estatica ate fechar aceite operacional</strong>
      <span>A demo ja valida regras importantes; agora a decisao deve ser guiada por homologacao, protocolos e pendencias reais.</span>
    </div>
    <div class="readiness-decision">
      <strong>Comecar backend somente com nucleo bem definido</strong>
      <span>Login, banco, auditoria e API devem nascer juntos para evitar remendos de seguranca.</span>
    </div>
    <div class="readiness-decision">
      <strong>Piloto precisa de escopo pequeno</strong>
      <span>Um convenio, um layout de margem, um fluxo de insercao/retorno e poucas consignatarias homologadas.</span>
    </div>
  `;

  document.querySelector(".readiness-next-action")?.addEventListener("click", (event) => {
    openView(event.currentTarget.dataset.targetView);
  });
}

const readinessStyle = document.createElement("style");
readinessStyle.textContent = `
  .readiness-summary-grid,
  .readiness-grid {
    display: grid;
    gap: 14px;
  }
  .readiness-summary-grid {
    grid-template-columns: repeat(4, minmax(150px, 1fr));
    margin-bottom: 18px;
  }
  .readiness-command {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(220px, 300px);
    gap: 16px;
    align-items: center;
    margin-bottom: 18px;
    background: linear-gradient(135deg, #f8fafc, #eef6ff);
  }
  .readiness-command-label {
    display: block;
    color: var(--muted);
    font-size: 13px;
    font-weight: 700;
    margin-bottom: 6px;
  }
  .readiness-command strong {
    display: block;
    font-size: 20px;
  }
  .readiness-command p {
    margin: 6px 0 0;
    color: var(--muted);
    line-height: 1.4;
  }
  .readiness-command-actions {
    display: grid;
    gap: 10px;
  }
  .readiness-command-meter {
    height: 10px;
    overflow: hidden;
    border-radius: 999px;
    background: var(--line);
  }
  .readiness-command-meter span {
    display: block;
    height: 100%;
    background: var(--primary);
  }
  .readiness-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .readiness-summary-card,
  .readiness-command,
  .readiness-card,
  .readiness-decision {
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface-2);
  }
  .readiness-summary-card {
    padding: 16px;
    box-shadow: var(--shadow);
  }
  .readiness-summary-card span,
  .readiness-card span,
  .readiness-decision span {
    display: block;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.4;
  }
  .readiness-summary-card strong {
    display: block;
    margin-top: 8px;
    font-size: 26px;
  }
  .readiness-card {
    padding: 14px;
  }
  .readiness-card.next {
    border-color: rgba(37, 99, 235, 0.34);
    background: #f8fbff;
  }
  .readiness-card-heading {
    display: grid;
    gap: 10px;
    margin-bottom: 12px;
  }
  .readiness-meter {
    height: 8px;
    overflow: hidden;
    border-radius: 999px;
    background: var(--line);
  }
  .readiness-meter span {
    display: block;
    height: 100%;
    background: var(--primary);
  }
  .readiness-item-list,
  .readiness-decision-list {
    display: grid;
    gap: 8px;
  }
  .readiness-item {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 10px;
    align-items: center;
    padding-top: 8px;
    border-top: 1px solid var(--line);
  }
  .readiness-item.next {
    padding: 10px;
    border: 1px solid rgba(37, 99, 235, 0.28);
    border-radius: 8px;
    background: #fff;
  }
  .readiness-decision {
    padding: 12px;
  }
  .readiness-decision span {
    margin-top: 4px;
  }
  @media (max-width: 1040px) {
    .readiness-summary-grid,
    .readiness-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .readiness-command {
      grid-template-columns: 1fr;
    }
  }
  @media (max-width: 700px) {
    .readiness-summary-grid,
    .readiness-grid,
    .readiness-item {
      grid-template-columns: 1fr;
    }
  }
`;
document.head.appendChild(readinessStyle);

const renderBeforeReadiness = render;
render = function renderWithReadiness() {
  renderBeforeReadiness();
  renderReadiness();
};

render();
