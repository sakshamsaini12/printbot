/* ═══════════════════════════════════════════════════════════
   LICENSE SYSTEM  — server-validated, no secrets in client
   Demo counter tracked server-side by IP (not localStorage)
   so clearing browser data does NOT reset the demo limit.
   ═══════════════════════════════════════════════════════════ */
const LICENSE = (() => {
  const DEMO_LIMIT = 5;
  const LS_DEVICE  = "pb_device_id";
  const LS_LICENSE = "pb_license";

  // ── Device ID ────────────────────────────────────────────
  function uuid() {
    return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
      (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)).toUpperCase();
  }
  function getDeviceId() {
    let id = localStorage.getItem(LS_DEVICE);
    if (!id) { id = uuid(); localStorage.setItem(LS_DEVICE, id); }
    return id;
  }

  function getLicense() {
    try { return JSON.parse(localStorage.getItem(LS_LICENSE)); } catch { return null; }
  }

  // ── Activate ─────────────────────────────────────────────
  async function activate(key) {
    const clean    = key.trim().toUpperCase().replace(/[^A-Z0-9\-]/g, "").slice(0, 30);
    const deviceId = getDeviceId();
    try {
      const res  = await fetch("/api/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: clean, deviceId }),
      });
      const data = await res.json();
      if (!data.ok) return { ok: false, msg: data.msg || "Activation failed." };
      localStorage.setItem(LS_LICENSE, JSON.stringify({
        key: clean, deviceId, token: data.token, activatedAt: Date.now(),
      }));
      return { ok: true };
    } catch {
      return { ok: false, msg: "Cannot reach license server. Check your connection." };
    }
  }

  // ── Verify ───────────────────────────────────────────────
  async function verify() {
    const stored = getLicense();
    if (!stored || !stored.token) return false;
    const deviceId = getDeviceId();
    if (stored.deviceId !== deviceId) return false;
    try {
      const res  = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: stored.key, deviceId, token: stored.token }),
      });
      const data = await res.json();
      if (!data.ok) { localStorage.removeItem(LS_LICENSE); return false; }
      return true;
    } catch {
      // Offline grace: allow if activated within last 30 days
      const ago30 = Date.now() - 30 * 24 * 60 * 60 * 1000;
      return (stored.activatedAt || 0) > ago30;
    }
  }

  // ── Demo counter — SERVER-SIDE (IP-based, bypass-proof) ──
  // _demoRemaining is a cache so badge updates stay synchronous.
  let _demoRemaining = DEMO_LIMIT;

  async function refreshDemoCount() {
    try {
      const res  = await fetch("/api/demo/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: getDeviceId() }),
      });
      const data = await res.json();
      if (data.ok) _demoRemaining = data.remaining;
    } catch {
      // Server unreachable — keep current cached value
    }
  }

  /** Consume `count` demo slots server-side. Returns { ok, remaining }. */
  async function useDemo(count = 1) {
    try {
      const res  = await fetch("/api/demo/use", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: getDeviceId(), count }),
      });
      const data = await res.json();
      if (typeof data.remaining === "number") _demoRemaining = data.remaining;
      return data;
    } catch {
      // Offline fallback: decrement locally
      _demoRemaining = Math.max(0, _demoRemaining - count);
      return { ok: _demoRemaining >= 0, remaining: _demoRemaining };
    }
  }

  function demoRemaining() { return _demoRemaining; }
  function isDemo()        { return _demoRemaining > 0; }

  // ── Public state ─────────────────────────────────────────
  let _active = false;

  async function init() {
    _active = await verify();
    if (!_active) await refreshDemoCount();
    return _active;
  }
  function isActive()   { return _active; }
  function setActive(v) { _active = v; }

  return { init, isActive, setActive, activate,
           useDemo, refreshDemoCount, isDemo, demoRemaining, DEMO_LIMIT };
})();

const A4 = {
  width: 2480,
  height: 3508,
  margin: 80,
};

const MAGNET = {
  circle: {
    id: "circle",
    label: "58 mm",
    subtitle: "58 mm · 9 per page",
    magnetW: 709,
    magnetH: 709,
    slotW: 815,
    slotH: 815,
    borderRadius: 407,
    margin: 15,
    type: "circle",
  },
  square: {
    id: "square",
    label: "50 mm × 50 mm",
    subtitle: "50 mm × 50 mm · 12 per page",
    magnetW: 661,
    magnetH: 661,
    slotW: 732,
    slotH: 732,
    borderRadius: 72,
    margin: 40,
    type: "square",
  },
  rectangle: {
    id: "rectangle",
    label: "90 mm × 65 mm",
    subtitle: "90 mm × 65 mm · 4 per page",
    magnetW: 827,
    magnetH: 1134,
    slotW: 992,
    slotH: 1287,
    borderRadius: 72,
    safeMarginPx: 24,
    margin: 80,
    type: "rectangle",
  },
  heart: {
    id: "heart",
    label: "60 mm Heart",
    subtitle: "60 mm · 12 per page",
    magnetW: 709,
    magnetH: 709,
    slotW: 815,
    slotH: 815,
    borderRadius: 407,
    margin: 15,
    type: "path",
    path: "M 354.5 120 C 250 0 100 100 100 250 C 100 400 300 550 354.5 609 C 409 550 609 400 609 250 C 609 100 459 0 354.5 120 Z",
  },
  hexagon: {
    id: "hexagon",
    label: "60 mm Hexagon",
    subtitle: "60 mm · 12 per page",
    magnetW: 709,
    magnetH: 709,
    slotW: 815,
    slotH: 815,
    borderRadius: 407,
    margin: 15,
    type: "path",
    path: "M 354.5 0 L 709 177.25 L 709 531.75 L 354.5 709 L 0 531.75 L 0 177.25 Z",
  },
  star: {
    id: "star",
    label: "60 mm Star",
    subtitle: "60 mm · 12 per page",
    magnetW: 709,
    magnetH: 709,
    slotW: 815,
    slotH: 815,
    borderRadius: 407,
    margin: 15,
    type: "path",
    path: "M 354.5 0 L 464.3 222.5 L 709 258.1 L 531.8 430.8 L 573.6 674.6 L 354.5 559.4 L 135.4 674.6 L 177.2 430.8 L 0 258.1 L 244.7 222.5 Z",
  },
};

const FILTER_PRESETS = {
  original: { brightness: 1,    contrast: 1,    saturation: 1,    extra: "" },
  vivid:    { brightness: 1.05, contrast: 1.2,  saturation: 1.4,  extra: "" },
  bw:       { brightness: 1,    contrast: 1.1,  saturation: 0,    extra: "" },
  vintage:  { brightness: 1.05, contrast: 0.9,  saturation: 0.75, extra: "sepia(0.25)" },
  soft:     { brightness: 1.1,  contrast: 0.88, saturation: 0.9,  extra: "" },
  moody:    { brightness: 0.85, contrast: 1.25, saturation: 0.75, extra: "" },
};

function getFilterString(crop) {
  const b = (crop.brightness ?? 1).toFixed(2);
  const c = (crop.contrast ?? 1).toFixed(2);
  const s = (crop.saturation ?? 1).toFixed(2);
  const extra = crop.filterExtra || "";
  return `brightness(${b}) contrast(${c}) saturate(${s})${extra ? " " + extra : ""}`;
}

function getUsableDimensions(shapeId) {
  const shape = MAGNET[shapeId || "circle"];
  const margin = (shape && shape.margin !== undefined) ? shape.margin : A4.margin;
  return {
    width: A4.width - 2 * margin,
    height: A4.height - (margin + 180),
    margin: margin
  };
}

const state = {
  shapeId: null,
  files: [],
  items: [],
  pages: [],
  selectedPage: 0,
  footer: "MADE USING PRINTBOT ( Built By SHOPSHIP )",
  crops: {}, // uri -> { scale, offsetX, offsetY, aspectRatio, width, height }
  selectedImageUri: null,
  fileNames: {}, // uri -> custom display name
  fileQtys: {},  // uri -> repeat count (default 1)
  fileShapes: {}, // uri -> shapeId override (null = use global)
  previewZoom: 1.0, // canvas zoom level
};

const elements = {
  shapeGrid: document.getElementById("shape-grid"),
  fileInput: document.getElementById("file-input"),
  statCount: document.getElementById("stat-count"),
  statPages: document.getElementById("stat-pages"),
  previewCanvas: document.getElementById("preview-canvas"),
  emptyState: document.getElementById("empty-state"),
  thumbs: document.getElementById("thumbs"),
  statusText: document.getElementById("status-text"),
  btnGenerate: document.getElementById("btn-generate"),
  btnDownload: document.getElementById("btn-download"),
  btnPrint: document.getElementById("btn-print"),
  btnHelp: document.getElementById("btn-help"),
  btnCloseHelp: document.getElementById("btn-close-help"),
  helpDialog: document.getElementById("help-dialog"),
  
  // Crop Editor Elements
  tabA4: document.getElementById("tab-a4"),
  tabCrop: document.getElementById("tab-crop"),
  stageA4: document.getElementById("stage-a4"),
  stageCrop: document.getElementById("stage-crop"),
  cropInteractiveArea: document.getElementById("crop-interactive-area"),
  cropPreviewImg: document.getElementById("crop-preview-img"),
  cropGuidelines: document.getElementById("crop-guidelines"),
  sliderZoom: document.getElementById("slider-zoom"),
  sliderX: document.getElementById("slider-x"),
  sliderY: document.getElementById("slider-y"),
  btnCropReset: document.getElementById("btn-crop-reset"),
  btnCropFit: document.getElementById("btn-crop-fit"),
  btnCropApplyAll: document.getElementById("btn-crop-apply-all"),
  cropQueueGrid: document.getElementById("crop-queue-grid"),
  sliderBrightness: document.getElementById("slider-brightness"),
  sliderContrast: document.getElementById("slider-contrast"),
  sliderSaturation: document.getElementById("slider-saturation"),
  filterPresetsRow: document.getElementById("filter-presets-row"),
};

