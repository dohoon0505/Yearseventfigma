/* ============================================================
   admin-b2c.js — B2C 통합주문관리
   모든 B2C 주문을 나열(상태 필터·검색·인라인 현황처리)하고,
   넓은 가로형 모달 에디터에서 21개 항목을 섹션별 다열 그리드로 편집한다.
   - 목록은 상시 렌더(root). 편집/신규는 openModal(document.body) 로 오픈.
   - 데이터는 data/b2c-mock.js(세션 유지). 이미지 업로드/다운로드/프리뷰,
     주소검색(데모 스텁), 상품→금액 자동채움, 취소섹션 강조.
   페이지 규약: mount(root, { nav }) → cleanup.
   ============================================================ */
import { html, setHTML, on, qs, qsa, el } from "../dom.js";
import { icon } from "../icons.js";
import { pageTitle, tableGrid, openModal, makeDropdown, openLightbox } from "../ui.js";
import {
  B2C_STAFF, B2C_CHANNELS, B2C_STATUSES, B2C_PRODUCTS, B2C_RIBBON_PHRASES,
  B2C_STATUS_STYLE, productPrice, b2cList, b2cUpsert, b2cRemove, b2cSetStatus,
  b2cNewId, b2cNextOrderNo,
} from "../data/b2c-mock.js";

const won = (n) => Number(n || 0).toLocaleString("ko-KR") + "원";
const pad = (n) => String(n).padStart(2, "0");
/* datetime-local("2026-07-10T13:30")·저장문자열("2026-07-08 15:20") → "2026-07-10 13:30" */
const fmtFull = (s) => (s ? s.replace("T", " ") : "-");

const TABS = [{ v: "all", label: "전체" }, ...B2C_STATUSES.map((s) => ({ v: s, label: s }))];
const statusColor = (s) => (B2C_STATUS_STYLE[s] ?? { color: "var(--c-text-4)" }).color;

function blankOrder() {
  const now = new Date();
  const receivedAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  return {
    id: b2cNewId(), orderNo: b2cNextOrderNo(), receivedAt,
    manager: B2C_STAFF[0], channel: B2C_CHANNELS[0],
    ordererName: "", ordererPhone: "", ribbonPhrase: "", ribbonSender: "",
    image: "", product: "", amount: 0,
    deliverAt: "", request: "", recipientName: "", recipientPhone: "",
    address: "", receiver: "", memo: "", status: "접수", notified: false,
    cancelFee: 0, cancelReason: "",
  };
}

