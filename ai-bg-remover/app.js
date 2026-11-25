const CDN_ENDPOINTS = [
  "https://cdn.jsdelivr.net/npm/@imgly/background-removal/+esm",
  "https://esm.sh/@imgly/background-removal",
];

const ACCEPTED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const ACCEPTED_EXTENSIONS = /\.(png|jpe?g|webp)$/i;
const BG_CLASSES = ["bg-checkerboard", "bg-white", "bg-black"];

const elements = {
  dropZone: document.getElementById("drop-zone"),
  fileInput: document.getElementById("file-input"),
  selectFileBtn: document.getElementById("select-file-btn"),
  errorBanner: document.getElementById("error-banner"),
  errorMessage: document.getElementById("error-message"),
  dismissErrorBtn: document.getElementById("dismiss-error-btn"),
  progressSection: document.getElementById("progress-section"),
  progressTitle: document.getElementById("progress-title"),
  progressDetail: document.getElementById("progress-detail"),
  progressPercent: document.getElementById("progress-percent"),
  progressBarRole: document.getElementById("progress-bar-role"),
  progressFill: document.getElementById("progress-fill"),
  progressMeta: document.getElementById("progress-meta"),
  workspace: document.getElementById("workspace"),
  sideBySideView: document.getElementById("side-by-side-view"),
  sliderView: document.getElementById("slider-view"),
  originalImg: document.getElementById("original-img"),
  resultImg: document.getElementById("result-img"),
  resultStage: document.getElementById("result-stage"),
  resultPlaceholder: document.getElementById("result-placeholder"),
  originalMeta: document.getElementById("original-meta"),
  resultMeta: document.getElementById("result-meta"),
  sliderMeta: document.getElementById("slider-meta"),
  sliderStage: document.getElementById("slider-stage"),
  sliderOriginalImg: document.getElementById("slider-original-img"),
  sliderResultImg: document.getElementById("slider-result-img"),
  sliderOriginalClip: document.getElementById("slider-original-clip"),
  sliderDivider: document.getElementById("slider-divider"),
  compareRange: document.getElementById("compare-range"),
  changeImageBtn: document.getElementById("change-image-btn"),
  downloadBtn: document.getElementById("download-btn"),
  viewButtons: Array.from(document.querySelectorAll(".seg-btn[data-view]")),
  bgButtons: Array.from(document.querySelectorAll(".bg-btn[data-bg]")),
};

const state = {
  removeBackgroundFn: null,
  originalUrl: null,
  resultUrl: null,
  resultBlob: null,
  originalFilename: "image",
  isProcessing: false,
  dragDepth: 0,
  runId: 0,
};

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const idx = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, idx);
  return `${value.toFixed(idx === 0 ? 0 : 2)} ${units[idx]}`;
}

function showError(message) {
  elements.errorMessage.textContent = message;
  elements.errorBanner.classList.remove("hidden");
}

function hideError() {
  elements.errorBanner.classList.add("hidden");
  elements.errorMessage.textContent = "";
}

function setProgress({ visible, title, detail, percent, meta }) {
  if (!visible) {
    elements.progressSection.classList.add("hidden");
    return;
  }

  elements.progressSection.classList.remove("hidden");
  if (title !== undefined) elements.progressTitle.textContent = title;
  if (detail !== undefined) elements.progressDetail.textContent = detail;
  if (meta !== undefined) elements.progressMeta.textContent = meta;

  const clamped = Math.max(0, Math.min(100, Math.round(percent ?? 0)));
  elements.progressPercent.textContent = `${clamped}%`;
  elements.progressFill.style.width = `${clamped}%`;
  elements.progressBarRole.setAttribute("aria-valuenow", String(clamped));
}

function revokeObjectUrl(url) {
  if (url) {
    URL.revokeObjectURL(url);
  }
}

function isSupportedImage(file) {
  if (!file) return false;
  if (ACCEPTED_MIME_TYPES.has(file.type)) return true;
  return ACCEPTED_EXTENSIONS.test(file.name || "");
}

function baseName(filename) {
  const clean = (filename || "image").trim();
  const dotIdx = clean.lastIndexOf(".");
  return dotIdx > 0 ? clean.slice(0, dotIdx) : clean;
}

