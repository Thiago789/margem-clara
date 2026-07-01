if (!pageTitles.protocols) {
  pageTitles.protocols = "Protocolos";
}

if (!profileConfig.manager.views.includes("protocols")) {
  const reconciliationIndex = profileConfig.manager.views.indexOf("reconciliation");
  profileConfig.manager.views.splice(reconciliationIndex >= 0 ? reconciliationIndex + 1 : profileConfig.manager.views.length, 0, "protocols");
}

function getFileProtocolBatches() {
  const month = new Date().toISOString().slice(0, 7);
  const importedEmployees = state.employees.length;
  const reserved = state.contracts.filter((contract) => marginReservationStatuses.includes(contract.status));
  const sent = state.contracts.filter((contract) => contract.status === "Enviado para folha");
  const returned = state.contracts.filter((contract) => contract.status === "Descontando" || contractHasReturnIssue(contract));
  const rejected = state.contracts.filter(contractHasReturnIssue);
  const marginValidation = state.lastMarginValidation;
  const insertionValidation = state.lastInsertionValidation;
  const returnReconciliation = state.lastReturnReconciliation;
  const competency = state.conventionSettings?.payrollCompetency || month;

  return [
    {
      id: `MRG-${competency}-001`,
      type: "Arquivo de margem",
      direction: "Folha -> Margem Clara",
      layout: "MARGEM v1.1",
      status: marginValidation?.blocked ? "Bloqueado" : marginValidation?.totalRows ? "Processado" : importedEmployees ? "Processado" : "Pendente",
      records: marginValidation?.totalRows ?? importedEmployees,
      amount: state.employees.reduce((total, employee) => total + Number(employee.income || 0), 0),
      critical: marginValidation?.critical || 0,
      warnings: marginValidation?.warnings || 0,
      evidence: marginValidation
        ? `${marginValidation.totalRows} linha(s), ${marginValidation.critical} erro(s), ${marginValidation.warnings} alerta(s).`
        : "Hash, competencia, layout, usuario e resumo de validacao.",
      issue: marginValidation?.blocked
        ? "Arquivo de margem bloqueado por validacao critica."
        : importedEmployees
          ? "Sem bloqueio critico na demo atual."
          : "Aguardando arquivo da folha.",
    },
    {
      id: `INS-${competency}-001`,
      type: "Arquivo de insercao",
      direction: "Margem Clara -> Folha",
      layout: "INSERCAO v1.2",
      status: insertionValidation?.blocked ? "Bloqueado" : sent.length ? "Enviado" : reserved.length ? "Pronto para gerar" : "Sem movimento",
      records: insertionValidation?.totalRows ?? (sent.length || reserved.length),
      amount: [...sent, ...reserved].reduce((total, contract) => total + Number(contract.installment || 0), 0),
      critical: insertionValidation?.critical || 0,
      warnings: insertionValidation?.warnings || 0,
      evidence: insertionValidation
        ? `${insertionValidation.totalRows} linha(s), ${insertionValidation.critical} erro(s), ${insertionValidation.warnings} alerta(s).`
        : "Reservas, rubricas, competencia, usuario gerador e arquivo entregue.",
      issue: insertionValidation?.blocked
        ? "Arquivo de insercao bloqueado antes de sair para a folha."
        : reserved.length
          ? "Existem reservas que ainda podem virar remessa."
          : "Nenhuma reserva pendente.",
    },
    {
      id: `RET-${competency}-001`,
      type: "Arquivo retorno",
      direction: "Folha -> Margem Clara",
      layout: "RETORNO v1.1",
      status: returnReconciliation?.blocked
        ? "Bloqueado"
        : returned.length
          ? (rejected.length || returnReconciliation?.divergent || returnReconciliation?.pending ? "Processado com pendencia" : "Conciliado")
          : sent.length ? "Aguardando retorno" : "Pendente",
      records: returnReconciliation?.totalRows ?? returned.length,
      amount: returned.reduce((total, contract) => total + Number(contract.discountedValue || contract.installment || 0), 0),
      critical: Number(returnReconciliation?.invalid || 0) + Number(returnReconciliation?.notFound || 0) + Number(returnReconciliation?.duplicate || 0),
      warnings: Number(returnReconciliation?.divergent || 0) + Number(returnReconciliation?.pending || 0),
      evidence: returnReconciliation
        ? `${returnReconciliation.totalRows} linha(s), ${returnReconciliation.ok} conciliada(s), ${returnReconciliation.divergent} divergente(s), ${returnReconciliation.duplicate} duplicada(s).`
        : "Status por contrato, motivo, valor descontado e divergencias.",
      issue: returnReconciliation?.blocked
        ? "Retorno bloqueado por erro critico antes de alterar contratos."
        : rejected.length
          ? `${rejected.length} contrato(s) exigem tratamento.`
          : "Sem rejeicoes processadas na demo atual.",
    },
  ];
}

