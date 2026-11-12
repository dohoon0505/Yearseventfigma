/* ============================================================
   site-info-ui.js — '사이트 정보' 칸(시안 'K-01 사이트 아래 사업자 정보' 2026-11-11 · 명세 2.5 · 6.10).

   두 자리, 한 데이터(data/site-info.js):
   - **로그인 · 가입 화면** — 오른쪽 칸 맨 아래 `<footer aria-label="사이트 정보">`. 늘 펼쳐 둔다(첫 화면에 '알아보기 쉽게' —
     전자상거래법 시행규칙 제7조). 윗줄 링크 둘('개인정보 처리방침' 을 맨 앞에 굵게 — 표준 개인정보 보호지침 제20조 ①
     '다른 고지와 구분'), 아래 사업자 정보 8항목, '사업자정보 확인'(공정위 링크)은 사업자등록번호 바로 옆.
     페이지는 `siteFooter()` 를 템플릿에 넣고 `bindSiteFooter(root)` 로 값을 채운다(돌려주는 함수가 cleanup).
   - **포털 왼쪽 메뉴 맨 아래**(로그아웃 아래 · 관리자 셸에는 없다) — '서비스 운영사 · {상호}' 버튼 + 링크 둘. 버튼을 누르면
     메뉴 옆에 사업자 정보 판이 뜬다(role="dialog" aria-modal="false"). 본문 칸 크기는 그대로다(고정 배치 화면이 안 바뀐다).
     shell.js 가 `mountSiteSection(sidebar)` 를 부른다.

   값이 빈 항목은 줄째 뺀다 · 못 읽으면 링크 둘 + 고객센터 줄(앱 안의 상수 CS_PHONE · CS_HOURS)과 '다시 불러오기' ·
   읽는 동안 0.3초가 지나면 같은 높이의 뼈대(그 안에 오면 뼈대 없이 바로).

   '이용약관' · '개인정보 처리방침' 링크는 약관·처리방침 읽는 공개 화면(#/legal/terms · #/legal/privacy — pages/legal.js · 시안 K-03)을
   **새 창**으로 연다(`<a target="_blank">` + aria-label '… (새 창)' — 시안 K-01). 2026-11-12 K-03 이 들어오기 전에는 '서비스를 여는 날
   게시합니다' 안내만 띄우는 `<button>` 이었다 — 그 안내는 지웠다(되살리지 말 것).
   ⚠️ 포털 칸의 두 링크만 `rel="opener"` 다 — 데모의 로그인은 sessionStorage 라서, 크롬은 opener 없이 연 새 창에 그 값을 넘기지 않는다
   (그러면 포털에서 연 읽는 화면이 '로그인' 만 보이고 시안의 '회사 배지 + 포털로 돌아가기' 가 서지 않는다). 같은 사이트의 우리 화면이라
   opener 를 넘겨도 다른 사이트가 이 창을 건드릴 길은 없다. 로그인 · 가입 칸은 아직 로그인 전이라 시안대로 `rel="noopener"`.
   ============================================================ */
import { html, setHTML, on, qs, el } from "../dom.js";
import { icon } from "../icons.js";
import { CS_PHONE, CS_HOURS } from "../data/contact.js";
import { siteInfoRows, ftcUrl, peekSiteInfo, loadSiteInfo } from "../data/site-info.js";

const SKELETON_AFTER = 300; // ms — 이보다 빨리 오면 뼈대 없이 바로 그린다(시안)
const FTC_LABEL = "사업자정보 확인 — 공정거래위원회 누리집 (새 창)";

const ext = () => icon("external-link", { size: 10, cls: "site-ext" });

/** 링크 둘 — 처리방침을 맨 앞에 굵게(시안). 로그인·가입 칸과 포털 칸이 같은 조각을 쓴다(rel 만 다르다 — 머리 주석). */
const docLinks = (rel = "noopener") => html`
  <a class="site-doc site-doc--privacy" href="#/legal/privacy" target="_blank" rel="${rel}" aria-label="개인정보 처리방침 (새 창)">개인정보 처리방침${ext()}</a>
  <a class="site-doc" href="#/legal/terms" target="_blank" rel="${rel}" aria-label="이용약관 (새 창)">이용약관${ext()}</a>`;

const ftcLink = (url, cls) => html`<a class="${cls}" href="${url}" target="_blank" rel="noopener" aria-label="${FTC_LABEL}">사업자정보 확인${ext()}</a>`;

/* ── 로그인 · 가입 화면 아래 칸 ───────────────────────────── */

/** 템플릿 조각 — 오른쪽 칸(.auth__panel-inner) 맨 끝에 둔다. */
export const siteFooter = () => html`
  <footer class="site-foot" aria-label="사이트 정보" tabindex="-1" data-site-foot>
    <div class="site-foot__links">${docLinks()}</div>
    <div class="site-foot__info" data-slot="site-info" hidden></div>
  </footer>`;

