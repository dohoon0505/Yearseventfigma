/* ============================================================
   admin-pricing.js — 기업별 상품단가 v2

   거래처별 단가 오버라이드. 저장하면 `store.clientPrices` 에 영속되고
   두 곳이 읽는다 — 거래처 포털의 '상품 규격 안내'(products.js)와
   주문서의 적용 단가(admin-orders.js `priceFor`). 비우면 카탈로그 정가.

   v1 과 달라진 것(시안 v2):
   · 거래처를 `<select>` 가 아니라 **좌측 목록 pane** 에서 고른다. 19곳을
     한눈에 훑으며 "어디에 단가가 걸려 있나"를 보는 것이 이 화면의 본업이라,
     선택이 접혀 있으면 그 정보가 통째로 사라진다. 목록은 검색으로 좁힌다.
   · 상품은 탭이 아니라 **카테고리 아코디언**. 탭은 한 번에 한 분류만 보여
     "경조화환만 맞춤"인지 "전 분류 맞춤"인지 비교가 안 된다.
   · **저장 전 변경 패널** — 무엇이 얼마에서 얼마로 바뀌는지 저장 전에
     한 줄씩 보여 준다. 단가는 청구 근거라 조용히 저장되면 안 된다.
   · 고정 상품 타일은 제거(시안). 같은 정보가 표에 이미 있다.

   세는 값이 둘이고 의미가 다르다 — 헷갈리면 화면이 거짓말을 한다.
   · **맞춤**   = 정가와 다른 단가가 걸린 상품 수(저장 여부와 무관, 현재 편집 기준)
   · **가격변동** = 저장된 값과 다른 상품 수(= 아직 저장 안 된 편집)
   ============================================================ */
import { html, setHTML, on, qs } from "../dom.js";
import { makeToast } from "../toast.js";
import { icon } from "../icons.js";
import { store, ALL_PRODUCTS, productKey, priceNum, won } from "../store.js";
import { pageTitle } from "../ui.js";
import { sharedBizKeys, displayName } from "../util/biz.js";

/* 분류는 카탈로그에서 파생한다 — 상수로 박아 두면 상품이 늘 때 조용히 빠진다 */
const CATS = [...new Set(ALL_PRODUCTS.map((p) => p.category))];
const BY_KEY = new Map(ALL_PRODUCTS.map((p) => [productKey(p), p]));
const IN_CAT = (c) => ALL_PRODUCTS.filter((p) => p.category === c);

/** 오버라이드 정규화 — 빈칸·0·NaN 은 전부 "정가"(0) 한 값으로 모은다.
 *  이게 없으면 `undefined` 와 `0` 이 다른 값으로 비교돼 변경 없는데 변경으로 잡힌다. */
const norm = (v) => (typeof v === "number" && v > 0 ? v : 0);
const baseOf = (p) => priceNum(p.price);

/** 실효 단가 — 저장 후 **실제로 적용될** 값. 정가와 같은 오버라이드는 '정가'와 같은 상태다.
 *  맞춤 개수와 가격변동이 서로 다른 정의를 쓰면 "맞춤 0 인데 변경 1건"처럼 화면이 모순된다. */
const effOf = (p, v) => { const n = norm(v); return n > 0 && n !== baseOf(p) ? n : 0; };

/* 오타 방어 상한 — 카탈로그 최고가가 12만원이라 1,000만원이면 충분히 넉넉하다. */
const MAX_PRICE = 10000000;
/** 입력 원문 → `{ ok, n }`. 숫자·쉼표·공백만 받는다.
 *  ⚠️ 숫자 이외를 **지우면 안 된다**. `replace(/[^0-9]/g,"")` 는 구분자를 없애며
 *  자릿수를 옮긴다 — `12345.67` → 1,234,567(100배), `1e9` → 19, `-1` → 1, `007` → 7.
 *  단가는 청구 근거라 조용히 다른 수가 되는 것이 가장 나쁘다. 그래서 **거부**한다. */
function parseAmount(raw) {
  const t = String(raw == null ? "" : raw).trim();
  if (!t) return { ok: true, n: 0 };
  /* 앞자리 0 도 거부한다 — `007` 이 7원이 되는 건 오타를 값으로 받아들이는 것이다 */
  if (!/^[1-9][0-9,\s]*$/.test(t)) return { ok: false, n: 0 };
  const n = parseInt(t.replace(/[,\s]/g, ""), 10);
  if (!Number.isSafeInteger(n) || n <= 0 || n > MAX_PRICE) return { ok: false, n: 0 };
  return { ok: true, n };
}

