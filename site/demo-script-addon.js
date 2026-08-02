if (!Array.isArray(state.demoScriptChecks)) {
  state.demoScriptChecks = [];
}

if (!Number.isInteger(state.demoScriptGuideIndex)) {
  state.demoScriptGuideIndex = 0;
}

function getDemoScriptSteps() {
  return [
    {
      id: "opening",
      title: "1. Abrir pelo cockpit",
      target: "dashboard",
      message: "Mostre que o gestor enxerga proxima acao, pendencias e prontidao sem navegar por todas as telas.",
      evidence: "Painel inicial com fluxo piloto, fila e prontidao V1.",
    },
    {
      id: "margin",
      title: "2. Validar arquivo de margem",
      target: "validation",
      message: "Explique que a base da folha nao entra se tiver CPF, matricula, renda ou status invalidos.",
      evidence: "Ultima margem validada e bloqueios criticos.",
    },
    {
      id: "enrollment",
      title: "3. Controlar margem por matricula",
      target: "enrollments",
      message: "Mostre que o contrato fica preso ao vinculo correto, nao apenas ao CPF.",
      evidence: "Matriculas/vinculos e margem por vinculo.",
    },
    {
      id: "reservation",
      title: "4. Simular e criar reserva",
      target: "simulation",
      message: "Demonstre produto, consignataria, taxa, CET, prazo e consumo de margem.",
      evidence: "Ranking de taxas e contratos/reservas.",
    },
    {
      id: "files",
      title: "5. Gerar insercao e processar retorno",
      target: "import",
      message: "Mostre que a insercao e o retorno passam por guardas antes de alterar contratos.",
      evidence: "Validacao de insercao e conciliacao de retorno.",
    },
    {
      id: "protocols",
      title: "6. Protocolar competencia",
      target: "protocols",
      message: "Mostre que margem, insercao e retorno ficam congelados em um snapshot operacional antes do fechamento.",
      evidence: "Ultimo protocolo com lotes, registros, pendencias e divergencias.",
    },
    {
      id: "closing",
      title: "7. Fechar excecoes com auditoria",
      target: "adjustments",
      message: "Explique que divergencia, rejeicao e reprocessamento exigem decisao formal.",
      evidence: "Ajustes, linha do tempo do contrato e auditoria.",
    },
    {
      id: "readiness",
      title: "8. Encerrar com prontidao",
      target: "readiness",
      message: "Feche mostrando o que ja esta demonstrado e o que ainda falta para operacao real.",
      evidence: "Prontidao V1 calculada pelo estado real do MVP.",
    },
  ];
}

function ensureDemoScriptPanel() {
  if (document.getElementById("demo-script-panel")) return;
  const demoPanel = document.querySelector("#demo-view .demo-panel");
  if (!demoPanel) return;

  demoPanel.insertAdjacentHTML(
    "afterend",
    `
      <section class="panel demo-script-panel" id="demo-script-panel">
        <div class="panel-heading">
          <h3>Roteiro de apresentacao</h3>
        </div>
        <div class="demo-script-list" id="demo-script-list"></div>
      </section>
    `
  );
}

function toggleDemoScriptStep(stepId) {
  state.demoScriptChecks = Array.isArray(state.demoScriptChecks) ? state.demoScriptChecks : [];
  if (state.demoScriptChecks.includes(stepId)) {
    state.demoScriptChecks = state.demoScriptChecks.filter((id) => id !== stepId);
  } else {
    state.demoScriptChecks.push(stepId);
  }
  saveState();
  render();
  openView("demo");
}

function setDemoScriptGuideIndex(index) {
  const steps = getDemoScriptSteps();
  const maxIndex = Math.max(0, steps.length - 1);
  state.demoScriptGuideIndex = Math.min(Math.max(0, index), maxIndex);
  saveState();
  render();
  openView("demo");
}

function getDemoScriptGuideStep(steps) {
  const index = Math.min(Math.max(0, Number(state.demoScriptGuideIndex || 0)), Math.max(0, steps.length - 1));
  return {
    index,
    step: steps[index] || null,
  };
}

