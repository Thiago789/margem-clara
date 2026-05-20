if (!pageTitles.access) {
  pageTitles.access = "Permissoes";
}

if (!profileConfig.manager.views.includes("access")) {
  const settingsIndex = profileConfig.manager.views.indexOf("settings");
  profileConfig.manager.views.splice(settingsIndex >= 0 ? settingsIndex : profileConfig.manager.views.length, 0, "access");
}

function getAccessProfiles() {
  return [
    {
      profile: "Gestor do convenio",
      scope: "Operacao completa",
      canView: ["Servidores", "Margem", "Contratos", "Arquivos", "Retornos", "Consignatarias", "Auditoria"],
      canAct: ["Homologar layouts", "Configurar regras", "Processar retorno", "Bloquear servidor", "Auditar eventos"],
      restrictions: ["Nao altera dados bancarios sem trilha", "Nao apaga retorno de folha", "Nao remove historico"],
      risk: "Alto",
    },
    {
      profile: "Servidor",
      scope: "Dados proprios",
      canView: ["Margem disponivel", "Reservas proprias", "Contratos proprios", "Tickets"],
      canAct: ["Autorizar consulta", "Gerar codigo de reserva", "Abrir atendimento", "Acompanhar contrato"],
      restrictions: ["Nao ve outros servidores", "Nao altera margem calculada", "Nao acessa arquivo de folha"],
      risk: "Medio",
    },
    {
      profile: "Consignataria",
      scope: "Carteira propria",
      canView: ["Simulacao", "Reservas da instituicao", "Contratos da instituicao", "Retornos relacionados"],
      canAct: ["Consultar com autorizacao", "Reservar margem", "Enviar proposta", "Acompanhar pendencias"],
      restrictions: ["Nao ve concorrentes", "Nao consulta sem autorizacao", "Nao altera regra do convenio"],
      risk: "Alto",
    },
  ];
}

function ensureAccessControlView() {
  if (document.getElementById("access-view")) return;

  const nav = document.querySelector(".nav-list");
  const settingsButton = document.querySelector('[data-view="settings"]');
  const lendersButton = document.querySelector('[data-view="lenders"]');
  const button = document.createElement("button");
  button.className = "nav-item";
  button.dataset.view = "access";
  button.type = "button";
  button.textContent = "Permissoes";
  button.addEventListener("click", () => openView("access"));
  nav?.insertBefore(button, settingsButton || lendersButton || null);

  document.querySelector(".main-panel")?.insertAdjacentHTML(
    "beforeend",
    `
      <section class="view" id="access-view" aria-labelledby="access-title">
        <div class="section-heading row-heading">
          <div>
            <h2 id="access-title">Permissoes e perfis</h2>
            <p>Organize o acesso por papel, escopo de dados e acoes permitidas.</p>
          </div>
          <button class="primary-button" id="access-audit-button" type="button">Registrar revisao</button>
        </div>

        <div class="access-summary-grid" id="access-summary-grid"></div>

        <section class="panel access-panel">
          <div class="panel-heading">
            <h3>Matriz de acesso</h3>
          </div>
          <div class="access-list" id="access-list"></div>
        </section>

        <div class="content-grid access-content">
          <section class="panel">
            <div class="panel-heading">
              <h3>Controles minimos</h3>
            </div>
            <div class="access-notes" id="access-controls"></div>
          </section>

          <section class="panel">
            <div class="panel-heading">
              <h3>Experiencia do usuario</h3>
            </div>
            <div class="access-notes" id="access-ux"></div>
          </section>
        </div>
      </section>
    `
  );

  document.getElementById("access-audit-button")?.addEventListener("click", () => {
    auditEvent("Revisao de permissoes e perfis registrada.", "Permissoes");
    saveState();
    render();
    openView("access");
  });
}

