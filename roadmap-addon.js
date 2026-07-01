if (!pageTitles.roadmap) {
  pageTitles.roadmap = "Roadmap";
}

if (!profileConfig.manager.views.includes("roadmap")) {
  const qaIndex = profileConfig.manager.views.indexOf("qa");
  profileConfig.manager.views.splice(qaIndex >= 0 ? qaIndex + 1 : profileConfig.manager.views.length, 0, "roadmap");
}

function getRoadmapTracks() {
  return [
    {
      phase: "Demo atual",
      status: "Em andamento",
      goal: "Demonstrar valor, fluxo operacional e diferenciais do produto sem backend real.",
      items: ["Fluxo piloto", "Fila de pendencias", "Fechamento", "Homologacao", "Prontidao V1", "API sandbox"],
      risk: "Dados ficam no navegador e servem apenas para demonstracao.",
    },
    {
      phase: "Piloto controlado",
      status: "Proximo",
      goal: "Rodar com dados controlados de um convenio, validando regras, layouts e usabilidade.",
      items: ["Layouts homologados", "Arquivo margem real", "Insercao/retorno em massa de teste", "Permissoes por perfil", "Relatorios basicos"],
      risk: "Precisa separar ambiente de teste e registrar aceite do convenio.",
    },
    {
      phase: "V1 operacional",
      status: "Arquitetura",
      goal: "Migrar para backend, banco, login, APIs, auditoria forte e operacao multi-convenio.",
      items: ["Backend API-first", "PostgreSQL", "Autenticacao", "RBAC", "Auditoria imutavel", "Jobs de processamento"],
      risk: "Seguranca, LGPD e integracoes passam a ser caminho critico.",
    },
    {
      phase: "Diferenciais futuros",
      status: "Pesquisa",
      goal: "Criar vantagens competitivas sem comprometer seguranca ou foco operacional.",
      items: ["IA assistiva", "Fontes publicas de validacao", "Conectores de folha", "Webhooks", "Portal do servidor evoluido"],
      risk: "Evitar automatizar decisao sensivel antes de ter governanca madura.",
    },
  ];
}

function getRoadmapCriterionTarget(label) {
  const text = String(label || "").toLowerCase();
  if (text.includes("convenio piloto")) return { target: "settings", action: "Configurar convenio" };
  if (text.includes("massa") || text.includes("roteiro") || text.includes("aceite")) return { target: "qa", action: "Abrir homologacao" };
  if (text.includes("login") || text.includes("permissoes") || text.includes("lgpd") || text.includes("navegacao")) return { target: "access", action: "Ver acessos" };
  if (text.includes("auditoria")) return { target: "audit", action: "Ver auditoria" };
  if (text.includes("fechamento")) return { target: "closing", action: "Ver fechamento" };
  if (text.includes("arquivo") || text.includes("layout") || text.includes("protocolos")) return { target: "import", action: "Ver arquivos" };
  if (text.includes("calculo") || text.includes("reserva") || text.includes("contrato") || text.includes("baixa") || text.includes("bloqueios")) return { target: "pilot", action: "Abrir fluxo" };
  if (text.includes("fonte publica") || text.includes("validacao")) return { target: "identity", action: "Validar servidor" };
  if (text.includes("api") || text.includes("webhooks") || text.includes("conector")) return { target: "integrations", action: "Ver integracoes" };
  return { target: "readiness", action: "Ver prontidao" };
}

