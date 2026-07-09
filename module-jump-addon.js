(function setupModuleJumpAddon() {
  function getAllowedViews() {
    const config = profileConfig[state.currentProfile] || profileConfig.manager;
    return config.views;
  }

  function escapeModuleJumpText(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function getModuleJumpGroups(allowedViews) {
    if (typeof getJourneyStages === "function" && typeof getJourneyWorkstreams === "function") {
      return getJourneyStages()
        .map((stage) => ({
          label: stage.title,
          groups: getJourneyWorkstreams(stage)
            .map((group) => ({
              label: group.title,
              views: group.views.filter((view) => allowedViews.includes(view) && document.getElementById(`${view}-view`)),
            }))
            .filter((group) => group.views.length),
        }))
        .filter((stage) => stage.groups.length);
    }

    return [
      {
        label: "Modulos",
        groups: [
          {
            label: "Disponiveis",
            views: allowedViews.filter((view) => document.getElementById(`${view}-view`)),
          },
        ],
      },
    ];
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
    const labels = new Map(
      Array.from(document.querySelectorAll(".nav-item")).map((button) => [
        button.dataset.view,
        button.dataset.originalLabel || button.textContent.trim(),
      ])
    );
    const used = new Set();
    const groupedOptions = getModuleJumpGroups(allowedViews)
      .map((stage) => {
        const options = stage.groups
          .flatMap((group) =>
            group.views
              .filter((view) => {
                if (used.has(view)) return false;
                used.add(view);
                return true;
              })
              .map((view) => ({
                value: view,
                label: labels.get(view) || pageTitles[view] || view,
                group: group.label,
              }))
          );
        if (!options.length) return "";
        return `
          <optgroup label="${escapeModuleJumpText(stage.label)}">
            ${options
              .map(
                (option) =>
                  `<option value="${escapeModuleJumpText(option.value)}">${escapeModuleJumpText(`${option.group} - ${option.label}`)}</option>`
              )
              .join("")}
          </optgroup>
        `;
      })
      .join("");

    const remainingOptions = allowedViews
      .filter((view) => !used.has(view) && document.getElementById(`${view}-view`))
      .map((view) => `<option value="${escapeModuleJumpText(view)}">${escapeModuleJumpText(labels.get(view) || pageTitles[view] || view)}</option>`)
      .join("");

    jump.innerHTML = `${groupedOptions}${remainingOptions ? `<optgroup label="Outros">${remainingOptions}</optgroup>` : ""}`;
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
