if (!pageTitles.enrollments) {
  pageTitles.enrollments = "Matriculas";
}

function normalizeEnrollments() {
  state.enrollments = Array.isArray(state.enrollments) ? state.enrollments : [];

  state.employees.forEach((employee) => {
    const existing = state.enrollments.find((enrollment) => enrollment.employeeId === employee.id && enrollment.number === employee.enrollment);
    if (!existing) {
      state.enrollments.push({
        id: `enr-${employee.id}`,
        employeeId: employee.id,
        agreement: "Prefeitura Modelo",
        number: employee.enrollment,
        functionalStatus: employee.status,
        baseSalary: employee.income,
        mandatoryDeductions: employee.mandatoryDeductions,
        status: employee.status,
      });
    }
  });

  state.contracts.forEach((contract) => {
    if (!contract.enrollmentId) {
      const employee = employeeById(contract.employeeId);
      const enrollment = state.enrollments.find((item) => item.employeeId === contract.employeeId && item.number === employee?.enrollment);
      contract.enrollmentId = enrollment?.id || `enr-${contract.employeeId}`;
    }
  });
}

function enrollmentById(enrollmentId) {
  normalizeEnrollments();
  return state.enrollments.find((enrollment) => enrollment.id === enrollmentId);
}

function contractsByEnrollment(enrollmentId, statuses) {
  return state.contracts.filter((contract) => {
    const sameEnrollment = contract.enrollmentId === enrollmentId;
    return sameEnrollment && (!statuses || statuses.includes(contract.status));
  });
}

function calculateEnrollmentMargin(enrollment) {
  const calculationBase = Math.max(Number(enrollment.baseSalary || 0) - Number(enrollment.mandatoryDeductions || 0), 0);
  const total = calculationBase * marginPercent;
  const used = contractsByEnrollment(enrollment.id, ["Descontando", "Averbado", "Enviado para folha"]).reduce(
    (sum, contract) => sum + Number(contract.installment || 0),
    0
  );
  const reserved = contractsByEnrollment(enrollment.id, ["Reservado"]).reduce((sum, contract) => sum + Number(contract.installment || 0), 0);
  const blocked = enrollment.status === "Em revisao" ? total * 0.1 : 0;
  const available = total - used - reserved - blocked;

  return {
    calculationBase,
    total,
    used,
    reserved,
    blocked,
    available,
    status: available < 0 ? "Negativa" : enrollment.status === "Em revisao" ? "Em revisao" : "Disponivel",
  };
}

