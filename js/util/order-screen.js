/* ============================================================
   order-screen.js — 주문 관리 화면 공용 조각.

   통합주문관리(#/admin/b2c)와 거래처 주문관리(#/admin/orders)는 같은 일을
   한다 — 목록 → 필터 → 상세 → 상태 전환. 두 화면이 같은 마크업을 각자
   만들면 반드시 다시 어긋나므로, **같은 픽셀을 그리는 코드**는 여기 모은다.

   ■ 여기 있는 것 — 표기 헬퍼 · 필터 카드 마크업 · 표 셀 렌더러 ·
     모달 구역/정의행/필드 · 처리 레일(현장사진) · 담당자 지정 모달.
   ■ 여기 없는 것 — filtered() · columns · 모달 본문 조립 · 저장 규칙.
     데이터 스키마와 도메인 규칙이 달라 억지로 합치면 분기 지옥이 된다.

   짝이 되는 스타일은 css/components.css 의 `.ord-*` 블록(파일 끝).
   ============================================================ */
import { html, setHTML, on, qs } from "../dom.js";
import { icon } from "../icons.js";
import { openModal, makeDropdown, makeDatepicker, openLightbox } from "../ui.js";

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

/* 값들을 구분자로 연결 — 전부 비면 "-" (읽기 모드 정의행용) */
export const joinVals = (sep, ...xs) => {
  const v = xs.filter((x) => x != null && String(x).trim());
  return v.length ? v.join(sep) : "-";
};

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
  html`<button class="ptbl-edit" data-action="edit" data-id="${id}" aria-label="주문 상세">${icon("pencil", { size: 14 })}</button>`;

/* ── 모달 조각 ─────────────────────────────────────────── */
export const zone = (title, inner, extra = "") => html`
  <section class="ord-zone ${extra}">
    <div class="ord-zone__t">${title}</div>
    ${inner}
  </section>`;

export const docRow = (k, v, cls = "") => html`
  <div class="ord-doc__row">
    <span class="ord-doc__k">${k}</span>
    <span class="ord-doc__v ${cls}">${v}</span>
  </div>`;

export function ddField(label, key, opts = {}) {
  return html`
    <div class="hm-field">
      <label>${label}${opts.req ? html`<span class="req">*</span>` : ""}</label>
      <div class="dd" data-dd-f="${key}">
        <button type="button" class="dd-trigger" aria-haspopup="listbox" aria-expanded="false"></button>
        <div class="dd-panel" role="listbox"></div>
      </div>
    </div>`;
}

