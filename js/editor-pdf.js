/**
 * Kelbra.Tools — Editor de PDF (mini-Word)
 */
(() => {
'use strict';


if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }


const pagesContainer = document.getElementById('pagesContainer');
const btnAddPage = document.getElementById('btnAddPage');
const btnDeletePage = document.getElementById('btnDeletePage');
const btnInsertImage = document.getElementById('btnInsertImage');
const imageInput = document.getElementById('imageInput');
const btnExportPDF = document.getElementById('btnExportPDF');
const statusMsg = document.getElementById('statusMsg');
const pdfInput = document.getElementById('pdfInput');
const btnLink = document.getElementById('btnLink');
const btnUnlink = document.getElementById('btnUnlink');
const btnClearFormat = document.getElementById('btnClearFormat');
const leadText = document.getElementById('leadText');


const enableHeader = document.getElementById('enableHeader');
const headerText = document.getElementById('headerText');
const enableFooter = document.getElementById('enableFooter');
const footerText = document.getElementById('footerText');
const enablePageNumbers = document.getElementById('enablePageNumbers');
const fileNameInput = document.getElementById('fileName');


const fontFamily = document.getElementById('fontFamily');
const fontSize = document.getElementById('fontSize');
const fontColor = document.getElementById('fontColor');
const hiliteColor = document.getElementById('hiliteColor');


let pages = [];
let selectedImage = null;
let isDragging = false;
let isResizing = false;
let dragOffset = { x: 0, y: 0 };


const PAGE_W = 794;
const PAGE_H = 1123;
const PAGE_MARGIN = 72;
const CONTENT_WIDTH = PAGE_W - PAGE_MARGIN * 2;
const CONTENT_HEIGHT = PAGE_H - PAGE_MARGIN * 2;


// --------------------------------------
// Modo mini (cuando llega desde Unir/Separar PDF): solo negrita,
// tipo de letra, tamaño, color y justificado.
// --------------------------------------
const params = new URLSearchParams(window.location.search);
if (params.get('from') === 'unir') {
    document.getElementById('mainToolbar').classList.add('mini-mode');
if (leadText) {
      leadText.textContent = 'Edición rápida: ajusta el texto con las herramientas básicas y expórtalo de nuevo a PDF.';
    }
  }


// --------------------------------------
// Transferir el PDF entre herramientas vía IndexedDB (no sessionStorage).
// sessionStorage tiene un límite de unos 5-10 MB por sitio; con un PDF
// real (fotos, varias páginas) se llena y truena con "The quota has
// been exceeded". IndexedDB permite cientos de MB sin ese problema.
// --------------------------------------
const PDF_TRANSFER_DB = 'kelbra-pdf-transfer';
const PDF_TRANSFER_STORE = 'files';
const PDF_TRANSFER_KEY = 'pending';

function openTransferDB() {
return new Promise((resolve, reject) => {
const req = indexedDB.open(PDF_TRANSFER_DB, 1);
    req.onupgradeneeded = () => {
if (!req.result.objectStoreNames.contains(PDF_TRANSFER_STORE)) {
        req.result.createObjectStore(PDF_TRANSFER_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadPdfForEditor() {
const db = await openTransferDB();
const bytes = await new Promise((resolve, reject) => {
const tx = db.transaction(PDF_TRANSFER_STORE, 'readwrite');
const store = tx.objectStore(PDF_TRANSFER_STORE);
const getReq = store.get(PDF_TRANSFER_KEY);
    getReq.onsuccess = () => {
      store.delete(PDF_TRANSFER_KEY);
resolve(getReq.result || null);
    };
    getReq.onerror = () => reject(getReq.error);
  });
  db.close();
return bytes;
}


// --------------------------------------
// Páginas "normales" (en blanco / escritas a mano)
// --------------------------------------
function createBlankPage() {
const page = document.createElement('div');
    page.className = 'page';


const header = document.createElement('div');
    header.className = 'page-header';
    page.appendChild(header);


const content = document.createElement('div');
    content.className = 'page-content';
    content.contentEditable = 'true';
    content.spellcheck = true;
    page.appendChild(content);


const footer = document.createElement('div');
    footer.className = 'page-footer';
    footer.innerHTML = '<span class="footer-text"></span><span class="page-number"></span>';
    page.appendChild(footer);


    page.addEventListener('mousedown', (e) => {
if (!e.target.closest('.img-box')) deselectImage();
    });


return page;
  }


function addPage() {
const page = createBlankPage();
    pagesContainer.appendChild(page);
    pages.push(page);
updateHeadersAndFooters();
    page.querySelector('.page-content').focus();
return page;
  }


function clearPages() {
    pagesContainer.innerHTML = '';
    pages = [];
  }


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
      const content = getActiveContent();
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
// Cargar PDF: texto real editable (no imagen)
// --------------------------------------
  (async function loadFromTransfer() {
try {
const bytes = await loadPdfForEditor();
if (bytes) {
await renderPdfBytes(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
      } else {
addPage();
      }
    } catch (err) {
console.error('No se pudo recuperar el PDF a editar', err);
addPage();
    }
  })();


  pdfInput.addEventListener('change', async (e) => {
const file = e.target.files?.[0];
if (!file) return;
    statusMsg.textContent = 'Cargando PDF…';
try {
const bytes = new Uint8Array(await file.arrayBuffer());
await renderPdfBytes(bytes);
    } catch (err) {
      statusMsg.textContent = 'No se pudo abrir el PDF: ' + err.message;
    }
    pdfInput.value = '';
  });


async function renderPdfBytes(bytes) {
if (typeof pdfjsLib === 'undefined') {
      statusMsg.textContent = 'pdf.js no está disponible.';
addPage();
return;
    }


let pdf;
try {
      pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
    } catch (err) {
      console.error('No se pudo abrir el PDF', err);
      statusMsg.textContent = 'No se pudo leer el PDF: ' + (err.message || err);
addPage();
return;
    }


clearPages();
let totalImages = 0;
let pagesWithNothing = 0;
let pagesFailed = 0;


// Cada página del PDF SIEMPRE termina agregando exactamente una
// página al editor (real o en blanco de respaldo). Si algo falla
// procesando una página puntual, no se corta el resto del PDF.
for (let i = 1; i <= pdf.numPages; i++) {
statusMsg.textContent = `Importando página ${i} de ${pdf.numPages}…`;
try {
let page;
try {
        page = await pdf.getPage(i);
      } catch (err) {
        console.error('No se pudo leer la página ' + i, err);
        pagesContainer.appendChild(createBlankPage());
        pages.push(pagesContainer.lastElementChild);
        pagesFailed++;
continue;
      }


const baseViewport = page.getViewport({ scale: 1 });
const scale = PAGE_W / baseViewport.width;
const viewport = page.getViewport({ scale });


const pageEl = document.createElement('div');
      pageEl.className = 'page pdf-page';


const header = document.createElement('div');
      header.className = 'page-header';
      pageEl.appendChild(header);


const layer = document.createElement('div');
      layer.className = 'page-content pdf-text-layer';
      layer.contentEditable = 'true';
      layer.spellcheck = false;


let textCount = 0;
try {
const textContent = await page.getTextContent();
        textContent.items.forEach((item) => {
if (!item.str) return;
const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
const fontHeight = Math.hypot(tx[2], tx[3]) || 1;
const angle = Math.atan2(tx[1], tx[0]);
const left = tx[4];
const top = tx[5] - fontHeight;
const style = textContent.styles?.[item.fontName];
const span = document.createElement('span');
          span.textContent = item.str;
          span.style.left = left + 'px';
          span.style.top = top + 'px';
          span.style.fontSize = fontHeight + 'px';
          span.style.fontFamily = (style && style.fontFamily) || 'sans-serif';
if (angle) span.style.transform = `rotate(${angle}rad)`;
          layer.appendChild(span);
if (item.str.trim()) textCount++;
        });
      } catch (err) {
        console.error('No se pudo extraer el texto de la página ' + i, err);
      }


      pageEl.appendChild(layer);


const footer = document.createElement('div');
      footer.className = 'page-footer';
      footer.innerHTML = '<span class="footer-text"></span><span class="page-number"></span>';
      pageEl.appendChild(footer);


      pageEl.addEventListener('mousedown', (e) => {
if (!e.target.closest('.img-box')) deselectImage();
      });


      pagesContainer.appendChild(pageEl);
      pages.push(pageEl);


// Extraer las fotos/imágenes incrustadas como imágenes movibles reales
let imgCount = 0;
try {
        imgCount = await extractPageImages(page, viewport, pageEl);
        totalImages += imgCount;
      } catch (err) {
        console.error('No se pudieron extraer imágenes de la página ' + i, err);
      }


if (textCount === 0 && imgCount === 0) pagesWithNothing++;
    } catch (err) {
      // Cualquier fallo inesperado con esta página puntual: se agrega
      // en blanco de respaldo y se sigue con el resto del documento.
      console.error('Fallo inesperado procesando la página ' + i, err);
      pagesContainer.appendChild(createBlankPage());
      pages.push(pagesContainer.lastElementChild);
      pagesFailed++;
    }
  }


if (pages.length === 0) addPage();
updateHeadersAndFooters();


let msg = `Se importaron ${pages.length} de ${pdf.numPages} página(s). El texto es seleccionable/editable`;
if (totalImages > 0) msg += ` y se extrajeron ${totalImages} imagen(es) que puedes mover.`;
else msg += '.';
if (pagesWithNothing > 0) {
      msg += ` ${pagesWithNothing} página(s) no tenían texto ni imágenes extraíbles (posible página escaneada); quedaron en blanco para que las completes a mano.`;
    }
if (pagesFailed > 0) {
      msg += ` ${pagesFailed} página(s) tuvieron un problema al leerlas y se agregaron en blanco para que no falte ninguna.`;
    }
    statusMsg.textContent = msg;
  }


// Recorre las operaciones de dibujo de la página buscando imágenes
// incrustadas (fotos) y las coloca como .img-box movibles, en la
// posición y tamaño reales que tenían en el PDF.
async function extractPageImages(page, viewport, pageEl) {
if (!pdfjsLib.OPS) return 0;
let opList;
try {
      opList = await page.getOperatorList();
    } catch (err) {
      console.error('getOperatorList falló', err);
return 0;
    }


const OPS = pdfjsLib.OPS;
let ctm = [1, 0, 0, 1, 0, 0];
const stack = [];
let count = 0;


for (let idx = 0; idx < opList.fnArray.length; idx++) {
const fn = opList.fnArray[idx];
const args = opList.argsArray[idx];


if (fn === OPS.save) {
        stack.push(ctm);
      } else if (fn === OPS.restore) {
        ctm = stack.pop() || ctm;
      } else if (fn === OPS.transform) {
        ctm = pdfjsLib.Util.transform(ctm, args);
      } else if (fn === OPS.paintImageXObject || fn === OPS.paintJpegXObject) {
try {
const objId = args[0];
const imgObj = await getPageObject(page, objId);
const dataUrl = imageObjectToDataUrl(imgObj);
if (dataUrl) {
const finalM = pdfjsLib.Util.transform(viewport.transform, ctm);
placeExtractedImage(dataUrl, finalM, pageEl);
            count++;
          }
        } catch (err) {
          console.error('No se pudo colocar una imagen', err);
        }
      }
    }
return count;
  }


function getPageObject(page, objId) {
// Si pdf.js nunca "avisa" que la imagen está lista (pasa con
// algunas imágenes raras en PDFs con muchas ilustraciones), sin
// este límite de espera el proceso completo se queda colgado ahí
// para siempre, sin ningún error, y las páginas siguientes nunca
// se llegan a importar. Con el límite, esa imagen puntual se omite
// (la página sigue igual, solo sin esa foto) y el resto continúa.
return new Promise((resolve) => {
let done = false;
const finish = (val) => { if (!done) { done = true; resolve(val); } };
try {
        page.objs.get(objId, (data) => finish(data));
      } catch (_) {
finish(null);
      }
setTimeout(() => finish(null), 3000);
    });
  }


function imageObjectToDataUrl(imgObj) {
if (!imgObj || !imgObj.width || !imgObj.height) return null;
const { width, height, data, kind, bitmap } = imgObj;
const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
const ctx = canvas.getContext('2d');


if (bitmap) {
// Algunas versiones de pdf.js entregan un ImageBitmap ya decodificado
      ctx.drawImage(bitmap, 0, 0);
return canvas.toDataURL('image/png');
    }


if (!data) return null;
const imageData = ctx.createImageData(width, height);
const RGBA = pdfjsLib.ImageKind && pdfjsLib.ImageKind.RGBA_32BPP;
const RGB = pdfjsLib.ImageKind && pdfjsLib.ImageKind.RGB_24BPP;


if (kind === RGBA && data.length === width * height * 4) {
      imageData.data.set(data);
    } else if (kind === RGB || data.length === width * height * 3) {
let j = 0;
for (let i = 0; i < data.length; i += 3) {
        imageData.data[j++] = data[i];
        imageData.data[j++] = data[i + 1];
        imageData.data[j++] = data[i + 2];
        imageData.data[j++] = 255;
      }
    } else if (data.length === width * height * 4) {
      imageData.data.set(data);
    } else {
return null; // formato no soportado (p. ej. 1bpp), se omite con seguridad
    }


    ctx.putImageData(imageData, 0, 0);
return canvas.toDataURL('image/png');
  }


function placeExtractedImage(dataUrl, M, pageEl) {
const corners = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => [
M[0] * x + M[2] * y + M[4],
M[1] * x + M[3] * y + M[5]
    ]);
const xs = corners.map(c => c[0]);
const ys = corners.map(c => c[1]);
const left = Math.min(...xs);
const top = Math.min(...ys);
const width = Math.max(...xs) - left;
const height = Math.max(...ys) - top;


if (!(width > 2) || !(height > 2)) return; // demasiado pequeña para ser una foto real


const box = document.createElement('div');
    box.className = 'img-box pdf-extracted';
    box.style.left = left + 'px';
    box.style.top = top + 'px';
    box.style.width = width + 'px';


const img = document.createElement('img');
    img.src = dataUrl;
    img.draggable = false;


const handle = document.createElement('div');
    handle.className = 'img-resize';


    box.appendChild(img);
    box.appendChild(handle);
    pageEl.appendChild(box);
makeImageInteractive(box);
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


if (showHeader && hText) {
        header.textContent = hText;
        header.classList.add('visible');
      } else header.classList.remove('visible');


if (showFooter || showNumbers) {
        footer.classList.add('visible');
        footer.querySelector('.footer-text').textContent = showFooter ? fText : '';
        footer.querySelector('.page-number').textContent = showNumbers ? `${i + 1} / ${total}` : '';
      } else footer.classList.remove('visible');
    });
  }


  [enableHeader, headerText, enableFooter, footerText, enablePageNumbers].forEach(el => {
    el.addEventListener('change', updateHeadersAndFooters);
    el.addEventListener('input', updateHeadersAndFooters);
  });


  document.getElementById('btnHeaderFooter').addEventListener('click', () => {
    enableHeader.checked = !enableHeader.checked;
    enableFooter.checked = true;
    enablePageNumbers.checked = true;
updateHeadersAndFooters();
  });


// --------------------------------------
// Formato de texto
// --------------------------------------
  document.querySelectorAll('#mainToolbar [data-cmd]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      document.execCommand(btn.dataset.cmd, false, null);
    });
  });


  fontFamily.addEventListener('change', () => document.execCommand('fontName', false, fontFamily.value));
  fontSize.addEventListener('change', () => document.execCommand('fontSize', false, fontSize.value));
  fontColor.addEventListener('input', () => document.execCommand('foreColor', false, fontColor.value));
if (hiliteColor) {
    hiliteColor.addEventListener('input', () => document.execCommand('hiliteColor', false, hiliteColor.value));
  }


if (btnLink) {
    btnLink.addEventListener('click', () => {
const url = prompt('Escribe la URL del enlace:', 'https://');
if (url) document.execCommand('createLink', false, url);
    });
  }
if (btnUnlink) {
    btnUnlink.addEventListener('click', () => document.execCommand('unlink', false, null));
  }
if (btnClearFormat) {
    btnClearFormat.addEventListener('click', () => document.execCommand('removeFormat', false, null));
  }


// --------------------------------------
// Imágenes: se insertan encima del texto, se arrastran dentro de
// la página y también se pueden transportar a otra página.
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


function getActiveContent() {
const sel = window.getSelection();
if (sel.rangeCount) {
let node = sel.anchorNode;
while (node) {
if (node.classList?.contains('page-content')) return node;
        node = node.parentNode;
      }
    }
return pages[pages.length - 1]?.querySelector('.page-content');
  }


function insertImage(dataUrl) {
const content = getActiveContent();
const page = content ? content.closest('.page') : pages[pages.length - 1];
if (!page) return;


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


function pageBounds(page) {
return page.classList.contains('pdf-page')
? { w: PAGE_W - 10, h: PAGE_H - 10 }
: { w: CONTENT_WIDTH, h: CONTENT_HEIGHT };
  }


function findPageAt(x, y) {
for (const p of pages) {
const r = p.getBoundingClientRect();
if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return p;
    }
return null;
  }


function makeImageInteractive(box) {
const handle = box.querySelector('.img-resize');


if (!box.querySelector('.img-crop-btn')) {
const cropBtn = document.createElement('div');
      cropBtn.className = 'img-crop-btn';
      cropBtn.title = 'Recortar imagen';
      cropBtn.textContent = '✂';
      box.appendChild(cropBtn);
      cropBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
      cropBtn.addEventListener('click', (e) => {
        e.stopPropagation();
if (!window.KelbraCropper) return;
const imgEl = box.querySelector('img');
        KelbraCropper.open(imgEl.src, (result) => {
if (result) imgEl.src = result;
        });
      });
    }


    box.addEventListener('pointerdown', (e) => {
if (e.target === handle || e.target.classList.contains('img-crop-btn')) return;
      e.preventDefault();
selectImage(box);
      isDragging = true;
const rect = box.getBoundingClientRect();
      dragOffset.x = e.clientX - rect.left;
      dragOffset.y = e.clientY - rect.top;
      box.setPointerCapture(e.pointerId);
    });


    box.addEventListener('pointermove', (e) => {
if (!isDragging && !isResizing) return;


if (isDragging) {
const hoverPage = findPageAt(e.clientX, e.clientY) || box.parentElement;
if (hoverPage !== box.parentElement) {
          hoverPage.appendChild(box);
        }
const pageRect = hoverPage.getBoundingClientRect();
const bounds = pageBounds(hoverPage);
let left = e.clientX - pageRect.left - dragOffset.x;
let top = e.clientY - pageRect.top - dragOffset.y;
        left = Math.max(0, Math.min(bounds.w - box.offsetWidth, left));
        top = Math.max(0, Math.min(bounds.h - box.offsetHeight, top));
        box.style.left = left + 'px';
        box.style.top = top + 'px';
      }


if (isResizing) {
const page = box.parentElement;
const pageRect = page.getBoundingClientRect();
const bounds = pageBounds(page);
let w = e.clientX - pageRect.left - parseFloat(box.style.left || 0);
        w = Math.max(60, Math.min(bounds.w - parseFloat(box.style.left || 0), w));
        box.style.width = w + 'px';
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
      box.setPointerCapture(e.pointerId);
    });
  }


function selectImage(box) {
deselectImage();
    selectedImage = box;
    box.classList.add('selected');
  }


function deselectImage() {
if (selectedImage) selectedImage.classList.remove('selected');
selectedImage = null;
  }

  // Botón global "Recortar imagen" (barra inferior)
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

  // Botón global "Eliminar imagen" (barra inferior)
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
// Exportar a PDF — cada página del editor se convierte en EXACTAMENTE
// una página del PDF final (se renderiza y se pega una por una),
// en vez de dejar que html2pdf decida solo dónde cortar. Así se evita
// el bug de la página extra casi en blanco.
// --------------------------------------
btnExportPDF.addEventListener('click', async () => {
btnExportPDF.disabled = true;
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
statusMsg.textContent = 'Error: ' + (err.message || err);
    } finally {
btnExportPDF.disabled = false;
btnExportPDF.textContent = 'Exportar como PDF';
    }
  });


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
})();
