/* ============================================================
   legal.js — 이용약관 · 개인정보 처리방침을 읽는 공개 화면 (#/legal/terms · #/legal/privacy · 시안 'K-03 약관 전문 · 동의 창' 2026-11-11).

   로그인 셸 밖이고 역할 없이 열린다(router.js — requiresAuth 없음). 사이트 아래 칸(로그인·가입) · 포털 메뉴 아래 칸 · 동의 창의
   '개인정보 처리방침' 링크가 새 창으로 연다(util/site-info-ui.js · util/terms-dialog.js).
   - 위쪽: 로고 · '이용약관 | 개인정보 처리방침' 전환(주소가 따로라 링크다 — 시안은 탭 모양) · 오른쪽에 로그인한 거래처는 회사 배지 +
     '포털로 돌아가기', 로그인하지 않은 사람은 '로그인'(시안). 관리자가 포털을 보다 연 창도 거래처와 같다(배지는 셸과 같은 currentClientName).
   - 지난 판 · 시행 예정 판을 볼 때만 위쪽에 한 줄 바(회색 '지난 판입니다' · 파란 표 '아직 시행 전인 판입니다' — 둘 다 '지금 판 보기').
   - 왼쪽 '차례'는 늘 붙어 있고(sticky) 따로 굴러간다. 읽는 조를 칠하고(aria-current="location"), 굵게 보일 내용이 있는 조에 점을 찍는다.
     조를 누르면 그 조로 굴리고 조 제목(h3 · tabindex=-1)에 초점을 옮기며, 제목 옆 '차례로' 가 차례의 그 줄로 돌려보낸다.
   - 본문 맨 위: 미리 알릴 변경이 있을 때만 호박색 미리 알림 카드(util/legal-doc.js legalNotice — 지금은 없다).
   - 맨 아래: '판 … (이 글을 게시한 날) · 시행일 … (부칙 제1조)' 와 '이전 판'(지금은 '처음 게시한 판이라 이전 판이 없습니다.').
   본문 조각 · 판 · 알림 문장은 util/legal-doc.js 하나 — 동의 창과 같은 글이다. 휴대폰 폭은 시안에 없어 한 칸으로 쌓는다(legal.css).
   ============================================================ */
import { html, setHTML, on, qs, qsa } from "../dom.js";
import { icon } from "../icons.js";
import { getRole, setFocusSection, takeFocusSection } from "../session.js";
import { currentClientName } from "../util/client.js";
import { peekSiteInfo, loadSiteInfo } from "../data/site-info.js";
import { docBody, applyCompany, tocRows, legalEditions, legalNotice, editionBar, footText, backLink, NO_PAST } from "../util/legal-doc.js";

const META = {
  terms: {
    title: "이용약관",
    hash: "#/legal/terms",
    intro: "올해의경조사를 쓰는 기업·단체 거래처에 적용하는 약관입니다. 중요한 내용은 굵은 글씨와 ‘중요 ①~⑦’ 표로 따로 표시했습니다.",
  },
  privacy: {
    title: "개인정보 처리방침",
    hash: "#/legal/privacy",
    intro: "회사가 어떤 개인정보를 왜 쓰고, 얼마나 두고, 어떻게 지키는지 알립니다.",
  },
};
const SPY_LINE = 96; // 굴림 칸 위에서 이만큼 안으로 들어온 마지막 덩어리가 '읽는 조'
const JUMP_GAP = 32; // 차례로 옮긴 조 상자가 서는 자리 — 굴림 칸 위에서 32px(시안 '중간' 프레임 넷이 모두 이 자리 · 검증 1)

/** 머리의 문서 전환 링크 · 미리 알림의 다른 글 링크를 키보드로 눌러 다른 글을 열었을 때 — 새로 그린 화면에서 초점을 돌려줄 자리
 *  ("switch" | "title"). 라우터가 이 모듈을 다시 마운트해 누른 링크가 사라지며 초점이 body 로 빠졌다(검증 2). 모듈 변수라 다시
 *  마운트해도 남고, mount 가 꺼내면 지운다. */
let pendingFocus = null;

