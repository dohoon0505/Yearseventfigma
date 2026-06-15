/* ============================================================
   shell.js — app chrome (header + sidebar + main slot).
   Ports Layout.tsx. Mounted once and reused across /app routes.
   ============================================================ */
import { html, setHTML, on, qs, qsa } from "./dom.js";
import { nav } from "./router.js";

const MENU = [
  {
    group: "사용자 메뉴",
    items: [
      { label: "경조상품 주문", hash: "#/app", icon: "nav-order.png" },
      { label: "실시간 주문내역", hash: "#/app/orders", icon: "nav-realtime.png" },
    ],
  },
  {
    group: "정산관련메뉴",
    items: [
      { label: "거래명세서 조회", hash: "#/app/invoice", icon: "nav-invoice.png" },
      { label: "정산회계 조회", hash: "#/app/settlement", icon: "nav-accounting.png" },
    ],
  },
  {
    group: "회사관련메뉴",
    items: [
      { label: "프로필 저장공간", hash: "#/app/profile", icon: "nav-profile.png" },
      { label: "상품 규격 안내", hash: "#/app/products", icon: "nav-product.png" },
    ],
  },
];

let shellEl = null; // <div class="shell">
let offClick = null;

function buildShell() {
  const wrap = document.createElement("div");
  wrap.className = "shell";
  setHTML(
    wrap,
    html`
      <header class="shell__header">
        <div class="shell__brand">
          <img class="shell__logo" src="./assets/logo.png" alt="올해의경조사" />
          <span class="shell__sep"></span>
          <div class="badge badge--company">
            <img src="./assets/company.png" alt="" />
            <span>(주)진양코퍼레이션</span>
          </div>
          <div class="badge badge--user">
            <img src="./assets/user.png" alt="" />
            <span>총무팀 김사원</span>
          </div>
        </div>
        <div class="warning-banner" role="status">
          <img src="./assets/warning.png" alt="" />
          <span>연간 상품 누락 및 오배송: <strong>0건</strong></span>
        </div>
      </header>

      <div class="shell__body">
        <aside class="shell__sidebar">
          <nav class="shell__nav" aria-label="주 메뉴">
            ${MENU.map(
              (g) => html`
                <div class="shell__group">
                  <p class="shell__group-title">${g.group}</p>
                  <div class="shell__group-items">
                    ${g.items.map(
                      (it) => html`
                        <a
                          class="shell__link"
                          href="${it.hash}"
                          data-nav="${it.hash}"
                        >
                          <img src="./assets/${it.icon}" alt="" />
                          <span>${it.label}</span>
                        </a>
                      `
                    )}
                  </div>
                </div>
              `
            )}
          </nav>
          <div class="shell__logout-wrap">
            <button type="button" class="shell__logout" data-action="logout">
              <img src="./assets/nav-logout.png" alt="" />
              <span>서비스 로그아웃</span>
            </button>
          </div>
        </aside>

        <main class="shell__main" tabindex="-1"></main>
      </div>
    `
  );

  offClick = on(wrap, "click", "[data-action='logout']", () => nav("#/login"));
  return wrap;
}

/** Ensure the shell exists in appRoot; return the <main> content slot. */
export function mountShell(appRoot) {
  if (!shellEl || !appRoot.contains(shellEl)) {
    appRoot.innerHTML = "";
    shellEl = buildShell();
    appRoot.appendChild(shellEl);
  }
  return qs(shellEl, ".shell__main");
}

export function unmountShell() {
  if (offClick) {
    offClick();
    offClick = null;
  }
  shellEl = null;
}

/** Highlight the active sidebar link by its canonical nav hash. */
export function setActiveNav(navHash) {
  if (!shellEl) return;
  qsa(shellEl, ".shell__link").forEach((a) => {
    a.classList.toggle("is-active", a.dataset.nav === navHash);
    if (a.dataset.nav === navHash) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
}