function uid() {
  return `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

// Utility: debounce — prevents rapid calls from hammering the layout engine
function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// Debounced versions used for interactive controls (qty, shape chips, resize)
const debouncedGenerateLayout = debounce(() => generateLayout(), 120);
const debouncedRenderPreview  = debounce(() => { if (state.pages.length) renderPreview(); }, 80);
// Debounced save — batches rapid localStorage writes (e.g. slider drags, qty clicks)
const debouncedSave = debounce(() => saveActiveDocument(), 400);

function packItems(items) {
  if (!items || items.length === 0) return { pages: [] };

  const firstShapeId = items[0].shapeId || state.shapeId || "circle";
  const { width: usableW, height: usableH, margin: pageMargin } = getUsableDimensions(firstShapeId);

  const indexed = items.map((item, i) => ({
    ...item,
    originalIndex: i,
    shape: MAGNET[item.shapeId],
  }));

  const sorted = indexed.slice().sort((a, b) => b.shape.slotH - a.shape.slotH);

  let pages = [];
  let currentShelves = [];

  function getPageHeight() {
    if (currentShelves.length === 0) return 0;
    const last = currentShelves[currentShelves.length - 1];
    return last.y + last.height;
  }

  sorted.forEach((item) => {
    const slotW = item.shape.slotW;
    const slotH = item.shape.slotH;

    let bestIdx = -1;
    let bestWaste = Infinity;
    let bestIsRotated = false;

    function tryFit(w, h, rotated) {
      currentShelves.forEach((shelf, idx) => {
        const remaining = usableW - shelf.currentX;
        if (remaining >= w) {
          const waste = Math.max(shelf.height, h) - h;
          if (waste < bestWaste) {
            bestWaste = waste;
            bestIdx = idx;
            bestIsRotated = rotated;
          }
        }
      });
    }

    tryFit(slotW, slotH, false);
    if (item.shapeId === "rectangle") {
      tryFit(slotH, slotW, true);
    }

    if (bestIdx !== -1) {
      const shelf = currentShelves[bestIdx];
      const w = bestIsRotated ? slotH : slotW;
      const h = bestIsRotated ? slotW : slotH;
      shelf.items.push({ ...item, shelfX: shelf.currentX, isRotated: bestIsRotated });
      shelf.currentX += w;
      shelf.height = Math.max(shelf.height, h);
    } else {
      let shelfW = slotW;
      let shelfH = slotH;
      let rot = false;

      if (item.shapeId === "rectangle" && slotW > usableW && slotH <= usableW) {
        shelfW = slotH;
        shelfH = slotW;
        rot = true;
      }

      let pageH = getPageHeight();
      if (pageH + shelfH > usableH) {
        pages.push({ shelves: currentShelves });
        currentShelves = [];
        pageH = 0;
      }
      const newShelf = {
        y: pageH,
        currentX: shelfW,
        height: shelfH,
        items: [{ ...item, shelfX: 0, isRotated: rot }],
      };
      currentShelves.push(newShelf);
    }
  });

  if (currentShelves.length > 0) {
    pages.push({ shelves: currentShelves });
  }

  const result = pages.map((page) => {
    let positioned = [];

    const MAX_GAP = 250;
    let minXGap = Infinity;

    page.shelves.forEach((shelf) => {
      if (shelf.items.length > 0) {
        const shelfItemsWidth = shelf.items.reduce((sum, it) => sum + (it.isRotated ? it.shape.slotH : it.shape.slotW), 0);
        const gap = Math.floor((usableW - shelfItemsWidth) / (shelf.items.length + 1));
        if (gap < minXGap) minXGap = gap;
      }
    });

    if (minXGap === Infinity) minXGap = 20;
    minXGap = Math.min(MAX_GAP, Math.max(20, minXGap));

    const totalItemsCount = page.shelves.reduce((sum, s) => sum + s.items.length, 0);

    const pageShelvesHeight = page.shelves.reduce((sum, s) => sum + s.height, 0);
    let minYGap = Math.floor((usableH - pageShelvesHeight) / (page.shelves.length + 1));
    if (totalItemsCount === 1) {
      minYGap = Math.min(minYGap, 100);
    }
    minYGap = Math.min(MAX_GAP, Math.max(20, minYGap));

    let currentY = pageMargin + minYGap;

    page.shelves.forEach((shelf) => {
      const shelfItemsWidth = shelf.items.reduce((sum, it) => {
        const w = it.isRotated ? it.shape.slotH : it.shape.slotW;
        return sum + w;
      }, 0);
      const xGap = Math.floor((usableW - shelfItemsWidth) / (shelf.items.length + 1));

      let firstGap = xGap;
      if (totalItemsCount === 1) {
        firstGap = minXGap;
      }

      let currentX = pageMargin + firstGap;

      shelf.items.forEach((item) => {
        const slotW = item.isRotated ? item.shape.slotH : item.shape.slotW;
        const slotH = item.isRotated ? item.shape.slotW : item.shape.slotH;
        const magnetW = item.isRotated ? item.shape.magnetH : item.shape.magnetW;
        const magnetH = item.isRotated ? item.shape.magnetW : item.shape.magnetH;

        const vertOffset = Math.floor((shelf.height - slotH) / 2);

        positioned.push({
          id: item.id,
          originalIndex: item.originalIndex,
          shapeId: item.shapeId,
          uri: item.uri,
          slotLeft: currentX,
          slotTop: currentY + vertOffset,
          slotW,
          slotH,
          magnetW,
          magnetH,
          shape: item.shape,
          isRotated: item.isRotated,
        });

        currentX += slotW + xGap;
      });

      currentY += shelf.height + minYGap;
    });

    positioned.sort((a, b) => a.originalIndex - b.originalIndex);
    return { items: positioned };
  });

  return { pages: result };
}

function parseSvgPath(svgText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, "image/svg+xml");
  const pathEl = doc.querySelector("path");
  if (pathEl) {
    return pathEl.getAttribute("d");
  }
  const polygonEl = doc.querySelector("polygon");
  if (polygonEl) {
    const points = polygonEl.getAttribute("points").trim().split(/\s+/);
    return "M " + points.join(" L ") + " Z";
  }
  return null;
}

function createShapeButtons() {
  const shapes = Object.values(MAGNET);
  let html = shapes
    .map(
      (shape) => `
      <button class="shape-card" data-shape="${shape.id}">
        <div class="shape-icon">${shapeIcon(shape.id)}</div>
        <div class="shape-text">
          <div class="shape-label">${shape.label}</div>
          <div class="shape-sub">${shape.subtitle}</div>
        </div>
      </button>
    `
    )
    .join("");

  // Append Custom Size card at the end
  html += `
    <button class="shape-card" id="btn-custom-size-trigger" style="border: 1.5px dashed var(--accent-2);">
      <div class="shape-icon" style="color: var(--accent-2);">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/></svg>
      </div>
      <div class="shape-text">
        <div class="shape-label">Custom Size</div>
        <div class="shape-sub">Enter dimensions</div>
      </div>
    </button>
  `;

  elements.shapeGrid.innerHTML = html;

  elements.shapeGrid.querySelectorAll(".shape-card").forEach((card) => {
    if (card.id === "btn-custom-size-trigger") {
      card.addEventListener("click", () => {
        const customSizeDialog = document.getElementById("custom-size-dialog");
        if (customSizeDialog) {
          customSizeDialog.showModal();
          const dotWrapper = document.getElementById("cursor-dot-wrapper");
          const ringWrapper = document.getElementById("cursor-ring-wrapper");
          if (dotWrapper && ringWrapper) {
            customSizeDialog.appendChild(dotWrapper);
            customSizeDialog.appendChild(ringWrapper);
          }
        }
      });
      return;
    }

    card.addEventListener("click", () => {
      state.shapeId = card.dataset.shape;
      Object.keys(state.fileShapes).forEach(uri => {
        state.fileShapes[uri] = state.shapeId;
      });
      rebuildItems();
      updateShapeSelection();
      if (state.files.length > 0) generateLayout();
      saveActiveDocument();
    });
  });
}

function shapeIcon(shapeId) {
  const shape = MAGNET[shapeId];
  const type = shape ? shape.type : shapeId;

  if (type === "circle") {
    return `<svg width="30" height="30" viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" stroke-width="5"/><circle cx="50" cy="50" r="30" fill="currentColor" fill-opacity="0.15"/></svg>`;
  }
  if (type === "square") {
    return `<svg width="30" height="30" viewBox="0 0 100 100"><rect x="12" y="12" width="76" height="76" rx="12" fill="none" stroke="currentColor" stroke-width="5"/><rect x="24" y="24" width="52" height="52" rx="6" fill="currentColor" fill-opacity="0.15"/></svg>`;
  }
  if (type === "rectangle" || type === "rect") {
    return `<svg width="26" height="34" viewBox="0 0 100 130"><rect x="12" y="10" width="76" height="110" rx="8" ry="8" fill="none" stroke="currentColor" stroke-width="5"/><rect x="24" y="22" width="52" height="86" rx="4" ry="4" fill="currentColor" fill-opacity="0.15"/></svg>`;
  }
  if (shape && shape.path) {
    return `<svg width="30" height="30" viewBox="0 0 709 709"><path d="${shape.path}" fill="none" stroke="currentColor" stroke-width="35"/><path d="${shape.path}" fill="currentColor" fill-opacity="0.15"/></svg>`;
  }
  return `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 22h20L12 2z"/></svg>`;
}

function updateWizardSteps() {
  const card1 = document.getElementById("card-step-1");
  const card2 = document.getElementById("card-step-2");
  const card3 = document.getElementById("card-step-3");

  // Helper: update step label to show checkmark when completed
  function setStepLabel(cardEl, stepNum, label, done) {
    if (!cardEl) return;
    const labelEl = cardEl.querySelector(".step-status-label");
    if (labelEl) labelEl.textContent = done ? "✓ Done" : label;
    cardEl.classList.toggle("step-done", done);
  }

  setStepLabel(card1, 1, "Pick a Template", !!state.shapeId);
  setStepLabel(card2, 2, "Upload Images", state.items && state.items.length > 0);
  setStepLabel(card3, 3, "Export Options", state.pages && state.pages.length > 0);
}

function updateShapeSelection() {
  elements.shapeGrid.querySelectorAll(".shape-card").forEach((card) => {
    card.classList.toggle("active", card.dataset.shape === state.shapeId);
  });
  updateWizardSteps();
}

function getImageDimensions(uri) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth || 1, height: img.naturalHeight || 1 });
    };
    img.onerror = () => {
      resolve({ width: 1, height: 1 });
    };
    img.src = uri;
  });
}

