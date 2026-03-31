import { resolveChannelPriority } from "./algorithm/index.js";
import type { ChannelRegistry, ChannelRelations } from "./algorithm/index.js";
import { renderGraph } from "./renderer/dag-renderer.js";
import { PRESETS, type Preset } from "./ui/presets.js";
import hljs from "highlight.js/lib/core";
import typescript from "highlight.js/lib/languages/typescript";
import "highlight.js/styles/github.css";
import typesSource from "./algorithm/types.ts?raw";
import resolveSource from "./algorithm/resolve.ts?raw";
import "./style.css";

hljs.registerLanguage("typescript", typescript);

// ── State ──────────────────────────────────────────────────────────────

interface ChannelEntry {
  name: string;
  relations: ChannelRelations;
}

let channels: ChannelEntry[] = [];
let userChannels: string[] = [];

// ── DOM refs ───────────────────────────────────────────────────────────

const channelEditor = document.getElementById("channel-editor")!;
const userChannelsDiv = document.getElementById("user-channels")!;
const presetsDiv = document.getElementById("presets")!;
const resultDiv = document.getElementById("result")!;
const graphSvg = document.getElementById("graph-svg") as unknown as SVGSVGElement;
const addChannelBtn = document.getElementById("add-channel")!;
const addUserChannelBtn = document.getElementById("add-user-channel")!;
const resolveBtn = document.getElementById("resolve-btn")!;

// ── Preset rendering ──────────────────────────────────────────────────

function renderPresets(): void {
  presetsDiv.innerHTML = "";
  for (const preset of PRESETS) {
    const btn = document.createElement("button");
    btn.className = "btn btn-preset";
    btn.textContent = preset.name;
    btn.title = preset.description;
    btn.addEventListener("click", () => loadPreset(preset));
    presetsDiv.appendChild(btn);
  }
}

function loadPreset(preset: Preset): void {
  channels = Object.entries(preset.channels).map(([name, relations]) => ({
    name,
    relations: { ...relations },
  }));
  userChannels = [...preset.userChannels];
  renderChannelEditor();
  renderUserChannels();
  resolve();
}

// ── Channel editor ────────────────────────────────────────────────────

function renderChannelEditor(): void {
  channelEditor.innerHTML = "";

  for (let i = 0; i < channels.length; i++) {
    const entry = channels[i];
    const card = document.createElement("div");
    card.className = "channel-card";

    card.innerHTML = `
      <div class="channel-header">
        <input type="text" class="channel-name-input" value="${escapeHtml(entry.name)}" placeholder="channel name" />
        <button class="btn btn-icon btn-remove" title="Remove channel">&times;</button>
      </div>
      <div class="channel-relations">
        <label>
          <span class="relation-label base-label">base</span>
          <input type="text" class="relation-input" data-field="base" value="${escapeHtml(entry.relations.base ?? "")}" placeholder="e.g. conda-forge" />
        </label>
        <label>
          <span class="relation-label override-label">overrides</span>
          <input type="text" class="relation-input" data-field="overrides" value="${escapeHtml(entry.relations.overrides ?? "")}" placeholder="e.g. my-hotfixes" />
        </label>
      </div>
    `;

    const nameInput = card.querySelector(".channel-name-input") as HTMLInputElement;
    nameInput.addEventListener("change", () => {
      const oldName = entry.name;
      entry.name = nameInput.value.trim();
      // Update user channels if they referenced the old name
      userChannels = userChannels.map((uc) => (uc === oldName ? entry.name : uc));
      renderUserChannels();
    });

    const removeBtn = card.querySelector(".btn-remove")!;
    removeBtn.addEventListener("click", () => {
      channels.splice(i, 1);
      userChannels = userChannels.filter((uc) => uc !== entry.name);
      renderChannelEditor();
      renderUserChannels();
    });

    card.querySelectorAll<HTMLInputElement>(".relation-input").forEach((input) => {
      input.addEventListener("change", () => {
        const field = input.dataset.field as "base" | "overrides";
        const value = input.value.trim();
        if (value) {
          entry.relations[field] = value;
        } else {
          delete entry.relations[field];
        }
      });
    });

    channelEditor.appendChild(card);
  }
}

function addChannel(): void {
  const name = `channel-${channels.length + 1}`;
  channels.push({ name, relations: {} });
  renderChannelEditor();
}

// ── User channels ─────────────────────────────────────────────────────