function getRoadmapCurrentFocus() {
  if (typeof getReadinessGroups !== "function" || typeof getReadinessCurrentDecision !== "function") {
    return {
      title: "Homologacao operacional",
      detail: "Validar o roteiro ponta a ponta antes de abrir novas frentes.",
      target: "qa",
      action: "Abrir homologacao",
    };
  }

  const decision = getReadinessCurrentDecision(getReadinessGroups());
  const criterionTarget = getRoadmapCriterionTarget(decision.nextItem[0]);
  const qaStage = typeof getPilotQaStageSummary === "function" ? getPilotQaStageSummary() : null;
  const stageDetail = qaStage ? ` Estagio: ${qaStage.labelWithScore}.` : "";
  return {
    title: decision.nextGroup.title,
    detail: `${decision.nextGroup.score}% de maturidade. Proximo criterio: ${decision.nextItem[0]} (${decision.nextItem[1]}). Acao sugerida: ${criterionTarget.action}.${stageDetail}`,
    target: criterionTarget.target,
    action: criterionTarget.action,
  };
}

function ensureRoadmapView() {
  if (document.getElementById("roadmap-view")) return;

  const nav = document.querySelector(".nav-list");
  const qaButton = document.querySelector('[data-view="qa"]');
  const demoButton = document.querySelector('[data-view="demo"]');
  const button = document.createElement("button");
  button.className = "nav-item";
  button.dataset.view = "roadmap";
  button.type = "button";
  button.textContent = "Roadmap";
  button.addEventListener("click", () => openView("roadmap"));
  nav?.insertBefore(button, qaButton?.nextSibling || demoButton || null);

  document.querySelector(".main-panel")?.insertAdjacentHTML(
    "beforeend",
    `
      <section class="view" id="roadmap-view" aria-labelledby="roadmap-title">
        <div class="section-heading row-heading">
          <div>
            <h2 id="roadmap-title">Roadmap do projeto</h2>
            <p>Organize o que esta na demo, o que vai para piloto e o que exige arquitetura real.</p>
          </div>
          <button class="primary-button" id="roadmap-audit-button" type="button">Registrar revisao</button>
        </div>

        <section class="panel roadmap-command" id="roadmap-command"></section>

        <div class="roadmap-summary-grid" id="roadmap-summary-grid"></div>

        <section class="panel roadmap-panel">
          <div class="panel-heading">
            <h3>Fases de evolucao</h3>
          </div>
          <div class="roadmap-list" id="roadmap-list"></div>
        </section>

        <div class="content-grid roadmap-content">
          <section class="panel">
            <div class="panel-heading">
              <h3>Decisoes agora</h3>
            </div>
            <div class="roadmap-note-list" id="roadmap-now"></div>
          </section>

          <section class="panel">
            <div class="panel-heading">
              <h3>Guardar para depois</h3>
            </div>
            <div class="roadmap-note-list" id="roadmap-later"></div>
          </section>
        </div>
      </section>
    `
  );

  document.getElementById("roadmap-audit-button")?.addEventListener("click", () => {
    auditEvent("Revisao do roadmap do projeto registrada.", "Roadmap");
    saveState();
    render();
    openView("roadmap");
  });
}

