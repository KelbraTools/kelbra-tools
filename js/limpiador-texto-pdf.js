/**
 * Kelbra.Tools — Corrector de ortografía a PDF
 * Páginas reales estilo Word + imágenes arrastrables + encabezado/pie/numeración
 * + corrector ortográfico (mayúsculas, espacios, puntuación y diccionario español)
 */
(() => {
  'use strict';

  // --------------------------------------
  // Referencias DOM
  // --------------------------------------
  const pagesContainer   = document.getElementById('pagesContainer');
  const btnAddPage       = document.getElementById('btnAddPage');
  const btnDeletePage    = document.getElementById('btnDeletePage');
  const btnInsertImage   = document.getElementById('btnInsertImage');
  const imageInput       = document.getElementById('imageInput');
  const btnExportPDF     = document.getElementById('btnExportPDF');
  const btnCleanText     = document.getElementById('btnCleanText');
  const statusMsg        = document.getElementById('statusMsg');

  const enableHeader     = document.getElementById('enableHeader');
  const headerText       = document.getElementById('headerText');
  const enableFooter     = document.getElementById('enableFooter');
  const footerText       = document.getElementById('footerText');
  const enablePageNumbers= document.getElementById('enablePageNumbers');
  const fileNameInput    = document.getElementById('fileName');

  const fontFamily       = document.getElementById('fontFamily');
  const fontSize         = document.getElementById('fontSize');
  const fontColor        = document.getElementById('fontColor');

  // --------------------------------------
  // Estado
  // --------------------------------------
  let pages = [];                 // array de elementos .page
  let selectedImage = null;       // .img-box actualmente seleccionado
  let isDragging = false;
  let isResizing = false;
  let dragOffset = { x: 0, y: 0 };
  let startWidth = 0;

  const PAGE_W = 794;
  const PAGE_H = 1123;
  const PAGE_MARGIN = 72;
  const CONTENT_WIDTH  = PAGE_W - PAGE_MARGIN * 2;
  const CONTENT_HEIGHT = PAGE_H - PAGE_MARGIN * 2;

  // --------------------------------------
  // Crear una página
  // --------------------------------------
  function createPage(index) {
    const page = document.createElement('div');
    page.className = 'page';
    page.dataset.index = index;

    // Encabezado
    const header = document.createElement('div');
    header.className = 'page-header';
    header.textContent = headerText.value || '';
    page.appendChild(header);

    // Contenido editable
    const content = document.createElement('div');
    content.className = 'page-content';
    content.contentEditable = 'true';
    content.spellcheck = true;
    page.appendChild(content);

    // Pie de página
    const footer = document.createElement('div');
    footer.className = 'page-footer';
    footer.innerHTML = `
      <span class="footer-text"></span>
      <span class="page-number"></span>
    `;
    page.appendChild(footer);

    // Clic en la página (deseleccionar imagen)
    page.addEventListener('mousedown', (e) => {
      if (!e.target.closest('.img-box')) {
        deselectImage();
      }
    });

    return page;
  }

  function addPage() {
    const index = pages.length;
    const page = createPage(index);
    pagesContainer.appendChild(page);
    pages.push(page);
    updateHeadersAndFooters();
    page.querySelector('.page-content').focus();
    return page;
  }

  // Primera página
  addPage();

  btnAddPage.addEventListener('click', () => {
    addPage();
    pagesContainer.scrollTop = pagesContainer.scrollHeight;
  });

  // --------------------------------------
  // Eliminar página: borra la página donde está el cursor,
  // o la última si no hay una selección activa en ninguna página.
  // --------------------------------------
  if (btnDeletePage) {
    btnDeletePage.addEventListener('click', () => {
      if (pages.length <= 1) {
        statusMsg.textContent = 'Debe quedar al menos una página.';
        return;
      }
      const content = getActivePageContent();
      let target = content ? content.closest('.page') : null;
      if (!target) target = pages[pages.length - 1];
      const idx = pages.indexOf(target);
      if (idx === -1) return;
      target.remove();
      pages.splice(idx, 1);
      deselectImage();
      updateHeadersAndFooters();
      statusMsg.textContent = `Página eliminada. Quedan ${pages.length} página(s).`;
    });
  }

  // --------------------------------------
  // Encabezado, pie y numeración
  // --------------------------------------
  function updateHeadersAndFooters() {
    const showHeader = enableHeader.checked;
    const showFooter = enableFooter.checked;
    const showNumbers = enablePageNumbers.checked;
    const hText = headerText.value.trim();
    const fText = footerText.value.trim();
    const total = pages.length;

    pages.forEach((page, i) => {
      const header = page.querySelector('.page-header');
      const footer = page.querySelector('.page-footer');
      const footerTextEl = footer.querySelector('.footer-text');
      const pageNumEl = footer.querySelector('.page-number');

      if (showHeader && hText) {
        header.textContent = hText;
        header.classList.add('visible');
      } else {
        header.classList.remove('visible');
      }

      if (showFooter || showNumbers) {
        footer.classList.add('visible');
        footerTextEl.textContent = showFooter ? fText : '';
        pageNumEl.textContent = showNumbers ? `${i + 1} / ${total}` : '';
      } else {
        footer.classList.remove('visible');
      }
    });
  }

  enableHeader.addEventListener('change', updateHeadersAndFooters);
  headerText.addEventListener('input', updateHeadersAndFooters);
  enableFooter.addEventListener('change', updateHeadersAndFooters);
  footerText.addEventListener('input', updateHeadersAndFooters);
  enablePageNumbers.addEventListener('change', updateHeadersAndFooters);

  document.getElementById('btnHeaderFooter').addEventListener('click', () => {
    enableHeader.checked = !enableHeader.checked;
    enableFooter.checked = true;
    enablePageNumbers.checked = true;
    updateHeadersAndFooters();
    statusMsg.textContent = enableHeader.checked
      ? 'Encabezado, pie y numeración activados.'
      : 'Encabezado desactivado. Pie y numeración siguen activos.';
  });

  // --------------------------------------
  // Formato de texto
  // --------------------------------------
  document.querySelectorAll('#mainToolbar [data-cmd]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      document.execCommand(btn.dataset.cmd, false, null);
      const active = document.activeElement;
      if (active && active.classList.contains('page-content')) {
        active.focus();
      }
    });
  });

  fontFamily.addEventListener('change', () => {
    document.execCommand('fontName', false, fontFamily.value);
  });

  fontSize.addEventListener('change', () => {
    document.execCommand('fontSize', false, fontSize.value);
  });

  fontColor.addEventListener('input', () => {
    document.execCommand('foreColor', false, fontColor.value);
  });

  // --------------------------------------
  // Corrector ortográfico REAL y funcional
  // 1) Reglas de mayúsculas / espacios / puntuación
  // 2) Diccionario de correcciones comunes en español (siempre disponible)
  // 3) Typo.js + diccionario es_ES alojado en el propio proyecto (js/dict/)
  // --------------------------------------
  let typoInstance = null;
  let typoLoadPromise = null;
  let dictLoadError = null;

  // Diccionario de correcciones frecuentes (siempre funciona, offline,
  // se usa como respaldo si el diccionario completo no llega a cargar).
  const COMMON_FIXES = {
    'manana': 'mañana', 'mananas': 'mañanas',
    'ire': 'iré', 'iras': 'irás', 'ira': 'irá', 'iremos': 'iremos', 'iran': 'irán',
    'despues': 'después', 'tambien': 'también', 'ademas': 'además',
    'aqui': 'aquí', 'alli': 'allí', 'ahi': 'ahí', 'asi': 'así',
    'aora': 'ahora', 'ahora': 'ahora',
    'ningun': 'ningún', 'algun': 'algún',
    'aun': 'aún', 'solo': 'sólo',
    'mas': 'más', 'facil': 'fácil', 'dificil': 'difícil',
    'util': 'útil', 'inutil': 'inútil',
    'rapido': 'rápido', 'rapida': 'rápida',
    'ultimo': 'último', 'ultima': 'última',
    'proximo': 'próximo', 'proxima': 'próxima',
    'unico': 'único', 'unica': 'única',
    'basico': 'básico', 'basica': 'básica',
    'practico': 'práctico', 'practica': 'práctica',
    'tecnico': 'técnico', 'tecnica': 'técnica',
    'medico': 'médico', 'medica': 'médica',
    'fisico': 'físico', 'fisica': 'física',
    'quimico': 'químico', 'quimica': 'química',
    'historico': 'histórico', 'historica': 'histórica',
    'politico': 'político', 'politica': 'política',
    'economico': 'económico', 'economica': 'económica',
    'publico': 'público', 'publica': 'pública',
    'frio': 'frío', 'fria': 'fría',
    'calido': 'cálido', 'calida': 'cálida',
    'humedo': 'húmedo', 'humeda': 'húmeda',
    'vacio': 'vacío', 'vacia': 'vacía',
    'debil': 'débil', 'estupido': 'estúpido',
    'simpatico': 'simpático', 'antipatico': 'antipático',
    'egoista': 'egoísta',
    'corazon': 'corazón', 'razon': 'razón',
    'organizacion': 'organización', 'informacion': 'información',
    'comunicacion': 'comunicación', 'educacion': 'educación',
    'situacion': 'situación', 'atencion': 'atención',
    'intencion': 'intención', 'direccion': 'dirección',
    'seleccion': 'selección', 'accion': 'acción',
    'reaccion': 'reacción', 'leccion': 'lección',
    'proteccion': 'protección', 'construccion': 'construcción',
    'produccion': 'producción', 'traduccion': 'traducción',
    'introduccion': 'introducción', 'descripcion': 'descripción',
    'exelente': 'excelente', 'exelentes': 'excelentes',
    'aver': 'a ver', 'haber': 'haber', 'haver': 'haber',
    'aber': 'haber', 'alla': 'allá',
    'cafe': 'café', 'beisbol': 'béisbol',
    'musica': 'música', 'numero': 'número',
    'pagina': 'página', 'telefono': 'teléfono',
    'camion': 'camión', 'avion': 'avión',
    'region': 'región', 'opinion': 'opinión',
    'cancion': 'canción', 'reunion': 'reunión',
    'solucion': 'solución', 'conclusion': 'conclusión',
    'decision': 'decisión', 'version': 'versión',
    'television': 'televisión', 'comprension': 'comprensión',
    'estara': 'estará', 'estare': 'estaré', 'estaras': 'estarás',
    'sera': 'será', 'sere': 'seré', 'seras': 'serás',
    'hara': 'hará', 'hare': 'haré', 'haras': 'harás',
    'tendra': 'tendrá', 'tendre': 'tendré', 'tendras': 'tendrás',
    'podra': 'podrá', 'podre': 'podré', 'podras': 'podrás',
    'sabra': 'sabrá', 'sabre': 'sabré', 'sabras': 'sabrás',
    'vendra': 'vendrá', 'vendre': 'vendré', 'vendras': 'vendrás',
    'pondra': 'pondrá', 'pondre': 'pondré', 'pondras': 'pondrás',
    'quera': 'querrá', 'querra': 'querrá',
    'habra': 'habrá', 'habre': 'habré', 'habras': 'habrás',
    'ninguna': 'ninguna', 'alguna': 'alguna'
  };

  // Carga el diccionario español real desde el propio proyecto
  // (js/dict/es_ES.aff y js/dict/es_ES.dic), sin depender de CDNs externos.
  function loadDictionary() {
    if (typoInstance) return Promise.resolve(typoInstance);
    if (typoLoadPromise) return typoLoadPromise;
    if (typeof Typo === 'undefined') {
      dictLoadError = 'la librería Typo.js no cargó (revisa tu conexión o si algo bloquea cdn.jsdelivr.net)';
      console.warn(dictLoadError);
      return Promise.resolve(null);
    }

    typoLoadPromise = (async () => {
      try {
        const [affRes, dicRes] = await Promise.all([
          fetch('js/dict/es_ES.aff'),
          fetch('js/dict/es_ES.dic')
        ]);
        if (!affRes.ok || !dicRes.ok) {
          throw new Error(`es_ES.aff → ${affRes.status} ${affRes.statusText}, es_ES.dic → ${dicRes.status} ${dicRes.statusText}`);
        }
        const affText = await affRes.text();
        const dicText = await dicRes.text();
        typoInstance = new Typo('es_ES', affText, dicText, { platform: 'any' });
        dictLoadError = null;
        console.log('Diccionario ortográfico cargado desde js/dict/.');
        return typoInstance;
      } catch (err) {
        dictLoadError = err.message || String(err);
        console.warn('No se pudo cargar el diccionario local. Se usará solo el de correcciones comunes.', err);
        typoLoadPromise = null;
        return null;
      }
    })();

    return typoLoadPromise;
  }

  // Aplica correcciones del diccionario común (siempre disponible)
  function applyCommonFixes(text) {
    return text.replace(/[A-Za-zÀ-ÿ]{2,}/g, (word) => {
      const lower = word.toLowerCase();
      if (COMMON_FIXES[lower]) {
        const fix = COMMON_FIXES[lower];
        if (/^[A-ZÁÉÍÓÚÑ]/.test(word)) {
          return fix.charAt(0).toUpperCase() + fix.slice(1);
        }
        return fix;
      }
      return word;
    });
  }

  // Genera cada variante posible de la palabra con una tilde agregada
  // en una sola vocal a la vez (dia → día, dia → dío, dia → díe...).
  // Es, con mucha diferencia, el error ortográfico más común en
  // español, así que se revisa de forma directa contra el diccionario
  // en vez de depender de qué tan bien "adivine" Typo.js.
  function accentVariants(word) {
    const map = { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú' };
    const variants = [];
    for (let i = 0; i < word.length; i++) {
      const lower = word[i].toLowerCase();
      if (map[lower]) {
        const accented = word[i] === lower ? map[lower] : map[lower].toUpperCase();
        variants.push(word.slice(0, i) + accented + word.slice(i + 1));
      }
    }
    return variants;
  }

  // Corrige con Typo.js + diccionario completo, si está disponible.
  // Es deliberadamente conservador: solo corrige cuando está
  // prácticamente seguro (falta de tilde, o un error común conocido).
  // Si la palabra no es reconocida y no es un simple tema de tilde,
  // se deja tal cual — es mejor que se escape algún error puntual a
  // que la herramienta corrija mal un término técnico o un nombre
  // propio (como pasaba antes con "conversor" → "converso").
  function spellCorrectWords(text, dict) {
    if (!dict) return text;
    const VOWELS = /[aeiouáéíóúAEIOUÁÉÍÓÚ]/;
    return text.replace(/[A-Za-zÀ-ÿ]{3,}/g, (word) => {
      try {
        if (dict.check(word) || dict.check(word.toLowerCase())) return word;

        // Siglas/abreviaturas típicas (pdf, html, css) no llevan vocal
        // o son muy cortas en mayúsculas — no se tocan, no son errores.
        if (!VOWELS.test(word)) return word;
        if (word.length <= 5 && word === word.toUpperCase()) return word;

        // Caso más común: solo le falta una tilde.
        const variant = accentVariants(word).find(
          (v) => dict.check(v) || dict.check(v.toLowerCase())
        );
        if (variant) return variant;

        // No es un tema de tilde y el diccionario no la reconoce:
        // puede ser un nombre propio, una marca o un término técnico.
        // Se deja igual en vez de arriesgarse a adivinar mal.
        return word;
      } catch (_) {
        return word;
      }
    });
  }

  // Corrector de mayúsculas, espacios y puntuación
  function correctText(text) {
    let t = text;
    t = t.replace(/\r\n/g, '\n');
    t = t.replace(/[ \t]{2,}/g, ' ');
    t = t.replace(/[ \t]+\n/g, '\n');
    t = t.replace(/\n{3,}/g, '\n\n');
    t = t.replace(/\s+([,.;:!?…])/g, '$1');
    t = t.replace(/([,.;:])(?=[^\s\n\d])/g, '$1 ');
    t = t.replace(/([.!?])(?=[A-ZÁÉÍÓÚÑ])/g, '$1 ');
    t = t.replace(/¿ +/g, '¿').replace(/¡ +/g, '¡');
    t = t.replace(/ +([)\]»"])/g, '$1').replace(/([([«"]) +/g, '$1');
    t = t.replace(/(^|\n|[.!?]\s+)([a-záéíóúñ])/g, (m, p1, p2) => p1 + p2.toUpperCase());
    t = t.split('\n').map(line => line.trim()).join('\n');
    return t.trim();
  }

  btnCleanText.addEventListener('click', async () => {
    let target = null;
    let range = null;
    const sel = window.getSelection();
    if (sel && sel.rangeCount && !sel.isCollapsed) {
      let node = sel.anchorNode;
      while (node && node.nodeType === 3) node = node.parentNode;
      if (node && node.closest && node.closest('.page-content')) {
        target = 'selection';
        range = sel.getRangeAt(0).cloneRange();
      }
    }

    btnCleanText.classList.add('working');
    const originalLabel = btnCleanText.textContent;
    btnCleanText.textContent = '⏳ Corrigiendo…';
    statusMsg.textContent = 'Revisando ortografía y puntuación…';

    const dict = await loadDictionary();

    if (target === 'selection') {
      const newSel = window.getSelection();
      newSel.removeAllRanges();
      newSel.addRange(range);
      const original = newSel.toString();
      let fixed = correctText(original);
      fixed = applyCommonFixes(fixed);
      fixed = spellCorrectWords(fixed, dict);
      document.execCommand('insertText', false, fixed);
    } else {
      const content = getActivePageContent();
      if (content) {
        const original = content.innerText || content.textContent || '';
        let fixed = correctText(original);
        fixed = applyCommonFixes(fixed);
        fixed = spellCorrectWords(fixed, dict);
        content.innerText = fixed;
      }
    }

    btnCleanText.classList.remove('working');
    btnCleanText.textContent = originalLabel;
    statusMsg.textContent = dict
      ? 'Ortografía corregida: mayúsculas, espacios, puntuación y diccionario completo de español.'
      : `Ortografía corregida: mayúsculas, espacios y puntuación (diccionario completo no disponible — ${dictLoadError || 'motivo desconocido'}).`;
  });

  // --------------------------------------
  // Insertar imagen
  // --------------------------------------
  btnInsertImage.addEventListener('click', () => imageInput.click());

  imageInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      insertImage(reader.result);
      imageInput.value = '';
    };
    reader.readAsDataURL(file);
  });

  function getActivePageContent() {
    const sel = window.getSelection();
    if (sel.rangeCount) {
      let node = sel.anchorNode;
      while (node && node !== document) {
        if (node.classList && node.classList.contains('page-content')) {
          return node;
        }
        node = node.parentNode;
      }
    }
    return pages[pages.length - 1]?.querySelector('.page-content');
  }

  function insertImage(dataUrl) {
    const content = getActivePageContent();
    if (!content) return;
    const page = content.closest('.page');

    const box = document.createElement('div');
    box.className = 'img-box';
    box.style.width = '40%';
    box.style.left = '20px';
    box.style.top = '20px';

    const img = document.createElement('img');
    img.src = dataUrl;
    img.draggable = false;

    const handle = document.createElement('div');
    handle.className = 'img-resize';

    box.appendChild(img);
    box.appendChild(handle);
    page.appendChild(box);

    makeImageInteractive(box);
    selectImage(box);
  }

  // --------------------------------------
  // Interacción de imagen (arrastre + redimensionado)
  // --------------------------------------
  function makeImageInteractive(box) {
    const handle = box.querySelector('.img-resize');

    box.addEventListener('pointerdown', (e) => {
      if (e.target === handle) return;
      e.preventDefault();
      e.stopPropagation();
      selectImage(box);
      isDragging = true;
      const rect = box.getBoundingClientRect();
      dragOffset.x = e.clientX - rect.left;
      dragOffset.y = e.clientY - rect.top;
      box.setPointerCapture(e.pointerId);
    });

    box.addEventListener('pointermove', (e) => {
      if (!isDragging && !isResizing) return;
      const page = box.parentElement;
      const pageRect = page.getBoundingClientRect();

      if (isDragging) {
        let newLeft = e.clientX - pageRect.left - dragOffset.x;
        let newTop  = e.clientY - pageRect.top  - dragOffset.y;
        const maxLeft = CONTENT_WIDTH - box.offsetWidth;
        const maxTop  = CONTENT_HEIGHT - box.offsetHeight;
        newLeft = Math.max(0, Math.min(maxLeft, newLeft));
        newTop  = Math.max(0, Math.min(maxTop, newTop));
        box.style.left = newLeft + 'px';
        box.style.top  = newTop  + 'px';
      }

      if (isResizing) {
        let newWidth = e.clientX - pageRect.left - parseFloat(box.style.left || 0);
        newWidth = Math.max(60, Math.min(CONTENT_WIDTH - parseFloat(box.style.left || 0), newWidth));
        box.style.width = newWidth + 'px';
      }
    });

    box.addEventListener('pointerup', (e) => {
      isDragging = false;
      isResizing = false;
      try { box.releasePointerCapture(e.pointerId); } catch (_) {}
    });

    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      selectImage(box);
      isResizing = true;
      startWidth = box.offsetWidth;
      box.setPointerCapture(e.pointerId);
    });
  }

  function selectImage(box) {
    deselectImage();
    selectedImage = box;
    box.classList.add('selected');
  }

  function deselectImage() {
    if (selectedImage) {
      selectedImage.classList.remove('selected');
      selectedImage = null;
    }
  }

  // Botón global "Recortar imagen" de la barra inferior
  const btnCropSelected = document.getElementById('btnCropSelected');
  if (btnCropSelected) {
    btnCropSelected.addEventListener('click', () => {
      if (!selectedImage) {
        statusMsg.textContent = 'Selecciona primero una imagen haciendo clic sobre ella.';
        return;
      }
      if (!window.KelbraCropper) {
        statusMsg.textContent = 'La herramienta de recorte no está disponible.';
        return;
      }
      const imgEl = selectedImage.querySelector('img');
      if (!imgEl) return;
      KelbraCropper.open(imgEl.src, (result) => {
        if (result) imgEl.src = result;
      });
    });
  }

  // Botón global "Eliminar imagen" de la barra inferior
  const btnDeleteSelected = document.getElementById('btnDeleteSelected');
  if (btnDeleteSelected) {
    btnDeleteSelected.addEventListener('click', () => {
      if (!selectedImage) {
        statusMsg.textContent = 'Selecciona primero una imagen haciendo clic sobre ella.';
        return;
      }
      selectedImage.remove();
      deselectImage();
      statusMsg.textContent = 'Imagen eliminada.';
    });
  }

  // --------------------------------------
  // Exportar a PDF — cada página se renderiza y se pega una por una
  // en el PDF final, en vez de dejar que html2pdf decida los saltos.
  // --------------------------------------
  btnExportPDF.addEventListener('click', async () => {
    btnExportPDF.disabled = true;
    statusMsg.textContent = '';

    try {
      if (typeof html2canvas === 'undefined') {
        throw new Error('No se pudo cargar html2canvas (revisa tu conexión a internet o si algo la está bloqueando).');
      }
      if (!window.jspdf || !window.jspdf.jsPDF) {
        throw new Error('No se pudo cargar jsPDF (revisa tu conexión a internet o si algo lo está bloqueando).');
      }
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: 'px', format: [PAGE_W, PAGE_H], orientation: 'portrait', hotfixes: ['px_scaling'] });

      for (let i = 0; i < pages.length; i++) {
        btnExportPDF.textContent = `Generando PDF… (${i + 1}/${pages.length})`;
        const page = pages[i];
        const clone = page.cloneNode(true);
        const h = clone.querySelector('.page-header');
        const f = clone.querySelector('.page-footer');
        if (enableHeader.checked && headerText.value.trim()) {
          h.classList.add('visible');
          h.textContent = headerText.value.trim();
        }
        if (enableFooter.checked || enablePageNumbers.checked) {
          f.classList.add('visible');
          f.querySelector('.footer-text').textContent = enableFooter.checked ? footerText.value.trim() : '';
          f.querySelector('.page-number').textContent = enablePageNumbers.checked ? `${i + 1} / ${pages.length}` : '';
        }

        clone.style.position = 'fixed';
        clone.style.left = '-99999px';
        clone.style.top = '0';
        clone.style.margin = '0';
        clone.style.width = PAGE_W + 'px';
        clone.style.height = PAGE_H + 'px';
        document.body.appendChild(clone);

        let canvas;
        try {
          canvas = await html2canvas(clone, {
            scale: 2,
            useCORS: true,
            logging: false,
            width: PAGE_W,
            height: PAGE_H,
            windowWidth: PAGE_W,
            windowHeight: PAGE_H
          });
        } finally {
          document.body.removeChild(clone);
        }

        const imgData = canvas.toDataURL('image/jpeg', 0.98);
        if (i > 0) doc.addPage([PAGE_W, PAGE_H], 'portrait');
        doc.addImage(imgData, 'JPEG', 0, 0, PAGE_W, PAGE_H);
      }

      const name = (fileNameInput.value || 'documento').trim().replace(/[\/\\:*?"<>|]/g, '') || 'documento';
      doc.save(name + '.pdf');
      statusMsg.textContent = `PDF generado correctamente con ${pages.length} página(s).`;
    } catch (err) {
      console.error(err);
      statusMsg.textContent = 'Error al generar el PDF: ' + (err.message || err);
    } finally {
      btnExportPDF.disabled = false;
      btnExportPDF.textContent = 'Exportar como PDF';
    }
  });

  // --------------------------------------
  // Atajos de teclado
  // --------------------------------------
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'b') { e.preventDefault(); document.execCommand('bold'); }
      if (e.key === 'i') { e.preventDefault(); document.execCommand('italic'); }
      if (e.key === 'u') { e.preventDefault(); document.execCommand('underline'); }
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedImage) {
      e.preventDefault();
      selectedImage.remove();
      deselectImage();
    }
  });

  updateHeadersAndFooters();
  console.log('Kelbra.Tools — Corrector de ortografía a PDF listo.');
})();