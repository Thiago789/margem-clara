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
      items: ["Fluxo piloto", "Homologacao", "Massa de teste", "API sandbox", "Autenticidade", "Endividamento"],
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
  const list = document.getElementById("roadmap-list");
  const now = document.getElementById("roadmap-now");
  const later = document.getElementById("roadmap-later");
  if (!summary || !list || !now || !later) return;

  const tracks = getRoadmapTracks();
  const cards = [
    ["Fases", tracks.length],
    ["Demo", 1],
    ["Piloto/V1", 2],
    ["Pesquisa", 1],
  ];

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
      <strong>Manter demo estatica estavel</strong>
      <span>Evitar mexer no nucleo sem necessidade e continuar adicionando modulos de decisao bem isolados.</span>
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
  .roadmap-summary-card span,
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
