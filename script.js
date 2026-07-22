const SAMPLE_JSON = `{
  "project": "JSON Forge",
  "description": "A fast, private JSON formatter",
  "features": ["format", "validate", "minify"],
  "private": true,
  "version": 1
}`;

// Paste the placement keys generated in Adviverse > Publisher > Placements.
const ADVIVERSE_CONFIG = Object.freeze({
  endpoint: "https://serve.adviverse.com",
  placements: {
    primary: "tk_df66d1e4518d40e0c0", // 728x90 display placement.
    secondary: "tk_9e7a90e8e97e92c113", // 300x250 display placement.
  },
});

const HIGHLIGHT_LIMIT = 500_000;
const LINE_NUMBER_LIMIT = 20_000;

const elements = {
  input: document.querySelector("#jsonInput"),
  output: document.querySelector("#jsonOutput"),
  outputEditor: document.querySelector("#outputEditor"),
  inputLines: document.querySelector("#inputLineNumbers"),
  outputLines: document.querySelector("#outputLineNumbers"),
  inputMeta: document.querySelector("#inputMeta"),
  outputMeta: document.querySelector("#outputMeta"),
  status: document.querySelector("#validationStatus"),
  statusText: document.querySelector("#statusText"),
  error: document.querySelector("#errorMessage"),
  errorText: document.querySelector("#errorText"),
  toast: document.querySelector("#toast"),
  fileInput: document.querySelector("#fileInput"),
  themeToggle: document.querySelector("#themeToggle"),
  themeMeta: document.querySelector('meta[name="theme-color"]'),
  consentBanner: document.querySelector("#consentBanner"),
};

let outputValue = "";
let toastTimer;
let inputFrame;

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function syntaxHighlight(json) {
  if (json.length > HIGHLIGHT_LIMIT) return escapeHtml(json);

  return escapeHtml(json).replace(
    /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"\s*:)|("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*")|\b(true|false)\b|\b(null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (match, key, string, boolean, nullValue) => {
      if (key) return `<span class="json-key">${key}</span>`;
      if (string) return `<span class="json-string">${string}</span>`;
      if (boolean) return `<span class="json-boolean">${boolean}</span>`;
      if (nullValue) return `<span class="json-null">${nullValue}</span>`;
      return `<span class="json-number">${match}</span>`;
    },
  );
}

function getLineCount(value) {
  if (!value) return 1;
  let count = 1;
  for (let i = 0; i < value.length; i += 1) {
    if (value.charCodeAt(i) === 10) count += 1;
  }
  return count;
}

function makeLineNumbers(count) {
  if (count > LINE_NUMBER_LIMIT) return "";
  let numbers = "1";
  for (let line = 2; line <= count; line += 1) numbers += `\n${line}`;
  return numbers;
}

function updateInputMetrics() {
  const count = getLineCount(elements.input.value);
  elements.inputLines.textContent = makeLineNumbers(count);
  elements.inputMeta.textContent = `${count.toLocaleString()} ${count === 1 ? "line" : "lines"}`;
}

function syncInputScroll() {
  elements.inputLines.scrollTop = elements.input.scrollTop;
}

function syncOutputScroll() {
  const pre = elements.output;
  elements.outputLines.scrollTop = pre.scrollTop;
}

function setStatus(type, label) {
  elements.status.className = `status-badge is-${type}`;
  elements.statusText.textContent = label;
}

function hideError() {
  elements.error.hidden = true;
  elements.errorText.textContent = "";
}

function locateParseError(error, source) {
  const message = error instanceof Error ? error.message : String(error);
  const positionMatch = message.match(/(?:position|at position)\s+(\d+)/i);
  const lineColumnMatch = message.match(/line\s+(\d+)\s+column\s+(\d+)/i);
  let line;
  let column;

  if (positionMatch) {
    const position = Math.min(Number(positionMatch[1]), source.length);
    const before = source.slice(0, position);
    line = getLineCount(before);
    const lastBreak = before.lastIndexOf("\n");
    column = position - lastBreak;
  } else if (lineColumnMatch) {
    line = Number(lineColumnMatch[1]);
    column = Number(lineColumnMatch[2]);
  }

  const cleaned = message.replace(/^JSON\.parse:\s*/i, "");
  return { message: cleaned, line, column };
}

