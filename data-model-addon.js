if (!pageTitles.datamodel) {
  pageTitles.datamodel = "Modelo dados";
}

if (!profileConfig.manager.views.includes("datamodel")) {
  const roadmapIndex = profileConfig.manager.views.indexOf("roadmap");
  profileConfig.manager.views.splice(roadmapIndex >= 0 ? roadmapIndex + 1 : profileConfig.manager.views.length, 0, "datamodel");
}

function getDataModelDomains() {
  return [
    {
      name: "Servidor e matricula",
      maturity: "Evolutivo",
      core: ["CPF", "nome", "matricula", "convenio", "situacao funcional", "base de calculo"],
      next: ["cargo", "lotacao", "regime", "data de admissao", "contato", "fonte publica"],
      decision: "Campos variam muito por convenio, entao cadastro precisa aceitar extensao controlada.",
    },
    {
      name: "Contrato",
      maturity: "Expandir",
      core: ["produto", "consignataria", "parcela", "prazo", "taxa", "CET", "status"],
      next: ["valor liberado", "valor financiado", "IOF", "primeiro vencimento", "rubrica", "competencia inicial"],
      decision: "Contrato deve separar dado financeiro, dado operacional e dado de folha.",
    },
    {
      name: "Folha e arquivos",
      maturity: "Mapeado",
      core: ["competencia", "layout", "protocolo", "hash", "status", "totais"],
      next: ["erros por linha", "versao do layout", "arquivo de ajuste", "fechamento/reabertura"],
      decision: "Toda remessa precisa ser rastreavel e nunca sobrescrever competencia fechada.",
    },
    {
      name: "Margem",
      maturity: "Mapeado",
      core: ["base", "percentual", "usada", "reservada", "bloqueada", "disponivel"],
      next: ["explicacao JSON", "movimentos", "ajustes", "bloqueios manuais", "margem por produto"],
      decision: "Snapshot deve ser imutavel; mudanca entra como movimento ou novo snapshot.",
    },
    {
      name: "Configuracao do convenio",
      maturity: "Critico",
      core: ["validade codigo", "reserva imediata", "layout", "rubrica", "produtos permitidos"],
      next: ["tolerancia retorno", "fonte publica", "politica fechamento", "perfis por consignataria"],
      decision: "Nao hardcodar regra que pode variar entre convenios.",
    },
  ];
}

function ensureDataModelView() {
  if (document.getElementById("datamodel-view")) return;

  const nav = document.querySelector(".nav-list");
  const roadmapButton = document.querySelector('[data-view="roadmap"]');
  const readinessButton = document.querySelector('[data-view="readiness"]');
  const button = document.createElement("button");
  button.className = "nav-item";
  button.dataset.view = "datamodel";
  button.type = "button";
  button.textContent = "Modelo dados";
  button.addEventListener("click", () => openView("datamodel"));
  nav?.insertBefore(button, roadmapButton?.nextSibling || readinessButton || null);

  document.querySelector(".main-panel")?.insertAdjacentHTML(
    "beforeend",
    `
      <section class="view" id="datamodel-view" aria-labelledby="datamodel-title">
        <div class="section-heading row-heading">
          <div>
            <h2 id="datamodel-title">Modelo de dados evolutivo</h2>
            <p>Organize campos essenciais, campos futuros e regras configuraveis sem travar a V1 cedo demais.</p>
          </div>
          <button class="primary-button" id="datamodel-audit-button" type="button">Registrar revisao</button>
        </div>

        <div class="datamodel-summary-grid" id="datamodel-summary-grid"></div>

        <section class="panel datamodel-panel">
          <div class="panel-heading">
            <h3>Dominios principais</h3>
          </div>
          <div class="datamodel-list" id="datamodel-list"></div>
        </section>

        <div class="content-grid datamodel-content">
          <section class="panel">
            <div class="panel-heading">
              <h3>Decisoes de arquitetura</h3>
            </div>
            <div class="datamodel-note-list" id="datamodel-decisions"></div>
          </section>

          <section class="panel">
            <div class="panel-heading">
              <h3>Backlog de descoberta</h3>
            </div>
            <div class="datamodel-note-list" id="datamodel-discovery"></div>
          </section>
        </div>
      </section>
    `
  );

  document.getElementById("datamodel-audit-button")?.addEventListener("click", () => {
    auditEvent("Revisao do modelo de dados evolutivo registrada.", "Modelo de dados");
    saveState();
    render();
    openView("datamodel");
  });
}