export function mount(root, { nav }) {
  const clients = () => store.get().clients;
  const state = {
    clientId: clients()[0] ? clients()[0].id : null,
    q: "",
    closed: new Set(), // 접힌 분류 — 기본은 전부 펼침(비교가 목적이므로)
    /* 거래처별 미저장 편집. 거래처를 옮겨도 버리지 않는다 — 단가를 고치다
       다른 곳을 확인하러 갔다 오는 흐름이 흔한데 그때 편집이 날아가면 최악이다.
       키가 없으면 "편집 없음"(저장값 그대로)을 뜻한다. */
    drafts: Object.create(null),
  };
  const toast = makeToast();

  /* ── 파생 ──────────────────────────────────────────────── */
  const savedOf = (cid) => store.get().clientPrices[cid] || {};
  const mapOf = (cid) => state.drafts[cid] || savedOf(cid);
  const draftFor = (cid) => {
    if (!state.drafts[cid]) state.drafts[cid] = { ...savedOf(cid) };
    return state.drafts[cid];
  };
  const clientOf = (cid) => clients().find((c) => c.id === cid) || null;
  const nameOf = (cid) => {
    const c = clientOf(cid);
    return c ? displayName(c, sharedBizKeys(clients())) : "";
  };

  /** 정가와 다른 단가가 걸린 상품 수(현재 편집 기준) */
  const customCount = (cid) =>
    ALL_PRODUCTS.filter((p) => effOf(p, mapOf(cid)[productKey(p)]) > 0).length;

  /** 저장값과 달라진 키들 — 저장 전 변경 패널의 단일 소스 */
  const changedKeys = (cid) => {
    const d = state.drafts[cid];
    if (!d) return [];
    const s = savedOf(cid);
    const keys = new Set([...Object.keys(s), ...Object.keys(d)]);
    /* 실효값으로 비교한다 — 정가와 같은 값을 적었다 지운 것은 '변동'이 아니다.
       (맞춤 카운트와 같은 정의를 써야 네 숫자가 어긋나지 않는다) */
    return [...keys].filter((k) => {
      const p = BY_KEY.get(k);
      return p && effOf(p, s[k]) !== effOf(p, d[k]);
    });
  };
  const isDirty = (cid) => changedKeys(cid).length > 0;

  const catCustom = (cid, cat) =>
    IN_CAT(cat).filter((p) => effOf(p, mapOf(cid)[productKey(p)]) > 0).length;

  const shownClients = () => {
    const q = state.q.trim().toLowerCase();
    const shared = sharedBizKeys(clients());
    return clients().filter((c) => {
      if (!q) return true;
      return [displayName(c, shared), c.accountId, c.bizNumber]
        .some((s) => String(s || "").toLowerCase().includes(q));
    });
  };

  /* ── 헤더 커버리지 — "이 화면이 전체에서 어디까지 덮였나" ────
     한 거래처만 보고 있으면 19곳 중 몇 곳에 단가가 걸렸는지 알 수 없다. */
  const covBody = () => {
    const cs = clients();
    const n = cs.filter((c) =>
      ALL_PRODUCTS.some((p) => effOf(p, savedOf(c.id)[productKey(p)]) > 0)
    ).length;
    const dirty = cs.filter((c) => isDirty(c.id)).length;
    return html`거래처 <strong>${cs.length}</strong>곳 중 <strong>${n}</strong>곳에 맞춤 단가 ·
      상품 <strong>${ALL_PRODUCTS.length}</strong>종
      ${dirty ? html`<em class="prc-cov__dirty">· 미저장 ${dirty}곳</em>` : ""}`;
  };

  /* ── 좌측 거래처 pane ──────────────────────────────────── */
  const sideBody = () => {
    const rows = shownClients();
    if (!rows.length) return html`<p class="cpick-side__empty">검색 결과가 없습니다.</p>`;
    const shared = sharedBizKeys(clients());
    return html`${rows.map((c) => {
      const n = customCount(c.id);
      return html`<button type="button" class="cpick-cli ${state.clientId === c.id ? "is-on" : ""}"
        data-action="pick" data-cid="${c.id}" aria-pressed="${state.clientId === c.id ? "true" : "false"}">
        <span class="cpick-cli__nm">${displayName(c, shared)}</span>
        ${isDirty(c.id) ? html`<span class="cpick-cli__dot" title="저장하지 않은 변경"></span>` : ""}
        <span class="cpick-cli__cnt ${n ? "is-on" : ""}">${n ? n : "–"}</span>
      </button>`;
    })}`;
  };

  /* ── 상품 행 ───────────────────────────────────────────
     값 칸은 입력 중 재렌더하면 커서가 날아간다 — 배지만 부분 갱신한다. */
  const rowBody = (p) => {
    const key = productKey(p);
    const base = baseOf(p);
    const v = norm(mapOf(state.clientId)[key]);
    const custom = effOf(p, v) > 0;
    return html`
      <div class="prc-row">
        <span class="prc-row__nm" title="${p.product}">${p.product}</span>
        <span class="prc-row__base">${won(base)}</span>
        <span class="prc-in">
          <input type="text" inputmode="numeric" data-pk="${key}" value="${v ? v.toLocaleString("ko-KR") : ""}"
            placeholder="${base.toLocaleString("ko-KR")}" aria-label="${p.product} 적용 단가" />
          <span class="prc-in__won">원</span>
        </span>
        <span class="prc-row__bdg" data-badge="${key}">${badge(custom, v, base)}</span>
      </div>`;
  };
  /* 정가와 같은 값을 손으로 적은 경우는 '맞춤'이 아니다 — 청구액이 같으니
     맞춤으로 세면 '맞춤 3개'인데 정가와 다른 건 2개인 상태가 생긴다. */
  const badge = (custom, v, base) =>
    custom
      ? html`<span class="pill pill--blue">맞춤</span>`
      : v > 0 && v === base
      ? html`<span class="prc-same">정가와 같음</span>`
      : html`<span class="prc-dash">–</span>`;

  /* ── 분류 아코디언 ─────────────────────────────────────── */
  const accBody = () => html`${CATS.map((cat) => {
    const open = !state.closed.has(cat);
    const n = catCustom(state.clientId, cat);
    return html`
      <section class="prc-cat ${open ? "is-open" : ""}" data-cat="${cat}">
        <button type="button" class="prc-cat__hd" data-action="toggle" data-cat="${cat}"
          aria-expanded="${open ? "true" : "false"}">
          ${icon("chevron-down", { size: 15, cls: "prc-cat__chev" })}
          <b class="prc-cat__t">${cat}</b>
          <span class="prc-cat__n">${IN_CAT(cat).length}종</span>
          <span class="prc-cat__cus ${n ? "is-on" : ""}" data-catcnt="${cat}">${n ? `맞춤 ${n}` : ""}</span>
        </button>
        <div class="prc-cat__body">
          <div class="prc-row prc-row--head">
            <span>상세상품</span><span>기본 단가</span><span>적용 단가</span><span>상태</span>
          </div>
          ${IN_CAT(cat).map(rowBody)}
        </div>
      </section>`;
  })}`;

  /* ── 저장 전 변경 패널 ─────────────────────────────────── */
  const pendBody = () => {
    const cid = state.clientId;
    const keys = changedKeys(cid);
    if (!keys.length) return "";
    const s = savedOf(cid);
    const d = state.drafts[cid] || {};
    const label = (n, p) => (n > 0 ? won(n) : `${won(baseOf(p))} (정가)`);
    return html`
      <div class="prc-pend__hd">
        <b class="prc-pend__t">저장 전 변경 ${keys.length}건</b>
        <span class="prc-pend__cap">${nameOf(cid)} · 저장하면 포털 상품 안내와 주문서 적용 단가가 함께 바뀝니다</span>
      </div>
      <ul class="prc-pend__list">
        ${keys.map((k) => {
          const p = BY_KEY.get(k);
          return html`<li class="prc-pend__i">
            <span class="prc-pend__nm">${p.product}</span>
            <span class="prc-pend__from">${label(norm(s[k]), p)}</span>
            ${icon("arrow-right", { size: 13, cls: "prc-pend__ar" })}
            <span class="prc-pend__to">${label(norm(d[k]), p)}</span>
          </li>`;
        })}
      </ul>
      <div class="prc-pend__ft">
        <button type="button" class="btn btn-ghost" data-action="revert">되돌리기</button>
        <button type="button" class="prc-save" data-action="save">${icon("save", { size: 15 })} ${keys.length}건 저장</button>
      </div>`;
  };

  /* ── 셸 ───────────────────────────────────────────────── */
  function render() {
    setHTML(root, html`
      <div class="page-admin page-pricing">
        <div class="admin-inner">
          ${pageTitle({ imgSrc: "./assets/nav-product.png", title: "기업별 상품단가", action: html`<span class="prc-cov" data-slot="cov">${covBody()}</span>` })}
          <div class="cpick-shell">
            <aside class="cpick-side">
              <div class="cpick-side__srch">
                ${icon("search", { size: 13, cls: "cpick-side__ic" })}
                <input type="text" data-ctl="q" value="${state.q}" placeholder="거래처·아이디·사업자번호" aria-label="거래처 검색" />
              </div>
              <div class="cpick-side__list" data-slot="side">${sideBody()}</div>
            </aside>
            <section class="cpick-main">
              <header class="cpick-hd">
                <div class="cpick-hd__l">
                  <b class="cpick-hd__co" data-slot="co">${nameOf(state.clientId) || "거래처를 선택하세요"}</b>
                  <span class="cpick-hd__cap" data-slot="cap">${capBody()}</span>
                </div>
                <button type="button" class="cpick-minibtn" data-action="reset-all">전체 정가로</button>
              </header>
              <div class="prc-acc" data-slot="acc">${accBody()}</div>
            </section>
          </div>
          <p class="prc-foot">${icon("info", { size: 13, cls: "tint-blue" })}
            비워 두면 카탈로그 정가가 적용됩니다. 저장은 지금 보고 있는 거래처에만 반영됩니다.</p>
          ${/* 하단 고정 — 표가 20행이라 패널이 문서 끝에 있으면 저장 버튼이 화면 밖에 남는다 */ ""}
          <div class="prc-pend ${isDirty(state.clientId) ? "is-on" : ""}" data-slot="pend">${pendBody()}</div>
        </div>
      </div>`);
  }
  const capBody = () => {
    const n = customCount(state.clientId);
    return html`맞춤 <strong>${n}</strong>/${ALL_PRODUCTS.length}종`;
  };

  /* ── 부분 갱신 ─────────────────────────────────────────
     입력 중에는 아코디언을 절대 다시 그리지 않는다(포커스·커서 소실). */
  /* ⚠️ `setHTML` 은 Html 인스턴스가 아니면 이스케이프 없이 innerHTML 에 넣는다.
     회사명은 가입 화면의 자유 입력이라 평문을 그대로 넘기면 태그가 실행된다 —
     문자열은 여기서 한 번 감싸 render() 와 같은 경로를 타게 한다. */
  const put = (slot, body) => {
    const e = qs(root, `[data-slot='${slot}']`);
    if (e) setHTML(e, typeof body === "string" ? html`${body}` : body);
  };
  const syncPend = () => {
    put("pend", pendBody());
    const p = qs(root, "[data-slot='pend']");
    if (!p) return;
    const on = isDirty(state.clientId);
    const was = p.classList.contains("is-on");
    p.classList.toggle("is-on", on);
    /* 패널은 하단 고정이라 본문 위에 뜬다 — 그만큼 아래에 자리를 비워 두지 않으면
       **지금 입력 중인 칸**이 덮인다(문서 끝 행에서 첫 타건에 바로 일어난다). */
    const inner = qs(root, ".admin-inner");
    if (inner) inner.style.setProperty("--prc-pend-h", on ? `${p.offsetHeight}px` : "0px");
    /* 패널이 **막 나타나는 순간**(첫 타건)에는 예약 공간이 아직 스크롤에 반영되지 않아
       입력 중인 칸이 덮인다. 그 한 번만 칸을 화면 안으로 끌어온다 —
       매 타건마다 하면 화면이 계속 흔들린다. */
    if (on && !was) {
      const a = document.activeElement;
      if (a && a.dataset && a.dataset.pk) a.scrollIntoView({ block: "center" });
    }
  };
  const syncCounts = () => {
    put("cap", capBody());
    put("side", sideBody());
    put("cov", covBody());
    CATS.forEach((cat) => {
      const e = qs(root, `[data-catcnt="${cat}"]`);
      if (!e) return;
      const n = catCustom(state.clientId, cat);
      e.textContent = n ? `맞춤 ${n}` : "";
      e.classList.toggle("is-on", !!n);
    });
  };

  render();

  /* ── 이벤트(위임 1회 — 재렌더에도 생존) ────────────────── */
  const offClick = on(root, "click", "[data-action]", (e, t) => {
    const a = t.dataset.action;
    if (a === "pick") {
      if (t.dataset.cid === state.clientId) return;
      state.clientId = t.dataset.cid;
      put("side", sideBody());
      put("co", nameOf(state.clientId));
      put("acc", accBody());
      syncCounts();
      syncPend();
    } else if (a === "toggle") {
      const cat = t.dataset.cat;
      if (state.closed.has(cat)) state.closed.delete(cat); else state.closed.add(cat);
      const sec = qs(root, `.prc-cat[data-cat="${cat}"]`);
      if (sec) sec.classList.toggle("is-open", !state.closed.has(cat));
      t.setAttribute("aria-expanded", state.closed.has(cat) ? "false" : "true");
    } else if (a === "reset-all") {
      /* 되돌릴 것이 없는데 "저장해야 반영됩니다"라고 하면 지시를 따를 수단이 화면에 없다 */
      if (!customCount(state.clientId)) { toast("이미 전 상품이 정가입니다"); return; }
      const d = draftFor(state.clientId);
      Object.keys(d).forEach((k) => delete d[k]);
      put("acc", accBody());
      syncCounts();
      syncPend();
      const n = changedKeys(state.clientId).length;
      toast(`${nameOf(state.clientId)} 맞춤 단가 ${n}건을 정가로 되돌렸습니다 · 저장해야 반영됩니다`, "warn");
    } else if (a === "revert") {
      delete state.drafts[state.clientId];
      put("acc", accBody());
      syncCounts();
      syncPend();
      toast("저장 전 변경을 되돌렸습니다");
    } else if (a === "save") {
      const n = changedKeys(state.clientId).length;
      store.setClientPrices(state.clientId, state.drafts[state.clientId] || {});
      delete state.drafts[state.clientId];
      /* 입력칸을 저장값으로 다시 쓴다 — 없으면 거절된 원문이 화면에 남아
         저장된 값과 보이는 값이 갈린다(패널은 저장과 함께 사라진다). */
      put("acc", accBody());
      syncCounts();
      syncPend();
      toast(`${nameOf(state.clientId)} 단가 ${n}건을 저장했습니다`, "ok");
    }
  });

  const offSearch = on(root, "input", "[data-ctl='q']", (e, t) => {
    state.q = t.value;
    put("side", sideBody());
  });

  /* 값 입력 — write-through. 배지·카운트·변경 패널만 갱신하고 행은 두어야
     커서가 살아남는다(주문 모달과 같은 규약). */
  const offInput = on(root, "input", "[data-pk]", (e, t) => {
    const key = t.dataset.pk;
    const p = BY_KEY.get(key);
    if (!p) return;
    const { ok, n } = parseAmount(t.value);
    t.classList.toggle("is-bad", !ok);
    t.setAttribute("aria-invalid", ok ? "false" : "true");
    if (!ok) return; /* 거부 — draft 를 건드리지 않는다(잘못 읽힌 수가 저장되는 것보다 낫다) */
    const d = draftFor(state.clientId);
    const base = baseOf(p);
    /* 정가와 같은 값은 오버라이드가 아니다 — 저장해 두면 나중에 정가가 오를 때
       그 잔재가 조용히 할인으로 되살아난다. */
    if (n > 0 && n !== base) d[key] = n; else delete d[key];
    const v = norm(d[key]);
    const b = qs(root, `[data-badge="${key}"]`);
    if (b) setHTML(b, badge(effOf(p, v) > 0, n, base));
    syncCounts();
    syncPend();
  });

  /* 포커스가 빠지면 칸을 draft 기준으로 다시 쓴다 — 거절된 원문(`12345.67`)이나
     서식 없는 숫자가 남아 커밋값과 갈리지 않게. 포커스가 없으니 커서 규약과 무관하다.
     `blur` 는 버블링하지 않아 위임이 안 된다 — `focusout` 을 쓴다. */
  const offBlur = on(root, "focusout", "[data-pk]", (e, t) => {
    const key = t.dataset.pk;
    if (!BY_KEY.has(key)) return;
    const v = norm(mapOf(state.clientId)[key]);
    t.value = v > 0 ? v.toLocaleString("ko-KR") : "";
    t.classList.remove("is-bad");
    t.setAttribute("aria-invalid", "false");
  });

  return () => {
    offClick();
    offSearch();
    offInput();
    offBlur();
    toast.destroy();
  };
}
