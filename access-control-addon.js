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

function getAccessModuleMatrix() {
  const profileKeys = ["manager", "employee", "lender"];
  const sensitiveViews = ["employees", "enrollments", "import", "payroll", "closing", "adjustments", "audit", "access", "settings"];
  const allViews = Array.from(
    new Set(profileKeys.flatMap((profile) => profileConfig[profile]?.views || []))
  );

  return {
    profileKeys,
    sensitiveViews,
    allViews,
    restrictedToManager: sensitiveViews.filter((view) => {
      const managerCanView = profileConfig.manager.views.includes(view);
      const otherCanView = profileKeys
        .filter((profile) => profile !== "manager")
        .some((profile) => profileConfig[profile]?.views.includes(view));
      return managerCanView && !otherCanView;
    }),
  };
}

function getMvpSecurityChecklist() {
  return [
    {
      title: "Dados no navegador",
      status: "Demo",
      className: "warning",
      detail: "O MVP estatico usa localStorage e massa ficticia. Nao deve receber dados reais de servidor, folha ou contrato.",
    },
    {
      title: "Auditoria operacional",
      status: "Parcial",
      className: "warning",
      detail: "Eventos criticos aparecem na auditoria da demo, mas producao exige trilha imutavel em backend.",
    },
    {
      title: "Perfis e navegacao",
      status: "Demo",
      className: "",
      detail: "Menus e redirecionamentos por perfil estao demonstrados; autorizacao real precisa RBAC no servidor.",
    },
    {
      title: "Consentimento e fonte publica",
      status: "Demo",
      className: "",
      detail: "Consulta de margem, reserva e fonte publica sao configuraveis por convenio e geram evidencias auditaveis.",
    },
    {
      title: "Login, sessao e LGPD",
      status: "Backend",
      className: "danger",
      detail: "Antes de operacao real, implementar login seguro, isolamento por convenio, minimizacao e retencao de dados.",
    },
  ];
}

function getAccessReviewSnapshot() {
  const matrix = getAccessModuleMatrix();
  const securityChecklist = getMvpSecurityChecklist();
  const activeProfile = profileConfig[state.currentProfile] || profileConfig.manager;
  const blockers = securityChecklist.filter((item) => item.className === "danger").length;
  const warnings = securityChecklist.filter((item) => item.className === "warning").length;

  return {
    reviewedAt: today(),
    activeProfile: activeProfile.label,
    activeScope: activeProfile.scope,
    mappedProfiles: getAccessProfiles().length,
    mappedModules: matrix.allViews.length,
    sensitiveModules: matrix.sensitiveViews.length,
    restrictedToManager: matrix.restrictedToManager.length,
    checklistItems: securityChecklist.length,
    blockers,
    warnings,
    summary: `${matrix.restrictedToManager.length} modulo(s) sensivel(is) restrito(s), ${blockers} bloqueio(s), ${warnings} alerta(s).`,
  };
}

