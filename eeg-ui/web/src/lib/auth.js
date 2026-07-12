// Minimal shared auth state for the Vue shell. The Express BFF owns the session
// (httpOnly cookie); here we just fetch the current user once (GET /api/auth/me)
// so the UI can gate elevated-only surfaces. Mirrors the legacy app.js
// currentUser / isElevatedRole() pair.
import { reactive } from 'vue';
import { api, setToken } from '@/lib/api';

// { id, username, role } | null
export const auth = reactive({ user: null, loaded: false });

// Roles that may watch a student's live session (the teacher/instructor tier).
const ELEVATED_ROLES = ['admin', 'co-admin'];

let loadPromise = null;

// Idempotent: the first call fetches; later calls await the same result.
export function loadAuth() {
  if (!loadPromise) {
    loadPromise = api('GET', '/auth/me')
      .then((u) => { auth.user = u; })
      .catch(() => { auth.user = null; })   // 401 / offline → treated as signed-out
      .finally(() => { auth.loaded = true; });
  }
  return loadPromise;
}

// Reactive when read during render/computed (reads auth.user).
export function isElevated() {
  return !!auth.user && ELEVATED_ROLES.includes(auth.user.role);
}

// Superadmin only (the seeded 'admin' account tier). Gates user management —
// the one surface that creates instructors and sees every account.
export function isAdmin() {
  return auth.user?.role === 'admin';
}

// Sign in. Works against either backend:
//   • .NET → returns { token, user_id, username, role }; we store the bearer token.
//   • Express → returns { id, username, role } and sets an httpOnly cookie.
export async function login(username, password) {
  const res = await api('POST', '/auth/login', { username, password });
  if (res && res.token) setToken(res.token);          // bearer mode (.NET)
  auth.user = {
    id: res.user_id ?? res.id ?? null,
    username: res.username ?? username,
    role: res.role ?? 'user',
  };
  auth.loaded = true;
  return auth.user;
}

export async function logout() {
  // Express clears the cookie server-side; .NET is stateless (drop the token).
  try { await api('POST', '/auth/logout'); } catch { /* clear locally regardless */ }
  setToken(null);
  auth.user = null;
}
