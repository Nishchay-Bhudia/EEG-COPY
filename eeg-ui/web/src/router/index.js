import { createRouter, createWebHistory } from 'vue-router';
import { loadAuth, isElevated, isAdmin } from '@/lib/auth';

// Routes mirror the legacy showView() names (data-view attributes in the old
// index.html). Every view is lazy-loaded so the shell can render before the
// per-view components exist (they are built by other agents). '' redirects to
// the Live Monitor, which is also reachable at /monitor.
const routes = [
  { path: '/', redirect: '/monitor' },
  {
    path: '/monitor',
    name: 'monitor',
    component: () => import('@/views/Monitor.vue'),
  },
  {
    path: '/home',
    name: 'home',
    component: () => import('@/views/Home.vue'),
    meta: { elevatedOnly: true },
  },
  {
    path: '/cohort',
    name: 'cohort',
    component: () => import('@/views/Cohort.vue'),
    meta: { elevatedOnly: true },
  },
  {
    path: '/client',
    name: 'client',
    component: () => import('@/views/Client.vue'),
    meta: { elevatedOnly: true },
  },
  {
    path: '/watch',
    name: 'watch',
    component: () => import('@/views/Watch.vue'),
    meta: { elevatedOnly: true },
  },
  {
    path: '/replay',
    name: 'replay',
    component: () => import('@/views/Replay.vue'),
  },
  {
    path: '/swara',
    name: 'swara',
    component: () => import('@/views/Swara.vue'),
  },
  {
    path: '/analyze',
    name: 'analyze',
    component: () => import('@/views/Analyze.vue'),
    meta: { elevatedOnly: true },
  },
  {
    path: '/prescribe',
    name: 'prescribe',
    component: () => import('@/views/Prescribe.vue'),
    meta: { elevatedOnly: true },
  },
  {
    path: '/users',
    name: 'users',
    component: () => import('@/views/Users.vue'),
    meta: { adminOnly: true },
  },
  {
    path: '/practices',
    name: 'practices',
    component: () => import('@/views/Practices.vue'),
    meta: { adminOnly: true },
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// Guard elevated-only (instructor-tier) and admin-only (superadmin) surfaces.
// We await the one-shot auth load so a deep-link / refresh resolves the role
// before deciding; unauthorized (or signed-out) users go to the Live Monitor.
router.beforeEach(async (to) => {
  if (to.meta?.adminOnly) {
    await loadAuth();
    if (!isAdmin()) return { name: 'monitor' };
  } else if (to.meta?.elevatedOnly) {
    await loadAuth();
    if (!isElevated()) return { name: 'monitor' };
  }
  return true;
});

export default router;
