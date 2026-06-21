if (!pageTitles.competencies) {
  pageTitles.competencies = "Competencias";
}

function currentCompetency() {
  return state.conventionSettings?.payrollCompetency || today().slice(0, 7);
}

function normalizeCompetencyInstallments() {
  state.contracts.forEach((contract) => {
    contract.currentInstallment = Number(contract.currentInstallment || 0);
    contract.installmentHistory = Array.isArray(contract.installmentHistory) ? contract.installmentHistory : [];
  });
}

function hasProcessedCompetency(contract, competency) {
  return contract.installmentHistory.some((item) => item.competency === competency && item.status === "Descontando");
}

function findProcessedCompetency(contract, competency) {
  return contract.installmentHistory.find((item) => item.competency === competency && !item.duplicate);
}

function expectedReturnAmount(contract) {
  return Number(contract.installment || 0);
}

function remainingInstallments(contract) {
  return Math.max(Number(contract.installments || 0) - Number(contract.currentInstallment || 0), 0);
}

function competencyContractStage(contract) {
  if (contract.status === "Liquidado") {
    return {
      label: "Liquidado",
      className: "ok",
      detail: "Prazo final atingido; margem deve estar liberada.",
    };
  }

  if (["Rejeitado", "Nao descontado"].includes(contract.status)) {
    return {
      label: "Pendencia",
      className: "danger",
      detail: contract.returnReason || "Aguardando decisao formal antes de alterar parcela.",
    };
  }

  if (remainingInstallments(contract) <= 3 && Number(contract.installments || 0) > 0) {
    return {
      label: "Reta final",
      className: "warning",
      detail: "Acompanhar proximos retornos para liquidacao automatica.",
    };
  }

  if (contract.status === "Enviado para folha") {
    return {
      label: "Aguardando retorno",
      className: "warning",
      detail: "Contrato enviado e ainda sem baixa confirmada nesta competencia.",
    };
  }

  return {
    label: "Em dia",
    className: "",
    detail: "Evolucao depende de retorno descontado pela folha.",
  };
}

function returnAmountTolerance() {
  return 0.01;
}

function resolveReturnProcessingStatus(contract, row, normalizedStatus, amount) {
  if (normalizedStatus !== "Descontando") {
    return {
      status: normalizedStatus,
      reason: row.motivo || "",
      divergent: false,
    };
  }

  const expected = expectedReturnAmount(contract);
  const difference = Number((amount - expected).toFixed(2));
  if (Math.abs(difference) <= returnAmountTolerance()) {
    return {
      status: normalizedStatus,
      reason: row.motivo || "",
      divergent: false,
      expected,
      difference,
    };
  }

  return {
    status: "Nao descontado",
    reason: row.motivo || `Valor descontado divergente. Esperado ${money.format(expected)}, retornado ${money.format(amount)}.`,
    divergent: true,
    expected,
    difference,
  };
}

function ensureCompetenciesView() {
  if (document.getElementById("competencies-view")) return;

  const nav = document.querySelector(".nav-list");
  const importButton = document.querySelector('[data-view="import"]');
  const button = document.createElement("button");
  button.className = "nav-item";
  button.dataset.view = "competencies";
  button.type = "button";
  button.textContent = "Competencias";
  button.addEventListener("click", () => openView("competencies"));
  nav?.insertBefore(button, importButton?.nextSibling || null);

  if (!profileConfig.manager.views.includes("competencies")) {
    const importIndex = profileConfig.manager.views.indexOf("import");
    profileConfig.manager.views.splice(importIndex >= 0 ? importIndex + 1 : profileConfig.manager.views.length, 0, "competencies");
  }

  document.querySelector(".main-panel")?.insertAdjacentHTML(
    "beforeend",
    `
      <section class="view" id="competencies-view" aria-labelledby="competencies-title">
        <div class="section-heading row-heading">
          <div>
            <h2 id="competencies-title">Competencias e parcelas</h2>
            <p>Controle o que ja foi processado pela folha para evitar retorno duplicado.</p>
          </div>
          <button class="primary-button" id="competencies-audit-button" type="button">Registrar revisao</button>
        </div>

        <div class="competency-grid" id="competency-grid"></div>

        <section class="panel competency-panel">
          <div class="panel-heading">
            <h3>Controle de baixa e liquidacao</h3>
          </div>
          <div class="competency-control-grid" id="competency-control-grid"></div>
        </section>

        <section class="panel competency-panel">
          <div class="panel-heading">
            <h3>Historico por contrato</h3>
          </div>
          <div class="competency-list" id="competency-list"></div>
        </section>
      </section>
    `
  );

  document.getElementById("competencies-audit-button")?.addEventListener("click", () => {
    auditEvent("Revisao de competencias e parcelas registrada.", "Competencias");
    saveState();
    render();
    openView("competencies");
  });
}