function ensureEnrollmentView() {
  if (document.getElementById("enrollments-view")) return;

  const nav = document.querySelector(".nav-list");
  const employeesButton = document.querySelector('[data-view="employees"]');
  const button = document.createElement("button");
  button.className = "nav-item";
  button.dataset.view = "enrollments";
  button.type = "button";
  button.textContent = "Matriculas";
  button.addEventListener("click", () => openView("enrollments"));
  nav?.insertBefore(button, employeesButton?.nextSibling || null);

  if (!profileConfig.manager.views.includes("enrollments")) {
    const employeesIndex = profileConfig.manager.views.indexOf("employees");
    profileConfig.manager.views.splice(employeesIndex >= 0 ? employeesIndex + 1 : profileConfig.manager.views.length, 0, "enrollments");
  }

  document.querySelector(".main-panel")?.insertAdjacentHTML(
    "beforeend",
    `
      <section class="view" id="enrollments-view" aria-labelledby="enrollments-title">
        <div class="section-heading row-heading">
          <div>
            <h2 id="enrollments-title">Matriculas e vinculos</h2>
            <p>Controle margem por matricula, nao apenas por CPF.</p>
          </div>
          <button class="primary-button" id="enrollments-audit-button" type="button">Registrar revisao</button>
        </div>

        <div class="enrollment-summary-grid" id="enrollment-summary-grid"></div>

        <section class="panel enrollment-form-panel">
          <div class="panel-heading">
            <h3>Nova matricula</h3>
          </div>
          <form class="enrollment-form-grid" id="enrollment-form">
            <label>
              Servidor
              <select id="enrollment-employee" class="select-input"></select>
            </label>
            <label>
              Matricula
              <input id="enrollment-number" class="text-input" required />
            </label>
            <label>
              Status funcional
              <select id="enrollment-functional-status" class="select-input">
                <option>Ativo</option>
                <option>Em revisao</option>
                <option>Inativo</option>
              </select>
            </label>
            <label>
              Renda base
              <input id="enrollment-base-salary" class="text-input" type="number" min="0" step="0.01" required />
            </label>
            <label>
              Descontos obrigatorios
              <input id="enrollment-mandatory-deductions" class="text-input" type="number" min="0" step="0.01" value="0" />
            </label>
            <button class="primary-button" type="submit">Salvar matricula</button>
          </form>
        </section>

        <section class="panel">
          <div class="panel-heading">
            <h3>Vinculos operacionais</h3>
          </div>
          <div class="enrollment-list" id="enrollment-list"></div>
        </section>
      </section>
    `
  );

  document.getElementById("enrollments-audit-button")?.addEventListener("click", () => {
    auditEvent("Revisao de matriculas e vinculos registrada.", "Matriculas");
    saveState();
    render();
    openView("enrollments");
  });

  document.getElementById("enrollment-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    createEnrollmentFromForm();
  });

  document.getElementById("enrollment-employee")?.addEventListener("change", () => {
    const employee = employeeById(document.getElementById("enrollment-employee")?.value);
    if (!employee) return;
    document.getElementById("enrollment-base-salary").value = Number(employee.income || 0).toFixed(2);
    document.getElementById("enrollment-mandatory-deductions").value = Number(employee.mandatoryDeductions || 0).toFixed(2);
    document.getElementById("enrollment-functional-status").value = employee.status || "Ativo";
  });
}

function syncEnrollmentFormDefaults() {
  const employeeSelect = document.getElementById("enrollment-employee");
  if (!employeeSelect) return;

  employeeSelect.innerHTML = state.employees
    .map((employee) => `<option value="${employee.id}">${employee.name} - ${employee.cpf}</option>`)
    .join("");

  const selected = employeeById(employeeSelect.value) || state.employees[0];
  if (!selected) return;

  const baseSalary = document.getElementById("enrollment-base-salary");
  const deductions = document.getElementById("enrollment-mandatory-deductions");
  const status = document.getElementById("enrollment-functional-status");
  if (baseSalary && !baseSalary.value) baseSalary.value = Number(selected.income || 0).toFixed(2);
  if (deductions && !deductions.value) deductions.value = Number(selected.mandatoryDeductions || 0).toFixed(2);
  if (status && !status.value) status.value = selected.status || "Ativo";
}

function createEnrollmentFromForm() {
  normalizeEnrollments();
  const employeeId = document.getElementById("enrollment-employee")?.value;
  const employee = employeeById(employeeId);
  const number = document.getElementById("enrollment-number")?.value.trim();
  if (!employee || !number) return;

  const duplicate = state.enrollments.some((enrollment) => enrollment.employeeId === employeeId && enrollment.number === number);
  if (duplicate) {
    alert("Esta matricula ja existe para o servidor selecionado.");
    return;
  }

  state.enrollments.push({
    id: `enr-${Date.now().toString().slice(-8)}`,
    employeeId,
    agreement: "Prefeitura Modelo",
    number,
    functionalStatus: document.getElementById("enrollment-functional-status")?.value || "Ativo",
    baseSalary: Number(document.getElementById("enrollment-base-salary")?.value || 0),
    mandatoryDeductions: Number(document.getElementById("enrollment-mandatory-deductions")?.value || 0),
    status: document.getElementById("enrollment-functional-status")?.value || "Ativo",
    createdAt: today(),
  });

  auditEvent(`Matricula ${number} cadastrada para ${employee.name}.`, "Matriculas");
  saveState();
  document.getElementById("enrollment-form")?.reset();
  render();
  openView("enrollments");
}

