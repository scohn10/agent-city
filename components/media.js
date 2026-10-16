'use client';

// Voice (speech-to-text + text-to-speech) and file-attachment helpers.
// Everything here runs in the browser; nothing is stored on the server.

import { useCallback, useEffect, useRef, useState } from 'react';

/* ---------------- Files ---------------- */

export const MAX_FILES = 4;
// Raw bytes per message. Base64 adds ~33%, and Vercel caps request bodies at 4.5 MB.
export const MAX_TOTAL_BYTES = 3_000_000;
const MAX_TEXT_CHARS = 120_000;
const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|xml|html?|ya?ml|log|sql|js|jsx|ts|tsx|py|rb|go|java|css|ini|toml)$/i;

export const ACCEPT = 'image/*,application/pdf,text/*,.md,.csv,.tsv,.json,.xml,.yaml,.yml,.log,.sql,.js,.ts,.py';

function readAs(file, how) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error('Could not read file'));
    if (how === 'text') r.readAsText(file);
    else r.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not open image'));
    img.src = src;
  });
}

function drawScaled(img, max, quality) {
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return c.toDataURL('image/jpeg', quality);
}

const stripPrefix = dataUrl => dataUrl.slice(dataUrl.indexOf(',') + 1);
const b64Bytes = b64 => Math.floor(b64.length * 0.75);

export function formatSize(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function uid() {
  try { return crypto.randomUUID(); } catch { return Math.random().toString(36).slice(2); }
}

// Turns a FileList into attachments ready to send. Images are shrunk to 1600px JPEGs.
export async function prepareFiles(fileList, existing = []) {
  const items = [];
  const errors = [];
  let used = existing.reduce((n, f) => n + f.bytes, 0);

  for (const file of Array.from(fileList || [])) {
    if (existing.length + items.length >= MAX_FILES) {
      errors.push(`Up to ${MAX_FILES} files per message.`);
      break;
    }
    try {
      let item;
      if (file.type.startsWith('image/')) {
        const img = await loadImage(await readAs(file, 'url'));
        const full = drawScaled(img, 1600, 0.85);
        item = {
          kind: 'image', mime: 'image/jpeg', data: stripPrefix(full),
          thumb: drawScaled(img, 160, 0.7),
        };
        item.bytes = b64Bytes(item.data);
      } else if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
        const data = stripPrefix(await readAs(file, 'url'));
        item = { kind: 'pdf', mime: 'application/pdf', data, bytes: b64Bytes(data) };
      } else if (file.type.startsWith('text/') || TEXT_EXT.test(file.name) || file.type === 'application/json') {
        let text = await readAs(file, 'text');
        const cut = text.length > MAX_TEXT_CHARS;
        if (cut) text = text.slice(0, MAX_TEXT_CHARS) + '\n…[truncated]';
        item = { kind: 'text', mime: file.type || 'text/plain', text, bytes: text.length };
        if (cut) errors.push(`${file.name} was long, so only the first part is attached.`);
      } else {
        errors.push(`${file.name} isn't supported yet. Try an image, PDF, or text file.`);
        continue;
      }
      if (used + item.bytes > MAX_TOTAL_BYTES) {
        errors.push(`${file.name} is too large. Keep each message's files under ${formatSize(MAX_TOTAL_BYTES)}.`);
        continue;
      }
      used += item.bytes;
      items.push({ id: uid(), name: file.name, size: file.size, ...item });
    } catch (e) {
      errors.push(`Couldn't read ${file.name}.`);
    }
  }
  return { items, errors };
}

// What gets saved in chat history (no file contents, just a small preview).
export const fileMeta = f => ({ name: f.name, kind: f.kind, size: f.size, ...(f.thumb ? { thumb: f.thumb } : {}) });

// What gets sent to the relay.
export const fileWire = f => ({ name: f.name, kind: f.kind, mime: f.mime, ...(f.kind === 'text' ? { text: f.text } : { data: f.data }) });

