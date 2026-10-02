(() => {
  const OWNER = "DevinKC";
  const REPO = "devinkc.github.io";
  const API = `https://api.github.com/repos/${OWNER}/${REPO}/issues?state=all&per_page=100`;

  const grid = document.querySelector("#problem-grid");
  const message = document.querySelector("#board-message");
  const search = document.querySelector("#problem-search");
  const typeFilter = document.querySelector("#type-filter");
  const statusFilter = document.querySelector("#status-filter");
  const reset = document.querySelector("#reset-filters");

  let problems = [];

  const normalizedLabels = issue => (issue.labels || []).map(label =>
    String(typeof label === "string" ? label : label.name || "").toLowerCase()
  );

  const isProblem = issue => {
    const labels = normalizedLabels(issue);
    return /^\[bottleneck\]/i.test(issue.title || "") || labels.includes("bottleneck");
  };

  const isResource = issue => {
    const labels = normalizedLabels(issue);
    return /^\[resource\]/i.test(issue.title || "") || labels.includes("resource");
  };

  const statusFor = issue => {
    const labels = normalizedLabels(issue);
    const body = String(issue.body || "").toLowerCase();

    if (labels.includes("solved") || labels.includes("outcome:solved") || /cuthbert status:\s*solved/.test(body)) return "solved";
    if (labels.includes("awaiting-verification") || /cuthbert status:\s*awaiting verification/.test(body)) return "awaiting-verification";
    if (labels.includes("solution-found") || /cuthbert status:\s*solution found/.test(body)) return "solution-found";
    if (labels.includes("investigating") || /cuthbert status:\s*investigating/.test(body)) return "investigating";
    if (labels.includes("matched") || labels.includes("outcome:matched") || /cuthbert status:\s*matched/.test(body)) return "matched";
    return issue.state === "open" ? "open" : "closed";
  };

  const cleanTitle = title => String(title || "Untitled problem").replace(/^\[bottleneck\]\s*/i, "").trim();

  function sectionValue(body, headings) {
    const text = String(body || "").replace(/\r/g, "");
    for (const heading of headings) {
      const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`###\\s+${escaped}\\s*\\n+([\\s\\S]*?)(?=\\n###\\s+|$)`, "i");
      const match = text.match(re);
      if (match && match[1]) {
        const value = match[1].replace(/<!--[^]*?-->/g, "").trim();
        if (value && value !== "_No response_") return value;
      }
    }
    return "";
  }

  const metaFor = issue => ({
    organization: sectionValue(issue.body, ["Organization / team", "Organization or team"]),
    geography: sectionValue(issue.body, ["Country / region", "Location"]),
    needType: sectionValue(issue.body, ["What kind of missing piece?", "Need type"]),
    urgency: sectionValue(issue.body, ["Urgency"]),
    bottleneck: sectionValue(issue.body, ["What is stuck?", "The bottleneck"]),
    missingPiece: sectionValue(issue.body, ["Smallest useful thing", "Smallest useful thing that would unblock this"]),
    cash: sectionValue(issue.body, ["Cash required", "Approximate cash required"]),
    volunteer: sectionValue(issue.body, ["Volunteer effort", "Approximate volunteer effort"])
  });

  const truncate = (value, max = 260) => value && value.length > max ? `${value.slice(0, max - 1).trim()}…` : value;

  function setCount(id, value) {
    const el = document.querySelector(id);
    if (el) el.textContent = String(value);
  }

  function updateStats(allIssues) {
    const realIssues = allIssues.filter(issue => !issue.pull_request);
    const resources = realIssues.filter(isResource);
    const allProblems = realIssues.filter(isProblem);
    const statuses = allProblems.map(statusFor);
    const matched = statuses.filter(s => s === "matched").length;
    const investigating = statuses.filter(s => ["investigating", "solution-found"].includes(s)).length;
    const awaiting = statuses.filter(s => s === "awaiting-verification").length;
    const solved = statuses.filter(s => s === "solved").length;
    const open = statuses.filter(s => s === "open").length;

    setCount("#stat-open", open);
    setCount("#stat-investigating", investigating);
    setCount("#stat-awaiting", awaiting);
    setCount("#stat-solved", solved);
    setCount("#stat-resources", resources.length);
    setCount("#score-connections", matched + solved);
    setCount("#score-solved", solved);
  }

  function populateTypeFilter() {
    const current = typeFilter.value;
    const types = [...new Set(problems.map(p => p.meta.needType).filter(Boolean))].sort((a,b) => a.localeCompare(b));
    while (typeFilter.options.length > 1) typeFilter.remove(1);
    for (const type of types) {
      const option = document.createElement("option");
      option.value = type.toLowerCase();
      option.textContent = type;
      typeFilter.append(option);
    }
    if ([...typeFilter.options].some(o => o.value === current)) typeFilter.value = current;
  }

  function addMeta(dl, label, value) {
    if (!value) return;
    const row = document.createElement("div");
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = label;
    dd.textContent = value;
    row.append(dt, dd);
    dl.append(row);
  }

  function cardFor(problem) {
    const { issue, meta, status } = problem;
    const card = document.createElement("article");
    card.className = "problem-card";

    const top = document.createElement("div");
    top.className = "problem-card-top";
    const pill = document.createElement("span");
    pill.className = `status-pill ${status}`;
    pill.textContent = status.toUpperCase();
    const number = document.createElement("span");
    number.className = "issue-number";
    number.textContent = `#${issue.number}`;
    top.append(pill, number);

    const h3 = document.createElement("h3");
    h3.textContent = cleanTitle(issue.title);

    const summary = document.createElement("p");
    summary.className = "problem-summary";
    summary.textContent = truncate(meta.missingPiece || meta.bottleneck || "Open the issue for the full problem description.");

    const dl = document.createElement("dl");
    dl.className = "problem-meta";
    addMeta(dl, "Where", meta.geography);
    addMeta(dl, "Needs", meta.needType);
    addMeta(dl, "Urgency", meta.urgency);
    addMeta(dl, "Cash", meta.cash);
    addMeta(dl, "Volunteer", meta.volunteer);

    const link = document.createElement("a");
    link.className = "problem-link";
    link.href = issue.html_url;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "Open problem →";

    card.append(top, h3, summary, dl, link);
    return card;
  }

  function render() {
    const q = search.value.trim().toLowerCase();
    const wantedType = typeFilter.value;
    const wantedStatus = statusFilter.value;

    const filtered = problems.filter(problem => {
      const haystack = [problem.issue.title, problem.issue.body, problem.meta.geography, problem.meta.needType, problem.meta.organization]
        .filter(Boolean).join(" ").toLowerCase();
      return (!q || haystack.includes(q)) &&
        (wantedType === "all" || (problem.meta.needType || "").toLowerCase() === wantedType) &&
        (wantedStatus === "all" || problem.status === wantedStatus);
    });

    grid.replaceChildren();

    if (!problems.length) {
      message.hidden = false;
      message.textContent = "Zero problems on the board. Good. We start honest. Submit the first real bottleneck when we have one.";
      return;
    }

    if (!filtered.length) {
      message.hidden = false;
      message.textContent = "No problems match those filters.";
      return;
    }

    message.hidden = true;
    for (const problem of filtered) grid.append(cardFor(problem));
  }

  async function loadBoard() {
    try {
      const response = await fetch(API, { headers: { Accept: "application/vnd.github+json" } });
      if (!response.ok) throw new Error(`GitHub API returned ${response.status}`);
      const issues = await response.json();
      updateStats(issues);
      problems = issues
        .filter(issue => !issue.pull_request && isProblem(issue))
        .map(issue => ({ issue, meta: metaFor(issue), status: statusFor(issue) }))
        .sort((a, b) => new Date(b.issue.created_at) - new Date(a.issue.created_at));
      populateTypeFilter();
      render();
    } catch (error) {
      console.error(error);
      message.hidden = false;
      message.textContent = "The live problem board could not be loaded from GitHub right now. The submission links still work.";
    }
  }

  [search, typeFilter, statusFilter].forEach(el => el.addEventListener("input", render));
  reset.addEventListener("click", () => {
    search.value = "";
    typeFilter.value = "all";
    statusFilter.value = "all";
    render();
  });

  loadBoard();
})();