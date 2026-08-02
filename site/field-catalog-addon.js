if (!pageTitles.fields) {
  pageTitles.fields = "Campos";
}

if (!profileConfig.manager.views.includes("fields")) {
  const dataModelIndex = profileConfig.manager.views.indexOf("datamodel");
  profileConfig.manager.views.splice(dataModelIndex >= 0 ? dataModelIndex + 1 : profileConfig.manager.views.length, 0, "fields");
}

function getFieldCatalogGroups() {
  return [
    {
      entity: "Servidor",
      required: ["CPF", "nome completo", "data de nascimento", "status"],
      optional: ["e-mail", "telefone", "endereco", "nome social"],
      configurable: ["validacao complementar", "campos publicos do municipio", "contato obrigatorio"],
      risk: "Dados pessoais exigem minimizacao e finalidade clara.",
    },
    {
      entity: "Matricula",
      required: ["matricula", "convenio", "situacao funcional", "base de calculo"],
      optional: ["cargo", "lotacao", "regime", "data de admissao"],
      configurable: ["status que permite margem", "verbas consideradas", "identificador principal"],
      risk: "A regra de vinculo varia muito entre convenios.",
    },
    {
      entity: "Contrato",
      required: ["consignataria", "produto", "parcela", "prazo", "taxa", "CET", "status"],
      optional: ["IOF", "seguro", "valor liberado", "valor financiado", "anexos"],
      configurable: ["primeiro vencimento", "rubrica", "prazo maximo", "exige autorizacao"],
      risk: "Campos financeiros precisam ser precisos e auditaveis.",
    },
    {
      entity: "Folha",
      required: ["competencia", "layout", "protocolo", "hash", "status"],
      optional: ["arquivo original", "arquivo gerado", "erros por linha"],
      configurable: ["delimitador", "encoding", "versao de layout", "retorno obrigatorio"],
      risk: "Reprocessamento sem rastro compromete auditoria.",
    },
    {
      entity: "Convenio",
      required: ["nome", "codigo", "status", "frequencia da folha"],
      optional: ["orgao superior", "contatos", "SLA operacional"],
      configurable: ["margem", "validade da reserva", "politica de fechamento", "produtos permitidos"],
      risk: "Regra fixa no codigo vira problema quando entrar novo cliente.",
    },
  ];
}

function ensureFieldCatalogView() {
  if (document.getElementById("fields-view")) return;

  const nav = document.querySelector(".nav-list");
  const dataModelButton = document.querySelector('[data-view="datamodel"]');
  const readinessButton = document.querySelector('[data-view="readiness"]');
  const button = document.createElement("button");
  button.className = "nav-item";
  button.dataset.view = "fields";
  button.type = "button";
  button.textContent = "Campos";
  button.addEventListener("click", () => openView("fields"));
  nav?.insertBefore(button, dataModelButton?.nextSibling || readinessButton || null);

  document.querySelector(".main-panel")?.insertAdjacentHTML(
    "beforeend",
    `
      <section class="view" id="fields-view" aria-labelledby="fields-title">
        <div class="section-heading row-heading">
          <div>
            <h2 id="fields-title">Catalogo de campos evolutivo</h2>
            <p>Classifique campos como obrigatorios, opcionais ou configuraveis por convenio.</p>
          </div>
          <button class="primary-button" id="fields-audit-button" type="button">Registrar revisao</button>
        </div>

        <div class="fields-summary-grid" id="fields-summary-grid"></div>

        <section class="panel fields-panel">
          <div class="panel-heading">
            <h3>Campos por entidade</h3>
          </div>
          <div class="fields-list" id="fields-list"></div>
        </section>

        <div class="content-grid fields-content">
          <section class="panel">
            <div class="panel-heading">
              <h3>Regra de decisao</h3>
            </div>
            <div class="fields-note-list" id="fields-decision-rules"></div>
          </section>

          <section class="panel">
            <div class="panel-heading">
              <h3>Cuidados de seguranca</h3>
            </div>
            <div class="fields-note-list" id="fields-security-notes"></div>
          </section>
        </div>
      </section>
    `
  );

  document.getElementById("fields-audit-button")?.addEventListener("click", () => {
    auditEvent("Revisao do catalogo de campos registrada.", "Catalogo de campos");
    saveState();
    render();
    openView("fields");
  });
}