function getProtocolStatusClass(status) {
  if (["Processado com pendencia", "Aguardando retorno", "Pronto para gerar"].includes(status)) return "warning";
  if (["Pendente", "Bloqueado"].includes(status)) return "danger";
  return "";
}

function recordFileProtocolSnapshot() {
  const batches = getFileProtocolBatches();
  const pending = batches.filter((batch) => ["Pendente", "Aguardando retorno", "Pronto para gerar"].includes(batch.status)).length;
  const issues = batches.filter((batch) => ["Processado com pendencia", "Bloqueado"].includes(batch.status)).length;
  const records = batches.reduce((total, batch) => total + Number(batch.records || 0), 0);
  const amount = batches.reduce((total, batch) => total + Number(batch.amount || 0), 0);
  const competency = state.conventionSettings?.payrollCompetency || new Date().toISOString().slice(0, 7);

  state.lastFileProtocol = {
    processedAt: today(),
    competency,
    totalBatches: batches.length,
    records,
    amount,
    pending,
    issues,
    status: issues ? "Com pendencia" : pending ? "Parcial" : "Registrado",
    batches: batches.map((batch) => ({
      id: batch.id,
      type: batch.type,
      direction: batch.direction,
      layout: batch.layout,
      status: batch.status,
      records: batch.records,
      amount: batch.amount,
      critical: batch.critical,
      warnings: batch.warnings,
      evidence: batch.evidence,
    })),
  };

  auditEvent(
    `Protocolo de remessa registrado: ${batches.length} lote(s), ${records} registro(s), ${pending} pendencia(s), ${issues} divergencia(s).`,
    "Protocolos de arquivo"
  );
  saveState();
  render();
  openView("protocols");
}

function ensureFileProtocolView() {
  if (document.getElementById("protocols-view")) return;

  const nav = document.querySelector(".nav-list");
  const reconciliationButton = document.querySelector('[data-view="reconciliation"]');
  const payrollButton = document.querySelector('[data-view="payroll"]');
  const button = document.createElement("button");
  button.className = "nav-item";
  button.dataset.view = "protocols";
  button.type = "button";
  button.textContent = "Protocolos";
  button.addEventListener("click", () => openView("protocols"));
  nav?.insertBefore(button, reconciliationButton?.nextSibling || payrollButton || null);

  document.querySelector(".main-panel")?.insertAdjacentHTML(
    "beforeend",
    `
      <section class="view" id="protocols-view" aria-labelledby="protocols-title">
        <div class="section-heading row-heading">
          <div>
            <h2 id="protocols-title">Protocolos de arquivos da competencia</h2>
            <p>Rastreie cada remessa: margem recebida, insercao enviada e retorno processado.</p>
          </div>
          <button class="primary-button" id="protocols-audit-button" type="button">Registrar protocolo</button>
        </div>

        <div class="protocol-summary-grid" id="protocol-summary-grid"></div>

        <section class="panel protocol-panel">
          <div class="panel-heading">
            <h3>Linha do tempo de remessas</h3>
          </div>
          <div class="protocol-list" id="protocol-list"></div>
        </section>

        <div class="content-grid protocol-content">
          <section class="panel">
            <div class="panel-heading">
              <h3>Evidencias obrigatorias</h3>
            </div>
            <div class="protocol-note-list" id="protocol-evidence-list"></div>
          </section>

          <section class="panel">
            <div class="panel-heading">
              <h3>Governanca do piloto</h3>
            </div>
            <div class="protocol-note-list" id="protocol-governance-list"></div>
          </section>
        </div>
      </section>
    `
  );

  document.getElementById("protocols-audit-button")?.addEventListener("click", recordFileProtocolSnapshot);
}