/* ---------------- Speech to text ---------------- */

function Recognition() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function useDictation() {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');
  const recRef = useRef(null);

  useEffect(() => { setSupported(!!Recognition()); }, []);

  const stop = useCallback(() => {
    try { recRef.current?.stop(); } catch {}
  }, []);

  // onDone(finalText) fires once when the person stops talking.
  const start = useCallback(onDone => {
    const R = Recognition();
    if (!R) return false;
    try { recRef.current?.abort(); } catch {}
    const rec = new R();
    rec.lang = navigator.language || 'en-US';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    let finalText = '';
    rec.onresult = e => {
      let live = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else live += t;
      }
      setInterim((finalText + live).trim());
    };
    rec.onerror = e => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') setError('Microphone access is blocked. Allow it for this site in your browser settings.');
      else if (e.error === 'no-speech') setError('');
      else if (e.error !== 'aborted') setError('Voice input stopped. Tap the mic to try again.');
    };
    rec.onend = () => {
      setListening(false);
      setInterim('');
      recRef.current = null;
      onDone?.(finalText.trim());
    };
    try {
      rec.start();
      recRef.current = rec;
      setError('');
      setListening(true);
      return true;
    } catch {
      setError('Couldn\'t start the microphone. Tap the mic to try again.');
      return false;
    }
  }, []);

  useEffect(() => () => { try { recRef.current?.abort(); } catch {} }, []);

  return { supported, listening, interim, error, start, stop };
}

/* ---------------- Text to speech ---------------- */

export function ttsSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

export function useVoices() {
  const [voices, setVoices] = useState([]);
  useEffect(() => {
    if (!ttsSupported()) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener?.('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener?.('voiceschanged', load);
  }, []);
  const lang = (typeof navigator !== 'undefined' && navigator.language || 'en').slice(0, 2).toLowerCase();
  const mine = voices.filter(v => v.lang?.toLowerCase().startsWith(lang));
  return (mine.length ? mine : voices).slice().sort((a, b) => a.name.localeCompare(b.name));
}

// Make markdown-ish replies sound natural when read aloud.
export function cleanForSpeech(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' (code omitted) ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, 'link')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/[*_~>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Long utterances get cut off in some browsers, so speak sentence-sized chunks.
function chunks(text, max = 220) {
  const parts = text.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) || [text];
  const out = [];
  let cur = '';
  for (const p of parts) {
    if ((cur + p).length > max && cur) { out.push(cur.trim()); cur = ''; }
    if (p.length > max) {
      for (let i = 0; i < p.length; i += max) out.push(p.slice(i, i + max));
    } else cur += p;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

let speakToken = 0;

export function stopSpeaking() {
  speakToken++;
  try { window.speechSynthesis.cancel(); } catch {}
}

// Resolves when finished (or stopped). onStart/onEnd are optional.
export function speak(text, { voiceURI, onEnd } = {}) {
  if (!ttsSupported()) { onEnd?.(); return; }
  stopSpeaking();
  const token = ++speakToken;
  const synth = window.speechSynthesis;
  const voice = voiceURI ? synth.getVoices().find(v => v.voiceURI === voiceURI) : null;
  const list = chunks(cleanForSpeech(text));
  if (!list.length) { onEnd?.(); return; }
  list.forEach((part, i) => {
    const u = new SpeechSynthesisUtterance(part);
    if (voice) { u.voice = voice; u.lang = voice.lang; }
    if (i === list.length - 1) {
      u.onend = () => { if (token === speakToken) onEnd?.(); };
      u.onerror = () => { if (token === speakToken) onEnd?.(); };
    }
    synth.speak(u);
  });
}

// iOS only allows speech that starts from a tap. Call this inside a tap handler
// so later, automatic read-alouds are allowed.
export function unlockSpeech() {
  if (!ttsSupported()) return;
  try {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    window.speechSynthesis.speak(u);
  } catch {}
}
