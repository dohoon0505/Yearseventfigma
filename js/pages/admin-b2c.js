/* ============================================================
   admin-b2c.js — B2C 통합주문관리
   목록(상태 필터·검색·현황 배지) + 읽기 우선 모달(주문 확인이 첫 용도).
   모달 규약:
   - 기존 주문은 읽기 모드로 열림 → [내용 수정]으로 편집 폼 전환.
     수정 취소 시 폼은 저장본으로 되돌리되 레일 값(사진·인수자·메모)은 유지.
   - 우측 처리 레일(현장사진 3:4·인수자·처리 메모)은 모드와 무관하게 항상 활성.
   - 주문접수 처리·주문취소 = 즉시 반영(b2cSetStatus + 슬롯 재렌더).
     저장 = 반영 후 모달 유지(읽기 복귀). 닫기/X/ESC 만 모달을 닫는다.
   - 자동 배송완료: 주문접수 상태 + 사진 + 인수자 → 저장 시 배송완료·알림톡 자동.
   - 신규 등록: 같은 모달, 레일·상태 액션 숨김, 강제 편집 모드, 등록 시 닫힘.
   데이터는 data/b2c-mock.js(세션 유지). 페이지 규약: mount(root, { nav }) → cleanup.
   ============================================================ */
import { html, setHTML, on, qs, qsa, el } from "../dom.js";
import { icon } from "../icons.js";
import { pageTitle, tableGrid, openModal, makeDropdown, openLightbox } from "../ui.js";
import {
  staffNames, B2C_CHANNELS, B2C_STATUSES, B2C_PRODUCTS, B2C_RIBBON_PHRASES,
  B2C_STATUS_STYLE, productPrice, b2cList, b2cUpsert, b2cRemove, b2cSetStatus,
  b2cSetManager, b2cNewId, b2cNextOrderNo,
} from "../data/b2c-mock.js";

const won = (n) => Number(n || 0).toLocaleString("ko-KR") + "원";
const pad = (n) => String(n).padStart(2, "0");
/* datetime-local("2026-07-10T13:30")·저장문자열("2026-07-08 15:20") → "2026-07-10 13:30" */
const fmtFull = (s) => (s ? s.replace("T", " ") : "-");
const dash = (v) => (v != null && String(v).trim() ? v : "-");
/* 값들을 구분자로 연결 — 전부 비면 "-" (읽기 모드 정의행용) */
const joinVals = (sep, ...xs) => {
  const v = xs.filter((x) => x != null && String(x).trim());
  return v.length ? v.join(sep) : "-";
};

const TABS = [{ v: "all", label: "전체" }, ...B2C_STATUSES.map((s) => ({ v: s, label: s }))];
const statusBadge = (s) => {
  const st = B2C_STATUS_STYLE[s] ?? { bg: "var(--c-surface-3)", color: "var(--c-text-4)" };
  return html`<span class="hm-badge" style="background:${st.bg};color:${st.color}">${s}</span>`;
};

function blankOrder() {
  const now = new Date();
  const receivedAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  return {
    id: b2cNewId(), orderNo: b2cNextOrderNo(), receivedAt,
    manager: staffNames()[0] ?? "", channel: B2C_CHANNELS[0],
    ordererName: "", ordererPhone: "", ribbonPhrase: "", ribbonSender: "",
    image: "", product: "", amount: 0,
    deliverAt: "", request: "", recipientName: "", recipientPhone: "",
    address: "", receiver: "", memo: "", status: "접수대기", notified: false,
    cancelFee: 0, cancelReason: "",
  };
}

