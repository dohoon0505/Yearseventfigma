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
import { html, setHTML, on, qs, qsa } from "../dom.js";
import { icon } from "../icons.js";
import { makeDropdown, makeDatepicker, makeDateTimePicker, openLightbox } from "../ui.js";
import { HIST_DOT } from "../data/order-history.js";
import { won, pad2, dash, fmtFull, parseFlexDate, dtpMarkup, card, renderFields, autosize } from "./order-fields.js";
import { openRowPicker } from "./order-dialogs.js";
import { openDialog, dlgActions } from "./dialog.js";

/* 폼 프리미티브는 order-fields.js 가 소유한다 — 기존 호출부가 깨지지 않게 재수출만 한다.
   새 코드는 order-fields.js 에서 직접 가져올 것. */
export { won, pad2, dash, fmtFull, parseFlexDate, dtpMarkup, card, renderFields, autosize };

/* 행 열기는 tableGrid 옆(ui.js)이 소유한다 — 상품 규격 안내처럼 주문과 무관한 화면도 쓰는데
   그쪽이 이 모듈을 import 하면 드롭다운·피커·모달 그래프가 통째로 딸려 온다.
   기존 호출부(orders.js · admin-orders.js · admin-b2c.js)가 깨지지 않게 재수출만 한다. */
export { onRowOpen } from "../ui.js";

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
/** 행 전체를 '상세 열기' 로 만든다 — 11열 표에서 오른쪽 끝 연필까지 커서를
    옮기지 않아도 되게. id 는 tableGrid 가 이미 찍어 둔 `data-rowkey` 에서 읽는다
    (`js/ui.js` 를 고칠 필요가 없다).

    가드 두 개가 핵심이다:
      · 안쪽 컨트롤(연필·카메라)은 자기 핸들러가 처리한다 — 안 비켜 가면 모달이 두 번 열린다
      · 드래그로 주소·메모를 긁는 중이면 열지 않는다(mouseup 에서 click 이 뜬다)
    키보드는 셀 안 버튼이 담당한다 — 행에 tabindex 를 달면 Tab 순서에 44개가 끼어든다. */
export const editBtn = (id) =>
  html`<button class="tbl-edit" data-action="edit" data-id="${id}" aria-label="주문 상세">${icon("pencil", { size: 14 })}</button>`;

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
    const reader = new FileReader();
    reader.onload = () => {
      const o = get();
      if (!o) return;
      o.image = String(reader.result);
      const box = qs(panel, "[data-slot='imgbox']");
      if (box) { box.classList.add("has"); setHTML(box, inner()); box.title = "클릭하여 크게 보기"; }
      toast("이미지를 업로드했습니다");
      if (notify) notify();
    };
    reader.readAsDataURL(file);
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

export const ordMenu = () => html`
  <div class="ord-menu" role="menu">
    <button class="ord-menu__item" role="menuitem" data-action="order-cancel">주문취소</button>
    <button class="ord-menu__item ord-menu__item--danger" role="menuitem" data-action="delete">주문서 삭제</button>
  </div>`;

