/* ============================================================
   router.js — hash router. Mounts the shell for /app/* routes,
   renders standalone pages for login/register.
   Page module contract:  export function mount(container, ctx) -> cleanup
   ============================================================ */
import { mountShell, unmountShell, setActiveNav } from "./shell.js";

const routes = [
  { hash: "#/", redirect: "#/login" },
  { hash: "#/login",          load: () => import("./pages/login.js"),      shell: false },
  { hash: "#/register",       load: () => import("./pages/register.js"),   shell: false },
  { hash: "#/app",            load: () => import("./pages/order.js"),      shell: true, nav: "#/app" },
  { hash: "#/app/orders",     load: () => import("./pages/orders.js"),     shell: true, nav: "#/app/orders" },
  { hash: "#/app/invoice",    load: () => import("./pages/invoice.js"),    shell: true, nav: "#/app/invoice" },
  { hash: "#/app/settlement", load: () => import("./pages/settlement.js"), shell: true, nav: "#/app/settlement" },
  { hash: "#/app/profile",    load: () => import("./pages/profile.js"),    shell: true, nav: "#/app/profile" },
  { hash: "#/app/products",   load: () => import("./pages/products.js"),   shell: true, nav: "#/app/products" },
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

  let target;
  if (route.shell) {
    target = mountShell(appRoot);
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
