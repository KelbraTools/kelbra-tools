/**
 * Kelbra.Tools — Conversor CSV / JSON / XML / YAML
 * Todo client-side. Sin subidas a servidor.
 */
(() => {
'use strict';


const fileInput    = document.getElementById('fileInput');
const targetFormat = document.getElementById('targetFormat');
const convertBtn   = document.getElementById('convertBtn');
const downloadBtn  = document.getElementById('downloadBtn');
const inputArea    = document.getElementById('inputArea');
const outputArea   = document.getElementById('outputArea');
const errorMsg     = document.getElementById('errorMsg');
const statusMsg    = document.getElementById('statusMsg');


let lastResult = '';
let lastExt = 'json';


// Importar archivo
fileInput.addEventListener('change', (e) => {
const file = e.target.files?.[0];
if (!file) return;
const reader = new FileReader();
reader.onload = () => {
inputArea.value = reader.result;
statusMsg.textContent = `Archivo importado: ${file.name}`;
errorMsg.textContent = '';
    };
reader.readAsText(file, 'UTF-8');
fileInput.value = '';
  });


// Detectar formato de entrada
function detectFormat(text) {
const t = text.trim();
if (!t) return null;
if (t.startsWith('{') || t.startsWith('[')) return 'json';
if (/<table[\s>]/i.test(t) || /<tr[\s>]/i.test(t)) return 'html';
if (t.startsWith('<')) return 'xml';
if (t.includes(':') && !t.includes(',') && (t.includes('\n') || t.includes('- '))) return 'yaml';
// Heurística CSV
if (t.includes(',') || t.includes(';') || t.includes('\t')) return 'csv';
return 'json';
  }


// Parser de CSV que respeta comillas: un valor entre comillas puede
// contener comas, saltos de línea y comillas escapadas ("") sin que
// se corte en la columna equivocada.
function parseCSV(text) {
const sep = text.includes(';') ? ';' : (text.includes('\t') ? '\t' : ',');
const src = text.replace(/\r\n/g, '\n');
const rows = [];
let row = [];
let field = '';
let inQuotes = false;

for (let i = 0; i < src.length; i++) {
const c = src[i];
if (inQuotes) {
if (c === '"') {
if (src[i + 1] === '"') { field += '"'; i++; }
else inQuotes = false;
      } else {
field += c;
      }
    } else {
if (c === '"') {
inQuotes = true;
      } else if (c === sep) {
row.push(field);
field = '';
      } else if (c === '\n') {
row.push(field);
field = '';
rows.push(row);
row = [];
      } else {
field += c;
      }
    }
  }
// Última celda / fila si el texto no termina en salto de línea
if (field.length || row.length) {
row.push(field);
rows.push(row);
  }

const cleanRows = rows.filter(r => r.some(c => c.trim() !== ''));
if (!cleanRows.length) return [];
const headers = cleanRows[0].map(h => h.trim());
return cleanRows.slice(1).map(cols => {
const obj = {};
headers.forEach((h, i) => { obj[h] = (cols[i] ?? '').trim(); });
return obj;
  });
}


// Escapa un valor para CSV si contiene coma, comilla, punto y coma
// o salto de línea — antes solo se revisaba coma y comilla, así que
// un valor con salto de línea rompía el CSV resultante.
function csvEscape(v) {
const s = v === null || v === undefined ? '' : String(v);
return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}


function toCSV(data) {
if (!Array.isArray(data) || data.length === 0) return '';
const headers = Object.keys(data[0]);
const rows = data.map(row => headers.map(h => csvEscape(row[h])).join(','));
return [headers.map(csvEscape).join(','), ...rows].join('\n');
  }


function toXML(data) {
const escape = s => String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
if (Array.isArray(data)) {
const items = data.map(item => {
const fields = Object.entries(item)
          .map(([k, v]) => `    <${k}>${escape(v)}</${k}>`)
          .join('\n');
return `  <item>\n${fields}\n  </item>`;
      }).join('\n');
return `<?xml version="1.0" encoding="UTF-8"?>\n<root>\n${items}\n</root>`;
    }
const fields = Object.entries(data)
      .map(([k, v]) => `  <${k}>${escape(v)}</${k}>`)
      .join('\n');
return `<?xml version="1.0" encoding="UTF-8"?>\n<root>\n${fields}\n</root>`;
  }


// Ahora detecta XML mal formado: DOMParser NO lanza error con XML
// inválido, mete un <parsererror> adentro del documento y sigue
// como si nada. Si no se revisa eso, un XML roto da un resultado
// vacío o con basura, sin avisar que el XML de entrada está mal.
function parseXML(text) {
const parser = new DOMParser();
const doc = parser.parseFromString(text, 'text/xml');
const parseError = doc.querySelector('parsererror');
if (parseError) {
throw new Error('El XML no es válido: ' + parseError.textContent.trim().split('\n')[0]);
  }
const items = [...doc.querySelectorAll('item, record, row')];
if (items.length) {
return items.map(item => {
const obj = {};
        [...item.children].forEach(child => {
obj[child.tagName] = child.textContent;
        });
return obj;
      });
    }
// Objeto simple
const root = doc.documentElement;
const obj = {};
    [...root.children].forEach(child => {
obj[child.tagName] = child.textContent;
    });
return obj;
  }


// YAML real, con soporte completo (anidado, listas, números,
// booleanos, etc.) vía js-yaml en vez de una lógica casera limitada.
function parseYAML(text) {
if (typeof jsyaml === 'undefined') {
throw new Error('La librería de YAML no está disponible.');
  }
const data = jsyaml.load(text);
return data === undefined ? {} : data;
}


function toYAML(data) {
if (typeof jsyaml === 'undefined') {
throw new Error('La librería de YAML no está disponible.');
  }
return jsyaml.dump(data, { indent: 2, lineWidth: -1 });
}


function toHTML(data) {
const escape = s => String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
const rows = Array.isArray(data) ? data : [data];
if (!rows.length) return '<table></table>';
const headers = Object.keys(rows[0]);
const thead = '<thead><tr>' + headers.map(h => `<th>${escape(h)}</th>`).join('') + '</tr></thead>';
const tbody = '<tbody>' + rows.map(row =>
'<tr>' + headers.map(h => `<td>${escape(row[h])}</td>`).join('') + '</tr>'
    ).join('') + '</tbody>';
return `<table border="1" cellpadding="6" cellspacing="0">\n${thead}\n${tbody}\n</table>`;
  }


function parseHTML(text) {
const parser = new DOMParser();
const doc = parser.parseFromString(text, 'text/html');
const table = doc.querySelector('table');
if (!table) return [];
const headers = [...table.querySelectorAll('th')].map(th => th.textContent.trim());
const rows = [...table.querySelectorAll('tr')].filter(tr => tr.querySelector('td'));
if (!headers.length && rows.length) {
// Sin thead: usar primera fila como encabezados
const first = rows.shift();
const hdrs = [...first.querySelectorAll('td')].map(td => td.textContent.trim());
return rows.map(tr => {
const cells = [...tr.querySelectorAll('td')];
const obj = {};
hdrs.forEach((h, i) => { obj[h || `col${i+1}`] = cells[i]?.textContent.trim() ?? ''; });
return obj;
      });
    }
return rows.map(tr => {
const cells = [...tr.querySelectorAll('td')];
const obj = {};
headers.forEach((h, i) => { obj[h] = cells[i]?.textContent.trim() ?? ''; });
return obj;
    });
  }


convertBtn.addEventListener('click', () => {
errorMsg.textContent = '';
statusMsg.textContent = '';
const text = inputArea.value.trim();
if (!text) {
errorMsg.textContent = 'Pega o importa algún contenido primero.';
return;
    }


try {
const from = detectFormat(text);
let data;


if (from === 'json') data = JSON.parse(text);
else if (from === 'csv') data = parseCSV(text);
else if (from === 'xml') data = parseXML(text);
else if (from === 'yaml') data = parseYAML(text);
else if (from === 'html') data = parseHTML(text);
else data = JSON.parse(text);


const to = targetFormat.value;
let result = '';


if (to === 'json') {
result = JSON.stringify(data, null, 2);
lastExt = 'json';
      } else if (to === 'csv') {
result = toCSV(Array.isArray(data) ? data : [data]);
lastExt = 'csv';
      } else if (to === 'xml') {
result = toXML(data);
lastExt = 'xml';
      } else if (to === 'yaml') {
result = toYAML(data);
lastExt = 'yaml';
      } else if (to === 'html') {
result = toHTML(Array.isArray(data) ? data : [data]);
lastExt = 'html';
      }


outputArea.value = result;
lastResult = result;
downloadBtn.disabled = false;
statusMsg.textContent = `Convertido de ${from?.toUpperCase() || 'texto'} a ${to.toUpperCase()}.`;
    } catch (err) {
errorMsg.textContent = 'No se pudo convertir: ' + (err.message || err);
outputArea.value = '';
downloadBtn.disabled = true;
    }
  });


downloadBtn.addEventListener('click', () => {
if (!lastResult) return;
const blob = new Blob([lastResult], { type: 'text/plain;charset=utf-8' });
const a = document.createElement('a');
a.href = URL.createObjectURL(blob);
a.download = `convertido.${lastExt}`;
a.click();
URL.revokeObjectURL(a.href);
  });
})();