if (!pageTitles.assistant) {
  pageTitles.assistant = "Assistente";
}

["manager", "employee", "lender"].forEach((profile) => {
  if (!profileConfig[profile].views.includes("assistant")) {
    const dashboardIndex = profileConfig[profile].views.indexOf("dashboard");
    profileConfig[profile].views.splice(dashboardIndex + 1, 0, "assistant");
  }
});

function ensureAssistantView() {
  if (document.getElementById("assistant-view")) return;

  const nav = document.querySelector(".nav-list");
  const employeesButton = document.querySelector('[data-view="employees"]');
  const marginButton = document.querySelector('[data-view="margin"]');
  const button = document.createElement("button");
  button.className = "nav-item";
  button.dataset.view = "assistant";
  button.type = "button";
  button.textContent = "Assistente";
  button.addEventListener("click", () => openView("assistant"));
  nav?.insertBefore(button, employeesButton || marginButton || null);

  document.querySelector(".main-panel")?.insertAdjacentHTML(
    "beforeend",
    `
      <section class="view" id="assistant-view" aria-labelledby="assistant-title">
        <div class="section-heading row-heading">
          <div>
            <h2 id="assistant-title">Assistente inteligente</h2>
            <p>Leitura operacional dos dados do MVP para apoiar decisao, atendimento e auditoria.</p>
          </div>
          <button class="primary-button" id="assistant-refresh" type="button">Atualizar leitura</button>
        </div>

        <div class="assistant-summary-grid" id="assistant-summary-grid"></div>

        <div class="content-grid assistant-content">
          <section class="panel">
            <div class="panel-heading">
              <h3>Prioridades sugeridas</h3>
            </div>
            <div class="assistant-list" id="assistant-priorities"></div>
          </section>

          <section class="panel">
            <div class="panel-heading">
              <h3>Rascunho de resposta</h3>
            </div>
            <div class="assistant-draft" id="assistant-draft"></div>
          </section>
        </div>

        <section class="panel assistant-governance">
          <div class="panel-heading">
            <h3>Guardrails para IA real</h3>
          </div>
          <div class="assistant-guardrails">
            <div><strong>Nao decidir sozinho</strong><span>IA sugere, mas reserva, cancelamento e alteracao de margem exigem regra e auditoria.</span></div>
            <div><strong>Dados minimos</strong><span>Enviar ao modelo apenas o necessario para o caso, evitando exposicao indevida de CPF e contratos.</span></div>
            <div><strong>Explicabilidade</strong><span>Cada recomendacao deve indicar os sinais usados: margem, autorizacao, retorno e contestacao.</span></div>
          </div>
        </section>
      </section>
    `
  );

  document.getElementById("assistant-refresh")?.addEventListener("click", () => {
    auditEvent("Assistente operacional atualizado para leitura do MVP.", "Assistente");
    saveState();
    render();
    openView("assistant");
  });
}

