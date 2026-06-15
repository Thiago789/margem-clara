const openViewBeforeNavigationGuard = openView;

openView = function openViewWithNavigationGuard(viewName) {
  const requested = viewName || "dashboard";
  const exists = Boolean(document.getElementById(`${requested}-view`));
  const config = profileConfig[state.currentProfile] || profileConfig.manager;
  const allowed = config.views.includes(requested);

  if (!exists || !allowed) {
    const fallback = config.views.find((view) => document.getElementById(`${view}-view`)) || "dashboard";
    auditEvent(
      `Atalho para modulo indisponivel redirecionado: ${requested} -> ${fallback}.`,
      "Navegacao"
    );
    saveState();
    openViewBeforeNavigationGuard(fallback);
    render();
    return;
  }

  openViewBeforeNavigationGuard(requested);
};
