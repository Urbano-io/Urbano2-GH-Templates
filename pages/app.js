function byName(a, b) {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

function encodePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function buildTree(paths) {
  const root = { dirs: new Map(), files: [] };

  for (const path of paths) {
    if (!path || !path.endsWith(".gh")) continue;

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

function renderNode(node, listEl, config) {
  const sortedDirs = [...node.dirs.entries()].sort((a, b) => byName(a[0], b[0]));

  for (const [dirName, child] of sortedDirs) {
    const dirItem = document.createElement("li");
    dirItem.className = "item";

    const dirLabel = document.createElement("span");
    dirLabel.className = "folder-name";
    dirLabel.textContent = dirName + "/";
    dirItem.appendChild(dirLabel);

    const childList = document.createElement("ul");
    renderNode(child, childList, config);
    dirItem.appendChild(childList);

    listEl.appendChild(dirItem);
  }

  const sortedFiles = [...node.files].sort((a, b) => byName(a.name, b.name));

  for (const file of sortedFiles) {
    const fileItem = document.createElement("li");
    fileItem.className = "item";

    const fileLink = document.createElement("a");
    fileLink.className = "file-link";
    const repoBase = `https://github.com/${config.owner}/${config.repo}`;
    const blobUrl = `${repoBase}/blob/${config.branch}/${encodePath(file.path)}`;
    fileLink.href = blobUrl;
    fileLink.target = "_blank";
    fileLink.rel = "noopener noreferrer";
    fileLink.textContent = file.name;

    const actions = document.createElement("span");
    actions.className = "file-actions";

    const viewLink = document.createElement("a");
    viewLink.className = "action-link";
    viewLink.href = blobUrl;
    viewLink.target = "_blank";
    viewLink.rel = "noopener noreferrer";
    viewLink.textContent = "view";

    const downloadLink = document.createElement("a");
    downloadLink.className = "action-link";
    downloadLink.href = `${blobUrl}?raw=1`;
    downloadLink.target = "_blank";
    downloadLink.rel = "noopener noreferrer";
    downloadLink.textContent = "download";

    actions.appendChild(document.createTextNode(" ["));
    actions.appendChild(viewLink);
    actions.appendChild(document.createTextNode(" | "));
    actions.appendChild(downloadLink);
    actions.appendChild(document.createTextNode("]"));

    fileItem.appendChild(fileLink);
    fileItem.appendChild(actions);
    listEl.appendChild(fileItem);
  }
}

function formatDate(value) {
  if (!value) return "unknown";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return date.toLocaleString();
}

async function loadJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load ${path} (${response.status})`);
  }
  return response.json();
}

async function init() {
  const metaEl = document.getElementById("meta");
  const rootEl = document.getElementById("tree-root");

  try {
    const [files, config] = await Promise.all([
      loadJson("gh-files.json"),
      loadJson("site-config.json"),
    ]);

    const tree = buildTree(files);
    const list = document.createElement("ul");
    list.className = "tree";
    renderNode(tree, list, config);

    metaEl.textContent = `${files.length} .gh file(s) found | Branch: ${config.branch} | Generated: ${formatDate(config.generatedAt)}`;

    if (files.length === 0) {
      rootEl.textContent = "No .gh files were found in this repository.";
      return;
    }

    rootEl.appendChild(list);
  } catch (error) {
    metaEl.textContent = "Could not load file index.";
    const err = document.createElement("p");
    err.className = "error";
    err.textContent = error.message;
    rootEl.appendChild(err);
  }
}

init();
