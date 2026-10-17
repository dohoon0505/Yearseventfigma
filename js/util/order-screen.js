/* ============================================================
   order-screen.js — 주문 관리 화면 공용 조각.

   통합주문관리(#/admin/b2c)와 거래처 주문관리(#/admin/orders)는 같은 일을
   한다 — 목록 → 필터 → 상세 → 상태 전환. 두 화면이 같은 마크업을 각자
   만들면 반드시 다시 어긋나므로, **같은 픽셀을 그리는 코드**는 여기 모은다.

   ■ 여기 있는 것 — 필터 카드 마크업 · 표 셀 렌더러 ·
     **상세 모달 셸**(헤더 스테퍼·다크 처리 레일·요약·이력·푸터) ·
     담당자 지정 · 주문서 삭제 확인.
   ■ 여기 없는 것 — filtered() · columns · 모달 본문 조립 · 저장 규칙.
     데이터 스키마와 도메인 규칙이 달라 억지로 합치면 분기 지옥이 된다.
   ■ **주문서 등록 모달(order-create.js)은 다른 모달이다 — 서로 import 하지 않는다.**
     둘이 공유하는 폼 프리미티브(card·renderFields·dtpMarkup·won…)는
     중립 지대인 util/order-fields.js 에 있고, 아래에서 재수출만 한다.

   짝이 되는 스타일은 css/components.css 의 `.ord-*` 블록(파일 끝).
   ============================================================ */
import { html, raw, escapeHtml, setHTML, on, qs, qsa } from "../dom.js";
import { icon } from "../icons.js";
import { makeDatepicker, openLightbox } from "../ui.js";
import { HIST_DOT } from "../data/order-history.js";
import { won, pad2, dash, fmtFull, parseFlexDate, dtpMarkup, card, renderFields, autosize } from "./order-fields.js";
import { openRowPicker } from "./order-dialogs.js";
import { attachmentOf } from "./image.js";

/* 폼 프리미티브는 order-fields.js 가 소유한다 — 기존 호출부가 깨지지 않게 재수출만 한다.
   새 코드는 order-fields.js 에서 직접 가져올 것. */
export { won, pad2, dash, fmtFull, parseFlexDate, dtpMarkup, card, renderFields, autosize };

/* 행 열기는 tableGrid 옆(ui.js)이 소유한다 — 상품 규격 안내처럼 주문과 무관한 화면도 쓰는데
   그쪽이 이 모듈을 import 하면 드롭다운·피커·모달 그래프가 통째로 딸려 온다.
   기존 호출부(orders.js · admin-orders.js · admin-b2c.js)가 깨지지 않게 재수출만 한다. */
export { onRowOpen } from "../ui.js";
/* 삭제 확인(체크 게이트) 다이얼로그는 openDialog 위에 세워진 것이라 dialog.js 가 소유한다 —
   주문뿐 아니라 거래처(admin-clients)·프로필 저장공간도 쓴다. 기존 호출부 호환으로 재수출만 한다. */
export { openDeleteConfirm } from "./dialog.js";

/* ── 상태 ──────────────────────────────────────────────── */
/* 화면마다 색이 다르면 같은 상태를 매번 다시 배워야 한다 — 단일 맵. */
export const ORDER_STATUS_STYLE = {
  "접수대기": { bg: "var(--c-orange-soft)", color: "var(--c-orange-ink)" },
  "주문접수": { bg: "var(--c-blue-soft)", color: "var(--c-blue)" },
  "배송완료": { bg: "var(--c-success-bg)", color: "var(--c-success-ink)" },
  "취소":    { bg: "var(--c-danger-bg)", color: "var(--c-danger-ink)" },
};
export const statusBadge = (s) => {
  const st = ORDER_STATUS_STYLE[s] ?? { bg: "var(--c-surface-3)", color: "var(--c-text-4)" };
  return html`<span class="hm-badge" style="background:${st.bg};color:${st.color}">${s}</span>`;
};
export const ORDER_FLOW = "접수대기 → 주문접수 → 배송완료";
export const tabDefs = (statuses) => [{ v: "all", label: "전체" }, ...statuses.map((s) => ({ v: s, label: s }))];

/* ── 필터 상수 ─────────────────────────────────────────── */
export const PHOTO_FILTERS = [{ v: "has", label: "사진 있음" }, { v: "no", label: "사진 없음" }];
export const NOTI_FILTERS = [{ v: "on", label: "알림 발송" }, { v: "off", label: "미발송" }];
export const QUICK_DATES = ["전체", "오늘", "어제", "내일", "이번 달", "지난 달"];

/* ── 필터 마크업 ───────────────────────────────────────── */
export const tabBtn = ({ v, label, count, active }) =>
  html`<button class="bf-tab ${active ? "is-active" : ""}" data-action="tab" data-v="${v}">${label}<span class="bf-tab__cnt">${count}</span></button>`;

export const segBtns = (items, active, action) =>
  items.map((it) => html`<button class="bf-seg__btn ${active === it.v ? "is-sel" : ""}" data-action="${action}" data-v="${it.v}">${it.label}</button>`);

export const toggleChips = (defs, onList, action) =>
  defs.map((f) => {
    const sel = onList.includes(f.v);
    return html`<button class="bf-chip ${sel ? "is-on" : ""}" data-action="${action}" data-v="${f.v}">${sel ? "✓ " : ""}${f.label}</button>`;
  });

/* 인라인 라벨형 검색창. value 를 **인자로** 받는다 — 페이지 state 클로저를
   끌어오면 이 모듈이 특정 화면에 묶여 버린다. */