export function mount(root, { nav }) {
  const state = { tab: "all", search: "" };
  let activeModal = null;
  let editing = null; // 편집 작업본
  let isNew = false;
  let toastEl = null, toastTimer = null;

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
  /* 컬럼: 주문경로 | 주문일시 | 배송요청일시 | 배송지 | 받는분 | 상품 | 금액 | 메모 | 현황 | 사진 | 알림 (+관리) */
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
    {
      label: "현황", width: "100px", align: "center",
      render: (r) => html`<select class="select b2c-statussel" data-status-id="${r.id}" aria-label="배송 현황" style="color:${statusColor(r.status)};font-weight:600">
        ${B2C_STATUSES.map((s) => html`<option value="${s}" ${r.status === s ? "selected" : ""}>${s}</option>`)}
      </select>`,
    },
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

  /* ── 에디터 모달 (가로형 넓은 규격 · HModal 필드 규격) ──────
     select 류는 전부 ui.js makeDropdown(커스텀 드롭다운) — openEditor에서 연결. */
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

  /* 현장사진 박스 내부 — 사진(or 빈 안내) + hover 오버레이(업로드·다운로드).
     onImageFile 에서 부분 재렌더에도 재사용하므로 별도 함수. */
  function imgboxInner() {
    const hasImg = !!editing?.image;
    return html`
      ${hasImg
        ? html`<img src="${editing.image}" alt="배송 현장 사진" />`
        : html`<div class="b2c-imgbox__ph">${icon("camera", { size: 22 })}<span>배송 현장 사진 없음</span></div>`}
      <div class="b2c-imgover">
        <button class="b2c-imgact" data-action="img-upload" title="이미지 업로드" aria-label="이미지 업로드">${icon("camera", { size: 18 })}</button>
        ${hasImg ? html`<button class="b2c-imgact" data-action="img-download" title="이미지 다운로드" aria-label="이미지 다운로드">${icon("download", { size: 18 })}</button>` : ""}
      </div>
    `;
  }

  /* 와이어프레임 3열 레이아웃:
     좌(주문 접수·내부 메모) · 중앙(주문·배송·리본·요청 + 취소존) · 우(인수자 정보 — 현장사진·인수자·배송완료 액션 레일) */
  function editorBody() {
    const o = editing;
    const hasImg = !!o.image;
    const done = o.status === "배송완료";
    return html`
      <div class="hm__head">
        <div>
          <h3>${isNew ? "신규 B2C 주문 등록" : "B2C주문 조회/수정"}</h3>
          <p><span class="b2c-mono">${o.orderNo}</span> · 주문접수 ${o.receivedAt}</p>
        </div>
        <button class="hm__x" data-action="close" aria-label="닫기">${icon("x", { size: 14 })}</button>
      </div>

      <div class="hm__body b2c-body">
        <!-- ① 좌: 주문 접수 정보 + 내부 메모 (라벨 좌측 · 컴팩트 행) -->
        <section class="b2c-sec b2c-sec--left">
          <div class="b2c-sec__t">주문 접수 정보</div>
          ${ddField("주문 담당자", "manager")}
          ${ddField("주문경로/거래처", "channel")}
          ${txtField("주문자 성함", "ordererName", { placeholder: "예) 홍길동", req: true })}
          ${txtField("주문자 연락처", "ordererPhone", { placeholder: "010-0000-0000", inputmode: "numeric" })}
          <div class="hm-field b2c-field--grow">
            <label>처리 메모</label>
            <textarea class="hm-input hm-textarea" data-f="memo" placeholder="담당자 처리 메모 · 특이사항">${o.memo ?? ""}</textarea>
          </div>
        </section>

        <!-- ② 중앙: 주문 · 배송 정보 -->
        <section class="b2c-sec b2c-sec--mid">
          <div class="b2c-sec__t">주문 · 배송 정보</div>
          <div class="b2c-grid b2c-grid--2">
            ${ddField("주문상품", "product", { req: true })}
            ${txtField("상품금액 (원)", "amount", { type: "number", min: 0, inputmode: "numeric" })}
          </div>
          <div class="b2c-grid b2c-grid--2">
            ${txtField("경조사어 (리본)", "ribbonPhrase", { placeholder: "예) 삼가 고인의 명복을 빕니다", list: "b2c-phrases" })}
            ${txtField("보내는분 (리본)", "ribbonSender", { placeholder: "예) 홍길동 · ○○회사 임직원 일동" })}
          </div>
          <div class="b2c-grid b2c-grid--2">
            ${txtField("받는분 성함", "recipientName", { placeholder: "예) 故 김○○" })}
            ${txtField("받는분 연락처", "recipientPhone", { placeholder: "010-0000-0000", inputmode: "numeric" })}
          </div>
          <div class="b2c-grid b2c-grid--dt">
            ${txtField("배송일시", "deliverAt", { type: "datetime-local" })}
            <div class="hm-field b2c-addr">
              <label>배송지</label>
              <div class="b2c-addr__row">
                <input class="hm-input" type="text" data-f="address" value="${o.address ?? ""}" placeholder="배송지 주소를 입력하세요" />
                <button class="hm-btn hm-btn--secondary b2c-addrbtn" data-action="addr-search">${icon("map-pin", { size: 14 })} 검색</button>
              </div>
            </div>
          </div>
          <div class="hm-field b2c-field--grow">
            <label>요청사항</label>
            <textarea class="hm-input hm-textarea" data-f="request" placeholder="고객이 남긴 요청사항">${o.request ?? ""}</textarea>
          </div>
          <div class="b2c-cancelzone ${o.status === "취소" ? "is-active" : ""}">
            <div class="b2c-cancelzone__t">취소 처리 <span class="b2c-sec__hint">상태가 ‘취소’일 때 적용됩니다</span></div>
            <div class="b2c-grid b2c-grid--2">
              ${txtField("취소수수료", "cancelFee", { type: "number", min: 0, inputmode: "numeric" })}
              ${txtField("취소사유", "cancelReason", { placeholder: "예) 고객 단순 변심" })}
            </div>
          </div>
        </section>

        <!-- ③ 우: 인수자 정보 — 현장사진 · 인수자 · 배송완료 처리 레일 -->
        <section class="b2c-sec b2c-sec--right">
          <div class="b2c-sec__t">인수자 정보</div>
          <div class="b2c-imgbox ${hasImg ? "has" : ""}" data-slot="imgbox" data-action="img-zoom" title="${hasImg ? "클릭하여 크게 보기" : "클릭하여 업로드"}">
            ${imgboxInner()}
          </div>
          <input type="file" accept="image/*" data-img-input hidden />
          ${txtField("인수자 성함", "receiver", { placeholder: "배송 완료 시 실제 인수자" })}
          <button class="hm-btn hm-btn--ok b2c-donebtn" data-action="deliver-done" ${done ? "disabled" : ""}>
            ${icon("check", { size: 15 })} ${done ? "배송완료" : "배송완료 처리"}
          </button>
          <p class="b2c-notihint">${icon("bell", { size: 12 })} 배송완료 시 고객 알림톡이 자동 발송됩니다</p>
        </section>
      </div>

      <div class="hm__foot b2c-foot">
        ${!isNew ? html`<button class="hm-btn hm-btn--danger b2c-delbtn" data-action="delete">${icon("trash2", { size: 14 })} 삭제</button>` : ""}
        <button class="hm-btn hm-btn--secondary" data-action="close">취소</button>
        <button class="hm-btn hm-btn--primary" data-action="save">${icon("save", { size: 14 })} 저장</button>
      </div>

      <datalist id="b2c-phrases">${B2C_RIBBON_PHRASES.map((p) => html`<option value="${p}"></option>`)}</datalist>
    `;
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
    a.download = `${editing.orderNo}_상품이미지`;
    document.body.appendChild(a); a.click(); a.remove();
  }
  function saveEditor() {
    if (!editing) return;
    if (!editing.ordererName.trim() || !editing.product) {
      toast("주문자 성함과 주문상품은 필수입니다", "warn");
      return;
    }
    b2cUpsert({ ...editing, amount: Number(editing.amount) || 0, cancelFee: Number(editing.cancelFee) || 0 });
    const wasNew = isNew;
    closeModal();
    refreshList();
    toast(wasNew ? "신규 주문을 등록했습니다" : "주문 정보를 저장했습니다");
  }

  /* 취소 처리 존: 상태='취소'일 때만 활성(강조 + 입력 가능) */
  function syncCancelSection(panel) {
    const isCancel = editing?.status === "취소";
    const sec = qs(panel, ".b2c-cancelzone");
    if (sec) sec.classList.toggle("is-active", isCancel);
    ["cancelFee", "cancelReason"].forEach((k) => {
      const inp = qs(panel, `[data-f='${k}']`);
      if (inp) inp.disabled = !isCancel;
    });
  }
  /* 배송완료 버튼: 현재 상태와 동기화(완료면 비활성 + 라벨 전환) */
  function syncDoneBtn(panel) {
    const b = qs(panel, "[data-action='deliver-done']");
    if (!b) return;
    const done = editing?.status === "배송완료";
    b.disabled = done;
    setHTML(b, html`${icon("check", { size: 15 })} ${done ? "배송완료" : "배송완료 처리"}`);
  }
  /* 연락처 자동 하이픈 (order.js onPhone 과 동일 규칙) */
  function formatPhone(t) {
    let v = t.value.replace(/\D/g, "").slice(0, 11);
    if (v.length > 7) v = v.slice(0, 3) + "-" + v.slice(3, 7) + "-" + v.slice(7);
    else if (v.length > 3) v = v.slice(0, 3) + "-" + v.slice(3);
    t.value = v;
    return v;
  }

  function openEditor(order, _isNew) {
    closeModal();
    editing = { ...order };
    isNew = _isNew;
    const dds = [];
    activeModal = openModal({
      panelClass: "modal-panel--b2c",
      body: editorBody(),
      onClose: () => { dds.forEach((d) => d.destroy()); activeModal = null; editing = null; },
    });
    const panel = activeModal.panel;

    /* select 류 → 공용 커스텀 드롭다운 (모달 닫힐 때 destroy) */
    const DD_DEFS = {
      manager: { options: () => B2C_STAFF },
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
    const ddMap = {};
    qsa(panel, "[data-dd-f]").forEach((root) => {
      const key = root.dataset.ddF;
      const def = DD_DEFS[key];
      const inst = makeDropdown(root, {
        options: def.options,
        get: def.get || (() => editing?.[key] ?? ""),
        set: def.set || ((v) => { if (!editing) return; editing[key] = v; if (def.onSet) def.onSet(v); }),
        label: def.label,
      });
      ddMap[key] = inst;
      dds.push(inst);
    });
    syncCancelSection(panel);

    // 모달은 document.body 에 붙으므로 에디터 이벤트는 panel 에 바인딩(패널 제거 시 함께 정리).
    on(panel, "click", "[data-action='close']", () => closeModal());
    on(panel, "click", "[data-action='save']", () => saveEditor());
    on(panel, "click", "[data-action='delete']", () => {
      if (!editing) return;
      const name = editing.orderNo;
      b2cRemove(editing.id);
      closeModal();
      refreshList();
      toast(`${name} 주문을 삭제했습니다`, "warn");
    });
    on(panel, "click", "[data-action='img-upload']", () => { const inp = qs(panel, "[data-img-input]"); if (inp) inp.click(); });
    on(panel, "click", "[data-action='img-download']", () => downloadImage());
    /* 현장사진 클릭 → 있으면 라이트박스 확대, 없으면 업로드. hover 오버레이 버튼 클릭은 제외(각자 처리). */
    on(panel, "click", "[data-action='img-zoom']", (e) => {
      if (!editing || e.target.closest("[data-action='img-upload'], [data-action='img-download']")) return;
      if (editing.image) openLightbox({ src: editing.image, alt: "배송 현장 사진", caption: `${editing.orderNo} 배송 현장 사진` });
      else { const inp = qs(panel, "[data-img-input]"); if (inp) inp.click(); }
    });
    /* 배송완료 처리 — 인수자 확인 후 원클릭 완료(저장 시 반영). 알림톡 자동 발송(API) 처리.
       현황의 그 외 전환(접수/처리중/취소)은 목록 인라인 셀렉트에서 수행. */
    on(panel, "click", "[data-action='deliver-done']", () => {
      if (!editing || editing.status === "배송완료") return;
      editing.status = "배송완료";
      editing.notified = true; // 배송완료 → 알림톡 자동 발송
      syncCancelSection(panel);
      syncDoneBtn(panel);
      toast("배송완료로 변경했습니다 · 알림톡이 발송됩니다 (저장 시 반영)");
    });
    on(panel, "click", "[data-action='addr-search']", () => {
      toast("주소 검색 API 연동 예정입니다 (데모)", "warn");
      const inp = qs(panel, "[data-f='address']"); if (inp) inp.focus();
    });
    on(panel, "input", "input[data-f], textarea[data-f]", (e, t) => {
      if (!editing) return;
      const k = t.dataset.f;
      editing[k] = k === "ordererPhone" || k === "recipientPhone" ? formatPhone(t) : t.value;
    });
    on(panel, "change", "[data-img-input]", (e, t) => {
      onImageFile(panel, t.files && t.files[0]);
      t.value = ""; // 같은 파일 재선택 허용
    });
  }

  render();

  /* ── 목록 이벤트 (위임 · root 유지) ────────────────────── */
  const findOrder = (id) => b2cList().find((o) => o.id === id);
  const offList = on(root, "click", "[data-action]", (e, t) => {
    const a = t.dataset.action;
    if (a === "tab") { state.tab = t.dataset.v; refreshList(); return; }
    if (a === "new") return openEditor(blankOrder(), true);
    if (a === "edit") { const o = findOrder(t.dataset.id); if (o) openEditor(o, false); return; }
  });
  const offStatus = on(root, "change", "[data-status-id]", (e, t) => {
    b2cSetStatus(t.dataset.statusId, t.value);
    refreshList();
    toast("주문 현황을 변경했습니다");
  });
  const offSearch = on(root, "input", "[data-search]", (e, t) => {
    state.search = t.value;
    const sum = qs(root, "[data-slot='summary']");
    const tbl = qs(root, "[data-slot='table']");
    if (sum) setHTML(sum, summaryBody());
    if (tbl) setHTML(tbl, tableBody());
  });

  return () => {
    offList(); offStatus(); offSearch();
    closeModal();
    if (toastEl) toastEl.remove();
    if (toastTimer) clearTimeout(toastTimer);
  };
}