/* 헤더 전체 — 주문번호·상태·메타 / 스테퍼·담당자·더보기·닫기 */
export function ordHeader({ order, meta, statuses, canComplete, menuOpen, isNew }) {
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
        ${menuOpen ? ordMenu() : ""}
      </div>
      <button class="ord-iconbtn hm__x" data-action="close" aria-label="닫기">${icon("x", { size: 14 })}</button>
    </div>`;
}

/* ── 처리 레일(다크) ──────────────────────────────────────── */
export function railV2({ order, imgInner, cap = "배송 현장 기록" }) {
  return html`
    <aside class="ord-side">
      <div class="ord-side__h">
        <b class="ord-side__t">처리</b>
        <span class="ord-side__cap">${cap}</span>
      </div>
      <div class="ord-drop" data-slot="imgbox" data-action="img-zoom"
        title="${order.image ? "클릭하여 크게 보기" : "클릭하여 업로드"}">${imgInner}</div>
      <input type="file" accept="image/*" data-img-input hidden />
      <div class="hm-field">
        <label class="ord-side__lbl">인수자 성함</label>
        <input class="hm-input" data-f="receiver" value="${order.receiver ?? ""}" placeholder="현장에서 수령한 분" />
      </div>
      <div class="hm-field">
        <label class="ord-side__lbl">처리 메모</label>
        <textarea class="hm-input" data-f="memo" placeholder="담당자 처리 메모 · 특이사항">${order.memo ?? ""}</textarea>
      </div>
      <p class="ord-side__note">사진·인수자 저장 시 <b>배송완료</b> 전환 · 알림톡 자동 발송</p>
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

export function summaryBodyV2({ order, rows }) {
  const r = remainOf(order.deliverAt);
  return html`
    <div class="ord-sum__head">
      <p class="ord-sum__lbl">배송일시까지 남은시간</p>
      <p class="ord-sum__big ${r.cls}">${r.label}</p>
    </div>
    ${rows.map((x) => (x.action
      ? html`<button class="ord-sum__row" data-action="${x.action}">
          <span class="ord-sum__k">${x.k}</span>
          <span class="ord-sum__v ${x.empty ? "is-empty" : ""}">${x.v} ›</span></button>`
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
/**
 * 되돌릴 수 없는 삭제 확인 — 체크를 해야 삭제 버튼이 열린다.
 * ⚠️ 주문 전용이 아니다. 거래처 모달도 같은 절차를 쓰므로 문구를 파라미터화했다 —
 *    예전엔 제목이 `주문서를 삭제할까요?` 로 **하드코딩**돼 거래처를 지울 때도
 *    "주문서"라고 물었다(본문은 '주문취소를 사용하세요'까지 권했다).
 *    인자를 안 넘기면 주문 문구가 그대로 나오므로 기존 호출부는 무변화다.
 */
export function openDeleteConfirm({ orderNo, eyebrow, title, desc, note, okLabel, onConfirm }) {
  let ack = false;
  /* 힌트 두 문장은 상수로 묶는다 — 초기 렌더와 토글이 각자 문자열을 적으면
     한쪽만 고쳐져 푸터가 버튼 상태와 다른 말을 하게 된다. */
  const HINT_OFF = "확인에 체크해야 삭제됩니다";
  const HINT_ON = "삭제를 진행할 수 있습니다";
  const d = openDialog({
    /* 에어브로는 **무엇을 지우는지**다 — 주문이면 주문번호(tabular-nums),
       거래처면 호출부가 넘긴 식별자(접속 아이디·회사명)라 숫자 정렬을 끈다. */
    eyebrow: eyebrow ?? orderNo,
    eyebrowNum: eyebrow == null,
    title: title ?? "주문서를 삭제할까요?",
    width: 440,
    /* ⚠️ 섹션 간격(`--sections`)을 쓰지 않는다 — `.dlg-desc + .dlg-note`(12px)와
       `.dlg-check`(16px)가 이미 자기 여백을 갖고 있어 flex `gap:20px` 이 **더해진다**
       (경고가 붙는 B2B 경로에서 32/36px 로 벌어졌다). 간격은 한 곳에서만 준다. */
    body: html`
      <p class="dlg-desc">${desc ?? html`목록과 정산 근거에서 함께 사라지며 되돌릴 수 없습니다.
        기록을 남겨야 한다면 삭제 대신 <b>주문취소</b>를 사용하세요.`}</p>
      ${note ? html`<div class="dlg-note">${note}</div>` : ""}
      <button class="dlg-check" data-action="ack" aria-pressed="false">
        <span class="dlg-check__box" aria-hidden="true"></span>
        <span>되돌릴 수 없음을 확인했습니다</span>
      </button>`,
    hint: HINT_OFF,
    hintBlock: true,
    actions: dlgActions({
      /* 문구는 호출부 계약이 정한다 — 주문이면 '주문서 삭제', 거래처면 '거래처 삭제'.
         제목만 갈아 끼우고 버튼을 '삭제' 로 두면 무엇을 지우는지 마지막 순간에 흐려진다. */
      cancel: "돌아가기", ok: okLabel ?? "주문서 삭제", okIcon: "trash2",
      okClass: "hm-btn--danger", disabled: true,
    }),
  });
  const p = d.panel;
  const chk = qs(p, "[data-action='ack']");
  const go = qs(p, "[data-action='ok']");
  /* 닫기(✕·돌아가기)는 셸이 이미 위임받아 처리한다 — 여기서 또 걸면 두 번 닫는다. */
  on(p, "click", "[data-action='ack']", () => {
    ack = !ack;
    chk.classList.toggle("is-on", ack);
    chk.setAttribute("aria-pressed", ack ? "true" : "false");
    go.disabled = !ack;
    /* 버튼만 흐려 두지 않는다 — 왜 못 누르는지 푸터가 그 자리에서 말한다. */
    d.setHint(ack ? HINT_ON : HINT_OFF, !ack);
  });
  on(p, "click", "[data-action='ok']", () => { if (ack) { d.close(); onConfirm(); } });
  return d;
}