function renderFieldCatalog() {
  ensureFieldCatalogView();

  const summary = document.getElementById("fields-summary-grid");
  const list = document.getElementById("fields-list");
  const decisionRules = document.getElementById("fields-decision-rules");
  const securityNotes = document.getElementById("fields-security-notes");
  if (!summary || !list || !decisionRules || !securityNotes) return;

  const groups = getFieldCatalogGroups();
  const requiredCount = groups.reduce((total, group) => total + group.required.length, 0);
  const optionalCount = groups.reduce((total, group) => total + group.optional.length, 0);
  const configurableCount = groups.reduce((total, group) => total + group.configurable.length, 0);

  summary.innerHTML = [
    ["Entidades", groups.length],
    ["Obrigatorios", requiredCount],
    ["Opcionais", optionalCount],
    ["Configuraveis", configurableCount],
  ]
    .map(
      ([label, value]) => `
        <article class="fields-summary-card">
          <span>${label}</span>
          <strong>${value}</strong>
        </article>
      `
    )
    .join("");

  list.innerHTML = groups
    .map(
      (group) => `
        <article class="fields-row">
          <div>
            <strong>${group.entity}</strong>
            <span>${group.risk}</span>
          </div>
          <p><strong>Obrigatorios:</strong> ${group.required.join(", ")}.</p>
          <p><strong>Opcionais:</strong> ${group.optional.join(", ")}.</p>
          <p><strong>Configuraveis:</strong> ${group.configurable.join(", ")}.</p>
        </article>
      `
    )
    .join("");

  decisionRules.innerHTML = `
    <div class="fields-note">
      <strong>Obrigatorio</strong>
      <span>Sem esse campo o fluxo principal nao funciona, ou ha risco operacional/juridico.</span>
    </div>
    <div class="fields-note">
      <strong>Opcional</strong>
      <span>Ajuda atendimento, relatorio ou experiencia, mas nao impede a operacao basica.</span>
    </div>
    <div class="fields-note">
      <strong>Configuravel</strong>
      <span>Varia por convenio, produto, folha ou politica local; deve entrar em configuracao.</span>
    </div>
  `;

  securityNotes.innerHTML = `
    <div class="fields-note">
      <strong>Minimizacao</strong>
      <span>Coletar somente o necessario para margem, contrato, auditoria e suporte.</span>
    </div>
    <div class="fields-note">
      <strong>Permissao por campo</strong>
      <span>Consignataria nao deve ver todos os dados do servidor, apenas o necessario para operar.</span>
    </div>
    <div class="fields-note">
      <strong>Historico sensivel</strong>
      <span>Alteracao em campo financeiro ou funcional precisa registrar antes, depois, usuario e motivo.</span>
    </div>
  `;
}

const fieldCatalogStyle = document.createElement("style");
fieldCatalogStyle.textContent = `
  .fields-summary-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(150px, 1fr));
    gap: 14px;
    margin-bottom: 18px;
  }
  .fields-summary-card,
  .fields-row,
  .fields-note {
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface-2);
  }
  .fields-summary-card {
    padding: 16px;
    box-shadow: var(--shadow);
  }
  .fields-summary-card span,
  .fields-row span,
  .fields-row p,
  .fields-note span {
    display: block;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.4;
  }
  .fields-summary-card strong {
    display: block;
    margin-top: 8px;
    font-size: 24px;
  }
  .fields-panel,
  .fields-content {
    margin-top: 18px;
  }
  .fields-list,
  .fields-note-list {
    display: grid;
    gap: 10px;
  }
  .fields-row {
    display: grid;
    gap: 8px;
    padding: 12px;
  }
  .fields-row p {
    margin: 0;
  }
  .fields-row p strong {
    color: var(--text);
    font-size: 13px;
  }
  .fields-note {
    padding: 12px;
  }
  .fields-note span {
    margin-top: 4px;
  }
  @media (max-width: 1040px) {
    .fields-summary-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 640px) {
    .fields-summary-grid {
      grid-template-columns: 1fr;
    }
  }
`;
document.head.appendChild(fieldCatalogStyle);

const renderBeforeFieldCatalog = render;
render = function renderWithFieldCatalog() {
  renderBeforeFieldCatalog();
  renderFieldCatalog();
};

render();
