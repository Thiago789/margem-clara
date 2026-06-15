if (!pageTitles.layouts) {
  pageTitles.layouts = "Layouts arquivos";
}

if (!profileConfig.manager.views.includes("layouts")) {
  const importIndex = profileConfig.manager.views.indexOf("import");
  profileConfig.manager.views.splice(importIndex >= 0 ? importIndex + 1 : profileConfig.manager.views.length, 0, "layouts");
}

function getFileLayouts() {
  return [
    {
      name: "Arquivo de margem",
      code: "MARGEM",
      origin: "Folha de pagamento",
      direction: "Entrada",
      format: "CSV ou TXT delimitado",
      status: "Obrigatorio",
      version: "MARGEM v1.1",
      homologation: "Homologado para MVP",
      fields: ["nome", "cpf", "matricula", "renda_base", "descontos_obrigatorios", "status"],
      validations: ["CPF e matricula unicos", "Renda numerica", "Servidor ativo ou bloqueado identificado"],
      effect: "Atualiza base do servidor, margem bruta, margem liquida e bloqueios operacionais.",
    },
    {
      name: "Arquivo de insercao",
      code: "INSERCAO",
      origin: "Margem Clara",
      direction: "Saida",
      format: "CSV, TXT fixo ou API",
      status: "Gerado pelo sistema",
      version: "INSERCAO v1.2",
      homologation: "Em validacao",
      fields: ["contrato", "cpf", "matricula", "produto", "tipo_contrato", "rubrica", "parcela", "prazo", "parcela_atual", "competencia", "valor_contratado", "taxa_mensal", "cet_mensal", "primeiro_vencimento", "primeira_competencia", "acao"],
      validations: ["Reserva ativa", "Rubrica valida", "Valor dentro da margem", "Competencia aberta"],
      effect: "Envia os descontos que devem ser incluidos, alterados ou excluidos na folha.",
    },
    {
      name: "Arquivo retorno",
      code: "RETORNO",
      origin: "Folha de pagamento",
      direction: "Entrada",
      format: "CSV ou TXT delimitado",
      status: "Fecha competencia",
      version: "RETORNO v1.1",
      homologation: "Homologado para MVP",
      fields: ["contrato", "competencia", "status", "motivo", "valor_descontado"],
      validations: ["Contrato conhecido", "Status padronizado", "Motivo quando rejeitado", "Valor conciliado"],
      effect: "Confirma desconto, aponta rejeicoes e alimenta pendencias para a proxima competencia.",
    },
  ];
}

function getLayoutVersionPlan() {
  const competency = state.conventionSettings?.payrollCompetency || today().slice(0, 7);
  return getFileLayouts().map((layout) => ({
    code: layout.code,
    version: layout.version,
    agreement: "Prefeitura Modelo",
    competency,
    owner: layout.direction === "Saida" ? "Margem Clara" : "Folha de pagamento",
    status: layout.homologation,
    requiredBeforePilot: layout.code !== "INSERCAO" ? "Aprovado" : "Validar com massa teste",
  }));
}

function layoutVersionStatusClass(status) {
  if (/validacao|teste/i.test(status)) return "warning";
  if (/pendente|bloqueado/i.test(status)) return "danger";
  return "";
}

