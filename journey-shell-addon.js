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

function getAvailableJourneyViews(stage) {
  const config = profileConfig[state.currentProfile] || profileConfig.manager;
  return stage.views.filter((view) => config.views.includes(view) && document.getElementById(`${view}-view`));
}

function getActiveJourneyStage(activeView) {
  return getJourneyStages().find((stage) => stage.views.includes(activeView)) || getJourneyStages()[0];
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
          <button class="secondary-button" id="journey-primary-action" type="button">Abrir proxima acao</button>
        </div>
        <div class="journey-stage-list" id="journey-stage-list"></div>
        <div class="journey-module-list" id="journey-module-list"></div>
      </section>
    `
  );
}

function renderJourneyShell() {
  ensureJourneyShell();
  const shell = document.getElementById("journey-shell");
  const stageList = document.getElementById("journey-stage-list");
  const moduleList = document.getElementById("journey-module-list");
  const title = document.getElementById("journey-current-title");
  const action = document.getElementById("journey-primary-action");
  if (!shell || !stageList || !moduleList || !title || !action) return;

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
  .journey-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .journey-head span,
  .journey-empty {
    display: block;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.4;
  }
  .journey-head strong {
    display: block;
    margin-top: 3px;
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
      flex-direction: column;
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
