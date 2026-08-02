const auditFilters = {
  query: "",
  source: "all",
  profile: "all",
  lens: "all",
};

function ensureAuditControls() {
  if (document.getElementById("audit-search")) return;

  const auditView = document.getElementById("audit-view");
  const tablePanel = auditView?.querySelector(".table-panel");
  if (!auditView || !tablePanel) return;

  tablePanel.insertAdjacentHTML(
    "beforebegin",
    `
      <div class="audit-summary-grid" id="audit-summary-grid"></div>
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
          <button class="secondary-button" id="audit-accreditation-blocks" type="button">Bloqueios cred.</button>
          <button class="secondary-button audit-lens-button" data-audit-lens="decisions" type="button">Decisoes</button>
          <button class="secondary-button audit-lens-button" data-audit-lens="blocks" type="button">Bloqueios</button>
          <button class="secondary-button audit-lens-button" data-audit-lens="exceptions" type="button">Excecoes</button>
          <button class="secondary-button" id="audit-simulate-accreditation-block" type="button">Gerar teste bloqueio</button>
          <button class="secondary-button" id="audit-clear-filters" type="button">Limpar</button>
          <button class="primary-button" id="audit-export" type="button">Exportar CSV</button>
        </div>
      </section>
      <section class="panel audit-decision-trail" id="audit-decision-trail"></section>
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

  document.getElementById("audit-accreditation-blocks").addEventListener("click", () => {
    auditFilters.query = "";
    auditFilters.source = "Bloqueio de credenciamento";
    auditFilters.profile = "all";
    auditFilters.lens = "blocks";
    document.getElementById("audit-search").value = "";
    renderAudit();
  });

  document.querySelectorAll(".audit-lens-button").forEach((button) => {
    button.addEventListener("click", () => {
      auditFilters.lens = auditFilters.lens === button.dataset.auditLens ? "all" : button.dataset.auditLens;
      renderAudit();
    });
  });

  document.getElementById("audit-simulate-accreditation-block").addEventListener("click", () => {
    const fallbackMessage = "tentativa bloqueada por credenciamento da consignataria no convenio.";
    const blockMessage = typeof lenderOperationBlockMessage === "function"
      ? lenderOperationBlockMessage("lender-2", "Emprestimo consignado")
      : fallbackMessage;
    auditEvent(`Teste controlado: ${blockMessage || fallbackMessage}`, "Bloqueio de credenciamento");
    saveState();
    auditFilters.query = "";
    auditFilters.source = "Bloqueio de credenciamento";
    auditFilters.profile = "all";
    document.getElementById("audit-search").value = "";
    renderAudit();
  });

  document.getElementById("audit-clear-filters").addEventListener("click", () => {
    auditFilters.query = "";
    auditFilters.source = "all";
    auditFilters.profile = "all";
    auditFilters.lens = "all";
    document.getElementById("audit-search").value = "";
    renderAudit();
  });

  document.getElementById("audit-export").addEventListener("click", exportAuditCsv);
}

function getAuditSummaryCards(rows) {
  const sensitiveEvents = rows.filter((movement) => /permiss|acesso|navegacao|redirecionado|bloquead|auditoria|fechamento/i.test(`${movement.text} ${movement.source || ""}`));
  const navigationEvents = rows.filter((movement) => /redirecionado|navegacao/i.test(`${movement.text} ${movement.source || ""}`));
  const decisionEvents = rows.filter(isAuditDecisionEvent);

  return [
    ["Eventos filtrados", rows.length],
    ["Eventos sensiveis", sensitiveEvents.length],
    ["Decisoes formais", decisionEvents.length],
    ["Navegacao protegida", navigationEvents.length],
    ["Origens", uniqueAuditValues("source").length],
  ];
}

function isAuditDecisionEvent(movement) {
  return /decisao|checkpoint|protocolo|fechamento|homologacao|termo operacional|aceite/i.test(`${movement.text} ${movement.source || ""}`);
}

function isAuditBlockEvent(movement) {
  return /bloque|imped|negad|redirecionado/i.test(`${movement.text} ${movement.source || ""}`);
}

function isAuditExceptionEvent(movement) {
  return /excecao|ressalva|diverg|rejei|nao descont/i.test(`${movement.text} ${movement.source || ""}`);
}

function matchesAuditLens(movement) {
  if (auditFilters.lens === "decisions") return isAuditDecisionEvent(movement);
  if (auditFilters.lens === "blocks") return isAuditBlockEvent(movement);
  if (auditFilters.lens === "exceptions") return isAuditExceptionEvent(movement);
  return true;
}

function getAuditDecisionTrailRows(rows) {
  const important = rows.filter(
    (movement) => isAuditDecisionEvent(movement) || isAuditBlockEvent(movement) || isAuditExceptionEvent(movement)
  );
  return important.slice(0, 5);
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
    return matchesQuery && matchesSource && matchesProfile && matchesAuditLens(movement);
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
  .audit-summary-grid {
    display: grid;
    grid-template-columns: repeat(5, minmax(130px, 1fr));
    gap: 14px;
    margin-bottom: 18px;
  }
  .audit-summary-card {
    padding: 16px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
    box-shadow: var(--shadow);
  }
  .audit-summary-card span {
    display: block;
    color: var(--muted);
    font-size: 13px;
  }
  .audit-summary-card strong {
    display: block;
    margin-top: 8px;
    font-size: 26px;
  }
  .audit-tools {
    margin-bottom: 18px;
  }
  .audit-toolbar {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 12px;
    align-items: end;
  }
  .audit-lens-button.active {
    border-color: rgba(15, 118, 110, 0.45);
    background: rgba(15, 118, 110, 0.1);
    color: var(--primary-strong);
  }
  .audit-decision-trail {
    margin-bottom: 18px;
  }
  .audit-decision-trail-list {
    display: grid;
    gap: 8px;
  }
  .audit-decision-trail-row {
    display: grid;
    grid-template-columns: minmax(110px, auto) 1fr minmax(120px, auto);
    gap: 10px;
    align-items: center;
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface-2);
  }
  .audit-decision-trail-row strong,
  .audit-decision-trail-row span,
  .audit-decision-trail-row small {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .audit-decision-trail-row span,
  .audit-decision-trail-row small {
    color: var(--muted);
    font-size: 13px;
  }
  .audit-toolbar label {
    display: grid;
    gap: 6px;
    color: var(--muted);
    font-size: 13px;
    font-weight: 700;
    min-width: 0;
  }
  .audit-toolbar input,
  .audit-toolbar select,
  .audit-toolbar button {
    min-width: 0;
    width: 100%;
  }
  .audit-toolbar button {
    white-space: normal;
  }
  @media (max-width: 980px) {
    .audit-summary-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .audit-toolbar {
      grid-template-columns: 1fr;
    }
    .audit-toolbar button {
      width: 100%;
    }
  }
  @media (max-width: 640px) {
    .audit-summary-grid {
      grid-template-columns: 1fr;
    }
    .audit-decision-trail-row {
      grid-template-columns: 1fr;
    }
  }
`;
document.head.appendChild(auditEnhancementStyle);

const renderAuditBeforeEnhancements = renderAudit;
renderAudit = function renderAuditWithFilters() {
  ensureAuditControls();
  updateAuditFilterOptions();

  const table = document.getElementById("audit-table");
  const summary = document.getElementById("audit-summary-grid");
  const decisionTrail = document.getElementById("audit-decision-trail");
  if (!table) return;

  const filteredRows = getFilteredAuditRows();
  document.querySelectorAll(".audit-lens-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.auditLens === auditFilters.lens);
  });

  if (summary) {
    summary.innerHTML = getAuditSummaryCards(filteredRows)
      .map(
        ([label, value]) => `
          <article class="audit-summary-card">
            <span>${label}</span>
            <strong>${value}</strong>
          </article>
        `
      )
      .join("");
  }

  if (decisionTrail) {
    const trailRows = getAuditDecisionTrailRows(filteredRows);
    decisionTrail.innerHTML = `
      <div class="panel-heading">
        <h3>Trilha de decisoes</h3>
      </div>
      <div class="audit-decision-trail-list">
        ${
          trailRows.length
            ? trailRows
                .map(
                  (movement) => `
                    <article class="audit-decision-trail-row">
                      <span>${movement.date}</span>
                      <strong>${movement.text}</strong>
                      <small>${movement.source || "MVP"} - ${movement.profile || "Sistema"}</small>
                    </article>
                  `
                )
                .join("")
            : `<div class="empty-state">Nenhuma decisao, bloqueio ou excecao encontrada para os filtros atuais.</div>`
        }
      </div>
    `;
  }

  const rows = filteredRows.map((movement) => {
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
