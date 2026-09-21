/**
 * Kelbra.Tools — Unir / separar PDF
 */
(() => {
'use strict';


const { PDFDocument, rgb, StandardFonts } = PDFLib;


const tabs = document.querySelectorAll('.tab-btn');
const panelMerge = document.getElementById('panelMerge');
const panelExtract = document.getElementById('panelExtract');
const mergeInput = document.getElementById('mergeInput');
const extractInput = document.getElementById('extractInput');
const mergeList = document.getElementById('mergeList');
const mergeStatus = document.getElementById('mergeStatus');
const extractInfo = document.getElementById('extractInfo');
const pagesRange = document.getElementById('pagesRange');
const mergeDeletePages = document.getElementById('mergeDeletePages');
const btnMergeDownload = document.getElementById('btnMergeDownload');
const btnMergeToEditor = document.getElementById('btnMergeToEditor');
const btnExtractDownload = document.getElementById('btnExtractDownload');
const btnExtractToEditor = document.getElementById('btnExtractToEditor');
const errorMsg = document.getElementById('errorMsg');


let mergeFiles = [];
let extractFile = null;
let extractPageCount = 0;


  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
const mode = btn.dataset.mode;
      panelMerge.style.display = mode === 'merge' ? 'block' : 'none';
      panelExtract.style.display = mode === 'extract' ? 'block' : 'none';
      errorMsg.textContent = '';
    });
  });


  mergeInput.addEventListener('change', (e) => {
    mergeFiles = [...(e.target.files || [])];
    mergeList.innerHTML = mergeFiles.map((f, i) =>
`<div>${i + 1}. ${f.name} (${(f.size / 1024).toFixed(1)} KB)</div>`
    ).join('');
    mergeStatus.textContent = mergeFiles.length
? `${mergeFiles.length} archivo(s) listo(s) para unir.`
: '';
    btnMergeDownload.disabled = mergeFiles.length < 1;
    btnMergeToEditor.disabled = mergeFiles.length < 1;
    mergeInput.value = '';
  });


  extractInput.addEventListener('change', async (e) => {
const file = e.target.files?.[0];
if (!file) return;
    extractFile = file;
try {
const bytes = await file.arrayBuffer();
const pdf = await PDFDocument.load(bytes);
      extractPageCount = pdf.getPageCount();
      extractInfo.textContent = `Este PDF tiene ${extractPageCount} página(s).`;
      btnExtractDownload.disabled = false;
      btnExtractToEditor.disabled = false;
    } catch (err) {
      errorMsg.textContent = 'No se pudo leer el PDF: ' + err.message;
      extractFile = null;
      btnExtractDownload.disabled = true;
      btnExtractToEditor.disabled = true;
    }
    extractInput.value = '';
  });


function parsePageRange(str, max) {
const pages = new Set();
    str.split(',').forEach(part => {
      part = part.trim();
if (!part) return;
if (part.includes('-')) {
const [a, b] = part.split('-').map(n => parseInt(n, 10));
if (!isNaN(a) && !isNaN(b)) {
for (let i = Math.min(a, b); i <= Math.max(a, b); i++) {
if (i >= 1 && i <= max) pages.add(i);
          }
        }
      } else {
const n = parseInt(part, 10);
if (!isNaN(n) && n >= 1 && n <= max) pages.add(n);
      }
    });
return [...pages].sort((a, b) => a - b);
  }


// Quita del PDF final las páginas indicadas en el campo opcional
// "Páginas a eliminar del resultado". Se numeran ya sobre el
// documento unido (1 = primera página del resultado final).
function removeSelectedPages(pdfDoc, rangeStr) {
if (!rangeStr || !rangeStr.trim()) return;
const total = pdfDoc.getPageCount();
const toDelete = parsePageRange(rangeStr, total);
// Se borra de atrás hacia adelante para que los índices ya
// eliminados no corran los que faltan por borrar.
for (let i = toDelete.length - 1; i >= 0; i--) {
    pdfDoc.removePage(toDelete[i] - 1);
  }
}


async function buildMergedPdf() {
const out = await PDFDocument.create();
for (const file of mergeFiles) {
const bytes = await file.arrayBuffer();
const src = await PDFDocument.load(bytes);
const pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach(p => out.addPage(p));
    }
removeSelectedPages(out, mergeDeletePages ? mergeDeletePages.value : '');
await maybeAddFooterAndNumbers(out);
return out;
  }


