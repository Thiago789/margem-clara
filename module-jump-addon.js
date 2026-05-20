(function setupModuleJumpAddon() {
  function getAllowedViews() {
    const config = profileConfig[state.currentProfile] || profileConfig.manager;
    return config.views;
  }

  function ensureModuleJump() {
    let jump = document.getElementById("module-jump");
    if (jump) return jump;

    const profileSelect = document.getElementById("profile-select");
    if (!profileSelect) return null;

    jump = document.createElement("select");
    jump.className = "select-input compact-select";
    jump.id = "module-jump";
    jump.title = "Ir para modulo";
    profileSelect.insertAdjacentElement("beforebegin", jump);
    return jump;
  }

  function syncModuleJump() {
    const jump = ensureModuleJump();
    if (!jump) return;

    const allowedViews = getAllowedViews();
    const activeView = document.querySelector(".view.active")?.id?.replace("-view", "");
    const options = Array.from(document.querySelectorAll(".nav-item"))
      .filter((button) => allowedViews.includes(button.dataset.view))
      .map((button) => `<option value="${button.dataset.view}">${button.textContent.trim()}</option>`);

    jump.innerHTML = options.join("");
    jump.value = allowedViews.includes(activeView) ? activeView : allowedViews[0];

    if (!jump.dataset.bound) {
      jump.addEventListener("change", (event) => openView(event.target.value));
      jump.dataset.bound = "true";
    }
  }

  const renderBeforeModuleJump = render;
  render = function renderWithModuleJump() {
    renderBeforeModuleJump();
    syncModuleJump();
  };

  const openViewBeforeModuleJump = openView;
  openView = function openViewWithModuleJump(viewName) {
    openViewBeforeModuleJump(viewName);
    syncModuleJump();
  };

  const nav = document.querySelector(".nav-list");
  if (nav && "MutationObserver" in window) {
    new MutationObserver(syncModuleJump).observe(nav, { childList: true });
  }

  syncModuleJump();
})();
