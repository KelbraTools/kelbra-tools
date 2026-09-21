/**
 * Kelbra.Tools — Recortador de imágenes compartido
 * Uso: KelbraCropper.open(dataUrl, callback)
 * El callback recibe el dataURL de la imagen recortada (o null si se cancela).
 */
(function () {
  'use strict';

  function createOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'vx-crop-overlay';
    overlay.innerHTML = `
      <div class="vx-crop-panel">
        <p class="vx-crop-title">Arrastra el rectángulo o sus esquinas para recortar. Luego pulsa “Aplicar recorte”.</p>
        <div class="vx-crop-stage">
          <img class="vx-crop-img" alt="Imagen a recortar">
          <div class="vx-crop-rect">
            <div class="vx-crop-handle" data-h="nw"></div>
            <div class="vx-crop-handle" data-h="ne"></div>
            <div class="vx-crop-handle" data-h="sw"></div>
            <div class="vx-crop-handle" data-h="se"></div>
          </div>
        </div>
        <div class="vx-crop-actions">
          <button type="button" class="file-btn" data-action="cancel">Cancelar</button>
          <button type="button" class="primary-btn" data-action="apply">Aplicar recorte</button>
        </div>
      </div>
    `;
    return overlay;
  }

  function open(dataUrl, callback) {
    if (!dataUrl) {
      if (typeof callback === 'function') callback(null);
      return;
    }

    const overlay = createOverlay();
    document.body.appendChild(overlay);

    const img = overlay.querySelector('.vx-crop-img');
    const rectEl = overlay.querySelector('.vx-crop-rect');
    const stage = overlay.querySelector('.vx-crop-stage');
    const applyBtn = overlay.querySelector('[data-action="apply"]');
    const cancelBtn = overlay.querySelector('[data-action="cancel"]');

    let naturalW = 0, naturalH = 0;
    let displayW = 0, displayH = 0;
    let crop = { x: 0, y: 0, w: 0, h: 0 }; // en coordenadas de la imagen mostrada
    let mode = null; // 'move' | 'nw' | 'ne' | 'sw' | 'se'
    let startX = 0, startY = 0;
    let startCrop = null;

    img.onload = () => {
      naturalW = img.naturalWidth;
      naturalH = img.naturalHeight;

      // Ajustar tamaño de visualización
      const maxW = Math.min(680, window.innerWidth - 80);
      const maxH = Math.min(window.innerHeight * 0.55, 480);
      const scale = Math.min(maxW / naturalW, maxH / naturalH, 1);
      displayW = Math.round(naturalW * scale);
      displayH = Math.round(naturalH * scale);
      img.style.width = displayW + 'px';
      img.style.height = displayH + 'px';

      // Recorte inicial: casi toda la imagen con un pequeño margen
      const margin = Math.min(displayW, displayH) * 0.05;
      crop = {
        x: margin,
        y: margin,
        w: displayW - margin * 2,
        h: displayH - margin * 2
      };
      updateRect();
    };
    img.src = dataUrl;

    function updateRect() {
      rectEl.style.left = crop.x + 'px';
      rectEl.style.top = crop.y + 'px';
      rectEl.style.width = crop.w + 'px';
      rectEl.style.height = crop.h + 'px';
    }

    function clampCrop() {
      crop.w = Math.max(30, Math.min(crop.w, displayW));
      crop.h = Math.max(30, Math.min(crop.h, displayH));
      crop.x = Math.max(0, Math.min(crop.x, displayW - crop.w));
      crop.y = Math.max(0, Math.min(crop.y, displayH - crop.h));
    }

    // Eventos de arrastre
    rectEl.addEventListener('pointerdown', (e) => {
      if (e.target.classList.contains('vx-crop-handle')) return;
      e.preventDefault();
      mode = 'move';
      startX = e.clientX;
      startY = e.clientY;
      startCrop = { ...crop };
      rectEl.setPointerCapture(e.pointerId);
    });

    overlay.querySelectorAll('.vx-crop-handle').forEach(handle => {
      handle.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        mode = handle.dataset.h;
        startX = e.clientX;
        startY = e.clientY;
        startCrop = { ...crop };
        handle.setPointerCapture(e.pointerId);
      });
    });

    function onPointerMove(e) {
      if (!mode) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (mode === 'move') {
        crop.x = startCrop.x + dx;
        crop.y = startCrop.y + dy;
      } else {
        if (mode.includes('w')) {
          crop.x = startCrop.x + dx;
          crop.w = startCrop.w - dx;
        }
        if (mode.includes('e')) {
          crop.w = startCrop.w + dx;
        }
        if (mode.includes('n')) {
          crop.y = startCrop.y + dy;
          crop.h = startCrop.h - dy;
        }
        if (mode.includes('s')) {
          crop.h = startCrop.h + dy;
        }
      }
      clampCrop();
      updateRect();
    }

    function onPointerUp() {
      mode = null;
    }

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);

    function cleanup() {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      overlay.remove();
    }

    cancelBtn.addEventListener('click', () => {
      cleanup();
      if (typeof callback === 'function') callback(null);
    });

    applyBtn.addEventListener('click', () => {
      // Convertir coordenadas de visualización a coordenadas naturales
      const scaleX = naturalW / displayW;
      const scaleY = naturalH / displayH;
      const sx = Math.round(crop.x * scaleX);
      const sy = Math.round(crop.y * scaleY);
      const sw = Math.round(crop.w * scaleX);
      const sh = Math.round(crop.h * scaleY);

      const canvas = document.createElement('canvas');
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

      const result = canvas.toDataURL('image/png');
      cleanup();
      if (typeof callback === 'function') callback(result);
    });

    // Cerrar con Escape
    const onKey = (e) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', onKey);
        cleanup();
        if (typeof callback === 'function') callback(null);
      }
    };
    document.addEventListener('keydown', onKey);
  }

  window.KelbraCropper = { open };
})();