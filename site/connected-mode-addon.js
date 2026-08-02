const CONNECTED_MODE_QUERY = "connected";
const CONNECTED_API_PORT = "3333";
const CONNECTED_LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);

function connectedModeRequested() {
  const query = new URLSearchParams(location.search);
  return query.get("mode") === CONNECTED_MODE_QUERY;
}

function connectedApiBase() {
  if (!CONNECTED_LOCAL_HOSTS.has(location.hostname) || location.protocol !== "http:") return null;
  return `http://${location.hostname}:${CONNECTED_API_PORT}/api/v1`;
}

const connectedRuntime = {
  active: connectedModeRequested() && Boolean(connectedApiBase()),
  actor: null,
  agreements: [],
  agreementId: null,
  partyId: null,
  overview: null,
  loading: false,
  error: null,
};

function connectedEscape(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[character],
  );
}

async function connectedRequest(path, options = {}) {
  const base = connectedApiBase();
  if (!base) throw new Error("O modo conectado exige o frontend local em HTTP.");

  const response = await fetch(`${base}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });

  if (response.status === 204) return null;
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.message || `Falha na API (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function connectedMembershipScopes(actor) {
  return (actor?.memberships || []).filter((membership) => membership.agreementId);
}

async function loadConnectedSession() {
  connectedRuntime.loading = true;
  connectedRuntime.error = null;
  renderConnectedStatus();
  try {
    connectedRuntime.actor = await connectedRequest("/auth/me");
    const scopes = connectedMembershipScopes(connectedRuntime.actor);
    try {
      connectedRuntime.agreements = await connectedRequest("/agreements");
    } catch (error) {
      if (error.status !== 403) throw error;
      connectedRuntime.agreements = scopes.map((scope) => ({
        id: scope.agreementId,
        name: "Convenio autorizado",
      }));
    }

    if (!connectedRuntime.agreementId) {
      connectedRuntime.agreementId =
        scopes[0]?.agreementId ||
        connectedRuntime.agreements[0]?.id ||
        null;
    }
    const selectedScope = scopes.find(
      (membership) => membership.agreementId === connectedRuntime.agreementId,
    );
    connectedRuntime.partyId = selectedScope?.partyId || null;
    await loadConnectedArrears();
  } catch (error) {
    connectedRuntime.actor = null;
    connectedRuntime.overview = null;
    connectedRuntime.error =
      error.status === 401 ? null : error.message;
  } finally {
    connectedRuntime.loading = false;
    renderConnectedStatus();
    renderConnectedRecovery();
  }
}

async function loadConnectedArrears() {
  if (!connectedRuntime.actor || !connectedRuntime.agreementId) return;
  const agreementId = encodeURIComponent(connectedRuntime.agreementId);
  const partyPath = connectedRuntime.partyId
    ? `/parties/${encodeURIComponent(connectedRuntime.partyId)}`
    : "";
  connectedRuntime.overview = await connectedRequest(
    `/agreements/${agreementId}${partyPath}/contracts/arrears?limit=100`,
  );
}

async function loginConnected(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector("button[type='submit']");
  submit.disabled = true;
  connectedRuntime.error = null;
  try {
    await connectedRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: form.elements.email.value.trim(),
        password: form.elements.password.value,
      }),
    });
    form.elements.password.value = "";
    document.getElementById("connected-login-modal")?.close();
    await loadConnectedSession();
  } catch (error) {
    connectedRuntime.error = error.message;
    renderConnectedStatus();
  } finally {
    submit.disabled = false;
  }
}

async function logoutConnected() {
  try {
    await connectedRequest("/auth/logout", { method: "POST" });
  } finally {
    connectedRuntime.actor = null;
    connectedRuntime.overview = null;
    connectedRuntime.agreementId = null;
    connectedRuntime.partyId = null;
    renderConnectedStatus();
    renderConnectedRecovery();
  }
}

async function changeConnectedAgreement(event) {
  connectedRuntime.agreementId = event.target.value;
  const scope = connectedMembershipScopes(connectedRuntime.actor).find(
    (membership) => membership.agreementId === connectedRuntime.agreementId,
  );
  connectedRuntime.partyId = scope?.partyId || null;
  connectedRuntime.loading = true;
  connectedRuntime.error = null;
  renderConnectedStatus();
  try {
    await loadConnectedArrears();
  } catch (error) {
    connectedRuntime.error = error.message;
  } finally {
    connectedRuntime.loading = false;
    renderConnectedStatus();
    renderConnectedRecovery();
  }
}