function showParseError(error, source) {
  const detail = locateParseError(error, source);
  const location = detail.line ? `Line ${detail.line}, column ${detail.column}: ` : "";
  elements.errorText.textContent = `${location}${detail.message}`;
  elements.error.hidden = false;
  setStatus("invalid", "Invalid");

  if (detail.line) {
    const lines = source.split("\n");
    const offset = lines.slice(0, detail.line - 1).reduce((sum, current) => sum + current.length + 1, 0);
    const position = offset + Math.max(0, detail.column - 1);
    elements.input.focus();
    elements.input.setSelectionRange(position, Math.min(position + 1, source.length));
  }
}

function parseInput() {
  const source = elements.input.value.trim();
  hideError();

  if (!source) {
    const error = new Error("Paste or upload JSON before running this action.");
    showParseError(error, source);
    return { ok: false };
  }

  try {
    return { ok: true, value: JSON.parse(source) };
  } catch (error) {
    showParseError(error, source);
    return { ok: false };
  }
}

function renderOutput(value, action) {
  outputValue = value;
  const lines = getLineCount(value);
  elements.output.innerHTML = syntaxHighlight(value);
  elements.outputLines.textContent = makeLineNumbers(lines);
  elements.outputMeta.textContent = `${lines.toLocaleString()} ${lines === 1 ? "line" : "lines"} | ${formatBytes(new Blob([value]).size)}`;
  elements.output.scrollTop = 0;
  elements.output.scrollLeft = 0;
  elements.outputLines.scrollTop = 0;
  setStatus("valid", action);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function runTransform(mode) {
  const result = parseInput();
  if (!result.ok) return;

  const formatted = JSON.stringify(result.value, null, mode === "format" ? 2 : 0);
  renderOutput(formatted, mode === "format" ? "Formatted" : "Minified");
}

function validateJson() {
  const result = parseInput();
  if (!result.ok) return;
  setStatus("valid", "Valid JSON");
  showToast("JSON is valid");
}

async function copyOutput() {
  if (!outputValue) {
    showToast("Format or minify JSON first");
    return;
  }

  try {
    await navigator.clipboard.writeText(outputValue);
  } catch {
    const textArea = document.createElement("textarea");
    textArea.value = outputValue;
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    document.body.append(textArea);
    textArea.select();
    document.execCommand("copy");
    textArea.remove();
  }
  showToast("Output copied");
}

function downloadOutput() {
  if (!outputValue) {
    showToast("Format or minify JSON first");
    return;
  }

  const blob = new Blob([outputValue], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "formatted.json";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("Download started");
}

function clearEditor() {
  elements.input.value = "";
  outputValue = "";
  elements.output.innerHTML = '<span class="empty-state">Your formatted JSON will appear here.</span>';
  elements.outputLines.textContent = "1";
  elements.outputMeta.textContent = "Waiting for input";
  hideError();
  setStatus("ready", "Ready");
  updateInputMetrics();
  elements.input.focus();
}

function uploadJson() {
  const [file] = elements.fileInput.files;
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) {
    showToast("Please select a file smaller than 20 MB");
    elements.fileInput.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    elements.input.value = String(reader.result);
    updateInputMetrics();
    hideError();
    setStatus("ready", "Loaded");
    elements.input.focus();
    showToast(`${file.name} loaded`);
    elements.fileInput.value = "";
  };
  reader.onerror = () => showToast("Could not read that file");
  reader.readAsText(file);
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  toastTimer = window.setTimeout(() => elements.toast.classList.remove("show"), 1800);
}

function getStoredValue(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setStoredValue(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage may be unavailable in a locked-down browser; the current choice still applies.
  }
}

function getEligibleAdUnits() {
  return [...document.querySelectorAll("[data-adviverse-unit]")].filter((unit) => {
    const key = ADVIVERSE_CONFIG.placements[unit.dataset.adviverseUnit];
    const media = unit.dataset.media;
    return Boolean(key) && (!media || window.matchMedia(media).matches);
  });
}

function enableAdviverseAds() {
  if (document.documentElement.dataset.adsLoaded === "true") return;

  const units = getEligibleAdUnits();
  if (!units.length) return;
  window.jsonForgeConsent = { adsAllowed: true };
  document.documentElement.dataset.adsLoaded = "true";

  units.forEach((unit) => {
    const placementKey = ADVIVERSE_CONFIG.placements[unit.dataset.adviverseUnit];
    const marker = document.createElement("script");
    marker.dataset.tag = placementKey;
    marker.async = true;
    marker.src = `${ADVIVERSE_CONFIG.endpoint.replace(/\/$/, "")}/sdk.js`;
    unit.querySelector("[data-adviverse-slot]").append(marker);
    unit.hidden = false;
  });
}

function setAdConsent(choice) {
  setStoredValue("json-forge-ad-consent", choice);
  window.jsonForgeConsent = { adsAllowed: choice === "granted" };
  elements.consentBanner.hidden = true;
  if (choice === "granted") enableAdviverseAds();
}

function showAdChoices() {
  if (!getEligibleAdUnits().length) {
    showToast("Advertising is not configured yet");
    return;
  }
  elements.consentBanner.hidden = false;
  document.querySelector("#acceptAdsBtn").focus();
}

function initializeAdvertising() {
  if (!getEligibleAdUnits().length) return;
  const consent = getStoredValue("json-forge-ad-consent");
  window.jsonForgeConsent = { adsAllowed: consent === "granted" };
  if (consent === "granted") enableAdviverseAds();
  else if (consent !== "denied") elements.consentBanner.hidden = false;
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  elements.themeToggle.setAttribute("aria-label", `Switch to ${theme === "dark" ? "light" : "dark"} theme`);
  elements.themeMeta.setAttribute("content", theme === "dark" ? "#0d141a" : "#f5f7fa");
  setStoredValue("json-forge-theme", theme);
}

function initializeTheme() {
  const saved = getStoredValue("json-forge-theme");
  const preferred = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  setTheme(saved || preferred);
}

elements.input.addEventListener("input", () => {
  window.cancelAnimationFrame(inputFrame);
  inputFrame = window.requestAnimationFrame(updateInputMetrics);
  if (!elements.error.hidden) hideError();
  setStatus("ready", "Edited");
});
elements.input.addEventListener("scroll", syncInputScroll, { passive: true });
elements.output.addEventListener("scroll", syncOutputScroll, { passive: true });
elements.input.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    runTransform("format");
  }
  if (event.key === "Tab") {
    event.preventDefault();
    const start = elements.input.selectionStart;
    const end = elements.input.selectionEnd;
    elements.input.setRangeText("  ", start, end, "end");
    elements.input.dispatchEvent(new Event("input"));
  }
});

document.querySelector("#formatBtn").addEventListener("click", () => runTransform("format"));
document.querySelector("#minifyBtn").addEventListener("click", () => runTransform("minify"));
document.querySelector("#validateBtn").addEventListener("click", validateJson);
document.querySelector("#copyBtn").addEventListener("click", copyOutput);
document.querySelector("#downloadBtn").addEventListener("click", downloadOutput);
document.querySelector("#clearBtn").addEventListener("click", clearEditor);
document.querySelector("#uploadBtn").addEventListener("click", () => elements.fileInput.click());
elements.fileInput.addEventListener("change", uploadJson);
elements.themeToggle.addEventListener("click", () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
document.querySelector("#acceptAdsBtn").addEventListener("click", () => setAdConsent("granted"));
document.querySelector("#declineAdsBtn").addEventListener("click", () => setAdConsent("denied"));
document.querySelector("#privacyChoicesBtn").addEventListener("click", showAdChoices);

initializeTheme();
initializeAdvertising();
elements.input.value = SAMPLE_JSON;
updateInputMetrics();
document.querySelector("#year").textContent = new Date().getFullYear();