export function txtField(label, key, value, opts = {}) {
  const type = opts.type || "text";
  return html`
    <div class="hm-field">
      <label>${label}${opts.req ? html`<span class="req">*</span>` : ""}</label>
      <input class="hm-input" type="${type}" data-f="${key}" value="${value ?? ""}"
        ${opts.list ? `list="${opts.list}"` : ""} ${opts.inputmode ? `inputmode="${opts.inputmode}"` : ""}
        placeholder="${opts.placeholder ?? ""}" ${opts.min != null ? `min="${opts.min}"` : ""} />
    </div>`;
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
    };
    reader.readAsDataURL(file);
  };

  const bind = (panel) => {
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

/* 처리 레일 — 현장사진 3:4 · 인수자 · 처리 메모. 읽기/편집 모드와 무관하게 항상 활성. */
export function railBody({ order, imgInner, receiverLabel = "인수자 성함", receiverPh = "배송 완료 시 실제 인수자" }) {
  return html`
    <aside class="ord-rail ord-zone">
      <div class="ord-zone__t">처리 정보</div>
      <div class="ord-imgbox ${order.image ? "has" : ""}" data-slot="imgbox" data-action="img-zoom"
           title="${order.image ? "클릭하여 크게 보기" : "클릭하여 업로드"}">${imgInner}</div>
      <input type="file" accept="image/*" data-img-input hidden />
      ${txtField(receiverLabel, "receiver", order.receiver, { placeholder: receiverPh })}
      <div class="hm-field ord-rail__memo">
        <label>처리 메모</label>
        <textarea class="hm-input hm-textarea" data-f="memo" placeholder="담당자 처리 메모 · 특이사항">${order.memo ?? ""}</textarea>
      </div>
    </aside>`;
}

/* 헤더 인라인 담당자 컨트롤 — 미지정이면 주황 강조로 '지정' 유도. */
export const managerControl = (name) =>
  name
    ? html`<button class="ord-mgr" data-action="pick-manager">담당 ${name} ${icon("pencil", { size: 12 })}</button>`
    : html`<button class="ord-mgr ord-mgr--empty" data-action="pick-manager">${icon("user-plus", { size: 12 })} 담당자 미지정 · 지정하기</button>`;

/* ── 담당자 지정 모달 — 메인 위에 스택. 지정은 즉시 반영하고
   폼·레일의 다른 미저장 편집은 건드리지 않는다.
   onPick(v) 가 false 를 돌려주면 토스트 없이 닫기만 한다. ── */
export function openStaffPicker({ current, names, onPick, toast }) {
  const DIRECT = "직접 입력…";
  const cur = current || "";
  /* names 는 **함수**다 — 담당자 목록은 시스템 관리에서 실시간으로 바뀌므로
     열 때마다 다시 읽어야 한다(정적 배열로 받으면 방금 추가한 담당자가 안 뜬다). */
  const list = names();
  /* 현재값이 목록에 있으면 그 값, 목록 밖 커스텀이면 '직접 입력…'(+프리필), 미지정이면 첫 직원 */
  let pick = list.includes(cur) ? cur : cur ? DIRECT : list[0] ?? DIRECT;
  let dd = null;
  const picker = openModal({
    panelClass: "modal-panel--sm modal-panel--ordmgr",
    body: html`
      <div class="hm__head">
        <div>
          <h3>담당자 지정</h3>
          <p>이 주문을 담당할 직원을 선택하세요.</p>
        </div>
        <button class="hm__x" data-action="mgr-close" aria-label="닫기">${icon("x", { size: 14 })}</button>
      </div>
      <div class="hm__body">
        <div class="hm-field">
          <label>담당자</label>
          <div class="dd" data-mgr-dd>
            <button type="button" class="dd-trigger" aria-haspopup="listbox" aria-expanded="false"></button>
            <div class="dd-panel" role="listbox"></div>
          </div>
        </div>
        <div class="hm-field" data-mgr-custom ${pick === DIRECT ? "" : "hidden"}>
          <label>담당자 이름</label>
          <input class="hm-input" data-mgr-input value="${pick === DIRECT ? cur : ""}" placeholder="예) 한신입" autocomplete="off" />
        </div>
        <p class="ord-mgrhint">${icon("user", { size: 12 })} 목록에 없는 담당자는 ‘${DIRECT}’을 선택해 입력하세요.</p>
      </div>
      <div class="hm__foot">
        <button class="hm-btn hm-btn--secondary" data-action="mgr-close">취소</button>
        <button class="hm-btn hm-btn--primary" data-action="mgr-confirm">${icon("check", { size: 14 })} 지정</button>
      </div>
    `,
    onClose: () => { if (dd) dd.destroy(); }, // 문서 리스너 정리
  });
  const p = picker.panel;
  const customField = qs(p, "[data-mgr-custom]");
  const input = qs(p, "[data-mgr-input]");
  /* '직접 입력…' 선택 시에만 텍스트 입력 필드 노출(+포커스) */
  const syncCustom = () => {
    const direct = pick === DIRECT;
    if (customField) customField.hidden = !direct;
    if (direct && input) { input.focus(); input.select(); }
  };
  dd = makeDropdown(qs(p, "[data-mgr-dd]"), {
    options: () => [...names(), DIRECT],
    get: () => pick,
    set: (v) => { pick = v; syncCustom(); },
  });
  const confirm = () => {
    const v = pick === DIRECT ? (input?.value || "").trim() : pick;
    if (!v) { toast("담당자를 선택하거나 입력하세요", "warn"); if (pick === DIRECT) input?.focus(); return; }
    if (onPick(v) === false) { picker.close(); return; }
    picker.close();
    toast(`담당자를 ${v}(으)로 지정했습니다`);
  };
  on(p, "click", "[data-action='mgr-close']", () => picker.close());
  on(p, "click", "[data-action='mgr-confirm']", () => confirm());
  on(p, "keydown", "[data-mgr-input]", (e) => { if (e.key === "Enter") { e.preventDefault(); confirm(); } });
  if (pick === DIRECT && input) { input.focus(); input.select(); }
  return picker;
}
