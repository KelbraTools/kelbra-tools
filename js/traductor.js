/**
 * Kelbra.Tools — Traductor + voz
 * Idiomas: es, en, en-GB, pt, it, fr, de, zh-CN, ja
 * Traducción: MyMemory (gratuita)
 * Voz: Web Speech API
 */
(() => {
'use strict';


const fromLang = document.getElementById('fromLang');
const toLang = document.getElementById('toLang');
const sourceText = document.getElementById('sourceText');
const targetText = document.getElementById('targetText');
const translateBtn = document.getElementById('translateBtn');
const speakBtn = document.getElementById('speakBtn');
const statusMsg = document.getElementById('statusMsg');
const errorMsg = document.getElementById('errorMsg');


// MyMemory no diferencia en-GB → se usa 'en'. La voz sí usa en-GB.
const langMap = {
'es': 'es',
'en': 'en',
'en-GB': 'en',
'pt': 'pt',
'it': 'it',
'fr': 'fr',
'de': 'de',
'zh-CN': 'zh-CN',
'ja': 'ja',
'auto': 'autodetect'
  };


translateBtn.addEventListener('click', async () => {
const text = sourceText.value.trim();
if (!text) {
errorMsg.textContent = 'Escribe o pega algún texto primero.';
return;
    }
errorMsg.textContent = '';
statusMsg.textContent = 'Traduciendo…';
translateBtn.disabled = true;


try {
const from = fromLang.value === 'auto' ? 'autodetect' : (langMap[fromLang.value] || fromLang.value);
const to = langMap[toLang.value] || toLang.value;
const langpair = `${from}|${to}`;
const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langpair}`;
const res = await fetch(url);
const data = await res.json();


if (data.responseStatus === 200 && data.responseData?.translatedText) {
targetText.value = data.responseData.translatedText;
statusMsg.textContent = 'Traducción lista. Puedes editarla si lo necesitas.';
      } else {
throw new Error(data.responseDetails || 'No se pudo traducir');
      }
    } catch (err) {
errorMsg.textContent = 'Error al traducir: ' + (err.message || err) + '. Prueba de nuevo o revisa tu conexión.';
statusMsg.textContent = '';
    } finally {
translateBtn.disabled = false;
    }
  });


speakBtn.addEventListener('click', () => {
const text = targetText.value.trim() || sourceText.value.trim();
if (!text) {
errorMsg.textContent = 'No hay texto para escuchar.';
return;
    }
if (!window.speechSynthesis) {
errorMsg.textContent = 'Tu navegador no soporta síntesis de voz.';
return;
    }


window.speechSynthesis.cancel();
const utter = new SpeechSynthesisUtterance(text);
const langCode = toLang.value || 'en';
utter.lang = langCode === 'zh-CN' ? 'zh-CN' : langCode;
utter.rate = 0.92;


const voices = window.speechSynthesis.getVoices();
const preferred = voices.find(v =>
v.lang.toLowerCase().startsWith(langCode.toLowerCase().slice(0, 2)) ||
v.lang.toLowerCase() === langCode.toLowerCase()
    );
if (preferred) utter.voice = preferred;


window.speechSynthesis.speak(utter);
statusMsg.textContent = 'Reproduciendo pronunciación…';
  });


if (window.speechSynthesis) {
window.speechSynthesis.getVoices();
window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
  }
})();