function renderRoadmap() {
  ensureRoadmapView();

  const summary = document.getElementById("roadmap-summary-grid");
  const command = document.getElementById("roadmap-command");
  const list = document.getElementById("roadmap-list");
  const now = document.getElementById("roadmap-now");
  const later = document.getElementById("roadmap-later");
  if (!summary || !command || !list || !now || !later) return;

  const tracks = getRoadmapTracks();
  const focus = getRoadmapCurrentFocus();
  const cards = [
    ["Fases", tracks.length],
    ["Demo", 1],
    ["Piloto/V1", 2],
    ["Pesquisa", 1],
  ];

  command.innerHTML = `
    <div>
      <span>Proximo foco recomendado</span>
      <strong>${focus.title}</strong>
      <p>${focus.detail}</p>
    </div>
    <button class="primary-button roadmap-focus-action" data-target-view="${focus.target}" type="button">${focus.action}</button>
  `;

  summary.innerHTML = cards
    .map(
      ([label, value]) => `
        <article class="roadmap-summary-card">
          <span>${label}</span>
          <strong>${value}</strong>
        </article>
      `
    )
    .join("");

  list.innerHTML = tracks
    .map((track) => {
      const statusClass = track.status === "Pesquisa" ? "warning" : track.status === "Arquitetura" ? "danger" : "";
      return `
        <article class="roadmap-row">
          <div>
            <strong>${track.phase}</strong>
            <span>${track.goal}</span>
          </div>
          <span class="status ${statusClass}">${track.status}</span>
          <p><strong>Entregas:</strong> ${track.items.join(", ")}.</p>
          <p><strong>Risco:</strong> ${track.risk}</p>
        </article>
      `;
    })
    .join("");

  now.innerHTML = `
    <div class="roadmap-note">
      <strong>Priorizar o menor indicador de prontidao</strong>
      <span>Use o foco recomendado acima e ataque o criterio pendente antes de abrir frentes paralelas demais.</span>
    </div>
    <div class="roadmap-note">
      <strong>Validar fluxo com alguem de negocio</strong>
      <span>O proximo ganho real vem de testar narrativa, termos e regras com usuarios do dominio.</span>
    </div>
    <div class="roadmap-note">
      <strong>Preparar transicao tecnica</strong>
      <span>Separar quais telas viram entidades reais no banco e quais continuam como apoio/relatorio.</span>
    </div>
  `;

  later.innerHTML = `
    <div class="roadmap-note">
      <strong>Fontes publicas de validacao</strong>
      <span>Pesquisar portal da transparencia por municipio e tratar como sinal complementar auditavel.</span>
    </div>
    <div class="roadmap-note">
      <strong>IA assistiva</strong>
      <span>Entrar primeiro para explicar, resumir e orientar, sem tomar decisao de credito ou reserva.</span>
    </div>
    <div class="roadmap-note">
      <strong>Integracoes reais</strong>
      <span>Comecar por uma folha e uma consignataria piloto, com contrato de API e massa homologada.</span>
    </div>
  `;

  document.querySelector(".roadmap-focus-action")?.addEventListener("click", (event) => {
    openView(event.currentTarget.dataset.targetView);
  });
}

const roadmapStyle = document.createElement("style");
roadmapStyle.textContent = `
  .roadmap-summary-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(150px, 1fr));
    gap: 14px;
    margin-bottom: 18px;
  }
  .roadmap-summary-card,
  .roadmap-command,
  .roadmap-row,
  .roadmap-note {
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
  }
  .roadmap-summary-card {
    padding: 16px;
    box-shadow: var(--shadow);
  }
  .roadmap-command {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 14px;
    align-items: center;
    margin-bottom: 18px;
    padding: 16px;
    background: var(--surface-2);
  }
  .roadmap-summary-card span,
  .roadmap-command span,
  .roadmap-command p,
  .roadmap-row span,
  .roadmap-row p,
  .roadmap-note span {
    display: block;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.4;
  }
  .roadmap-summary-card strong {
    display: block;
    margin-top: 8px;
    font-size: 26px;
  }
  .roadmap-command strong {
    display: block;
    margin-top: 6px;
    font-size: 20px;
  }
  .roadmap-command p {
    margin: 6px 0 0;
  }
  .roadmap-list,
  .roadmap-note-list {
    display: grid;
    gap: 10px;
  }
  .roadmap-row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 12px;
    align-items: start;
    padding: 12px;
    background: var(--surface-2);
  }
  .roadmap-row p {
    grid-column: 1 / -1;
    margin: 0;
  }
  .roadmap-row p strong {
    color: var(--text);
    font-size: 13px;
  }
  .roadmap-note {
    padding: 12px;
    background: var(--surface-2);
  }
  .roadmap-note span {
    margin-top: 4px;
  }
  @media (max-width: 1040px) {
    .roadmap-summary-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 640px) {
    .roadmap-summary-grid,
    .roadmap-command,
    .roadmap-row {
      grid-template-columns: 1fr;
    }
  }
`;
document.head.appendChild(roadmapStyle);

const renderBeforeRoadmap = render;
render = function renderWithRoadmap() {
  renderBeforeRoadmap();
  renderRoadmap();
};

render();
