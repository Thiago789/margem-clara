if (!pageTitles.closing) {
  pageTitles.closing = "Fechamento";
}

if (!profileConfig.manager.views.includes("closing")) {
  const protocolsIndex = profileConfig.manager.views.indexOf("protocols");
  profileConfig.manager.views.splice(protocolsIndex >= 0 ? protocolsIndex + 1 : profileConfig.manager.views.length, 0, "closing");
}

function getPayrollClosingData() {
  const cycle = typeof getPayrollCycleData === "function" ? getPayrollCycleData() : null;
  const validation = typeof getFileValidationMetrics === "function" ? getFileValidationMetrics() : null;
  const protocols = typeof getFileProtocolBatches === "function" ? getFileProtocolBatches() : [];
  const reconciliationRows = typeof getReconciliationRows === "function" ? getReconciliationRows() : [];
  const closingMonth = cycle?.currentMonth || (typeof currentCompetency === "function" ? currentCompetency() : new Date().toISOString().slice(0, 7));

  const reserved = cycle?.reserved || state.contracts.filter((contract) => marginReservationStatuses.includes(contract.status));
  const sent = cycle?.sent || state.contracts.filter((contract) => contract.status === "Enviado para folha");
  const rejected = cycle?.rejected || state.contracts.filter(contractHasReturnIssue);
  const reviewEmployees = cycle?.reviewEmployees || state.employees.filter((employee) => employee.status === "Em revisao");
  const insertionBatchRows = state.contracts.flatMap((contract) =>
    (contract.insertionBatches || [])
      .filter((batch) => batch.competency === closingMonth && batch.status !== "Cancelado")
      .map((batch) => ({ ...batch, contractId: contract.id, contractStatus: contract.status, returnDivergent: contract.returnDivergent }))
  );
  const batchAwaitingReturn = insertionBatchRows.filter((batch) => batch.status === "Enviado");
  const batchReturned = insertionBatchRows.filter((batch) => ["Retornado", "Retorno recebido"].includes(batch.status));
  const batchUnresolved = insertionBatchRows.filter(
    (batch) =>
      ["Pendente", "Divergente", "Retorno duplicado"].includes(batch.status) &&
      (returnIssueStatuses.includes(batch.contractStatus) || batch.returnDivergent || batch.status === "Retorno duplicado")
  );
  const criticalValidation = validation
    ? validation.margin.critical + validation.insertion.critical + validation.returnFile.critical
    : 0;
  const protocolPending = protocols.filter((protocol) => ["Pendente", "Aguardando retorno", "Pronto para gerar"].includes(protocol.status)).length;
  const reconciliationIssues = reconciliationRows.filter((row) => row.hasIssue).length;

  const blockers = [];
  const warnings = [];

  if (criticalValidation) blockers.push([`${criticalValidation} erro(s) critico(s) de validacao`, "Corrigir arquivo ou cadastro antes do fechamento."]);
  if (sent.length) blockers.push([`${sent.length} contrato(s) aguardando retorno`, "Processar retorno da folha ou registrar excecao formal."]);
  if (batchAwaitingReturn.length) blockers.push([`${batchAwaitingReturn.length} item(ns) de lote sem retorno`, "Todo lote enviado precisa ter retorno processado ou excecao formal."]);
  if (batchUnresolved.length) blockers.push([`${batchUnresolved.length} item(ns) de lote com pendencia`, "Resolver divergencia, nao desconto, rejeicao ou duplicidade antes de fechar."]);
  if (reviewEmployees.length) warnings.push([`${reviewEmployees.length} servidor(es) em revisao`, "Conferir vinculo e base de calculo antes de congelar a competencia."]);
  if (reserved.length) warnings.push([`${reserved.length} reserva(s) sem insercao`, "Gerar remessa, cancelar reserva ou carregar para proxima competencia."]);
  if (rejected.length) warnings.push([`${rejected.length} retorno(s) com pendencia`, "Tratar rejeicao, nao desconto ou liberar margem conforme regra."]);
  if (protocolPending) warnings.push([`${protocolPending} protocolo(s) pendente(s)`, "Completar rastreabilidade das remessas da competencia."]);
  if (reconciliationIssues) warnings.push([`${reconciliationIssues} divergencia(s) de conciliacao`, "Conferir valores esperados versus descontados."]);

  const decision = blockers.length ? "Bloquear fechamento" : warnings.length ? "Fechar com ressalva" : "Pode fechar";
  const className = blockers.length ? "danger" : warnings.length ? "warning" : "";

  return {
    month: closingMonth,
    decision,
    className,
    blockers,
    warnings,
    reserved,
    sent,
    rejected,
    reviewEmployees,
    protocolPending,
    reconciliationIssues,
    insertionBatchRows,
    batchAwaitingReturn,
    batchReturned,
    batchUnresolved,
  };
}

