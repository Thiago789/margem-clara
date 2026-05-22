if (!pageTitles.readiness) {
  pageTitles.readiness = "Prontidao V1";
}

if (!profileConfig.manager.views.includes("readiness")) {
  const roadmapIndex = profileConfig.manager.views.indexOf("roadmap");
  profileConfig.manager.views.splice(roadmapIndex >= 0 ? roadmapIndex + 1 : profileConfig.manager.views.length, 0, "readiness");
}

function getReadinessGroups() {
  return [
    {
      title: "Seguranca e acesso",
      score: 35,
      items: [
        ["Login real com sessao segura", "Pendente"],
        ["Permissoes por perfil e convenio", "Mapeado"],
        ["Auditoria de operacoes sensiveis", "Parcial"],
        ["Politica LGPD e minimizacao de dados", "Pendente"],
      ],
    },
    {
      title: "Dados e folha",
      score: 55,
      items: [
        ["Layout de margem importada", "Parcial"],
        ["Arquivo de insercao para folha", "Mapeado"],
        ["Arquivo retorno com motivos", "Mapeado"],
        ["Historico por competencia", "Parcial"],
      ],
    },
    {
      title: "Motor de margem",
      score: 50,
      items: [
        ["Calculo por matricula", "Mapeado"],
        ["Reserva reduzindo saldo", "Demo"],
        ["Contrato consumindo margem", "Demo"],
        ["Bloqueios e margem negativa", "Parcial"],
      ],
    },
    {
      title: "Operacao piloto",
      score: 40,
      items: [
        ["Convenio piloto definido", "Pendente"],
        ["Massa homologada", "Pendente"],
        ["Roteiro de teste de ponta a ponta", "Parcial"],
        ["Aceite do gestor/RH", "Pendente"],
      ],
    },
    {
      title: "Integracoes",
      score: 25,
      items: [
        ["API interna desenhada", "Mapeado"],
        ["Webhooks de eventos", "Pesquisa"],
        ["Conector de folha", "Futuro"],
        ["Consulta de fonte publica", "Pesquisa"],
      ],
    },
  ];
}

function getReadinessStatusClass(status) {
  if (status === "Demo" || status === "Mapeado") return "";
  if (status === "Parcial" || status === "Pesquisa") return "warning";
  return "danger";
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
  const grid = document.getElementById("readiness-grid");
  const decisions = document.getElementById("readiness-decisions");
  if (!summary || !grid || !decisions) return;

  const groups = getReadinessGroups();
  const average = Math.round(groups.reduce((total, group) => total + group.score, 0) / groups.length);
  const mappedItems = groups.flatMap((group) => group.items).filter(([, status]) => ["Demo", "Mapeado", "Parcial"].includes(status)).length;
  const pendingItems = groups.flatMap((group) => group.items).filter(([, status]) => status === "Pendente").length;

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
        <article class="readiness-card">
          <div class="readiness-card-heading">
            <div>
              <strong>${group.title}</strong>
              <span>${group.score}% de maturidade</span>
            </div>
            <div class="readiness-meter" aria-label="${group.score}%">
              <span style="width: ${group.score}%"></span>
            </div>
          </div>
          <div class="readiness-item-list">
            ${group.items
              .map(
                ([label, status]) => `
                  <div class="readiness-item">
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
      <strong>Manter a demo estatica ate fechar narrativa e regras</strong>
      <span>A demo ainda e a melhor ferramenta para validar produto com baixo risco tecnico.</span>
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
  .readiness-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .readiness-summary-card,
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
