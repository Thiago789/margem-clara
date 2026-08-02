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
          const status = contractEnrollmentReservationStatus(enrollment);
          return `<option value="${enrollment.id}">${enrollment.number} - ${enrollment.functionalStatus} - ${available}${status.ok ? "" : " - bloqueada"}</option>`;
        })
        .join("")
    : `<option value="">Nenhuma matricula disponivel</option>`;
}

function contractEnrollmentReservationStatus(enrollment) {
  if (!enrollment) {
    return { ok: false, message: "Selecione uma matricula valida para criar reserva." };
  }

  const status = enrollment.status || enrollment.functionalStatus;
  if (status === "Inativo") {
    return { ok: false, message: `A matricula ${enrollment.number} esta inativa e nao pode receber nova reserva.` };
  }

  if (status === "Em revisao") {
    return { ok: false, message: `A matricula ${enrollment.number} esta em revisao. Libere o vinculo antes de reservar margem.` };
  }

  const margin = typeof calculateEnrollmentMargin === "function" ? calculateEnrollmentMargin(enrollment) : null;
  if (margin && margin.available <= 0) {
    return { ok: false, message: `A matricula ${enrollment.number} nao possui margem disponivel para nova reserva.` };
  }

  return { ok: true, message: "" };
}

function selectedContractBindingEnrollment(employeeId) {
  const selectedId = document.getElementById("contract-enrollment")?.value;
  const selected = selectedId && typeof enrollmentById === "function" ? enrollmentById(selectedId) : null;
  if (selected?.employeeId === employeeId) return selected;

  return contractBindingEnrollmentsByEmployee(employeeId)[0] || null;
}

function contractBindingEnrollmentNumber(contract) {
  const enrollment = contract?.enrollmentId && typeof enrollmentById === "function" ? enrollmentById(contract.enrollmentId) : null;
  if (enrollment?.number) return enrollment.number;

  const employee = contract ? employeeById(contract.employeeId) : null;
  return contract?.enrollmentNumber || employee?.enrollment || "";
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
      const reservationStatus = contractEnrollmentReservationStatus(enrollment);
      if (!reservationStatus.ok) {
        event.preventDefault();
        event.stopImmediatePropagation();
        alert(reservationStatus.message);
        return;
      }

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
    return {
      ...row,
      matricula: contractBindingEnrollmentNumber(contract) || row.matricula,
    };
  });
};

function renderContractEnrollmentBadges() {
  document.querySelectorAll("#contracts-table tr").forEach((row) => {
    if (row.dataset.enrollmentBadgeRendered === "true") return;
    const contractId = row.querySelector("td:first-child strong")?.textContent?.trim();
    const contract = state.contracts.find((item) => item.id === contractId);
    const enrollmentNumber = contractBindingEnrollmentNumber(contract);
    if (!contract || !enrollmentNumber) return;

    row.querySelector("td:nth-child(2)")?.insertAdjacentHTML(
      "beforeend",
      `<div class="muted contract-enrollment-badge">Matricula/vinculo: ${enrollmentNumber}</div>`
    );
    row.dataset.enrollmentBadgeRendered = "true";
  });
}

const renderBeforeEnrollmentContractBinding = render;
render = function renderWithEnrollmentContractBinding() {
  renderBeforeEnrollmentContractBinding();
  renderContractEnrollmentBindingOptions();
  bindContractEnrollmentLifecycle();
  renderContractEnrollmentBadges();
};

render();
