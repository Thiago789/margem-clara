if (!pageTitles.contractrules) {
  pageTitles.contractrules = "Regras contratos";
}

function normalizeContractRuleFields() {
  state.conventionPolicy = {
    insertionCutoffDay: 20,
    ...(state.conventionPolicy || {}),
  };

  state.contracts.forEach((contract) => {
    contract.product = contract.product || "Emprestimo consignado";
    contract.contractType = contract.contractType || "Novo";
    contract.currentInstallment = Number(contract.currentInstallment || 0);
  });
}

function contractRulesCurrentCompetency() {
  return state.conventionSettings?.payrollCompetency || today().slice(0, 7);
}

function contractRulesCreatedDay(contract) {
  const sourceDate = contract.createdAt || contract.reservedAt || today();
  const parsed = Number(String(sourceDate).slice(-2));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Number(today().slice(-2));
}

function contractRulesPayrollCode(product) {
  const codes = {
    "Emprestimo consignado": "CONSIG",
    "Cartao consignado": "CARTAO",
    "Cartao beneficio": "BENEF",
  };
  return codes[product] || "CONSIG";
}

function ensureContractRuleFormFields() {
  const form = document.getElementById("contract-form");
  if (!form || document.getElementById("contract-product")) return;

  const installmentLabel = document.getElementById("contract-installment")?.closest("label");
  installmentLabel?.insertAdjacentHTML(
    "beforebegin",
    `
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
    `
  );

  form.addEventListener(
    "submit",
    (event) => {
      if (event.submitter?.value === "cancel") return;
      const product = document.getElementById("contract-product")?.value || "Emprestimo consignado";
      const contractType = document.getElementById("contract-type")?.value || "Novo";
      const existingIds = new Set(state.contracts.map((contract) => contract.id));

      setTimeout(() => {
        const created = state.contracts.find((contract) => !existingIds.has(contract.id));
        if (!created) return;
        created.product = product;
        created.contractType = contractType;
        created.currentInstallment = Number(created.currentInstallment || 0);
        saveState();
        render();
      }, 0);
    },
    true
  );
}

function ensureContractRuleEvents() {
  const generateButton = document.getElementById("generate-insertion");
  if (generateButton && !generateButton.dataset.contractRulesBound) {
    generateButton.dataset.contractRulesBound = "true";
    generateButton.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        generateInsertionFile();
      },
      true
    );
  }
}

function ensureContractTableHeaders() {
  const headerRow = document.querySelector("#contracts-view thead tr");
  if (!headerRow || headerRow.dataset.contractRulesHeaders) return;
  headerRow.dataset.contractRulesHeaders = "true";
  headerRow.innerHTML = `
    <th>Contrato</th>
    <th>Servidor</th>
    <th>Consignataria</th>
    <th>Produto</th>
    <th>Tipo</th>
    <th>Parcela</th>
    <th>Prazo</th>
    <th>Evolucao</th>
    <th>Status</th>
  `;
}

function ensureContractRulesView() {
  if (document.getElementById("contractrules-view")) return;

  const nav = document.querySelector(".nav-list");
  const contractsButton = document.querySelector('[data-view="contracts"]');
  const button = document.createElement("button");
  button.className = "nav-item";
  button.dataset.view = "contractrules";
  button.type = "button";
  button.textContent = "Regras contrato";
  button.addEventListener("click", () => openView("contractrules"));
  nav?.insertBefore(button, contractsButton?.nextSibling || null);

  if (!profileConfig.manager.views.includes("contractrules")) {
    const contractsIndex = profileConfig.manager.views.indexOf("contracts");
    profileConfig.manager.views.splice(contractsIndex >= 0 ? contractsIndex + 1 : profileConfig.manager.views.length, 0, "contractrules");
  }

  document.querySelector(".main-panel")?.insertAdjacentHTML(
    "beforeend",
    `
      <section class="view" id="contractrules-view" aria-labelledby="contractrules-title">
        <div class="section-heading row-heading">
          <div>
            <h2 id="contractrules-title">Regras de contrato e folha</h2>
            <p>Valide data de corte, evolucao de parcelas, liquidacao e tipos de operacao.</p>
          </div>
          <button class="primary-button" id="contractrules-audit-button" type="button">Registrar revisao</button>
        </div>

        <div class="contract-rule-grid" id="contract-rule-grid"></div>

        <div class="content-grid contract-rule-content">
          <section class="panel">
            <div class="panel-heading">
              <h3>Tipos de contrato</h3>
            </div>
            <div class="contract-rule-list" id="contract-type-list"></div>
          </section>

          <section class="panel">
            <div class="panel-heading">
              <h3>Produtos principais</h3>
            </div>
            <div class="contract-rule-list" id="contract-product-list"></div>
          </section>
        </div>
      </section>
    `
  );

  document.getElementById("contractrules-audit-button")?.addEventListener("click", () => {
    auditEvent("Revisao de regras de contrato registrada.", "Regras de contrato");
    saveState();
    render();
    openView("contractrules");
  });
}

