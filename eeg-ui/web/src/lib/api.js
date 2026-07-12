// Single API access point for the whole app.
//
// Two modes, selected at runtime so the cutover to the consolidated .NET backend
// is a config flip rather than a rewrite:
//   • Bearer mode — when an auth token is stored (set at login). Calls go to
//     VITE_API_BASE (the .NET backend, routes at root) with an Authorization
//     header. This is the target architecture.
//   • Cookie mode — no token stored. Calls go to '/api' (the Express BFF, proxied
//     in dev) with the session cookie. This is the legacy path.
//
// Usage:  import { api } from '@/lib/api'
//         const rows = await api('GET', '/sessions/mine');
// Mode is chosen by whether VITE_API_BASE is DEFINED at build time (even ''):
//   • defined → .NET mode. Routes are at root; calls carry a bearer token (empty
//     before login). VITE_API_BASE='' means same-origin (the .NET app serving
//     this SPA); a URL means a separate backend host.
//   • undefined → legacy Express mode: '/api' prefix + session cookie.
const RAW_BASE = import.meta.env.VITE_API_BASE;
const DOTNET = RAW_BASE !== undefined;
const API_BASE = (RAW_BASE || '').replace(/\/$/, '');
const TOKEN_KEY = 'auth_token';

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}
export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* storage unavailable — bearer mode simply won't persist */ }
}

// Exposed for the live-streaming layer, which talks to the .NET hub/REST directly.
export function isDotnet() { return DOTNET; }
export function apiBase() { return API_BASE; }

function urlFor(path) {
  return DOTNET ? API_BASE + path : '/api' + path;
}

export async function api(method, path, body) {
  const opts = { method, headers: {} };
  if (DOTNET) {
    const token = getToken();
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
  } else {
    opts.credentials = 'include';
  }
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(urlFor(path), opts);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw Object.assign(
      new Error(data.error || 'HTTP ' + res.status),
      { status: res.status }
    );
  }
  return res.status === 204 ? null : res.json();
}
