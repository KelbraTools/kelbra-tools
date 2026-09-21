/**
 * Kelbra.Tools — Comprimir imágenes
 * Regla estricta: el archivo resultante NUNCA puede pesar más que el original.
 * El control de calidad al 100% representa el máximo posible sin superar el peso original.
 */
(() => {
'use strict';


const mediaInput = document.getElementById('mediaInput');
const qualitySlider = document.getElementById('qualitySlider');
const qualityValue = document.getElementById('qualityValue');
const downloadBtn = document.getElementById('downloadBtn');
const originalBox = document.getElementById('originalBox');
const compressedBox = document.getElementById('compressedBox');
const originalSize = document.getElementById('originalSize');
const compressedSize = document.getElementById('compressedSize');
const statusMsg = document.getElementById('statusMsg');
const errorMsg = document.getElementById('errorMsg');


let currentFile = null;
let compressedBlob = null;
let originalObjectUrl = null;


function formatSize(bytes) {
if (bytes < 1024) return bytes + ' B';
if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }


qualitySlider.addEventListener('input', () => {
qualityValue.textContent = qualitySlider.value + '%';
if (currentFile) compressImage();
  });


mediaInput.addEventListener('change', (e) => {
const file = e.target.files?.[0];
if (!file) return;
if (!file.type.startsWith('image/')) {
errorMsg.textContent = 'Solo se admiten imágenes.';
mediaInput.value = '';
return;
    }
currentFile = file;
errorMsg.textContent = '';
statusMsg.textContent = '';
compressedBlob = null;
downloadBtn.disabled = true;
originalBox.innerHTML = '';
compressedBox.innerHTML = '';
originalSize.textContent = '';
compressedSize.textContent = '';


if (originalObjectUrl) URL.revokeObjectURL(originalObjectUrl);
originalObjectUrl = URL.createObjectURL(file);


const img = document.createElement('img');
img.onload = () => {
originalBox.appendChild(img);
originalSize.textContent = `Tamaño: ${formatSize(file.size)} · ${img.naturalWidth}×${img.naturalHeight}px`;
compressImage();
    };
img.src = originalObjectUrl;
mediaInput.value = '';
  });


/**
   * Genera un blob JPEG con la calidad indicada.
   * Devuelve una Promise con el blob (o null).
   */
function createJpegBlob(img, quality) {
return new Promise((resolve) => {
const canvas = document.createElement('canvas');
let w = img.naturalWidth;
let h = img.naturalHeight;
const MAX = 1600;
if (w > MAX || h > MAX) {
const ratio = Math.min(MAX / w, MAX / h);
w = Math.round(w * ratio);
h = Math.round(h * ratio);
      }
canvas.width = w;
canvas.height = h;
const ctx = canvas.getContext('2d');
ctx.drawImage(img, 0, 0, w, h);
canvas.toBlob((blob) => resolve({ blob, w, h }), 'image/jpeg', quality);
    });
  }


/**
   * Compresión con garantía: el resultado NUNCA pesará más que el original.
   * Si con la calidad elegida sale más grande, se reduce la calidad automáticamente
   * hasta encontrar un valor que respete el peso original (o se usa el original).
   */
async function compressImage() {
if (!currentFile) return;


const targetQuality = parseInt(qualitySlider.value, 10) / 100;
const img = new Image();
img.src = originalObjectUrl || URL.createObjectURL(currentFile);


await new Promise((res) => { img.onload = res; img.onerror = res; });


// Primera prueba con la calidad elegida por el usuario
let { blob, w, h } = await createJpegBlob(img, targetQuality);


if (!blob) {
statusMsg.textContent = 'No se pudo comprimir la imagen.';
return;
    }


// Si el resultado es más pesado → buscar la calidad más alta que NO supere el original
if (blob.size > currentFile.size) {
let low = 0.1;
let high = targetQuality;
let bestBlob = null;
let bestW = w;
let bestH = h;


// Búsqueda binaria de la calidad máxima que respete el peso original
for (let i = 0; i < 8; i++) {
const mid = (low + high) / 2;
const result = await createJpegBlob(img, mid);
if (!result.blob) break;
if (result.blob.size <= currentFile.size) {
bestBlob = result.blob;
bestW = result.w;
bestH = result.h;
low = mid;
        } else {
high = mid;
        }
      }


if (bestBlob) {
blob = bestBlob;
w = bestW;
h = bestH;
      } else {
// Imposible reducir: se mantiene el original (nunca se aumenta el peso)
blob = currentFile;
w = img.naturalWidth;
h = img.naturalHeight;
      }
    }


compressedBlob = blob;
compressedBox.innerHTML = '';
const outImg = document.createElement('img');
outImg.src = URL.createObjectURL(blob);
compressedBox.appendChild(outImg);
compressedSize.textContent = `Tamaño: ${formatSize(blob.size)} · ${w}×${h}px`;
downloadBtn.disabled = false;


const saved = currentFile.size - blob.size;
const ratio = ((saved / currentFile.size) * 100).toFixed(0);


if (blob.size >= currentFile.size) {
statusMsg.textContent = 'Se mantiene el peso original (no es posible reducirlo más con esta calidad). El control al 100 % = peso original o menor.';
    } else if (ratio > 0) {
statusMsg.textContent = `Comprimido: se redujo aproximadamente un ${ratio}% (nunca supera el peso original).`;
    } else {
statusMsg.textContent = 'Comprimido (el tamaño se mantiene igual o menor al original).';
    }
  }


downloadBtn.addEventListener('click', () => {
if (!compressedBlob) return;


const url = URL.createObjectURL(compressedBlob);
const a = document.createElement('a');
a.href = url;
const base = (currentFile?.name || 'imagen').replace(/\.[^.]+$/, '');
a.download = base + '-comprimido.jpg';
document.body.appendChild(a);
a.click();
document.body.removeChild(a);


// Revocar después de un tiempo para que el navegador termine la descarga
setTimeout(() => URL.revokeObjectURL(url), 15000);
  });
})();