async function buildExtractedPdf() {
if (!extractFile) throw new Error('No hay PDF');
const bytes = await extractFile.arrayBuffer();
const src = await PDFDocument.load(bytes);
const indices = parsePageRange(pagesRange.value || '1', extractPageCount)
      .map(n => n - 1);
if (!indices.length) throw new Error('Indica al menos una página válida');
const out = await PDFDocument.create();
const pages = await out.copyPages(src, indices);
    pages.forEach(p => out.addPage(p));
await maybeAddFooterAndNumbers(out);
return out;
  }


async function maybeAddFooterAndNumbers(pdf) {
const addNums = document.getElementById('addPageNumbers').checked;
const footer = document.getElementById('footerOpt').value.trim();
if (!addNums && !footer) return;
const font = await pdf.embedFont(StandardFonts.Helvetica);
const total = pdf.getPageCount();
    pdf.getPages().forEach((page, i) => {
const { width } = page.getSize();
const text = [
        footer,
        addNums ? `${i + 1} / ${total}` : ''
      ].filter(Boolean).join('   ');
if (text) {
        page.drawText(text, {
x: 40,
y: 20,
size: 9,
          font,
color: rgb(0.3, 0.3, 0.3)
        });
      }
    });
  }


async function downloadPdf(pdf, name) {
// useObjectStreams:false evita que algunos lectores muestren
// páginas en blanco o mal renderizadas en PDFs grandes/combinados.
const bytes = await pdf.save({ useObjectStreams: false });
const blob = new Blob([bytes], { type: 'application/pdf' });
const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (name || 'documento').replace(/[\/\\:*?"<>|]/g, '') + '.pdf';
    a.click();
URL.revokeObjectURL(a.href);
  }


// --------------------------------------
// Transferir el PDF al Editor vía IndexedDB (no sessionStorage).
// sessionStorage tiene un límite de unos 5-10 MB por sitio y con PDFs
// reales (fotos, muchas páginas) se llena y truena con "The quota has
// been exceeded". IndexedDB permite cientos de MB sin ese problema, y
// de paso ya no hace falta convertir nada a base64 (que era lo que
// arreglaba el crash anterior de "too many function arguments" — este
// cambio soluciona los dos problemas a la vez).
// --------------------------------------
const PDF_TRANSFER_DB = 'vertex-pdf-transfer';
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

async function savePdfForEditor(bytes) {
const db = await openTransferDB();
await new Promise((resolve, reject) => {
const tx = db.transaction(PDF_TRANSFER_STORE, 'readwrite');
    tx.objectStore(PDF_TRANSFER_STORE).put(bytes, PDF_TRANSFER_KEY);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function openInEditor(pdf) {
const bytes = await pdf.save({ useObjectStreams: false });
await savePdfForEditor(bytes);
window.location.href = 'editor-pdf.html?from=unir';
  }


btnMergeDownload.addEventListener('click', async () => {
errorMsg.textContent = '';
try {
btnMergeDownload.disabled = true;
btnMergeDownload.textContent = 'Uniendo…';
const pdf = await buildMergedPdf();
await downloadPdf(pdf, document.getElementById('mergeFileName').value || 'documento-unido');
    } catch (err) {
errorMsg.textContent = err.message || String(err);
    } finally {
btnMergeDownload.disabled = false;
btnMergeDownload.textContent = 'Unir y descargar PDF';
    }
  });


btnMergeToEditor.addEventListener('click', async () => {
errorMsg.textContent = '';
try {
btnMergeToEditor.disabled = true;
const pdf = await buildMergedPdf();
await openInEditor(pdf);
    } catch (err) {
errorMsg.textContent = err.message || String(err);
btnMergeToEditor.disabled = false;
    }
  });


btnExtractDownload.addEventListener('click', async () => {
errorMsg.textContent = '';
try {
btnExtractDownload.disabled = true;
btnExtractDownload.textContent = 'Extrayendo…';
const pdf = await buildExtractedPdf();
await downloadPdf(pdf, document.getElementById('extractFileName').value || 'paginas-extraidas');
    } catch (err) {
errorMsg.textContent = err.message || String(err);
    } finally {
btnExtractDownload.disabled = false;
btnExtractDownload.textContent = 'Extraer y descargar PDF';
    }
  });


btnExtractToEditor.addEventListener('click', async () => {
errorMsg.textContent = '';
try {
btnExtractToEditor.disabled = true;
const pdf = await buildExtractedPdf();
await openInEditor(pdf);
    } catch (err) {
errorMsg.textContent = err.message || String(err);
btnExtractToEditor.disabled = false;
    }
  });
})();