function renderCompetenciesView() {
  normalizeCompetencyInstallments();
  ensureCompetenciesView();

  const summary = document.getElementById("competency-grid");
  const control = document.getElementById("competency-control-grid");
  const list = document.getElementById("competency-list");
  if (!summary || !control || !list) return;

  const history = state.contracts.flatMap((contract) =>
    contract.installmentHistory.map((item) => ({ ...item, contractId: contract.id }))
  );
  const discounted = history.filter((item) => item.status === "Descontando").length;
  const rejected = history.filter((item) => ["Rejeitado", "Nao descontado"].includes(item.status)).length;
  const duplicates = history.filter((item) => item.duplicate).length;
  const competencies = new Set(history.map((item) => item.competency)).size;

  summary.innerHTML = [
    ["Competencia atual", currentCompetency()],
    ["Competencias", competencies],
    ["Descontos confirmados", discounted],
    ["Pendencias", rejected],
    ["Duplicidades bloqueadas", duplicates],
  ]
    .map(
      ([label, value]) => `
        <article class="competency-card">
          <span>${label}</span>
          <strong>${value}</strong>
        </article>
      `
    )
    .join("");

  const contractsWithStage = state.contracts.map((contract) => ({
    contract,
    employee: employeeById(contract.employeeId),
    stage: competencyContractStage(contract),
    remaining: remainingInstallments(contract),
  }));
  const pendingContracts = contractsWithStage.filter(({ stage }) => stage.className === "danger").length;
  const nearLiquidation = contractsWithStage.filter(({ stage }) => stage.label === "Reta final").length;
  const totalRemaining = contractsWithStage.reduce((sum, item) => sum + item.remaining, 0);
  const nextAction = pendingContracts
    ? "Resolver pendencias de retorno"
    : nearLiquidation
      ? "Acompanhar liquidacoes proximas"
      : "Aguardar retorno da proxima competencia";

  control.innerHTML = `
    <article class="competency-control-card">
      <span>Parcelas restantes</span>
      <strong>${totalRemaining}</strong>
      <p>Soma do saldo de parcelas dos contratos cadastrados.</p>
    </article>
    <article class="competency-control-card">
      <span>Perto de liquidar</span>
      <strong>${nearLiquidation}</strong>
      <p>Contratos com ate 3 parcelas restantes.</p>
    </article>
    <article class="competency-control-card">
      <span>Acao recomendada</span>
      <strong>${nextAction}</strong>
      <p>Prioridade operacional calculada pela situacao das parcelas.</p>
    </article>
    <div class="competency-control-list">
      ${contractsWithStage
        .map(
          ({ contract, employee, stage, remaining }) => `
            <div class="competency-control-row">
              <div>
                <strong>${contract.id}</strong>
                <span>${employee?.name || "Servidor"} - ${contract.currentInstallment || 0}/${contract.installments || 0}</span>
              </div>
              <span class="status ${stage.className}">${stage.label}</span>
              <span>${remaining} parcela(s) restante(s)</span>
              <p>${stage.detail}</p>
            </div>
          `
        )
        .join("")}
    </div>
  `;

  list.innerHTML = state.contracts
    .map((contract) => {
      const rows = contract.installmentHistory.length
        ? contract.installmentHistory
            .slice()
            .reverse()
            .map(
              (item) => `
                <div class="competency-line">
                  <span>${item.competency}</span>
                  <strong>${item.status}</strong>
                  <span>${money.format(Number(item.amount || 0))}</span>
                  <span>${item.duplicate ? "Duplicado ignorado" : item.reason || "Processado"}</span>
                </div>
              `
            )
            .join("")
        : `<div class="competency-line muted">Nenhum retorno processado para este contrato.</div>`;

      return `
        <article class="competency-row">
          <div>
            <strong>${contract.id}</strong>
            <span>${contract.product || "Emprestimo consignado"} - ${contract.currentInstallment || 0}/${contract.installments}</span>
          </div>
          <div class="competency-lines">${rows}</div>
        </article>
      `;
    })
    .join("");
}