export const srchBox = ({ key, label, ph, value, extra = "" }) => html`
  <div class="bf-srch ${extra}">
    ${icon("search", { size: 13, cls: "bf-srch__ic" })}
    <span class="bf-srch__lbl">${label}</span>
    <span class="bf-srch__dv"></span>
    <input type="text" data-search="${key}" value="${value ?? ""}" placeholder="${ph}" />
  </div>`;

/* 커스텀 datepicker 마크업 (ui.js makeDatepicker 와 짝) */
export const dpMarkup = (which, ph) => html`
  <div class="dd datepick ord-dp" data-dp="${which}">
    <button type="button" class="dd-trigger" aria-haspopup="dialog" aria-expanded="false"></button>
    <div class="dd-panel cal-panel" role="dialog" aria-label="${ph} 선택">
      <div class="cal-head">
        <button type="button" class="cal-nav cal-prev" aria-label="이전 달">‹</button>
        <span class="cal-title"></span>
        <button type="button" class="cal-nav cal-next" aria-label="다음 달">›</button>
      </div>
      <div class="cal-grid"></div>
    </div>
  </div>`;

/* 필터 카드 전체 — 두 화면이 **같은 골격**을 쓰도록 여기서 조립한다.
   ① 상태 언더라인 탭 + 플로우 ② 기준 세그 · 기간 범위 · 퀵 · 배송지 검색 ·
   상세 토글 ③ 접이식 상세(사진·알림 칩 + 검색 4종) */
export function filterCard({ tabs, basis, basisActive, quickActive, addr, detailOpen, photo, noti, searches }) {
  const activeCnt = photo.length + noti.length;
  return html`
    <div class="bf-row bf-row--tabs">
      <div class="bf-tabs" data-slot="tabs">${tabs}</div>
      <span class="bf-flow">${ORDER_FLOW}</span>
    </div>

    <div class="bf-row bf-row--main">
      <div class="bf-seg">${segBtns(basis, basisActive, "datebasis")}</div>
      ${dpMarkup("start", "시작일")}
      <span class="bf-tilde">~</span>
      ${dpMarkup("end", "종료일")}
      <div class="bf-seg">${segBtns(QUICK_DATES.map((v) => ({ v, label: v })), quickActive, "date")}</div>
      <div class="bf-right">
        ${srchBox({ ...addr, extra: "bf-srch--addr" })}
        <button class="bf-detailbtn ${detailOpen ? "is-open" : ""}" data-action="detail-toggle" aria-expanded="${detailOpen ? "true" : "false"}">
          상세 필터${activeCnt ? html`<span class="bf-detailbtn__badge">${activeCnt}</span>` : ""}<span class="bf-chevron"></span>
        </button>
      </div>
    </div>

    ${detailOpen ? html`
      <div class="bf-detail">
        <div class="bf-detail__chips">
          <span class="bf-lbl">사진</span>
          ${toggleChips(PHOTO_FILTERS, photo, "photofilter")}
          <span class="bf-vdiv"></span>
          <span class="bf-lbl">알림</span>
          ${toggleChips(NOTI_FILTERS, noti, "notifilter")}
        </div>
        <div class="bf-detail__srch">${searches.map((s) => srchBox(s))}</div>
      </div>
    ` : ""}
  `;
}

/* 기간 datepicker 쌍 수명주기 — 필터 슬롯 재렌더마다 destroy→재생성해야 하고
   cleanup 에서도 destroy 해야 한다(makeDatepicker 가 document 리스너를 건다).
   두 규약을 손으로 지키면 한쪽을 반드시 빠뜨리므로 묶어 둔다. */
export function makeDateRange(root, { get, set, min, max }) {
  const dps = [];
  const destroy = () => { dps.forEach((d) => d.destroy()); dps.length = 0; };
  const bind = () => {
    for (const [which, key, ph] of [["start", "dateStart", "시작일"], ["end", "dateEnd", "종료일"]]) {
      const el = qs(root, `[data-dp='${which}']`);
      if (!el) continue;
      dps.push(makeDatepicker(el, { get: () => get(key), set: (v) => set(key, v), min, max, placeholder: ph }));
    }
  };
  return { bind, destroy };
}

/* ── 표 셀 ─────────────────────────────────────────────── */
/* 접수(주문)/배송 일시 2행 스택 — 한 컬럼에 두 날짜. */
export const dateCell = (received, deliver, lbl = "접수") => html`
  <div class="ord-dt2">
    <span class="ord-dt2__row"><span class="ord-dt2__lbl">${lbl}</span><span class="ord-mono">${fmtFull(received)}</span></span>
    <span class="ord-dt2__row"><span class="ord-dt2__lbl ord-dt2__lbl--dv">배송</span><span class="ord-mono">${fmtFull(deliver)}</span></span>
  </div>`;
export const photoFlag = (image) =>
  html`<span class="ord-flag ord-flag--photo ${image ? "on" : ""}" title="${image ? "사진 있음" : "사진 없음"}">${icon("camera", { size: 15 })}</span>`;
export const notiFlag = (notified) =>
  html`<span class="ord-flag ord-flag--noti ${notified ? "on" : ""}" title="${notified ? "알림 발송완료" : "알림 미발송"}">${icon(notified ? "bell" : "bell-off", { size: 15 })}</span>`;
export const amtCell = (n) => html`<span class="ord-amt">${won(n)}</span>`;
export const editBtn = (id) =>
  html`<button class="tbl-edit" data-action="edit" data-id="${id}" aria-label="주문 상세">${icon("pencil", { size: 14 })}</button>`;

