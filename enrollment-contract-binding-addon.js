function ensureContractEnrollmentBindingField() {
  const employeeLabel = document.getElementById("contract-employee")?.closest("label");
  if (!employeeLabel || document.getElementById("contract-enrollment")) return;

  employeeLabel.insertAdjacentHTML(
    "afterend",
    `
      <label>
        Matricula/vinculo
        <select id="contract-enrollment" class="select-input"></select>
      </label>
    `
  );
}

function contractBindingEnrollmentsByEmployee(employeeId) {
  if (typeof normalizeEnrollments === "function") normalizeEnrollments();
  return (state.enrollments || []).filter((enrollment) => enrollment.employeeId === employeeId);
}

function renderContractEnrollmentBindingOptions() {
  ensureContractEnrollmentBindingField();
  const employeeSelect = document.getElementById("contract-employee");
  const enrollmentSelect = document.getElementById("contract-enrollment");
  if (!employeeSelect || !enrollmentSelect) return;

  const enrollments = contractBindingEnrollmentsByEmployee(employeeSelect.value);
  enrollmentSelect.innerHTML = enrollments.length
    ? enrollments
        .map((enrollment) => {
          const margin = typeof calculateEnrollmentMargin === "function" ? calculateEnrollmentMargin(enrollment) : null;
          const available = margin ? money.format(margin.available) : "margem nao calculada";
          return `<option value="${enrollment.id}">${enrollment.number} - ${enrollment.functionalStatus} - ${available}</option>`;
        })
        .join("")
    : `<option value="">Nenhuma matricula disponivel</option>`;
}

function selectedContractBindingEnrollment(employeeId) {
  const selectedId = document.getElementById("contract-enrollment")?.value;
  const selected = selectedId && typeof enrollmentById === "function" ? enrollmentById(selectedId) : null;
  if (selected?.employeeId === employeeId) return selected;

  return contractBindingEnrollmentsByEmployee(employeeId)[0] || null;
}

function bindContractEnrollmentLifecycle() {
  const form = document.getElementById("contract-form");
  if (!form || form.dataset.enrollmentContractBinding === "true") return;
  form.dataset.enrollmentContractBinding = "true";

  document.getElementById("contract-employee")?.addEventListener("change", renderContractEnrollmentBindingOptions);

  form.addEventListener(
    "submit",
    (event) => {
      if (event.submitter?.value === "cancel") return;
      const employeeId = document.getElementById("contract-employee")?.value;
      const enrollment = selectedContractBindingEnrollment(employeeId);
      form.dataset.pendingEnrollmentId = enrollment?.id || "";
      form.dataset.contractIdsBeforeEnrollmentBinding = JSON.stringify(state.contracts.map((contract) => contract.id));
    },
    true
  );

  form.addEventListener("submit", (event) => {
    if (event.submitter?.value === "cancel") return;
    const enrollmentId = form.dataset.pendingEnrollmentId;
    if (!enrollmentId) return;

    setTimeout(() => {
      const previousIds = new Set(JSON.parse(form.dataset.contractIdsBeforeEnrollmentBinding || "[]"));
      const created = state.contracts.find((contract) => !previousIds.has(contract.id));
      const enrollment = typeof enrollmentById === "function" ? enrollmentById(enrollmentId) : null;
      if (!created || !enrollment) return;

      created.employeeId = enrollment.employeeId;
      created.enrollmentId = enrollment.id;
      created.enrollmentNumber = enrollment.number;
      auditEvent(`Reserva ${created.id} vinculada a matricula ${enrollment.number}.`, "Matriculas");
      saveState();
      render();
    }, 0);
  });
}

const calculateMarginBeforeContractEnrollmentBinding = calculateMargin;
calculateMargin = function calculateMarginWithSelectedContractEnrollment(employee) {
  const modal = document.getElementById("contract-modal");
  const selected = employee && modal?.open ? selectedContractBindingEnrollment(employee.id) : null;
  if (selected && typeof calculateEnrollmentMargin === "function") return calculateEnrollmentMargin(selected);
  return calculateMarginBeforeContractEnrollmentBinding(employee);
};

const buildInsertionRowsBeforeEnrollmentBinding = buildInsertionRows;
buildInsertionRows = function buildInsertionRowsWithEnrollmentBinding() {
  const rows = buildInsertionRowsBeforeEnrollmentBinding();
  return rows.map((row) => {
    const contract = state.contracts.find((item) => item.id === row.contrato);
    const enrollment = contract?.enrollmentId && typeof enrollmentById === "function" ? enrollmentById(contract.enrollmentId) : null;
    return {
      ...row,
      matricula: enrollment?.number || contract?.enrollmentNumber || row.matricula,
    };
  });
};

const renderBeforeEnrollmentContractBinding = render;
render = function renderWithEnrollmentContractBinding() {
  renderBeforeEnrollmentContractBinding();
  renderContractEnrollmentBindingOptions();
  bindContractEnrollmentLifecycle();
};

render();