function renderContractRulesView() {
  normalizeContractRuleFields();
  ensureContractRuleFormFields();
  ensureContractRuleEvents();
  ensureContractTableHeaders();
  ensureContractRulesView();

  const summary = document.getElementById("contract-rule-grid");
  const types = document.getElementById("contract-type-list");
  const products = document.getElementById("contract-product-list");
  if (!summary || !types || !products) return;

  const liquidated = state.contracts.filter((contract) => contract.status === "Liquidado").length;
  const nearEnd = state.contracts.filter((contract) => Number(contract.installments || 0) - Number(contract.currentInstallment || 0) <= 3).length;
  const cutoffDay = Number(state.conventionPolicy.insertionCutoffDay || 20);
  const competency = contractRulesCurrentCompetency();

  summary.innerHTML = [
    ["Data de corte", `Dia ${cutoffDay}`],
    ["Competencia", competency],
    ["Produtos", "3"],
    ["Tipos", "4"],
    ["Liquidados", liquidated],
    ["A vencer", nearEnd],
  ]
    .map(
      ([label, value]) => `
        <article class="contract-rule-card">
          <span>${label}</span>
          <strong>${value}</strong>
        </article>
      `
    )
    .join("");

  types.innerHTML = [
    ["Novo", "Consome nova margem disponivel."],
    ["Refinanciamento", "Recalcula contrato existente e pode alterar parcela, prazo e valor liberado."],
    ["Portabilidade", "Migra contrato de outra instituicao, exigindo banco origem, saldo e confirmacao."],
    ["Compra de divida", "Quita divida anterior e cria novo contrato com credor original e comprovantes."],
  ]
    .map(([title, text]) => `<div class="contract-rule-note"><strong>${title}</strong><span>${text}</span></div>`)
    .join("");

  products.innerHTML = [
    ["Emprestimo consignado", "Parcela fixa, prazo definido e margem principal."],
    ["Cartao consignado", "Rubrica propria e limite separado quando o convenio exigir."],
    ["Cartao beneficio", "Margem/rubrica propria conforme regra local."],
  ]
    .map(([title, text]) => `<div class="contract-rule-note"><strong>${title}</strong><span>${text}</span></div>`)
    .join("");
}

renderContracts = function renderContractsWithContractRules() {
  normalizeContractRuleFields();
  const visibleContracts =
    state.currentProfile === "lender"
      ? state.contracts.filter((contract) => contract.lenderId === "lender-1")
      : state.contracts;

  const table = document.getElementById("contracts-table");
  if (!table) return;

  table.innerHTML = visibleContracts
    .map((contract) => {
      const employee = employeeById(contract.employeeId);
      const statusClass = contractStatusClass(contract);
      return `
        <tr>
          <td><strong>${contract.id}</strong></td>
          <td>${employee?.name ?? "Servidor removido"}</td>
          <td>${lenderName(contract.lenderId)}</td>
          <td>${contract.product}</td>
          <td>${contract.contractType}</td>
          <td>${money.format(contract.installment)}</td>
          <td>${contract.installments}x</td>
          <td>${contract.currentInstallment || 0}/${contract.installments}</td>
          <td>
            <span class="status ${statusClass}">${contract.status}</span>
            ${contract.returnReason ? `<div class="muted">${contract.returnReason}</div>` : ""}
          </td>
        </tr>
      `;
    })
    .join("");
};

buildInsertionRows = function buildInsertionRowsWithContractRules() {
  normalizeContractRuleFields();
  const cutoffDay = Number(state.conventionPolicy.insertionCutoffDay || 20);
  return state.contracts
    .filter((contract) => marginReservationStatuses.includes(contract.status))
    .filter((contract) => contractRulesCreatedDay(contract) <= cutoffDay)
    .map((contract) => {
      const employee = employeeById(contract.employeeId);
      return {
        contrato: contract.id,
        cpf: employee?.cpf ?? "",
        matricula: employee?.enrollment ?? "",
        produto: contract.product,
        tipo_contrato: contract.contractType,
        rubrica: contractRulesPayrollCode(contract.product),
        parcela: contract.installment.toFixed(2),
        prazo: contract.installments,
        parcela_atual: contract.currentInstallment || 0,
        competencia: contractRulesCurrentCompetency(),
        acao: "INCLUIR",
      };
    });
};

