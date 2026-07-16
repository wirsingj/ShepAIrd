export function makeSummaryChips(scan) {
  const aggregate = scan.aggregate ?? {};
  const capabilityEntries = Object.entries(aggregate.capabilityCounts ?? {})
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 4);

  return [
    `${aggregate.selectedCount ?? scan.selectedCount ?? 0} folders scanned`,
    `${aggregate.yaimlAwareCount ?? 0} YAIML-aware`,
    `${aggregate.temporaryArcsAwareCount ?? aggregate.arcsAwareCount ?? 0} temporary ARCS`,
    `${aggregate.dirtyCount ?? 0} dirty`,
    `${aggregate.missingStateDocCount ?? 0} missing state docs`,
    `${aggregate.missingMaintainerDocCount ?? 0} missing maintainer guide`,
    ...capabilityEntries.map(([capability, count]) => `${capability} appears in ${count}`),
  ];
}

export function renderTokenStripHtml(scan, selectedId = "") {
  const projects = scan.projects ?? [];
  if (!projects.length) {
    return `<p class="empty-note">No folders scanned yet.</p>`;
  }

  return projects.map((project) => {
    const classes = [
      "project-token",
      project.id === selectedId ? "selected" : "",
      project.isYaimlAware ? "yaiml" : project.isTemporaryArcsAware ? "arcs" : "plain",
      project.gitDirty ? "dirty" : "clean",
    ].filter(Boolean).join(" ");
    return `
      <button class="${classes}" type="button" data-project-id="${escapeAttr(project.id)}">
        <span class="token-title">${escapeHtml(project.name)}</span>
        <span class="token-path">${escapeHtml(project.absolutePath)}</span>
        <span class="token-badges">
          <span>${project.isYaimlAware ? "YAIML" : project.isTemporaryArcsAware ? "temporary ARCS" : "plain"}</span>
          <span>${project.isGitRepo ? (project.gitDirty ? "dirty" : "clean") : "no git"}</span>
          <span>${existingCount(project.statusDocs)} state</span>
        </span>
      </button>
    `;
  }).join("");
}

export function renderDetailHtml(project) {
  if (!project) {
    return `
      <section class="detail-empty">
        <p class="panel-kicker">Awaiting selection</p>
        <h2>Select a ship token</h2>
        <p>Scan or drop repo folders, then click a token to expand the full project dossier.</p>
      </section>
    `;
  }

  return `
    <section class="detail-card">
      <div class="detail-heading">
        <div>
          <p class="panel-kicker">Project dossier</p>
          <h2>${escapeHtml(project.name)}</h2>
        </div>
        <span>${project.gitDirty ? "dirty" : project.isGitRepo ? "clean" : "no git"}</span>
      </div>
      <p class="detail-path">${escapeHtml(project.absolutePath)}</p>
      <div class="dossier-grid">
        <span>${project.isYaimlAware ? "YAIML-aware" : project.isTemporaryArcsAware ? "temporary ARCS" : "plain folder"}</span>
        <span>${project.isGitRepo ? "git repo" : "no git repo"}</span>
        <span>${project.gitDirty ? "unfinished work" : "no dirty sample"}</span>
      </div>
      ${renderList("Warnings", project.warnings)}
      ${renderDocs("State Docs", project.statusDocs)}
      ${renderDocs("YAIML Docs", project.yaimlDocs)}
      ${renderDocs("Temporary ARCS Docs", project.arcsDocs)}
      ${renderDocs("Architecture Docs", project.architectureDocs)}
      ${renderDocs("Maintainer Docs", project.maintainerDocs)}
      ${renderDocs("Agent Docs", project.agentDocs)}
      ${renderDocs("Package Manifests", project.packageManifests)}
      ${renderList("Capability Hints", project.capabilityHints)}
      ${renderList("Dependency Hints", project.dependencyHints)}
      ${renderList("Dirty Sample", project.dirtySample)}
      <section>
        <h3>Likely Next Packet</h3>
        <p>${escapeHtml(likelyPacket(project))}</p>
      </section>
    </section>
  `;
}

function renderDocs(title, docs = []) {
  const found = docs.filter((doc) => doc.exists);
  return renderList(title, found.map((doc) => doc.heading ? `${doc.path} - ${doc.heading}` : doc.path));
}

function renderList(title, items = []) {
  return `
    <section>
      <h3>${escapeHtml(title)}</h3>
      ${items.length
        ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
        : `<p class="muted">None detected.</p>`}
    </section>
  `;
}

function likelyPacket(project) {
  if (!project.isYaimlAware) {
    return "Identify whether this repo should adopt YAIML project memory.";
  }
  if (!existingCount(project.statusDocs)) {
    return "Create or locate the current state/status document.";
  }
  if (project.gitDirty) {
    return "Inspect dirty work before recommending changes.";
  }
  if ((project.capabilityHints ?? []).includes("provider-adapter")) {
    return "Compare provider boundary against known shared patterns.";
  }
  return "Read state docs and choose one bounded next engineering step.";
}

function existingCount(docs = []) {
  return docs.filter((doc) => doc.exists).length;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}
