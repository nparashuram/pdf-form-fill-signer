'use strict';

// ─── PDF.js worker setup ───────────────────────────────────────────────────
pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('libs/pdf.worker.min.js');

// ─── State ────────────────────────────────────────────────────────────────
const S = {
  pdfBytes: null,
  pdfDoc: null,
  scale: 1.5,
  currentTool: null,   // null | 'sign' | 'text'
  pendingSig: null,    // { name, dataUrl } — follows cursor
  textActive: false,   // text tool ready to place
  textCfg: { family: 'Helvetica', size: 16, color: '#000000' },
  annotations: [],     // [{id, type:'img'|'text', pageIndex, el, x, y, w, h, ...}]
};
let annIdSeq = 0;

// ─── DOM refs ─────────────────────────────────────────────────────────────
const elOpen     = document.getElementById('btn-open');
const elFileIn   = document.getElementById('file-input');
const elDropOpen = document.getElementById('drop-open');
const elBtnSign  = document.getElementById('btn-sign');
const elBtnText     = document.getElementById('btn-text');
const elTextToolbar = document.getElementById('text-toolbar');
const elBtnTextCancel = document.getElementById('btn-text-cancel');
const elBtnSave     = document.getElementById('btn-save');
const elSignPanel   = document.getElementById('sign-panel');
const elSigList     = document.getElementById('sig-list-viewer');
const elDropZone    = document.getElementById('drop-zone');
const elViewer      = document.getElementById('viewer');
const elPages       = document.getElementById('pages');
const elPdfName     = document.getElementById('pdf-name');
const elFloatSig    = document.getElementById('floating-sig');
const elFontFamily  = document.getElementById('font-family');
const elFontSize    = document.getElementById('font-size');
const elFontColor   = document.getElementById('font-color');

// ─── Open PDF ─────────────────────────────────────────────────────────────
function openFilePicker() { elFileIn.click(); }
elOpen.addEventListener('click', openFilePicker);
elDropOpen.addEventListener('click', openFilePicker);
elFileIn.addEventListener('change', (e) => {
  if (e.target.files[0]) loadPdfFile(e.target.files[0]);
  e.target.value = '';
});

// Drag and drop
elDropZone.addEventListener('dragover', (e) => { e.preventDefault(); elDropZone.classList.add('drag-over'); });
elDropZone.addEventListener('dragleave', () => elDropZone.classList.remove('drag-over'));
elDropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  elDropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.type === 'application/pdf') loadPdfFile(file);
});

async function loadPdfFile(file) {
  elPdfName.textContent = file.name;
  elPdfName.title = file.name;
  const buf = await file.arrayBuffer();
  // Keep a pristine copy for pdf-lib; PDF.js will detach/consume the buffer it receives
  S.pdfBytes = buf.slice(0);
  S.annotations = [];
  await renderPdf(new Uint8Array(buf));
  showViewer();
}

async function loadPdfFromUrl(url) {
  try {
    elBtnSave.disabled = true;
    elBtnSave.textContent = '⏳ Loading…';
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const buf = await res.arrayBuffer();
    const name = decodeURIComponent(url.split('/').pop().split('?')[0]) || 'document.pdf';
    elPdfName.textContent = name;
    elPdfName.title = name;
    S.pdfBytes = buf.slice(0);
    S.annotations = [];
    await renderPdf(new Uint8Array(buf));
    showViewer();
  } catch (err) {
    alert('Failed to load PDF: ' + err.message);
  } finally {
    elBtnSave.disabled = false;
    elBtnSave.textContent = '💾 Save';
  }
}

function showViewer() {
  elDropZone.classList.add('hidden');
  elViewer.classList.remove('hidden');
}

// Check for ?url= param on page load
(async () => {
  const params = new URLSearchParams(location.search);
  const url = params.get('url');
  if (url) await loadPdfFromUrl(decodeURIComponent(url));
})();