generateInsertionFile = function generateInsertionFileWithContractRules() {
  const reservedCount = state.contracts.filter((contract) => marginReservationStatuses.includes(contract.status)).length;
  const rows = buildInsertionRows();
  const result = document.getElementById("insertion-result");

  if (!rows.length) {
    result.textContent = reservedCount
      ? "Existem reservas pendentes, mas fora da data de corte configurada para esta competencia."
      : "Nenhuma reserva pendente para enviar a folha.";
    return;
  }

  const content = buildCsv(
    ["contrato", "cpf", "matricula", "produto", "tipo_contrato", "rubrica", "parcela", "prazo", "parcela_atual", "competencia", "acao"],
    rows
  );
  const sentContractIds = new Set(rows.map((row) => row.contrato));
  state.contracts.forEach((contract) => {
    if (sentContractIds.has(contract.id)) {
      contract.status = "Enviado para folha";
      contract.sentToPayrollAt = today();
    }
  });

  auditEvent(`Arquivo de insercao gerado com ${rows.length} desconto(s) para a folha.`, "Arquivo de insercao");
  saveState();
  render();
  downloadCsv(`insercao-folha-${today()}.csv`, content);
  result.innerHTML = `
    <strong>Arquivo de insercao gerado</strong>
    <p>${rows.length} desconto(s) enviados para a folha.</p>
    <p>Status atualizado para Enviado para folha.</p>
  `;
};

processReturnCsv = function processReturnCsvWithContractRules(text) {
  const rows = parseCsv(text);
  let processed = 0;
  let discounted = 0;
  let rejected = 0;
  let notFound = 0;
  let liquidated = 0;

  rows.forEach((row) => {
    const contract = state.contracts.find((item) => item.id === row.contrato);
    if (!contract) {
      notFound += 1;
      return;
    }

    const nextStatus = normalizeReturnStatus(row.status);
    contract.status = nextStatus;
    contract.returnReason = row.motivo || "";
    contract.discountedValue = Number(row.valor_descontado || 0);
    contract.returnProcessedAt = today();
    if (nextStatus === "Descontando") {
      contract.currentInstallment = Number(contract.currentInstallment || 0) + 1;
      if (contract.currentInstallment >= Number(contract.installments || 0)) {
        contract.status = "Liquidado";
        contract.liquidatedAt = today();
        liquidated += 1;
      }
    }
    processed += 1;
    if (nextStatus === "Descontando") discounted += 1;
    if (returnIssueStatuses.includes(nextStatus)) rejected += 1;
  });

  auditEvent(
    `Arquivo retorno processado: ${processed} contrato(s), ${discounted} descontado(s), ${rejected} com pendencia, ${liquidated} liquidado(s).`,
    "Arquivo retorno"
  );
  saveState();
  render();
  document.getElementById("return-result").innerHTML = `
    <strong>Retorno processado</strong>
    <p>${rows.length} linha(s) lidas.</p>
    <p>${processed} contrato(s) atualizados, ${discounted} descontado(s), ${rejected} com pendencia.</p>
    <p>${liquidated} contrato(s) liquidado(s) automaticamente.</p>
    <p>${notFound} contrato(s) nao localizado(s).</p>
  `;
};

const contractRuleStyle = document.createElement("style");
contractRuleStyle.textContent = `
  .contract-rule-grid {
    display: grid;
    grid-template-columns: repeat(5, minmax(130px, 1fr));
    gap: 14px;
    margin-bottom: 18px;
  }
  .contract-rule-card,
  .contract-rule-note {
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface-2);
  }
  .contract-rule-card {
    padding: 16px;
    box-shadow: var(--shadow);
  }
  .contract-rule-card span,
  .contract-rule-note span {
    display: block;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.4;
  }
  .contract-rule-card strong {
    display: block;
    margin-top: 8px;
    font-size: 22px;
  }
  .contract-rule-content {
    margin-top: 18px;
  }
  .contract-rule-list {
    display: grid;
    gap: 10px;
  }
  .contract-rule-note {
    padding: 12px;
  }
  .contract-rule-note span {
    margin-top: 4px;
  }
  @media (max-width: 1040px) {
    .contract-rule-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 640px) {
    .contract-rule-grid {
      grid-template-columns: 1fr;
    }
  }
`;
document.head.appendChild(contractRuleStyle);

const renderBeforeContractRules = render;
render = function renderWithContractRules() {
  renderBeforeContractRules();
  renderContractRulesView();
};

render();