function renderAccessControl() {
  ensureAccessControlView();

  const summary = document.getElementById("access-summary-grid");
  const list = document.getElementById("access-list");
  const controls = document.getElementById("access-controls");
  const ux = document.getElementById("access-ux");
  if (!summary || !list || !controls || !ux) return;

  const profiles = getAccessProfiles();
  const highRisk = profiles.filter((profile) => profile.risk === "Alto").length;
  const totalActions = profiles.reduce((sum, profile) => sum + profile.canAct.length, 0);
  const totalRestrictions = profiles.reduce((sum, profile) => sum + profile.restrictions.length, 0);

  const cards = [
    ["Perfis mapeados", profiles.length],
    ["Risco alto", highRisk],
    ["Acoes permitidas", totalActions],
    ["Restricoes", totalRestrictions],
  ];

  summary.innerHTML = cards
    .map(
      ([label, value]) => `
        <article class="access-summary-card">
          <span>${label}</span>
          <strong>${value}</strong>
        </article>
      `
    )
    .join("");

  list.innerHTML = profiles
    .map((profile) => {
      const riskClass = profile.risk === "Alto" ? "warning" : "";
      return `
        <article class="access-row">
          <div>
            <strong>${profile.profile}</strong>
            <span>${profile.scope}</span>
          </div>
          <div>
            <span>Risco</span>
            <strong class="status ${riskClass}">${profile.risk}</strong>
          </div>
          <p><strong>Visualiza:</strong> ${profile.canView.join(", ")}.</p>
          <p><strong>Acoes:</strong> ${profile.canAct.join(", ")}.</p>
          <p><strong>Bloqueios:</strong> ${profile.restrictions.join("; ")}.</p>
        </article>
      `;
    })
    .join("");

  controls.innerHTML = `
    <div class="access-note">
      <strong>Menor privilegio</strong>
      <span>Cada perfil deve receber apenas os modulos e dados necessarios para executar sua funcao.</span>
    </div>
    <div class="access-note">
      <strong>Autorizacao sensivel</strong>
      <span>Consulta de margem por consignataria deve exigir regra do convenio: codigo, senha, token ou liberacao imediata.</span>
    </div>
    <div class="access-note">
      <strong>Auditoria imutavel</strong>
      <span>Acoes criticas precisam registrar usuario, perfil, origem, antes/depois e motivo operacional.</span>
    </div>
  `;

  ux.innerHTML = `
    <div class="access-note">
      <strong>Menu por perfil</strong>
      <span>O usuario deve ver somente o que pode usar, reduzindo erro e deixando o sistema mais simples.</span>
    </div>
    <div class="access-note">
      <strong>Mensagens claras</strong>
      <span>Quando uma acao for bloqueada, o sistema deve explicar a regra sem expor dado sensivel.</span>
    </div>
    <div class="access-note">
      <strong>Proxima evolucao</strong>
      <span>Permissoes finas por convenio, produto, instituicao e etapa da competencia.</span>
    </div>
  `;
}

const accessStyle = document.createElement("style");
accessStyle.textContent = `
  .access-summary-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(150px, 1fr));
    gap: 14px;
    margin-bottom: 18px;
  }
  .access-summary-card,
  .access-row,
  .access-note {
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
  }
  .access-summary-card {
    padding: 16px;
    box-shadow: var(--shadow);
  }
  .access-summary-card span,
  .access-row span,
  .access-row p,
  .access-note span {
    display: block;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.4;
  }
  .access-summary-card strong {
    display: block;
    margin-top: 8px;
    font-size: 26px;
  }
  .access-list,
  .access-notes {
    display: grid;
    gap: 10px;
  }
  .access-row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 12px;
    align-items: start;
    padding: 12px;
    background: var(--surface-2);
  }
  .access-row p {
    grid-column: 1 / -1;
    margin: 0;
  }
  .access-row p strong {
    color: var(--text);
    font-size: 13px;
  }
  .access-note {
    padding: 12px;
    background: var(--surface-2);
  }
  .access-note span {
    margin-top: 4px;
  }
  @media (max-width: 1040px) {
    .access-summary-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 640px) {
    .access-summary-grid,
    .access-row {
      grid-template-columns: 1fr;
    }
  }
`;
document.head.appendChild(accessStyle);

const renderBeforeAccessControl = render;
render = function renderWithAccessControl() {
  renderBeforeAccessControl();
  renderAccessControl();
};

render();