function recordAccessReviewSnapshot() {
  const snapshot = getAccessReviewSnapshot();
  state.lastAccessReview = snapshot;
  auditEvent(`Revisao de permissoes registrada: ${snapshot.summary}`, "Permissoes");
  saveState();
  render();
  openView("access");
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

        <section class="panel access-command" id="access-command"></section>
        <section class="panel access-review-panel" id="access-review-panel"></section>

        <div class="access-summary-grid" id="access-summary-grid"></div>

        <section class="panel access-panel">
          <div class="panel-heading">
            <h3>Limites do MVP</h3>
          </div>
          <div class="access-security-list" id="access-security-list"></div>
        </section>

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

        <section class="panel access-panel">
          <div class="panel-heading">
            <h3>Cobertura por modulo</h3>
          </div>
          <div class="access-module-grid" id="access-module-grid"></div>
        </section>
      </section>
    `
  );

  document.getElementById("access-audit-button")?.addEventListener("click", recordAccessReviewSnapshot);
}

function renderAccessControl() {
  ensureAccessControlView();

  const command = document.getElementById("access-command");
  const reviewPanel = document.getElementById("access-review-panel");
  const summary = document.getElementById("access-summary-grid");
  const list = document.getElementById("access-list");
  const controls = document.getElementById("access-controls");
  const ux = document.getElementById("access-ux");
  const moduleGrid = document.getElementById("access-module-grid");
  const securityList = document.getElementById("access-security-list");
  if (!command || !reviewPanel || !summary || !list || !controls || !ux || !moduleGrid || !securityList) return;

  const profiles = getAccessProfiles();
  const matrix = getAccessModuleMatrix();
  const securityChecklist = getMvpSecurityChecklist();
  const highRisk = profiles.filter((profile) => profile.risk === "Alto").length;
  const totalActions = profiles.reduce((sum, profile) => sum + profile.canAct.length, 0);
  const totalRestrictions = profiles.reduce((sum, profile) => sum + profile.restrictions.length, 0);
  const activeProfile = profileConfig[state.currentProfile] || profileConfig.manager;
  const guardedNavigationEnabled = typeof openView === "function" && Boolean(document.getElementById("navigation-guard-notice") || document.querySelector(".topbar"));
  const reviewSnapshot = state.lastAccessReview;

  command.innerHTML = `
    <div>
      <span class="access-command-label">Perfil ativo</span>
      <strong>${activeProfile.label}</strong>
      <p>${activeProfile.scope}</p>
      <small>${activeProfile.views.length} modulo(s) disponiveis neste perfil.</small>
    </div>
    <div class="access-command-actions">
      <span class="status ${matrix.restrictedToManager.length ? "warning" : ""}">
        ${matrix.restrictedToManager.length} modulo(s) sensivel(is) restrito(s) ao gestor
      </span>
      <button class="primary-button access-audit-shortcut" type="button">Abrir auditoria</button>
    </div>
  `;

  reviewPanel.innerHTML = `
    <div>
      <span>Ultima revisao</span>
      <strong>${reviewSnapshot ? reviewSnapshot.reviewedAt : "Pendente"}</strong>
      <p>${reviewSnapshot ? reviewSnapshot.summary : "Registre a revisao para congelar a matriz atual de acesso e riscos do MVP."}</p>
    </div>
    <div class="access-review-metrics">
      <span>${reviewSnapshot?.mappedProfiles || profiles.length} perfil(is)</span>
      <span>${reviewSnapshot?.mappedModules || matrix.allViews.length} modulo(s)</span>
      <span>${reviewSnapshot?.restrictedToManager ?? matrix.restrictedToManager.length} sensivel(is) restrito(s)</span>
      <span>${reviewSnapshot?.checklistItems || securityChecklist.length} controle(s)</span>
    </div>
  `;

  const cards = [
    ["Perfis mapeados", profiles.length],
    ["Risco alto", highRisk],
    ["Acoes permitidas", totalActions],
    ["Restricoes", totalRestrictions],
    ["Navegacao protegida", guardedNavigationEnabled ? "Sim" : "Nao"],
    ["Modulos mapeados", matrix.allViews.length],
    ["Checklist MVP", securityChecklist.length],
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

  securityList.innerHTML = securityChecklist
    .map(
      (item) => `
        <article class="access-security-row">
          <div>
            <strong>${item.title}</strong>
            <span>${item.detail}</span>
          </div>
          <strong class="status ${item.className}">${item.status}</strong>
        </article>
      `
    )
    .join("");

  moduleGrid.innerHTML = matrix.allViews
    .map((view) => {
      const title = pageTitles[view] || view;
      const isSensitive = matrix.sensitiveViews.includes(view);
      const cells = matrix.profileKeys
        .map((profile) => {
          const allowed = profileConfig[profile]?.views.includes(view);
          return `<span class="access-module-pill ${allowed ? "allowed" : ""}">${profileConfig[profile]?.label || profile}: ${allowed ? "Sim" : "Nao"}</span>`;
        })
        .join("");

      return `
        <article class="access-module-row">
          <div>
            <strong>${title}</strong>
            <span>${isSensitive ? "Modulo sensivel" : "Modulo operacional"}</span>
          </div>
          <div class="access-module-pills">${cells}</div>
        </article>
      `;
    })
    .join("");

  document.querySelector(".access-audit-shortcut")?.addEventListener("click", () => openView("audit"));

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
    <div class="access-note">
      <strong>Navegacao protegida</strong>
      <span>Atalhos para modulos indisponiveis por perfil redirecionam com aviso visivel e evento de auditoria.</span>
    </div>
  `;

  ux.innerHTML = `
    <div class="access-note">
      <strong>Menu por perfil</strong>
      <span>O usuario deve ver somente o que pode usar, reduzindo erro e deixando o sistema mais simples.</span>
    </div>
    <div class="access-note">
      <strong>Mensagens claras</strong>
      <span>Quando uma acao for bloqueada, o sistema explica o redirecionamento sem expor dado sensivel.</span>
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
    grid-template-columns: repeat(5, minmax(140px, 1fr));
    gap: 14px;
    margin-bottom: 18px;
  }
  .access-command {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(240px, 320px);
    gap: 16px;
    align-items: center;
    margin-bottom: 18px;
    background: linear-gradient(135deg, #f8fafc, #eef6ff);
  }
  .access-review-panel {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(260px, 420px);
    gap: 14px;
    align-items: center;
    margin-bottom: 18px;
    background: #f8faf8;
  }
  .access-review-panel span,
  .access-review-panel p {
    display: block;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.4;
  }
  .access-review-panel strong {
    display: block;
    margin-top: 5px;
    font-size: 20px;
  }
  .access-review-panel p {
    margin: 6px 0 0;
  }
  .access-review-metrics {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .access-review-metrics span {
    padding: 8px 10px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
    color: var(--text);
    font-weight: 800;
  }
  .access-command-label {
    display: block;
    color: var(--muted);
    font-size: 13px;
    font-weight: 700;
    margin-bottom: 6px;
  }
  .access-command strong {
    display: block;
    font-size: 20px;
  }
  .access-command p,
  .access-command small {
    display: block;
    margin: 6px 0 0;
    color: var(--muted);
    line-height: 1.4;
  }
  .access-command-actions {
    display: grid;
    gap: 10px;
  }
  .access-summary-card,
  .access-row,
  .access-note,
  .access-module-row {
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
  .access-notes,
  .access-security-list,
  .access-module-grid {
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
  .access-security-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
    padding: 12px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface-2);
  }
  .access-security-row span {
    display: block;
    margin-top: 4px;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.4;
  }
  .access-module-row {
    display: grid;
    grid-template-columns: minmax(180px, 1fr) 2fr;
    gap: 12px;
    align-items: center;
    padding: 12px;
    background: var(--surface-2);
  }
  .access-module-row span {
    display: block;
    color: var(--muted);
    font-size: 13px;
  }
  .access-module-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: flex-end;
  }
  .access-module-pill {
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 6px 10px;
    background: #f8fafc;
    color: var(--muted);
    font-size: 12px;
    font-weight: 700;
  }
  .access-module-pill.allowed {
    border-color: #bbf7d0;
    background: #ecfdf3;
    color: #047857;
  }
  @media (max-width: 1040px) {
    .access-summary-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .access-command,
    .access-review-panel,
    .access-module-row {
      grid-template-columns: 1fr;
    }
    .access-module-pills {
      justify-content: flex-start;
    }
  }
  @media (max-width: 640px) {
    .access-summary-grid,
    .access-review-metrics,
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