function renderDataModel() {
  ensureDataModelView();

  const summary = document.getElementById("datamodel-summary-grid");
  const list = document.getElementById("datamodel-list");
  const decisions = document.getElementById("datamodel-decisions");
  const discovery = document.getElementById("datamodel-discovery");
  if (!summary || !list || !decisions || !discovery) return;

  const domains = getDataModelDomains();
  const coreFields = domains.reduce((total, domain) => total + domain.core.length, 0);
  const nextFields = domains.reduce((total, domain) => total + domain.next.length, 0);

  summary.innerHTML = [
    ["Dominios", domains.length],
    ["Campos nucleo", coreFields],
    ["Campos evolutivos", nextFields],
    ["Configuravel", "Sim"],
  ]
    .map(
      ([label, value]) => `
        <article class="datamodel-summary-card">
          <span>${label}</span>
          <strong>${value}</strong>
        </article>
      `
    )
    .join("");

  list.innerHTML = domains
    .map(
      (domain) => `
        <article class="datamodel-row">
          <div>
            <strong>${domain.name}</strong>
            <span>${domain.decision}</span>
          </div>
          <span class="status ${domain.maturity === "Critico" ? "danger" : domain.maturity === "Expandir" ? "warning" : ""}">${domain.maturity}</span>
          <p><strong>Nucleo:</strong> ${domain.core.join(", ")}.</p>
          <p><strong>Evolucao:</strong> ${domain.next.join(", ")}.</p>
        </article>
      `
    )
    .join("");

  decisions.innerHTML = `
    <div class="datamodel-note">
      <strong>Coluna para regra recorrente</strong>
      <span>Campo usado em filtro, permissao, calculo ou relatorio frequente deve virar coluna normal.</span>
    </div>
    <div class="datamodel-note">
      <strong>JSONB para variacao controlada</strong>
      <span>Dados brutos, explicacoes e resumos variaveis podem ficar em JSONB com governanca.</span>
    </div>
    <div class="datamodel-note">
      <strong>Historico imutavel</strong>
      <span>Competencia fechada nao deve ser alterada sem ajuste e auditoria.</span>
    </div>
  `;

  discovery.innerHTML = `
    <div class="datamodel-note">
      <strong>Contrato completo</strong>
      <span>CET, IOF, primeiro vencimento, competencia inicial, rubrica e anexos obrigatorios.</span>
    </div>
    <div class="datamodel-note">
      <strong>Servidor completo</strong>
      <span>Cargo, lotacao, regime, status permitidos e validacao complementar por fonte publica.</span>
    </div>
    <div class="datamodel-note">
      <strong>Convenio completo</strong>
      <span>Layouts, politicas de fechamento, validade de reserva, autorizacao e tolerancias.</span>
    </div>
  `;
}

const dataModelStyle = document.createElement("style");
dataModelStyle.textContent = `
  .datamodel-summary-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(150px, 1fr));
    gap: 14px;
    margin-bottom: 18px;
  }
  .datamodel-summary-card,
  .datamodel-row,
  .datamodel-note {
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface-2);
  }
  .datamodel-summary-card {
    padding: 16px;
    box-shadow: var(--shadow);
  }
  .datamodel-summary-card span,
  .datamodel-row span,
  .datamodel-row p,
  .datamodel-note span {
    display: block;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.4;
  }
  .datamodel-summary-card strong {
    display: block;
    margin-top: 8px;
    font-size: 24px;
  }
  .datamodel-panel,
  .datamodel-content {
    margin-top: 18px;
  }
  .datamodel-list,
  .datamodel-note-list {
    display: grid;
    gap: 10px;
  }
  .datamodel-row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 12px;
    align-items: start;
    padding: 12px;
  }
  .datamodel-row p {
    grid-column: 1 / -1;
    margin: 0;
  }
  .datamodel-row p strong {
    color: var(--text);
    font-size: 13px;
  }
  .datamodel-note {
    padding: 12px;
  }
  .datamodel-note span {
    margin-top: 4px;
  }
  @media (max-width: 1040px) {
    .datamodel-summary-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 640px) {
    .datamodel-summary-grid,
    .datamodel-row {
      grid-template-columns: 1fr;
    }
  }
`;
document.head.appendChild(dataModelStyle);

const renderBeforeDataModel = render;
render = function renderWithDataModel() {
  renderBeforeDataModel();
  renderDataModel();
};

render();
