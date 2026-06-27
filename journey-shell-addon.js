function getJourneyStages() {
  return [
    {
      id: "base",
      title: "Base",
      detail: "Dados, vinculo e margem.",
      views: ["employees", "identity", "enrollment", "margin", "validation"],
    },
    {
      id: "operation",
      title: "Operacao",
      detail: "Simulacao, reserva e autorizacao.",
      views: ["simulation", "contracts", "authorizations", "contractrules", "contractfields", "debtops"],
    },
    {
      id: "payroll",
      title: "Folha",
      detail: "Arquivos, retorno e fechamento.",
      views: ["import", "payroll", "protocols", "reconciliation", "competencies", "adjustments", "closing"],
    },
    {
      id: "management",
      title: "Gestao",
      detail: "Pendencias, prontidao e auditoria.",
      views: ["dashboard", "queue", "pilot", "readiness", "audit", "roadmap"],
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
      views: ["employees", "identity", "enrollment", "margin", "validation", "marginhealth", "authenticity"],
    },
    {
      title: "Operacao",
      views: ["simulation", "contracts", "authorizations", "contractrules", "contractfields", "debtops", "debtbalance", "debtinsights"],
    },
    {
      title: "Folha",
      views: ["import", "payroll", "protocols", "reconciliation", "competencies", "adjustments", "closing", "layouts"],
    },
    {
      title: "Gestao",
      views: ["readiness", "audit", "roadmap", "tickets", "lenders", "integrations", "apisandbox", "accesscontrol"],
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
  const title = document.getElementById("journey-current-title");
  const action = document.getElementById("journey-primary-action");
  const health = document.getElementById("journey-health");
  if (!shell || !stageList || !moduleList || !title || !action || !health) return;

  shell.hidden = state.currentProfile !== "manager";
  if (shell.hidden) return;

  const activeView = document.querySelector(".view.active")?.id?.replace("-view", "") || "dashboard";
  const activeStage = getActiveJourneyStage(activeView);
  const stages = getJourneyStages();
  const pilotSteps = typeof getPilotFlowSteps === "function" ? getPilotFlowSteps() : [];
  const journey = typeof getPilotJourneyHealth === "function" && pilotSteps.length ? getPilotJourneyHealth(pilotSteps) : null;
  const nextTarget = journey?.current?.target || getAvailableJourneyViews(activeStage)[0] || "dashboard";

  title.textContent = `${activeStage.title}: ${activeStage.detail}`;
  action.textContent = journey?.current?.action || "Abrir etapa";
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
      <small>${journey.warnings + journey.critical} alerta(s) no ciclo</small>
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
      return `
        <button class="journey-stage ${stage.id === activeStage.id ? "active" : ""}" type="button" data-journey-stage="${stage.id}" ${available.length ? "" : "disabled"}>
          <span>${stage.title}</span>
          <strong>${available.length}</strong>
        </button>
      `;
    })
    .join("");

  const currentViews = getAvailableJourneyViews(activeStage);
  moduleList.innerHTML = currentViews.length
    ? currentViews
        .map(
          (view) => `
            <button class="journey-module ${view === activeView ? "active" : ""}" type="button" data-target-view="${view}">
              ${pageTitles[view] || view}
            </button>
          `
        )
        .join("")
    : `<span class="journey-empty">Nenhum modulo disponivel para este perfil.</span>`;

  stageList.querySelectorAll(".journey-stage").forEach((button) => {
    button.addEventListener("click", () => {
      const stage = stages.find((item) => item.id === button.dataset.journeyStage);
      const firstView = stage ? getAvailableJourneyViews(stage)[0] : null;
      if (firstView) openView(firstView);
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
  .journey-module {
    padding: 0 12px;
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
