/* ============================================================
   order-screen.js — 주문 관리 화면 공용 조각.

   통합주문관리(#/admin/b2c)와 거래처 주문관리(#/admin/orders)는 같은 일을
   한다 — 목록 → 필터 → 상세 → 상태 전환. 두 화면이 같은 마크업을 각자
   만들면 반드시 다시 어긋나므로, **같은 픽셀을 그리는 코드**는 여기 모은다.

   ■ 여기 있는 것 — 표기 헬퍼 · 필터 카드 마크업 · 표 셀 렌더러 ·
     모달 셸(헤더 스테퍼·카드·상시편집 필드·다크 레일·요약·이력·푸터) ·
     담당자 지정 · 주문서 삭제 확인.
   ■ 여기 없는 것 — filtered() · columns · 모달 본문 조립 · 저장 규칙.
     데이터 스키마와 도메인 규칙이 달라 억지로 합치면 분기 지옥이 된다.

   짝이 되는 스타일은 css/components.css 의 `.ord-*` 블록(파일 끝).
   ============================================================ */
import { html, setHTML, on, qs, qsa } from "../dom.js";
import { icon } from "../icons.js";
import { openModal, makeDropdown, makeDatepicker, makeDateTimePicker, openLightbox } from "../ui.js";
import { HIST_DOT } from "../data/order-history.js";

/* ── 표기 ──────────────────────────────────────────────── */
export const won = (n) => Number(n || 0).toLocaleString("ko-KR") + "원";
export const pad2 = (n) => String(n).padStart(2, "0");
export const dash = (v) => (v != null && String(v).trim() ? v : "-");

/* 이 프로젝트에는 주문 날짜 포맷이 셋이다 —
     B2C 접수 "2026-09-15 15:20" · B2B 주문 "2026/09/15 09:10"
     배송희망 "2026-09-16T11:00"(datetime-local)
   한 셀에 둘이 같이 들어가므로(접수/배송 2행) 표시 단계에서 모양을 맞춘다.
   ⚠️ 저장 포맷은 건드리지 말 것 — util/date.js 의 parseOrderDate 는
      슬래시로만 쪼갠다. 바꾸면 기간 필터가 통째로 NaN 이 된다. */
