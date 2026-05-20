const auditFilters = {
  query: "",
  source: "all",
  profile: "all",
};

function ensureAuditControls() {
  if (document.getElementById("audit-search")) return;

  const auditView = document.getElementById("audit-view");
  const tablePanel = auditView?.querySelector(".table-panel");
  if (!auditView || !tablePanel) return;

  tablePanel.insertAdjacentHTML(
    "beforebegin",
    `
      <section class="panel audit-tools">
        <div class="audit-toolbar">
          <label>
            Buscar evento
            <input id="audit-search" class="text-input" placeholder="Servidor, contrato, codigo, arquivo..." />
          </label>
          <label>
            Origem
            <select id="audit-source-filter" class="select-input"></select>
          </label>
          <label>
            Perfil
            <select id="audit-profile-filter" class="select-input"></select>
          </label>
          <button class="secondary-button" id="audit-clear-filters" type="button">Limpar</button>
          <button class="primary-button" id="audit-export" type="button">Exportar CSV</button>
        </div>
      </section>
    `
  );

  document.getElementById("audit-search").addEventListener("input", (event) => {
    auditFilters.query = event.target.value.trim().toLowerCase();
    renderAudit();
  });

  document.getElementById("audit-source-filter").addEventListener("change", (event) => {
    auditFilters.source = event.target.value;
    renderAudit();
  });

  document.getElementById("audit-profile-filter").addEventListener("change", (event) => {
    auditFilters.profile = event.target.value;
    renderAudit();
  });

  document.getElementById("audit-clear-filters").addEventListener("click", () => {
    auditFilters.query = "";
    auditFilters.source = "all";
    auditFilters.profile = "all";
    document.getElementById("audit-search").value = "";
    renderAudit();
  });

  document.getElementById("audit-export").addEventListener("click", exportAuditCsv);
}

function uniqueAuditValues(field) {
  return [...new Set(state.movements.map((movement) => movement[field] || (field === "profile" ? "Sistema" : "MVP")))]
    .filter(Boolean)
    .sort();
}

function updateAuditFilterOptions() {
  const sourceSelect = document.getElementById("audit-source-filter");
  const profileSelect = document.getElementById("audit-profile-filter");
  if (!sourceSelect || !profileSelect) return;

  const sourceValue = auditFilters.source;
  const profileValue = auditFilters.profile;
  sourceSelect.innerHTML = [
    `<option value="all">Todas</option>`,
    ...uniqueAuditValues("source").map((source) => `<option value="${source}">${source}</option>`),
  ].join("");
  profileSelect.innerHTML = [
    `<option value="all">Todos</option>`,
    ...uniqueAuditValues("profile").map((profile) => `<option value="${profile}">${profile}</option>`),
  ].join("");
  sourceSelect.value = sourceValue;
  profileSelect.value = profileValue;
}

function getFilteredAuditRows() {
  return state.movements.filter((movement) => {
    const profile = movement.profile || "Sistema";
    const source = movement.source || "MVP";
    const searchable = `${movement.date} ${movement.text} ${profile} ${source}`.toLowerCase();
    const matchesQuery = !auditFilters.query || searchable.includes(auditFilters.query);
    const matchesSource = auditFilters.source === "all" || source === auditFilters.source;
    const matchesProfile = auditFilters.profile === "all" || profile === auditFilters.profile;
    return matchesQuery && matchesSource && matchesProfile;
  });
}

function csvEscapeAudit(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function exportAuditCsv() {
  const rows = getFilteredAuditRows();
  const content = [
    "data,evento,perfil,origem",
    ...rows.map((movement) =>
      [
        movement.date,
        movement.text,
        movement.profile || "Sistema",
        movement.source || "MVP",
      ]
        .map(csvEscapeAudit)
        .join(",")
    ),
  ].join("\n");

  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `auditoria-margem-clara-${today()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

const auditEnhancementStyle = document.createElement("style");
auditEnhancementStyle.textContent = `
  .audit-tools {
    margin-bottom: 18px;
  }
  .audit-toolbar {
    display: grid;
    grid-template-columns: minmax(220px, 1.4fr) minmax(160px, 1fr) minmax(160px, 1fr) auto auto;
    gap: 12px;
    align-items: end;
  }
  .audit-toolbar label {
    display: grid;
    gap: 6px;
    color: var(--muted);
    font-size: 13px;
    font-weight: 700;
  }
  @media (max-width: 980px) {
    .audit-toolbar {
      grid-template-columns: 1fr;
    }
    .audit-toolbar button {
      width: 100%;
    }
  }
`;
document.head.appendChild(auditEnhancementStyle);

const renderAuditBeforeEnhancements = renderAudit;
renderAudit = function renderAuditWithFilters() {
  ensureAuditControls();
  updateAuditFilterOptions();

  const table = document.getElementById("audit-table");
  if (!table) return;

  const rows = getFilteredAuditRows().map((movement) => {
    const profile = movement.profile || "Sistema";
    const source = movement.source || "MVP";
    return `
      <tr>
        <td>${movement.date}</td>
        <td>${movement.text}</td>
        <td><span class="status">${profile}</span></td>
        <td>${source}</td>
      </tr>
    `;
  });

  table.innerHTML = rows.length
    ? rows.join("")
    : `<tr><td colspan="4">Nenhum evento encontrado para os filtros atuais.</td></tr>`;
};

renderAudit();