async function loadFiles(fileList) {
  if (!state.shapeId) {
    setStatus("Pick a shape first.");
    return;
  }

  const files = Array.from(fileList);
  if (!files.length) return;

  // ── License / demo check (server-side — IP-based, not clearable) ──
  let filesToLoad = Array.from(files);

  if (!LICENSE.isActive()) {
    // Always get fresh count from server before allowing upload
    await LICENSE.refreshDemoCount();
    const remaining = LICENSE.demoRemaining();

    if (remaining <= 0) {
      showActivationModal("You've used all 5 free demo uploads. Activate your license to continue.");
      return;
    }

    // Trim files to what's allowed
    if (filesToLoad.length > remaining) {
      filesToLoad = filesToLoad.slice(0, remaining);
      setStatus(`Demo: only ${remaining} more file${remaining !== 1 ? "s" : ""} allowed. Activate for unlimited.`);
    }

    // Consume demo slots server-side
    const result = await LICENSE.useDemo(filesToLoad.length);
    if (!result.ok && filesToLoad.length > 0) {
      showActivationModal("You've used all 5 free demo uploads. Activate your license to continue.");
      return;
    }
    updateLicenseBadge();
  }

  setStatus("Loading images...");
  const loaded = await Promise.all(
    filesToLoad.map(async (file) => {
      const uri = await readFileAsDataURL(file);
      const dims = await getImageDimensions(uri);
      
      if (!state.crops[uri]) {
        state.crops[uri] = {
          scale: 1.0,
          offsetX: 0,
          offsetY: 0,
          aspectRatio: dims.width / dims.height,
          width: dims.width,
          height: dims.height,
          brightness: 1,
          contrast: 1,
          saturation: 1,
          filterExtra: "",
          preset: "original",
        };
      }
      
      // Derive a friendly default name from the file's actual filename
      const rawName = file.name || "Image";
      const nameStem = rawName.replace(/\.[^.]+$/, ""); // strip extension

      return {
        id: uid(),
        file,
        uri,
        width: dims.width,
        height: dims.height,
        aspectRatio: dims.width / dims.height,
        name: nameStem,
        qty: 1,
      };
    })
  );

  // Skip duplicates (same URI already loaded)
  const existingUris = new Set(state.files.map(f => f.uri));
  const newFiles = loaded.filter(f => !existingUris.has(f.uri));

  newFiles.forEach(f => {
    if (!state.fileNames[f.uri]) state.fileNames[f.uri] = f.name;
    if (!state.fileQtys[f.uri]) state.fileQtys[f.uri] = f.qty;
    if (!state.fileShapes[f.uri]) state.fileShapes[f.uri] = state.shapeId || "circle";
  });


  state.files = state.files.concat(newFiles);
  // Rebuild items from files (qty-aware)
  rebuildItems();

  if (!state.selectedImageUri && state.items.length > 0) {
    state.selectedImageUri = state.items[0].uri;
  }

  elements.fileInput.value = "";

  updateStats();
  updateWizardSteps();
  renderImageQueue();
  generateLayout();
  saveActiveDocument();
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Rebuild state.items from state.files respecting qty and per-file shape
function rebuildItems() {
  state.items = [];
  state.files.forEach(file => {
    const qty = state.fileQtys[file.uri] || 1;
    // Use per-file shape if set; otherwise use the global default shape
    const shapeId = state.fileShapes[file.uri] || state.shapeId || "circle";
    for (let i = 0; i < qty; i++) {
      state.items.push({
        id: uid(),
        shapeId,
        uri: file.uri,
      });
    }
  });
}

function generateLayout() {
  if (state.items.length === 0) {
    setStatus("Upload images first.");
    return;
  }

  // Items already carry their per-file shapeId from rebuildItems()
  // Fall back to global shapeId if any item has none
  let itemsToLayout = state.items.map(item => ({
    ...item,
    shapeId: item.shapeId || state.shapeId || "circle",
  }));

  const packed = packItems(itemsToLayout);
  state.pages = packed.pages || [];
  state.selectedPage = 0;

  updateStats();
  updateWizardSteps();
  renderPreview();
  setStatus(state.pages.length ? "Layout ready." : "No pages created.");
}

function renderPreview() {
  if (elements.stageA4 && elements.stageA4.style.display === "none") {
    return; // on crop tab, don't re-render A4 preview
  }
  // Ensure stage is visible
  if (elements.stageA4) elements.stageA4.style.display = "flex";
  if (elements.stageA4) elements.stageA4.style.flexDirection = "column";
  elements.previewCanvas.innerHTML = "";

  const headerActions = document.getElementById("preview-header-actions");
  const pageCounter = document.getElementById("page-counter");

  if (!state.pages.length) {
    elements.emptyState.style.display = "flex";
    if (headerActions) headerActions.style.display = "none";
    return;
  }

  elements.emptyState.style.display = "none";
  if (headerActions) headerActions.style.display = "flex";

  // Update page count chip
  const n = state.pages.length;
  if (pageCounter) pageCounter.textContent = n === 1 ? "1 page" : `${n} pages`;

  // Update zoom label
  const zoomLabel = document.getElementById("zoom-label");
  if (zoomLabel) zoomLabel.textContent = Math.round(state.previewZoom * 100) + "%";

  // Compute scale — cap page width so it floats in grey canvas with visible margins (Canva-style)
  const scrollArea = document.getElementById("preview-scroll-area");
  const scrollW = scrollArea ? scrollArea.clientWidth : 900;
  // Max page width: container minus at least 80px of grey on each side, capped at 720px
  const maxPagePx = Math.min(720, scrollW - 80);
  const scale = (maxPagePx / A4.width) * state.previewZoom;

  // Render ALL pages stacked vertically (Canva-style)
  let pagesHtml = "";
  state.pages.forEach((page, index) => {
    const svg = createPageSvg(page, scale, index, true);
    const pageW = Math.round(A4.width * scale);
    const pageH = Math.round(A4.height * scale);
    const delay = (index * 0.09).toFixed(2);
    pagesHtml += `
      <div class="page-enter" style="animation-delay:${delay}s;" data-page="${index}">
        <div class="canva-page-sheet" style="width:${pageW}px;height:${pageH}px;overflow:hidden;flex-shrink:0;">
          ${svg}
        </div>
      </div>
    `;
  });
  elements.previewCanvas.innerHTML = pagesHtml;
}

function createPageSvg(page, scale, pageIndex, includeFooter) {
  const width = A4.width * scale;
  const height = A4.height * scale;

  const items = page.items
    .map((item, i) => createItemSvg(item, scale, pageIndex, i))
    .join("");

  const footer = includeFooter
    ? `<text x="${width / 2}" y="${height - 40 * scale}" font-size="${40 * scale}" fill="#000" text-anchor="middle" font-weight="700" letter-spacing="${8 * scale}" font-family="Space Mono, monospace">${escapeXml(state.footer)}</text>`
    : "";

  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#ffffff" />
      ${items}
      ${footer}
    </svg>
  `;
}

function createItemSvg(item, scale, pageIndex, itemIndex) {
  const shape = MAGNET[item.shapeId];
  const clipId = `clip_${pageIndex}_${itemIndex}`;

  if (shape && (shape.type === "path" || shape.path)) {
    const slotLeft = item.slotLeft * scale;
    const slotTop = item.slotTop * scale;
    const slotW = item.slotW * scale;
    const slotH = item.slotH * scale;
    const magnetW = item.magnetW * scale;
    const magnetH = item.magnetH * scale;
    const imageX = slotLeft + (slotW - magnetW) / 2;
    const imageY = slotTop + (slotH - magnetH) / 2;

    const crop = state.crops[item.uri] || { scale: 1.0, offsetX: 0, offsetY: 0, aspectRatio: 1.0 };
    const rSlot = shape.magnetW / shape.magnetH;
    const rImg = crop.aspectRatio;

    let wBase, hBase;
    if (rImg > rSlot) {
      hBase = shape.magnetH;
      wBase = shape.magnetH * rImg;
    } else {
      wBase = shape.magnetW;
      hBase = shape.magnetW / rImg;
    }

    const wZoomed = wBase * crop.scale;
    const hZoomed = hBase * crop.scale;

    const relX = shape.magnetW / 2 - wZoomed / 2 + crop.offsetX;
    const relY = shape.magnetH / 2 - hZoomed / 2 + crop.offsetY;

    const finalImageW = wZoomed * scale;
    const finalImageH = hZoomed * scale;
    const finalImageX = imageX + relX * scale;
    const finalImageY = imageY + relY * scale;

    const scaleFactorX = magnetW / 709;
    const scaleFactorY = magnetH / 709;

    const boundaryX = slotLeft + scale;
    const boundaryY = slotTop + scale;
    const boundaryW = slotW - 2 * scale;
    const boundaryH = slotH - 2 * scale;
    return `
      <g>
        <path d="${shape.path}" transform="translate(${slotLeft + (slotW - magnetW)/2}, ${slotTop + (slotH - magnetH)/2}) scale(${scaleFactorX}, ${scaleFactorY})" stroke="#444" stroke-width="${2 * scale}" stroke-dasharray="${6 * scale} ${3 * scale}" fill="none" />
        <defs>
          <clipPath id="${clipId}">
            <path d="${shape.path}" transform="translate(${imageX}, ${imageY}) scale(${scaleFactorX}, ${scaleFactorY})" />
          </clipPath>
        </defs>
        <image href="${item.uri}" x="${finalImageX}" y="${finalImageY}" width="${finalImageW}" height="${finalImageH}" clip-path="url(#${clipId})" style="filter: ${getFilterString(crop)}" />
        <path d="${shape.path}" transform="translate(${imageX}, ${imageY}) scale(${scaleFactorX}, ${scaleFactorY})" stroke="#000" stroke-width="${1.5 * scale}" fill="none" />
      </g>
    `;
  }

  if (shape && (shape.type === "circle" || item.shapeId === "circle")) {
    const slotLeft = item.slotLeft * scale;
    const slotTop = item.slotTop * scale;
    const slotW = item.slotW * scale;
    const slotH = item.slotH * scale;
    const magnetW = item.magnetW * scale;
    const magnetH = item.magnetH * scale;
    const imageX = slotLeft + (slotW - magnetW) / 2;
    const imageY = slotTop + (slotH - magnetH) / 2;

    const crop = state.crops[item.uri] || { scale: 1.0, offsetX: 0, offsetY: 0, aspectRatio: 1.0 };
    const rSlot = shape.magnetW / shape.magnetH;
    const rImg = crop.aspectRatio;

    let wBase, hBase;
    if (rImg > rSlot) {
      hBase = shape.magnetH;
      wBase = shape.magnetH * rImg;
    } else {
      wBase = shape.magnetW;
      hBase = shape.magnetW / rImg;
    }

    const wZoomed = wBase * crop.scale;
    const hZoomed = hBase * crop.scale;

    const relX = shape.magnetW / 2 - wZoomed / 2 + crop.offsetX;
    const relY = shape.magnetH / 2 - hZoomed / 2 + crop.offsetY;

    const finalImageW = wZoomed * scale;
    const finalImageH = hZoomed * scale;
    const finalImageX = imageX + relX * scale;
    const finalImageY = imageY + relY * scale;

    const rOuter = (slotW - 8 * scale) / 2;
    const rInner = magnetW / 2;
    return `
      <g>
        <circle cx="${slotLeft + slotW / 2}" cy="${slotTop + slotH / 2}" r="${rOuter}" stroke="#444" stroke-width="${2 * scale}" fill="none" />
        <defs>
          <clipPath id="${clipId}">
            <circle cx="${imageX + rInner}" cy="${imageY + rInner}" r="${rInner}" />
          </clipPath>
        </defs>
        <image href="${item.uri}" x="${finalImageX}" y="${finalImageY}" width="${finalImageW}" height="${finalImageH}" clip-path="url(#${clipId})" style="filter: ${getFilterString(crop)}" />
        <circle cx="${imageX + rInner}" cy="${imageY + rInner}" r="${rInner}" stroke="#000" stroke-width="${1.5 * scale}" fill="none" />
      </g>
    `;
  }

  if (shape && (shape.type === "square" || item.shapeId === "square")) {
    const slotLeft = item.slotLeft * scale;
    const slotTop = item.slotTop * scale;
    const slotW = item.slotW * scale;
    const slotH = item.slotH * scale;
    const magnetW = item.magnetW * scale;
    const magnetH = item.magnetH * scale;
    const imageX = slotLeft + (slotW - magnetW) / 2;
    const imageY = slotTop + (slotH - magnetH) / 2;

    const crop = state.crops[item.uri] || { scale: 1.0, offsetX: 0, offsetY: 0, aspectRatio: 1.0 };
    const rSlot = shape.magnetW / shape.magnetH;
    const rImg = crop.aspectRatio;

    let wBase, hBase;
    if (rImg > rSlot) {
      hBase = shape.magnetH;
      wBase = shape.magnetH * rImg;
    } else {
      wBase = shape.magnetW;
      hBase = shape.magnetW / rImg;
    }

    const wZoomed = wBase * crop.scale;
    const hZoomed = hBase * crop.scale;

    const relX = shape.magnetW / 2 - wZoomed / 2 + crop.offsetX;
    const relY = shape.magnetH / 2 - hZoomed / 2 + crop.offsetY;

    const finalImageW = wZoomed * scale;
    const finalImageH = hZoomed * scale;
    const finalImageX = imageX + relX * scale;
    const finalImageY = imageY + relY * scale;

    const shapeRadius = (shape && shape.borderRadius) || 0;
    const outerBr = shapeRadius * scale + (slotW - magnetW) / 2;
    const squareSize = slotW - 2 * scale;
    const outerX = slotLeft + (slotW - squareSize) / 2;
    const outerY = slotTop + (slotH - squareSize) / 2;
    return `
      <g>
        <rect x="${outerX}" y="${outerY}" width="${squareSize}" height="${squareSize}" rx="${outerBr}" ry="${outerBr}" stroke="#444" stroke-width="${2 * scale}" fill="none" />
        <defs>
          <clipPath id="${clipId}">
            <rect x="${imageX}" y="${imageY}" width="${magnetW}" height="${magnetH}" rx="${shapeRadius * scale}" ry="${shapeRadius * scale}" />
          </clipPath>
        </defs>
        <image href="${item.uri}" x="${finalImageX}" y="${finalImageY}" width="${finalImageW}" height="${finalImageH}" clip-path="url(#${clipId})" style="filter: ${getFilterString(crop)}" />
        <rect x="${imageX}" y="${imageY}" width="${magnetW}" height="${magnetH}" rx="${shapeRadius * scale}" ry="${shapeRadius * scale}" stroke="#000" stroke-width="${1.5 * scale}" fill="none" />
      </g>
    `;
  }

  // Rectangle preset (with group-based rotation)
  const rx = 40 * scale;
  const ry = 40 * scale;

  // Local unrotated slot and magnet dimensions
  const localSlotW = shape.slotW * scale;
  const localSlotH = shape.slotH * scale;
  const localMagnetW = shape.magnetW * scale;
  const localMagnetH = shape.magnetH * scale;

  const localImageX = (localSlotW - localMagnetW) / 2;
  const localImageY = (localSlotH - localMagnetH) / 2;

  const localOuterX = 4 * scale;
  const localOuterY = 4 * scale;
  const localOuterW = localSlotW - 8 * scale;
  const localOuterH = localSlotH - 8 * scale;
  const localOuterRx = rx + 4 * scale;
  const localOuterRy = ry + 4 * scale;

  const crop = state.crops[item.uri] || { scale: 1.0, offsetX: 0, offsetY: 0, aspectRatio: 1.0 };
  const rSlot = shape.magnetW / shape.magnetH;
  const rImg = crop.aspectRatio;

  let wBase, hBase;
  if (rImg > rSlot) {
    hBase = shape.magnetH;
    wBase = shape.magnetH * rImg;
  } else {
    wBase = shape.magnetW;
    hBase = shape.magnetW / rImg;
  }

  const wZoomed = wBase * crop.scale;
  const hZoomed = hBase * crop.scale;

  const relX = shape.magnetW / 2 - wZoomed / 2 + crop.offsetX;
  const relY = shape.magnetH / 2 - hZoomed / 2 + crop.offsetY;

  const finalImageW = wZoomed * scale;
  const finalImageH = hZoomed * scale;
  const finalImageX = localImageX + relX * scale;
  const finalImageY = localImageY + relY * scale;


  const transform = item.isRotated
    ? `transform="translate(${(item.slotLeft + item.slotW) * scale}, ${item.slotTop * scale}) rotate(90)"`
    : `transform="translate(${item.slotLeft * scale}, ${item.slotTop * scale})"`;

  const showBndRect = shape.showBoundary !== false;
  return `
    <g ${transform}>
      ${showBndRect ? `<rect x="${localOuterX}" y="${localOuterY}" width="${localOuterW}" height="${localOuterH}" rx="${localOuterRx}" ry="${localOuterRy}" stroke="#555" stroke-width="${2 * scale}" fill="none" />` : ""}
      <defs>
        <clipPath id="${clipId}">
          <rect x="${localImageX}" y="${localImageY}" width="${localMagnetW}" height="${localMagnetH}" rx="${rx}" ry="${ry}" />
        </clipPath>
      </defs>
      <image href="${item.uri}" x="${finalImageX}" y="${finalImageY}" width="${finalImageW}" height="${finalImageH}" clip-path="url(#${clipId})" style="filter: ${getFilterString(crop)}" />
      <rect x="${localImageX}" y="${localImageY}" width="${localMagnetW}" height="${localMagnetH}" rx="${rx}" ry="${ry}" stroke="#000" stroke-width="${1.5 * scale}" fill="none" />
    </g>
  `;
}

function escapeXml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function updateStats() {
  elements.statCount.textContent = state.items.length;
  elements.statPages.textContent = state.pages.length;
}

function setStatus(message) {
  const el = elements.statusText;
  if (!el) return;
  // Quick fade-out → update → fade-in
  el.style.transition = "opacity 0.1s ease, transform 0.1s ease";
  el.style.opacity = "0";
  el.style.transform = "translateY(2px)";
  requestAnimationFrame(() => {
    setTimeout(() => {
      el.textContent = message;
      el.style.opacity = "1";
      el.style.transform = "translateY(0)";
    }, 100);
  });
}

// License system removed - all features unlocked

async function downloadPngs() {
  if (!state.pages.length) {
    setStatus("Generate a layout first.");
    return;
  }

  setStatus("Exporting PNGs...");
  await document.fonts.ready;

  try {
    for (let i = 0; i < state.pages.length; i++) {
      const svg = createPageSvg(state.pages[i], 1, i, true);
      const pngDataUrl = await svgToPng(svg, A4.width, A4.height);
      triggerDownload(pngDataUrl, `PrintBot_page_${i + 1}.png`);
    }
    setStatus("Download complete.");
  } catch (err) {
    setStatus("Export failed. Try again or reduce image count.");
    console.error("PNG export error:", err);
  }
}

async function printPages() {
  if (!state.pages.length) {
    setStatus("Generate a layout first.");
    return;
  }

  setStatus("Preparing print…");
  await document.fonts.ready;

  // Render at 3x for sharp print output (~300 DPI equivalent)
  const PRINT_SCALE = 3;
  const printW = Math.round(A4.width  * PRINT_SCALE);
  const printH = Math.round(A4.height * PRINT_SCALE);

  let images = [];
  try {
    for (let i = 0; i < state.pages.length; i++) {
      const svg = createPageSvg(state.pages[i], PRINT_SCALE, i, true);
      const pngDataUrl = await svgToPng(svg, printW, printH);
      images.push(pngDataUrl);
      setStatus(`Rendering page ${i + 1} of ${state.pages.length}…`);
    }
  } catch (err) {
    setStatus("Print preparation failed. Try downloading PNGs instead.");
    console.error("Print render error:", err);
    return;
  }

  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    setStatus("Pop-up blocked — allow pop-ups and try again.");
    return;
  }

  // A4 at 96 DPI = 210×297 mm
  const html = `<!DOCTYPE html>
<html>
  <head>
    <title>PrintBot — Print Layout</title>
    <style>
      @page { size: 210mm 297mm; margin: 0; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { background: white; }
      .print-page {
        width: 210mm;
        height: 297mm;
        overflow: hidden;
        page-break-after: always;
        break-after: page;
      }
      .print-page img {
        width: 210mm;
        height: 297mm;
        display: block;
        object-fit: contain;
      }
    </style>
  </head>
  <body>
    ${images.map(src => `<div class="print-page"><img src="${src}" /></div>`).join("\n")}
    <script>
      // Wait for all images to fully load before opening print dialog
      window.addEventListener("load", function() {
        setTimeout(function() { window.print(); }, 200);
      });
    <\/script>
  </body>
</html>`;

  printWindow.document.write(html);
  printWindow.document.close();
  setStatus("Print dialog opening…");
}

function svgToPng(svgString, width, height) {
  return new Promise((resolve, reject) => {
    // Draw SVG onto a canvas directly using a data URI (avoids CORS blob URL issues
    // with embedded data: images inside <image> tags)
    const encoded = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgString);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width  = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("SVG render failed"));
    img.src = encoded;
  });
}


function triggerDownload(dataUrl, filename) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function updateCropImageStyleOnly() {
  if (!state.selectedImageUri) return;
  const crop = state.crops[state.selectedImageUri];
  const shape = MAGNET[state.shapeId];
  if (!shape) return;
  
  const maxWorkspaceDim = 360;
  let editorW, editorH;
  if (shape.slotW > shape.slotH) {
    editorW = maxWorkspaceDim;
    editorH = maxWorkspaceDim * (shape.slotH / shape.slotW);
  } else {
    editorH = maxWorkspaceDim;
    editorW = maxWorkspaceDim * (shape.slotW / shape.slotH);
  }
  const editorScale = editorW / shape.slotW;

  const rSlot = shape.magnetW / shape.magnetH;
  const rImg = crop.aspectRatio;
  let wBase, hBase;
  if (rImg > rSlot) {
    hBase = shape.magnetH;
    wBase = shape.magnetH * rImg;
  } else {
    wBase = shape.magnetW;
    hBase = shape.magnetW / rImg;
  }
  const wZoomed = wBase * crop.scale;
  const hZoomed = hBase * crop.scale;

  const xOffsetSlot = (shape.slotW - shape.magnetW) / 2;
  const yOffsetSlot = (shape.slotH - shape.magnetH) / 2;
  const relX = shape.magnetW / 2 - wZoomed / 2 + crop.offsetX;
  const relY = shape.magnetH / 2 - hZoomed / 2 + crop.offsetY;
  const xNative = xOffsetSlot + relX;
  const yNative = yOffsetSlot + relY;

  elements.cropPreviewImg.style.width = `${wZoomed * editorScale}px`;
  elements.cropPreviewImg.style.height = `${hZoomed * editorScale}px`;
  elements.cropPreviewImg.style.left = `${xNative * editorScale}px`;
  elements.cropPreviewImg.style.top = `${yNative * editorScale}px`;
}

function updateCropUI() {
  if (!state.selectedImageUri) {
    elements.cropPreviewImg.src = "";
    elements.cropPreviewImg.style.display = "none";
    elements.sliderZoom.disabled = true;
    elements.sliderX.disabled = true;
    elements.sliderY.disabled = true;
    return;
  }
  elements.cropPreviewImg.style.display = "block";

  const crop = state.crops[state.selectedImageUri];
  const shape = MAGNET[state.shapeId];
  if (!shape) return;
  
  const maxWorkspaceDim = 360;
  let editorW, editorH;
  if (shape.slotW > shape.slotH) {
    editorW = maxWorkspaceDim;
    editorH = maxWorkspaceDim * (shape.slotH / shape.slotW);
  } else {
    editorH = maxWorkspaceDim;
    editorW = maxWorkspaceDim * (shape.slotW / shape.slotH);
  }
  const editorScale = editorW / shape.slotW;

  elements.cropInteractiveArea.style.width = `${editorW}px`;
  elements.cropInteractiveArea.style.height = `${editorH}px`;

  const rSlot = shape.magnetW / shape.magnetH;
  const rImg = crop.aspectRatio;
  let wBase, hBase;
  if (rImg > rSlot) {
    hBase = shape.magnetH;
    wBase = shape.magnetH * rImg;
  } else {
    wBase = shape.magnetW;
    hBase = shape.magnetW / rImg;
  }
  const wZoomed = wBase * crop.scale;
  const hZoomed = hBase * crop.scale;

  const maxOffsetX = (wZoomed - shape.magnetW) / 2;
  const maxOffsetY = (hZoomed - shape.magnetH) / 2;
  crop.offsetX = Math.max(-maxOffsetX, Math.min(maxOffsetX, crop.offsetX));
  crop.offsetY = Math.max(-maxOffsetY, Math.min(maxOffsetY, crop.offsetY));

  const xOffsetSlot = (shape.slotW - shape.magnetW) / 2;
  const yOffsetSlot = (shape.slotH - shape.magnetH) / 2;
  const relX = shape.magnetW / 2 - wZoomed / 2 + crop.offsetX;
  const relY = shape.magnetH / 2 - hZoomed / 2 + crop.offsetY;
  const xNative = xOffsetSlot + relX;
  const yNative = yOffsetSlot + relY;

  elements.cropPreviewImg.src = state.selectedImageUri;
  elements.cropPreviewImg.style.width = `${wZoomed * editorScale}px`;
  elements.cropPreviewImg.style.height = `${hZoomed * editorScale}px`;
  elements.cropPreviewImg.style.left = `${xNative * editorScale}px`;
  elements.cropPreviewImg.style.top = `${yNative * editorScale}px`;

  updateGuidelinesSvg(shape);

  elements.sliderZoom.disabled = false;
  elements.sliderZoom.value = crop.scale;
  document.getElementById("val-zoom").textContent = crop.scale.toFixed(2);

  elements.sliderX.min = -Math.ceil(maxOffsetX);
  elements.sliderX.max = Math.ceil(maxOffsetX);
  elements.sliderX.value = Math.round(crop.offsetX);
  document.getElementById("val-x").textContent = Math.round(crop.offsetX);
  elements.sliderX.disabled = maxOffsetX <= 0;

  elements.sliderY.min = -Math.ceil(maxOffsetY);
  elements.sliderY.max = Math.ceil(maxOffsetY);
  elements.sliderY.value = Math.round(crop.offsetY);
  document.getElementById("val-y").textContent = Math.round(crop.offsetY);
  elements.sliderY.disabled = maxOffsetY <= 0;

  // Sync filter sliders
  if (elements.sliderBrightness) {
    elements.sliderBrightness.value = crop.brightness ?? 1;
    document.getElementById("val-brightness").textContent = (crop.brightness ?? 1).toFixed(2);
  }
  if (elements.sliderContrast) {
    elements.sliderContrast.value = crop.contrast ?? 1;
    document.getElementById("val-contrast").textContent = (crop.contrast ?? 1).toFixed(2);
  }
  if (elements.sliderSaturation) {
    elements.sliderSaturation.value = crop.saturation ?? 1;
    document.getElementById("val-saturation").textContent = (crop.saturation ?? 1).toFixed(2);
  }
  // Sync preset buttons
  if (elements.filterPresetsRow) {
    elements.filterPresetsRow.querySelectorAll(".filter-preset-btn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.preset === (crop.preset || "original"));
    });
  }
  // Apply filter to live preview image
  elements.cropPreviewImg.style.filter = getFilterString(crop);
}

function updateGuidelinesSvg(shape) {
  const svg = elements.cropGuidelines;
  svg.setAttribute("viewBox", `0 0 ${shape.slotW} ${shape.slotH}`);
  svg.innerHTML = "";

  const w = shape.slotW;
  const h = shape.slotH;
  const mw = shape.magnetW;
  const mh = shape.magnetH;
  const xCut = (w - mw) / 2;
  const yCut = (h - mh) / 2;
  const cx = w / 2;
  const cy = h / 2;

  let maskPath = "";
  let cutPath = "";
  let safePath = "";

  if (shape.id === "circle") {
    const rCut = mw / 2;
    const rSafe = rCut - 24;
    
    maskPath = `<circle cx="${cx}" cy="${cy}" r="${rCut}" fill="black" />`;
    cutPath = `<circle cx="${cx}" cy="${cy}" r="${rCut}" stroke="#10b981" stroke-width="3.5" fill="none" />`;
    safePath = `<circle cx="${cx}" cy="${cy}" r="${rSafe}" stroke="#6366f1" stroke-width="2.5" stroke-dasharray="8,6" fill="none" />`;
  } else if (shape.id === "square") {
    const br = shape.borderRadius || 0;
    const brSafe = Math.max(0, br - 24);
    
    maskPath = `<rect x="${xCut}" y="${yCut}" width="${mw}" height="${mh}" rx="${br}" ry="${br}" fill="black" />`;
    cutPath = `<rect x="${xCut}" y="${yCut}" width="${mw}" height="${mh}" rx="${br}" ry="${br}" stroke="#10b981" stroke-width="3.5" fill="none" />`;
    safePath = `<rect x="${xCut + 24}" y="${yCut + 24}" width="${mw - 48}" height="${mh - 48}" rx="${brSafe}" ry="${brSafe}" stroke="#6366f1" stroke-width="2.5" stroke-dasharray="8,6" fill="none" />`;
  } else if (shape.type === "path" || shape.path) {
    const scaleFactorX = mw / 709;
    const scaleFactorY = mh / 709;
    maskPath = `<path d="${shape.path}" transform="translate(${xCut}, ${yCut}) scale(${scaleFactorX}, ${scaleFactorY})" fill="black" />`;
    cutPath = `<path d="${shape.path}" transform="translate(${xCut}, ${yCut}) scale(${scaleFactorX}, ${scaleFactorY})" stroke="#10b981" stroke-width="3.5" fill="none" />`;
    safePath = `<path d="${shape.path}" transform="translate(${cx}, ${cy}) scale(${scaleFactorX * 0.90}, ${scaleFactorY * 0.90}) translate(${-354.5}, ${-354.5})" stroke="#6366f1" stroke-width="2.5" stroke-dasharray="8,6" fill="none" />`;
  } else {
    const br = shape.borderRadius || 0;
    const brSafe = Math.max(0, br - 24);
    
    maskPath = `<rect x="${xCut}" y="${yCut}" width="${mw}" height="${mh}" rx="${br}" ry="${br}" fill="black" />`;
    cutPath = `<rect x="${xCut}" y="${yCut}" width="${mw}" height="${mh}" rx="${br}" ry="${br}" stroke="#10b981" stroke-width="3.5" fill="none" />`;
    safePath = `<rect x="${xCut + 24}" y="${yCut + 24}" width="${mw - 48}" height="${mh - 48}" rx="${brSafe}" ry="${brSafe}" stroke="#6366f1" stroke-width="2.5" stroke-dasharray="8,6" fill="none" />`;
  }

  svg.innerHTML = `
    <defs>
      <mask id="editor-crop-mask">
        <rect x="0" y="0" width="${w}" height="${h}" fill="white" />
        ${maskPath}
      </mask>
    </defs>
    
    <rect x="0" y="0" width="${w}" height="${h}" fill="rgba(9, 9, 11, 0.75)" mask="url(#editor-crop-mask)" />
    
    <rect x="2" y="2" width="${w - 4}" height="${h - 4}" stroke="rgba(239, 68, 68, 0.35)" stroke-width="2.5" stroke-dasharray="8,6" fill="none" />
    <text x="14" y="26" fill="rgba(239, 68, 68, 0.85)" font-size="16" font-family="Space Mono, monospace" font-weight="700">BLEED ZONE</text>
    
    ${cutPath}
    <text x="${xCut + 14}" y="${yCut - 10}" fill="#10b981" font-size="16" font-family="Space Mono, monospace" font-weight="700">CUT LINE</text>
    
    ${safePath}
    <text x="${xCut + 34}" y="${yCut + 42}" fill="#6366f1" font-size="16" font-family="Space Mono, monospace" font-weight="700">SAFE AREA</text>
  `;
}

function createThumbSvg(item, crop) {
  const shape = MAGNET[state.shapeId];
  if (!shape) return "";
  const scale = 80 / shape.slotW;
  const w = 80;
  const h = shape.slotH * scale;

  const clipId = `thumb_clip_${item.id}`;
  const mw = shape.magnetW * scale;
  const mh = shape.magnetH * scale;
  const imageX = (w - mw) / 2;
  const imageY = (h - mh) / 2;

  const rSlot = shape.magnetW / shape.magnetH;
  const rImg = crop.aspectRatio;
  let wBase, hBase;
  if (rImg > rSlot) {
    hBase = shape.magnetH;
    wBase = shape.magnetH * rImg;
  } else {
    wBase = shape.magnetW;
    hBase = shape.magnetW / rImg;
  }
  const wZoomed = wBase * crop.scale;
  const hZoomed = hBase * crop.scale;
  const relX = shape.magnetW / 2 - wZoomed / 2 + crop.offsetX;
  const relY = shape.magnetH / 2 - hZoomed / 2 + crop.offsetY;

  const finalImageW = wZoomed * scale;
  const finalImageH = hZoomed * scale;
  const finalImageX = imageX + relX * scale;
  const finalImageY = imageY + relY * scale;

  let clipPathContent = "";
  let outlineContent = "";
  if (state.shapeId === "circle" || shape.type === "circle") {
    clipPathContent = `<circle cx="${w / 2}" cy="${h / 2}" r="${mw / 2}" />`;
    outlineContent = `<circle cx="${w / 2}" cy="${h / 2}" r="${mw / 2}" stroke="rgba(255,255,255,0.2)" stroke-width="1.5" fill="none" />`;
  } else if (shape.type === "path" || shape.path) {
    const scaleFactorX = mw / 709;
    const scaleFactorY = mh / 709;
    clipPathContent = `<path d="${shape.path}" transform="translate(${imageX}, ${imageY}) scale(${scaleFactorX}, ${scaleFactorY})" />`;
    outlineContent = `<path d="${shape.path}" transform="translate(${imageX}, ${imageY}) scale(${scaleFactorX}, ${scaleFactorY})" stroke="rgba(255,255,255,0.2)" stroke-width="1.5" fill="none" />`;
  } else {
    clipPathContent = `<rect x="${imageX}" y="${imageY}" width="${mw}" height="${mh}" rx="${shape.borderRadius * scale}" ry="${shape.borderRadius * scale}" />`;
    outlineContent = `<rect x="${imageX}" y="${imageY}" width="${mw}" height="${mh}" rx="${shape.borderRadius * scale}" ry="${shape.borderRadius * scale}" stroke="rgba(255,255,255,0.2)" stroke-width="1.5" fill="none" />`;
  }

  return `
    <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="rgba(255,255,255,0.03)" />
      <defs>
        <clipPath id="${clipId}">
          ${clipPathContent}
        </clipPath>
      </defs>
      <image href="${item.uri}" x="${finalImageX}" y="${finalImageY}" width="${finalImageW}" height="${finalImageH}" clip-path="url(#${clipId})" />
      ${outlineContent}
    </svg>
  `;
}

function updateActiveCropQueueThumb() {
  if (!state.selectedImageUri) return;
  const queueGrid = elements.cropQueueGrid;
  if (!queueGrid) return;
  
  // Find the thumb container that represents the active image by looking for the active class
  const activeThumbEl = queueGrid.querySelector(`.crop-queue-thumb.active`);
  if (activeThumbEl) {
    const item = state.items.find(i => i.uri === state.selectedImageUri);
    if (item) {
      const crop = state.crops[item.uri] || { scale: 1.0, offsetX: 0, offsetY: 0, aspectRatio: 1.0 };
      const thumbSvg = createThumbSvg(item, crop);
      const wrapper = activeThumbEl.querySelector(".thumb-wrapper");
      if (wrapper) {
        const svgEl = wrapper.querySelector("svg");
        if (svgEl) {
          svgEl.outerHTML = thumbSvg;
        } else {
          renderCropQueue();
        }
      }
    }
  }
}

function updateActivePageStripThumb() {
  if (elements.stageA4 && elements.stageA4.style.display === "none") {
    return;
  }
  const thumbsEl = document.getElementById("thumbs");
  if (!thumbsEl) return;
  const activeThumb = thumbsEl.querySelector(`.thumb.active`);
  if (activeThumb) {
    const imgWrapper = activeThumb.querySelector(".thumb-page-img");
    if (imgWrapper) {
      const pageIndex = state.selectedPage;
      if (state.pages[pageIndex]) {
        const thumbSvg = createPageSvg(state.pages[pageIndex], 0.085, pageIndex, false);
        imgWrapper.innerHTML = thumbSvg;
      }
    }
  }
}

function renderCropQueue() {
  const queueGrid = elements.cropQueueGrid;
  queueGrid.innerHTML = "";

  if (state.items.length === 0) {
    queueGrid.innerHTML = `<div class="empty-queue">No images uploaded. Add some above.</div>`;
    return;
  }

  // Use a Set for O(1) dedup instead of O(n²) Array.includes
  const seenUris = new Set();
  const uniqueItems = [];
  state.items.forEach((item) => {
    if (!seenUris.has(item.uri)) {
      seenUris.add(item.uri);
      uniqueItems.push(item);
    }
  });

  uniqueItems.forEach((item) => {
    const isActive = item.uri === state.selectedImageUri;
    const thumbContainer = document.createElement("div");
    thumbContainer.className = `crop-queue-thumb ${isActive ? "active" : ""}`;
    
    const crop = state.crops[item.uri] || { scale: 1.0, offsetX: 0, offsetY: 0, aspectRatio: 1.0 };
    const thumbSvg = createThumbSvg(item, crop);
    
    thumbContainer.innerHTML = `
      <div class="thumb-wrapper">
        ${thumbSvg}
        <button class="delete-btn" title="Delete Image" data-uri="${item.uri}">×</button>
      </div>
    `;

    thumbContainer.querySelector(".thumb-wrapper").addEventListener("click", (e) => {
      if (e.target.classList.contains("delete-btn")) return;
      state.selectedImageUri = item.uri;
      updateCropUI();
      renderCropQueue();
    });

    thumbContainer.querySelector(".delete-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      deleteImage(item.uri);
    });

    queueGrid.appendChild(thumbContainer);
  });
}

function deleteImage(uri) {
  state.items = state.items.filter((item) => item.uri !== uri);
  state.files = state.files.filter((file) => file.uri !== uri);
  delete state.crops[uri];
  delete state.fileNames[uri];
  delete state.fileQtys[uri];
  delete state.fileShapes[uri];

  if (state.selectedImageUri === uri) {
    if (state.files.length > 0) {
      state.selectedImageUri = state.files[0].uri;
    } else {
      state.selectedImageUri = null;
    }
  }

  updateStats();
  if (state.items.length > 0) {
    generateLayout();
  } else {
    state.pages = [];
    state.selectedPage = 0;
    renderPreview();
  }
  updateWizardSteps();
  renderImageQueue();
  updateCropUI();
  renderCropQueue();
  saveActiveDocument();
}

function renderImageQueue() {
  const wrapper = document.getElementById("image-queue-wrapper");
  const list = document.getElementById("image-queue-list");
  if (!wrapper || !list) return;

  if (state.files.length === 0) {
    wrapper.style.display = "none";
    return;
  }

  wrapper.style.display = "block";
  list.innerHTML = "";

  const shapeOptions = Object.values(MAGNET).map(shape => ({
    id: shape.id,
    icon: shapeIcon(shape.id),
    label: shape.label
  }));

  state.files.forEach(file => {
    const uri = file.uri;
    const name = state.fileNames[uri] || file.name || "Image";
    const qty = state.fileQtys[uri] || 1;
    const shape = state.fileShapes[uri] || state.shapeId || "circle";

    const item = document.createElement("div");
    item.className = "image-queue-item";
    item.dataset.uri = uri;

    const shapeChips = shapeOptions.map(s => `
      <button class="iq-shape-chip ${shape === s.id ? 'active' : ''}" data-uri="${uri}" data-shape="${s.id}" title="${s.label} magnet">
        <span class="iq-chip-icon">${s.icon}</span>
        <span class="iq-chip-label">${s.label}</span>
      </button>
    `).join("");

    item.innerHTML = `
      <div class="iq-thumb">
        <img src="${uri}" alt="${escapeXml(name)}" loading="lazy" />
      </div>
        <div class="iq-info">
          <input
            class="iq-name-input"
            type="text"
            value="${escapeXml(name)}"
            maxlength="40"
            title="Click to rename"
            data-uri="${uri}"
          />
          <div class="iq-shape-chips" title="Shape for this image">${shapeChips}</div>
          <div class="iq-controls">
            <span class="iq-qty-label">Copies:</span>
            <div class="iq-qty-stepper">
              <button class="iq-qty-btn iq-qty-minus" data-uri="${uri}" title="Decrease">−</button>
              <span class="iq-qty-value" id="qty-val-${CSS.escape(uri)}">${qty}</span>
              <button class="iq-qty-btn iq-qty-plus" data-uri="${uri}" title="Increase">+</button>
            </div>
          </div>
        </div>
      <button class="iq-delete-btn" data-uri="${uri}" title="Remove image">×</button>
    `;

    // Name rename
    const nameInput = item.querySelector(".iq-name-input");
    nameInput.addEventListener("click", e => e.stopPropagation());
    nameInput.addEventListener("change", e => {
      const newName = e.target.value.trim() || "Image";
      state.fileNames[uri] = newName;
      debouncedSave();
    });
    nameInput.addEventListener("keydown", e => { if (e.key === "Enter") e.target.blur(); });

    // Qty decrease
    item.querySelector(".iq-qty-minus").addEventListener("click", e => {
      e.stopPropagation();
      const cur = state.fileQtys[uri] || 1;
      if (cur <= 1) return;
      state.fileQtys[uri] = cur - 1;
      const valEl = document.getElementById(`qty-val-${CSS.escape(uri)}`);
      if (valEl) valEl.textContent = state.fileQtys[uri];
      rebuildItems();
      updateStats();
      debouncedGenerateLayout();
      debouncedSave();
    });

    // Qty increase
    item.querySelector(".iq-qty-plus").addEventListener("click", e => {
      e.stopPropagation();
      const cur = state.fileQtys[uri] || 1;
      if (cur >= 99) return;
      state.fileQtys[uri] = cur + 1;
      const valEl = document.getElementById(`qty-val-${CSS.escape(uri)}`);
      if (valEl) valEl.textContent = state.fileQtys[uri];
      rebuildItems();
      updateStats();
      debouncedGenerateLayout();
      debouncedSave();
    });

    // Shape chips
    item.querySelectorAll(".iq-shape-chip").forEach(chip => {
      chip.addEventListener("click", e => {
        e.stopPropagation();
        const newShape = chip.dataset.shape;
        state.fileShapes[uri] = newShape;
        item.querySelectorAll(".iq-shape-chip").forEach(c => c.classList.toggle("active", c.dataset.shape === newShape));
        rebuildItems();
        debouncedGenerateLayout();
        debouncedSave();
      });
    });

    // Delete image
    item.querySelector(".iq-delete-btn").addEventListener("click", e => {
      e.stopPropagation();
      deleteImage(uri);
    });

    list.appendChild(item);
  });
}

function setupListeners() {
  elements.fileInput.addEventListener("change", (event) => {
    loadFiles(event.target.files);
  });

  // Clear All button in image queue
  const btnClearAll = document.getElementById("btn-clear-all");
  if (btnClearAll) {
    btnClearAll.addEventListener("click", () => {
      if (state.files.length === 0) return;
      if (!confirm("Remove all uploaded images?")) return;
      state.files = [];
      state.items = [];
      state.crops = {};
      state.fileNames = {};
      state.fileQtys = {};
      state.fileShapes = {};
      state.selectedImageUri = null;
      state.pages = [];
      state.selectedPage = 0;
      updateStats();
      renderPreview();
      renderImageQueue();
      renderCropQueue();
      updateCropUI();
      updateWizardSteps();
      saveActiveDocument();
    });
  }

  // Native Drag and Drop Dropzone event listeners
  const dropzone = document.getElementById("dropzone-label");
  if (dropzone) {
    ["dragenter", "dragover"].forEach((eventName) => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add("dragging");
      }, false);
    });

    ["dragleave", "dragend"].forEach((eventName) => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove("dragging");
      }, false);
    });

    dropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove("dragging");
      if (e.dataTransfer && e.dataTransfer.files) {
        loadFiles(e.dataTransfer.files);
      }
    }, false);
  }



  elements.btnGenerate.addEventListener("click", generateLayout);
  elements.btnDownload.addEventListener("click", downloadPngs);
  elements.btnPrint.addEventListener("click", printPages);

  // Prev / Next page navigation
  const btnPrevPage = document.getElementById("btn-prev-page");
  const btnNextPage = document.getElementById("btn-next-page");
  if (btnPrevPage) {
    btnPrevPage.addEventListener("click", () => {
      if (state.selectedPage > 0) {
        state.selectedPage--;
        renderPreview();
      }
    });
  }
  if (btnNextPage) {
    btnNextPage.addEventListener("click", () => {
      if (state.selectedPage < state.pages.length - 1) {
        state.selectedPage++;
        renderPreview();
      }
    });
  }

  // Zoom controls
  const btnZoomIn  = document.getElementById("btn-zoom-in");
  const btnZoomOut = document.getElementById("btn-zoom-out");

  function applyZoom(delta) {
    const STEP = 0.1;
    const MIN  = 0.4;
    const MAX  = 3.0;
    state.previewZoom = Math.min(MAX, Math.max(MIN, parseFloat((state.previewZoom + delta).toFixed(2))));
    if (state.pages.length) renderPreview();
  }

  if (btnZoomIn)  btnZoomIn.addEventListener("click",  () => applyZoom(+0.1));
  if (btnZoomOut) btnZoomOut.addEventListener("click",  () => applyZoom(-0.1));

  // Ctrl += / Ctrl - / Ctrl 0 keyboard zoom shortcuts
  window.addEventListener("keydown", (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    if (e.key === "=" || e.key === "+") { e.preventDefault(); applyZoom(+0.1); }
    else if (e.key === "-")             { e.preventDefault(); applyZoom(-0.1); }
    else if (e.key === "0")             { e.preventDefault(); state.previewZoom = 1.15; if (state.pages.length) renderPreview(); }
  });

  elements.btnHelp.addEventListener("click", () => {
    elements.helpDialog.showModal();
    const dotWrapper = document.getElementById("cursor-dot-wrapper");
    const ringWrapper = document.getElementById("cursor-ring-wrapper");
    if (dotWrapper && ringWrapper) {
      elements.helpDialog.appendChild(dotWrapper);
      elements.helpDialog.appendChild(ringWrapper);
    }
  });
  elements.helpDialog.addEventListener("close", () => {
    const dotWrapper = document.getElementById("cursor-dot-wrapper");
    const ringWrapper = document.getElementById("cursor-ring-wrapper");
    if (dotWrapper && ringWrapper) {
      document.body.appendChild(dotWrapper);
      document.body.appendChild(ringWrapper);
    }
  });
  elements.btnCloseHelp.addEventListener("click", () => {
    elements.helpDialog.close();
  });

  // Custom Size Dialog Setup
  const customSizeDialog = document.getElementById("custom-size-dialog");
  const btnCloseCustomSize = document.getElementById("btn-close-custom-size");
  const btnCreateCustomSize = document.getElementById("btn-create-custom-size");

  const customType = document.getElementById("custom-type");
  const grpInnerH = document.getElementById("grp-inner-h");
  const grpOuterH = document.getElementById("grp-outer-h");
  const grpRadius = document.getElementById("grp-radius");
  const lblInnerW = document.getElementById("lbl-inner-w");
  const lblOuterW = document.getElementById("lbl-outer-w");

  if (customType) {
    const handleTypeToggle = () => {
      const isCircle = customType.value === "circle";
      if (grpInnerH) grpInnerH.style.display = isCircle ? "none" : "block";
      if (grpOuterH) grpOuterH.style.display = isCircle ? "none" : "block";
      if (grpRadius) grpRadius.style.display = isCircle ? "none" : "block";
      if (lblInnerW) lblInnerW.textContent = isCircle ? "Diameter (cm)" : "Inner Width (cm)";
      if (lblOuterW) lblOuterW.textContent = isCircle ? "Outer Boundary (cm)" : "Outer Width (cm)";
    };
    customType.addEventListener("change", handleTypeToggle);
    handleTypeToggle();
  }

  if (customSizeDialog) {
    customSizeDialog.addEventListener("close", () => {
      const dotWrapper = document.getElementById("cursor-dot-wrapper");
      const ringWrapper = document.getElementById("cursor-ring-wrapper");
      if (dotWrapper && ringWrapper) {
        document.body.appendChild(dotWrapper);
        document.body.appendChild(ringWrapper);
      }
    });
  }

  if (btnCloseCustomSize) {
    btnCloseCustomSize.addEventListener("click", () => {
      customSizeDialog.close();
    });
  }

  if (btnCreateCustomSize) {
    btnCreateCustomSize.addEventListener("click", () => {
      const type = customType.value;
      const innerW = parseFloat(document.getElementById("custom-inner-w").value);
      const innerH = type === "circle" ? innerW : parseFloat(document.getElementById("custom-inner-h").value);
      const outerW = parseFloat(document.getElementById("custom-outer-w").value);
      const outerH = type === "circle" ? outerW : parseFloat(document.getElementById("custom-outer-h").value);
      const radiusMm = type === "circle" ? 0 : parseFloat(document.getElementById("custom-radius").value);
      const marginMm = parseFloat(document.getElementById("custom-margin").value);

      if (isNaN(innerW) || isNaN(innerH) || isNaN(outerW) || isNaN(outerH)) {
        alert("Please enter valid numbers.");
        return;
      }

      // Convert cm to px (1 cm = 118.11 px)
      const scaleCmToPx = 118.11;
      const magnetW = Math.round(innerW * scaleCmToPx);
      const magnetH = Math.round(innerH * scaleCmToPx);
      const slotW = Math.round(outerW * scaleCmToPx);
      const slotH = Math.round(outerH * scaleCmToPx);

      // Convert mm to px (1 mm = 11.811 px)
      const scaleMmToPx = 11.811;
      const borderRadius = type === "circle" ? Math.round(slotW / 2) : Math.round(radiusMm * scaleMmToPx);
      const margin = Math.round(marginMm * scaleMmToPx);

      const customId = `custom_size_${Date.now()}`;
      const shapeLabel = type === "circle"
        ? `${innerW * 10} mm`
        : `${innerW * 10} mm × ${innerH * 10} mm`;
      const showBoundaryEl = document.getElementById("custom-show-boundary");

      MAGNET[customId] = {
        id: customId,
        label: shapeLabel,
        subtitle: `Custom · ${type === "circle" ? "Circle" : "Rect"}`,
        magnetW,
        magnetH,
        slotW,
        slotH,
        borderRadius,
        margin,
        type: type,
        showBoundary: showBoundaryEl ? showBoundaryEl.checked : true,
      };

      createShapeButtons();

      state.shapeId = customId;
      Object.keys(state.fileShapes).forEach(uri => {
        state.fileShapes[uri] = state.shapeId;
      });
      rebuildItems();
      updateShapeSelection();
      if (state.files.length > 0) generateLayout();
      saveActiveDocument();

      customSizeDialog.close();
      setStatus(`Created shape: ${shapeLabel}`);
    });
  }

  window.addEventListener("resize", () => {
    debouncedRenderPreview();
    if (elements.stageCrop.style.display !== "none") {
      updateCropUI();
    }
  }, { passive: true });


  // Keyboard arrow navigation between pages (when not in a text input)
  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    if (!state.pages.length) return;
    if (elements.stageCrop && elements.stageCrop.style.display !== "none") return;

    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      if (state.selectedPage < state.pages.length - 1) {
        e.preventDefault();
        state.selectedPage++;
        renderPreview();
      }
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      if (state.selectedPage > 0) {
        e.preventDefault();
        state.selectedPage--;
        renderPreview();
      }
    }
  });

  // Tabswitching
  elements.tabA4.addEventListener("click", () => {
    elements.tabA4.classList.add("active");
    elements.tabCrop.classList.remove("active");
    elements.stageA4.style.display = "flex";
    elements.stageCrop.style.display = "none";
    renderPreview();
  });

  elements.tabCrop.addEventListener("click", () => {
    if (state.items.length === 0) {
      setStatus("Upload images first to use the Crop Editor.");
      return;
    }
    elements.tabA4.classList.remove("active");
    elements.tabCrop.classList.add("active");
    elements.stageA4.style.display = "none";
    elements.stageCrop.style.display = "block";
    
    if (!state.selectedImageUri && state.items.length > 0) {
      state.selectedImageUri = state.items[0].uri;
    }
    updateCropUI();
    renderCropQueue();
  });

  // Sliders input listeners
  elements.sliderZoom.addEventListener("input", (e) => {
    if (!state.selectedImageUri) return;
    const crop = state.crops[state.selectedImageUri];
    crop.scale = parseFloat(e.target.value);
    
    const shape = MAGNET[state.shapeId];
    if (shape) {
      const rSlot = shape.magnetW / shape.magnetH;
      const rImg = crop.aspectRatio;
      let wBase, hBase;
      if (rImg > rSlot) {
        hBase = shape.magnetH;
        wBase = shape.magnetH * rImg;
      } else {
        wBase = shape.magnetW;
        hBase = shape.magnetW / rImg;
      }
      const wZoomed = wBase * crop.scale;
      const hZoomed = hBase * crop.scale;
      const maxOffsetX = (wZoomed - shape.magnetW) / 2;
      const maxOffsetY = (hZoomed - shape.magnetH) / 2;
      
      crop.offsetX = Math.max(-maxOffsetX, Math.min(maxOffsetX, crop.offsetX));
      crop.offsetY = Math.max(-maxOffsetY, Math.min(maxOffsetY, crop.offsetY));

      elements.sliderX.min = -Math.ceil(maxOffsetX);
      elements.sliderX.max = Math.ceil(maxOffsetX);
      elements.sliderX.value = Math.round(crop.offsetX);
      document.getElementById("val-x").textContent = Math.round(crop.offsetX);
      elements.sliderX.disabled = maxOffsetX <= 0;

      elements.sliderY.min = -Math.ceil(maxOffsetY);
      elements.sliderY.max = Math.ceil(maxOffsetY);
      elements.sliderY.value = Math.round(crop.offsetY);
      document.getElementById("val-y").textContent = Math.round(crop.offsetY);
      elements.sliderY.disabled = maxOffsetY <= 0;
    }
    
    document.getElementById("val-zoom").textContent = crop.scale.toFixed(2);
    updateCropImageStyleOnly();
  });

  elements.sliderZoom.addEventListener("change", () => {
    renderPreview();
    updateActiveCropQueueThumb();
    updateActivePageStripThumb();
    debouncedSave();
  });

  elements.sliderX.addEventListener("input", (e) => {
    if (!state.selectedImageUri) return;
    const crop = state.crops[state.selectedImageUri];
    crop.offsetX = parseFloat(e.target.value);
    document.getElementById("val-x").textContent = Math.round(crop.offsetX);
    updateCropImageStyleOnly();
  });

  elements.sliderX.addEventListener("change", () => {
    renderPreview();
    updateActiveCropQueueThumb();
    updateActivePageStripThumb();
    debouncedSave();
  });

  elements.sliderY.addEventListener("input", (e) => {
    if (!state.selectedImageUri) return;
    const crop = state.crops[state.selectedImageUri];
    crop.offsetY = parseFloat(e.target.value);
    document.getElementById("val-y").textContent = Math.round(crop.offsetY);
    updateCropImageStyleOnly();
  });

  elements.sliderY.addEventListener("change", () => {
    renderPreview();
    updateActiveCropQueueThumb();
    updateActivePageStripThumb();
    debouncedSave();
  });

  // Reset and Auto-Fit buttons
  elements.btnCropReset.addEventListener("click", () => {
    if (!state.selectedImageUri) return;
    const crop = state.crops[state.selectedImageUri];
    crop.scale = 1.0;
    crop.offsetX = 0;
    crop.offsetY = 0;
    crop.brightness = 1;
    crop.contrast = 1;
    crop.saturation = 1;
    crop.filterExtra = "";
    crop.preset = "original";
    updateCropUI();
    renderPreview();
    renderCropQueue();
    debouncedSave();
  });

  elements.btnCropFit.addEventListener("click", () => {
    if (!state.selectedImageUri) return;
    const crop = state.crops[state.selectedImageUri];
    crop.scale = 1.0;
    crop.offsetX = 0;
    crop.offsetY = 0;
    updateCropUI();
    renderPreview();
    renderCropQueue();
    debouncedSave();
  });

  elements.btnCropApplyAll.addEventListener("click", () => {
    if (!state.selectedImageUri) return;
    const currentCrop = state.crops[state.selectedImageUri];
    if (!currentCrop) return;

    state.files.forEach((file) => {
      if (file.uri !== state.selectedImageUri) {
        if (!state.crops[file.uri]) {
          state.crops[file.uri] = { scale: 1.0, offsetX: 0, offsetY: 0, aspectRatio: file.aspectRatio, width: file.width, height: file.height };
        }
        state.crops[file.uri].scale = currentCrop.scale;
        state.crops[file.uri].offsetX = currentCrop.offsetX;
        state.crops[file.uri].offsetY = currentCrop.offsetY;
      }
    });

    setStatus("Applied crop settings to all images.");
    renderPreview();
    renderCropQueue();
    debouncedSave();
  });

  // Filter preset buttons
  if (elements.filterPresetsRow) {
    elements.filterPresetsRow.addEventListener("click", (e) => {
      const btn = e.target.closest(".filter-preset-btn");
      if (!btn || !state.selectedImageUri) return;
      const presetId = btn.dataset.preset;
      const preset = FILTER_PRESETS[presetId];
      if (!preset) return;
      const crop = state.crops[state.selectedImageUri];
      crop.brightness = preset.brightness;
      crop.contrast = preset.contrast;
      crop.saturation = preset.saturation;
      crop.filterExtra = preset.extra;
      crop.preset = presetId;
      updateCropUI();
      renderPreview();
      debouncedSave();
    });
  }

  // Brightness slider
  if (elements.sliderBrightness) {
    elements.sliderBrightness.addEventListener("input", () => {
      if (!state.selectedImageUri) return;
      const crop = state.crops[state.selectedImageUri];
      crop.brightness = parseFloat(elements.sliderBrightness.value);
      crop.preset = "original";
      document.getElementById("val-brightness").textContent = crop.brightness.toFixed(2);
      elements.cropPreviewImg.style.filter = getFilterString(crop);
      if (elements.filterPresetsRow) {
        elements.filterPresetsRow.querySelectorAll(".filter-preset-btn").forEach(b => b.classList.remove("active"));
        elements.filterPresetsRow.querySelector('[data-preset="original"]')?.classList.add("active");
      }
    });
    elements.sliderBrightness.addEventListener("change", () => {
      renderPreview();
      debouncedSave();
    });
  }

  // Contrast slider
  if (elements.sliderContrast) {
    elements.sliderContrast.addEventListener("input", () => {
      if (!state.selectedImageUri) return;
      const crop = state.crops[state.selectedImageUri];
      crop.contrast = parseFloat(elements.sliderContrast.value);
      crop.preset = "original";
      document.getElementById("val-contrast").textContent = crop.contrast.toFixed(2);
      elements.cropPreviewImg.style.filter = getFilterString(crop);
    });
    elements.sliderContrast.addEventListener("change", () => {
      renderPreview();
      debouncedSave();
    });
  }

  // Saturation slider
  if (elements.sliderSaturation) {
    elements.sliderSaturation.addEventListener("input", () => {
      if (!state.selectedImageUri) return;
      const crop = state.crops[state.selectedImageUri];
      crop.saturation = parseFloat(elements.sliderSaturation.value);
      crop.preset = "original";
      document.getElementById("val-saturation").textContent = crop.saturation.toFixed(2);
      elements.cropPreviewImg.style.filter = getFilterString(crop);
    });
    elements.sliderSaturation.addEventListener("change", () => {
      renderPreview();
      debouncedSave();
    });
  }

  // Drag-to-pan implementation
  let isDragging = false;
  let startX, startY;
  let startOffsetX, startOffsetY;

  elements.cropInteractiveArea.addEventListener("pointerdown", (e) => {
    if (!state.selectedImageUri) return;
    isDragging = true;
    elements.cropInteractiveArea.setPointerCapture(e.pointerId);
    startX = e.clientX;
    startY = e.clientY;
    const crop = state.crops[state.selectedImageUri];
    startOffsetX = crop.offsetX;
    startOffsetY = crop.offsetY;
    elements.cropInteractiveArea.style.cursor = "grabbing";
  });

  elements.cropInteractiveArea.addEventListener("pointermove", (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    
    const shape = MAGNET[state.shapeId];
    if (!shape) return;
    
    const maxWorkspaceDim = 360;
    let editorW;
    if (shape.slotW > shape.slotH) {
      editorW = maxWorkspaceDim;
    } else {
      editorW = maxWorkspaceDim * (shape.slotW / shape.slotH);
    }
    const editorScale = editorW / shape.slotW;

    const crop = state.crops[state.selectedImageUri];
    
    const rSlot = shape.magnetW / shape.magnetH;
    const rImg = crop.aspectRatio;
    let wBase, hBase;
    if (rImg > rSlot) {
      hBase = shape.magnetH;
      wBase = shape.magnetH * rImg;
    } else {
      wBase = shape.magnetW;
      hBase = shape.magnetW / rImg;
    }
    const wZoomed = wBase * crop.scale;
    const hZoomed = hBase * crop.scale;

    let newOffsetX = startOffsetX + dx / editorScale;
    let newOffsetY = startOffsetY + dy / editorScale;

    const maxOffsetX = (wZoomed - shape.magnetW) / 2;
    const maxOffsetY = (hZoomed - shape.magnetH) / 2;

    crop.offsetX = Math.max(-maxOffsetX, Math.min(maxOffsetX, newOffsetX));
    crop.offsetY = Math.max(-maxOffsetY, Math.min(maxOffsetY, newOffsetY));

    // Update range slider positions and labels in real time
    elements.sliderX.value = Math.round(crop.offsetX);
    document.getElementById("val-x").textContent = Math.round(crop.offsetX);
    elements.sliderY.value = Math.round(crop.offsetY);
    document.getElementById("val-y").textContent = Math.round(crop.offsetY);

    updateCropImageStyleOnly();
  });

  elements.cropInteractiveArea.addEventListener("pointerup", (e) => {
    if (isDragging) {
      isDragging = false;
      elements.cropInteractiveArea.releasePointerCapture(e.pointerId);
      elements.cropInteractiveArea.style.cursor = "grab";
      renderPreview();
      updateActiveCropQueueThumb();
      updateActivePageStripThumb();
      debouncedSave();
    }
  });

  elements.cropInteractiveArea.addEventListener("pointercancel", (e) => {
    if (isDragging) {
      isDragging = false;
      elements.cropInteractiveArea.releasePointerCapture(e.pointerId);
      elements.cropInteractiveArea.style.cursor = "grab";
      renderPreview();
      updateActiveCropQueueThumb();
      updateActivePageStripThumb();
      debouncedSave();
    }
  });
}

// Document Management Engine (LocalStorage API)
// -- In-memory cache to avoid repeated JSON.parse on every interaction --
let _docsCache = null; // null = not yet loaded

function _migrateAndCache(docs) {
  let modified = false;
  docs.forEach(doc => {
    if (doc.shapeId === "octagon") { doc.shapeId = "rectangle"; modified = true; }
    if (doc.items) {
      doc.items.forEach(item => {
        if (item.shapeId === "octagon") { item.shapeId = "rectangle"; modified = true; }
      });
    }
  });
  _docsCache = docs;
  if (modified) {
    try { localStorage.setItem("printbot_documents", JSON.stringify(docs)); } catch(e) {}
  }
  return docs;
}

function getAllDocuments() {
  // Return from cache when available — avoids JSON.parse on every call
  if (_docsCache !== null) return _docsCache;
  try {
    const raw = localStorage.getItem("printbot_documents");
    const docs = raw ? JSON.parse(raw) : [];
    return _migrateAndCache(docs);
  } catch (e) {
    console.error("Failed to read/migrate documents from localStorage", e);
    _docsCache = [];
    return _docsCache;
  }
}

function _flushDocsCache() {
  if (_docsCache === null) return;
  try {
    localStorage.setItem("printbot_documents", JSON.stringify(_docsCache));
  } catch (e) {
    console.error("Failed to save documents to localStorage", e);
    setStatus("Warning: Local storage full. Design not saved.");
  }
}

function saveDocument(doc) {
  const docs = getAllDocuments(); // uses cache
  const idx = docs.findIndex(d => d.id === doc.id);
  if (idx === -1) { docs.push(doc); } else { docs[idx] = doc; }
  _flushDocsCache();
}

function saveActiveDocument() {
  if (!state.activeDocId) return;

  const docs = getAllDocuments(); // uses cache — no JSON.parse!
  const idx = docs.findIndex(d => d.id === state.activeDocId);
  if (idx === -1) return;

  docs[idx].shapeId = state.shapeId;
  docs[idx].crops = state.crops;
  docs[idx].items = state.items;
  docs[idx].fileNames = state.fileNames;
  docs[idx].fileQtys = state.fileQtys;
  docs[idx].fileShapes = state.fileShapes;
  docs[idx].lastModified = Date.now();
  if (state.items.length > 0) docs[idx].draft = false;

  _flushDocsCache();
}

/** Remove documents that were created but never had any images added. */
function pruneEmptyDrafts() {
  const docs = getAllDocuments();
  const kept = docs.filter(d => !(d.draft && (!d.items || d.items.length === 0)));
  if (kept.length === docs.length) return;
  _docsCache = kept;
  _flushDocsCache();
}

function deleteDocument(docId) {
  if (confirm("Are you sure you want to delete this design?")) {
    const docs = getAllDocuments();
    const idx = docs.findIndex(d => d.id === docId);
    if (idx !== -1) docs.splice(idx, 1); // mutate cache in place
    _flushDocsCache();
    renderDashboard();
  }
}

function renameDocument(docId, newTitle) {
  const docs = getAllDocuments();
  const doc = docs.find(d => d.id === docId);
  if (doc) {
    doc.title = newTitle;
    doc.lastModified = Date.now();
    saveDocument(doc);
  }
}

function createNewDocument(shapeId) {
  const id = `doc_${Date.now()}`;
  const title = `Untitled ${shapeId.charAt(0).toUpperCase() + shapeId.slice(1)} Design`;
  const newDoc = {
    id,
    title,
    shapeId,
    footer: "MADE USING PRINTBOT ( Built By SHOPSHIP )",
    items: [],
    crops: {},
    lastModified: Date.now(),
    draft: true, // pruned from Recent Designs if left empty
  };

  saveDocument(newDoc);
  loadDocument(id);
}

async function loadDocument(docId) {
  const docs = getAllDocuments();
  const doc = docs.find(d => d.id === docId);
  if (!doc) return;

  setStatus("Loading design...");

  state.activeDocId = doc.id;
  state.shapeId = doc.shapeId;
  state.footer = "MADE USING PRINTBOT ( Built By SHOPSHIP )"; // frozen text
  state.crops = doc.crops || {};
  state.fileNames = doc.fileNames || {};
  state.fileQtys = doc.fileQtys || {};
  state.fileShapes = doc.fileShapes || {};
  // state.items will be rebuilt from files + fileQtys after file reconstruction
  
  // Derive unique URIs: prefer fileQtys keys (new saves), fall back to doc.items (legacy)
  const savedItems = doc.items || [];
  const uniqueUris = Object.keys(state.fileQtys).length > 0
    ? Object.keys(state.fileQtys)
    : [...new Set(savedItems.map(item => item.uri))];
  state.files = [];

  
  for (const uri of uniqueUris) {
    try {
      const dims = await getImageDimensions(uri);
      state.files.push({
        id: uid(),
        file: null,
        uri: uri,
        name: state.fileNames[uri] || uri.split('/').pop().replace(/\.[^.]+$/, '') || 'Image',
        width: dims.width,
        height: dims.height,
        aspectRatio: dims.width / dims.height
      });

      // Ensure defaults for legacy saves
      if (!state.fileQtys[uri]) state.fileQtys[uri] = 1;
      if (!state.fileNames[uri]) {
        state.fileNames[uri] = state.files[state.files.length - 1].name;
      }
      if (!state.fileShapes[uri]) {
        state.fileShapes[uri] = state.shapeId || "circle";
      }
      
      // Ensure crop info exists and is valid
      if (!state.crops[uri]) {
        state.crops[uri] = {
          scale: 1.0,
          offsetX: 0,
          offsetY: 0,
          aspectRatio: dims.width / dims.height,
          width: dims.width,
          height: dims.height
        };
      }
    } catch (e) {
      console.warn("Could not load image dimensions for: " + uri, e);
    }
  }


  // Rebuild items from files respecting saved qtys
  rebuildItems();

  // Update DOM control elements
  // Update shape selection cards
  updateShapeSelection();
  
  // Set active crop preview
  if (state.files.length > 0) {
    state.selectedImageUri = state.files[0].uri;
  } else {
    state.selectedImageUri = null;
  }

  // Generate layout and render preview
  if (state.items.length > 0) {
    generateLayout();
  } else {
    state.pages = [];
    state.selectedPage = 0;
    renderPreview();
  }

  
  updateStats();
  updateWizardSteps();
  renderImageQueue();

  // Show editor view when loading a document
  showView("editor");
  setStatus("Design loaded.");
}

// Navigation & View Toggling

function showView(viewName) {
  const dashboard = document.getElementById("dashboard-view");
  const editor = document.getElementById("editor-view");
  const backBtn = document.getElementById("btn-back-dashboard");
  const backSep = document.getElementById("btn-back-separator");
  const btnGenerate = document.getElementById("btn-generate");

  const doSwitch = () => {
    if (viewName === "dashboard") {
      if (dashboard) dashboard.style.display = "block";
      if (editor) editor.style.display = "none";
      if (backBtn) backBtn.style.display = "none";
      if (backSep) backSep.style.display = "none";
      if (btnGenerate) btnGenerate.style.display = "none";
      state.activeDocId = null;
      pruneEmptyDrafts();
      renderDashboard();
    } else {
      if (dashboard) dashboard.style.display = "none";
      if (editor) editor.style.display = "flex";
      if (backBtn) backBtn.style.display = "inline-flex";
      if (backSep) backSep.style.display = "block";
      if (btnGenerate) btnGenerate.style.display = "inline-block";
      setTimeout(() => {
        if (state.pages.length) renderPreview();
        else if (elements.emptyState) elements.emptyState.style.display = "flex";
      }, 100);
    }
  };

  // Use View Transitions API for smooth cross-fade if supported
  if (document.startViewTransition) {
    document.startViewTransition(doSwitch);
  } else {
    doSwitch();
  }
}

function renderDashboard() {
  const grid = document.getElementById("recent-designs-grid");
  if (!grid) return;

  const docs = getAllDocuments();
  if (docs.length === 0) {
    grid.innerHTML = `
      <div class="empty-queue" style="grid-column: 1 / -1; padding: 48px 0; text-align: center;">
        <p style="color: var(--muted); margin-bottom: 0;">No recent designs found. Click a preset above to start a new design!</p>
      </div>
    `;
    return;
  }

  // Sort by lastModified descending
  docs.sort((a, b) => b.lastModified - a.lastModified);

  grid.innerHTML = docs.map(doc => {
    // Human-readable shape label
    const shapeLabels = {
      circle: "Circle",
      square: "Square",
      rectangle: "Rectangle",
      roundedSquare: "Rounded Sq.",
      star: "Star",
      heart: "Heart",
      hexagon: "Hexagon",
      oval: "Oval",
    };
    const shapeLabel = shapeLabels[doc.shapeId] || doc.shapeId;

    // Shape accent colours for placeholder bg
    const shapeColors = {
      circle: "#6366f1",
      square: "#14b8a6",
      rectangle: "#ec4899",
      roundedSquare: "#8b5cf6",
      star: "#f59e0b",
      heart: "#ef4444",
      hexagon: "#10b981",
      oval: "#3b82f6",
    };
    const accentColor = shapeColors[doc.shapeId] || "#6366f1";

    // Get preview image (first image or placeholder)
    const docItems = doc.items || [];
    let previewHtml = "";
    if (docItems.length > 0) {
      previewHtml = `<img class="preview-image" src="${docItems[0].uri}" alt="Preview" draggable="false" />`;
    } else {
      previewHtml = `
        <div class="placeholder-preview" style="
          background: linear-gradient(135deg, ${accentColor}15 0%, ${accentColor}28 100%);
          width:100%; height:100%; display:flex; align-items:center; justify-content:center;
        ">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="24" cy="24" r="22" stroke="${accentColor}" stroke-width="1.5" stroke-dasharray="5 3" opacity="0.45"/>
            <circle cx="24" cy="24" r="14" fill="${accentColor}" opacity="0.08"/>
            <path d="M24 18v6M24 28v1" stroke="${accentColor}" stroke-width="2" stroke-linecap="round" opacity="0.6"/>
          </svg>
        </div>
      `;
    }

    const dateStr = new Date(doc.lastModified).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    return `
      <div class="doc-card" data-id="${doc.id}">
        <div class="doc-thumbnail">
          ${previewHtml}
          <button class="doc-delete-btn" title="Delete Design" data-id="${doc.id}">×</button>
        </div>
        <div class="doc-info">
          <div class="doc-title-row">
            <input type="text" class="doc-title-input" value="${escapeXml(doc.title || 'Untitled Design')}" data-id="${doc.id}" title="Click to rename" />
          </div>
          <div class="doc-meta">
            <span>${docItems.length} image${docItems.length === 1 ? '' : 's'}</span>
            <span>${dateStr}</span>
          </div>
        </div>
      </div>
    `;
  }).join("");

  // Add event listeners to cards
  grid.querySelectorAll(".doc-thumbnail").forEach(thumb => {
    thumb.addEventListener("click", (e) => {
      if (e.target.classList.contains("doc-delete-btn")) return;
      const card = thumb.closest(".doc-card");
      loadDocument(card.dataset.id);
    });
  });

  grid.querySelectorAll(".doc-delete-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      deleteDocument(id);
    });
  });

  grid.querySelectorAll(".doc-title-input").forEach(input => {
    input.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    input.addEventListener("change", (e) => {
      const id = input.dataset.id;
      const newTitle = input.value.trim() || "Untitled Design";
      renameDocument(id, newTitle);
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        input.blur();
      }
    });
  });
}

function setupDashboardListeners() {
  // Preset buttons click handlers
  document.querySelectorAll(".preset-card").forEach(card => {
    card.addEventListener("click", () => {
      const shapeId = card.dataset.preset;
      createNewDocument(shapeId);
    });
  });

  // Back to dashboard button handler
  const backBtn = document.getElementById("btn-back-dashboard");
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      showView("dashboard");
    });
  }

  // Sidebar back button (also goes to dashboard)
  const backBtnSidebar = document.getElementById("btn-back-sidebar");
  if (backBtnSidebar) {
    backBtnSidebar.addEventListener("click", () => {
      showView("dashboard");
    });
  }

  // Dashboard Help button handler
  const dbHelpBtn = document.getElementById("btn-dashboard-help");
  if (dbHelpBtn && elements.helpDialog) {
    dbHelpBtn.addEventListener("click", () => {
      elements.helpDialog.showModal();
    });
  }
}

function initializeApp() {
  const docs = getAllDocuments();
  if (docs.length === 0) {
    // Generate default onboarding document on first launch
    const defaultDoc = {
      id: "doc_default",
      title: "Cute Family Magnets",
      shapeId: "circle",
      footer: "MADE USING PRINTBOT ( Built By SHOPSHIP )",
      items: [
        { id: "item_family1", shapeId: "circle", uri: "assets/family1.png" },
        { id: "item_family2", shapeId: "circle", uri: "assets/family2.png" },
        { id: "item_family3", shapeId: "circle", uri: "assets/family3.png" },
      ],
      crops: {
        "assets/family1.png": { scale: 1.0, offsetX: 0, offsetY: 0, aspectRatio: 1.0 },
        "assets/family2.png": { scale: 1.0, offsetX: 0, offsetY: 0, aspectRatio: 1.0 },
        "assets/family3.png": { scale: 1.0, offsetX: 0, offsetY: 0, aspectRatio: 1.0 },
      },
      lastModified: Date.now()
    };
    saveDocument(defaultDoc);
  }

  // Show dashboard with recent designs (not auto-load the editor)
  showView("dashboard");
  setStatus("Dashboard ready.");
}

createShapeButtons();
updateStats();
setupListeners();
updateWizardSteps();
setupDashboardListeners();
initializeApp();

// Premium Lerped Custom Cursor Logic (Stitch MCP Inspired)
function initCustomCursor() {
  const dotWrapper = document.getElementById("cursor-dot-wrapper");
  const ringWrapper = document.getElementById("cursor-ring-wrapper");
  const dot = document.getElementById("cursor-dot");
  const ring = document.getElementById("cursor-ring");

  if (!dotWrapper || !ringWrapper || !dot || !ring) return;

  let hasMoved = false;

  // Direct CSS variable update — no RAF, no lerp, zero lag
  window.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    dotWrapper.style.transform = `translate3d(${e.clientX}px,${e.clientY}px,0)`;
    if (!hasMoved) {
      hasMoved = true;
      document.body.classList.add("custom-cursor-enabled");
      dotWrapper.style.opacity = "1";
    }
  }, { passive: true });

  document.addEventListener("pointerleave", () => {
    dotWrapper.style.opacity = "0";
    document.body.classList.remove("custom-cursor-enabled");
    hasMoved = false;
  }, { passive: true });

  // Scale up logo on hover over interactive elements
  const hoverSelector = "button,a,.shape-card,.thumb,.dropzone,input,select,[role='button'],.doc-thumbnail,.doc-card";
  document.addEventListener("pointerover", (e) => {
    if (e.pointerType !== "mouse") return;
    if (e.target.closest && e.target.closest(hoverSelector)) dot.classList.add("hovered");
  }, { passive: true });
  document.addEventListener("pointerout", (e) => {
    if (e.pointerType !== "mouse") return;
    if (!e.relatedTarget?.closest?.(hoverSelector)) dot.classList.remove("hovered");
  }, { passive: true });
}

// ── License UI ────────────────────────────────────────────────
function showActivationModal(msg) {
  const modal = document.getElementById("activation-modal");
  const msgEl = document.getElementById("activation-msg");
  if (msgEl && msg) msgEl.textContent = msg;
  if (modal) modal.showModal();
}

function updateLicenseBadge() {
  // Update header badge
  const badge = document.getElementById("license-badge");
  if (badge) {
    if (LICENSE.isActive()) {
      badge.textContent = "✓ Licensed";
      badge.className = "license-badge licensed";
    } else {
      const rem = LICENSE.demoRemaining();
      badge.textContent = rem > 0 ? `Demo · ${rem} file${rem !== 1 ? "s" : ""} left` : "Demo · Locked";
      badge.className = "license-badge demo" + (rem === 0 ? " locked" : "");
    }
  }

  // Update dashboard license card
  const statusCard = document.getElementById("license-status-card");
  const statusText = document.getElementById("license-status-text");
  const infoSection = document.getElementById("license-info-section");
  const keyValue = document.getElementById("license-key-value");
  const deviceValue = document.getElementById("license-device-value");
  const activateBtn = document.getElementById("btn-activate-dashboard");

  if (statusText && statusCard) {
    if (LICENSE.isActive()) {
      const stored = JSON.parse(localStorage.getItem("pb_license") || "null");
      statusText.textContent = "✓ Licensed";
      statusText.style.color = "#16a34a";
      statusCard.style.borderColor = "rgba(34, 197, 94, 0.3)";
      statusCard.style.background = "linear-gradient(135deg, rgba(34, 197, 94, 0.08) 0%, rgba(74, 222, 128, 0.04) 100%)";
      statusCard.style.boxShadow = "0 8px 32px rgba(34, 197, 94, 0.1)";

      if (infoSection) infoSection.style.display = "block";
      if (keyValue && stored) keyValue.textContent = stored.key;
      if (deviceValue && stored) deviceValue.textContent = stored.deviceId?.substring(0, 24) + "…" || "—";
      if (activateBtn) activateBtn.style.display = "none";
    } else {
      const rem = LICENSE.demoRemaining();
      statusText.textContent = rem > 0 ? `Demo · ${rem} file${rem !== 1 ? "s" : ""} left` : "Demo · Locked (0 files)";
      statusText.style.color = rem === 0 ? "#dc2626" : "#b45309";

      if (rem === 0) {
        statusCard.style.borderColor = "rgba(220, 38, 38, 0.3)";
        statusCard.style.background = "linear-gradient(135deg, rgba(220, 38, 38, 0.08) 0%, rgba(239, 68, 68, 0.04) 100%)";
        statusCard.style.boxShadow = "0 8px 32px rgba(220, 38, 38, 0.1)";
      } else {
        statusCard.style.borderColor = "rgba(245, 158, 11, 0.3)";
        statusCard.style.background = "linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(251, 191, 36, 0.04) 100%)";
        statusCard.style.boxShadow = "0 8px 32px rgba(245, 158, 11, 0.1)";
      }

      if (infoSection) infoSection.style.display = "none";
      if (activateBtn) activateBtn.style.display = "flex";
    }
  }
}

async function initLicense() {
  await LICENSE.init();
  updateLicenseBadge();

  // Activate button in header
  const btnActivate = document.getElementById("btn-activate");
  if (btnActivate) {
    btnActivate.addEventListener("click", () => showActivationModal());
    if (LICENSE.isActive()) btnActivate.style.display = "none";
  }

  // Activate button in dashboard
  const btnActivateDashboard = document.getElementById("btn-activate-dashboard");
  if (btnActivateDashboard) {
    btnActivateDashboard.addEventListener("click", () => showActivationModal());
  }

  // Activation modal submit
  const form = document.getElementById("activation-form");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const keyInput = document.getElementById("license-key-input");
      const errEl    = document.getElementById("activation-error");
      const btn      = document.getElementById("btn-submit-activation");
      if (!keyInput) return;

      btn.disabled   = true;
      btn.textContent = "Validating…";
      if (errEl) errEl.textContent = "";

      const result = await LICENSE.activate(keyInput.value);

      btn.disabled   = false;
      btn.textContent = "Activate";

      if (result.ok) {
        LICENSE.setActive(true);
        updateLicenseBadge();
        document.getElementById("activation-modal")?.close();
        if (btnActivate) btnActivate.style.display = "none";
        // Show success briefly
        setStatus("✓ License activated! Unlimited uploads unlocked.");
      } else {
        if (errEl) errEl.textContent = result.msg;
      }
    });
  }

  // Close activation modal
  document.getElementById("btn-close-activation")?.addEventListener("click", () => {
    document.getElementById("activation-modal")?.close();
  });
}

initLicense();
initCustomCursor();