function renderFileProtocols() {
  ensureFileProtocolView();

  const summary = document.getElementById("protocol-summary-grid");
  const list = document.getElementById("protocol-list");
  const evidence = document.getElementById("protocol-evidence-list");
  const governance = document.getElementById("protocol-governance-list");
  if (!summary || !list || !evidence || !governance) return;

  const batches = getFileProtocolBatches();
  const pending = batches.filter((batch) => ["Pendente", "Aguardando retorno", "Pronto para gerar"].includes(batch.status)).length;
  const issues = batches.filter((batch) => batch.status === "Processado com pendencia").length;
  const records = batches.reduce((total, batch) => total + batch.records, 0);
  const lastProtocol = state.lastFileProtocol;

  summary.innerHTML = [
    { label: "Remessas", value: batches.length },
    { label: "Registros", value: records },
    { label: "Pendencias", value: pending },
    { label: "Com divergencia", value: issues },
    {
      label: "Ultimo protocolo",
      value: lastProtocol ? lastProtocol.status : "Pendente",
      detail: lastProtocol
        ? `${lastProtocol.processedAt} - ${lastProtocol.totalBatches} lote(s), ${lastProtocol.records} registro(s).`
        : "Clique em Registrar protocolo para congelar o snapshot da competencia.",
    },
  ]
    .map(
      (item) => `
        <article class="protocol-summary-card">
          <span>${item.label}</span>
          <strong>${item.value}</strong>
          ${item.detail ? `<small>${item.detail}</small>` : ""}
        </article>
      `
    )
    .join("");

  list.innerHTML = batches
    .map(
      (batch) => `
        <article class="protocol-row">
          <div>
            <strong>${batch.id}</strong>
            <span>${batch.type}</span>
          </div>
          <div>
            <span>Fluxo</span>
            <strong>${batch.direction}</strong>
          </div>
          <div>
            <span>Layout</span>
            <strong>${batch.layout}</strong>
          </div>
          <span class="status ${getProtocolStatusClass(batch.status)}">${batch.status}</span>
          <p><strong>Resumo:</strong> ${batch.records} registro(s), total de ${formatMoney(batch.amount)}.</p>
          <p><strong>Validacao:</strong> ${batch.critical} erro(s) critico(s), ${batch.warnings} alerta(s).</p>
          <p><strong>Evidencia:</strong> ${batch.evidence}</p>
          <p><strong>Ponto de atencao:</strong> ${batch.issue}</p>
        </article>
      `
    )
    .join("");

  evidence.innerHTML = `
    <div class="protocol-note">
      <strong>Identificador unico</strong>
      <span>Cada arquivo precisa de protocolo, competencia, convenio, versao de layout e usuario responsavel.</span>
    </div>
    <div class="protocol-note">
      <strong>Integridade do arquivo</strong>
      <span>Na V1 real, guardar hash do arquivo original e do arquivo gerado para conferir alteracoes.</span>
    </div>
    <div class="protocol-note">
      <strong>Resumo de processamento</strong>
      <span>Registrar linhas lidas, aceitas, rejeitadas, valores totais e motivos principais.</span>
    </div>
  `;

  governance.innerHTML = `
    <div class="protocol-note">
      <strong>Nao sobrescrever competencia fechada</strong>
      <span>Reprocessamento deve virar ajuste auditado, nunca alteracao silenciosa do passado.</span>
    </div>
    <div class="protocol-note">
      <strong>Homologar antes de operar</strong>
      <span>Convenio piloto precisa aprovar layout de margem, insercao e retorno antes de usar dados reais.</span>
    </div>
    <div class="protocol-note">
      <strong>Separar ambiente de teste</strong>
      <span>Arquivos de homologacao nao devem misturar com producao quando o backend existir.</span>
    </div>
  `;
}

const fileProtocolStyle = document.createElement("style");
fileProtocolStyle.textContent = `
  .protocol-summary-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(150px, 1fr));
    gap: 14px;
    margin-bottom: 18px;
  }
  .protocol-summary-card,
  .protocol-row,
  .protocol-note {
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface-2);
  }
  .protocol-summary-card {
    padding: 16px;
    box-shadow: var(--shadow);
  }
  .protocol-summary-card span,
  .protocol-summary-card small,
  .protocol-row span,
  .protocol-row p,
  .protocol-note span {
    display: block;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.4;
  }
  .protocol-summary-card strong {
    display: block;
    margin-top: 8px;
    font-size: 24px;
  }
  .protocol-summary-card small {
    display: block;
    margin-top: 6px;
  }
  .protocol-panel,
  .protocol-content {
    margin-top: 18px;
  }
  .protocol-list,
  .protocol-note-list {
    display: grid;
    gap: 10px;
  }
  .protocol-row {
    display: grid;
    grid-template-columns: 1fr 1fr 0.7fr auto;
    gap: 12px;
    align-items: center;
    padding: 12px;
  }
  .protocol-row p {
    grid-column: 1 / -1;
    margin: 0;
  }
  .protocol-row p strong {
    color: var(--text);
    font-size: 13px;
  }
  .protocol-note {
    padding: 12px;
  }
  .protocol-note span {
    margin-top: 4px;
  }
  @media (max-width: 1040px) {
    .protocol-summary-grid,
    .protocol-row {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 640px) {
    .protocol-summary-grid,
    .protocol-row {
      grid-template-columns: 1fr;
    }
  }
`;
document.head.appendChild(fileProtocolStyle);

const renderBeforeFileProtocols = render;
render = function renderWithFileProtocols() {
  renderBeforeFileProtocols();
  renderFileProtocols();
};

render();