function ensurePayrollClosingView() {
  if (document.getElementById("closing-view")) return;

  const nav = document.querySelector(".nav-list");
  const protocolsButton = document.querySelector('[data-view="protocols"]');
  const payrollButton = document.querySelector('[data-view="payroll"]');
  const button = document.createElement("button");
  button.className = "nav-item";
  button.dataset.view = "closing";
  button.type = "button";
  button.textContent = "Fechamento";
  button.addEventListener("click", () => openView("closing"));
  nav?.insertBefore(button, protocolsButton?.nextSibling || payrollButton || null);

  document.querySelector(".main-panel")?.insertAdjacentHTML(
    "beforeend",
    `
      <section class="view" id="closing-view" aria-labelledby="closing-title">
        <div class="section-heading row-heading">
          <div>
            <h2 id="closing-title">Fechamento da competencia</h2>
            <p>Decida se a folha pode ser fechada com base em validacao, retorno, conciliacao e protocolos.</p>
          </div>
          <button class="primary-button" id="closing-audit-button" type="button">Registrar decisao</button>
        </div>

        <section class="closing-decision-panel" id="closing-decision-panel"></section>

        <div class="closing-summary-grid" id="closing-summary-grid"></div>

        <div class="content-grid closing-content">
          <section class="panel">
            <div class="panel-heading">
              <h3>Bloqueios</h3>
            </div>
            <div class="closing-list" id="closing-blockers"></div>
          </section>

          <section class="panel">
            <div class="panel-heading">
              <h3>Ressalvas</h3>
            </div>
            <div class="closing-list" id="closing-warnings"></div>
          </section>
        </div>

        <section class="panel closing-panel">
          <div class="panel-heading">
            <h3>Checklist final</h3>
          </div>
          <div class="closing-checklist" id="closing-checklist"></div>
        </section>
      </section>
    `
  );

  document.getElementById("closing-audit-button")?.addEventListener("click", () => {
    const data = getPayrollClosingData();
    auditEvent(`Decisao de fechamento registrada: ${data.decision}.`, "Fechamento");
    saveState();
    render();
    openView("closing");
  });
}

