function renderAudit() {
  const table = document.getElementById("audit-table");
  if (!table) return;

  const rows = state.movements.map((movement) => {
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
    : `<tr><td colspan="4">Nenhum evento registrado ainda.</td></tr>`;
}

if (!pageTitles.audit) {
  pageTitles.audit = "Auditoria";
}

if (!profileConfig.manager.views.includes("audit")) {
  profileConfig.manager.views.push("audit");
}

const renderWithoutAuditAddon = render;
render = function renderWithAuditAddon() {
  renderWithoutAuditAddon();
  renderAudit();
};

render();
