function byName(a, b) {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

function encodePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function buildTree(paths) {
  const root = { dirs: new Map(), files: [] };

  for (const path of paths) {
    if (!path || !path.toLowerCase().endsWith(".gh")) continue;

    const parts = path.split("/");
    const file = parts.pop();
    let node = root;

    for (const part of parts) {
      if (!node.dirs.has(part)) {
        node.dirs.set(part, { dirs: new Map(), files: [] });
      }
      node = node.dirs.get(part);
    }

    node.files.push({ name: file, path });
  }

  return root;
}

function applyAutoTheme() {
  const labelEl = document.getElementById("theme-label");
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

  function setTheme(isDark) {
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
    if (labelEl) {
      labelEl.textContent = `Auto (${isDark ? "Dark" : "Light"})`;
    }
  }

  setTheme(mediaQuery.matches);

  if (typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", (event) => setTheme(event.matches));
  } else if (typeof mediaQuery.addListener === "function") {
    mediaQuery.addListener((event) => setTheme(event.matches));
  }
}

function renderNode(node, listEl, config) {
  const sortedDirs = [...node.dirs.entries()].sort((a, b) => byName(a[0], b[0]));

  for (const [dirName, child] of sortedDirs) {
    const dirItem = document.createElement("li");
    dirItem.className = "item folder-item";

    const dirLabel = document.createElement("span");
    dirLabel.className = "folder-name";
    dirLabel.textContent = dirName + "/";
    dirItem.appendChild(dirLabel);

    const childList = document.createElement("ul");
    childList.className = "tree";
    renderNode(child, childList, config);
    dirItem.appendChild(childList);

    listEl.appendChild(dirItem);
  }

  const sortedFiles = [...node.files].sort((a, b) => byName(a.name, b.name));

  for (const file of sortedFiles) {
    const fileItem = document.createElement("li");
    fileItem.className = "item file-item";

    const fileName = document.createElement("span");
    fileName.className = "file-name";
    fileName.textContent = `${file.name} `;

    const downloadLink = document.createElement("a");
    downloadLink.className = "action-link";
    downloadLink.href = `https://raw.githubusercontent.com/${config.owner}/${config.repo}/${config.branch}/${encodePath(file.path)}`;
    downloadLink.target = "_blank";
    downloadLink.rel = "noopener noreferrer";
    downloadLink.textContent = "download";

    fileItem.appendChild(fileName);
    fileItem.appendChild(downloadLink);
    listEl.appendChild(fileItem);
  }
}

function formatDate(value) {
  if (!value) return "unknown";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  const datePart = date.toLocaleDateString();
  const timePart = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${datePart}, ${timePart}`;
}

function updateBranchQueryParam(branch) {
  const url = new URL(window.location.href);
  url.searchParams.set("branch", branch);
  window.history.replaceState({}, "", url);
}

function getInitialBranch(defaultBranch) {
  const url = new URL(window.location.href);
  return url.searchParams.get("branch") || defaultBranch;
}

function githubApiUrl(path) {
  return `https://api.github.com${path}`;
}

async function loadJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load ${path} (${response.status})`);
  }
  return response.json();
}

async function loadBranches(config) {
  const response = await fetch(
    githubApiUrl(`/repos/${config.owner}/${config.repo}/branches?per_page=100`),
    { cache: "no-store" }
  );
  if (!response.ok) {
    throw new Error(`Failed to load branches (${response.status})`);
  }

  const branches = await response.json();
  return branches.map((branch) => branch.name).sort(byName);
}

async function loadBranchTree(config, branch) {
  const branchResponse = await fetch(
    githubApiUrl(`/repos/${config.owner}/${config.repo}/branches/${encodeURIComponent(branch)}`),
    { cache: "no-store" }
  );
  if (!branchResponse.ok) {
    throw new Error(`Failed to load branch ${branch} (${branchResponse.status})`);
  }
  const branchInfo = await branchResponse.json();

  const [treeResponse, commitResponse] = await Promise.all([
    fetch(
      githubApiUrl(`/repos/${config.owner}/${config.repo}/git/trees/${branchInfo.commit.sha}?recursive=1`),
      { cache: "no-store" }
    ),
    fetch(
      githubApiUrl(`/repos/${config.owner}/${config.repo}/commits/${branchInfo.commit.sha}`),
      { cache: "no-store" }
    ),
  ]);

  if (!treeResponse.ok) {
    throw new Error(`Failed to load branch tree (${treeResponse.status})`);
  }
  if (!commitResponse.ok) {
    throw new Error(`Failed to load branch commit (${commitResponse.status})`);
  }

  const treeInfo = await treeResponse.json();
  const commitInfo = await commitResponse.json();
  const files = treeInfo.tree
    .filter((entry) => entry.type === "blob" && entry.path.toLowerCase().endsWith(".gh"))
    .map((entry) => entry.path)
    .sort(byName);

  return {
    files,
    generatedAt: commitInfo.commit?.committer?.date || commitInfo.commit?.author?.date || "",
  };
}

function populateBranchSelect(selectEl, branches, selectedBranch) {
  selectEl.innerHTML = "";

  for (const branch of branches) {
    const option = document.createElement("option");
    option.value = branch;
    option.textContent = branch;
    option.selected = branch === selectedBranch;
    selectEl.appendChild(option);
  }
}

function renderFileTree(rootEl, files, config) {
  rootEl.innerHTML = "";

  if (files.length === 0) {
    rootEl.textContent = "No .gh files were found in this repository.";
    return;
  }

  const tree = buildTree(files);
  const list = document.createElement("ul");
  list.className = "tree";
  renderNode(tree, list, config);
  rootEl.appendChild(list);
}

async function init() {
  applyAutoTheme();

  const metaEl = document.getElementById("meta");
  const rootEl = document.getElementById("tree-root");
  const statsEl = document.getElementById("repo-stats");
  const branchEl = document.getElementById("branch-name");
  const generatedEl = document.getElementById("generated-at");
  const branchSelectEl = document.getElementById("branch-select");

  try {
    const config = await loadJson("site-config.json");
    const branches = await loadBranches(config);
    const initialBranch = branches.includes(getInitialBranch(config.branch))
      ? getInitialBranch(config.branch)
      : config.branch;

    if (branchSelectEl) {
      populateBranchSelect(branchSelectEl, branches, initialBranch);
    }

    async function refreshBranch(branch) {
      metaEl.textContent = `Loading branch ${branch}...`;
      rootEl.innerHTML = "";
      if (statsEl) statsEl.textContent = "Loading...";
      if (branchEl) branchEl.textContent = branch;
      if (generatedEl) generatedEl.textContent = "Loading...";

      const branchData = await loadBranchTree(config, branch);
      const generated = formatDate(branchData.generatedAt);
      const branchConfig = { ...config, branch };

      metaEl.textContent = `${branchData.files.length} .gh file(s) found | Branch: ${branch} | Generated: ${generated}`;
      if (statsEl) statsEl.textContent = `${branchData.files.length} .gh file(s)`;
      if (branchEl) branchEl.textContent = branch;
      if (generatedEl) generatedEl.textContent = generated;

      updateBranchQueryParam(branch);
      renderFileTree(rootEl, branchData.files, branchConfig);
    }

    if (branchSelectEl) {
      branchSelectEl.addEventListener("change", async (event) => {
        const branch = event.target.value;
        try {
          await refreshBranch(branch);
        } catch (error) {
          metaEl.textContent = "Could not load file index.";
          if (statsEl) statsEl.textContent = "Unavailable";
          if (branchEl) branchEl.textContent = branch;
          if (generatedEl) generatedEl.textContent = "Unavailable";
          rootEl.innerHTML = "";
          const err = document.createElement("p");
          err.className = "error";
          err.textContent = error.message;
          rootEl.appendChild(err);
        }
      });
    }

    await refreshBranch(initialBranch);
  } catch (error) {
    metaEl.textContent = "Could not load file index.";
    if (statsEl) statsEl.textContent = "Unavailable";
    if (branchEl) branchEl.textContent = "Unavailable";
    if (generatedEl) generatedEl.textContent = "Unavailable";
    const err = document.createElement("p");
    err.className = "error";
    err.textContent = error.message;
    rootEl.appendChild(err);
  }
}

init();