const footDl = (info) => html`
  <dl class="site-foot__dl">${siteInfoRows(info).map((r) => {
    const url = r.ftc ? ftcUrl(r.value) : "";
    return html`
      <div class="site-foot__item${r.wrap ? " site-foot__item--wrap" : ""}">
        <dt>${r.label}</dt><dd>${r.value}</dd>${r.extraValue ? html`<dd class="site-foot__extra">${r.extraValue}</dd>` : ""}${url ? html`<dd class="site-foot__ftc">${ftcLink(url, "site-ftc")}</dd>` : ""}
      </div>`;
  })}</dl>`;

const footFail = () => html`
  <div class="site-foot__fail" role="status">
    <p>사업자 정보를 잠시 불러오지 못했습니다. <button type="button" class="site-foot__retry" data-si-retry>다시 불러오기</button></p>
    <p class="site-foot__cs">고객센터 ${CS_PHONE} · ${CS_HOURS}</p>
  </div>`;

const footSkeleton = () => html`
  <div class="site-foot__skel" role="status" aria-busy="true">
    <span class="sr-only">사업자 정보를 불러오는 중</span>
    <span class="site-foot__bar site-foot__bar--1"></span>
    <span class="site-foot__bar site-foot__bar--2"></span>
    <span class="site-foot__bar site-foot__bar--3"></span>
  </div>`;

/** `siteFooter()` 를 그린 root 에 값을 채운다. 돌려주는 함수가 cleanup. */
export function bindSiteFooter(root) {
  const foot = qs(root, "[data-site-foot]");
  if (!foot) return () => {};
  const slot = qs(foot, "[data-slot='site-info']");
  let alive = true;
  let skel = null;
  let seq = 0;           // 늦게 온 옛 응답이 새 응답을 덮지 않게
  let refocus = false;   // '다시 불러오기' 를 눌러 그 버튼이 사라질 때만 초점을 옮겨 준다

  const lost = () => !foot.contains(document.activeElement) || document.activeElement === foot;
  const put = (body, kind) => {
    slot.hidden = !body;
    setHTML(slot, body || html``);
    if (!refocus) return;
    /* 다시 불러오기로 누른 버튼이 다시 그리며 떨어졌다 — 초점을 잃었을 때만 그 자리 가까운 조작으로(없으면 칸 자체에 붙잡는다). */
    if (!lost()) { refocus = false; return; }
    const next = kind === "fail" ? qs(slot, "[data-si-retry]") : kind === "ok" ? qs(slot, ".site-ftc") || qs(foot, ".site-doc") : null;
    (next || foot).focus({ preventScroll: true });
    if (kind !== "busy") refocus = false;
  };

  function load(fresh) {
    const now = !fresh && peekSiteInfo();
    if (now) { put(siteInfoRows(now).length ? footDl(now) : footFail(), siteInfoRows(now).length ? "ok" : "fail"); return; }
    const my = ++seq;
    clearTimeout(skel);
    if (fresh) put(footSkeleton(), "busy"); // 사람이 누른 다시 불러오기는 곧바로 '읽는 중' 을 보인다(버튼이 무반응으로 남지 않게)
    else skel = setTimeout(() => { if (alive && my === seq) put(footSkeleton(), "busy"); }, SKELETON_AFTER);
    loadSiteInfo({ fresh }).then(
      (info) => {
        if (!alive || my !== seq) return;
        clearTimeout(skel);
        const ok = siteInfoRows(info).length > 0;
        put(ok ? footDl(info) : footFail(), ok ? "ok" : "fail");
      },
      () => {
        if (!alive || my !== seq) return;
        clearTimeout(skel);
        put(footFail(), "fail");
      },
    );
  }

  const offRetry = on(foot, "click", "[data-si-retry]", () => { refocus = true; load(true); });
  load(false);

  return () => {
    alive = false;
    clearTimeout(skel);
    offRetry();
  };
}

/* ── 포털 왼쪽 메뉴 아래 칸 + 사업자 정보 판 ─────────────────── */

const popBody = (info) => {
  const rows = siteInfoRows(info).filter((r) => r.key !== "company"); // 상호는 판 제목이다
  const url = ftcUrl(info.bizNumber);
  return html`
    <div class="site-pop__hd">
      <div class="site-pop__id">
        <p class="site-pop__eyebrow">서비스 운영사</p>
        <h2 class="site-pop__title" id="site-pop-title" tabindex="-1">${info.company || "사업자 정보"}</h2>
        <p class="site-pop__desc">올해의경조사를 운영하는 회사입니다.</p>
      </div>
      <button type="button" class="site-pop__x" aria-label="닫기" data-si-close>${icon("x", { size: 13 })}</button>
    </div>
    <dl class="site-pop__dl">${rows.map((r) => html`
      <div class="site-pop__row"><dt>${r.label}</dt><dd>${r.value}${r.extraValue ? html`<span class="site-pop__extra">${r.extraValue}</span>` : ""}</dd></div>`)}</dl>
    ${url ? html`<div class="site-pop__ft">${ftcLink(url, "site-pop__ftc")}<span class="site-pop__cap">공정거래위원회 누리집 · 새 창</span></div>` : ""}`;
};