export function mount(root, { nav }) {
  const state = { tab: "all", search: "" };
  let activeModal = null;
  let editing = null;      // 편집 작업본 (입력은 전부 여기로 write-through)
  let isNew = false;
  let mode = "read";       // "read" | "edit" — 좌측 본문 렌더 모드
  const dds = [];          // makeDropdown 인스턴스 (renderModal 마다 destroy→재생성)
  let toastEl = null, toastTimer = null;

  const findOrder = (id) => b2cList().find((o) => o.id === id);

  function closeModal() {
    const m = activeModal;
    activeModal = null; editing = null;
    if (m) m.close();
  }
  function toast(msg, kind = "ok") {
    if (toastEl) toastEl.remove();
    if (toastTimer) clearTimeout(toastTimer);
    toastEl = el(html`<div class="admin-toast admin-toast--${kind}">${icon(kind === "warn" ? "alert-circle" : "check-circle", { size: 16 })}<span>${msg}</span></div>`);
    document.body.appendChild(toastEl);
    toastTimer = setTimeout(() => { if (toastEl) toastEl.remove(); toastEl = null; toastTimer = null; }, 2600);
  }

  /* ── 목록 ─────────────────────────────────────────────── */
  function filtered() {
    const q = state.search.trim();
    return b2cList().filter((o) => {
      if (state.tab !== "all" && o.status !== state.tab) return false;
      if (q && !(o.ordererName.includes(q) || o.recipientName.includes(q) || o.product.includes(q) || o.orderNo.includes(q))) return false;
      return true;
    });
  }
  function tabsBody() {
    const all = b2cList();
    return TABS.map((t) => {
      const count = t.v === "all" ? all.length : all.filter((o) => o.status === t.v).length;
      const active = state.tab === t.v;
      return html`<button class="chip ${active ? "is-active" : ""}" data-action="tab" data-v="${t.v}">${t.label}<span class="admin-tab-count">${count}</span></button>`;
    });
  }
  function summaryBody() {
    return html`조회 <strong>${filtered().length}</strong>건`;
  }
  /* 컬럼: 주문경로 | 주문접수/배송일시 | 배송지 | 받는분 | 상품 | 금액 | 메모 | 현황(배지) | 사진 | 알림 (+관리) */
  const columns = [
    { label: "주문경로", width: "108px", align: "center", render: (r) => html`<div class="ellipsis b2c-dim">${r.channel}</div>` },
    {
      label: "주문접수 / 배송일시", width: "168px",
      render: (r) => html`<div class="b2c-dt2">
        <span class="b2c-dt2__row"><span class="b2c-dt2__lbl">접수</span><span class="b2c-mono">${fmtFull(r.receivedAt)}</span></span>
        <span class="b2c-dt2__row"><span class="b2c-dt2__lbl b2c-dt2__lbl--dv">배송</span><span class="b2c-mono">${fmtFull(r.deliverAt)}</span></span>
      </div>`,
    },
    { label: "배송지", width: "1.3fr", render: (r) => html`<div class="ellipsis b2c-dim" title="${r.address}">${r.address || "-"}</div>` },
    { label: "받는분", width: "88px", align: "center", render: (r) => html`<div class="ellipsis">${r.recipientName || "-"}</div>` },
    { label: "상품", width: "122px", render: (r) => html`<div class="ellipsis">${r.product || "-"}</div>` },
    { label: "금액", width: "96px", align: "right", render: (r) => html`<span class="b2c-amt">${won(r.amount)}</span>` },
    { label: "메모", width: "1fr", render: (r) => html`<div class="ellipsis b2c-dim" title="${r.memo}">${r.memo || "-"}</div>` },
    { label: "현황", width: "92px", align: "center", render: (r) => statusBadge(r.status) },
    {
      label: "사진", width: "52px", align: "center",
      render: (r) => html`<span class="b2c-flag b2c-flag--photo ${r.image ? "on" : ""}" title="${r.image ? "사진 있음" : "사진 없음"}">${icon("camera", { size: 15 })}</span>`,
    },
    {
      label: "알림", width: "52px", align: "center",
      render: (r) => html`<span class="b2c-flag b2c-flag--noti ${r.notified ? "on" : ""}" title="${r.notified ? "알림 발송완료" : "알림 미발송"}">${icon(r.notified ? "bell" : "bell-off", { size: 15 })}</span>`,
    },
    {
      label: "관리", width: "56px", align: "center",
      render: (r) => html`<button class="ptbl-edit" data-action="edit" data-id="${r.id}" aria-label="편집">${icon("pencil", { size: 14 })}</button>`,
    },
  ];
  function tableBody() {
    const rows = filtered();
    if (rows.length === 0) return html`<div class="admin-empty">조건에 맞는 B2C 주문이 없습니다.</div>`;
    return tableGrid({ columns, rows, rowKey: (r) => r.id, compact: true });
  }

  function render() {
    setHTML(root, html`
      <div class="page-admin page-b2c">
        <div class="admin-inner">
          ${pageTitle({
            imgSrc: "./assets/nav-realtime.png",
            title: "B2C 통합주문관리",
            action: html`<button class="btn btn-secondary" data-action="new">${icon("plus", { size: 14 })} 신규 주문 등록</button>`,
          })}
          <div class="orders-filters">
            <div class="orders-frow orders-frow--1">
              <div class="orders-fgroup">
                <span class="orders-flabel">주문 현황</span>
                <div class="orders-chips" data-slot="tabs">${tabsBody()}</div>
              </div>
            </div>
            <div class="orders-frow orders-frow--3">
              <div class="orders-search">
                <div class="orders-search__lbl">${icon("search", { size: 12, cls: "tint-muted" })}<span>주문 검색</span></div>
                <input type="text" data-search value="${state.search}" placeholder="주문자·수령인·상품·주문번호 검색" />
              </div>
            </div>
          </div>
          <p class="admin-summary" data-slot="summary">${summaryBody()}</p>
          <div data-slot="table">${tableBody()}</div>
        </div>
      </div>
    `);
  }
  const refreshList = () => {
    const tabs = qs(root, "[data-slot='tabs']");
    const sum = qs(root, "[data-slot='summary']");
    const tbl = qs(root, "[data-slot='table']");
    if (tabs) setHTML(tabs, tabsBody());
    if (sum) setHTML(sum, summaryBody());
    if (tbl) setHTML(tbl, tableBody());
  };

  /* ══ 모달 — 읽기 우선(시안 C) ═══════════════════════════ */

  /* 폼 필드 빌더 (표준 .hm-field — 상단 라벨 · 48px 컨트롤) */
  function ddField(label, key, opts = {}) {
    return html`
      <div class="hm-field">
        <label>${label}${opts.req ? html`<span class="req">*</span>` : ""}</label>
        <div class="dd" data-dd-f="${key}">
          <button type="button" class="dd-trigger" aria-haspopup="listbox" aria-expanded="false"></button>
          <div class="dd-panel" role="listbox"></div>
        </div>
      </div>
    `;
  }
  function txtField(label, key, opts = {}) {
    const type = opts.type || "text";
    return html`
      <div class="hm-field">
        <label>${label}${opts.req ? html`<span class="req">*</span>` : ""}</label>
        <input class="hm-input" type="${type}" data-f="${key}" value="${editing[key] ?? ""}"
          ${opts.list ? `list="${opts.list}"` : ""} ${opts.inputmode ? `inputmode="${opts.inputmode}"` : ""}
          placeholder="${opts.placeholder ?? ""}" ${opts.min != null ? `min="${opts.min}"` : ""} />
      </div>
    `;
  }

  /* 헤더 인라인 담당자 컨트롤 — 클릭 시 담당자 지정 모달(선택·입력).
     미지정(API 자동등록)이면 주황 강조로 '지정' 유도. */
  function managerControl() {
    const m = editing?.manager;
    return m
      ? html`<button class="b2c-mgr" data-action="pick-manager">담당 ${m} ${icon("pencil", { size: 12 })}</button>`
      : html`<button class="b2c-mgr b2c-mgr--empty" data-action="pick-manager">${icon("user-plus", { size: 12 })} 담당자 미지정 · 지정하기</button>`;
  }

  /* ── 헤더: 주문번호 강조 + 상태 배지 + 메타(+담당자 컨트롤) + [내용 수정] 토글 ── */
  function headInner() {
    const o = editing;
    if (isNew) {
      return html`
        <div class="b2c-head__main">
          <div class="b2c-head__row"><h3 class="b2c-head__no">신규 B2C 주문 등록</h3></div>
          <p class="b2c-head__meta"><span class="b2c-mono">${o.orderNo}</span> · 주문접수 ${o.receivedAt} · ${managerControl()}</p>
        </div>
        <div class="b2c-head__acts">
          <button class="hm__x" data-action="close" aria-label="닫기">${icon("x", { size: 14 })}</button>
        </div>
      `;
    }
    return html`
      <div class="b2c-head__main">
        <div class="b2c-head__row">
          <h3 class="b2c-head__no b2c-mono">${o.orderNo}</h3>
          ${statusBadge(o.status)}
        </div>
        <p class="b2c-head__meta">${o.channel} · 주문접수 ${o.receivedAt} · ${managerControl()}</p>
      </div>
      <div class="b2c-head__acts">
        <button class="hm-btn hm-btn--secondary b2c-editbtn" data-action="toggle-edit">
          ${mode === "edit" ? html`${icon("x", { size: 13 })} 수정 취소` : html`${icon("pencil", { size: 13 })} 내용 수정`}
        </button>
        <button class="hm__x" data-action="close" aria-label="닫기">${icon("x", { size: 14 })}</button>
      </div>
    `;
  }

  /* ── 읽기 모드: 구역 카드(주문정보 / 발주정보 / 요청사항) + 큰 정의행 ── */
  function readBody() {
    const o = editing;
    const row = (k, v, cls = "") => html`
      <div class="b2c-doc__row">
        <span class="b2c-doc__k">${k}</span>
        <span class="b2c-doc__v ${cls}">${v}</span>
      </div>`;
    return html`
      <div class="b2c-doc">
        <section class="b2c-zone">
          <div class="b2c-zone__t">주문정보</div>
          ${row("주문자", joinVals(" · ", o.ordererName, o.ordererPhone))}
          ${row("주문상품", dash(o.product))}
          ${row("주문금액", won(o.amount), "b2c-doc__v--price")}
        </section>
        <section class="b2c-zone">
          <div class="b2c-zone__t">발주정보</div>
          ${row("배송일시", fmtFull(o.deliverAt))}
          ${row("배송지", dash(o.address), "b2c-doc__v--pre")}
          ${row("받는분", joinVals(" · ", o.recipientName, o.recipientPhone))}
          ${row("리본문구", dash(o.ribbonPhrase))}
          ${row("보내는분", dash(o.ribbonSender))}
        </section>
        <section class="b2c-zone">
          <div class="b2c-zone__t">요청사항</div>
          <p class="b2c-doc__txt">${dash(o.request)}</p>
        </section>
      </div>
    `;
  }

  /* ── 편집 모드: 읽기와 동일한 구역(주문정보/발주정보/요청사항) 안에 표준 폼 ── */
  function editBody() {
    const o = editing;
    return html`
      <div class="b2c-edit">
        <section class="b2c-zone">
          <div class="b2c-zone__t">주문정보</div>
          <div class="b2c-form">
            ${txtField("주문자 성함", "ordererName", { placeholder: "예) 홍길동", req: true })}
            ${txtField("주문자 연락처", "ordererPhone", { placeholder: "010-0000-0000", inputmode: "numeric" })}
            ${ddField("주문상품", "product", { req: true })}
            ${txtField("주문금액 (원)", "amount", { type: "number", min: 0, inputmode: "numeric" })}
            <div class="b2c-form__full">${ddField("주문경로/거래처", "channel")}</div>
          </div>
        </section>
        <section class="b2c-zone">
          <div class="b2c-zone__t">발주정보</div>
          <div class="b2c-form b2c-form--3">
            ${txtField("배송일시", "deliverAt", { type: "datetime-local" })}
            ${txtField("받는분 성함", "recipientName", { placeholder: "예) 故 김○○" })}
            ${txtField("받는분 연락처", "recipientPhone", { placeholder: "010-0000-0000", inputmode: "numeric" })}
            <div class="hm-field b2c-form__full">
              <label>배송지 주소</label>
              <textarea class="hm-input hm-textarea" data-f="address" placeholder="배송지 주소를 입력하세요">${o.address ?? ""}</textarea>
            </div>
            <div class="b2c-form__pair">
              ${txtField("리본문구 (경조사어)", "ribbonPhrase", { placeholder: "예) 삼가 고인의 명복을 빕니다", list: "b2c-phrases" })}
              ${txtField("보내는분 (리본)", "ribbonSender", { placeholder: "예) 홍길동 · ○○회사 임직원 일동" })}
            </div>
          </div>
        </section>
        <section class="b2c-zone">
          <div class="b2c-zone__t">요청사항</div>
          <textarea class="hm-input hm-textarea" data-f="request" placeholder="고객이 남긴 요청사항">${o.request ?? ""}</textarea>
        </section>
        <datalist id="b2c-phrases">${B2C_RIBBON_PHRASES.map((p) => html`<option value="${p}"></option>`)}</datalist>
      </div>
    `;
  }

  /* 현장사진 박스 내부 — 사진(or 빈 안내) + hover 오버레이(업로드·다운로드·확대).
     onImageFile 에서 부분 재렌더에도 재사용하므로 별도 함수. */
  function imgboxInner() {
    const hasImg = !!editing?.image;
    return html`
      ${hasImg
        ? html`<img src="${editing.image}" alt="배송 현장 사진" />`
        : html`<div class="b2c-imgbox__ph">${icon("camera", { size: 22 })}<span>배송 현장 사진 없음</span></div>`}
      <div class="b2c-imgover">
        <button class="b2c-imgact" data-action="img-upload" title="이미지 업로드" aria-label="이미지 업로드">${icon("camera", { size: 18 })}</button>
        ${hasImg ? html`
          <button class="b2c-imgact" data-action="img-download" title="이미지 다운로드" aria-label="이미지 다운로드">${icon("download", { size: 18 })}</button>
          <button class="b2c-imgact" data-action="img-zoom-btn" title="크게 보기" aria-label="크게 보기">${icon("eye", { size: 18 })}</button>
        ` : ""}
      </div>
    `;
  }

  /* ── 처리 레일: 현장사진(3:4) · 인수자 · 처리 메모 — 항상 활성, 신규는 생략 ── */
  function railBody() {
    if (isNew) return "";
    const o = editing;
    const hasImg = !!o.image;
    return html`
      <aside class="b2c-rail b2c-zone">
        <div class="b2c-zone__t">처리 정보</div>
        <div class="b2c-imgbox ${hasImg ? "has" : ""}" data-slot="imgbox" data-action="img-zoom" title="${hasImg ? "클릭하여 크게 보기" : "클릭하여 업로드"}">
          ${imgboxInner()}
        </div>
        <input type="file" accept="image/*" data-img-input hidden />
        ${txtField("인수자 성함", "receiver", { placeholder: "배송 완료 시 실제 인수자" })}
        <div class="hm-field b2c-rail__memo">
          <label>처리 메모</label>
          <textarea class="hm-input hm-textarea" data-f="memo" placeholder="담당자 처리 메모 · 특이사항">${o.memo ?? ""}</textarea>
        </div>
      </aside>
    `;
  }

  /* ── 푸터: 좌(삭제·주문취소) / 우(주문접수 처리 · 저장 · 닫기) ── */
  function footInner() {
    const o = editing;
    if (isNew) {
      return html`
        <button class="hm-btn hm-btn--primary" data-action="save">${icon("save", { size: 14 })} 등록</button>
        <button class="hm-btn hm-btn--secondary" data-action="close">닫기</button>
      `;
    }
    const cancelled = o.status === "취소";
    return html`
      <button class="hm-btn b2c-delbtn" data-action="delete">${icon("trash2", { size: 14 })} 주문서 삭제</button>
      <button class="hm-btn b2c-cancelbtn" data-action="order-cancel" ${cancelled ? "disabled" : ""}>${cancelled ? "취소됨" : "주문취소"}</button>
      ${o.status === "접수대기" ? html`<button class="hm-btn b2c-acceptbtn" data-action="accept">${icon("check", { size: 14 })} 주문접수 처리</button>` : ""}
      <button class="hm-btn hm-btn--primary" data-action="save">${icon("save", { size: 14 })} 저장</button>
      <button class="hm-btn hm-btn--secondary" data-action="close">닫기</button>
    `;
  }

  function modalBody() {
    return html`
      <div class="hm__head b2c-head" data-slot="head">${headInner()}</div>
      <div class="hm__body b2c-body ${isNew ? "b2c-body--new" : ""}">
        <div class="b2c-main">${mode === "edit" ? editBody() : readBody()}</div>
        ${railBody()}
      </div>
      <div class="hm__foot b2c-foot" data-slot="foot">${footInner()}</div>
    `;
  }

  /* ── 드롭다운 생명주기 — renderModal 마다 destroy→재생성 (읽기 모드는 no-op) ── */
  function destroyDds() {
    dds.forEach((d) => d.destroy());
    dds.length = 0;
  }
  function bindDropdowns(panel) {
    const DD_DEFS = {
      manager: { options: () => staffNames() },
      channel: { options: () => B2C_CHANNELS },
      product: {
        options: () => B2C_PRODUCTS.map((p) => p.name),
        label: (v) => (v ? `${v} · ${won(productPrice(v))}` : "상품을 선택하세요"),
        onSet: (v) => {
          const price = productPrice(v);
          if (price > 0) {
            editing.amount = price;
            const amt = qs(panel, "[data-f='amount']");
            if (amt) amt.value = String(price);
          }
        },
      },
    };
    qsa(panel, "[data-dd-f]").forEach((ddRoot) => {
      const key = ddRoot.dataset.ddF;
      const def = DD_DEFS[key];
      dds.push(makeDropdown(ddRoot, {
        options: def.options,
        get: () => editing?.[key] ?? "",
        set: (v) => { if (!editing) return; editing[key] = v; if (def.onSet) def.onSet(v); },
        label: def.label,
      }));
    });
  }
  /* 전체 재렌더(모드 전환·저장 후) — 이벤트는 panel 위임이라 재바인딩 불필요 */
  function renderModal() {
    if (!activeModal) return;
    const panel = activeModal.panel;
    destroyDds();
    setHTML(panel, modalBody());
    if (mode === "edit") bindDropdowns(panel);
  }
  /* 헤더·푸터 슬롯만 재렌더 — 상태 액션(주문접수·취소) 시 편집 중 포커스·dd 보존 */
  function renderSlots(panel) {
    const h = qs(panel, "[data-slot='head']");
    const f = qs(panel, "[data-slot='foot']");
    if (h) setHTML(h, headInner());
    if (f) setHTML(f, footInner());
  }

  function onImageFile(panel, file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) { toast("이미지 파일만 업로드할 수 있습니다", "warn"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      if (!editing) return;
      editing.image = String(reader.result);
      const box = qs(panel, "[data-slot='imgbox']");
      if (box) { box.classList.add("has"); setHTML(box, imgboxInner()); box.title = "클릭하여 크게 보기"; }
      toast("이미지를 업로드했습니다");
    };
    reader.readAsDataURL(file);
  }
  function downloadImage() {
    if (!editing?.image) return;
    const a = document.createElement("a");
    a.href = editing.image;
    a.download = `${editing.orderNo}_배송현장사진`;
    document.body.appendChild(a); a.click(); a.remove();
  }

  /* 저장 — 반영 후 모달 유지(읽기 복귀). 신규만 등록 후 닫힘.
     자동 배송완료: 주문접수 + 사진 + 인수자 → 배송완료·notified (알림톡 자동 발송) */
  function saveOrder() {
    if (!editing) return;
    if ((isNew || mode === "edit") && (!editing.ordererName.trim() || !editing.product)) {
      toast("주문자 성함과 주문상품은 필수입니다", "warn");
      return;
    }
    const merged = { ...editing, amount: Number(editing.amount) || 0, cancelFee: Number(editing.cancelFee) || 0 };
    let autoDone = false;
    if (!isNew && merged.status === "주문접수" && merged.image && String(merged.receiver || "").trim()) {
      merged.status = "배송완료";
      merged.notified = true; // 배송완료 → 알림톡 자동 발송(API)
      autoDone = true;
    }
    b2cUpsert(merged);
    refreshList();
    if (isNew) {
      closeModal();
      toast("신규 주문을 등록했습니다");
      return;
    }
    editing = { ...merged };
    mode = "read";
    renderModal();
    toast(autoDone ? "배송완료 처리됨 · 고객 알림톡이 자동 발송됩니다" : "주문 정보를 저장했습니다");
  }

  /* 연락처 자동 하이픈 (order.js onPhone 과 동일 규칙) */
  function formatPhone(t) {
    let v = t.value.replace(/\D/g, "").slice(0, 11);
    if (v.length > 7) v = v.slice(0, 3) + "-" + v.slice(3, 7) + "-" + v.slice(7);
    else if (v.length > 3) v = v.slice(0, 3) + "-" + v.slice(3);
    t.value = v;
    return v;
  }

  /* ── 담당자 지정 모달 — 별도 창(선택 또는 직접 입력), 메인 위에 스택 ──
     API 자동등록 주문은 담당자 미지정으로 도착 → 열면 이 창이 우선 뜬다.
     지정은 즉시 반영(b2cSetManager). 폼/레일의 다른 미저장 편집은 건드리지 않음. */
  function openManagerModal(mainPanel) {
    if (!editing) return;
    const cur = editing.manager || "";
    const picker = openModal({
      panelClass: "modal-panel--sm modal-panel--b2cmgr",
      body: html`
        <div class="hm__head">
          <div>
            <h3>담당자 지정</h3>
            <p>이 주문을 담당할 직원을 선택하거나 직접 입력하세요.</p>
          </div>
          <button class="hm__x" data-action="mgr-close" aria-label="닫기">${icon("x", { size: 14 })}</button>
        </div>
        <div class="hm__body">
          <div class="hm-field">
            <label>담당자</label>
            <input class="hm-input" data-mgr-input list="b2c-staff-list" value="${cur}" placeholder="담당자 이름" autocomplete="off" />
            <datalist id="b2c-staff-list">${staffNames().map((s) => html`<option value="${s}"></option>`)}</datalist>
            <p class="b2c-mgrhint">${icon("user", { size: 12 })} 목록에서 선택하거나 새 담당자를 직접 입력할 수 있습니다.</p>
          </div>
        </div>
        <div class="hm__foot">
          <button class="hm-btn hm-btn--secondary" data-action="mgr-close">취소</button>
          <button class="hm-btn hm-btn--primary" data-action="mgr-confirm">${icon("check", { size: 14 })} 지정</button>
        </div>
      `,
    });
    const p = picker.panel;
    const input = qs(p, "[data-mgr-input]");
    const confirm = () => {
      const v = (input?.value || "").trim();
      if (!v) { toast("담당자를 선택하거나 입력하세요", "warn"); input?.focus(); return; }
      if (!editing) { picker.close(); return; }
      editing.manager = v;
      b2cSetManager(editing.id, v); // 담당자만 즉시 반영(다른 미저장 편집은 저장 시점까지 보류)
      refreshList();
      if (mainPanel) renderSlots(mainPanel); // 헤더 담당자 표시 갱신(편집 중이면 바디 보존)
      picker.close();
      toast(`담당자를 ${v}(으)로 지정했습니다`);
    };
    on(p, "click", "[data-action='mgr-close']", () => picker.close());
    on(p, "click", "[data-action='mgr-confirm']", () => confirm());
    on(p, "keydown", "[data-mgr-input]", (e) => { if (e.key === "Enter") { e.preventDefault(); confirm(); } });
    if (input) { input.focus(); input.select(); }
  }

  function openEditor(order, _isNew) {
    closeModal();
    editing = { ...order };
    isNew = _isNew;
    mode = isNew ? "edit" : "read"; // 기존 주문은 확인(읽기)이 첫 용도
    activeModal = openModal({
      panelClass: "modal-panel--b2c",
      body: modalBody(),
      onClose: () => { destroyDds(); activeModal = null; editing = null; },
    });
    const panel = activeModal.panel;
    if (mode === "edit") bindDropdowns(panel);

    /* 이벤트는 panel 위임으로 1회만 바인딩 — setHTML 재렌더에도 전부 생존 */
    on(panel, "click", "[data-action='close']", () => closeModal());
    on(panel, "click", "[data-action='save']", () => saveOrder());
    on(panel, "click", "[data-action='delete']", () => {
      if (!editing) return;
      const name = editing.orderNo;
      b2cRemove(editing.id);
      closeModal();
      refreshList();
      toast(`${name} 주문을 삭제했습니다`, "warn");
    });
    /* 읽기 ↔ 편집 전환 — 수정 취소는 폼만 저장본으로 되돌리고 레일 값은 유지 */
    on(panel, "click", "[data-action='toggle-edit']", () => {
      if (!editing) return;
      if (mode === "read") {
        mode = "edit";
      } else {
        const stored = findOrder(editing.id);
        if (stored) editing = { ...stored, image: editing.image, receiver: editing.receiver, memo: editing.memo };
        mode = "read";
      }
      renderModal();
    });
    /* 주문접수 처리 — 즉시 반영. 편집 중 미저장 폼 값은 그대로 버퍼 유지(슬롯만 재렌더) */
    on(panel, "click", "[data-action='accept']", () => {
      if (!editing || editing.status !== "접수대기") return;
      editing.status = "주문접수";
      b2cSetStatus(editing.id, "주문접수");
      refreshList();
      renderSlots(panel);
      toast("주문접수로 변경했습니다");
    });
    /* 주문취소 — 즉시 반영. 재취소 방지 위해 완료 후 비활성 */
    on(panel, "click", "[data-action='order-cancel']", () => {
      if (!editing || editing.status === "취소") return;
      editing.status = "취소";
      b2cSetStatus(editing.id, "취소");
      refreshList();
      renderSlots(panel);
      toast("주문을 취소 처리했습니다", "warn");
    });
    on(panel, "click", "[data-action='img-upload']", () => { const inp = qs(panel, "[data-img-input]"); if (inp) inp.click(); });
    on(panel, "click", "[data-action='img-download']", () => downloadImage());
    on(panel, "click", "[data-action='img-zoom-btn']", () => {
      if (editing?.image) openLightbox({ src: editing.image, alt: "배송 현장 사진", caption: `${editing.orderNo} 배송 현장 사진` });
    });
    /* 현장사진 박스 클릭 → 있으면 라이트박스 확대, 없으면 업로드. 오버레이 버튼 클릭은 제외(각자 처리). */
    on(panel, "click", "[data-action='img-zoom']", (e) => {
      if (!editing || e.target.closest("[data-action='img-upload'], [data-action='img-download'], [data-action='img-zoom-btn']")) return;
      if (editing.image) openLightbox({ src: editing.image, alt: "배송 현장 사진", caption: `${editing.orderNo} 배송 현장 사진` });
      else { const inp = qs(panel, "[data-img-input]"); if (inp) inp.click(); }
    });
    on(panel, "click", "[data-action='pick-manager']", () => openManagerModal(panel));
    on(panel, "input", "input[data-f], textarea[data-f]", (e, t) => {
      if (!editing) return;
      const k = t.dataset.f;
      editing[k] = k === "ordererPhone" || k === "recipientPhone" ? formatPhone(t) : t.value;
    });
    on(panel, "change", "[data-img-input]", (e, t) => {
      onImageFile(panel, t.files && t.files[0]);
      t.value = ""; // 같은 파일 재선택 허용
    });

    /* API 자동등록(담당자 미지정) 주문을 열면 담당자 지정 모달을 우선 노출 */
    if (!isNew && !editing.manager) openManagerModal(panel);
  }

  render();

  /* ── 목록 이벤트 (위임 · root 유지) ────────────────────── */
  const offList = on(root, "click", "[data-action]", (e, t) => {
    const a = t.dataset.action;
    if (a === "tab") { state.tab = t.dataset.v; refreshList(); return; }
    if (a === "new") return openEditor(blankOrder(), true);
    if (a === "edit") { const o = findOrder(t.dataset.id); if (o) openEditor(o, false); return; }
  });
  const offSearch = on(root, "input", "[data-search]", (e, t) => {
    state.search = t.value;
    const sum = qs(root, "[data-slot='summary']");
    const tbl = qs(root, "[data-slot='table']");
    if (sum) setHTML(sum, summaryBody());
    if (tbl) setHTML(tbl, tableBody());
  });

  return () => {
    offList(); offSearch();
    closeModal();
    if (toastEl) toastEl.remove();
    if (toastTimer) clearTimeout(toastTimer);
  };
}
