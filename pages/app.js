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
    downloadLink.textContent = "(download)";

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

async function loadJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load ${path} (${response.status})`);
  }
  return response.json();
}

async function init() {
  applyAutoTheme();

  const metaEl = document.getElementById("meta");
  const rootEl = document.getElementById("tree-root");
  const statsEl = document.getElementById("repo-stats");
  const branchEl = document.getElementById("branch-name");
  const generatedEl = document.getElementById("generated-at");

  try {
    const [files, config] = await Promise.all([
      loadJson("gh-files.json"),
      loadJson("site-config.json"),
    ]);

    const generated = formatDate(config.generatedAt);
    metaEl.textContent = `${files.length} .gh file(s) found | Branch: ${config.branch} | Generated: ${generated}`;

    if (statsEl) statsEl.textContent = `${files.length} .gh file(s)`;
    if (branchEl) branchEl.textContent = config.branch || "-";
    if (generatedEl) generatedEl.textContent = generated;

    if (files.length === 0) {
      rootEl.textContent = "No .gh files were found in this repository.";
      return;
    }

    const tree = buildTree(files);
    const list = document.createElement("ul");
    list.className = "tree";
    renderNode(tree, list, config);
    rootEl.appendChild(list);
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