/* ── 주문서 삭제 뒤 초점 (B2B·B2C 목록 공용) ─────────────────
   지우면 상세 창이 닫히고 목록을 다시 그린다 — 창이 돌려준 연필(창을 연 줄)이 DOM 에서 떨어져 초점이 body 로 빠진다(실측 —
   Tab 이 문서 맨 앞부터 다시 시작한다). 거래처 목록의 focusAfterDelete(admin-clients)와 같은 생각이다:
   **그 자리에 올라온 줄**(지운 줄이 마지막이었으면 새 마지막 줄)의 연필로, 그 줄이 목록에 없었거나 표가 비면 '신규 주문 등록'으로.
   순번은 지우기 **전에** `editIndexOf` 로 잰다. 초점을 잃었을 때만 옮긴다 — 사람이 이미 다른 곳에 둔 초점은 건드리지 않는다. */
export const editIndexOf = (root, id) => qsa(root, "[data-action='edit']").findIndex((b) => b.dataset.id === id);
export function focusAfterDelete(root, idx) {
  const a = document.activeElement;
  if (a && a !== document.body && a.isConnected) return;
  const btns = qsa(root, "[data-action='edit']");
  const b = (idx >= 0 && btns[Math.min(idx, btns.length - 1)]) || qs(root, "[data-action='new']");
  if (b) b.focus();
}

/* ── 처리 레일 현장사진 — 업로드·다운로드·라이트박스 ──────
   FileReader · data-URL · <a download> · 오버레이 버튼 제외 분기까지
   두 화면이 글자 하나까지 같아야 하는 덩어리. 복붙하면 한쪽만 고쳐진다. */
