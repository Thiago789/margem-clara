if (typeof generateInsertionFile !== "function") {
  pageTitles.import = "Troca de arquivos";

  const importNavButton = document.querySelector('[data-view="import"]');
  if (importNavButton) importNavButton.textContent = "Troca arquivos";

  const importView = document.getElementById("import-view");
  if (importView && !document.getElementById("exchange-summary")) {
    importView.innerHTML = `
      <div class="section-heading">
        <h2 id="import-title">Troca de arquivos</h2>
        <p>Controle o ciclo com a folha: margem recebida, insercoes enviadas e retorno processado.</p>
      </div>

      <div class="file-flow">
        <article>
          <strong>1. Arquivo de margem</strong>
          <span>Folha envia dados de servidores e base de calculo.</span>
        </article>
        <article>
          <strong>2. Arquivo de insercao</strong>
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
          <p class="muted">Colunas esperadas: nome, cpf, matricula, renda_base, descontos_obrigatorios, status.</p>
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
          <p class="muted">Gera os descontos reservados que devem ser enviados para processamento na folha.</p>
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
          <p class="muted">Colunas esperadas: contrato, status, motivo, valor_descontado.</p>
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
    `;
  }

  const fileExchangeStyle = document.createElement("style");
  fileExchangeStyle.textContent = `
    .file-flow {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 18px;
    }
    .file-flow article,
    .exchange-status-card {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #ffffff;
      padding: 14px;
    }
    .exchange-status-card {
      width: 100%;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    .exchange-status-card:hover {
      border-color: rgba(37, 99, 235, 0.38);
      background: #f8fbff;
    }
    .file-flow span,
    .exchange-status-card span {
      display: block;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.4;
    }
    .exchange-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 18px;
    }
    .exchange-summary {
      margin-top: 18px;
    }
    .exchange-status-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
    }
    .exchange-status-card {
      background: var(--surface-2);
      padding: 12px;
    }
    .exchange-status-card strong {
      display: block;
      margin-top: 4px;
      font-size: 20px;
    }
    .exchange-status-card strong.warning {
      color: var(--accent);
    }
    .exchange-status-card strong.danger {
      color: var(--danger);
    }
    .exchange-status-card p,
    .exchange-status-card small {
      display: block;
      margin: 8px 0 0;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.4;
    }
    .exchange-status-card small {
      font-weight: 700;
    }
    @media (max-width: 1040px) {
      .file-flow,
      .exchange-grid,
      .exchange-status-grid {
        grid-template-columns: 1fr;
      }
    }
  `;
  document.head.appendChild(fileExchangeStyle);

  function csvEscape(value) {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function buildCsv(headers, rows) {
    return [
      headers.join(","),
      ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
    ].join("\n");
  }

  function downloadCsv(filename, content) {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function renderFileExchange() {
    const summary = document.getElementById("exchange-summary");
    if (!summary) return;

    const reserved = state.contracts.filter((contract) => contract.status === "Reservado").length;
    const sent = state.contracts.filter((contract) => contract.status === "Enviado para folha").length;
    const discounted = state.contracts.filter((contract) => contract.status === "Descontando").length;
    const rejected = state.contracts.filter((contract) => ["Rejeitado", "Nao descontado"].includes(contract.status)).length;
    const marginValidation = state.lastMarginValidation;
    const insertionValidation = state.lastInsertionValidation;
    const returnReconciliation = state.lastReturnReconciliation;
    const closingData = typeof getPayrollClosingData === "function" ? getPayrollClosingData() : null;
    const competency = state.conventionSettings?.payrollCompetency || today().slice(0, 7);

    const statusClass = (status) => {
      if (/bloquead|pendenc|aguard|alerta|revis/i.test(status)) return "warning";
      if (/critico|erro/i.test(status)) return "danger";
      return "";
    };

    const stages = [
      {
        label: "Margem",
        target: "validation",
        status: marginValidation?.blocked ? "Bloqueada" : marginValidation?.totalRows ? "Validada" : state.employees.length ? "Base carregada" : "Aguardando arquivo",
        detail: marginValidation
          ? `${marginValidation.totalRows} linha(s), ${marginValidation.critical} erro(s), ${marginValidation.warnings} alerta(s).`
          : `${state.employees.length} servidor(es) disponiveis na base atual.`,
        action: "Validar arquivo",
      },
      {
        label: "Insercao",
        target: reserved ? "import" : "simulation",
        status: insertionValidation?.blocked ? "Bloqueada" : sent ? "Enviada" : reserved ? "Pronta para gerar" : "Sem reserva",
        detail: insertionValidation
          ? `${insertionValidation.totalRows} linha(s), ${insertionValidation.critical} erro(s), ${insertionValidation.warnings} alerta(s).`
          : `${reserved} reserva(s) pronta(s), ${sent} enviada(s) para folha.`,
        action: reserved ? "Gerar remessa" : "Criar reserva",
      },
      {
        label: "Retorno",
        target: "import",
        status: returnReconciliation?.blocked ? "Bloqueado" : returnReconciliation?.totalRows ? "Conciliado" : sent ? "Aguardando retorno" : "Pendente",
        detail: returnReconciliation
          ? `${returnReconciliation.totalRows} linha(s), ${returnReconciliation.ok || 0} ok, ${returnReconciliation.pending || 0} pendente(s).`
          : `${discounted} contrato(s) descontando, ${rejected} com pendencia.`,
        action: "Processar retorno",
      },
      {
        label: "Fechamento",
        target: "closing",
        status: closingData ? closingData.decision : "Aguardando calculo",
        detail: closingData
          ? `${closingData.blockers.length} bloqueio(s), ${closingData.warnings.length} ressalva(s).`
          : `Competencia ${competency} ainda sem decisao consolidada.`,
        action: "Ver fechamento",
      },
    ];

    summary.innerHTML = stages
      .map(
        (stage) => `
          <button class="exchange-status-card" data-target-view="${stage.target}" type="button">
            <span>${stage.label}</span>
            <strong class="${statusClass(stage.status)}">${stage.status}</strong>
            <p>${stage.detail}</p>
            <small>${stage.action}</small>
          </button>
        `
      )
      .join("");

    summary.querySelectorAll(".exchange-status-card").forEach((button) => {
      button.addEventListener("click", () => openView(button.dataset.targetView));
    });
  }

  function buildInsertionRows() {
    return state.contracts
      .filter((contract) => contract.status === "Reservado")
      .map((contract) => {
        const employee = employeeById(contract.employeeId);
        return {
          contrato: contract.id,
          cpf: employee?.cpf ?? "",
          matricula: employee?.enrollment ?? "",
          rubrica: "CONSIG",
          parcela: contract.installment.toFixed(2),
          prazo: contract.installments,
          competencia: today().slice(0, 7),
          acao: "INCLUIR",
        };
      });
  }

  function generateInsertionFile() {
    const rows = buildInsertionRows();
    const result = document.getElementById("insertion-result");

    if (!rows.length) {
      result.textContent = "Nenhuma reserva pendente para enviar a folha.";
      return;
    }

    const content = buildCsv(["contrato", "cpf", "matricula", "rubrica", "parcela", "prazo", "competencia", "acao"], rows);
    state.contracts.forEach((contract) => {
      if (contract.status === "Reservado") {
        contract.status = "Enviado para folha";
        contract.sentToPayrollAt = today();
      }
    });

    state.movements.unshift({
      date: today(),
      text: `Arquivo de insercao gerado com ${rows.length} desconto(s) para a folha.`,
      profile: profileConfig[state.currentProfile]?.label || "Sistema",
      source: "Arquivo de insercao",
    });
    saveState();
    render();
    downloadCsv(`insercao-folha-${today()}.csv`, content);
    result.innerHTML = `
      <strong>Arquivo de insercao gerado</strong>
      <p>${rows.length} desconto(s) enviados para a folha.</p>
      <p>Status atualizado para Enviado para folha.</p>
    `;
  }

  function normalizeReturnStatus(status) {
    const normalized = String(status || "").trim().toUpperCase();
    if (["DESCONTADO", "ACEITO", "OK"].includes(normalized)) return "Descontando";
    if (["REJEITADO", "ERRO", "RECUSADO"].includes(normalized)) return "Rejeitado";
    if (["NAO_DESCONTADO", "NAO DESCONTADO", "PENDENTE"].includes(normalized)) return "Nao descontado";
    return "Pendente";
  }

  function processReturnCsv(text) {
    const rows = parseCsv(text);
    let processed = 0;
    let discounted = 0;
    let rejected = 0;
    let notFound = 0;

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
      processed += 1;
      if (nextStatus === "Descontando") discounted += 1;
      if (["Rejeitado", "Nao descontado"].includes(nextStatus)) rejected += 1;
    });

    state.movements.unshift({
      date: today(),
      text: `Arquivo retorno processado: ${processed} contrato(s), ${discounted} descontado(s), ${rejected} com pendencia.`,
      profile: profileConfig[state.currentProfile]?.label || "Sistema",
      source: "Arquivo retorno",
    });
    saveState();
    render();
    document.getElementById("return-result").innerHTML = `
      <strong>Retorno processado</strong>
      <p>${rows.length} linha(s) lidas.</p>
      <p>${processed} contrato(s) atualizados, ${discounted} descontado(s), ${rejected} com pendencia.</p>
      <p>${notFound} contrato(s) nao localizado(s).</p>
    `;
  }

  const renderContractsBeforeFileExchange = renderContracts;
  renderContracts = function renderContractsWithReturnReason() {
    renderContractsBeforeFileExchange();
    document.querySelectorAll("#contracts-table tr").forEach((row) => {
      const id = row.querySelector("strong")?.textContent;
      const contract = state.contracts.find((item) => item.id === id);
      const status = row.querySelector(".status");
      if (!contract || !status) return;

      status.classList.toggle("warning", contractStatusClass(contract) === "warning");
      status.classList.toggle("danger", contractStatusClass(contract) === "danger");
      if (contract.returnReason && !row.querySelector(".return-reason")) {
        status.insertAdjacentHTML("afterend", `<div class="muted return-reason">${contract.returnReason}</div>`);
      }
    });
  };

  const renderBeforeFileExchange = render;
  render = function renderWithFileExchange() {
    renderBeforeFileExchange();
    renderFileExchange();
  };

  document.getElementById("process-csv")?.addEventListener("click", () => {
    const file = document.getElementById("csv-file").files[0];
    if (!file) {
      document.getElementById("import-result").textContent = "Selecione um arquivo CSV antes de processar.";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => processCsv(String(reader.result));
    reader.readAsText(file, "utf-8");
  });

  document.getElementById("download-sample")?.addEventListener("click", () => {
    const content = "nome,cpf,matricula,renda_base,descontos_obrigatorios,status\nJoao Martins,456.789.012-33,MAT-1004,4100,350,Ativo\nLucia Almeida,567.890.123-44,MAT-1005,6200,720,Ativo\n";
    downloadCsv("arquivo-margem-exemplo.csv", content);
  });

  document.getElementById("download-insertion-sample")?.addEventListener("click", () => {
    const content = buildCsv(
      ["contrato", "cpf", "matricula", "rubrica", "parcela", "prazo", "competencia", "acao"],
      [
        {
          contrato: "RSV-2026-003",
          cpf: "123.456.789-10",
          matricula: "MAT-1001",
          rubrica: "CONSIG",
          parcela: "210.00",
          prazo: "36",
          competencia: today().slice(0, 7),
          acao: "INCLUIR",
        },
      ]
    );
    downloadCsv("insercao-folha-modelo.csv", content);
  });

  document.getElementById("generate-insertion")?.addEventListener("click", generateInsertionFile);

  document.getElementById("download-return-sample")?.addEventListener("click", () => {
    const content = buildCsv(
      ["contrato", "status", "motivo", "valor_descontado"],
      [
        { contrato: "RSV-2026-003", status: "DESCONTADO", motivo: "", valor_descontado: "210.00" },
        { contrato: "RSV-2026-999", status: "REJEITADO", motivo: "Matricula sem vinculo ativo", valor_descontado: "0.00" },
      ]
    );
    downloadCsv("retorno-folha-exemplo.csv", content);
  });

  document.getElementById("process-return")?.addEventListener("click", () => {
    const file = document.getElementById("return-file").files[0];
    if (!file) {
      document.getElementById("return-result").textContent = "Selecione um arquivo retorno antes de processar.";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => processReturnCsv(String(reader.result));
    reader.readAsText(file, "utf-8");
  });

  render();
}