function ensureConnectedUi() {
  if (!connectedRuntime.active || document.getElementById("connected-api-status")) return;
  const panel = document.getElementById("contract-arrears-panel");
  if (!panel) return;

  panel.insertAdjacentHTML(
    "afterbegin",
    `<div class="connected-api-status" id="connected-api-status" role="status"></div>`,
  );
  document.body.insertAdjacentHTML(
    "beforeend",
    `
      <dialog class="modal" id="connected-login-modal">
        <form method="dialog" class="modal-content connected-login-form" id="connected-login-form">
          <div class="modal-heading">
            <div>
              <p class="eyebrow">Ambiente local protegido</p>
              <h2>Entrar na API</h2>
            </div>
            <button class="icon-button" value="cancel" type="button" data-close-connected-login title="Fechar">x</button>
          </div>
          <label>E-mail
            <input class="search-input" name="email" type="email" autocomplete="username" required />
          </label>
          <label>Senha
            <input class="search-input" name="password" type="password" autocomplete="current-password" required />
          </label>
          <button class="primary-button wide" value="default" type="submit">Entrar</button>
        </form>
      </dialog>
    `,
  );

  document.getElementById("connected-login-form")?.addEventListener("submit", loginConnected);
  document.querySelector("[data-close-connected-login]")?.addEventListener("click", () => {
    document.getElementById("connected-login-modal")?.close();
  });
}

function renderConnectedStatus() {
  ensureConnectedUi();
  const status = document.getElementById("connected-api-status");
  if (!status) return;

  const agreements = connectedRuntime.agreements.map((agreement) =>
    `<option value="${connectedEscape(agreement.id)}" ${agreement.id === connectedRuntime.agreementId ? "selected" : ""}>${connectedEscape(agreement.name)}</option>`,
  ).join("");

  status.innerHTML = connectedRuntime.actor
    ? `
      <div>
        <strong>API local conectada</strong>
        <span>${connectedRuntime.partyId ? "Escopo da consignataria" : "Escopo amplo do convenio"}</span>
      </div>
      ${agreements ? `<label><span>Convenio</span><select class="select-input" id="connected-agreement">${agreements}</select></label>` : ""}
      <button class="secondary-button" type="button" id="connected-refresh" ${connectedRuntime.loading ? "disabled" : ""}>Atualizar</button>
      <button class="secondary-button" type="button" id="connected-logout">Sair</button>
    `
    : `
      <div>
        <strong>API local ${connectedRuntime.loading ? "verificando..." : "desconectada"}</strong>
        <span>Os dados demonstrativos permanecem separados.</span>
      </div>
      <button class="primary-button" type="button" id="connected-login-open">Entrar</button>
    `;

  if (connectedRuntime.error) {
    status.insertAdjacentHTML("beforeend", `<small class="connected-api-error">${connectedEscape(connectedRuntime.error)}</small>`);
  }
  document.getElementById("connected-login-open")?.addEventListener("click", () => {
    connectedRuntime.error = null;
    document.getElementById("connected-login-modal")?.showModal();
  });
  document.getElementById("connected-logout")?.addEventListener("click", logoutConnected);
  document.getElementById("connected-agreement")?.addEventListener("change", changeConnectedAgreement);
  document.getElementById("connected-refresh")?.addEventListener("click", loadConnectedSession);
}

function connectedVisibleContracts() {
  const contractFilter = document.getElementById("arrears-contract-filter")?.value.trim().toLowerCase() || "";
  const statusFilter = document.getElementById("arrears-status-filter")?.value || "";
  const minAmount = Number(document.getElementById("arrears-min-filter")?.value || 0);
  return (connectedRuntime.overview?.contracts || [])
    .filter((contract) => !contractFilter || contract.contractNumber.toLowerCase().includes(contractFilter))
    .filter((contract) => !statusFilter || contract.status === statusFilter)
    .filter((contract) => Number(contract.arrearsAmount) >= minAmount);
}