// ─── PDF Rendering ────────────────────────────────────────────────────────
async function renderPdf(data) {
  S.pdfDoc = await pdfjsLib.getDocument({ data }).promise;
  elPages.innerHTML = '';
  for (let i = 1; i <= S.pdfDoc.numPages; i++) {
    await renderPage(i);
  }
}

async function renderPage(num) {
  const page = await S.pdfDoc.getPage(num);
  const vp = page.getViewport({ scale: S.scale });

  const wrapper = document.createElement('div');
  wrapper.className = 'page-wrapper';
  wrapper.dataset.pageIndex = num - 1;

  const canvas = document.createElement('canvas');
  canvas.width = vp.width;
  canvas.height = vp.height;

  const overlay = document.createElement('div');
  overlay.className = 'page-overlay';
  overlay.style.width = vp.width + 'px';
  overlay.style.height = vp.height + 'px';

  wrapper.appendChild(canvas);
  wrapper.appendChild(overlay);
  elPages.appendChild(wrapper);

  await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;

  overlay.addEventListener('click', (e) => onOverlayClick(e, num - 1, overlay));
}

// ─── Toolbar: Sign ────────────────────────────────────────────────────────
elBtnSign.addEventListener('click', (e) => {
  e.stopPropagation();
  togglePanel('sign');
  if (!elSignPanel.classList.contains('hidden')) loadSigList();
});

// Upload & save signature from within the viewer
document.getElementById('sig-upload-viewer').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    chrome.storage.local.get('signatures', ({ signatures = [] }) => {
      signatures.push({ name: file.name, dataUrl: ev.target.result });
      chrome.storage.local.set({ signatures }, () => loadSigList());
    });
  };
  reader.readAsDataURL(file);
  e.target.value = '';
});

function loadSigList() {
  chrome.storage.local.get('signatures', ({ signatures = [] }) => {
    elSigList.innerHTML = '';
    if (!signatures.length) {
      elSigList.innerHTML = '<div style="color:#666;font-size:12px;text-align:center;padding:8px">No signatures yet.<br>Add them via the extension popup.</div>';
      return;
    }
    signatures.forEach((sig, i) => {
      const item = document.createElement('div');
      item.className = 'sig-thumb';
      item.innerHTML = `<img src="${sig.dataUrl}" alt="${sig.name}"><span>${sig.name}</span><button class="sig-del" title="Delete">×</button>`;
      item.querySelector('img').addEventListener('click', () => selectSignature(sig));
      item.querySelector('span').addEventListener('click', () => selectSignature(sig));
      item.querySelector('.sig-del').addEventListener('click', (e) => {
        e.stopPropagation();
        chrome.storage.local.get('signatures', ({ signatures = [] }) => {
          signatures.splice(i, 1);
          chrome.storage.local.set({ signatures }, loadSigList);
        });
      });
      elSigList.appendChild(item);
    });
  });
}

function selectSignature(sig) {
  S.pendingSig = sig;
  S.currentTool = 'sign';
  elBtnSign.classList.add('active');
  closeAllPanels();
  document.body.style.cursor = 'none';
  elFloatSig.src = sig.dataUrl;
  elFloatSig.classList.remove('hidden');
  elViewer.classList.add('tool-active');
}

function cancelSignMode() {
  S.pendingSig = null;
  S.currentTool = null;
  elBtnSign.classList.remove('active');
  document.body.style.cursor = '';
  elFloatSig.classList.add('hidden');
  if (!S.textActive) elViewer.classList.remove('tool-active');
}

// ─── Toolbar: Text ────────────────────────────────────────────────────────
elBtnText.addEventListener('click', () => activateTextMode());
elBtnTextCancel.addEventListener('click', () => cancelTextMode());

elFontFamily.addEventListener('change', () => { S.textCfg.family = elFontFamily.value; });
elFontSize.addEventListener('change', () => { S.textCfg.size = parseInt(elFontSize.value) || 16; });
elFontColor.addEventListener('input', () => { S.textCfg.color = elFontColor.value; });