function ensureFileLayoutsView() {
  if (document.getElementById("layouts-view")) return;

  const nav = document.querySelector(".nav-list");
  const payrollButton = document.querySelector('[data-view="payroll"]');
  const simulationButton = document.querySelector('[data-view="simulation"]');
  const button = document.createElement("button");
  button.className = "nav-item";
  button.dataset.view = "layouts";
  button.type = "button";
  button.textContent = "Layouts";
  button.addEventListener("click", () => openView("layouts"));
  nav?.insertBefore(button, payrollButton || simulationButton || null);

  document.querySelector(".main-panel")?.insertAdjacentHTML(
    "beforeend",
    `
      <section class="view" id="layouts-view" aria-labelledby="layouts-title">
        <div class="section-heading row-heading">
          <div>
            <h2 id="layouts-title">Layouts de arquivos</h2>
            <p>Defina os campos e validacoes para importar margem, gerar insercao e processar retorno.</p>
          </div>
          <button class="primary-button" id="layouts-audit-button" type="button">Registrar homologacao</button>
        </div>

        <div class="layout-summary-grid" id="layout-summary-grid"></div>

        <section class="panel layout-panel">
          <div class="panel-heading">
            <h3>Matriz de troca com a folha</h3>
          </div>
          <div class="layout-list" id="layout-list"></div>
        </section>

        <section class="panel layout-panel">
          <div class="panel-heading">
            <h3>Versoes por competencia</h3>
          </div>
          <div class="layout-version-list" id="layout-version-list"></div>
        </section>

        <div class="content-grid layout-content">
          <section class="panel">
            <div class="panel-heading">
              <h3>Padroes por convenio</h3>
            </div>
            <div class="layout-notes" id="layout-standards"></div>
          </section>

          <section class="panel">
            <div class="panel-heading">
              <h3>Controles de seguranca</h3>
            </div>
            <div class="layout-notes" id="layout-controls"></div>
          </section>
        </div>
      </section>
    `
  );

  document.getElementById("layouts-audit-button")?.addEventListener("click", () => {
    auditEvent("Homologacao de layouts de arquivo registrada.", "Layouts de arquivo");
    saveState();
    render();
    openView("layouts");
  });
}

function renderFileLayouts() {
  ensureFileLayoutsView();

  const summary = document.getElementById("layout-summary-grid");
  const list = document.getElementById("layout-list");
  const versions = document.getElementById("layout-version-list");
  const standards = document.getElementById("layout-standards");
  const controls = document.getElementById("layout-controls");
  if (!summary || !list || !versions || !standards || !controls) return;

  const layouts = getFileLayouts();
  const versionPlan = getLayoutVersionPlan();
  const inbound = layouts.filter((layout) => layout.direction === "Entrada").length;
  const outbound = layouts.filter((layout) => layout.direction === "Saida").length;
  const fields = layouts.reduce((sum, layout) => sum + layout.fields.length, 0);
  const validations = layouts.reduce((sum, layout) => sum + layout.validations.length, 0);

  const cards = [
    ["Layouts base", layouts.length],
    ["Entradas da folha", inbound],
    ["Saidas para folha", outbound],
    ["Campos mapeados", fields],
    ["Validacoes", validations],
  ];

  summary.innerHTML = cards
    .map(
      ([label, value]) => `
        <article class="layout-summary-card">
          <span>${label}</span>
          <strong>${value}</strong>
        </article>
      `
    )
    .join("");

  list.innerHTML = layouts
    .map((layout) => {
      const statusClass = layout.direction === "Entrada" ? "" : "warning";
      return `
        <article class="layout-row">
          <div>
            <strong>${layout.name}</strong>
            <span>${layout.code} - ${layout.origin}</span>
          </div>
          <div>
            <span>Fluxo</span>
            <strong>${layout.direction}</strong>
          </div>
          <div>
            <span>Formato</span>
            <strong>${layout.format}</strong>
          </div>
          <div>
            <span>Versao</span>
            <strong>${layout.version}</strong>
          </div>
          <div>
            <span class="status ${statusClass}">${layout.status}</span>
          </div>
          <p><strong>Homologacao:</strong> ${layout.homologation}.</p>
          <p>${layout.effect}</p>
          <p><strong>Campos:</strong> ${layout.fields.join(", ")}.</p>
          <p><strong>Validacoes:</strong> ${layout.validations.join("; ")}.</p>
        </article>
      `;
    })
    .join("");

  versions.innerHTML = versionPlan
    .map(
      (item) => `
        <article class="layout-version-row">
          <div>
            <strong>${item.version}</strong>
            <span>${item.code} - ${item.agreement}</span>
          </div>
          <div>
            <span>Competencia</span>
            <strong>${item.competency}</strong>
          </div>
          <div>
            <span>Responsavel</span>
            <strong>${item.owner}</strong>
          </div>
          <span class="status ${layoutVersionStatusClass(item.status)}">${item.status}</span>
          <p><strong>Antes do piloto:</strong> ${item.requiredBeforePilot}.</p>
        </article>
      `
    )
    .join("");

  standards.innerHTML = `
    <div class="layout-note">
      <strong>Configuravel por convenio</strong>
      <span>Cada convenio pode ter delimitador, ordem de campos, rubricas, competencia e regra de obrigatoriedade proprios.</span>
    </div>
    <div class="layout-note">
      <strong>Motor de leitura</strong>
      <span>O MVP deve validar cabecalho, tipos, campos faltantes e totais antes de gravar qualquer movimentacao.</span>
    </div>
    <div class="layout-note">
      <strong>Versionamento</strong>
      <span>Quando a folha mudar layout, o sistema deve manter historico da versao usada em cada competencia.</span>
    </div>
  `;

  controls.innerHTML = `
    <div class="layout-note">
      <strong>Pre-validacao</strong>
      <span>${fields} campos mapeados precisam gerar erros claros antes do processamento definitivo.</span>
    </div>
    <div class="layout-note">
      <strong>Conciliacao</strong>
      <span>Retorno deve comparar valor esperado, valor descontado, contrato e motivo para abrir pendencias automaticas.</span>
    </div>
    <div class="layout-note">
      <strong>Trilha de auditoria</strong>
      <span>Toda importacao, geracao e retorno precisa guardar usuario, horario, arquivo, hash e resultado.</span>
    </div>
  `;
}

