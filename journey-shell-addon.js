function getJourneyStages() {
  return [
    {
      id: "base",
      title: "Base",
      detail: "Dados, vinculo e margem.",
      guidance: "Garanta que servidor, vinculo, identidade e margem estejam confiaveis antes de qualquer operacao.",
      views: ["employees", "identity", "enrollments", "margin", "validation", "health", "authenticity"],
    },
    {
      id: "operation",
      title: "Operacao",
      detail: "Simulacao, reserva e autorizacao.",
      guidance: "Use a etapa para simular, reservar, validar contrato e controlar autorizacoes antes do envio a folha.",
      views: ["simulation", "contracts", "authorizations", "contractrules", "contractfields", "debtops", "debtbalance", "debt"],
    },
    {
      id: "payroll",
      title: "Folha",
      detail: "Arquivos, retorno e fechamento.",
      guidance: "Conduza insercao, retorno, conciliacao e fechamento da competencia com bloqueios visiveis.",
      views: ["import", "payroll", "protocols", "reconciliation", "competencies", "adjustments", "closing", "layouts"],
    },
    {
      id: "management",
      title: "Gestao",
      detail: "Pendencias, prontidao e auditoria.",
      guidance: "Acompanhe pendencias, prontidao, auditoria, credenciamento, integracoes e acessos do ambiente.",
      views: ["dashboard", "queue", "pilot", "readiness", "audit", "roadmap", "tickets", "lenders", "integrations", "api", "access"],
    },
  ];
}

function getSidebarGroups() {
  return [
    {
      title: "Inicio",
      views: ["dashboard", "queue", "pilot"],
    },
    {
      title: "Base",
      views: ["employees", "identity", "enrollments", "margin", "validation", "health", "authenticity"],
    },
    {
      title: "Operacao",
      views: ["simulation", "contracts", "authorizations", "contractrules", "contractfields", "debtops", "debtbalance", "debt"],
    },
    {
      title: "Folha",
      views: ["import", "payroll", "protocols", "reconciliation", "competencies", "adjustments", "closing", "layouts"],
    },
    {
      title: "Gestao",
      views: ["readiness", "audit", "roadmap", "tickets", "lenders", "integrations", "api", "access"],
    },
  ];
}

function getAvailableJourneyViews(stage) {
  const config = profileConfig[state.currentProfile] || profileConfig.manager;
  return stage.views.filter((view) => config.views.includes(view) && document.getElementById(`${view}-view`));
}

function getActiveJourneyStage(activeView) {
  return getJourneyStages().find((stage) => stage.views.includes(activeView)) || getJourneyStages()[0];
}

function getJourneyFocusItem() {
  if (typeof getOperationalQueueData !== "function") return null;
  const data = getOperationalQueueData();
  return data.items.find((item) => item.severity === "Alta") || data.items.find((item) => item.severity === "Media") || null;
}

