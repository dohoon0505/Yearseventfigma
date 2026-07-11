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
import { pageTitle, tableGrid, openModal, makeDropdown } from "../ui.js";
import {
  B2C_STAFF, B2C_CHANNELS, B2C_STATUSES, B2C_PRODUCTS, B2C_RIBBON_PHRASES,
  B2C_STATUS_STYLE, productPrice, b2cList, b2cUpsert, b2cRemove, b2cSetStatus,
  b2cNewId, b2cNextOrderNo,
} from "../data/b2c-mock.js";

const won = (n) => Number(n || 0).toLocaleString("ko-KR") + "원";
const pad = (n) => String(n).padStart(2, "0");
/* "2026-07-10T13:30" → "07-10 13:30" (연도 생략, 목록 표기용) */
const fmtDeliver = (s) => {
  if (!s) return "-";
  const [d, t] = s.split("T");
  const [, mo, day] = d.split("-");
  return `${mo}-${day} ${t ?? ""}`.trim();
};
const fmtReceived = (s) => (s ? s.slice(5) : "-"); // "2026-07-08 15:20" → "07-08 15:20"

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
    { label: "주문일시", width: "96px", align: "center", render: (r) => html`<span class="b2c-mono">${fmtReceived(r.receivedAt)}</span>` },
    { label: "배송요청", width: "96px", align: "center", render: (r) => html`<span class="b2c-mono">${fmtDeliver(r.deliverAt)}</span>` },
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
  function areaField(label, key, placeholder) {
    return html`
      <div class="hm-field">
        <label>${label}</label>
        <textarea class="hm-input hm-textarea" data-f="${key}" placeholder="${placeholder ?? ""}">${editing[key] ?? ""}</textarea>
      </div>
    `;
  }

  function editorBody() {
    const o = editing;
    const hasImg = !!o.image;
    return html`
      <div class="hm__head">
        <div>
          <h3>${isNew ? "신규 B2C 주문 등록" : "B2C 주문 편집"}</h3>
          <p><span class="b2c-mono">${o.orderNo}</span> · 접수 ${o.receivedAt}</p>
        </div>
        <button class="hm__x" data-action="close" aria-label="닫기">${icon("x", { size: 14 })}</button>
      </div>

      <div class="hm__body b2c-body">
        <!-- ① 주문 접수 정보 (전폭 4열) -->
        <section class="b2c-sec">
          <div class="b2c-sec__t">주문 접수 정보</div>
          <div class="b2c-grid b2c-grid--4">
            ${ddField("주문 담당자", "manager")}
            ${ddField("주문경로 또는 거래처", "channel")}
            ${txtField("주문자 성함", "ordererName", { placeholder: "예) 홍길동", req: true })}
            ${txtField("주문자 연락처", "ordererPhone", { placeholder: "010-0000-0000", inputmode: "numeric" })}
          </div>
        </section>

        <!-- 2열 배치: 좌(상품·리본 / 배송) · 우(요청·처리 / 취소) — 한 화면에 전 항목 노출 -->
        <div class="b2c-cols">
          <div class="b2c-col">
            <!-- ② 상품 · 리본 (좌: 필드 / 우: 이미지) -->
            <section class="b2c-sec b2c-sec--split">
              <div class="b2c-sec__main">
                <div class="b2c-sec__t">상품 · 리본 정보</div>
                <div class="b2c-grid b2c-grid--2">
                  ${ddField("주문상품", "product", { req: true })}
                  ${txtField("주문금액 (원)", "amount", { type: "number", min: 0, inputmode: "numeric" })}
                  ${txtField("리본문구 (경조사어)", "ribbonPhrase", { placeholder: "예) 삼가 고인의 명복을 빕니다", list: "b2c-phrases" })}
                  ${txtField("리본문구 (보내는분)", "ribbonSender", { placeholder: "예) 홍길동 · ○○회사 임직원 일동" })}
                </div>
              </div>
              <div class="b2c-sec__aside">
                <div class="b2c-sec__t">상품 이미지</div>
                <div class="b2c-imgbox ${hasImg ? "has" : ""}" data-slot="imgbox">
                  ${hasImg
                    ? html`<img src="${o.image}" alt="상품 이미지" />`
                    : html`<div class="b2c-imgbox__ph">${icon("camera", { size: 22 })}<span>이미지 없음</span></div>`}
                </div>
                <div class="b2c-imgbtns">
                  <button class="hm-btn hm-btn--secondary" data-action="img-upload" title="이미지 업로드">${icon("camera", { size: 14 })}</button>
                  <button class="hm-btn hm-btn--secondary" data-action="img-download" title="이미지 다운로드" ${hasImg ? "" : "disabled"}>${icon("download", { size: 14 })}</button>
                </div>
                <input type="file" accept="image/*" data-img-input hidden />
              </div>
            </section>

            <!-- ③ 배송 정보 -->
            <section class="b2c-sec">
              <div class="b2c-sec__t">배송 정보</div>
              <div class="b2c-grid b2c-grid--3">
                ${txtField("배송요청일시", "deliverAt", { type: "datetime-local" })}
                ${txtField("수령인 성함", "recipientName", { placeholder: "예) 故 김○○" })}
                ${txtField("수령인 연락처", "recipientPhone", { placeholder: "010-0000-0000", inputmode: "numeric" })}
              </div>
              <div class="b2c-grid b2c-grid--addr" style="margin-top:12px;">
                <div class="hm-field b2c-addr">
                  <label>배송지 주소</label>
                  <div class="b2c-addr__row">
                    <input class="hm-input" type="text" data-f="address" value="${o.address ?? ""}" placeholder="배송지 주소를 입력하세요" />
                    <button class="hm-btn hm-btn--secondary b2c-addrbtn" data-action="addr-search">${icon("map-pin", { size: 14 })} 주소검색</button>
                  </div>
                </div>
                ${txtField("인수자", "receiver", { placeholder: "실제 인수자" })}
              </div>
            </section>
          </div>

          <div class="b2c-col">
            <!-- ④ 요청 · 처리 -->
            <section class="b2c-sec">
              <div class="b2c-sec__t">요청 · 처리</div>
              ${areaField("주문자 요청사항", "request", "고객이 남긴 요청사항")}
              <div style="margin-top:12px;">${areaField("처리 메모 (내부)", "memo", "담당자 처리 메모 · 특이사항")}</div>
              <div class="b2c-grid b2c-grid--2" style="margin-top:12px;">
                ${ddField("배송 현황", "status")}
                ${ddField("알림 발송", "notified")}
              </div>
            </section>

            <!-- ⑤ 취소 처리 -->
            <section class="b2c-sec b2c-sec--cancel ${o.status === "취소" ? "is-active" : ""}">
              <div class="b2c-sec__t">취소 처리 <span class="b2c-sec__hint">상태가 ‘취소’일 때 적용됩니다</span></div>
              <div class="b2c-grid b2c-grid--2">
                ${txtField("취소수수료 (원)", "cancelFee", { type: "number", min: 0, inputmode: "numeric" })}
                ${txtField("취소사유", "cancelReason", { placeholder: "예) 고객 단순 변심" })}
              </div>
            </section>
          </div>
        </div>
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
      if (box) { box.classList.add("has"); setHTML(box, html`<img src="${editing.image}" alt="상품 이미지" />`); }
      const dl = qs(panel, "[data-action='img-download']");
      if (dl) dl.disabled = false;
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

  /* 취소 처리 섹션: 상태='취소'일 때만 활성(강조 + 입력 가능) */
  function syncCancelSection(panel) {
    const isCancel = editing?.status === "취소";
    const sec = qs(panel, ".b2c-sec--cancel");
    if (sec) sec.classList.toggle("is-active", isCancel);
    ["cancelFee", "cancelReason"].forEach((k) => {
      const inp = qs(panel, `[data-f='${k}']`);
      if (inp) inp.disabled = !isCancel;
    });
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
      status: { onSet: () => syncCancelSection(panel), options: () => B2C_STATUSES },
      /* 알림 발송 여부 — boolean ↔ 라벨 매핑 */
      notified: {
        options: () => ["미발송", "발송완료"],
        get: () => (editing?.notified ? "발송완료" : "미발송"),
        set: (v) => { if (editing) editing.notified = v === "발송완료"; },
      },
    };
    qsa(panel, "[data-dd-f]").forEach((root) => {
      const key = root.dataset.ddF;
      const def = DD_DEFS[key];
      dds.push(makeDropdown(root, {
        options: def.options,
        get: def.get || (() => editing?.[key] ?? ""),
        set: def.set || ((v) => { if (!editing) return; editing[key] = v; if (def.onSet) def.onSet(v); }),
        label: def.label,
      }));
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