processReturnCsv = function processReturnCsvWithCompetencies(text) {
  normalizeCompetencyInstallments();
  const rows = parseCsv(text);
  let processed = 0;
  let discounted = 0;
  let rejected = 0;
  let notFound = 0;
  let liquidated = 0;
  let duplicated = 0;

  rows.forEach((row) => {
    const contract = state.contracts.find((item) => item.id === row.contrato);
    if (!contract) {
      notFound += 1;
      return;
    }

    const competency = row.competencia || currentCompetency();
    const nextStatus = normalizeReturnStatus(row.status);
    const amount = Number(row.valor_descontado || 0);
    const processing = resolveReturnProcessingStatus(contract, row, nextStatus, amount);

    const existingReturn = findProcessedCompetency(contract, competency);
    if (existingReturn) {
      contract.installmentHistory.push({
        competency,
        status: processing.status,
        amount,
        reason: `Competencia ja processada como ${existingReturn.status}. Registrar ajuste para reprocessar.`,
        duplicate: true,
        previousStatus: existingReturn.status,
        originalStatus: nextStatus,
        divergent: processing.divergent,
        expectedAmount: processing.expected,
        differenceAmount: processing.difference,
        processedAt: today(),
      });
      duplicated += 1;
      return;
    }

    contract.status = processing.status;
    contract.returnReason = processing.reason;
    contract.discountedValue = amount;
    contract.expectedDiscountValue = processing.expected || expectedReturnAmount(contract);
    contract.discountDifference = processing.difference || Number((amount - contract.expectedDiscountValue).toFixed(2));
    contract.returnDivergent = processing.divergent;
    contract.returnProcessedAt = today();
    contract.installmentHistory.push({
      competency,
      status: processing.status,
      amount,
      reason: processing.reason,
      duplicate: false,
      originalStatus: nextStatus,
      divergent: processing.divergent,
      expectedAmount: contract.expectedDiscountValue,
      differenceAmount: contract.discountDifference,
      processedAt: today(),
    });

    if (processing.status === "Descontando") {
      contract.currentInstallment = Number(contract.currentInstallment || 0) + 1;
      discounted += 1;
      if (contract.currentInstallment >= Number(contract.installments || 0)) {
        contract.status = "Liquidado";
        contract.liquidatedAt = today();
        liquidated += 1;
      }
    }

    if (["Rejeitado", "Nao descontado"].includes(processing.status)) rejected += 1;
    processed += 1;
  });

  auditEvent(
    `Arquivo retorno processado por competencia: ${processed} atualizado(s), ${discounted} desconto(s), ${rejected} pendencia(s), ${duplicated} duplicidade(s), ${liquidated} liquidado(s).`,
    "Arquivo retorno"
  );
  saveState();
  render();
  document.getElementById("return-result").innerHTML = `
    <strong>Retorno processado</strong>
    <p>${rows.length} linha(s) lidas.</p>
    <p>${processed} contrato(s) atualizados, ${discounted} desconto(s), ${rejected} pendencia(s).</p>
    <p>${duplicated} retorno(s) duplicado(s) ignorado(s) para evolucao de parcela.</p>
    <p>${liquidated} contrato(s) liquidado(s) automaticamente e ${notFound} nao localizado(s).</p>
  `;
};

const competencyStyle = document.createElement("style");
competencyStyle.textContent = `
  .competency-grid {
    display: grid;
    grid-template-columns: repeat(5, minmax(130px, 1fr));
    gap: 14px;
    margin-bottom: 18px;
  }
  .competency-card,
  .competency-row,
  .competency-line {
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface-2);
  }
  .competency-card {
    padding: 16px;
    box-shadow: var(--shadow);
  }
  .competency-card span,
  .competency-row span,
  .competency-line span {
    display: block;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.4;
  }
  .competency-card strong {
    display: block;
    margin-top: 8px;
    font-size: 22px;
  }
  .competency-list,
  .competency-control-grid,
  .competency-control-list,
  .competency-lines {
    display: grid;
    gap: 10px;
  }
  .competency-control-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    margin-bottom: 4px;
  }
  .competency-control-card,
  .competency-control-row {
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface-2);
    padding: 12px;
  }
  .competency-control-card span,
  .competency-control-card p,
  .competency-control-row span,
  .competency-control-row p {
    color: var(--muted);
    font-size: 13px;
    line-height: 1.4;
    margin: 4px 0 0;
  }
  .competency-control-card strong {
    display: block;
    margin-top: 8px;
    font-size: 20px;
  }
  .competency-control-list {
    grid-column: 1 / -1;
  }
  .competency-control-row {
    display: grid;
    grid-template-columns: 1.2fr 0.6fr 0.7fr 1.4fr;
    gap: 10px;
    align-items: center;
  }
  .competency-control-row p {
    margin: 0;
  }
  .competency-row {
    display: grid;
    gap: 10px;
    padding: 12px;
  }
  .competency-line {
    display: grid;
    grid-template-columns: 0.8fr 0.8fr 0.8fr 1.4fr;
    gap: 10px;
    align-items: center;
    padding: 10px;
  }
  @media (max-width: 1040px) {
    .competency-grid,
    .competency-control-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .competency-line,
    .competency-control-row {
      grid-template-columns: 1fr 1fr;
    }
  }
  @media (max-width: 640px) {
    .competency-grid,
    .competency-control-grid,
    .competency-line,
    .competency-control-row {
      grid-template-columns: 1fr;
    }
  }
`;
document.head.appendChild(competencyStyle);

const renderBeforeCompetencyInstallments = render;
render = function renderWithCompetencyInstallments() {
  renderBeforeCompetencyInstallments();
  renderCompetenciesView();
};

render();