function escapeJourneyText(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function compactJourneyText(value, limit = 76) {
  const text = String(value ?? "").trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 3)).trim()}...`;
}

function getJourneyFocusSummary(item) {
  if (!item) return "";
  return compactJourneyText(`${item.severity}: ${item.area} - ${item.title}`);
}

function getJourneyAttentionByStage() {
  const result = new Map(getJourneyStages().map((stage) => [stage.id, { high: 0, medium: 0 }]));
  if (typeof getOperationalQueueData !== "function") return result;

  getOperationalQueueData().items.forEach((item) => {
    const stage = getJourneyStages().find((candidate) => candidate.views.includes(item.target));
    if (!stage) return;
    const attention = result.get(stage.id);
    if (item.severity === "Alta") attention.high += 1;
    if (item.severity === "Media") attention.medium += 1;
  });

  return result;
}

function getJourneyAttentionByView() {
  const result = new Map();
  if (typeof getOperationalQueueData !== "function") return result;

  getOperationalQueueData().items.forEach((item) => {
    if (!item.target) return;
    const current = result.get(item.target) || { high: 0, medium: 0 };
    if (item.severity === "Alta") current.high += 1;
    if (item.severity === "Media") current.medium += 1;
    result.set(item.target, current);
  });

  return result;
}

function getJourneyPriorityTargetForStage(stage) {
  if (typeof getOperationalQueueData !== "function") return null;
  const available = getAvailableJourneyViews(stage);
  const items = getOperationalQueueData().items
    .filter((item) => available.includes(item.target))
    .sort((a, b) => {
      const severityRank = { Alta: 0, Media: 1 };
      return (severityRank[a.severity] ?? 2) - (severityRank[b.severity] ?? 2);
    });

  return items[0]?.target || null;
}

function organizeSidebarNavigation() {
  const nav = document.querySelector(".nav-list");
  if (!nav || nav.dataset.journeyOrganizing === "true") return;

  nav.dataset.journeyOrganizing = "true";
  nav.querySelectorAll(".nav-section-label").forEach((label) => label.remove());

  const buttons = Array.from(nav.querySelectorAll(".nav-item"));
  const byView = new Map(buttons.map((button) => [button.dataset.view, button]));
  const placed = new Set();

  getSidebarGroups().forEach((group) => {
    const groupButtons = group.views.map((view) => byView.get(view)).filter(Boolean);
    if (!groupButtons.length) return;

    const label = document.createElement("div");
    label.className = "nav-section-label";
    label.textContent = group.title;
    label.hidden = groupButtons.every((button) => button.hidden);
    nav.appendChild(label);

    groupButtons.forEach((button) => {
      nav.appendChild(button);
      placed.add(button.dataset.view);
    });
  });

  const remaining = buttons.filter((button) => !placed.has(button.dataset.view));
  if (remaining.length) {
    const label = document.createElement("div");
    label.className = "nav-section-label";
    label.textContent = "Outros";
    label.hidden = remaining.every((button) => button.hidden);
    nav.appendChild(label);
    remaining.forEach((button) => nav.appendChild(button));
  }

  nav.dataset.journeyOrganizing = "false";
}

function ensureJourneyShell() {
  if (document.getElementById("journey-shell")) return;
  const topbar = document.querySelector(".topbar");
  if (!topbar) return;

  topbar.insertAdjacentHTML(
    "afterend",
    `
      <section class="journey-shell" id="journey-shell" aria-label="Jornada operacional">
        <div class="journey-head">
          <div>
            <span>Jornada operacional</span>
            <strong id="journey-current-title">Fluxo do MVP</strong>
          </div>
          <div class="journey-health" id="journey-health"></div>
          <button class="secondary-button" id="journey-primary-action" type="button">Abrir proxima acao</button>
        </div>
        <div class="journey-stage-list" id="journey-stage-list"></div>
        <div class="journey-module-list" id="journey-module-list"></div>
        <div class="journey-stage-note" id="journey-stage-note"></div>
      </section>
    `
  );
}

function renderJourneyShell() {
  organizeSidebarNavigation();
  ensureJourneyShell();
  const shell = document.getElementById("journey-shell");
  const stageList = document.getElementById("journey-stage-list");
  const moduleList = document.getElementById("journey-module-list");
  const stageNote = document.getElementById("journey-stage-note");
  const title = document.getElementById("journey-current-title");
  const action = document.getElementById("journey-primary-action");
  const health = document.getElementById("journey-health");
  if (!shell || !stageList || !moduleList || !stageNote || !title || !action || !health) return;

  shell.hidden = state.currentProfile !== "manager";
  if (shell.hidden) return;

  const activeView = document.querySelector(".view.active")?.id?.replace("-view", "") || "dashboard";
  const activeStage = getActiveJourneyStage(activeView);
  const stages = getJourneyStages();
  const attentionByStage = getJourneyAttentionByStage();
  const attentionByView = getJourneyAttentionByView();
  const pilotSteps = typeof getPilotFlowSteps === "function" ? getPilotFlowSteps() : [];
  const journey = typeof getPilotJourneyHealth === "function" && pilotSteps.length ? getPilotJourneyHealth(pilotSteps) : null;
  const focusItem = getJourneyFocusItem();
  const focusSummary = getJourneyFocusSummary(focusItem);
  const focusDetail = compactJourneyText(focusItem?.detail || focusItem?.description || focusItem?.title || "", 140);
  const nextTarget = focusItem?.target || journey?.current?.target || getAvailableJourneyViews(activeStage)[0] || "dashboard";
  const nextLabel = pageTitles[nextTarget] || nextTarget;

  title.textContent = `${activeStage.title}: ${activeStage.detail}`;
  action.textContent = focusItem ? "Abrir prioridade" : journey?.current?.action || "Abrir etapa";
  action.dataset.targetView = nextTarget;
  health.innerHTML = journey
    ? `
      <div class="journey-health-row">
        <span>${journey.label}</span>
        <strong>${journey.done}/${pilotSteps.length}</strong>
      </div>
      <div class="journey-health-meter" aria-label="${journey.percent}% do ciclo validado">
        <span style="width: ${journey.percent}%"></span>
      </div>
      <small title="${escapeJourneyText(focusDetail)}">${focusItem ? escapeJourneyText(focusSummary) : `${journey.warnings + journey.critical} alerta(s) no ciclo`}</small>
    `
    : `
      <div class="journey-health-row">
        <span>Ciclo</span>
        <strong>-</strong>
      </div>
      <div class="journey-health-meter" aria-label="Progresso indisponivel"><span style="width: 0%"></span></div>
      <small>Aguardando fluxo piloto.</small>
    `;

  stageList.innerHTML = stages
    .map((stage) => {
      const available = getAvailableJourneyViews(stage);
      const attention = attentionByStage.get(stage.id) || { high: 0, medium: 0 };
      const attentionTotal = attention.high + attention.medium;
      const attentionClass = attention.high ? "danger" : attention.medium ? "warning" : "";
      return `
        <button class="journey-stage ${stage.id === activeStage.id ? "active" : ""}" type="button" data-journey-stage="${stage.id}" ${available.length ? "" : "disabled"}>
          <span>${stage.title}</span>
          <strong class="${attentionClass}">${attentionTotal || available.length}</strong>
        </button>
      `;
    })
    .join("");

  const currentViews = getAvailableJourneyViews(activeStage);
  moduleList.innerHTML = currentViews.length
    ? currentViews
        .map(
          (view) => {
            const attention = attentionByView.get(view) || { high: 0, medium: 0 };
            const attentionTotal = attention.high + attention.medium;
            const attentionClass = attention.high ? "danger" : attention.medium ? "warning" : "";
            return `
              <button class="journey-module ${view === activeView ? "active" : ""} ${attentionClass}" type="button" data-target-view="${view}">
                <span>${pageTitles[view] || view}</span>
                ${attentionTotal ? `<strong>${attentionTotal}</strong>` : ""}
              </button>
            `;
          }
        )
        .join("")
    : `<span class="journey-empty">Nenhum modulo disponivel para este perfil.</span>`;

  stageNote.innerHTML = `
    <span>Objetivo da etapa</span>
    <strong>${escapeJourneyText(activeStage.guidance)}</strong>
    <em>Proximo atalho: ${escapeJourneyText(nextLabel)}</em>
  `;

  stageList.querySelectorAll(".journey-stage").forEach((button) => {
    button.addEventListener("click", () => {
      const stage = stages.find((item) => item.id === button.dataset.journeyStage);
      const targetView = stage ? getJourneyPriorityTargetForStage(stage) || getAvailableJourneyViews(stage)[0] : null;
      if (targetView) openView(targetView);
    });
  });

  moduleList.querySelectorAll(".journey-module").forEach((button) => {
    button.addEventListener("click", () => openView(button.dataset.targetView));
  });

  action.onclick = () => openView(action.dataset.targetView);
}

const journeyShellStyle = document.createElement("style");
journeyShellStyle.textContent = `
  .journey-shell {
    display: grid;
    gap: 12px;
    margin: -10px 0 24px;
    padding: 14px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
    box-shadow: var(--shadow);
  }
  .nav-section-label {
    padding: 12px 14px 2px;
    color: #8fa69b;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0;
    text-transform: uppercase;
  }
  .nav-section-label[hidden] {
    display: none;
  }
  .journey-head {
    display: grid;
    grid-template-columns: minmax(180px, 1fr) minmax(180px, 260px) auto;
    align-items: center;
    gap: 12px;
  }
  .journey-head span,
  .journey-empty,
  .journey-health small {
    display: block;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.4;
  }
  .journey-head strong {
    display: block;
    margin-top: 3px;
  }
  .journey-health {
    display: grid;
    gap: 5px;
    min-width: 0;
  }
  .journey-health small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .journey-health-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .journey-health-row strong {
    margin: 0;
    font-size: 13px;
    color: var(--primary-strong);
  }
  .journey-health-meter {
    height: 8px;
    overflow: hidden;
    border-radius: 999px;
    background: var(--line);
  }
  .journey-health-meter span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--primary);
  }
  .journey-stage-list,
  .journey-module-list {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding-bottom: 2px;
  }
  .journey-stage-note {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: #f8faf8;
    color: var(--muted);
    font-size: 13px;
  }
  .journey-stage-note span {
    color: var(--primary-strong);
    font-weight: 800;
  }
  .journey-stage-note strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text);
    font-weight: 700;
  }
  .journey-stage-note em {
    color: var(--muted);
    font-style: normal;
    white-space: nowrap;
  }
  .journey-stage,
  .journey-module {
    min-height: 38px;
    white-space: nowrap;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface-2);
    color: var(--text);
    font-weight: 700;
  }
  .journey-stage {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 10px;
    align-items: center;
    min-width: 150px;
    padding: 0 12px;
    text-align: left;
  }
  .journey-stage strong {
    display: grid;
    place-items: center;
    min-width: 26px;
    min-height: 26px;
    border-radius: 999px;
    background: #ffffff;
    color: var(--primary);
    font-size: 13px;
  }
  .journey-stage strong.warning {
    color: #ffffff;
    background: var(--accent);
  }
  .journey-stage strong.danger {
    color: #ffffff;
    background: var(--danger);
  }
  .journey-module {
    padding: 0 12px;
  }
  .journey-module {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .journey-module strong {
    display: grid;
    place-items: center;
    min-width: 22px;
    min-height: 22px;
    border-radius: 999px;
    background: #ffffff;
    color: var(--primary);
    font-size: 12px;
  }
  .journey-module.warning strong {
    color: #ffffff;
    background: var(--accent);
  }
  .journey-module.danger strong {
    color: #ffffff;
    background: var(--danger);
  }
  .journey-stage.active,
  .journey-module.active {
    border-color: rgba(15, 118, 110, 0.5);
    background: rgba(15, 118, 110, 0.11);
    color: var(--primary-strong);
  }
  .journey-stage:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  @media (max-width: 720px) {
    .journey-head {
      align-items: stretch;
      grid-template-columns: 1fr;
    }
    .journey-head .secondary-button {
      width: 100%;
    }
    .journey-health small {
      white-space: normal;
    }
    .journey-stage-note {
      grid-template-columns: 1fr;
    }
    .journey-stage-note strong,
    .journey-stage-note em {
      white-space: normal;
    }
  }
`;
document.head.appendChild(journeyShellStyle);

const renderBeforeJourneyShell = render;
render = function renderWithJourneyShell() {
  renderBeforeJourneyShell();
  renderJourneyShell();
};

const openViewBeforeJourneyShell = openView;
openView = function openViewWithJourneyShell(viewName) {
  openViewBeforeJourneyShell(viewName);
  renderJourneyShell();
};

render();