function renderEnrollmentsView() {
  normalizeEnrollments();
  ensureEnrollmentView();

  const summary = document.getElementById("enrollment-summary-grid");
  const list = document.getElementById("enrollment-list");
  if (!summary || !list) return;
  syncEnrollmentFormDefaults();

  const multipleCpfCount = state.employees.filter(
    (employee) => state.enrollments.filter((enrollment) => enrollment.employeeId === employee.id).length > 1
  ).length;
  const totalAvailable = state.enrollments.reduce((sum, enrollment) => sum + calculateEnrollmentMargin(enrollment).available, 0);

  summary.innerHTML = [
    ["Servidores", state.employees.length],
    ["Matriculas", state.enrollments.length],
    ["CPF com varios vinculos", multipleCpfCount],
    ["Margem por vinculo", money.format(totalAvailable)],
  ]
    .map(
      ([label, value]) => `
        <article class="enrollment-summary-card">
          <span>${label}</span>
          <strong>${value}</strong>
        </article>
      `
    )
    .join("");

  list.innerHTML = state.enrollments
    .map((enrollment) => {
      const employee = employeeById(enrollment.employeeId);
      const margin = calculateEnrollmentMargin(enrollment);
      const statusClass = margin.available < 0 ? "danger" : margin.status === "Em revisao" ? "warning" : "";
      const contracts = contractsByEnrollment(enrollment.id);
      return `
        <article class="enrollment-row">
          <div>
            <strong>${employee?.name || "Servidor"}</strong>
            <span>${employee?.cpf || ""} - ${enrollment.number} - ${enrollment.agreement}</span>
          </div>
          <div><span>Status</span><strong>${enrollment.functionalStatus}</strong></div>
          <div><span>Base</span><strong>${money.format(Number(enrollment.baseSalary || 0))}</strong></div>
          <div><span>Disponivel</span><strong>${money.format(margin.available)}</strong></div>
          <div><span class="status ${statusClass}">${margin.status}</span></div>
          <p>${contracts.length} contrato(s) vinculado(s) a esta matricula.</p>
        </article>
      `;
    })
    .join("");
}

const originalCalculateMarginForEnrollmentAddon = calculateMargin;
calculateMargin = function calculateMarginByEnrollment(employee) {
  normalizeEnrollments();
  const enrollment = state.enrollments.find((item) => item.employeeId === employee.id && item.number === employee.enrollment);
  return enrollment ? calculateEnrollmentMargin(enrollment) : originalCalculateMarginForEnrollmentAddon(employee);
};

const enrollmentStyle = document.createElement("style");
enrollmentStyle.textContent = `
  .enrollment-summary-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(150px, 1fr));
    gap: 14px;
    margin-bottom: 18px;
  }
  .enrollment-summary-card,
  .enrollment-row {
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface-2);
  }
  .enrollment-summary-card {
    padding: 16px;
    box-shadow: var(--shadow);
  }
  .enrollment-summary-card span,
  .enrollment-row span,
  .enrollment-row p {
    display: block;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.4;
  }
  .enrollment-summary-card strong {
    display: block;
    margin-top: 8px;
    font-size: 24px;
  }
  .enrollment-list {
    display: grid;
    gap: 10px;
  }
  .enrollment-form-panel {
    margin-bottom: 18px;
  }
  .enrollment-form-grid {
    display: grid;
    grid-template-columns: 1.2fr 0.8fr 0.8fr 0.8fr 0.8fr auto;
    gap: 12px;
    align-items: end;
  }
  .enrollment-row {
    display: grid;
    grid-template-columns: 1.6fr 0.8fr 0.8fr 0.8fr auto;
    gap: 12px;
    align-items: center;
    padding: 12px;
  }
  .enrollment-row p {
    grid-column: 1 / -1;
    margin: 0;
  }
  @media (max-width: 1040px) {
    .enrollment-summary-grid,
    .enrollment-form-grid,
    .enrollment-row {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 640px) {
    .enrollment-summary-grid,
    .enrollment-form-grid,
    .enrollment-row {
      grid-template-columns: 1fr;
    }
  }
`;
document.head.appendChild(enrollmentStyle);

const renderBeforeEnrollmentAddon = render;
render = function renderWithEnrollmentAddon() {
  renderBeforeEnrollmentAddon();
  renderEnrollmentsView();
};

render();
