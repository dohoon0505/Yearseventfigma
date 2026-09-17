/* ============================================================
   router.js — hash router. Mounts the shell for /app/* routes,
   renders standalone pages for login/register.
   Page module contract:  export function mount(container, ctx) -> cleanup
   ============================================================ */
import { mountShell, unmountShell, setActiveNav } from "./shell.js";
import { getRole, setReturnTo } from "./session.js";
import { closeAllModals } from "./ui.js";

const routes = [
  { hash: "#/", redirect: "#/login" },
  { hash: "#/login",          load: () => import("./pages/login.js"),      shell: false },
  { hash: "#/register",       load: () => import("./pages/register.js"),   shell: false },
  // ── Enterprise — 역할이 있어야 열린다(requiresAuth). 비로그인 딥링크는 로그인 뒤 원래 주소로 돌아온다(2026-09-17).
  //    예전엔 가드가 없어 주소만 치면 util/client.js 폴백으로 첫 거래처(태원과학)의 명세서가 보였다 — 공개 사이트다. ──
  { hash: "#/app",            load: () => import("./pages/order.js"),      shell: true, nav: "#/app",            requiresAuth: true },
  { hash: "#/app/orders",     load: () => import("./pages/orders.js"),     shell: true, nav: "#/app/orders",     requiresAuth: true },
  { hash: "#/app/invoice",    load: () => import("./pages/invoice.js"),    shell: true, nav: "#/app/invoice",    requiresAuth: true },
  { hash: "#/app/settlement", load: () => import("./pages/settlement.js"), shell: true, nav: "#/app/settlement", requiresAuth: true },
  { hash: "#/app/profile",    load: () => import("./pages/profile.js"),    shell: true, nav: "#/app/profile",    requiresAuth: true },
  { hash: "#/app/products",   load: () => import("./pages/products.js"),   shell: true, nav: "#/app/products",   requiresAuth: true },
  // ── Admin (requires admin role; admin shell variant) ──
  { hash: "#/admin/dashboard",  load: () => import("./pages/admin-dashboard.js"),  shell: true, nav: "#/admin/dashboard",  variant: "admin", requiresRole: "admin" },
  { hash: "#/admin/orders",     load: () => import("./pages/admin-orders.js"),     shell: true, nav: "#/admin/orders",     variant: "admin", requiresRole: "admin" },
  { hash: "#/admin/b2c",        load: () => import("./pages/admin-b2c.js"),        shell: true, nav: "#/admin/b2c",        variant: "admin", requiresRole: "admin" },
  { hash: "#/admin",            load: () => import("./pages/admin-clients.js"),    shell: true, nav: "#/admin",            variant: "admin", requiresRole: "admin" },
  { hash: "#/admin/settlement", load: () => import("./pages/admin-settlement.js"), shell: true, nav: "#/admin/settlement", variant: "admin", requiresRole: "admin" },
  { hash: "#/admin/pricing",    load: () => import("./pages/admin-pricing.js"),    shell: true, nav: "#/admin/pricing",    variant: "admin", requiresRole: "admin" },
  { hash: "#/admin/staff",      load: () => import("./pages/admin-staff.js"),      shell: true, nav: "#/admin/staff",      variant: "admin", requiresRole: "admin" },
];

let appRoot = null;
let cleanup = null;
let token = 0; // guards against out-of-order async imports

/** Programmatic navigation (replaces react-router's useNavigate). */
export function nav(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

function findRoute(hash) {
  return routes.find((r) => r.hash === hash);
}

async function render() {
  const hash = location.hash || "#/";
  const route = findRoute(hash);

  if (route && route.redirect) {
    location.replace(route.redirect);
    return;
  }
  if (!route) {
    location.replace("#/login"); // unknown hash → login (matches old "/" guard)
    return;
  }

  // Role guard (DEMO gate — see session.js).
  //  requiresAuth: 역할이 있으면 된다(관리자도 포털을 볼 수 있다 — util/client.js 가 첫 거래처로 폴백).
  //  requiresRole: 그 역할이어야 한다. 둘 다 막힐 때 원래 주소를 남겨 로그인 뒤 돌아오게 한다.
  if ((route.requiresAuth && !getRole()) || (route.requiresRole && getRole() !== route.requiresRole)) {
    setReturnTo(hash);
    location.replace("#/login");
    return;
  }

  const my = ++token;

  // Tear down the previous page (timers, listeners, modals).
  if (cleanup) {
    try {
      cleanup();
    } catch (e) {
      console.error("[router] cleanup failed", e);
    }
    cleanup = null;
  }
  /* 페이지가 모르는 스택 모달(담당자 피커 등)이 다음 화면을 덮지 않도록 */
  closeAllModals();

  let target;
  if (route.shell) {
    target = mountShell(appRoot, route.variant || "enterprise");
    setActiveNav(route.nav);
  } else {
    unmountShell();
    appRoot.innerHTML = "";
    target = appRoot;
  }

  let mod;
  try {
    mod = await route.load();
  } catch (e) {
    console.error("[router] failed to load", hash, e);
    target.innerHTML =
      '<div style="padding:40px;color:var(--c-text-3)">페이지를 불러오지 못했습니다.</div>';
    return;
  }
  if (my !== token) return; // superseded by a newer navigation

  target.innerHTML = "";
  cleanup = mod.mount(target, { nav }) || null;
  target.scrollTop = 0;
}

export function start() {
  appRoot = document.getElementById("app");
  window.addEventListener("hashchange", render);
  render();
}