function activateTextMode() {
  S.currentTool = 'text';
  S.textActive = true;
  elBtnText.classList.add('hidden');
  elTextToolbar.classList.remove('hidden');
  elViewer.classList.add('tool-active');
  cancelSignMode();
  closeAllPanels();
}

function cancelTextMode() {
  S.currentTool = null;
  S.textActive = false;
  elTextToolbar.classList.add('hidden');
  elBtnText.classList.remove('hidden');
  if (!S.pendingSig) elViewer.classList.remove('tool-active');
}

// ─── Panel helpers ────────────────────────────────────────────────────────
function togglePanel(name) {
  if (name === 'sign') elSignPanel.classList.toggle('hidden');
}

function closeAllPanels() {
  elSignPanel.classList.add('hidden');
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.tb-tool-wrap')) closeAllPanels();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    cancelSignMode();
    cancelTextMode();
    closeAllPanels();
  }
});

// ─── Floating signature follows cursor ────────────────────────────────────
document.addEventListener('mousemove', (e) => {
  if (!S.pendingSig) return;
  elFloatSig.style.left = e.clientX + 'px';
  elFloatSig.style.top = e.clientY + 'px';
});

// ─── Click on overlay to place annotation ─────────────────────────────────
function onOverlayClick(e, pageIndex, overlay) {
  if (S.pendingSig) {
    placeSignature(e, pageIndex, overlay);
    return;
  }
  if (S.textActive) {
    placeTextBox(e, pageIndex, overlay);
  }
}

function placeSignature(e, pageIndex, overlay) {
  const rect = overlay.getBoundingClientRect();
  const imgNatural = { w: elFloatSig.naturalWidth || 200, h: elFloatSig.naturalHeight || 80 };
  const dispH = 80;
  const dispW = Math.round(imgNatural.w * dispH / imgNatural.h);

  const x = e.clientX - rect.left - dispW / 2;
  const y = e.clientY - rect.top - dispH / 2;

  const ann = createAnnotation({
    type: 'img',
    pageIndex,
    overlay,
    x: Math.max(0, x),
    y: Math.max(0, y),
    w: dispW,
    h: dispH,
    dataUrl: S.pendingSig.dataUrl,
  });

  cancelSignMode();
  // Allow placing another — re-select: actually cancel after one placement.
  // If user wants to place again, they pick from dropdown again.
}