function renderConnectedRecovery() {
  ensureConnectedUi();
  renderConnectedStatus();
  const summary = document.getElementById("arrears-summary");
  const list = document.getElementById("arrears-list");
  const lenderFilter = document.getElementById("arrears-lender-filter-wrap");
  if (!summary || !list) return;
  if (lenderFilter) lenderFilter.hidden = true;

  if (!connectedRuntime.actor) {
    summary.innerHTML = "";
    list.innerHTML = `<div class="empty-state">Entre na API local para consultar a carteira real de homologacao.</div>`;
    return;
  }
  if (connectedRuntime.loading && !connectedRuntime.overview) {
    summary.innerHTML = "";
    list.innerHTML = `<div class="empty-state">Consultando dados autorizados...</div>`;
    return;
  }
  if (connectedRuntime.error) {
    summary.innerHTML = "";
    list.innerHTML = `<div class="empty-state">Nao foi possivel carregar a carteira. Verifique a API local.</div>`;
    return;
  }

  const contracts = connectedVisibleContracts();
  const total = contracts.reduce((sum, contract) => sum + Number(contract.arrearsAmount), 0);
  const completed = contracts.filter((contract) => contract.status === "PAYROLL_COMPLETED_WITH_ARREARS");
  const recovered = Number(connectedRuntime.overview?.summary?.recoveredOnOpenContracts?.amount || 0);
  summary.innerHTML = [
    ["Contratos com saldo", contracts.length],
    ["Saldo em atraso", money.format(total)],
    ["Folha concluida", completed.length],
    ["Recuperado", money.format(recovered)],
  ].map(([label, value]) => `<article><span>${label}</span><strong>${value}</strong></article>`).join("");

  list.innerHTML = contracts.length
    ? contracts.map((contract) => {
      const partial = contract.latestPartial;
      return `
        <article class="arrears-row">
          <div class="arrears-row-main">
            <div>
              <span class="arrears-contract-label">Contrato</span>
              <strong>${connectedEscape(contract.contractNumber)}</strong>
              <small>${connectedEscape(contract.party.name)}</small>
            </div>
            <div>
              <span>Saldo em atraso</span>
              <strong class="arrears-amount">${money.format(Number(contract.arrearsAmount))}</strong>
              <small>Parcela atual ${contract.currentInstallment} de ${contract.termInstallments || "-"}</small>
            </div>
            <div>
              <span>Situacao</span>
              <strong>${contract.status === "ACTIVE" ? "Folha ativa" : "Folha concluida"}</strong>
              <small>${connectedEscape(contract.product.name)}</small>
            </div>
          </div>
          ${partial ? `
            <div class="arrears-partial-detail">
              Esperado ${money.format(Number(partial.expectedAmount))};
              descontado ${money.format(Number(partial.discountedAmount))}.
            </div>
          ` : ""}
          <div class="arrears-row-actions">
            <span>Consulta autenticada. Baixas reais serao habilitadas apos a validacao desta etapa.</span>
          </div>
        </article>
      `;
    }).join("")
    : `<div class="empty-state">Nenhum contrato corresponde aos filtros de recuperacao.</div>`;
}

window.margemClaraConnected = {
  isActive: () => connectedRuntime.active,
  renderRecovery: renderConnectedRecovery,
};

if (connectedRuntime.active) {
  ensureConnectedUi();
  renderConnectedStatus();
  loadConnectedSession();
}

const connectedStyle = document.createElement("style");
connectedStyle.textContent = `
  .connected-api-status {
    align-items: center;
    background: #eef7f3;
    border: 1px solid #b8d8ca;
    display: flex;
    gap: 12px;
    justify-content: space-between;
    margin-bottom: 16px;
    padding: 12px;
  }
  .connected-api-status > div,
  .connected-api-status label,
  .connected-login-form label {
    display: grid;
    gap: 4px;
  }
  .connected-api-status span,
  .connected-api-status label span {
    color: #52645c;
    font-size: 12px;
  }
  .connected-api-status label {
    margin-left: auto;
    min-width: 220px;
  }
  .connected-api-error {
    color: #9c2f26;
    width: 100%;
  }
  @media (max-width: 720px) {
    .connected-api-status {
      align-items: stretch;
      flex-direction: column;
    }
    .connected-api-status label {
      margin-left: 0;
      min-width: 0;
    }
  }
`;
document.head.appendChild(connectedStyle);
