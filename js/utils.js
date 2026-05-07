export function now() {
  return Date.now();
}

export function generateId(prefix = 'id') {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${random}`;
}

export function safeKey(value) {
  return String(value || 'unknown').replace(/[.#$/[\]]/g, '_');
}

export const Storage = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },

  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* noop */
    }
  }
};

const COLORS = ['#4f8ef7', '#3dd68c', '#f5a623', '#f05252', '#a78bfa', '#f472b6', '#2dd4bf'];

export function nameToColor(name) {
  let hash = 0;
  const text = String(name || '');
  for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) - hash) + text.charCodeAt(i);
  return COLORS[Math.abs(hash) % COLORS.length];
}

export function nameToInitials(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  return parts.map((part) => part[0]).join('').toUpperCase().slice(0, 2) || '?';
}

let toastTimer = null;

export function initToast() {
  if (document.getElementById('rt-toast')) return;
  const style = document.createElement('style');
  style.textContent = `
    #rt-toast{position:fixed;left:50%;bottom:80px;transform:translate(-50%,16px);z-index:9999;
      background:var(--bg3,#1e293b);border:1px solid var(--border2,#334155);color:var(--text,#f8fafc);
      border-radius:8px;padding:8px 14px;font-size:12px;opacity:0;pointer-events:none;
      transition:opacity .18s ease,transform .18s ease;box-shadow:0 8px 28px rgba(0,0,0,.25)}
    #rt-toast.show{opacity:1;transform:translate(-50%,0)}
  `;
  document.head.appendChild(style);
  const el = document.createElement('div');
  el.id = 'rt-toast';
  document.body.appendChild(el);
}

export function showToast(message, duration = 1800) {
  const el = document.getElementById('rt-toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), duration);
}

export function toArrayFromObject(value, mapEntry) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return Object.entries(value).map(([key, item]) => mapEntry ? mapEntry(key, item) : item);
}
