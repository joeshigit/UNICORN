
(function (g) {
  'use strict';
  function runSession(opts) {
    'use strict';
  var overlayRoot = opts.overlayRoot;
  var runOpts = opts;

  var pasteHandler = function (e) {
    if (!overlayRoot || !overlayRoot.parentNode) return;
    var items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    var blob = null;
    for (var i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image/') === 0) {
        blob = items[i].getAsFile();
        break;
      }
    }
    if (!blob) return;
    e.preventDefault();
    e.stopPropagation();
    applyPaste(blob);
  };
  document.addEventListener('paste', pasteHandler, true);
  runOpts._pasteHandler = pasteHandler;


  var JPEG_Q = 0.9;
  var PAGE_W_MM = 210;
  var PAGE_H_MM = 297;
  var CELL_W_MM = 190;
  var CELL_H_MM = 132;
  /** 每格內圖片距格線四邊各 1 cm */
  var CELL_INSET_MM = 10;
  var MARGIN_X_MM = 10;
  /** 上緣略上移，頁底留給說明文字（與 PDF 同頁） */
  var TOP_Y_MM = 5;
  /** 直式 A/B 垂直間距（原 6mm，再縮 30% → 4.2mm） */
  var GAP_MM = 4.2;
  var CELL2_Y_MM = TOP_Y_MM + CELL_H_MM + GAP_MM;
  var NOTE_GAP_BELOW_CELLS_MM = 2;
  var PAGE_BOTTOM_MARGIN_MM = 6;

  /** 橫式 A4：格高 18cm；左右邊距各 8mm；A/B 間距 0.5cm；單格寬度填滿剩餘寬度 */
  var L_SIDE_MM = 8;
  var L_GAP_MM = 5;
  var L_PAGE_W = 297;
  var L_PAGE_H = 210;
  var L_CELL_H_MM = 180;
  var L_CELL_W_MM = (L_PAGE_W - 2 * L_SIDE_MM - L_GAP_MM) / 2;
  var L_START_X = L_SIDE_MM;
  /** 橫式頁頂到圖格距離為直式 TOP_Y 之 50%（2.5mm），騰出頁底給 20pt 說明 */
  var L_START_Y = TOP_Y_MM * 0.5;

  /** 直式三格：8 + 3×84 + 3×3 + 22 + 6 = 297mm；欄寬 190mm；欄間／欄與說明間 3mm */
  var P3_TOP_Y_MM = 8;
  var P3_GAP_MM = 3;
  var P3_CELL_W_MM = 190;
  var P3_CELL_H_MM = 84;
  var P3_Y1_MM = P3_TOP_Y_MM;
  var P3_Y2_MM = P3_Y1_MM + P3_CELL_H_MM + P3_GAP_MM;
  var P3_Y3_MM = P3_Y2_MM + P3_CELL_H_MM + P3_GAP_MM;

  /** 橫式三欄：高 180mm；欄間 3mm；單欄寬 (297−16−6)/3 */
  var L3_GAP_MM = 3;
  var L3_CELL_H_MM = 180;
  var L3_CELL_W_MM = (L_PAGE_W - 2 * L_SIDE_MM - 2 * L3_GAP_MM) / 3;

  /** 單格＝A/B 兩格合併：外框不動，只拿掉中間間隙。下緣因此與兩格版面相同，
      頁尾說明的位置計算不需另加分支。 */
  var P1_CELL_H_MM = CELL_H_MM * 2 + GAP_MM;
  var L1_CELL_W_MM = L_CELL_W_MM * 2 + L_GAP_MM;

  /** p1／p2／p3／l1／l2／l3 */
  var layoutKind = 'p2';
  var activeSlot = 'A';
  /** 貼上順序，最新的在最後；切換版面時用來決定留哪幾張 */
  var pasteOrder = [];
  var urlA = null;
  var urlB = null;
  var urlC = null;
  var prRoot = null;
  var prStyle = null;
  var handoffDone = false;
  var busy = false;
  runOpts._cleanupUrls = function () {
    printCleanup();
    revoke(urlA); revoke(urlB); revoke(urlC);
    urlA = urlB = urlC = null;
  };

  var NOTE_MAX_CHARS = 200;
  var NOTE_FONT_PT = 20;
  /** 固定下載檔名（不詢問路徑／另存新檔）；日後改伺服器直存可改為 pdf.output('blob') 上傳 */
  var PDF_OUTPUT_FILENAME = 'bill-paste.pdf';

  var guidePortrait = document.getElementById('bp-guide-portrait');
  var guidePortrait3 = document.getElementById('bp-guide-portrait3');
  var guideLandscape = document.getElementById('bp-guide-landscape');
  var guideLandscape3 = document.getElementById('bp-guide-landscape3');
  var guidePortrait1 = document.getElementById('bp-guide-portrait1');
  var guideLandscape1 = document.getElementById('bp-guide-landscape1');
  var pasteNoteEl = document.getElementById('bp-paste-note');
  var pasteNoteCountEl = document.getElementById('bp-paste-note-count');
  var slotA = document.getElementById('bp-slot-a');
  var slotB = document.getElementById('bp-slot-b');
  var slotC = document.getElementById('bp-slot-c');
  var previewA = document.getElementById('bp-preview-a');
  var previewB = document.getElementById('bp-preview-b');
  var previewC = document.getElementById('bp-preview-c');
  var btnPdf = document.getElementById('bp-btn-pdf');
  var btnDeleteSlot = document.getElementById('bp-btn-delete-slot');
  var btnClear = document.getElementById('bp-btn-clear');
  var msgEl = document.getElementById('bp-msg');
  var askEl = document.getElementById('bp-ask');
  var askPrintBtn = document.getElementById('bp-ask-print');
  var askSaveBtn = document.getElementById('bp-ask-save');
  var askCancelBtn = document.getElementById('bp-ask-cancel');
  var toolbarEl = overlayRoot.querySelector('.col-guide .toolbar');

  function isGrayOutput() {
    var r = document.querySelector('input[name="bp-paste-img-mode"]:checked');
    return !r || r.value === 'gray';
  }

  function syncPreviewGrayFilter() {
    overlayRoot.classList.toggle('bp-preview-gray', isGrayOutput());
  }

  document.querySelectorAll('input[name="bp-paste-img-mode"]').forEach(function (radio) {
    radio.addEventListener('change', syncPreviewGrayFilter);
  });
  syncPreviewGrayFilter();

  function updatePasteNoteCount() {
    if (!pasteNoteEl || !pasteNoteCountEl) return;
    pasteNoteCountEl.textContent = pasteNoteEl.value.length + '/' + NOTE_MAX_CHARS;
  }
  if (pasteNoteEl) {
    pasteNoteEl.addEventListener('input', updatePasteNoteCount);
    updatePasteNoteCount();
  }

  function setMsg(text, kind) {
    msgEl.textContent = text || '';
    msgEl.className = 'msg' + (kind === 'err' ? ' err' : kind === 'ok' ? ' ok' : '');
  }

  function isLandKind() {
    return layoutKind === 'l1' || layoutKind === 'l2' || layoutKind === 'l3';
  }
  function isThreeKind() {
    return layoutKind === 'p3' || layoutKind === 'l3';
  }
  function isOneKind() {
    return layoutKind === 'p1' || layoutKind === 'l1';
  }

  function setLayoutKind(kind) {
    layoutKind = kind;
    overlayRoot.classList.toggle('bp-mode-land', isLandKind());
    overlayRoot.classList.toggle('bp-mode-3', isThreeKind());
    overlayRoot.classList.toggle('bp-mode-1', isOneKind());
    var blocks = [
      [guidePortrait1, 'p1'], [guidePortrait, 'p2'], [guidePortrait3, 'p3'],
      [guideLandscape1, 'l1'], [guideLandscape, 'l2'], [guideLandscape3, 'l3']
    ];
    for (var i = 0; i < blocks.length; i++) {
      if (!blocks[i][0]) continue;
      blocks[i][0].classList.toggle('active', kind === blocks[i][1]);
      blocks[i][0].setAttribute('aria-pressed', kind === blocks[i][1] ? 'true' : 'false');
    }
    if (!isThreeKind() && activeSlot === 'C') setActive('A');
    return collapseToCapacity();
  }

  var layoutMsg = {
    p1: '已切換：直式單格（整頁 A）。',
    p2: '已切換：直式兩格（上 A、下 B）。',
    p3: '已切換：直式三格（上 A、中 B、下 C）。',
    l1: '已切換：橫式單格（整頁 A）。',
    l2: '已切換：橫式兩欄（左 A、右 B）。',
    l3: '已切換：橫式三欄（左 A、中 B、右 C）。'
  };

  function bindGuideKind(el, kind) {
    function go() {
      var dropped = setLayoutKind(kind);
      var m = layoutMsg[kind] || '';
      if (dropped) {
        m += '已保留最後貼上的 ' + layoutCells().length + ' 張，其餘已清除。';
      }
      setMsg(m, 'ok');
    }
    el.addEventListener('click', function (e) {
      e.preventDefault();
      go();
    });
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        go();
      }
    });
  }
  if (guidePortrait1) bindGuideKind(guidePortrait1, 'p1');
  bindGuideKind(guidePortrait, 'p2');
  bindGuideKind(guidePortrait3, 'p3');
  if (guideLandscape1) bindGuideKind(guideLandscape1, 'l1');
  bindGuideKind(guideLandscape, 'l2');
  bindGuideKind(guideLandscape3, 'l3');
  setLayoutKind('p2');

  function setActive(slot) {
    activeSlot = slot;
    slotA.classList.toggle('active', slot === 'A');
    slotB.classList.toggle('active', slot === 'B');
    if (slotC) slotC.classList.toggle('active', slot === 'C');
    if (slot === 'A') slotA.focus();
    else if (slot === 'B') slotB.focus();
    else if (slotC) slotC.focus();
    syncDeleteSlotButton();
  }

  function urlForSlot(slot) {
    if (slot === 'A') return urlA;
    if (slot === 'B') return urlB;
    if (slot === 'C') return urlC;
    return null;
  }

  function syncDeleteSlotButton() {
    if (!btnDeleteSlot) return;
    btnDeleteSlot.disabled = !urlForSlot(activeSlot);
  }

  function dropFromPasteOrder(slot) {
    pasteOrder = pasteOrder.filter(function (s) { return s !== slot; });
  }

  /* 版面放得下幾張就留幾張，留最新貼上的，並一律重新由 A 排起。
     重排不能只在超量時才做：若使用者只貼了 B 就切到單格版面，A 那一格會是空的，
     輸出會變成一張白紙。 */
  function collapseToCapacity() {
    var cap = layoutCells().length;
    var filled = pasteOrder.filter(function (s) { return urlForSlot(s); });
    var keep = filled.length > cap ? filled.slice(filled.length - cap) : filled;
    var urls = keep.map(urlForSlot);
    var i;
    for (i = 0; i < filled.length; i++) {
      if (keep.indexOf(filled[i]) < 0) revoke(urlForSlot(filled[i]));
    }
    urlA = urls[0] || null;
    urlB = urls[1] || null;
    urlC = urls[2] || null;
    pasteOrder = ['A', 'B', 'C'].slice(0, urls.length);
    updatePreview('A', urlA);
    updatePreview('B', urlB);
    updatePreview('C', urlC);
    if (!urlForSlot(activeSlot)) setActive('A');
    return filled.length - keep.length;
  }

  function clearSlotByLetter(slotLetter) {
    dropFromPasteOrder(slotLetter);
    if (slotLetter === 'A') {
      revoke(urlA);
      urlA = null;
      updatePreview('A', null);
    } else if (slotLetter === 'B') {
      revoke(urlB);
      urlB = null;
      updatePreview('B', null);
    } else if (slotLetter === 'C') {
      revoke(urlC);
      urlC = null;
      updatePreview('C', null);
    }
    setMsg('已刪除槽位 ' + slotLetter + ' 的圖片。', 'ok');
  }

  function revoke(url) {
    if (url) try { URL.revokeObjectURL(url); } catch (e) {}
  }

  function updatePreview(slotLetter, url) {
    var wrap = slotLetter === 'A' ? previewA : slotLetter === 'B' ? previewB : previewC;
    wrap.innerHTML = '';
    if (url) {
      var im = document.createElement('img');
      im.alt = '貼上預覽 ' + slotLetter;
      im.src = url;
      wrap.appendChild(im);
    } else {
      var letter = document.createElement('span');
      letter.className = 'slot-letter';
      letter.setAttribute('aria-hidden', 'true');
      letter.textContent = slotLetter;
      wrap.appendChild(letter);
    }
    /* 至少一槽有圖即可產生 PDF */
    var hasAny = urlA || urlB || urlC;
    btnPdf.disabled = !hasAny;
    syncDeleteSlotButton();
  }

  function applyPaste(blob) {
    if (!blob || !blob.type || blob.type.indexOf('image/') !== 0) {
      setMsg('剪貼簿內不是圖片，請先用 Win+Shift+S 剪取畫面後再貼上。', 'err');
      return;
    }
    var slot = activeSlot;
    if (slot === 'A') {
      revoke(urlA);
      urlA = URL.createObjectURL(blob);
      updatePreview('A', urlA);
    } else if (slot === 'B') {
      revoke(urlB);
      urlB = URL.createObjectURL(blob);
      updatePreview('B', urlB);
    } else {
      revoke(urlC);
      urlC = URL.createObjectURL(blob);
      updatePreview('C', urlC);
    }
    dropFromPasteOrder(slot);
    pasteOrder.push(slot);
    setMsg('已貼上至槽位 ' + slot + '。', 'ok');
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var im = new Image();
      im.onload = function () { resolve(im); };
      im.onerror = function () { reject(new Error('load')); };
      im.src = src;
    });
  }

  function imageToJpegDataURL(img, q, asGray) {
    var w = img.naturalWidth;
    var h = img.naturalHeight;
    if (!w || !h) return null;
    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    var cx = c.getContext('2d');
    cx.drawImage(img, 0, 0);
    if (asGray) {
      var imageData = cx.getImageData(0, 0, w, h);
      var d = imageData.data;
      for (var j = 0; j < d.length; j += 4) {
        var g = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
        d[j] = d[j + 1] = d[j + 2] = g;
      }
      cx.putImageData(imageData, 0, 0);
    }
    return c.toDataURL('image/jpeg', q);
  }

  /** 各版面的圖格座標（mm）。PDF 與列印共用這一份，兩邊才不會各算一套而走樣。 */
  function layoutCells() {
    if (layoutKind === 'p1') {
      return [{ x: MARGIN_X_MM, y: TOP_Y_MM, w: CELL_W_MM, h: P1_CELL_H_MM }];
    }
    if (layoutKind === 'l1') {
      return [{ x: L_START_X, y: L_START_Y, w: L1_CELL_W_MM, h: L_CELL_H_MM }];
    }
    if (isLandKind()) {
      if (layoutKind === 'l3') {
        var step3 = L3_CELL_W_MM + L3_GAP_MM;
        return [
          { x: L_START_X, y: L_START_Y, w: L3_CELL_W_MM, h: L3_CELL_H_MM },
          { x: L_START_X + step3, y: L_START_Y, w: L3_CELL_W_MM, h: L3_CELL_H_MM },
          { x: L_START_X + 2 * step3, y: L_START_Y, w: L3_CELL_W_MM, h: L3_CELL_H_MM }
        ];
      }
      return [
        { x: L_START_X, y: L_START_Y, w: L_CELL_W_MM, h: L_CELL_H_MM },
        { x: L_START_X + L_CELL_W_MM + L_GAP_MM, y: L_START_Y, w: L_CELL_W_MM, h: L_CELL_H_MM }
      ];
    }
    if (layoutKind === 'p3') {
      return [
        { x: MARGIN_X_MM, y: P3_Y1_MM, w: P3_CELL_W_MM, h: P3_CELL_H_MM },
        { x: MARGIN_X_MM, y: P3_Y2_MM, w: P3_CELL_W_MM, h: P3_CELL_H_MM },
        { x: MARGIN_X_MM, y: P3_Y3_MM, w: P3_CELL_W_MM, h: P3_CELL_H_MM }
      ];
    }
    return [
      { x: MARGIN_X_MM, y: TOP_Y_MM, w: CELL_W_MM, h: CELL_H_MM },
      { x: MARGIN_X_MM, y: CELL2_Y_MM, w: CELL_W_MM, h: CELL_H_MM }
    ];
  }

  /** 圖片在格內留 1cm 內距等比置中，回傳 mm 座標 */
  function cellContainMm(img, cell) {
    var inset = CELL_INSET_MM;
    var icx = cell.x + inset;
    var icy = cell.y + inset;
    var icw = cell.w - 2 * inset;
    var ich = cell.h - 2 * inset;
    if (icw <= 0 || ich <= 0) return null;
    var ir = img.naturalWidth / img.naturalHeight;
    var cr = icw / ich;
    var dw, dh;
    if (ir > cr) {
      dw = icw;
      dh = icw / ir;
    } else {
      dh = ich;
      dw = ich * ir;
    }
    return { x: icx + (icw - dw) / 2, y: icy + (ich - dh) / 2, w: dw, h: dh };
  }

  function wrapTextForCanvas(ctx, text, maxWpx) {
    var lines = [];
    var paras = String(text).replace(/\r\n/g, '\n').split('\n');
    for (var p = 0; p < paras.length; p++) {
      var para = paras[p];
      var i = 0;
      while (i < para.length) {
        var line = '';
        while (i < para.length) {
          var ch = para.charAt(i);
          var test = line + ch;
          if (ctx.measureText(test).width > maxWpx && line.length > 0) break;
          line = test;
          i++;
        }
        if (!line.length && i < para.length) {
          line = para.charAt(i);
          i++;
        }
        lines.push(line);
      }
      if (p < paras.length - 1) lines.push('');
    }
    return lines;
  }

  /** Canvas 轉 PNG 供 PDF 嵌入（中文＋紅字，不受灰階圖影響） */
  function renderNotePngForPdf(text, maxContentMm) {
    var mmToPx = 96 / 25.4;
    var dpr = Math.min(2, typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1);
    var maxWpx = maxContentMm * mmToPx * dpr;
    var fontPx = NOTE_FONT_PT * dpr;
    var fontStack = '"Microsoft JhengHei","Microsoft JhengHei UI","PingFang TC","Segoe UI",sans-serif';
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d');
    ctx.font = fontPx + 'px ' + fontStack;
    var lines = wrapTextForCanvas(ctx, text, maxWpx);
    var lh = fontPx * 1.38;
    var pad = 10 * dpr;
    canvas.width = Math.ceil(maxWpx + pad * 2);
    canvas.height = Math.ceil(Math.max(1, lines.length) * lh + pad * 2);
    ctx.font = fontPx + 'px ' + fontStack;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#c62828';
    for (var li = 0; li < lines.length; li++) {
      ctx.fillText(lines[li], pad, pad + (li + 1) * lh - fontPx * 0.28);
    }
    var hMm = (canvas.height / dpr) / mmToPx;
    return { dataUrl: canvas.toDataURL('image/png'), wMm: maxContentMm, hMm: hMm };
  }

  /** 說明放在第一頁、圖格下方（不另開新頁）；回傳 mm 座標供 PDF 與列印共用 */
  function footerNotePlacement() {
    if (!pasteNoteEl) return null;
    var t = pasteNoteEl.value.replace(/^\s+|\s+$/g, '');
    if (!t) return null;
    var noteTopY;
    var maxH;
    var maxW;
    if (isLandKind()) {
      maxW = L_PAGE_W - 2 * MARGIN_X_MM;
      noteTopY = L_START_Y + L_CELL_H_MM + NOTE_GAP_BELOW_CELLS_MM;
      maxH = L_PAGE_H - noteTopY - PAGE_BOTTOM_MARGIN_MM;
    } else if (isThreeKind()) {
      maxW = PAGE_W_MM - 2 * MARGIN_X_MM;
      noteTopY = P3_Y3_MM + P3_CELL_H_MM + P3_GAP_MM;
      maxH = PAGE_H_MM - noteTopY - PAGE_BOTTOM_MARGIN_MM;
    } else {
      maxW = PAGE_W_MM - 2 * MARGIN_X_MM;
      noteTopY = CELL2_Y_MM + CELL_H_MM + NOTE_GAP_BELOW_CELLS_MM;
      maxH = PAGE_H_MM - noteTopY - PAGE_BOTTOM_MARGIN_MM;
    }
    if (maxH <= 2 || maxW <= 2) return null;
    var png = renderNotePngForPdf(t, maxW);
    var drawW = png.wMm;
    var drawH = png.hMm;
    if (drawH > maxH) {
      var s = maxH / drawH;
      drawH = maxH;
      drawW *= s;
    }
    if (drawW > maxW) {
      var s2 = maxW / drawW;
      drawW *= s2;
      drawH *= s2;
    }
    return { dataUrl: png.dataUrl, fmt: 'PNG', x: MARGIN_X_MM, y: noteTopY, w: drawW, h: drawH };
  }

  /** 整頁輸出清單（mm）。同一份清單餵給 PDF 與列印，印出來與存檔的內容不可能不同。 */
  function buildPageItems(imgs) {
    var cells = layoutCells();
    var gray = isGrayOutput();
    var items = [];
    var i, fit, dataUrl;
    for (i = 0; i < cells.length; i++) {
      if (!imgs[i]) continue;
      fit = cellContainMm(imgs[i], cells[i]);
      if (!fit) continue;
      dataUrl = imageToJpegDataURL(imgs[i], JPEG_Q, gray);
      if (!dataUrl) continue;
      items.push({ dataUrl: dataUrl, fmt: 'JPEG', x: fit.x, y: fit.y, w: fit.w, h: fit.h });
    }
    var note = footerNotePlacement();
    if (note) items.push(note);
    return items;
  }

  function pdfFromItems(JsPDF, items) {
    var pdf = new JsPDF({ orientation: isLandKind() ? 'l' : 'p', unit: 'mm', format: 'a4' });
    for (var i = 0; i < items.length; i++) {
      pdf.addImage(items[i].dataUrl, items[i].fmt, items[i].x, items[i].y, items[i].w, items[i].h);
    }
    return pdf;
  }

  function printCleanup() {
    if (prRoot && prRoot.parentNode) prRoot.parentNode.removeChild(prRoot);
    if (prStyle && prStyle.parentNode) prStyle.parentNode.removeChild(prStyle);
    prRoot = null;
    prStyle = null;
  }

  function waitImages(container, cb) {
    var imgs = container.getElementsByTagName('img');
    var pending = imgs.length;
    if (!pending) { cb(); return; }
    function one() { pending--; if (pending <= 0) cb(); }
    for (var i = 0; i < imgs.length; i++) {
      if (imgs[i].complete) { one(); continue; }
      imgs[i].onload = one;
      imgs[i].onerror = one;
    }
  }

  /* Apps Script 以沙箱 iframe 服務頁面，由此開出的彈出視窗會拿到 opaque origin，
     解析不了本頁建立的 blob URL，因此列印一律留在同一份 document，影像用 data URL
     自帶內容。紙張方向必須跟著 layoutKind，否則橫式版面會被縮到不成比例。 */
  function printItems(items, done) {
    var land = isLandKind();
    var pw = land ? L_PAGE_W : PAGE_W_MM;
    var ph = land ? L_PAGE_H : PAGE_H_MM;
    printCleanup();

    prStyle = document.createElement('style');
    prStyle.textContent =
      '@media print{@page{size:A4 ' + (land ? 'landscape' : 'portrait') + ';margin:0}' +
      'html,body{margin:0;padding:0;background:#fff}' +
      'body>*{display:none !important}' +
      'body>#bp-print-root{display:block !important}' +
      '#bp-print-root .bp-print-page{position:relative;width:' + pw + 'mm;height:' + ph +
      'mm;overflow:hidden;background:#fff}' +
      '#bp-print-root .bp-print-page img{position:absolute;display:block}}';
    document.head.appendChild(prStyle);

    prRoot = document.createElement('div');
    prRoot.id = 'bp-print-root';
    var page = document.createElement('div');
    page.className = 'bp-print-page';
    var i, im;
    for (i = 0; i < items.length; i++) {
      im = document.createElement('img');
      im.alt = '';
      im.style.left = items[i].x + 'mm';
      im.style.top = items[i].y + 'mm';
      im.style.width = items[i].w + 'mm';
      im.style.height = items[i].h + 'mm';
      im.src = items[i].dataUrl;
      page.appendChild(im);
    }
    prRoot.appendChild(page);
    document.body.appendChild(prRoot);

    waitImages(page, function () {
      var settled = false;
      function finish(ok) {
        if (settled) return;
        settled = true;
        window.removeEventListener('afterprint', onAfter);
        printCleanup();
        done(ok);
      }
      function onAfter() { finish(true); }
      window.addEventListener('afterprint', onAfter);
      try {
        window.print();
      } catch (e) {
        finish(false);
        return;
      }
      /* 少數瀏覽器不觸發 afterprint；補一道長時保險，確保存檔一定會執行 */
      setTimeout(function () { finish(true); }, 60000);
    });
  }

  slotA.addEventListener('click', function () { setActive('A'); });
  slotB.addEventListener('click', function () { setActive('B'); });
  if (slotC) slotC.addEventListener('click', function () { setActive('C'); });

  function bindSlotDeleteKey(el, letter) {
    if (!el) return;
    el.addEventListener('keydown', function (e) {
      if (e.key !== 'Delete') return;
      if (e.target !== el) return;
      if (!urlForSlot(letter)) return;
      e.preventDefault();
      clearSlotByLetter(letter);
    });
  }
  bindSlotDeleteKey(slotA, 'A');
  bindSlotDeleteKey(slotB, 'B');
  bindSlotDeleteKey(slotC, 'C');

  if (btnDeleteSlot) {
    btnDeleteSlot.addEventListener('click', function () {
      if (!urlForSlot(activeSlot)) return;
      clearSlotByLetter(activeSlot);
    });
  }


  btnClear.addEventListener('click', function () {
    revoke(urlA);
    revoke(urlB);
    revoke(urlC);
    urlA = urlB = urlC = null;
    pasteOrder = [];
    updatePreview('A', null);
    updatePreview('B', null);
    updatePreview('C', null);
    if (pasteNoteEl) {
      pasteNoteEl.value = '';
      updatePasteNoteCount();
    }
    setMsg('已清除。', 'ok');
    setActive('A');
  });

  function getJsPDF() {
    return (window.jspdf && window.jspdf.jsPDF) || (typeof jspdf !== 'undefined' && jspdf.jsPDF);
  }

  function setAsking(on) {
    if (askEl) askEl.classList.toggle('active', on);
    if (toolbarEl) toolbarEl.style.display = on ? 'none' : '';
  }

  /** 交檔與關窗只跑一次，且不因列印失敗而略過，避免辛苦拼好的 PDF 消失 */
  function handoff(pdfBlob) {
    if (handoffDone) return;
    handoffDone = true;
    if (!overlayRoot || !overlayRoot.parentNode) return;
    setMsg('PDF 已產生。', 'ok');
    if (runOpts.onConfirm) runOpts.onConfirm(pdfBlob);
    if (runOpts._close) runOpts._close();
  }

  function outputFailed(text) {
    busy = false;
    btnPdf.disabled = !(urlA || urlB || urlC);
    setMsg(text, 'err');
  }

  /* PDF 只產生一次，同一份同時用於列印與交檔。順序必須是先送出列印再交檔：
     零用現金入口的 onConfirm 會立刻鎖住畫面並上傳，反過來會蓋掉列印流程。 */
  function runOutput(alsoPrint) {
    var JsPDF = getJsPDF();
    if (!JsPDF) {
      setMsg('jsPDF 未載入，請檢查網路或 CDN。', 'err');
      return;
    }
    busy = true;
    btnPdf.disabled = true;
    setMsg('產生中…', 'ok');
    var raf = window.requestAnimationFrame || function (cb) { setTimeout(cb, 0); };
    raf(function () {
      raf(function () {
        Promise.all([
          urlA ? loadImage(urlA) : Promise.resolve(null),
          urlB ? loadImage(urlB) : Promise.resolve(null),
          urlC ? loadImage(urlC) : Promise.resolve(null)
        ]).then(function (imgs) {
          var items = buildPageItems(imgs);
          if (!items.length) {
            outputFailed('沒有可輸出的內容，請重新貼上。');
            return;
          }
          var pdfBlob = pdfFromItems(JsPDF, items).output('blob');
          if (!alsoPrint) {
            handoff(pdfBlob);
            return;
          }
          setMsg('已送出列印…', 'ok');
          printItems(items, function (ok) {
            if (!ok) setMsg('無法開啟列印，已保留 PDF。', 'err');
            handoff(pdfBlob);
          });
        }).catch(function () {
          outputFailed('讀取圖片失敗，請重試。');
        });
      });
    });
  }

  btnPdf.addEventListener('click', function () {
    if (busy) return;
    if (!getJsPDF()) {
      setMsg('jsPDF 未載入，請檢查網路或 CDN。', 'err');
      return;
    }
    if (!urlA && !urlB && !urlC) {
      setMsg('請至少貼上一張圖（可只貼部分槽位）。', 'err');
      return;
    }
    setMsg('', '');
    setAsking(true);
  });

  if (askPrintBtn) askPrintBtn.addEventListener('click', function () { setAsking(false); runOutput(true); });
  if (askSaveBtn) askSaveBtn.addEventListener('click', function () { setAsking(false); runOutput(false); });
  if (askCancelBtn) askCancelBtn.addEventListener('click', function () { setAsking(false); setMsg('已取消。', 'ok'); });

  }

  g.BillPaste = {
    open: function (op) {
      op = op || {};
      var sm = op.showMessage || function () {};
      var onConfirm = op.onConfirm || function () {};
      var onCancel = op.onCancel || function () {};
      if (document.querySelector('.doc-scanner-overlay')) {
        sm('請先關閉掃描視窗', 'error');
        return;
      }
      if (document.getElementById('bill-paste-overlay')) {
        sm('請先關閉螢幕截圖拼貼視窗', 'error');
        return;
      }
      var JsPDF = (window.jspdf && window.jspdf.jsPDF) || (typeof jspdf !== 'undefined' && jspdf.jsPDF);
      if (!JsPDF) {
        sm('PDF 元件未載入，請重新整理頁面', 'error');
        return;
      }

      var ov = document.createElement('div');
      ov.id = 'bill-paste-overlay';
      ov.setAttribute('tabindex', '-1');
      ov.innerHTML =
        '<div class="bp-dialog-wrap">' +
        '<div class="bp-header">' +
        '<div><div>螢幕截圖拼貼 PDF</div><div class="bp-header-hint">請先點此視窗內，再以 Win+Shift+S 截圖後 Ctrl+V 貼上</div></div>' +
        '<button type="button" class="bp-close" aria-label="關閉">&times;</button>' +
        '</div>' +
        '<div class="bp-scroll"><div class="bp-panel"></div></div>' +
        '</div>';

      var panel = ov.querySelector('.bp-panel');
      panel.innerHTML = '<div class="layout">\n    <div class="col-guide">\n      <div class="guide-thumb-row">\n        <div class="guide-block active" id="bp-guide-portrait" role="button" tabindex="0" aria-pressed="true" aria-label="直式 A4，兩格 A B">\n          <div class="a4-mock" aria-hidden="true">\n            <div class="cell-outline"></div>\n            <div class="cell-outline"></div>\n          </div>\n        </div>\n        <div class="guide-block" id="bp-guide-portrait3" role="button" tabindex="0" aria-pressed="false" aria-label="直式 A4，三格 A B C">\n          <div class="a4-mock a4-mock-p3" aria-hidden="true">\n            <div class="cell-outline"></div>\n            <div class="cell-outline"></div>\n            <div class="cell-outline"></div>\n          </div>\n        </div>\n      </div>\n      <div class="guide-thumb-row">\n        <div class="guide-block" id="bp-guide-landscape" role="button" tabindex="0" aria-pressed="false" aria-label="橫式 A4，兩欄 A B">\n          <div class="a4-mock a4-mock-land" aria-hidden="true">\n            <div class="cell-outline"></div>\n            <div class="cell-outline"></div>\n          </div>\n        </div>\n        <div class="guide-block" id="bp-guide-landscape3" role="button" tabindex="0" aria-pressed="false" aria-label="橫式 A4，三欄 A B C">\n          <div class="a4-mock a4-mock-land a4-mock-l3" aria-hidden="true">\n            <div class="cell-outline"></div>\n            <div class="cell-outline"></div>\n            <div class="cell-outline"></div>\n          </div>\n        </div>\n      </div>\n      <div class="guide-thumb-row">\n        <div class="guide-block" id="bp-guide-portrait1" role="button" tabindex="0" aria-pressed="false" aria-label="直式 A4，單格 A">\n          <div class="a4-mock a4-mock-p1" aria-hidden="true">\n            <div class="cell-outline"></div>\n          </div>\n        </div>\n        <div class="guide-block" id="bp-guide-landscape1" role="button" tabindex="0" aria-pressed="false" aria-label="橫式 A4，單格 A">\n          <div class="a4-mock a4-mock-land a4-mock-l1" aria-hidden="true">\n            <div class="cell-outline"></div>\n          </div>\n        </div>\n      </div>\n      <div class="sidebar-note">\n        <label class="sidebar-note-label" for="bp-paste-note">加入說明(如有)</label>\n        <textarea id="bp-paste-note" maxlength="200" rows="3" autocomplete="off" aria-describedby="bp-paste-note-count" placeholder=""></textarea>\n        <span class="sidebar-note-count" id="bp-paste-note-count">0/200</span>\n      </div>\n      <div class="sidebar-color" role="group" aria-label="輸出色彩">\n        <label><input type="radio" name="bp-paste-img-mode" value="gray" checked> 灰階（預設）</label>\n        <label><input type="radio" name="bp-paste-img-mode" value="color"> 彩色</label>\n      </div>\n      <div class="toolbar" role="toolbar" aria-label="產出與清除">\n        <button type="button" class="primary" id="bp-btn-pdf" disabled>列印／產生 PDF</button>\n        <button type="button" class="ghost" id="bp-btn-delete-slot" disabled>刪除此槽圖片</button>\n        <button type="button" class="secondary" id="bp-btn-clear">清除全部</button>\n      </div>\n      <div class="bp-ask" id="bp-ask" role="group" aria-label="列印選項">\n        <div class="bp-ask-q">要先列印這一頁嗎？</div>\n        <button type="button" class="primary" id="bp-ask-print">列印並存檔</button>\n        <button type="button" class="secondary" id="bp-ask-save">只存檔</button>\n        <button type="button" class="ghost" id="bp-ask-cancel">取消</button>\n      </div>\n      <div class="msg" id="bp-msg" role="status"></div>\n      <p class="col-guide-credit">designed by JOESHI 2026</p>\n    </div>\n    <div class="col-main">\n      <div class="slots">\n        <div class="paste-paper" role="region" aria-label="貼圖預覽（對照 PDF 版面）">\n          <div class="slot active" id="bp-slot-a" tabindex="0" data-slot="A" aria-label="槽位 A，PDF 上方">\n            <div class="preview-wrap" id="bp-preview-a"><span class="slot-letter" aria-hidden="true">A</span></div>\n          </div>\n          <div class="slot" id="bp-slot-b" tabindex="0" data-slot="B" aria-label="槽位 B">\n            <div class="preview-wrap" id="bp-preview-b"><span class="slot-letter" aria-hidden="true">B</span></div>\n          </div>\n          <div class="slot" id="bp-slot-c" tabindex="0" data-slot="C" aria-label="槽位 C">\n            <div class="preview-wrap" id="bp-preview-c"><span class="slot-letter" aria-hidden="true">C</span></div>\n          </div>\n        </div>\n      </div>\n    </div>\n  </div>';

      var cancelled = false;
      var sessionOpts = {
        overlayRoot: ov,
        onConfirm: onConfirm,
        onCancel: onCancel,
        showMessage: sm,
        _close: null,
        _pasteHandler: null,
        _cleanupUrls: null
      };

      function detach() {
        var ph = sessionOpts._pasteHandler;
        if (ph) document.removeEventListener('paste', ph, true);
        if (sessionOpts._cleanupUrls) try { sessionOpts._cleanupUrls(); } catch (e4) {}
        if (ov.parentNode) ov.parentNode.removeChild(ov);
      }

      sessionOpts._close = function () {
        detach();
      };

      function doCancel() {
        if (cancelled) return;
        cancelled = true;
        detach();
        onCancel();
      }

      document.body.appendChild(ov);
      ov.querySelector('.bp-close').onclick = function () { doCancel(); };
      ov.addEventListener('click', function (e) { if (e.target === ov) doCancel(); });

      try {
        runSession(sessionOpts);
      } catch (e2) {
        doCancel();
        sm(String(e2 && e2.message || e2), 'error');
        return;
      }

      setTimeout(function () { try { ov.focus(); } catch (e3) {} }, 100);
    }
  };
})(typeof window !== 'undefined' ? window : this);