function placeTextBox(e, pageIndex, overlay) {
  const rect = overlay.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  cancelTextMode(); // deactivate tool before placing so overlay clicks do nothing

  const ann = createAnnotation({
    type: 'text',
    pageIndex,
    overlay,
    x,
    y,
    w: 220,
    h: S.textCfg.size + 12, // will auto-grow
    textCfg: { ...S.textCfg },
  });

  // Start editing immediately
  const textEl = ann.el.querySelector('.ann-text');
  textEl.contentEditable = 'true';
  textEl.classList.add('editing');
  textEl.focus();
  // Place cursor at end
  const range = document.createRange();
  range.selectNodeContents(textEl);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

// ─── Annotation creation ──────────────────────────────────────────────────
function createAnnotation(cfg) {
  const id = ++annIdSeq;
  const el = document.createElement('div');
  el.className = 'annotation';
  el.dataset.annId = id;
  el.style.left = cfg.x + 'px';
  el.style.top = cfg.y + 'px';
  el.style.width = cfg.w + 'px';
  el.style.height = cfg.h + 'px';

  if (cfg.type === 'img') {
    el.classList.add('ann-img');
    const img = document.createElement('img');
    img.src = cfg.dataUrl;
    el.appendChild(img);
  } else {
    el.classList.add('ann-text-wrap');
    const textEl = document.createElement('div');
    textEl.className = 'ann-text';
    textEl.style.fontSize = cfg.textCfg.size + 'px';
    textEl.style.color = cfg.textCfg.color;
    textEl.style.fontFamily = cfg.textCfg.family;
    el.appendChild(textEl);

    textEl.addEventListener('input', () => {
      // Auto-grow height to fit content
      el.style.height = 'auto';
      el.style.height = Math.max(textEl.scrollHeight + 4, S.textCfg.size + 12) + 'px';
    });
    textEl.addEventListener('blur', () => {
      textEl.contentEditable = 'false';
      textEl.classList.remove('editing');
    });
    textEl.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      textEl.contentEditable = 'true';
      textEl.classList.add('editing');
      textEl.focus();
    });
    textEl.addEventListener('mousedown', (e) => {
      // Don't drag when editing
      if (textEl.contentEditable === 'true') e.stopPropagation();
    });
    textEl.addEventListener('click', (e) => {
      if (textEl.contentEditable === 'true') e.stopPropagation();
    });
  }

  // Resize handles
  ['nw','n','ne','e','se','s','sw','w'].forEach(dir => {
    const h = document.createElement('div');
    h.className = 'ann-handle';
    h.dataset.dir = dir;
    el.appendChild(h);
    h.addEventListener('mousedown', (e) => startResize(e, el, dir));
  });

  // Delete button
  const del = document.createElement('button');
  del.className = 'ann-delete';
  del.textContent = '×';
  del.title = 'Delete';
  del.addEventListener('click', (e) => {
    e.stopPropagation();
    el.remove();
    S.annotations = S.annotations.filter(a => a.id !== id);
  });
  el.appendChild(del);

  // Drag to move
  el.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('ann-handle') || e.target.classList.contains('ann-delete')) return;
    startMove(e, el);
  });

  cfg.overlay.appendChild(el);

  const ann = {
    id,
    type: cfg.type,
    pageIndex: cfg.pageIndex,
    el,
    dataUrl: cfg.dataUrl,
    textCfg: cfg.textCfg,
  };
  S.annotations.push(ann);
  return ann;
}