function renderUserChannels(): void {
  userChannelsDiv.innerHTML = "";

  for (let i = 0; i < userChannels.length; i++) {
    const tag = document.createElement("div");
    tag.className = "user-channel-tag";

    const select = document.createElement("select");
    select.className = "user-channel-select";
    for (const ch of channels) {
      const opt = document.createElement("option");
      opt.value = ch.name;
      opt.textContent = ch.name;
      opt.selected = ch.name === userChannels[i];
      select.appendChild(opt);
    }
    select.addEventListener("change", () => {
      userChannels[i] = select.value;
    });

    const moveUpBtn = document.createElement("button");
    moveUpBtn.className = "btn btn-icon";
    moveUpBtn.textContent = "\u25B2";
    moveUpBtn.title = "Move up (higher priority)";
    moveUpBtn.disabled = i === 0;
    moveUpBtn.addEventListener("click", () => {
      [userChannels[i - 1], userChannels[i]] = [userChannels[i], userChannels[i - 1]];
      renderUserChannels();
    });

    const moveDownBtn = document.createElement("button");
    moveDownBtn.className = "btn btn-icon";
    moveDownBtn.textContent = "\u25BC";
    moveDownBtn.title = "Move down (lower priority)";
    moveDownBtn.disabled = i === userChannels.length - 1;
    moveDownBtn.addEventListener("click", () => {
      [userChannels[i], userChannels[i + 1]] = [userChannels[i + 1], userChannels[i]];
      renderUserChannels();
    });

    const removeBtn = document.createElement("button");
    removeBtn.className = "btn btn-icon btn-remove";
    removeBtn.textContent = "\u00D7";
    removeBtn.addEventListener("click", () => {
      userChannels.splice(i, 1);
      renderUserChannels();
    });

    const prioLabel = document.createElement("span");
    prioLabel.className = "prio-label";
    prioLabel.textContent = `#${i + 1}`;

    tag.appendChild(prioLabel);
    tag.appendChild(select);
    tag.appendChild(moveUpBtn);
    tag.appendChild(moveDownBtn);
    tag.appendChild(removeBtn);
    userChannelsDiv.appendChild(tag);
  }
}

function addUserChannel(): void {
  if (channels.length === 0) return;
  // Pick first channel not already in user list, or the first channel
  const available = channels.find((ch) => !userChannels.includes(ch.name));
  userChannels.push(available?.name ?? channels[0].name);
  renderUserChannels();
}

// ── Resolution ────────────────────────────────────────────────────────

function resolve(): void {
  const registry: ChannelRegistry = new Map();
  for (const entry of channels) {
    registry.set(entry.name, { ...entry.relations });
  }

  const result = resolveChannelPriority(userChannels, registry);

  // Render graph
  renderGraph(graphSvg, result, userChannels);

  // Render result
  if (result.error) {
    resultDiv.innerHTML = `
      <div class="result-error">
        <strong>Error: Cycle detected</strong>
        <p>Channels involved: ${result.error.path.map((c) => `<code>${escapeHtml(c)}</code>`).join(" \u2192 ")}</p>
      </div>
    `;
  } else if (result.order.length === 0) {
    resultDiv.innerHTML = `<p class="result-empty">No channels to resolve.</p>`;
  } else {
    const items = result.order
      .map((ch, i) => {
        const isUser = userChannels.includes(ch);
        return `<span class="result-channel ${isUser ? "result-user" : "result-discovered"}">${escapeHtml(ch)}</span>`;
      })
      .join(`<span class="result-arrow">\u203A</span>`);

    let html = `<div class="result-order"><span class="result-label">Highest priority</span>${items}<span class="result-label">Lowest priority</span></div>`;

    if (result.ignoredEdges.length > 0) {
      html += `<div class="result-ignored"><strong>Ignored edges</strong> (user ordering takes precedence):<ul>`;
      for (const e of result.ignoredEdges) {
        html += `<li><code>${escapeHtml(e.from)}</code> \u2192 <code>${escapeHtml(e.to)}</code> (${e.source})</li>`;
      }
      html += `</ul></div>`;
    }

    resultDiv.innerHTML = html;
  }
}

// ── Utilities ─────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

// ── Tabs ──────────────────────────────────────────────────────────────

const tabBtns = document.querySelectorAll<HTMLButtonElement>(".tab-btn");
const tabContents = document.querySelectorAll<HTMLElement>(".tab-content");

tabBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.tab!;
    tabBtns.forEach((b) => b.classList.toggle("active", b === btn));
    tabContents.forEach((c) =>
      c.classList.toggle("active", c.id === `tab-${target}`)
    );
  });
});

// ── Code viewer ───────────────────────────────────────────────────────

const codeFiles: Record<string, string> = {
  types: typesSource,
  resolve: resolveSource,
};

const codeContainer = document.getElementById("code-container")!;
const codeTabBtns = document.querySelectorAll<HTMLButtonElement>(".code-tab-btn");
let activeCodeFile = "types";

function renderCode(fileKey: string): void {
  activeCodeFile = fileKey;
  codeTabBtns.forEach((b) =>
    b.classList.toggle("active", b.dataset.file === fileKey)
  );
  const source = codeFiles[fileKey] ?? "";
  const highlighted = hljs.highlight(source, { language: "typescript" }).value;
  codeContainer.innerHTML = `<pre><code class="hljs language-typescript">${highlighted}</code></pre>`;
}

codeTabBtns.forEach((btn) => {
  btn.addEventListener("click", () => renderCode(btn.dataset.file!));
});

// ── Init ──────────────────────────────────────────────────────────────

addChannelBtn.addEventListener("click", addChannel);
addUserChannelBtn.addEventListener("click", addUserChannel);
resolveBtn.addEventListener("click", resolve);

renderPresets();
renderCode(activeCodeFile);
// Load the first preset by default
loadPreset(PRESETS[0]);