function renderDemoScript() {
  ensureDemoScriptPanel();
  const list = document.getElementById("demo-script-list");
  if (!list) return;

  const checked = new Set(state.demoScriptChecks || []);
  const steps = getDemoScriptSteps();
  const done = steps.filter((step) => checked.has(step.id)).length;
  const guide = getDemoScriptGuideStep(steps);
  const guideStep = guide.step;
  const guideDone = guideStep ? checked.has(guideStep.id) : false;

  list.innerHTML = `
    ${
      guideStep
        ? `
          <section class="demo-script-guide" id="demo-script-guide">
            <div>
              <span>Modo guiado</span>
              <strong>${guideStep.title}</strong>
              <p>${guideStep.message}</p>
              <small>${guideStep.evidence}</small>
            </div>
            <div class="demo-script-guide-actions">
              <span>${guide.index + 1}/${steps.length}</span>
              <button class="secondary-button demo-script-prev" type="button" ${guide.index === 0 ? "disabled" : ""}>Anterior</button>
              <button class="secondary-button demo-script-current-check" data-script-step="${guideStep.id}" type="button">${guideDone ? "Desmarcar" : "Marcar evidencia"}</button>
              <button class="primary-button demo-script-current-open" data-target-view="${guideStep.target}" type="button">Abrir etapa</button>
              <button class="secondary-button demo-script-next" type="button" ${guide.index >= steps.length - 1 ? "disabled" : ""}>Proxima</button>
            </div>
          </section>
        `
        : ""
    }
    <div class="demo-script-progress">
      <div>
        <strong>${done}/${steps.length} etapa(s) marcadas</strong>
        <span>Use este roteiro para apresentar o MVP sem perder a narrativa operacional.</span>
      </div>
      <button class="secondary-button demo-script-reset" type="button">Limpar roteiro</button>
    </div>
    ${steps
      .map(
        (step) => `
          <article class="demo-script-row ${checked.has(step.id) ? "done" : ""}">
            <button class="demo-script-check" data-script-step="${step.id}" type="button">${checked.has(step.id) ? "OK" : ""}</button>
            <div>
              <strong>${step.title}</strong>
              <p>${step.message}</p>
              <span>${step.evidence}</span>
            </div>
            <button class="secondary-button demo-script-open" data-target-view="${step.target}" type="button">Abrir</button>
          </article>
        `
      )
      .join("")}
  `;

  document.querySelectorAll(".demo-script-check").forEach((button) => {
    button.addEventListener("click", () => toggleDemoScriptStep(button.dataset.scriptStep));
  });

  document.querySelector(".demo-script-current-check")?.addEventListener("click", (event) => {
    toggleDemoScriptStep(event.currentTarget.dataset.scriptStep);
  });

  document.querySelector(".demo-script-current-open")?.addEventListener("click", (event) => {
    openView(event.currentTarget.dataset.targetView);
  });

  document.querySelector(".demo-script-prev")?.addEventListener("click", () => {
    setDemoScriptGuideIndex(guide.index - 1);
  });

  document.querySelector(".demo-script-next")?.addEventListener("click", () => {
    setDemoScriptGuideIndex(guide.index + 1);
  });

  document.querySelectorAll(".demo-script-open").forEach((button) => {
    button.addEventListener("click", () => openView(button.dataset.targetView));
  });

  document.querySelector(".demo-script-reset")?.addEventListener("click", () => {
    state.demoScriptChecks = [];
    saveState();
    render();
    openView("demo");
  });
}

const demoScriptStyle = document.createElement("style");
demoScriptStyle.textContent = `
  .demo-script-panel {
    margin-top: 18px;
  }
  .demo-script-list {
    display: grid;
    gap: 10px;
  }
  .demo-script-guide {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(220px, 320px);
    gap: 14px;
    align-items: center;
    padding: 14px;
    border: 1px solid rgba(15, 118, 110, 0.28);
    border-radius: 8px;
    background: #f8faf8;
  }
  .demo-script-guide span,
  .demo-script-guide p,
  .demo-script-guide small {
    display: block;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.4;
  }
  .demo-script-guide strong {
    display: block;
    margin-top: 4px;
    font-size: 20px;
  }
  .demo-script-guide p {
    margin: 8px 0 0;
  }
  .demo-script-guide small {
    margin-top: 5px;
  }
  .demo-script-guide-actions {
    display: grid;
    gap: 8px;
  }
  .demo-script-guide-actions > span {
    justify-self: end;
    color: var(--primary-strong);
    font-weight: 800;
  }
  .demo-script-progress,
  .demo-script-row {
    display: grid;
    gap: 12px;
    align-items: center;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface-2);
    padding: 12px;
  }
  .demo-script-progress {
    grid-template-columns: 1fr auto;
  }
  .demo-script-row {
    grid-template-columns: 38px 1fr auto;
  }
  .demo-script-progress span,
  .demo-script-row span,
  .demo-script-row p {
    display: block;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.4;
    margin: 4px 0 0;
  }
  .demo-script-check {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: #fff;
    color: #047857;
    font-size: 11px;
    font-weight: 800;
    cursor: pointer;
  }
  .demo-script-row.done {
    border-color: #bbf7d0;
  }
  .demo-script-row.done .demo-script-check {
    background: #ecfdf3;
    border-color: #bbf7d0;
  }
  @media (max-width: 760px) {
    .demo-script-guide,
    .demo-script-progress,
    .demo-script-row {
      grid-template-columns: 1fr;
    }
    .demo-script-guide-actions > span {
      justify-self: start;
    }
    .demo-script-check {
      justify-self: start;
    }
  }
`;
document.head.appendChild(demoScriptStyle);

const renderBeforeDemoScript = render;
render = function renderWithDemoScript() {
  renderBeforeDemoScript();
  renderDemoScript();
};

render();