// ─── Drag to move ─────────────────────────────────────────────────────────
function startMove(e, el) {
  e.preventDefault();
  e.stopPropagation();
  const startX = e.clientX - el.offsetLeft;
  const startY = e.clientY - el.offsetTop;
  const parent = el.parentElement;
  const maxX = parent.offsetWidth;
  const maxY = parent.offsetHeight;

  function onMove(ev) {
    const x = Math.max(0, Math.min(ev.clientX - startX, maxX - el.offsetWidth));
    const y = Math.max(0, Math.min(ev.clientY - startY, maxY - el.offsetHeight));
    el.style.left = x + 'px';
    el.style.top = y + 'px';
  }
  function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

// ─── Resize ───────────────────────────────────────────────────────────────
function startResize(e, el, dir) {
  e.preventDefault();
  e.stopPropagation();

  const startX = e.clientX;
  const startY = e.clientY;
  const origLeft = el.offsetLeft;
  const origTop = el.offsetTop;
  const origW = el.offsetWidth;
  const origH = el.offsetHeight;
  const minSize = 20;

  function onMove(ev) {
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    let left = origLeft, top = origTop, w = origW, h = origH;

    if (dir.includes('e')) w = Math.max(minSize, origW + dx);
    if (dir.includes('s')) h = Math.max(minSize, origH + dy);
    if (dir.includes('w')) { w = Math.max(minSize, origW - dx); left = origLeft + origW - w; }
    if (dir.includes('n')) { h = Math.max(minSize, origH - dy); top = origTop + origH - h; }

    el.style.left = left + 'px';
    el.style.top = top + 'px';
    el.style.width = w + 'px';
    el.style.height = h + 'px';
  }
  function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

// ─── Save PDF ─────────────────────────────────────────────────────────────
elBtnSave.addEventListener('click', savePdf);

async function savePdf() {
  if (!S.pdfBytes) { alert('No PDF loaded.'); return; }

  elBtnSave.textContent = '⏳ Saving…';
  elBtnSave.disabled = true;

  try {
    const { PDFDocument, rgb, StandardFonts } = PDFLib;
    const pdfLibDoc = await PDFDocument.load(S.pdfBytes);
    const pages = pdfLibDoc.getPages();

    // Preload fonts
    const fontMap = {
      'Helvetica': StandardFonts.Helvetica,
      'Times New Roman': StandardFonts.TimesRoman,
      'Courier New': StandardFonts.Courier,
      'Georgia': StandardFonts.TimesRoman,
    };
    const embeddedFonts = {};
    for (const [key, stdFont] of Object.entries(fontMap)) {
      embeddedFonts[key] = await pdfLibDoc.embedFont(stdFont);
    }

    for (const ann of S.annotations) {
      const el = ann.el;
      const pageIdx = ann.pageIndex;
      const pdfPage = pages[pageIdx];
      const { width: pdfW, height: pdfH } = pdfPage.getSize();

      const canvas = document.querySelector(`[data-page-index="${pageIdx}"] canvas`);
      const canvasW = canvas.width;
      const canvasH = canvas.height;

      // Pixel coords of annotation element relative to overlay
      const left = el.offsetLeft;
      const top = el.offsetTop;
      const w = el.offsetWidth;
      const h = el.offsetHeight;

      // Convert to PDF points (canvas pixels → PDF points, flip y)
      const scaleX = pdfW / canvasW;
      const scaleY = pdfH / canvasH;
      const pdfX = left * scaleX;
      const pdfY = pdfH - (top + h) * scaleY;
      const pdfAnnW = w * scaleX;
      const pdfAnnH = h * scaleY;

      if (ann.type === 'img') {
        let embeddedImg;
        try {
          // Convert any image format to PNG via canvas for maximum compatibility
          const pngDataUrl = await toPngDataUrl(ann.dataUrl);
          const base64 = pngDataUrl.split(',')[1];
          const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
          embeddedImg = await pdfLibDoc.embedPng(bytes);
        } catch (err) {
          console.warn('Could not embed image:', err);
        }
        if (embeddedImg) {
          pdfPage.drawImage(embeddedImg, { x: pdfX, y: pdfY, width: pdfAnnW, height: pdfAnnH });
        }
      } else if (ann.type === 'text') {
        const textEl = el.querySelector('.ann-text');
        const text = textEl.innerText || textEl.textContent || '';
        if (!text.trim()) continue;

        const cfg = ann.textCfg;
        const font = embeddedFonts[cfg.family] || embeddedFonts['Helvetica'];
        const size = cfg.size * scaleY;
        const color = hexToRgb(cfg.color);

        // Split into lines and draw each
        const lines = text.split('\n');
        const lineHeight = size * 1.3;
        let drawY = pdfY + pdfAnnH - size; // start from top of box

        for (const line of lines) {
          if (!line) { drawY -= lineHeight; continue; }
          try {
            pdfPage.drawText(line, {
              x: pdfX + 2,
              y: drawY,
              size,
              font,
              color: rgb(color.r, color.g, color.b),
              maxWidth: pdfAnnW - 4,
            });
          } catch (err) { /* skip unrenderable characters */ }
          drawY -= lineHeight;
          if (drawY < pdfY) break;
        }
      }
    }

    const savedBytes = await pdfLibDoc.save();
    const blob = new Blob([savedBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);

    // Suggest a filename
    const origName = elPdfName.textContent.replace(/\.pdf$/i, '') || 'document';
    const a = document.createElement('a');
    a.href = url;
    a.download = origName + '_signed.pdf';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch (err) {
    console.error('Save failed:', err);
    alert('Failed to save PDF: ' + err.message);
  } finally {
    elBtnSave.textContent = '💾 Save';
    elBtnSave.disabled = false;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return { r, g, b };
}

function toPngDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}