const opButton = (info) => html`
  <button type="button" class="site-op" aria-expanded="false" aria-haspopup="dialog" aria-controls="site-pop" data-si-op>
    <span class="site-op__txt"><span class="site-op__k">서비스 운영사</span><span class="site-op__v">${info.company || "사업자 정보"}</span></span>
    <span class="site-op__more">사업자 정보${icon("chevron-right", { size: 12 })}</span>
  </button>
  <div class="site-pop" id="site-pop" role="dialog" aria-modal="false" aria-labelledby="site-pop-title" tabindex="-1" hidden></div>`;

/** 포털 셸 사이드바 맨 끝에 칸을 붙인다(로그아웃 아래). 돌려주는 함수가 cleanup(셸을 다시 짓거나 내릴 때). */
export function mountSiteSection(sidebar) {
  const sec = el(html`
    <section class="site-sec" aria-label="사이트 정보">
      <div class="site-sec__op" data-slot="site-op" hidden></div>
      <div class="site-sec__links">${docLinks("opener")}</div>
    </section>`);
  sidebar.appendChild(sec);
  const opSlot = qs(sec, "[data-slot='site-op']");
  let alive = true;

  const btn = () => qs(opSlot, "[data-si-op]");
  const pop = () => qs(opSlot, ".site-pop");
  const isOpen = () => { const p = pop(); return !!p && !p.hidden; };

  function fill(info) {
    if (!alive) return;
    const ok = !!info && siteInfoRows(info).length > 0;
    opSlot.hidden = !ok;
    setHTML(opSlot, ok ? opButton(info) : html``);
  }
  /* 판을 닫는다. Esc · ✕ 는 버튼으로 초점을 돌려준다. 바깥 누름은 누른 곳에 초점을 둔다(판 안에 있던 초점만 버튼으로). */
  function close(toButton) {
    const p = pop(), b = btn();
    if (!p || p.hidden) return;
    const wasInside = p.contains(document.activeElement);
    p.hidden = true;
    setHTML(p, html``);
    if (b) b.setAttribute("aria-expanded", "false");
    if (b && (toButton || wasInside)) b.focus({ preventScroll: true });
  }
  function open() {
    const info = peekSiteInfo();
    const p = pop(), b = btn();
    if (!info || !p || !b) return;
    setHTML(p, popBody(info));
    p.hidden = false;
    b.setAttribute("aria-expanded", "true");
    const t = qs(p, "#site-pop-title");
    if (t) t.focus({ preventScroll: true });
  }

  const offOp = on(sec, "click", "[data-si-op]", () => (isOpen() ? close(true) : open()));
  const offX = on(sec, "click", "[data-si-close]", () => close(true));
  /* 바깥 누름 — 누르는 순간(pointerdown)에 닫는다. 누른 곳의 클릭은 그대로 간다. */
  const onDown = (e) => {
    if (!isOpen()) return;
    const p = pop(), b = btn();
    if ((p && p.contains(e.target)) || (b && b.contains(e.target))) return;
    close(false);
  };
  /* Esc — 초점이 판이나 버튼에 있을 때만(다른 곳의 Esc 는 그 자리 몫이다 · 열린 모달의 Esc 는 openModal 이 먼저 받는다). */
  const onKey = (e) => {
    if (e.key !== "Escape" || !isOpen()) return;
    const p = pop(), b = btn();
    const a = document.activeElement;
    if (!((p && p.contains(a)) || (b && b === a))) return;
    e.preventDefault();
    close(true);
  };
  /* 초점이 판·버튼 밖으로 나가면 닫는다(키보드로 지나가며 판이 본문을 덮은 채 남지 않게). 창 자체가 초점을 잃은 때(Alt+Tab)는 그대로. */
  const onOut = (e) => {
    if (!isOpen() || !document.hasFocus()) return;
    const to = e.relatedTarget;
    const p = pop(), b = btn();
    if (to && ((p && p.contains(to)) || (b && b === to))) return;
    if (!to) return; // 초점이 body 로 떨어진 경우는 바깥 누름(pointerdown)이 이미 정리했다
    close(false);
  };
  const onHash = () => close(false); // 화면을 옮기면 닫는다(셸은 화면 사이에 남는다)
  document.addEventListener("pointerdown", onDown, true);
  document.addEventListener("keydown", onKey);
  sec.addEventListener("focusout", onOut);
  window.addEventListener("hashchange", onHash);

  const now = peekSiteInfo();
  if (now) fill(now);
  else loadSiteInfo().then(fill, () => fill(null)); // 못 읽으면 버튼 없이 링크 둘만(다음에 셸을 지을 때 다시 읽는다)

  return () => {
    alive = false;
    offOp(); offX();
    document.removeEventListener("pointerdown", onDown, true);
    document.removeEventListener("keydown", onKey);
    sec.removeEventListener("focusout", onOut);
    window.removeEventListener("hashchange", onHash);
    sec.remove();
  };
}