function getImageDimensions(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function loadBackgroundRemover() {
  if (state.removeBackgroundFn) {
    return state.removeBackgroundFn;
  }

  let lastError = null;
  for (const endpoint of CDN_ENDPOINTS) {
    try {
      const mod = await import(endpoint);
      const fn = mod.removeBackground || mod.default;
      if (typeof fn === "function") {
        state.removeBackgroundFn = fn;
        return fn;
      }
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error("無法載入 @imgly/background-removal 模組");
}

function updateSliderPosition(value) {
  const pct = Math.max(0, Math.min(100, Number(value)));
  elements.sliderOriginalClip.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
  elements.sliderDivider.style.left = `${pct}%`;
}

function setBackgroundMode(mode) {
  const targetClass = `bg-${mode}`;
  if (!BG_CLASSES.includes(targetClass)) return;

  for (const stage of [elements.resultStage, elements.sliderStage]) {
    stage.classList.remove(...BG_CLASSES);
    stage.classList.add(targetClass);
  }

  for (const btn of elements.bgButtons) {
    btn.classList.toggle("active", btn.dataset.bg === mode);
  }
}

function setViewMode(mode) {
  const isSlider = mode === "slider";
  elements.sideBySideView.classList.toggle("hidden", isSlider);
  elements.sliderView.classList.toggle("hidden", !isSlider);

  for (const btn of elements.viewButtons) {
    btn.classList.toggle("active", btn.dataset.view === mode);
  }
}

function resetResultPreview() {
  revokeObjectUrl(state.resultUrl);
  state.resultUrl = null;
  state.resultBlob = null;
  elements.resultImg.removeAttribute("src");
  elements.resultImg.classList.add("hidden");
  elements.sliderResultImg.removeAttribute("src");
  elements.resultPlaceholder.classList.remove("hidden");
  elements.resultMeta.textContent = "處理中…";
  elements.sliderMeta.textContent = "處理中…";
  elements.downloadBtn.disabled = true;
}

async function handleFile(file) {
  if (!file) return;
  hideError();

  if (!isSupportedImage(file)) {
    showError("不支援的檔案格式，請上傳 PNG、JPG 或 WebP 圖片。");
    return;
  }

  const currentRunId = ++state.runId;
  state.isProcessing = true;
  state.originalFilename = baseName(file.name);
  elements.changeImageBtn.disabled = true;

  // Show original immediately
  revokeObjectUrl(state.originalUrl);
  state.originalUrl = URL.createObjectURL(file);
  elements.originalImg.src = state.originalUrl;
  elements.sliderOriginalImg.src = state.originalUrl;
  elements.originalMeta.textContent = `${formatBytes(file.size)}`;

  resetResultPreview();
  elements.dropZone.classList.add("hidden");
  elements.workspace.classList.remove("hidden");
  updateSliderPosition(50);
  elements.compareRange.value = "50";

  const dims = await getImageDimensions(state.originalUrl);
  if (currentRunId !== state.runId) return;
  if (dims) {
    elements.originalMeta.textContent = `${dims.width} × ${dims.height} · ${formatBytes(file.size)}`;
  }

  setProgress({
    visible: true,
    title: "正在載入 AI 去背引擎…",
    detail: "首次載入模型需要下載必要資源，請稍候",
    percent: 5,
    meta: "載入前端模組中…",
  });

  try {
    const removeBackground = await loadBackgroundRemover();
    if (currentRunId !== state.runId) return;

    const fetchedAssets = new Map();
    let computeMaxPct = 0;

    const blob = await removeBackground(file, {
      output: {
        format: "image/png",
        type: "foreground",
      },
      progress: (key, current, total) => {
        if (currentRunId !== state.runId) return;

        if (key.startsWith("fetch:")) {
          fetchedAssets.set(key, { current, total });
          let sumCurrent = 0;
          let sumTotal = 0;
          for (const entry of fetchedAssets.values()) {
            sumCurrent += entry.current || 0;
            sumTotal += entry.total || 0;
          }

          const pct = sumTotal > 0 ? Math.min(99, (sumCurrent / sumTotal) * 100) : 20;
          const assetLabel = key.replace(/^fetch:/, "");
          const sizeInfo =
            sumTotal > 0
              ? `${formatBytes(sumCurrent)} / ${formatBytes(sumTotal)}`
              : "正在下載模型資源…";

          setProgress({
            visible: true,
            title: "首次載入 AI 模型中…",
            detail: "模型會儲存於瀏覽器快取，之後開啟不需重複下載",
            percent: Math.max(8, pct),
            meta: `${sizeInfo}（${assetLabel}）`,
          });
          return;
        }

        if (key.startsWith("compute:")) {
          const pct = total > 0 ? (current / total) * 100 : 85;
          computeMaxPct = Math.max(computeMaxPct, pct);
          setProgress({
            visible: true,
            title: "正在進行本地端 AI 去背運算…",
            detail: "所有運算皆在您的裝置上完成，不會上傳圖片",
            percent: Math.min(99, Math.max(15, computeMaxPct)),
            meta: `影像分割階段：${key.replace(/^compute:/, "")}`,
          });
        }
      },
    });

    if (currentRunId !== state.runId) return;

    state.resultBlob = blob;
    state.resultUrl = URL.createObjectURL(blob);
    elements.resultImg.src = state.resultUrl;
    elements.resultImg.classList.remove("hidden");
    elements.sliderResultImg.src = state.resultUrl;
    elements.resultPlaceholder.classList.add("hidden");
    elements.downloadBtn.disabled = false;

    const resultDims = await getImageDimensions(state.resultUrl);
    if (currentRunId !== state.runId) return;

    const resultInfo = resultDims
      ? `${resultDims.width} × ${resultDims.height} · ${formatBytes(blob.size)} PNG`
      : `${formatBytes(blob.size)} PNG`;
    elements.resultMeta.textContent = resultInfo;
    elements.sliderMeta.textContent = resultInfo;

    setProgress({
      visible: true,
      title: "去背完成！",
      detail: "可切換灰白格紋、純白或純黑底色檢查邊緣細節，並一鍵下載透明 PNG",
      percent: 100,
      meta: `輸出格式：透明 PNG（${formatBytes(blob.size)}）`,
    });
  } catch (err) {
    console.error("Background removal failed:", err);
    setProgress({ visible: false });
    showError(
      `去背處理失敗：${err?.message || "請確認網路連線（首次使用需下載模型）或改用較小的圖片重試。"}`
    );
    elements.resultPlaceholder.textContent = "去背失敗，請更換圖片再試一次";
    elements.resultMeta.textContent = "失敗";
    elements.sliderMeta.textContent = "失敗";
  } finally {
    if (currentRunId === state.runId) {
      state.isProcessing = false;
      elements.changeImageBtn.disabled = false;
    }
  }
}

function triggerDownload() {
  if (!state.resultUrl || !state.resultBlob) return;
  const link = document.createElement("a");
  link.href = state.resultUrl;
  link.download = `${state.originalFilename}-no-bg.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function bindEvents() {
  elements.selectFileBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    elements.fileInput.click();
  });

  elements.dropZone.addEventListener("click", () => {
    elements.fileInput.click();
  });

  elements.dropZone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      elements.fileInput.click();
    }
  });

  elements.fileInput.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) handleFile(file);
  });

  elements.changeImageBtn.addEventListener("click", () => {
    if (!state.isProcessing) {
      elements.fileInput.click();
    }
  });

  elements.downloadBtn.addEventListener("click", triggerDownload);
  elements.dismissErrorBtn.addEventListener("click", hideError);

  elements.compareRange.addEventListener("input", (e) => {
    updateSliderPosition(e.target.value);
  });

  for (const btn of elements.viewButtons) {
    btn.addEventListener("click", () => setViewMode(btn.dataset.view));
  }

  for (const btn of elements.bgButtons) {
    btn.addEventListener("click", () => setBackgroundMode(btn.dataset.bg));
  }

  // Drag and drop on dropZone and whole window
  const preventDefaults = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
    window.addEventListener(eventName, preventDefaults);
  });

  window.addEventListener("dragenter", () => {
    state.dragDepth += 1;
    elements.dropZone.classList.add("drag-active");
  });

  window.addEventListener("dragleave", () => {
    state.dragDepth = Math.max(0, state.dragDepth - 1);
    if (state.dragDepth === 0) {
      elements.dropZone.classList.remove("drag-active");
    }
  });

  window.addEventListener("drop", (e) => {
    state.dragDepth = 0;
    elements.dropZone.classList.remove("drag-active");
    if (state.isProcessing) return;
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  });

  // Clipboard paste support
  window.addEventListener("paste", (e) => {
    if (state.isProcessing) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          handleFile(file);
          break;
        }
      }
    }
  });
}

bindEvents();
setBackgroundMode("checkerboard");
setViewMode("side-by-side");
