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
    ALL_PRODUCTS.filter((p) => {
      const v = norm(mapOf(cid)[productKey(p)]);
      return v > 0 && v !== baseOf(p);
    }).length;

  /** 저장값과 달라진 키들 — 저장 전 변경 패널의 단일 소스 */
  const changedKeys = (cid) => {
    const d = state.drafts[cid];
    if (!d) return [];
    const s = savedOf(cid);
    const keys = new Set([...Object.keys(s), ...Object.keys(d)]);
    return [...keys].filter((k) => BY_KEY.has(k) && norm(s[k]) !== norm(d[k]));
  };
  const isDirty = (cid) => changedKeys(cid).length > 0;

  const catCustom = (cid, cat) =>
    IN_CAT(cat).filter((p) => {
      const v = norm(mapOf(cid)[productKey(p)]);
      return v > 0 && v !== baseOf(p);
    }).length;

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
      ALL_PRODUCTS.some((p) => {
        const v = norm(savedOf(c.id)[productKey(p)]);
        return v > 0 && v !== baseOf(p);
      })
    ).length;
    const dirty = cs.filter((c) => isDirty(c.id)).length;
    return html`거래처 <strong>${cs.length}</strong>곳 중 <strong>${n}</strong>곳에 맞춤 단가 ·
      상품 <strong>${ALL_PRODUCTS.length}</strong>종
      ${dirty ? html`<em class="prc-cov__dirty">· 미저장 ${dirty}곳</em>` : ""}`;
  };

  /* ── 좌측 거래처 pane ──────────────────────────────────── */
  const sideBody = () => {
    const rows = shownClients();
    if (!rows.length) return html`<p class="prc-side__empty">검색 결과가 없습니다.</p>`;
    const shared = sharedBizKeys(clients());
    return html`${rows.map((c) => {
      const n = customCount(c.id);
      return html`<button type="button" class="prc-cli ${state.clientId === c.id ? "is-on" : ""}"
        data-action="pick" data-cid="${c.id}" aria-pressed="${state.clientId === c.id ? "true" : "false"}">
        <span class="prc-cli__nm">${displayName(c, shared)}</span>
        ${isDirty(c.id) ? html`<span class="prc-cli__dot" title="저장하지 않은 변경"></span>` : ""}
        <span class="prc-cli__cnt ${n ? "is-on" : ""}">${n ? n : "–"}</span>
      </button>`;
    })}`;
  };

  /* ── 상품 행 ───────────────────────────────────────────
     값 칸은 입력 중 재렌더하면 커서가 날아간다 — 배지만 부분 갱신한다. */
  const rowBody = (p) => {
    const key = productKey(p);
    const base = baseOf(p);
    const v = norm(mapOf(state.clientId)[key]);
    const custom = v > 0 && v !== base;
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
        <button type="button" class="btn btn-secondary" data-action="revert">되돌리기</button>
        <button type="button" class="prc-save" data-action="save">${icon("save", { size: 15 })} ${keys.length}건 저장</button>
      </div>`;
  };

  /* ── 셸 ───────────────────────────────────────────────── */
  function render() {
    setHTML(root, html`
      <div class="page-admin">
        <div class="admin-inner">
          ${pageTitle({ imgSrc: "./assets/nav-product.png", title: "기업별 상품단가", action: html`<span class="prc-cov" data-slot="cov">${covBody()}</span>` })}
          <div class="prc-shell">
            <aside class="prc-side">
              <div class="prc-side__srch">
                ${icon("search", { size: 13, cls: "prc-side__ic" })}
                <input type="text" data-ctl="q" value="${state.q}" placeholder="거래처·아이디·사업자번호" aria-label="거래처 검색" />
              </div>
              <div class="prc-side__list" data-slot="side">${sideBody()}</div>
            </aside>
            <section class="prc-main">
              <header class="prc-hd">
                <div class="prc-hd__l">
                  <b class="prc-hd__co" data-slot="co">${nameOf(state.clientId) || "거래처를 선택하세요"}</b>
                  <span class="prc-hd__cap" data-slot="cap">${capBody()}</span>
                </div>
                <button type="button" class="prc-minibtn" data-action="reset-all">전체 정가로</button>
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
  const put = (slot, body) => { const e = qs(root, `[data-slot='${slot}']`); if (e) setHTML(e, body); };
  const syncPend = () => {
    put("pend", pendBody());
    const p = qs(root, "[data-slot='pend']");
    if (p) p.classList.toggle("is-on", isDirty(state.clientId));
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
      const d = draftFor(state.clientId);
      Object.keys(d).forEach((k) => delete d[k]);
      put("acc", accBody());
      syncCounts();
      syncPend();
      toast(`${nameOf(state.clientId)} 단가를 모두 정가로 되돌렸습니다 · 저장해야 반영됩니다`, "warn");
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
    const n = parseInt(String(t.value).replace(/[^0-9]/g, ""), 10);
    const d = draftFor(state.clientId);
    if (n > 0) d[key] = n; else delete d[key];
    const v = norm(d[key]);
    const base = baseOf(p);
    const b = qs(root, `[data-badge="${key}"]`);
    if (b) setHTML(b, badge(v > 0 && v !== base, v, base));
    syncCounts();
    syncPend();
  });

  return () => {
    offClick();
    offSearch();
    offInput();
    toast.destroy();
  };
}
