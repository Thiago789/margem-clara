const openViewBeforeNavigationGuard = openView;
let lastNavigationGuardNotice = null;

function ensureNavigationGuardNotice() {
  let notice = document.getElementById("navigation-guard-notice");
  if (notice) return notice;

  const topbar = document.querySelector(".topbar");
  if (!topbar) return null;

  notice = document.createElement("div");
  notice.id = "navigation-guard-notice";
  notice.className = "navigation-guard-notice";
  notice.hidden = true;
  topbar.insertAdjacentElement("afterend", notice);
  return notice;
}

function renderNavigationGuardNotice() {
  const notice = ensureNavigationGuardNotice();
  if (!notice) return;

  if (!lastNavigationGuardNotice) {
    notice.hidden = true;
    notice.innerHTML = "";
    return;
  }

  notice.hidden = false;
  notice.innerHTML = `
    <strong>Acesso redirecionado</strong>
    <span>${lastNavigationGuardNotice}</span>
    <button class="secondary-button navigation-guard-dismiss" type="button">Entendi</button>
  `;
  notice.querySelector(".navigation-guard-dismiss")?.addEventListener("click", () => {
    lastNavigationGuardNotice = null;
    renderNavigationGuardNotice();
  });
}

openView = function openViewWithNavigationGuard(viewName) {
  const requested = viewName || "dashboard";
  const exists = Boolean(document.getElementById(`${requested}-view`));
  const config = profileConfig[state.currentProfile] || profileConfig.manager;
  const allowed = config.views.includes(requested);

  if (!exists || !allowed) {
    const fallback = config.views.find((view) => document.getElementById(`${view}-view`)) || "dashboard";
    const requestedLabel = pageTitles[requested] || requested;
    const fallbackLabel = pageTitles[fallback] || fallback;
    lastNavigationGuardNotice = `${requestedLabel} nao esta disponivel para ${config.label}. Abrimos ${fallbackLabel}.`;
    auditEvent(
      `Atalho para modulo indisponivel redirecionado: ${requested} -> ${fallback}.`,
      "Navegacao"
    );
    saveState();
    openViewBeforeNavigationGuard(fallback);
    render();
    renderNavigationGuardNotice();
    return;
  }

  openViewBeforeNavigationGuard(requested);
};

const navigationGuardStyle = document.createElement("style");
navigationGuardStyle.textContent = `
  .navigation-guard-notice {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
    margin: -12px 0 18px;
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-left: 4px solid var(--accent);
    border-radius: 8px;
    background: #fff7ed;
  }
  .navigation-guard-notice[hidden] {
    display: none;
  }
  .navigation-guard-notice strong {
    font-size: 13px;
  }
  .navigation-guard-notice span {
    color: var(--muted);
    font-size: 13px;
    line-height: 1.4;
  }
  .navigation-guard-notice .secondary-button {
    min-height: 32px;
    padding: 0 12px;
  }
  @media (max-width: 760px) {
    .navigation-guard-notice {
      grid-template-columns: 1fr;
    }
  }
`;
document.head.appendChild(navigationGuardStyle);

const renderBeforeNavigationGuardNotice = render;
render = function renderWithNavigationGuardNotice() {
  renderBeforeNavigationGuardNotice();
  renderNavigationGuardNotice();
};
