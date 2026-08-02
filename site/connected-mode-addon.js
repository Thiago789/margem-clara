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
        …9448 tokens truncated… <strong>2. Arquivo de insercao</strong>
              <span>Margem Clara envia descontos para entrar na folha.</span>
            </article>
            <article>
              <strong>3. Arquivo retorno</strong>
              <span>Folha informa o que foi descontado ou rejeitado.</span>
            </article>
          </div>

          <div class="exchange-grid">
            <section class="panel">
              <div class="panel-heading">
                <h3>Arquivo de margem</h3>
              </div>
              <p class="muted">
                Colunas esperadas: nome, cpf, matricula, renda_base, descontos_obrigatorios, status.
              </p>
              <input id="csv-file" class="file-input" type="file" accept=".csv,text/csv" />
              <div class="button-row">
                <button class="secondary-button" id="download-sample" type="button">Baixar exemplo</button>
                <button class="primary-button" id="process-csv" type="button">Processar folha</button>
              </div>
              <div id="import-result" class="import-result">Nenhum arquivo de margem processado ainda.</div>
            </section>

            <section class="panel">
              <div class="panel-heading">
                <h3>Arquivo de insercao</h3>
              </div>
              <p class="muted">
                Gera os descontos reservados que devem ser enviados para processamento na folha.
              </p>
              <div class="button-row">
                <button class="secondary-button" id="download-insertion-sample" type="button">Modelo</button>
                <button class="primary-button" id="generate-insertion" type="button">Gerar insercao</button>
              </div>
              <div id="insertion-result" class="import-result">Nenhuma insercao gerada ainda.</div>
            </section>

            <section class="panel">
              <div class="panel-heading">
                <h3>Arquivo retorno</h3>
              </div>
              <p class="muted">
                Colunas esperadas: contrato, competencia, status, motivo, valor_descontado.
              </p>
              <input id="return-file" class="file-input" type="file" accept=".csv,text/csv" />
              <div class="button-row">
                <button class="secondary-button" id="download-return-sample" type="button">Baixar exemplo</button>
                <button class="primary-button" id="process-return" type="button">Processar retorno</button>
              </div>
              <div id="return-result" class="import-result">Nenhum retorno processado ainda.</div>
            </section>
          </div>

          <section class="panel exchange-summary">
            <div class="panel-heading">
              <h3>Situacao da competencia</h3>
            </div>
            <div class="exchange-status-grid" id="exchange-summary"></div>
          </section>
        </section>

        <section class="view" id="simulation-view" aria-labelledby="simulation-title">
          <div class="section-heading">
            <h2 id="simulation-title">Simulacao e ranking</h2>
            <p>Compare ofertas pelo valor de parcela e taxa.</p>
          </div>

          <div class="simulation-layout">
            <form class="panel form-grid" id="simulation-form">
              <label>
                Servidor
                <select id="simulation-employee" class="select-input"></select>
              </label>
              <label>
                Produto
                <select id="simulation-product" class="select-input">
                  <option>Emprestimo consignado</option>
                  <option>Cartao consignado</option>
                  <option>Cartao beneficio</option>
                </select>
              </label>
              <label>
                Valor desejado
                <input id="simulation-amount" class="text-input" type="number" min="0" step="100" value="5000" />
              </label>
              <label>
                Prazo
                <input id="simulation-installments" class="text-input" type="number" min="1" max="120" value="48" />
              </label>
              <button class="primary-button wide" type="submit">Simular</button>
            </form>

            <section class="panel">
              <div class="panel-heading">
                <h3>Ranking de taxas</h3>
              </div>
              <div id="ranking-list" class="ranking-list"></div>
            </section>
          </div>
        </section>

        <section class="view" id="authorizations-view" aria-labelledby="authorizations-title">
          <div class="section-heading row-heading">
            <div>
              <h2 id="authorizations-title">Autorizacoes</h2>
              <p>Gere codigos temporarios para consulta, reserva e confirmacao.</p>
            </div>
            <button class="primary-button" id="new-authorization-open" type="button">Gerar codigo</button>
          </div>

          <div class="content-grid">
            <section class="panel">
              <div class="panel-heading">
                <h3>Politica do convenio</h3>
              </div>
              <div class="policy-grid">
                <label class="toggle-row">
                  <input id="policy-require-margin-consult-code" type="checkbox" />
                  <span>Exigir autorizacao para consulta de margem</span>
                </label>
                <label class="toggle-row">
                  <input id="policy-require-reservation-code" type="checkbox" />
                  <span>Exigir codigo para reserva</span>
                </label>
                <label>
                  Validade do codigo
                  <select id="policy-code-validity" class="select-input">
                    <option value="2">2 horas</option>
                    <option value="12">12 horas</option>
                    <option value="24">24 horas</option>
                    <option value="48">48 horas</option>
                  </select>
                </label>
              </div>
              <p class="muted" id="policy-summary"></p>
            </section>

            <section class="panel">
              <div class="panel-heading">
                <h3>Codigos ativos</h3>
              </div>
              <div class="authorization-list" id="authorization-list"></div>
            </section>

            <section class="panel">
              <div class="panel-heading">
                <h3>Como entra no fluxo</h3>
              </div>
              <div class="flow-list">
                <div><strong>1. Servidor gera o codigo</strong><span>Escolhe a finalidade e a matricula.</span></div>
                <div><strong>2. Consignataria usa o codigo</strong><span>Consulta margem ou cria reserva autorizada.</span></div>
                <div><strong>3. Sistema audita tudo</strong><span>Uso unico, validade curta e historico da operacao.</span></div>
              </div>
            </section>
          </div>
        </section>

        <section class="view" id="tickets-view" aria-labelledby="tickets-title">
          <div class="section-heading row-heading">
            <div>
              <h2 id="tickets-title">Suporte e contestacao</h2>
              <p>Registre contestacoes de margem e duvidas de contrato.</p>
            </div>
            <button class="primary-button" id="new-ticket-open" type="button">Novo ticket</button>
          </div>
          <div class="ticket-list" id="ticket-list"></div>
        </section>

        <section class="view" id="audit-view" aria-labelledby="audit-title">
          <div class="section-heading">
            <h2 id="audit-title">Auditoria</h2>
            <p>Trilha operacional das acoes que afetam margem, contratos, autorizacoes e suporte.</p>
          </div>
          <div class="table-panel">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Evento</th>
                  <th>Perfil</th>
                  <th>Origem</th>
                </tr>
              </thead>
              <tbody id="audit-table"></tbody>
            </table>
          </div>
        </section>
      </main>
    </div>

    <dialog class="modal" id="employee-modal">
      <form method="dialog" class="modal-content" id="employee-form">
        <div class="modal-heading">
          <h2>Novo servidor</h2>
          <button class="icon-button" data-close-modal value="cancel" type="button" title="Fechar">x</button>
        </div>
        <label>Nome <input class="text-input" id="employee-name" required /></label>
        <label>CPF <input class="text-input" id="employee-cpf" required /></label>
        <label>Matricula <input class="text-input" id="employee-enrollment" required /></label>
        <label>Renda base <input class="text-input" id="employee-income" type="number" step="0.01" required /></label>
        <label>Descontos obrigatorios <input class="text-input" id="employee-deductions" type="number" step="0.01" value="0" /></label>
        <button class="primary-button wide" value="default" type="submit">Salvar servidor</button>
      </form>
    </dialog>

    <dialog class="modal" id="contract-modal">
      <form method="dialog" class="modal-content" id="contract-form">
        <div class="modal-heading">
          <h2>Nova reserva</h2>
          <button class="icon-button" data-close-modal value="cancel" type="button" title="Fechar">x</button>
        </div>
        <label>Servidor <select id="contract-employee" class="select-input"></select></label>
        <label>Consignataria <select id="contract-lender" class="select-input"></select></label>
        <label>
          Produto
          <select id="contract-product" class="select-input">
            <option>Emprestimo consignado</option>
            <option>Cartao consignado</option>
            <option>Cartao beneficio</option>
          </select>
        </label>
        <label>
          Tipo de contrato
          <select id="contract-type" class="select-input">
            <option>Novo</option>
            <option>Refinanciamento</option>
            <option>Portabilidade</option>
            <option>Compra de divida</option>
          </select>
        </label>
        <label>Valor da parcela <input id="contract-installment" class="text-input" type="number" step="0.01" required /></label>
        <label>Prazo <input id="contract-installments" class="text-input" type="number" min="1" value="48" required /></label>
        <button class="primary-button wide" value="default" type="submit">Criar reserva</button>
      </form>
    </dialog>

    <dialog class="modal" id="ticket-modal">
      <form method="dialog" class="modal-content" id="ticket-form">
        <div class="modal-heading">
          <h2>Novo ticket</h2>
          <button class="icon-button" data-close-modal value="cancel" type="button" title="Fechar">x</button>
        </div>
        <label>Servidor <select id="ticket-employee" class="select-input"></select></label>
        <label>Tipo
          <select id="ticket-type" class="select-input">
            <option value="Contestacao de margem">Contestacao de margem</option>
            <option value="Duvida sobre contrato">Duvida sobre contrato</option>
            <option value="Contrato desconhecido">Contrato desconhecido</option>
            <option value="Erro de desconto">Erro de desconto</option>
          </select>
        </label>
        <label>Descricao <textarea id="ticket-description" class="textarea-input" required></textarea></label>
        <button class="primary-button wide" value="default" type="submit">Abrir ticket</button>
      </form>
    </dialog>

    <dialog class="modal" id="authorization-modal">
      <form method="dialog" class="modal-content" id="authorization-form">
        <div class="modal-heading">
          <h2>Gerar autorizacao</h2>
          <button class="icon-button" data-close-modal value="cancel" type="button" title="Fechar">x</button>
        </div>
        <label>Servidor <select id="authorization-employee" class="select-input"></select></label>
        <label>Finalidade
          <select id="authorization-purpose" class="select-input">
            <option value="Consulta de margem">Consulta de margem</option>
            <option value="Reserva de margem">Reserva de margem</option>
            <option value="Confirmacao de contrato">Confirmacao de contrato</option>
          </select>
        </label>
        <button class="primary-button wide" value="default" type="submit">Gerar codigo</button>
      </form>
    </dialog>

    <script src="app.js"></script>
    <script src="audit-addon.js?v=20260724-01"></script>
  </body>
</html>

