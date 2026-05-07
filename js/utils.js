/**
 * utils.js
 * Shared utility functions for Waktu Berbincang
 */

'use strict';

// ── UUID / ID generator ──────────────────────────────────────────────────────
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ── Local Storage helpers (with safe try/catch) ──────────────────────────────
export const Storage = {
  get(key, fallback = null) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch { return false; }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch { /* noop */ }
  }
};

// ── Toast notification ───────────────────────────────────────────────────────
let _toastTimer = null;

export function showToast(msg, duration = 2500) {
  const el = document.getElementById('rt-toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), duration);
}

// ── Inject toast styles + element (idempotent) ──────────────────────────────
export function initToast() {
  if (document.getElementById('rt-toast')) return;

  const s = document.createElement('style');
  s.textContent = `
    #rt-toast {
      position: fixed; bottom: 80px; left: 50%;
      transform: translateX(-50%) translateY(20px);
      background: var(--bg3); border: 1px solid var(--border2);
      border-radius: var(--r2); padding: 8px 16px;
      font-size: 12px; color: var(--text); font-family: var(--font-sans);
      pointer-events: none; opacity: 0;
      transition: opacity .2s, transform .2s;
      z-index: 999; white-space: nowrap;
      box-shadow: 0 4px 20px rgba(0,0,0,.4);
    }
    #rt-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
  `;
  document.head.appendChild(s);

  const el = document.createElement('div');
  el.id = 'rt-toast';
  document.body.appendChild(el);
}

// ── Debounce ─────────────────────────────────────────────────────────────────
export function debounce(fn, delay) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

// ── Throttle ─────────────────────────────────────────────────────────────────
export function throttle(fn, limit) {
  let last = 0;
  return (...args) => {
    const now = Date.now();
    if (now - last >= limit) { last = now; fn(...args); }
  };
}

// ── Color helpers ─────────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  '#4f8ef7','#3dd68c','#f5a623','#a78bfa','#f05252',
  '#06b6d4','#ec4899','#84cc16','#f97316','#8b5cf6'
];

export function nameToColor(name) {
  if (!name) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function nameToInitials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

// ── Flash display effect ──────────────────────────────────────────────────────
export function flashElement(id, color = 'var(--green)', duration = 150) {
  const el = document.getElementById(id);
  if (!el) return;
  const prev = el.style.color;
  el.style.color = color;
  setTimeout(() => { el.style.color = prev; }, duration);
}