export const fmtFull = (s) => (s ? String(s).replace(/\//g, "-").replace("T", " ") : "-");

/* 위 세 포맷을 전부 받는 파서 (없거나 깨지면 null) */
export function parseFlexDate(s) {
  if (!s) return null;
  const [datePart, timePart] = String(s).replace(/\//g, "-").replace("T", " ").split(" ");
  const [y, m, d] = (datePart || "").split("-").map(Number);
  const [hh = 0, mm = 0] = (timePart || "00:00").split(":").map(Number);
  return y && m && d ? new Date(y, m - 1, d, hh, mm) : null;
}


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

/* 배송일시 피커 마크업 — ui.js 의 makeDateTimePicker 와 짝.
   ⚠️ 바깥 껍데기에 `.dd` 를 붙이지 말 것. makeDropdown 이 열릴 때 `.dd.open` 을
      전부 닫으므로, 안에 든 시/분 드롭다운을 여는 순간 달력이 스스로 닫힌다. */
export const dtpMarkup = () => html`
  <div class="ord-dtp" data-dtp>
    <button type="button" class="ord-dtp__trigger" aria-haspopup="dialog" aria-expanded="false"></button>
    <div class="ord-dtp__panel" role="dialog" aria-label="배송일시 선택">
      <div class="cal-head">
        <button type="button" class="cal-nav cal-prev" aria-label="이전 달">‹</button>
        <span class="cal-title"></span>
        <button type="button" class="cal-nav cal-next" aria-label="다음 달">›</button>
      </div>
      <div class="cal-grid"></div>
      <div class="ord-dtp__time">
        <span class="ord-dtp__tlbl">배송 시간</span>
        <div class="ord-dtp__row">
          <div class="dd" data-dtp-h>
            <button type="button" class="dd-trigger" aria-haspopup="listbox" aria-expanded="false"></button>
            <div class="dd-panel" role="listbox"></div>
          </div>
          <span class="ord-dtp__colon">:</span>
          <div class="dd" data-dtp-m>
            <button type="button" class="dd-trigger" aria-haspopup="listbox" aria-expanded="false"></button>
            <div class="dd-panel" role="listbox"></div>
          </div>
        </div>
      </div>
      <div class="ord-dtp__foot">
        <span>
          <span class="ord-dtp__flbl">선택한 배송일시</span>
          <b class="ord-dtp__fval"></b>
        </span>
        <button type="button" class="ord-dtp__done" data-dtp-done>완료</button>
      </div>
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
  html`<button class="ptbl-edit" data-action="edit" data-id="${id}" aria-label="주문 상세">${icon("pencil", { size: 14 })}</button>`;

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
   onPick(v) 가 false 를 돌려주면 토스트 없이 닫기만 한다. ── */
export function openStaffPicker({ current, names, onPick, toast }) {
  /* names 는 **함수**다 — 담당자 목록은 시스템 관리에서 실시간으로 바뀐다.
     정적 배열로 받으면 방금 추가한 담당자가 안 뜬다. */
  const list = names();
  const cur = current || "";
  /* 목록에 없는 기존 담당자(직원이 삭제된 경우)는 맨 위에 남겨 둔다 —
     조용히 다른 사람으로 재배정되는 것이 가장 나쁜 결과다. */
  const orphan = cur && !list.some((s) => s.name === cur);
  const rows = orphan ? [{ name: cur, dept: "목록에 없음", orphan: true }, ...list] : list;
  let pick = cur || "";
  const m = openModal({
    panelClass: "modal-panel--ordconfirm",
    body: html`
      <div class="hm__head">
        <div>
          <h3 id="modal-title">담당자 지정</h3>
          <p>이 주문을 담당할 직원을 선택하세요.</p>
        </div>
        <button class="hm__x" data-action="close" aria-label="닫기">${icon("x", { size: 14 })}</button>
      </div>
      <div class="hm__body">
        <div class="odlg-rows" role="radiogroup" aria-label="담당자">
          ${rows.map((s) => html`
            <button class="odlg-row ${s.name === pick ? "is-sel" : ""} ${s.orphan ? "odlg-row--orphan" : ""}"
              data-pick="${s.name}" role="radio" aria-checked="${s.name === pick ? "true" : "false"}">
              <span class="odlg-row__name">${s.name}</span>
              <span class="odlg-row__dept">${s.dept}</span>
            </button>`)}
        </div>
      </div>
      <div class="hm__foot">
        <button class="hm-btn hm-btn--secondary" data-action="close">취소</button>
        <button class="hm-btn hm-btn--primary" data-action="mgr-go" ${pick ? "" : "disabled"}>
          ${icon("check", { size: 14 })} 지정</button>
      </div>`,
    labelledBy: "modal-title",
  });
  const p = m.panel;
  const go = qs(p, "[data-action='mgr-go']");
  on(p, "click", "[data-action='close']", () => m.close());
  on(p, "click", "[data-pick]", (e, t) => {
    pick = t.dataset.pick;
    qsa(p, "[data-pick]").forEach((b) => {
      const on_ = b.dataset.pick === pick;
      b.classList.toggle("is-sel", on_);
      b.setAttribute("aria-checked", on_ ? "true" : "false");
    });
    go.disabled = false;
  });
  on(p, "click", "[data-action='mgr-go']", () => {
    if (!pick) { toast("담당자를 선택하세요", "warn"); return; }
    if (onPick(pick) === false) { m.close(); return; }
    m.close();
    toast(`담당자를 ${pick}(으)로 지정했습니다`);
  });
  return m;
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

/* ── 카드 ─────────────────────────────────────────────────── */
export const card = ({ title, cap, body, slot }) => html`
  <section class="ord-card">
    <div class="ord-card__head">
      <b class="ord-card__t">${title}</b>
      ${cap ? html`<span class="ord-card__cap">${cap}</span>` : ""}
    </div>
    <div data-slot="${slot || ""}">${body}</div>
  </section>`;

/* ── 상시 편집 필드 ───────────────────────────────────────────
   서술자: { k, label, type, full, lock, ph, options, fmt, value }
   type: text · tel · num · won · select · datetime · textarea · static
   full:true 는 단독 행(96px + 1fr), 아니면 두 개씩 묶어 한 행(96/1fr/96/1fr). */
function fieldCell(d, order) {
  const v = d.value ? d.value(order) : (order[d.k] ?? "");
  if (d.type === "static" || d.lock) {
    const cls = "ord-in ord-in--lock" + (d.type === "won" ? " ord-in--won" : "");
    return html`<input class="${cls}" value="${d.type === "won" ? won(v) : v}" data-slot="${d.k || d.label}" disabled />`;
  }
  if (d.type === "select") {
    /* 셸(.ord-fdd)만 남기고 트리거는 클래스를 안 준다 — 공용 `.modal-panel .dd-trigger`
       (0,2,0)가 어차피 이기므로, 톤은 아래 .ord-fdd 스코프 규칙에서 되돌린다. */
    return html`<div class="dd ord-fdd" data-dd-f="${d.k}">
      <button type="button" class="dd-trigger" aria-haspopup="listbox" aria-expanded="false"></button>
      <div class="dd-panel" role="listbox"></div>
    </div>`;
  }
  if (d.type === "datetime") return dtpMarkup();
  if (d.type === "textarea") {
    return html`<textarea class="ord-in" data-f="${d.k}" rows="1" placeholder="${d.ph ?? ""}">${v}</textarea>`;
  }
  const extra = d.type === "won" ? " ord-in--won" : d.type === "tel" || d.type === "num" ? " ord-in--num" : "";
  const numeric = d.type === "tel" || d.type === "num" || d.type === "won";
  return html`<input class="ord-in${extra}" data-f="${d.k}" value="${d.type === "won" ? won(v) : v}"
    inputmode="${numeric ? "numeric" : "text"}" placeholder="${d.ph ?? ""}" />`;
}

export function renderFields(defs, order) {
  const out = [];
  let buf = [];
  const flush = () => {
    if (!buf.length) return;
    const top = buf.some((d) => d.type === "textarea");
    out.push(html`<div class="ord-row ${buf.length === 1 ? "ord-row--full" : ""} ${top ? "ord-row--top" : ""}">
      ${buf.map((d) => html`<label class="ord-k">${d.label}</label>${fieldCell(d, order)}`)}
    </div>`);
    buf = [];
  };
  for (const d of defs) {
    if (d.full) { flush(); buf = [d]; flush(); continue; }
    buf.push(d);
    if (buf.length === 2) flush();
  }
  flush();
  return out;
}

/* 자동 높이 textarea — 붙여넣기로 줄이 늘어도 스크롤바가 생기지 않게 */
export const autosize = (el) => {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = Math.max(34, el.scrollHeight) + "px";
};

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
export function openDeleteConfirm({ orderNo, note, onConfirm }) {
  let ack = false;
  const m = openModal({
    panelClass: "modal-panel--ordconfirm",
    body: html`
      <div class="hm__head">
        <div>
          <p class="hm-eyebrow ord-mono">${orderNo}</p>
          <h3 id="modal-title">주문서를 삭제할까요?</h3>
        </div>
        <button class="hm__x" data-action="close" aria-label="닫기">${icon("x", { size: 14 })}</button>
      </div>
      <div class="hm__body">
        <p class="odlg-desc">목록과 정산 근거에서 함께 사라지며 되돌릴 수 없습니다.
          기록을 남겨야 한다면 삭제 대신 <b>주문취소</b>를 사용하세요.</p>
        ${note ? html`<div class="hm-warn" style="margin-top:12px">${note}</div>` : ""}
        <button class="odlg-check" data-action="ack" aria-pressed="false">
          <span class="odlg-check__box"></span>
          <span>되돌릴 수 없음을 확인했습니다</span>
        </button>
      </div>
      <div class="hm__foot">
        <button class="hm-btn hm-btn--secondary" data-action="close">돌아가기</button>
        <button class="hm-btn hm-btn--danger" data-action="del-go" disabled>${icon("trash2", { size: 14 })} 삭제</button>
      </div>`,
    labelledBy: "modal-title",
  });
  const p = m.panel;
  const chk = qs(p, "[data-action='ack']");
  const go = qs(p, "[data-action='del-go']");
  on(p, "click", "[data-action='close']", () => m.close());
  on(p, "click", "[data-action='ack']", () => {
    ack = !ack;
    chk.classList.toggle("is-on", ack);
    chk.setAttribute("aria-pressed", ack ? "true" : "false");
    go.disabled = !ack;
  });
  on(p, "click", "[data-action='del-go']", () => { if (ack) { m.close(); onConfirm(); } });
  return m;
}