export function mount(root, { nav }) {
  const kind = location.hash === "#/legal/privacy" ? "privacy" : "terms";
  const M = META[kind];
  const prevTitle = document.title;
  document.title = `${M.title} — 올해의경조사`;
  const role = getRole();
  let info = peekSiteInfo();
  const state = { view: "current", pastVer: null, prevOpen: false, active: null };

  setHTML(root, html`
    <div class="lg" data-kind="${kind}">
      <header class="lg-hd">
        <img class="lg-hd__logo" src="./assets/logo.png" alt="올해의경조사" />
        <span class="lg-hd__sep" aria-hidden="true"></span>
        <nav class="lg-switch" aria-label="문서">
          <a class="lg-switch__a" href="${META.terms.hash}" aria-current="${kind === "terms" ? "page" : "false"}">이용약관</a>
          <a class="lg-switch__a" href="${META.privacy.hash}" aria-current="${kind === "privacy" ? "page" : "false"}">개인정보 처리방침</a>
        </nav>
        <div class="lg-hd__r">
          ${role
            ? html`
              <div class="badge badge--company"><img src="./assets/company.png" alt="" /><span>${currentClientName() || "거래처 미지정"}</span></div>
              <a class="lg-btn lg-btn--dark" href="#/app">${icon("arrow-left", { size: 14 })}포털로 돌아가기</a>`
            : html`<a class="lg-btn lg-btn--line" href="#/login">로그인</a>`}
        </div>
      </header>
      <div class="lg-barslot" data-slot="bar" role="status" hidden></div>
      <div class="lg-scroll" data-scroll>
        <div class="lg-grid">
          <nav class="lg-toc" aria-label="차례">
            <div class="lg-toc__hd">
              <b class="lg-toc__t">차례</b>
              <span class="lg-toc__leg"><span class="lg-toc__dot" aria-hidden="true"></span>굵게 보일 중요 내용이 있는 조</span>
            </div>
            <div class="lg-toc__list" data-slot="toc"></div>
          </nav>
          <main class="lg-doc" data-slot="doc"></main>
        </div>
      </div>
    </div>`);

  const page = qs(root, ".lg");
  const barSlot = qs(root, "[data-slot='bar']");
  const tocSlot = qs(root, "[data-slot='toc']");
  const docSlot = qs(root, "[data-slot='doc']");
  const scroller = qs(root, "[data-scroll]");

  /** 지금 보는 판 — { view, ver, doc, effective, from?, to? } */
  function edition() {
    const E = legalEditions(kind);
    if (state.view === "next" && E.next) return { view: "next", ver: E.next.ver, doc: E.next.doc, effective: E.next.effective };
    if (state.view === "past") {
      const p = (E.past || []).find((x) => x.ver === state.pastVer);
      if (p) return { view: "past", ver: p.ver, doc: p.doc, from: p.from, to: p.to, effective: p.doc.effective };
    }
    return { view: "current", ver: E.current.ver, doc: E.current.doc, effective: E.current.doc.effective };
  }

  const hashOf = (k) => META[k].hash;
  const noticeHtml = (n) => html`
    <section class="lg-note" aria-label="${n.title}">
      <p class="lg-note__eb">미리 알림 · ${n.when}</p>
      <p class="lg-note__t">${n.title}</p>
      <ul class="lg-note__list">${n.items.map((x) => html`<li>${x}</li>`)}</ul>
      <p class="lg-note__consent">${n.consent}</p>
      <div class="lg-note__links">${n.links.map((l) => html`
        <a class="lg-note__a" href="${hashOf(l.kind)}" data-note-to="${l.to}" data-note-kind="${l.kind}" aria-current="${l.cur ? "page" : "false"}">${l.label}</a>`)}</div>
    </section>`;

  const footHtml = (ed) => {
    const past = (legalEditions(kind).past || []).filter((p) => !(ed.view === "past" && p.ver === ed.ver));
    return html`
      <div class="lg-foot">
        <div class="lg-foot__row">
          <p class="lg-foot__txt">${footText(kind, ed)}</p>
          <button type="button" class="lg-foot__prev" aria-expanded="${state.prevOpen ? "true" : "false"}" aria-controls="lg-prev" data-action="prev">이전 판<span class="lg-foot__chev" data-slot="chev">${icon(state.prevOpen ? "chevron-up" : "chevron-down", { size: 12 })}</span></button>
        </div>
        <div class="lg-foot__panel" id="lg-prev" ${state.prevOpen ? "" : "hidden"}>
          ${past.length
            ? html`<div class="lg-foot__list">${past.map((v) => html`
                <a class="lg-foot__ver" href="${M.hash}" data-ver="${v.ver}"><b>판 ${v.ver}</b><span class="lg-foot__range">${v.from} ~ ${v.to} 적용</span><span class="lg-foot__go">이 판 보기${icon("chevron-right", { size: 12 })}</span></a>`)}</div>`
            : html`<p class="lg-foot__none">${NO_PAST[kind]}</p>`}
        </div>
      </div>`;
  };

  function renderBar() {
    const b = editionBar(edition());
    barSlot.hidden = !b;
    page.classList.toggle("has-bar", !!b);
    setHTML(barSlot, b
      ? html`
        <div class="lg-bar lg-bar--${b.kind}">
          ${b.kind === "upcoming" ? html`<span class="lg-bar__tag">시행 예정</span><b>아직 시행 전인 판입니다</b>` : html`<b>지난 판입니다</b>`}
          <span class="lg-bar__sub">— ${b.text}</span>
          <a class="lg-bar__now" href="${M.hash}" data-action="now">지금 판 보기</a>
        </div>`
      : html``);
  }
  function renderToc() {
    setHTML(tocSlot, tocRows(kind, edition().doc).map((r) => (r.chapter
      ? html`<p class="lg-toc__ch">${r.label}</p>`
      : html`<a class="lg-toc__a${r.imp ? " is-imp" : ""}${r.deleted ? " is-del" : ""}" href="${M.hash}" data-toc="${r.key}" aria-current="false">${r.label}${r.imp ? html`<span class="sr-only"> · 중요 내용 있음</span>` : ""}</a>`)));
    state.active = null;
  }
  function renderDoc() {
    const ed = edition();
    const notice = ed.view === "current" ? legalNotice(kind) : null;
    setHTML(docSlot, html`
      ${notice ? noticeHtml(notice) : ""}
      <h1 class="lg-doc__t" tabindex="-1">${M.title}</h1>
      <p class="lg-doc__intro">${M.intro}</p>
      <div class="lgd">${docBody(kind, ed.doc, { info, back: true })}</div>
      ${footHtml(ed)}`);
  }

  /* ── 회사 정보 자리표시 — 늦게 오면 그 글자만(util/legal-doc.js applyCompany) ── */
  const fillLate = () => { if (info) applyCompany(docSlot, info); };

  /* ── 읽는 조 따라가기 ───────────────────────────────────── */
  const relTop = (el) => el.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
  /* 칠한 줄이 차례 칸 밖이면 그 줄이 보이게 굴린다 — 약관은 그 장 머리 줄을, 처리방침은 네 줄 위를 맨 위에(시안) */
  function keepVisible(a) {
    const L = tocSlot;
    const lt = L.getBoundingClientRect().top;
    const r = a.getBoundingClientRect();
    if (r.top >= lt && r.bottom <= lt + L.clientHeight) return;
    let anchor = a;
    if (kind === "terms") {
      let p = a.previousElementSibling;
      while (p && !p.classList.contains("lg-toc__ch")) p = p.previousElementSibling;
      if (p) anchor = p;
    } else {
      for (let i = 0; i < 4 && anchor.previousElementSibling; i++) anchor = anchor.previousElementSibling;
    }
    /* 맨 위에 둘 줄 위로 목록 안쪽 여백(6px)과 그 줄의 바깥 여백만큼 띄운다 — 첫 줄이면 0(시안은 그 줄부터 그린다) */
    const lead = parseFloat(getComputedStyle(L).paddingTop) + parseFloat(getComputedStyle(anchor).marginTop);
    let to = L.scrollTop + (anchor.getBoundingClientRect().top - lt) - lead;
    const bottom = L.scrollTop + (r.bottom - lt);
    if (bottom - to > L.clientHeight - 8) to = bottom - L.clientHeight + 8;
    L.scrollTop = Math.max(0, to);
  }
  function setActive(key, keep = true) {
    if (state.active === key) return;
    state.active = key;
    let cur = null;
    qsa(tocSlot, "[data-toc]").forEach((a) => {
      const on = a.dataset.toc === key;
      a.classList.toggle("is-cur", on);
      a.setAttribute("aria-current", on ? "location" : "false");
      if (on) cur = a;
    });
    if (cur && keep) keepVisible(cur);
  }
  function spy(keep = true) {
    let key = null;
    for (const b of qsa(docSlot, "[data-anchor]")) {
      if (relTop(b) <= SPY_LINE) key = b.dataset.anchor.slice(kind.length + 1);
      else break;
    }
    if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) key = "buchik";
    setActive(key || "1", keep);
  }
  let raf = 0;
  let quietSpy = false; // 우리가 바깥 칸을 굴린 한 번은 차례 칸을 다시 굴리지 않는다('차례로' — 아래)
  const onScroll = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; spy(!quietSpy); quietSpy = false; }); };
  scroller.addEventListener("scroll", onScroll, { passive: true });

  /* ── 차례로 옮기기 ─────────────────────────────────────── */
  function jumpTo(key) {
    const el = qs(docSlot, `[data-anchor="${kind}-${key}"]`);
    if (!el) return;
    scroller.scrollTop = Math.max(0, scroller.scrollTop + relTop(el) - JUMP_GAP);
    qsa(docSlot, "[data-slot='back']").forEach((s) => setHTML(s, html``));
    const slot = qs(el, "[data-slot='back']");
    if (slot) setHTML(slot, backLink());
    const h = qs(el, ".lgd-art__h, .lgd-bu__h") || el;
    h.focus({ preventScroll: true });
    setActive(key);
  }
  const plainClick = (e) => !(e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey);
  const offToc = on(tocSlot, "click", "[data-toc]", (e, t) => {
    if (!plainClick(e)) return;
    e.preventDefault();
    jumpTo(t.dataset.toc);
  });
  const offBack = on(docSlot, "click", "[data-action='toc-back']", (e, t) => {
    e.preventDefault();
    const art = t.closest("[data-anchor]");
    const key = art ? art.dataset.anchor.slice(kind.length + 1) : state.active;
    const a = qs(tocSlot, `[data-toc="${key}"]`);
    if (!a) return;
    keepVisible(a);
    /* 좁은 화면은 차례가 붙어 있지 않고 글 위에 쌓인다 — 그 줄이 굴림 칸 밖이면 바깥 칸도 굴린다(넓은 화면은 늘 보여 그대로 · 검증 2) */
    /* 그 굴림이 부른 '읽는 조 따라가기' 는 차례 칸을 1조로 되돌려 방금 보인 줄을 다시 감췄다 — 그 한 번은 칠하기만 한다. */
    const sr = scroller.getBoundingClientRect();
    const ar = a.getBoundingClientRect();
    if (ar.top < sr.top || ar.bottom > sr.bottom) {
      const to = Math.max(0, scroller.scrollTop + ar.top - sr.top - 16);
      if (Math.round(to) !== Math.round(scroller.scrollTop)) { quietSpy = true; scroller.scrollTop = to; }
    }
    a.focus({ preventScroll: true });
  });

  /* ── 판 바꾸기 · 이전 판 · 미리 알림 ───────────────────── */
  function setView(view, ver = null) {
    state.view = view;
    state.pastVer = ver;
    state.prevOpen = false;
    renderBar();
    renderToc();
    renderDoc();
    scroller.scrollTop = 0;
    tocSlot.scrollTop = 0;
    spy();
    const h = qs(docSlot, ".lg-doc__t");
    if (h) h.focus({ preventScroll: true });
  }
  /* 누른 채 둔 Enter 의 자동 반복은 버린다 — 반복마다 펼침·접힘이 뒤집혔다(검증 2 · 떼었다 누르면 그대로) */
  const offPrevKey = on(docSlot, "keydown", "[data-action='prev']", (e) => { if (e.repeat && e.key === "Enter") e.preventDefault(); });
  const offPrev = on(docSlot, "click", "[data-action='prev']", (e, t) => {
    state.prevOpen = !state.prevOpen;
    t.setAttribute("aria-expanded", state.prevOpen ? "true" : "false");
    setHTML(qs(t, "[data-slot='chev']"), icon(state.prevOpen ? "chevron-up" : "chevron-down", { size: 12 }));
    const panel = qs(docSlot, "#lg-prev");
    if (panel) panel.hidden = !state.prevOpen;
    /* 펼친 목록이 화면 밖이면 보이게 — 이 칸이 글의 맨 끝이라 끝까지 굴린다(카드 밑 여백까지 보인다) */
    if (state.prevOpen && panel && docSlot.getBoundingClientRect().bottom > scroller.getBoundingClientRect().bottom) {
      scroller.scrollTop = scroller.scrollHeight;
    }
  });
  const offVer = on(docSlot, "click", "[data-ver]", (e, t) => { if (!plainClick(e)) return; e.preventDefault(); setView("past", t.dataset.ver); });
  const offNow = on(barSlot, "click", "[data-action='now']", (e) => { if (!plainClick(e)) return; e.preventDefault(); setView("current"); });
  const offNote = on(docSlot, "click", "[data-note-to]", (e, t) => {
    if (!plainClick(e)) return;
    e.preventDefault();
    const to = t.dataset.noteTo;
    const k = t.dataset.noteKind;
    if (k !== kind) {
      /* 다른 글의 바뀐 판 — 그 주소로 옮기며 '바뀐 판을 열어라' 를 한 번 넘긴다(라우터가 쿼리를 모른다) */
      if (to === "next") setFocusSection("legal", "next");
      if (e.detail === 0) pendingFocus = "title"; // 키보드로 눌렀으면 새 화면의 제목에 초점(같은 글 안에서 판을 바꿀 때와 같다)
      nav(hashOf(k));
      return;
    }
    if (to === "next") setView("next");
    else setView("current");
  });

  /* 머리의 문서 전환 — 지금 글이 아닌 링크를 그냥 누르면(새 창·새 탭으로 여는 누름은 빼고) 다음 화면이 그 링크로 초점을 돌려준다 */
  const offSwitch = on(page, "click", ".lg-switch__a", (e, t) => {
    /* 키보드로 누른 때만(e.detail 0 — Enter) — 마우스로 누른 뒤 스크립트가 초점을 주면 크롬이 링을 그려 누른 적 없는 테두리가 섰다 */
    if (plainClick(e) && e.detail === 0 && t.getAttribute("aria-current") !== "page") pendingFocus = "switch";
  });

  /* 키보드로 굴리기 — 글은 안쪽 칸(.lg-scroll)이 굴러가서 초점이 body(막 연 창)나 머리(문서 전환 링크 · 로그인)에 있으면
     PageDown · Space · ↑↓ · Home · End 가 아무것도 굴리지 않았다(검증 2). 그때만 그 키를 글 칸에 넘긴다 — 초점을 옮기지 않아
     Tab 순서(머리 → 차례 → 본문)는 그대로다. 차례·본문 안에 초점이 있으면 브라우저 기본 그대로(차례 줄이면 차례 칸이 굴러간다). */
  const STEP = 40;
  const onKey = (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const a = document.activeElement;
    const outside = !a || a === document.body || a === document.documentElement || qs(page, ".lg-hd").contains(a) || barSlot.contains(a);
    if (!outside || document.querySelector(".modal-overlay")) return;
    const page1 = Math.max(STEP, scroller.clientHeight - STEP);
    const by = { PageDown: page1, PageUp: -page1, ArrowDown: STEP, ArrowUp: -STEP, " ": e.shiftKey ? -page1 : page1 }[e.key];
    if (e.key === "Home" || e.key === "End") scroller.scrollTop = e.key === "Home" ? 0 : scroller.scrollHeight;
    else if (by) scroller.scrollBy({ top: by });
    else return;
    e.preventDefault();
  };
  document.addEventListener("keydown", onKey);

  /* 다른 글에서 넘겨받은 '바뀐 판 보기' */
  const ask = takeFocusSection("legal");
  if (ask === "next" && legalEditions(kind).next) state.view = "next";

  renderBar();
  renderToc();
  renderDoc();
  spy();

  /* 문서 전환 링크로 왔으면 새 화면의 지금 글 링크에(다음 Tab · Shift+Tab 이 같은 자리에서 이어진다), 미리 알림의 다른 글
     링크로 왔으면 제목에 초점을 둔다 */
  const want = pendingFocus;
  pendingFocus = null;
  const back = want === "switch" ? qs(page, ".lg-switch__a[aria-current='page']") : want === "title" ? qs(docSlot, ".lg-doc__t") : null;
  if (back) back.focus({ preventScroll: true });

  /* 회사 정보 자리표시 — 사이트 정보 칸과 같은 출처. 아직 못 읽었으면 읽은 뒤 **그 글자만** 바꾼다(본문을 다시 그리면 초점이
     body 로 빠지고 '차례로' 도 사라졌다 — 검증 2 · 굴린 자리·초점·펼친 '이전 판' 그대로). */
  let alive = true;
  if (!info) {
    loadSiteInfo().then((v) => {
      if (!alive) return;
      info = v;
      fillLate();
    }, () => {});
  }

  return () => {
    alive = false;
    scroller.removeEventListener("scroll", onScroll);
    cancelAnimationFrame(raf);
    offToc(); offBack(); offPrevKey(); offPrev(); offVer(); offNow(); offNote(); offSwitch();
    document.removeEventListener("keydown", onKey);
    document.title = prevTitle;
  };
}
