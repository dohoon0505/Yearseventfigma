/* ============================================================
   shell.js — app chrome (header + sidebar + main slot).
   Ports Layout.tsx. Mounted once and reused across /app routes.
   ============================================================ */
import { html, setHTML, on, qs, qsa } from "./dom.js";
import { nav } from "./router.js";
import { clearRole } from "./session.js";

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

// Admin console menu — reuses existing nav PNG icons.
const ADMIN_MENU = [
  {
    group: "B2C 관리",
    items: [
      { label: "B2C 통합주문관리", hash: "#/admin/b2c", icon: "nav-realtime.png" },
    ],
  },
  {
    group: "거래처 관리",
    items: [
      { label: "거래처 정보관리", hash: "#/admin", icon: "nav-profile.png" },
      { label: "거래처 정산회계", hash: "#/admin/settlement", icon: "nav-accounting.png" },
      { label: "기업별 상품단가", hash: "#/admin/pricing", icon: "nav-product.png" },
    ],
  },
];

let shellEl = null; // <div class="shell">
let offClick = null;
let currentVariant = null;
let deadlineTimer = null;

/* 영업시간 — 향후 테넌트별 설정으로 이전 예정. 정책 변경 시 이 두 값만 수정. */
const BIZ_OPEN_MIN = 9 * 60;        // 09:00 접수 시작
const BIZ_CLOSE_MIN = 18 * 60 + 30; // 18:30 당일배송 마감

/* 당일배송 마감(18:30) 안내 — 헤더 배지.
   영업시간(09:00~18:30) 내엔 마감 카운트다운, 그 외엔 마감 안내. */
function deadlineInfo() {
  const now = new Date();
  const t = now.getHours() * 60 + now.getMinutes();
  if (t >= BIZ_OPEN_MIN && t < BIZ_CLOSE_MIN) {
    const r = BIZ_CLOSE_MIN - t;
    const h = Math.floor(r / 60), m = r % 60;
    return { open: true, body: html`당일배송 마감까지 <b>${h > 0 ? `${h}시간 ${m}분` : `${m}분`}</b>` };
  }
  return { open: false, body: html`당일배송이 마감되었습니다` };
}
function renderDeadline() {
  if (!shellEl) return;
  const badge = qs(shellEl, ".badge--deadline");
  if (!badge) return; // 관리자 콘솔엔 미표시
  const info = deadlineInfo();
  badge.classList.toggle("is-closed", !info.open);
  setHTML(qs(badge, "[data-deadline-text]"), info.body);
}
function stopDeadlineTimer() { if (deadlineTimer) { clearInterval(deadlineTimer); deadlineTimer = null; } }

function buildShell(variant = "enterprise") {
  const menu = variant === "admin" ? ADMIN_MENU : MENU;
  const brand =
    variant === "admin"
      ? { company: "관리자 콘솔" }
      : { company: "(주)진양코퍼레이션" };

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
            <span>${brand.company}</span>
          </div>
          ${variant === "admin"
            ? ""
            : html`<div class="badge badge--deadline"><span class="badge__dot"></span><span data-deadline-text></span></div>`}
        </div>
      </header>

      <div class="shell__body">
        <aside class="shell__sidebar">
          <nav class="shell__nav" aria-label="주 메뉴">
            ${menu.map(
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

  offClick = on(wrap, "click", "[data-action='logout']", () => {
    clearRole();
    nav("#/login");
  });
  return wrap;
}

/** Ensure the shell exists in appRoot for the given variant; return the
 *  <main> content slot. Rebuilds when the variant changes (admin↔enterprise). */
export function mountShell(appRoot, variant = "enterprise") {
  if (!shellEl || !appRoot.contains(shellEl) || currentVariant !== variant) {
    if (offClick) { offClick(); offClick = null; }
    stopDeadlineTimer();
    appRoot.innerHTML = "";
    shellEl = buildShell(variant);
    currentVariant = variant;
    appRoot.appendChild(shellEl);
    if (variant !== "admin") { renderDeadline(); deadlineTimer = setInterval(renderDeadline, 60000); }
  }
  return qs(shellEl, ".shell__main");
}

export function unmountShell() {
  if (offClick) {
    offClick();
    offClick = null;
  }
  stopDeadlineTimer();
  shellEl = null;
  currentVariant = null;
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