function buildAssistantInsights() {
  const margins = state.employees.map((employee) => ({ employee, margin: calculateMargin(employee) }));
  const negativeMargins = margins.filter((item) => item.margin.available < 0);
  const reviewMargins = margins.filter((item) => item.employee.status === "Em revisao");
  const reserved = state.contracts.filter((contract) => marginReservationStatuses.includes(contract.status));
  const sentToPayroll = state.contracts.filter((contract) => contract.status === "Enviado para folha");
  const returnIssues = state.contracts.filter(contractHasReturnIssue);
  const openTickets = state.tickets.filter((ticket) => ticket.status === "Aberto");
  const activeCodes = state.authorizationCodes.filter((authorization) => authorization.status === "Ativo");

  const priorities = [];

  negativeMargins.forEach(({ employee, margin }) => {
    priorities.push({
      label: "Margem negativa",
      text: `${employee.name} esta com margem de ${money.format(margin.available)}. Revisar contratos, bloqueios e base da folha.`,
      className: "danger",
    });
  });

  returnIssues.forEach((contract) => {
    const employee = employeeById(contract.employeeId);
    priorities.push({
      label: "Retorno com pendencia",
      text: `${contract.id} de ${employee?.name || "servidor"} voltou como ${contract.status}. Conferir motivo e acionar responsavel.`,
      className: "warning",
    });
  });

  if (sentToPayroll.length) {
    priorities.push({
      label: "Aguardando folha",
      text: `${sentToPayroll.length} contrato(s) foram enviados para a folha e ainda precisam de retorno processado.`,
      className: "warning",
    });
  }

  if (reserved.length) {
    priorities.push({
      label: "Reservas pendentes",
      text: `${reserved.length} reserva(s) aguardam envio, confirmacao ou cancelamento conforme politica do convenio.`,
      className: "",
    });
  }

  reviewMargins.forEach(({ employee }) => {
    priorities.push({
      label: "Cadastro em revisao",
      text: `${employee.name} esta com situacao em revisao. Validar vinculo e base de calculo antes de nova reserva.`,
      className: "warning",
    });
  });

  if (!priorities.length) {
    priorities.push({
      label: "Operacao estavel",
      text: "Nao ha sinais criticos no conjunto de dados atual. Manter acompanhamento por competencia.",
      className: "",
    });
  }

  const firstTicket = openTickets[0];
  const ticketEmployee = firstTicket ? employeeById(firstTicket.employeeId) : null;
  const draft = firstTicket
    ? `Ola, ${ticketEmployee?.name || "servidor"}. Recebemos sua solicitacao sobre ${firstTicket.type.toLowerCase()}. Vamos conferir sua margem, contratos vinculados e ultimo retorno da folha antes de responder com uma posicao conclusiva.`
    : "Nao ha ticket aberto no momento. Quando houver contestacao, o assistente pode preparar um rascunho com base na margem, contratos e retorno da folha.";

  return {
    summary: [
      ["Margens criticas", negativeMargins.length + reviewMargins.length],
      ["Pendencias da folha", returnIssues.length + sentToPayroll.length],
      ["Tickets abertos", openTickets.length],
      ["Codigos ativos", activeCodes.length],
    ],
    priorities: priorities.slice(0, 6),
    draft,
  };
}

function renderAssistantInsights() {
  ensureAssistantView();

  const summaryGrid = document.getElementById("assistant-summary-grid");
  const priorities = document.getElementById("assistant-priorities");
  const draft = document.getElementById("assistant-draft");
  if (!summaryGrid || !priorities || !draft) return;

  const insights = buildAssistantInsights();

  summaryGrid.innerHTML = insights.summary
    .map(
      ([label, value]) => `
        <article class="panel assistant-card">
          <span>${label}</span>
          <strong>${value}</strong>
        </article>
      `
    )
    .join("");

  priorities.innerHTML = insights.priorities
    .map(
      (item) => `
        <div class="assistant-priority">
          <span class="status ${item.className}">${item.label}</span>
          <p>${item.text}</p>
        </div>
      `
    )
    .join("");

  draft.innerHTML = `
    <p>${insights.draft}</p>
    <div class="assistant-draft-note">Rascunho demonstrativo. Em producao, deve exigir revisao humana antes de envio.</div>
  `;
}

const assistantStyle = document.createElement("style");
assistantStyle.textContent = `
  .assistant-summary-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
  }
  .assistant-card {
    min-height: 110px;
  }
  .assistant-card span {
    display: block;
    color: var(--muted);
    font-size: 13px;
    margin-bottom: 10px;
  }
  .assistant-card strong {
    font-size: 28px;
  }
  .assistant-content,
  .assistant-governance {
    margin-top: 18px;
  }
  .assistant-list,
  .assistant-guardrails {
    display: grid;
    gap: 12px;
  }
  .assistant-priority,
  .assistant-guardrails div,
  .assistant-draft {
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface-soft);
  }
  .assistant-priority p,
  .assistant-draft p {
    margin: 8px 0 0;
    color: var(--text);
  }
  .assistant-draft-note,
  .assistant-guardrails span {
    display: block;
    color: var(--muted);
    font-size: 13px;
    margin-top: 6px;
  }
  @media (max-width: 1100px) {
    .assistant-summary-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 720px) {
    .assistant-summary-grid {
      grid-template-columns: 1fr;
    }
  }
`;
document.head.appendChild(assistantStyle);

const renderBeforeAssistant = render;
render = function renderWithAssistantInsights() {
  renderBeforeAssistant();
  ensureAssistantView();
  renderAssistantInsights();
};

render();