function renderPayrollClosing() {
  ensurePayrollClosingView();

  const decisionPanel = document.getElementById("closing-decision-panel");
  const summary = document.getElementById("closing-summary-grid");
  const blockers = document.getElementById("closing-blockers");
  const warnings = document.getElementById("closing-warnings");
  const checklist = document.getElementById("closing-checklist");
  if (!decisionPanel || !summary || !blockers || !warnings || !checklist) return;

  const data = getPayrollClosingData();

  decisionPanel.innerHTML = `
    <div>
      <span>Competencia ${data.month}</span>
      <strong>${data.decision}</strong>
      <p>${data.blockers.length ? "Existem bloqueios que impedem o fechamento operacional." : data.warnings.length ? "Pode seguir apenas com aceite formal das ressalvas." : "Fluxo apto para congelar a competencia."}</p>
    </div>
    <span class="status ${data.className}">${data.decision}</span>
  `;

  summary.innerHTML = [
    ["Reservas abertas", data.reserved.length],
    ["Aguardando retorno", data.sent.length],
    ["Pendencias retorno", data.rejected.length],
    ["Servidores em revisao", data.reviewEmployees.length],
    ["Itens em lote", data.insertionBatchRows.length],
    ["Lote retornado", data.batchReturned.length],
  ]
    .map(
      ([label, value]) => `
        <article class="closing-summary-card">
          <span>${label}</span>
          <strong>${value}</strong>
        </article>
      `
    )
    .join("");

  blockers.innerHTML = data.blockers.length
    ? data.blockers.map(([title, detail]) => `<div class="closing-note"><strong>${title}</strong><span>${detail}</span></div>`).join("")
    : `<div class="closing-note"><strong>Sem bloqueios criticos</strong><span>Nenhuma regra impeditiva foi encontrada na demonstracao atual.</span></div>`;

  warnings.innerHTML = data.warnings.length
    ? data.warnings.map(([title, detail]) => `<div class="closing-note"><strong>${title}</strong><span>${detail}</span></div>`).join("")
    : `<div class="closing-note"><strong>Sem ressalvas</strong><span>A competencia esta limpa para fechamento no MVP.</span></div>`;

  checklist.innerHTML = [
    ["Arquivo de margem validado", data.reviewEmployees.length ? "Conferir" : "Ok"],
    ["Insercao enviada ou justificada", data.reserved.length ? "Conferir" : "Ok"],
    ["Retorno processado", data.sent.length ? "Pendente" : "Ok"],
    ["Lotes conciliados", data.batchAwaitingReturn.length || data.batchUnresolved.length ? "Pendente" : "Ok"],
    ["Conciliacao revisada", data.reconciliationIssues ? "Conferir" : "Ok"],
    ["Protocolos completos", data.protocolPending ? "Conferir" : "Ok"],
    ["Auditoria registrada", "Ok"],
  ]
    .map(([label, status]) => `<div class="closing-check"><span>${label}</span><strong class="status ${status === "Ok" ? "" : status === "Pendente" ? "danger" : "warning"}">${status}</strong></div>`)
    .join("");
}

const payrollClosingStyle = document.createElement("style");
payrollClosingStyle.textContent = `
  .closing-decision-panel,
  .closing-summary-card,
  .closing-note,
  .closing-check {
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface-2);
  }
  .closing-decision-panel {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 16px;
    align-items: center;
    padding: 18px;
    margin-bottom: 18px;
    box-shadow: var(--shadow);
  }
  .closing-decision-panel span,
  .closing-decision-panel p,
  .closing-summary-card span,
  .closing-note span,
  .closing-check span {
    display: block;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.4;
  }
  .closing-decision-panel strong {
    display: block;
    margin-top: 6px;
    font-size: 30px;
  }
  .closing-decision-panel p {
    margin: 8px 0 0;
  }
  .closing-summary-grid {
    display: grid;
    grid-template-columns: repeat(6, minmax(130px, 1fr));
    gap: 14px;
    margin-bottom: 18px;
  }
  .closing-summary-card {
    padding: 16px;
  }
  .closing-summary-card strong {
    display: block;
    margin-top: 8px;
    font-size: 24px;
  }
  .closing-content,
  .closing-panel {
    margin-top: 18px;
  }
  .closing-list,
  .closing-checklist {
    display: grid;
    gap: 10px;
  }
  .closing-note,
  .closing-check {
    padding: 12px;
  }
  .closing-note span {
    margin-top: 4px;
  }
  .closing-check {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 12px;
    align-items: center;
  }
  @media (max-width: 1040px) {
    .closing-summary-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 640px) {
    .closing-decision-panel,
    .closing-summary-grid,
    .closing-check {
      grid-template-columns: 1fr;
    }
  }
`;
document.head.appendChild(payrollClosingStyle);

const renderBeforePayrollClosing = render;
render = function renderWithPayrollClosing() {
  renderBeforePayrollClosing();
  renderPayrollClosing();
};

render();
