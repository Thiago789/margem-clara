if (!pageTitles.competencies) {
  pageTitles.competencies = "Competencias";
}

function currentCompetency() {
  return today().slice(0, 7);
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
  const list = document.getElementById("competency-list");
  if (!summary || !list) return;

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

    if (nextStatus === "Descontando" && hasProcessedCompetency(contract, competency)) {
      contract.installmentHistory.push({
        competency,
        status: nextStatus,
        amount,
        reason: "Retorno ja processado para esta competencia",
        duplicate: true,
        processedAt: today(),
      });
      duplicated += 1;
      return;
    }

    contract.status = nextStatus;
    contract.returnReason = row.motivo || "";
    contract.discountedValue = amount;
    contract.returnProcessedAt = today();
    contract.installmentHistory.push({
      competency,
      status: nextStatus,
      amount,
      reason: row.motivo || "",
      duplicate: false,
      processedAt: today(),
    });

    if (nextStatus === "Descontando") {
      contract.currentInstallment = Number(contract.currentInstallment || 0) + 1;
      discounted += 1;
      if (contract.currentInstallment >= Number(contract.installments || 0)) {
        contract.status = "Liquidado";
        contract.liquidatedAt = today();
        liquidated += 1;
      }
    }

    if (["Rejeitado", "Nao descontado"].includes(nextStatus)) rejected += 1;
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
  .competency-lines {
    display: grid;
    gap: 10px;
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
    .competency-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .competency-line {
      grid-template-columns: 1fr 1fr;
    }
  }
  @media (max-width: 640px) {
    .competency-grid,
    .competency-line {
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