export function makeImageBox({ get, toast }) {
  const inner = () => {
    const o = get();
    const hasImg = !!o?.image;
    return html`
      ${hasImg
        ? html`<img src="${o.image}" alt="배송 현장 사진" />`
        : html`<div class="ord-imgbox__ph">${icon("camera", { size: 22 })}<span>배송 현장 사진 없음</span></div>`}
      <div class="ord-imgover">
        <button class="ord-imgact" data-action="img-upload" title="이미지 업로드" aria-label="이미지 업로드">${icon("camera", { size: 18 })}</button>
        ${hasImg ? html`
          <button class="ord-imgact" data-action="img-download" title="이미지 다운로드" aria-label="이미지 다운로드">${icon("download", { size: 18 })}</button>
          <button class="ord-imgact" data-action="img-zoom-btn" title="크게 보기" aria-label="크게 보기">${icon("eye", { size: 18 })}</button>
        ` : ""}
      </div>`;
  };

  const zoomIt = () => {
    const o = get();
    if (!o?.image) return;
    openLightbox({ src: o.image, alt: "배송 현장 사진", caption: `${o.orderNo} 배송 현장 사진` });
  };

  let notify = null;
  const onFile = (panel, file) => {
    if (!file) return;
    if (!/^image\//.test(file.type)) { toast("이미지 파일만 업로드할 수 있습니다", "warn"); return; }
    const apply = (url) => {
      const o = get();
      if (!o) return;
      o.image = url;
      const box = qs(panel, "[data-slot='imgbox']");
      if (box) { box.classList.add("has"); setHTML(box, inner()); box.title = "클릭하여 크게 보기"; }
      toast("이미지를 업로드했습니다");
      if (notify) notify();
    };
    /* 줄여서 담는다(util/image.js) — B2B 주문은 변경분이 localStorage 에 저장되는데(store.orderOps),
       휴대폰 원본 사진 한 장(수 MB)이 들어가면 용량 한도를 넘어 저장이 실패한다.
       ⚠️ **줄이지 못하는 형식(HEIC 등)은 받지 않는다.** 예전엔 그때 원본을 그대로 읽어 담았는데, 4MB HEIC 한 장이
          들어간 뒤로는 그 주문뿐 아니라 다른 주문·담당자·거래처 저장까지 전부 조용히 실패했다(2026-10-16 검증).
          브라우저가 그리지 못하는 형식은 화면에도 안 보이니 받아 둘 이유도 없다. */
    attachmentOf(file).then((a) => {
      if (a.dataUrl) { apply(a.dataUrl); return; }
      toast("이 형식의 사진은 올릴 수 없습니다 · JPG·PNG 로 다시 올려 주세요", "warn");
    });
  };

  const bind = (panel, onUpload) => {
    notify = onUpload;
    on(panel, "click", "[data-action='img-upload']", () => qs(panel, "[data-img-input]")?.click());
    on(panel, "click", "[data-action='img-download']", () => {
      const o = get();
      if (!o?.image) return;
      const a = document.createElement("a");
      a.href = o.image;
      a.download = `${o.orderNo}_배송현장사진`;
      document.body.appendChild(a); a.click(); a.remove();
    });
    on(panel, "click", "[data-action='img-zoom-btn']", () => zoomIt());
    /* 박스 자체 클릭 — 오버레이 버튼 3종은 위에서 처리하므로 제외 */
    on(panel, "click", "[data-action='img-zoom']", (e) => {
      if (e.target.closest("[data-action='img-upload'],[data-action='img-download'],[data-action='img-zoom-btn']")) return;
      if (get()?.image) zoomIt();
      else qs(panel, "[data-img-input]")?.click();
    });
    on(panel, "change", "[data-img-input]", (e, t) => { onFile(panel, t.files?.[0]); t.value = ""; });
  };

  return { inner, bind };
}


/* 헤더 담당자 pill(시안) — 상태 점 + 라벨. 스테퍼·더보기와 같은 36px pill 열에 선다.
   점 색이 곧 상태다: 지정=초록, 미지정=주황(면까지 주황이라 눈에 먼저 걸린다). */
export const managerControl = (name) => html`
  <button class="ord-mgr ${name ? "" : "ord-mgr--empty"}" data-action="pick-manager"
    title="${name ? `담당자 ${name} · 눌러서 변경` : "담당자를 지정하세요"}">
    <span class="ord-mgr__dot"></span>${name ? `담당 ${name}` : "담당자 미지정"}
  </button>`;

/* ── 담당자 지정 모달 — 메인 위에 스택. 지정은 즉시 반영하고
   폼·레일의 다른 미저장 편집은 건드리지 않는다.
   onPick(v) 가 false 를 돌려주면 토스트 없이 닫기만 한다.

   시안(모달 #1 mgr · 440px): 에어브로 = 주문번호 · 타이틀 '담당자 지정' ·
   푸터 좌측 힌트가 "이 선택이 무엇까지 바꾸는지"를 말한다(알림 수신자).
   `eyebrow` 는 **선택 인자**다 — 주문 문맥이 아닌 곳(등록 모달)에서 부르면
   '주문 담당자'가 그 자리를 채운다. ── */
export function openStaffPicker({ current, names, onPick, toast, eyebrow }) {
  /* '지정' 하면 호출부 onPick 이 상세 창의 머리·요약을 다시 그려, 이 창을 연 담당자 버튼이 DOM 에서 떨어진다 — 창이 닫히며
     돌려줄 곳이 없어 초점이 body 로 빠졌다(실측 · B2B·B2C). 연 버튼이 있던 **구역**(`data-slot` — 머리 hd · 요약 sum)을 열 때 잡아 두고,
     초점을 잃었으면 그 구역의 새 담당자 버튼으로 옮긴다. 담당자 미지정 주문을 열자마자 뜬 경우는 창의 첫 칸(머리)이 연 자리다.
     구역에 담당자 버튼이 없는 곳에서 부르면 아무것도 하지 않는다. */
  const opener = document.activeElement;
  const slot = opener && opener.closest ? opener.closest("[data-slot]") : null;
  const backToPick = () => {
    const a = document.activeElement;
    if (a && a !== document.body && a.isConnected) return;
    const b = slot && slot.isConnected ? qs(slot, "[data-action='pick-manager']") : null;
    if (b) b.focus();
  };
  /* names 는 **함수**다 — 담당자 목록은 시스템 관리에서 실시간으로 바뀐다.
     정적 배열로 받으면 방금 추가한 담당자가 안 뜬다. */
  const list = names();
  const cur = current || "";
  /* 목록에 없는 기존 담당자(직원이 삭제된 경우)는 맨 위에 남겨 둔다 —
     조용히 다른 사람으로 재배정되는 것이 가장 나쁜 결과다. */
  const orphan = cur && !list.some((s) => s.name === cur);
  const rows = (orphan ? [{ name: cur, dept: "", orphan: true }, ...list] : list)
    .map((s) => ({ v: s.name, name: s.name, sub: s.dept, orphan: s.orphan }));
  /* 껍데기는 `openRowPicker` 하나다 — 고아 행·radiogroup·확인 게이트·
     `onPick === false` 의 토스트 생략이 세 다이얼로그에서 갈리지 않게. */
  return openRowPicker({
    eyebrow: eyebrow || "주문 담당자", eyebrowNum: !!eyebrow,
    title: "담당자 지정",
    hint: "배송완료 알림도 이 담당자에게 전달됩니다",
    width: 440,
    /* 라벨 앞에 공백을 넣던 옛 트릭(`" 지정"`)은 제거했다 — 아이콘과의 간격은
       `.hm-btn` 의 gap 이 준다. 공백을 남기면 간격이 두 번 들어간다. */
    rows, current: cur, confirmLabel: "지정", confirmIcon: "check", toast,
    empty: "지정할 수 있는 담당자가 없습니다.",
    onPick, pickedMsg: (v) => `담당자를 ${v}(으)로 지정했습니다`,
    onClose: backToPick,
  });
}

/* ══════════════════════════════════════════════════════════════
   주문 상세 모달 v2 — 시안 '주문관리 모달 리모델링'
   모드 없는 상시 편집 · 헤더 스테퍼 · 다크 처리 레일 · 요약/이력 레일.

   두 화면은 **필드 서술자 배열만 다르게 주입**한다. 읽기/편집 두 갈래가
   사라졌으므로 renderFields 하나가 그 자리를 대신한다.
   ══════════════════════════════════════════════════════════════ */

/* ── 헤더 ─────────────────────────────────────────────────── */
export const statusPill = (status) => {
  const st = ORDER_STATUS_STYLE[status] ?? { bg: "var(--c-surface-3)", color: "var(--c-text-4)" };
  return html`<span class="ord-hd__pill" style="background:${st.bg};color:${st.color}">
    <span class="ord-hd__dot" style="background:${st.color}"></span>${status}</span>`;
};

/* 상태 스테퍼 — **앞으로만**. 되돌리기는 막고, 배송완료는 사진·인수자가 있어야 활성.
   잠긴 단계도 클릭은 받는다(왜 안 되는지 토스트로 알려주는 편이 친절하다). */
export function stepper({ status, statuses, canComplete }) {
  const flow = statuses.filter((s) => s !== "취소");
  if (status === "취소") {
    return html`<div class="ord-step">
      <button class="ord-step__btn is-cancel" disabled><span class="ord-step__mark">✕</span>취소됨</button>
    </div>`;
  }
  const cur = flow.indexOf(status);
  return html`<div class="ord-step">
    ${flow.map((s, i) => {
      const done = i < cur, now = i === cur;
      /* 뒤로 가는 단계 + 조건 미충족 배송완료 = 잠금 */
      const locked = i < cur || (s === "배송완료" && !canComplete);
      const cls = now ? "is-now" : done ? "is-done" : locked ? "is-locked" : "";
      return html`<button class="ord-step__btn ${cls}" data-action="step" data-v="${s}"
        ${now ? "disabled" : ""} title="${s}">
        <span class="ord-step__mark">${done ? "✓" : String(i + 1)}</span>${s}</button>`;
    })}
  </div>`;
}

/* 스테퍼로 상태를 바꾸면 호출부가 머리를 다시 그려 누른 단계 버튼이 사라진다. 예전엔 새 '지금' 단계(`.is-now`)에 초점을 줬는데
   그 버튼은 `disabled` 라 초점을 받지 못해 **body 로 빠졌다**(실측 — 키보드로 '주문접수' 를 누르면 다음 Tab 이 창 맨 앞부터).
   그 자리의 다음 Tab 정거장으로 옮긴다: 뒤 단계(잠긴 단계도 — 누르면 이유를 말한다) → 머리의 담당자 → ···.
   초점을 잃었을 때만 옮긴다(위에 다른 창이 떴거나 사람이 이미 둔 초점은 건드리지 않는다). */
export function focusAfterStep(panel) {
  const a = document.activeElement;
  if (a && a !== document.body && a.isConnected) return;
  const hd = panel && qs(panel, ".ord-hd__r");
  if (!hd) return;
  const t = qs(hd, ".ord-step__btn.is-now ~ .ord-step__btn:not([disabled])")
    || qs(hd, "[data-action='pick-manager']") || qs(hd, "[data-action='menu']");
  if (t) t.focus();
}

/* `delLock`(선택 · B2B 만 넘긴다) — 지울 수 없는 이유(명세 6.4 정본 문구). 있으면 '주문서 삭제' 가 자물쇠와 함께 잠기고
   그 아래에 이유를 적는다(시안 S-06 '잠긴 달의 삭제 시도'). ⚠️ 잠긴 항목도 **포커스가 가는 버튼**이다(`aria-disabled` +
   `aria-describedby`) — 시안처럼 div 로 두면 키보드 사용자가 이유를 읽을 수 없다. 누르면 호출부가 아무것도 하지 않는다
   (`data-action="delete-locked"`). B2C 는 넘기지 않아 예전 그대로다.
   항목은 `tabindex="-1"` 이다 — 메뉴 안은 화살표로 옮기고 Tab 은 메뉴를 닫고 나간다(아래 `bindOrdMenu`). */
export const ordMenu = ({ delLock } = {}) => html`
  <div class="ord-menu ${delLock ? "ord-menu--wide" : ""}" role="menu" aria-label="주문 더보기">
    <button class="ord-menu__item" role="menuitem" tabindex="-1" data-action="order-cancel">주문취소</button>
    ${delLock
      ? html`<button class="ord-menu__item ord-menu__item--off" role="menuitem" tabindex="-1" aria-disabled="true"
          aria-describedby="ord-del-why" data-action="delete-locked">
          <span class="ord-menu__row"><span>주문서 삭제</span>${icon("lock", { size: 14 })}</span>
          <span class="ord-menu__why" id="ord-del-why">${delLock}</span>
        </button>`
      : html`<button class="ord-menu__item ord-menu__item--danger" role="menuitem" tabindex="-1" data-action="delete">주문서 삭제</button>`}
  </div>`;

/* 헤더 전체 — 주문번호·상태·메타 / 스테퍼·담당자·더보기·닫기 */
export function ordHeader({ order, meta, statuses, canComplete, menuOpen, isNew, delLock }) {
  if (isNew) {
    return html`
      <div class="ord-hd__l">
        <div class="ord-hd__row"><h3 class="ord-hd__no">신규 주문 등록</h3></div>
        <p class="ord-hd__meta">${meta}</p>
      </div>
      <div class="ord-hd__r">
        ${managerControl(order.manager)}
        <button class="ord-iconbtn hm__x" data-action="close" aria-label="닫기">${icon("x", { size: 14 })}</button>
      </div>`;
  }
  return html`
    <div class="ord-hd__l">
      <div class="ord-hd__row">
        <h3 class="ord-hd__no">${order.orderNo}</h3>
        ${statusPill(order.status)}
      </div>
      <p class="ord-hd__meta">${meta}</p>
    </div>
    <div class="ord-hd__r">
      ${stepper({ status: order.status, statuses, canComplete })}
      <span class="ord-hd__vdiv"></span>
      ${managerControl(order.manager)}
      <div class="ord-more">
        <button class="ord-iconbtn ${menuOpen ? "is-on" : ""}" data-action="menu" aria-haspopup="menu"
          aria-expanded="${menuOpen ? "true" : "false"}" aria-label="더보기">⋯</button>
        ${menuOpen ? ordMenu({ delLock }) : ""}
      </div>
      <button class="ord-iconbtn hm__x" data-action="close" aria-label="닫기">${icon("x", { size: 14 })}</button>
    </div>`;
}

/* ── ··· 메뉴 키보드 — `role="menu"` 의 약속(WAI-ARIA 메뉴 버튼) ──────────────────
   메뉴라고 선언해 놓고 키를 주지 않으면 화면낭독기 사용자에게 거짓말이 된다(다이얼로그 규격의 role 정직성 줄과 같은 원칙).
   · 열기: 누르기(Enter·Space·마우스) 또는 ↓ = 첫 항목에 초점 · ↑ = 끝 항목에 초점. 닫기: ··· 를 다시 누르기 · ESC · 항목 고르기 ·
     바깥 클릭(초점은 누른 곳에 둔다 — 아래 host 리스너).
   · 항목 사이: ↑↓(끝에서 되돌아간다) · Home · End. 항목은 tabindex=-1 이라 Tab 은 메뉴를 닫고 ✕ 로, Shift+Tab 은 ··· 로 간다.
   · 잠긴 '주문서 삭제'(aria-disabled)에도 초점이 간다 — 이유가 aria-describedby 로 읽힌다(메뉴의 잠긴 항목은 초점을 받는다).
   머리는 열고 닫을 때마다 통째로 다시 그려진다(호출부 renderHd) — 그래서 초점은 다시 그린 **뒤** 새 요소에 준다.
   ⚠️ ESC 는 여기서 keydown 으로 잡지 않는다 — openModal 의 capture 핸들러가 먼저 받아 모달째 닫는다(ui.js 주석의 그 함정).
      대신 `escape()` 를 돌려주고 호출부가 `openModal({ onEsc })` 에 잇는다: 메뉴가 열려 있으면 메뉴만 닫고(초점이 메뉴에 있었으면
      ··· 로 옮긴다) false(모달은 그대로), 닫혀 있으면 true(예전처럼 모달을 닫는다). 위에 쌓인 다이얼로그가 있으면 openModal 이 이 창에 ESC 를 넘기지 않는다.
   `close()` 는 항목을 고른 뒤 호출부가 부른다 — 메뉴를 닫고 ··· 에 초점을 둔다(그 뒤 여는 확인 창이 닫히면 초점이 ··· 로 돌아온다).
   `refocus()` 는 그 확인 창이 확정하며 머리를 다시 그렸을 때 창의 onClose 에서 부른다 — 초점을 잃었으면 새 ··· 로. */
export function bindOrdMenu(panel, { isOpen, setOpen }) {
  const btn = () => qs(panel, ".ord-more [data-action='menu']");
  const items = () => qsa(panel, ".ord-menu [role='menuitem']");
  const openTo = (last) => {
    setOpen(true);
    const l = items();
    const t = last ? l[l.length - 1] : l[0];
    if (t) t.focus();
  };
  const close = () => {
    setOpen(false);
    const b = btn();
    if (b) b.focus();
  };
  on(panel, "click", ".ord-more [data-action='menu']", () => (isOpen() ? close() : openTo(false)));
  on(panel, "keydown", ".ord-more [data-action='menu']", (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    openTo(e.key === "ArrowUp");
  });
  on(panel, "keydown", ".ord-menu [role='menuitem']", (e, t) => {
    const l = items();
    if (!l.length) return;
    const i = l.indexOf(t);
    const to = { ArrowDown: (i + 1) % l.length, ArrowUp: (i - 1 + l.length) % l.length, Home: 0, End: l.length - 1 }[e.key];
    if (to !== undefined) { e.preventDefault(); l[to].focus(); return; }
    if (e.key !== "Tab") return;
    /* 메뉴를 닫으면 머리가 다시 그려져 Tab 의 기본 이동 대상이 사라진다 — 이동을 직접 한다. */
    e.preventDefault();
    const back = e.shiftKey;
    setOpen(false);
    const b = btn();
    const next = b && b.closest(".ord-more")?.nextElementSibling;
    if (!back && next && next.matches("button")) next.focus();
    else if (b) b.focus();
  });
  /* ESC — 초점이 메뉴(또는 ···)에 있었으면 ··· 로 옮긴다. 마우스로 메뉴를 연 채 본문 칸을 눌러 글을 쓰다 ESC 를 누른 경우는
     메뉴만 닫고 초점은 그 칸에 둔다 — 머리만 다시 그려 칸의 커서가 살아 있는데 ··· 로 끌어가면 쓰던 자리를 잃는다(검토 실측). */
  /* ⚠️ 초점이 머리의 **다른** 버튼(담당자 pill·스테퍼·✕)에 있으면 닫으며 머리를 다시 그려 그 버튼이 떨어진다 — 아래 바깥 클릭과
     같이 같은 순번의 새 버튼으로 옮긴다(실측 길: ⋯ 를 연 채 담당자 pill → 담당자 지정 창 ESC → ESC — 예전엔 body). */
  const escape = () => {
    if (!isOpen()) return true;
    const a = document.activeElement;
    if (!a || a === document.body || a.closest(".ord-more")) { close(); return false; }
    const at = a !== panel && panel.contains(a) ? ring().indexOf(a) : -1;
    setOpen(false);
    if (at >= 0 && !a.isConnected) { const n = ring()[at]; if (n) n.focus({ preventScroll: true }); }
    return false;
  };
  /* 바깥 클릭 — 메뉴를 닫는다(WAI-ARIA 메뉴 버튼 관례 · 예전엔 머리 제목·본문·레일을 눌러도 열린 채 남았다). 초점은 누른 곳에 맡긴다.
     ··· 와 메뉴 안(`.ord-more`)은 지금 동작 그대로다 — ··· 재클릭은 위 토글이, 항목은 호출부가 닫는다.
     ⚠️ 듣는 자리는 오버레이의 **버블 단계**다(패널에 위임된 스테퍼·담당자·✕ 처리가 다 돈 뒤). 먼저(capture·mousedown) 닫으면 머리를
        다시 그려 누른 버튼이 DOM 에서 떨어지고, `on()` 위임이 `contains` 로 걸러 그 클릭이 사라진다(mousedown 이면 click 자체가 안 생긴다).
        오버레이는 창과 함께 사라지므로 리스너를 따로 걷지 않아도 된다.
     ⚠️ 닫으면 머리를 통째로 다시 그린다(호출부 setOpen) — 그 클릭이 머리의 버튼에 초점을 두었으면(잠긴 단계를 눌러 토스트만 뜬 경우 등)
        **같은 순번의 새 버튼**으로 옮긴다. 메뉴 항목을 뺀 순번이다(메뉴만 사라지므로 나머지 순번은 그대로다).
     ⚠️ 그 클릭이 위에 다른 창을 열었으면(담당자 pill → 담당자 지정) 지금 닫지 않는다 — 다시 그리면 그 창이 닫힐 때 돌려줄 pill 이
        사라져 초점이 body 로 빠진다. 메뉴는 그 창 뒤에 열린 채 남고 다음 바깥 클릭·ESC 가 닫는다(예전과 같다). */
  const ring = () => qsa(panel, "button, a[href], input, select, textarea, [tabindex]").filter((el) => !el.closest(".ord-menu"));
  const host = panel.closest(".modal-overlay") || panel;
  const outside = (e) => {
    if (!isOpen() || !panel.isConnected) return;
    const t = e.target;
    if (t instanceof Element && t.closest(".ord-more")) return; // 떨어진 노드여도 옛 조상 사슬로 판정된다
    const ovs = document.querySelectorAll(".modal-overlay");
    if (host !== panel && ovs[ovs.length - 1] !== host) return;
    const a = document.activeElement;
    const at = a && a !== panel && panel.contains(a) ? ring().indexOf(a) : -1;
    setOpen(false);
    if (at >= 0 && !a.isConnected) { const n = ring()[at]; if (n) n.focus({ preventScroll: true }); }
  };
  host.addEventListener("click", outside);
  /* ⚠️ 잠긴(disabled) 버튼에는 브라우저가 click 을 보내지 않는다(mousedown·mouseup 도 없다 — pointer 이벤트만 온다 · 실측
     헤드리스 크롬 153: '지금' 단계 · 수정이 없어 잠긴 '저장' 을 눌러도 메뉴가 열린 채 남았다). 그 경우만 pointerup 에서 닫는다 —
     다른 곳까지 pointerup 에서 닫으면 위 ⚠️ 그대로 누른 버튼이 click 전에 떨어진다. 잠긴 버튼은 아무 동작이 없어 순서 문제가 없다. */
  host.addEventListener("pointerup", (e) => {
    const t = e.target;
    if (e.button === 0 && t instanceof Element && t.closest(":disabled")) outside(e);
  });
  /* 초점을 잃었으면 ··· 로 — 메뉴 항목이 연 창(주문취소)이 확정하며 머리를 다시 그리면, 창이 닫힐 때 돌려줄 ··· 가 DOM 에서 떨어져
     초점이 body 로 빠진다(실측 — 그 뒤 Tab 이 창 밖으로 나갔다). 호출부가 그 창의 onClose 에 잇는다. 사람이 이미 둔 초점은 건드리지 않는다. */
  const refocus = () => {
    if (!panel.isConnected) return;
    const a = document.activeElement;
    if (a && a !== document.body && a.isConnected) return;
    const b = btn();
    if (b) b.focus();
  };
  return { close, escape, refocus };
}

/* ── 처리 레일(다크) ──────────────────────────────────────── */
/* 시안 S-06(2026-10-16): 레일 300px 안에 현장사진이 **가로를 가득 채운 3:4**(264×352)로 들어간다. 높이를 맞추려고
   예전 맨 아래 안내문('사진·인수자 저장 시 배송완료 전환 · 알림톡 자동 발송')을 머리줄 캡션으로 올렸다 —
   알림톡 이야기는 캡션의 title 로 남긴다. 상세 모달 두 화면(B2B·B2C)이 같은 레일을 쓴다(둘 다 같은 자동 전환 규칙).
   라벨은 입력 id 와 묶는다(`for` 없는 label 은 눌러도 포커스가 가지 않는다) — 상세 모달은 한 번에 하나뿐이라 id 가 겹치지 않는다. */
export function railV2({ order, imgInner, cap = "저장 시 배송완료 전환" }) {
  return html`
    <aside class="ord-side">
      <div class="ord-side__h">
        <b class="ord-side__t">처리</b>
        <span class="ord-side__cap" title="주문접수 상태에서 사진·인수자를 함께 저장하면 배송완료로 바뀌고 알림톡이 자동 발송됩니다">${cap}</span>
      </div>
      <div class="ord-drop ${order.image ? "has" : ""}" data-slot="imgbox" data-action="img-zoom"
        title="${order.image ? "클릭하여 크게 보기" : "클릭하여 업로드"}">${imgInner}</div>
      <input type="file" accept="image/*" data-img-input hidden />
      <div class="hm-field">
        <label class="ord-side__lbl" for="ord-rcv">인수자 성함</label>
        <input class="hm-input" id="ord-rcv" data-f="receiver" value="${order.receiver ?? ""}" placeholder="현장에서 수령한 분" />
      </div>
      <div class="hm-field">
        <label class="ord-side__lbl" for="ord-memo">처리 메모</label>
        <textarea class="hm-input" id="ord-memo" data-f="memo" placeholder="담당자 처리 메모 · 특이사항">${order.memo ?? ""}</textarea>
      </div>
    </aside>`;
}

/* ── 요약 · 이력 ──────────────────────────────────────────── */
/** 배송일시까지 남은시간 — 경과/임박은 색으로 구분한다 */
/* 일·시간·분 — 큰 단위 둘만, 0 인 작은 단위는 뺀다
   ("3일 2시간" · "3일" · "2시간 40분" · "1시간" · "15분") */
const spanOf = (ms) => {
  const dd = Math.floor(ms / 86400000);
  const hh = Math.floor((ms % 86400000) / 3600000);
  const mm = Math.floor((ms % 3600000) / 60000);
  if (dd) return hh ? `${dd}일 ${hh}시간` : `${dd}일`;
  if (hh) return mm ? `${hh}시간 ${mm}분` : `${hh}시간`;
  return `${mm}분`;
};

export function remainOf(deliverAt) {
  const d = parseFlexDate(deliverAt);
  if (!d) return { label: "-", cls: "" };
  const t = d.getTime() - Date.now();
  /* 지났으면 **얼마나** 지났는지까지 적는다 — '경과'만 있으면 15분 늦은 건과
     사흘 묵은 건이 같아 보여 어느 쪽을 먼저 잡을지 판단할 수 없다. */
  if (t <= 0) return { label: `${spanOf(-t)} 경과`, cls: "is-past" };
  return { label: `${spanOf(t)} 남음`, cls: t < 86400000 ? "is-soon" : "" };
}

/* 행 서술자: { k, v, empty, action, cls, aria }. action 이 있으면 누르는 줄(button)이고 `v` 에 Html 을 넣어도 된다
   (B2B 의 정산 줄이 상태 칩을 싣는다). action 이 없는 줄의 `v` 는 **문자열만** — title 로도 찍히기 때문이다.
   `aria`(선택 · B2B 정산 줄만) — 누르는 줄의 접근명('거래처 정산회계에서 9월 열기 · 칩 · 금액'). 안 넘기면 속성 자체가 없다.
   `arrowIn`(선택 · B2B 정산 줄만) — `v` 가 '›' 를 스스로 싣는다(줄바꿈할 때 '›' 가 금액과 떨어져 혼자 다음 줄로 가지 않게).
   배송완료된 주문은 '남은시간' 대신 '배송 완료' 라고 말한다(시안 S-06) — '3일 경과' 는 끝난 주문에 아무 뜻이 없다. */
export function summaryBodyV2({ order, rows }) {
  const r = order.status === "배송완료" ? { label: "배송 완료", cls: "" } : remainOf(order.deliverAt);
  return html`
    <div class="ord-sum__head">
      <p class="ord-sum__lbl">배송일시까지 남은시간</p>
      <p class="ord-sum__big ${r.cls}">${r.label}</p>
    </div>
    ${rows.map((x) => (x.action
      ? html`<button type="button" class="ord-sum__row ${x.cls || ""}" data-action="${x.action}"
          ${x.aria ? raw(`aria-label="${escapeHtml(x.aria)}"`) : ""}>
          <span class="ord-sum__k">${x.k}</span>
          <span class="ord-sum__v ${x.empty ? "is-empty" : ""}">${x.v}${x.arrowIn ? "" : " ›"}</span></button>`
      : html`<div class="ord-sum__row">
          <span class="ord-sum__k">${x.k}</span>
          <span class="ord-sum__v" title="${x.v}">${x.v}</span></div>`))}`;
}

/* 이력 카드는 max-height 로 잘린다. 최신이 맨 아래라 새로 쌓인 줄이 접힌 영역에
   숨는다 — 렌더 직후 끝으로 내려 준다. 없으면 아무 일도 하지 않는다. */
export function histScrollEnd(scope) {
  const el = scope && scope.querySelector(".ord-hist");
  if (el) el.scrollTop = el.scrollHeight;
}

export function historyBody(order) {
  const list = Array.isArray(order.history) ? order.history : [];
  if (!list.length) return html`<p class="ord-hist__empty">기록된 처리 이력이 없습니다.</p>`;
  return html`<div class="ord-hist">
    ${list.map((h, i) => html`
      <div class="ord-hist__row ${i === list.length - 1 ? "is-latest" : ""}">
        <span class="ord-hist__dot" style="background:${HIST_DOT[h.type] || "var(--c-text-faint)"}"></span>
        <span class="ord-hist__lbl" title="${h.label}">${h.label}</span>
        <span class="ord-hist__at">${String(h.at).slice(5).replace("-", ".")}</span>
      </div>`)}
  </div>`;
}

/* ── 푸터 ─────────────────────────────────────────────────── */
export function footerV2({ dirty, savedAt }) {
  const stat = savedAt && !dirty ? `저장됨 · ${savedAt}` : dirty ? `수정한 항목 ${dirty}개` : "변경 없음";
  const cls = savedAt && !dirty ? "is-saved" : dirty ? "is-dirty" : "";
  return html`
    <span class="ord-ft__stat ${cls}" data-slot="dirty">${stat}</span>
    <button class="hm-btn hm-btn--secondary" data-action="close">닫기</button>
    <button class="hm-btn hm-btn--primary" data-action="save" ${dirty ? "" : "disabled"}>
      ${dirty ? "변경사항 저장" : "저장"}</button>`;
}

/* ── 주문서 삭제 확인 ────────────────────────────────────────
   되돌릴 수 없는 일이라 체크 한 번을 받는다(시안). note 를 주면 도메인 경고를
   덧붙인다 — B2B 는 그 달 청구의 근거라 반드시 알려야 한다. */