const fileLayoutsStyle = document.createElement("style");
fileLayoutsStyle.textContent = `
  .layout-summary-grid {
    display: grid;
    grid-template-columns: repeat(5, minmax(140px, 1fr));
    gap: 14px;
    margin-bottom: 18px;
  }
  .layout-summary-card,
  .layout-row,
  .layout-note {
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
  }
  .layout-summary-card {
    padding: 16px;
    box-shadow: var(--shadow);
  }
  .layout-summary-card span,
  .layout-row span,
  .layout-row p,
  .layout-note span {
    display: block;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.4;
  }
  .layout-summary-card strong {
    display: block;
    margin-top: 8px;
    font-size: 26px;
  }
  .layout-list,
  .layout-notes,
  .layout-version-list {
    display: grid;
    gap: 10px;
  }
  .layout-row,
  .layout-version-row {
    display: grid;
    grid-template-columns: 1.3fr 0.65fr 1fr 0.8fr auto;
    gap: 12px;
    align-items: center;
    padding: 12px;
    background: var(--surface-2);
  }
  .layout-version-row {
    grid-template-columns: 1.2fr 0.8fr 1fr auto;
  }
  .layout-row p,
  .layout-version-row p {
    grid-column: 1 / -1;
    margin: 0;
  }
  .layout-row p strong,
  .layout-version-row p strong {
    color: var(--text);
    font-size: 13px;
  }
  .layout-note {
    padding: 12px;
    background: var(--surface-2);
  }
  .layout-note span {
    margin-top: 4px;
  }
  @media (max-width: 1040px) {
    .layout-summary-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .layout-row {
      grid-template-columns: 1fr 1fr;
    }
    .layout-version-row {
      grid-template-columns: 1fr 1fr;
    }
  }
  @media (max-width: 640px) {
    .layout-summary-grid,
    .layout-row,
    .layout-version-row {
      grid-template-columns: 1fr;
    }
  }
`;
document.head.appendChild(fileLayoutsStyle);

const renderBeforeFileLayouts = render;
render = function renderWithFileLayouts() {
  renderBeforeFileLayouts();
  renderFileLayouts();
};

render();
