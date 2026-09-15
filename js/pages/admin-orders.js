/* ============================================================
   admin-orders.js — 거래처 주문관리 (구 시스템 '거래처 주문 조회(202)')

   통합주문관리(#/admin/b2c)와 **UI/UX 를 동일하게** 맞춘 화면이다. 같은 일을
   하는 두 화면이 다르게 생기면 담당자가 화면마다 조작을 다시 배워야 한다.
   표기·필터 카드·표 셀·모달 구역/레일/사진·담당자 지정은 전부 공용
   → js/util/order-screen.js (짝 CSS 는 components.css 의 .ord-*).

   B2C 와 의도적으로 다른 1%:
   - 표 1열이 주문경로가 아니라 **거래처**(+거래조건 ! 뱃지). 회사명은 부서까지
     붙을 수 있어 폭도 넓다
   - 날짜 기준 세그가 '접수일'이 아니라 **'주문일'**(B2B 필드는 date)
   - 주문정보 존에 **정산 귀속월·적용 단가** 2행이 더 있다. 거래처 후불 정산의
     근거라 편집 모드에서도 잠근다 — 여기서 바뀌면 정산 드릴다운이 어긋난다
   - 모달 최상단 **거래조건 배너**. clientNote 는 메모가 아니라 거래 조건이다
     ((주)홈팩: "무조건 특대상품 발송"). 빠지면 주문마다 사고가 난다
   - 주문취소는 settle:true — 수수료가 그 달 정산에 가산된다는 안내
   - 주문서 삭제에 확인 모달. 정산 근거가 사라지는 일이라 B2C 처럼
     바로 지우지 않는다

   페이지 규약: mount(root, { nav }) → cleanup.
   ============================================================ */
import { html, setHTML, on, qs, qsa } from "../dom.js";
import { makeToast } from "../toast.js";
import { icon } from "../icons.js";
import { pageTitle, tableGrid, openModal, simpleModal, makeDropdown } from "../ui.js";
import { getDateRange, formatDateLabel } from "../util/date.js";
import { openCancelModal } from "../util/cancel-modal.js";
import { sharedBizKeys, displayName } from "../util/biz.js";
import { store, ALL_PRODUCTS, productKey, priceNum } from "../store.js";
import { staffNames } from "../data/staff-mock.js";
import {
  won, pad2, dash, fmtFull, joinVals, parseFlexDate, statusBadge, tabDefs,
  tabBtn, filterCard, makeDateRange,
  dateCell, photoFlag, notiFlag, amtCell, editBtn,
  zone, docRow, ddField, txtField, makeImageBox, railBody as railOf,
  managerControl, openStaffPicker,
} from "../util/order-screen.js";
import {
  B2B_STATUSES, b2bList, b2bFind, b2bUpsert, b2bRemove,
  b2bSetStatus, b2bSetManager, b2bNewId, b2bNextOrderNo,
} from "../data/b2b-mock.js";

const TABS = tabDefs(B2B_STATUSES);
/* B2C 는 접수일/배송일, B2B 는 주문일/배송일 — 필드 이름이 date 라 라벨이 다르다 */
const DATE_BASIS = [{ v: "ordered", label: "주문일" }, { v: "deliver", label: "배송일" }];
const PRODUCTS = ALL_PRODUCTS.map((p) => ({ name: p.product, key: productKey(p), base: priceNum(p.price) }));
/* 적용 단가 = 거래처 계약 단가(기업별 상품단가)가 있으면 그것, 없으면 카탈로그 정가 */
const priceFor = (clientId, name) => {
  const p = PRODUCTS.find((x) => x.name === name);
  if (!p) return 0;
  const custom = store.clientPriceFor(clientId, p.key);
  return typeof custom === "number" && custom > 0 ? custom : p.base;
};
/* 정산 귀속월 — 주문일시에서 파생("2026/09/15 09:10" → "2026년 09월") */
function periodLabel(dateStr) {
  const d = parseFlexDate(dateStr);
  return d ? `${d.getFullYear()}년 ${pad2(d.getMonth() + 1)}월` : "-";
}

export function mount(root, { nav }) {
  const state = {
    tab: "all",
    photo: [], noti: [],   // 켜진 토글만 담김 — 빈 배열 = 전체
    detailOpen: true,
    dateBasis: "ordered", dateQuick: "전체", dateStart: "", dateEnd: "",
    qAddress: "", qClient: "", qRecipient: "", qOrderer: "", qOrderNo: "",
  };
  const DP_MIN = new Date(2000, 0, 1);
  const DP_MAX = new Date(new Date().getFullYear() + 2, 11, 31);
  let activeModal = null;
  let editing = null;      // 편집 작업본 — 모든 입력이 write-through
  let isNew = false;
  let mode = "read";       // "read" | "edit"
  let dds = [];
  const toast = makeToast();

  const clients = () => store.get().clients;
  const clientOf = (o) => clients().find((c) => c.id === o?.clientId) || null;
  const clientName = (o) => {
    const c = clientOf(o);
    return c ? displayName(c, sharedBizKeys(clients())) : "(삭제된 거래처)";
  };
  const findOrder = (id) => b2bList().find((o) => o.id === id);
  const closeModal = () => { const m = activeModal; activeModal = null; if (m) m.close(); };

  /* ══ 필터 ═══════════════════════════════════════════════ */
  function filtered() {
    const has = (v) => v && v.trim();
    const s = state.dateStart ? new Date(state.dateStart + "T00:00:00") : null;
    const e = state.dateEnd ? new Date(state.dateEnd + "T23:59:59") : null;
    const match = (field, q) => !has(q) || String(field || "").includes(q.trim());
    return b2bList().filter((o) => {
      if (state.tab !== "all" && o.status !== state.tab) return false;
      if (state.photo.length && !state.photo.includes(o.image ? "has" : "no")) return false;
      if (state.noti.length && !state.noti.includes(o.notified ? "on" : "off")) return false;
      if (s || e) {
        const d = parseFlexDate(state.dateBasis === "deliver" ? o.deliverAt : o.date);
        if (!d) return false;
        if (s && d < s) return false;
        if (e && d > e) return false;
      }
      if (!match(clientName(o), state.qClient)) return false;
      if (!match(o.recipientName, state.qRecipient)) return false;
      if (!match(o.ordererName, state.qOrderer)) return false;
      if (!match(o.orderNo, state.qOrderNo)) return false;
      if (!match(o.address, state.qAddress)) return false;
      return true;
    });
  }

  /* 탭 카운트는 전체 기준 — 기간·검색을 반영하면 탭이 필터에 따라 요동쳐서
     '지금 몇 건이 밀려 있나'를 읽을 수 없게 된다(B2C 와 같은 규약). */
  function tabsBody() {
    const all = b2bList();
    return TABS.map((t) => tabBtn({
      v: t.v, label: t.label, active: state.tab === t.v,
      count: t.v === "all" ? all.length : all.filter((o) => o.status === t.v).length,
    }));
  }
  const summaryBody = () => html`조회 <strong>${filtered().length}</strong>건`;
  const srch = (key, label, ph) => ({ key, label, ph, value: state[key] });

  function filterBody() {
    return filterCard({
      tabs: tabsBody(),
      basis: DATE_BASIS, basisActive: state.dateBasis,
      quickActive: state.dateQuick,
      addr: srch("qAddress", "배송지", "배송지 주소로 검색"),
      detailOpen: state.detailOpen, photo: state.photo, noti: state.noti,
      searches: [
        srch("qClient", "거래처", "회사명·부서"),
        srch("qRecipient", "받는분", "받는분 성함"),
        srch("qOrderer", "발송인", "발송인 성함·부서"),
        srch("qOrderNo", "주문번호", "예) B2B-0008"),
      ],
    });
  }

  /* ══ 표 — 통합주문관리와 같은 11열 ═══════════════════════ */
  const columns = [
    {
      label: "거래처", width: "150px",
      render: (r) => html`<div class="ellipsis" title="${clientName(r)}">${clientName(r)}${
        clientOf(r)?.clientNote ? html`<span class="ord-note" title="거래 조건 있음">!</span>` : ""}</div>`,
    },
    { label: "주문 / 배송일시", width: "168px", render: (r) => dateCell(r.date, r.deliverAt, "주문") },
    { label: "배송지", width: "1.3fr", render: (r) => html`<div class="ellipsis ord-dim" title="${r.address}">${r.address || "-"}</div>` },
    { label: "받는분", width: "88px", align: "center", render: (r) => html`<div class="ellipsis">${r.recipientName || "-"}</div>` },
    { label: "상품", width: "122px", render: (r) => html`<div class="ellipsis">${r.product || "-"}</div>` },
    { label: "금액", width: "96px", align: "right", render: (r) => amtCell(r.amount) },
    { label: "메모", width: "1fr", render: (r) => html`<div class="ellipsis ord-dim" title="${r.memo}">${r.memo || "-"}</div>` },
    { label: "현황", width: "92px", align: "center", render: (r) => statusBadge(r.status) },
    { label: "사진", width: "52px", align: "center", render: (r) => photoFlag(r.image) },
    { label: "알림", width: "52px", align: "center", render: (r) => notiFlag(r.notified) },
    { label: "관리", width: "56px", align: "center", render: (r) => editBtn(r.id) },
  ];
  function tableBody() {
    const rows = filtered();
    if (rows.length === 0) return html`<div class="admin-empty">조건에 맞는 거래처 주문이 없습니다.</div>`;
    return tableGrid({ columns, rows, rowKey: (r) => r.id, compact: true });
  }

  function render() {
    setHTML(root, html`
      <div class="page-admin page-ordscr">
        <div class="admin-inner">
          ${pageTitle({
            imgSrc: "./assets/nav-realtime.png",
            title: "거래처 주문관리",
            action: html`<button class="btn btn-secondary" data-action="new">${icon("plus", { size: 14 })} 신규 주문 등록</button>`,
          })}
          <div class="bf-card" data-slot="filters">${filterBody()}</div>
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
  const refreshTableOnly = () => {
    const sum = qs(root, "[data-slot='summary']");
    const tbl = qs(root, "[data-slot='table']");
    if (sum) setHTML(sum, summaryBody());
    if (tbl) setHTML(tbl, tableBody());
  };
  const dateRange = makeDateRange(root, {
    get: (key) => state[key],
    set: (key, v) => {
      /* 직접 날짜 선택 → 커스텀 범위(퀵버튼 해제). 자기 자신(datepicker) 재생성 없이 표만 갱신. */
      state[key] = v;
      state.dateQuick = "custom";
      qsa(root, "[data-action='date']").forEach((b) => b.classList.remove("is-sel"));
      refreshTableOnly();
    },
    min: DP_MIN, max: DP_MAX,
  });
  /* 필터 조작 시 — 필터 블록 + 요약 + 표 재렌더 (검색 입력은 제외: 포커스 보존) */
  const refreshFilters = () => {
    dateRange.destroy();
    const f = qs(root, "[data-slot='filters']");
    if (f) setHTML(f, filterBody());
    dateRange.bind();
    refreshTableOnly();
  };

  /* ══ 모달 ═══════════════════════════════════════════════ */
  const imgBox = makeImageBox({ get: () => editing, toast });
  const tf = (label, key, opts) => txtField(label, key, editing[key], opts);

  function blankOrder() {
    const now = new Date();
    const c = clients()[0];
    return {
      id: b2bNewId(), orderNo: b2bNextOrderNo(), clientId: c ? c.id : "",
      date: `${now.getFullYear()}/${pad2(now.getMonth() + 1)}/${pad2(now.getDate())} ${pad2(now.getHours())}:${pad2(now.getMinutes())}`,
      ordererName: "", address: "", deliverAt: "",
      recipientName: "", recipientPhone: "", ribbonPhrase: "", ribbonSender: "",
      image: "", notified: false, product: "", amount: 0,
      status: "접수대기", receiver: "", manager: staffNames()[0] ?? "",
      request: "", memo: "", cancelFee: 0, cancelReason: "",
    };
  }

  function headInner() {
    const o = editing;
    if (isNew) {
      return html`
        <div class="ord-head__main">
          <div class="ord-head__row"><h3>신규 거래처 주문 등록</h3></div>
          <p class="ord-head__meta"><span class="ord-mono">${o.orderNo}</span> · 주문 ${o.date} · ${managerControl(o.manager)}</p>
        </div>
        <div class="ord-head__acts">
          <button class="hm__x" data-action="close" aria-label="닫기">${icon("x", { size: 14 })}</button>
        </div>`;
    }
    return html`
      <div class="ord-head__main">
        <div class="ord-head__row">
          <h3 class="ord-head__no ord-mono">${o.orderNo}</h3>
          ${statusBadge(o.status)}
        </div>
        <p class="ord-head__meta">${clientName(o)} · 주문 ${o.date} · ${managerControl(o.manager)}</p>
      </div>
      <div class="ord-head__acts">
        <button class="hm-btn hm-btn--secondary ord-editbtn" data-action="toggle-edit">
          ${icon(mode === "edit" ? "x" : "pencil", { size: 13 })} ${mode === "edit" ? "수정 취소" : "내용 수정"}
        </button>
        <button class="hm__x" data-action="close" aria-label="닫기">${icon("x", { size: 14 })}</button>
      </div>`;
  }

  /* 주문정보 존의 거래처·정산 귀속·적용 단가는 편집 모드에서도 읽기 전용이다.
     거래처 후불 정산의 근거라 여기서 바뀌면 정산 드릴다운과 청구가 어긋난다.
     적용 단가는 상품을 바꾸면 계약 단가에서 다시 파생된다(직접 입력 아님). */
  const lockNote = html`<span class="ord-lockhint">${icon("info", { size: 11 })} 거래 계약 정보 · 변경 불가</span>`;

  function readBody() {
    const o = editing;
    const row = docRow;
    return html`
      <div class="ord-doc">
        ${zone("주문정보", html`
          ${row("거래처", clientName(o))}
          ${row("발송인", dash(o.ordererName))}
          ${row("정산 귀속", periodLabel(o.date))}
          ${row("주문상품", dash(o.product))}
          ${row("적용 단가", won(o.amount), "ord-doc__v--price")}
        `)}
        ${zone("발주정보", html`
          ${row("배송일시", fmtFull(o.deliverAt))}
          ${row("배송지", dash(o.address), "ord-doc__v--pre")}
          ${row("받는분", joinVals(" · ", o.recipientName, o.recipientPhone))}
          ${row("리본문구", dash(o.ribbonPhrase))}
          ${row("보내는분", dash(o.ribbonSender))}
        `)}
        ${zone("요청사항", html`
          <p class="ord-doc__txt">${dash(o.request)}</p>
        `)}
        ${o.status === "취소" ? zone("취소 처리", html`
          ${row("취소 사유", dash(o.cancelReason))}
          ${row("취소 수수료", won(o.cancelFee), "ord-doc__v--price")}
        `) : ""}
      </div>`;
  }

  function editBody() {
    const o = editing;
    const row = docRow;
    return html`
      <div class="ord-edit">
        ${zone("주문정보", html`
          ${isNew
            ? html`<div class="ord-form">
                ${ddField("거래처", "clientId", { req: true })}
                ${ddField("주문상품", "product", { req: true })}
                ${tf("발송인", "ordererName", { placeholder: "예) 총무팀 · 한지훈", req: true })}
                <div class="hm-field">
                  <label>적용 단가</label>
                  <input class="hm-input" data-slot="amt" value="${won(o.amount)}" disabled />
                </div>
              </div>`
            : html`
              ${row("거래처", clientName(o))}
              ${row("정산 귀속", periodLabel(o.date))}
              <div class="ord-form">
                ${ddField("주문상품", "product")}
                <div class="hm-field">
                  <label>적용 단가</label>
                  <input class="hm-input" data-slot="amt" value="${won(o.amount)}" disabled />
                </div>
                <div class="ord-form__full">${tf("발송인", "ordererName", { placeholder: "예) 총무팀 · 한지훈" })}</div>
              </div>
              ${lockNote}`}
        `)}
        ${zone("발주정보", html`
          <div class="ord-form ord-form--3">
            ${tf("배송일시", "deliverAt", { type: "datetime-local" })}
            ${tf("받는분 성함", "recipientName", { placeholder: "예) 故 김○○" })}
            ${tf("받는분 연락처", "recipientPhone", { placeholder: "010-0000-0000", inputmode: "numeric" })}
            <div class="hm-field ord-form__full">
              <label>배송지 주소</label>
              <textarea class="hm-input hm-textarea" data-f="address" placeholder="배송지 주소를 입력하세요">${o.address ?? ""}</textarea>
            </div>
            <div class="ord-form__pair">
              ${tf("리본문구 (경조사어)", "ribbonPhrase", { placeholder: "예) 삼가 고인의 명복을 빕니다", list: "ord-phrases" })}
              ${tf("보내는분 (리본)", "ribbonSender", { placeholder: "예) ○○회사 임직원 일동" })}
            </div>
          </div>
        `)}
        ${zone("요청사항", html`
          <textarea class="hm-input hm-textarea" data-f="request" placeholder="거래처가 남긴 요청사항">${o.request ?? ""}</textarea>
        `)}
        <datalist id="ord-phrases">${["삼가 고인의 명복을 빕니다", "근조(謹弔)", "조의를 표합니다", "축 결혼(祝 結婚)", "화혼을 축하합니다", "축 개업(祝 開業)", "축 취임(祝 就任)"].map((p) => html`<option value="${p}"></option>`)}</datalist>
      </div>`;
  }

  const railBody = () => (isNew ? "" : railOf({ order: editing, imgInner: imgBox.inner() }));

  function footInner() {
    const o = editing;
    if (isNew) {
      return html`
        <button class="hm-btn hm-btn--primary" data-action="save">${icon("save", { size: 14 })} 등록</button>
        <button class="hm-btn hm-btn--secondary" data-action="close">닫기</button>`;
    }
    const cancelled = o.status === "취소";
    return html`
      <button class="hm-btn ord-delbtn" data-action="delete">${icon("trash2", { size: 14 })} 주문서 삭제</button>
      <button class="hm-btn ord-cancelbtn" data-action="order-cancel" ${cancelled ? "disabled" : ""}>${cancelled ? "취소됨" : "주문취소"}</button>
      ${o.status === "접수대기" ? html`<button class="hm-btn ord-acceptbtn" data-action="accept">${icon("check", { size: 14 })} 주문접수 처리</button>` : ""}
      <button class="hm-btn hm-btn--primary" data-action="save">${icon("save", { size: 14 })} 저장</button>
      <button class="hm-btn hm-btn--secondary" data-action="close">닫기</button>`;
  }

  function modalBody() {
    const c = clientOf(editing);
    return html`
      <div class="hm__head ord-head" data-slot="head">${headInner()}</div>
      <div class="hm__body ord-body ${isNew ? "ord-body--new" : ""}">
        ${c && c.clientNote ? html`
          <div class="hm-warn ord-notebox ord-body__full">
            <span><b>거래 조건</b><br />${c.clientNote}</span>
          </div>` : ""}
        <div class="ord-main">${mode === "edit" ? editBody() : readBody()}</div>
        ${railBody()}
      </div>
      <div class="hm__foot ord-foot" data-slot="foot">${footInner()}</div>`;
  }

  const destroyDds = () => { dds.forEach((d) => d.destroy()); dds = []; };
  function bindDropdowns(panel) {
    destroyDds();
    const mk = (key, opts) => {
      const el = qs(panel, `[data-dd-f='${key}']`);
      if (el) dds.push(makeDropdown(el, opts));
    };
    mk("clientId", {
      options: () => clients().map((c) => c.id),
      label: (v) => clients().find((c) => c.id === v)?.companyName || "거래처를 선택하세요",
      get: () => editing.clientId,
      set: (v) => { editing.clientId = v; syncPrice(panel); },
    });
    mk("product", {
      options: () => PRODUCTS.map((p) => p.name),
      label: (v) => (v ? `${v} · ${won(priceFor(editing.clientId, v))}` : "상품을 선택하세요"),
      get: () => editing.product,
      set: (v) => { editing.product = v; syncPrice(panel); },
    });
  }
  /* 적용 단가는 (거래처 × 상품)에서 파생 — 둘 중 하나가 바뀌면 다시 계산한다 */
  function syncPrice(panel) {
    if (!editing) return;
    editing.amount = priceFor(editing.clientId, editing.product);
    const el = qs(panel, "[data-slot='amt']");
    if (el) el.value = won(editing.amount);
  }

  function renderModal() {
    if (!activeModal) return;
    activeModal.render(modalBody());
    destroyDds();
    if (mode === "edit") bindDropdowns(activeModal.panel);
  }
  /* 상태 액션 시 — 헤더·푸터만 갱신해 편집 버퍼·포커스·드롭다운을 보존한다 */
  function renderSlots(panel) {
    const h = qs(panel, "[data-slot='head']");
    const f = qs(panel, "[data-slot='foot']");
    if (h) setHTML(h, headInner());
    if (f) setHTML(f, footInner());
  }

  /* 저장 — 반영 후 모달 유지(읽기 복귀). 신규만 등록 후 닫힘. */
  function saveOrder() {
    if (!editing) return;
    if ((isNew || mode === "edit") && (!editing.clientId || !editing.product)) {
      toast("거래처와 주문상품은 필수입니다", "warn"); return;
    }
    const merged = { ...editing, amount: Number(editing.amount) || 0, cancelFee: Number(editing.cancelFee) || 0 };
    let autoDone = false;
    /* 자동 배송완료 — 주문접수 + 현장사진 + 인수자. B2C 와 같은 판정이다. */
    if (!isNew && merged.status === "주문접수" && merged.image && String(merged.receiver || "").trim()) {
      merged.status = "배송완료";
      merged.notified = true;
      autoDone = true;
    }
    b2bUpsert(merged);
    refreshList();
    if (isNew) { closeModal(); toast("신규 주문을 등록했습니다"); return; }
    editing = { ...merged };
    mode = "read";
    renderModal();
    toast(autoDone ? "배송완료 처리됨 · 거래처 알림톡이 자동 발송됩니다" : "주문 정보를 저장했습니다");
  }

  /* 삭제 확인 — B2B 주문은 그 달 청구의 근거다. B2C 처럼 즉시 삭제하지 않는다. */
  function confirmDelete() {
    const o = editing;
    if (!o) return;
    const m = simpleModal({
      title: "주문서를 삭제할까요?",
      subtitle: `${o.orderNo} · ${clientName(o)}`,
      body: html`
        <div class="hm-warn">
          <span>이 주문은 <b>${periodLabel(o.date)} 정산</b>의 청구 근거입니다.
          삭제하면 그 달 청구 금액에서 <b>${won(o.amount)}</b>이 빠집니다. 되돌릴 수 없습니다.</span>
        </div>
        <p class="hm-help">제작 전 취소라면 삭제 대신 <b>주문취소</b>를 쓰세요 — 사유와 수수료가 기록으로 남습니다.</p>`,
      footer: html`
        <button class="hm-btn hm-btn--secondary" data-action="close">취소</button>
        <button class="hm-btn hm-btn--danger" data-action="del-yes">${icon("trash2", { size: 14 })} 삭제</button>`,
    });
    on(m.panel, "click", "[data-action='del-yes']", () => {
      const name = o.orderNo;
      b2bRemove(o.id);
      m.close();
      closeModal();
      refreshList();
      toast(`${name} 주문을 삭제했습니다`, "warn");
    });
  }

  function openManagerModal(mainPanel) {
    if (!editing) return;
    openStaffPicker({
      current: editing.manager,
      names: staffNames,
      toast,
      onPick: (v) => {
        if (!editing) return false;
        editing.manager = v;
        if (!isNew) b2bSetManager(editing.id, v); // 담당자만 즉시 반영
        refreshList();
        if (mainPanel) renderSlots(mainPanel);
      },
    });
  }

  function openEditor(order, _isNew) {
    closeModal();
    editing = { ...order };
    isNew = _isNew;
    mode = isNew ? "edit" : "read"; // 기존 주문은 확인(읽기)이 첫 용도
    activeModal = openModal({
      panelClass: "modal-panel--ord",
      body: modalBody(),
      onClose: () => { destroyDds(); activeModal = null; editing = null; },
    });
    const panel = activeModal.panel;
    if (mode === "edit") bindDropdowns(panel);

    /* 이벤트는 panel 위임으로 1회만 바인딩 — setHTML 재렌더에도 전부 생존 */
    on(panel, "click", "[data-action='close']", () => closeModal());
    on(panel, "click", "[data-action='save']", () => saveOrder());
    on(panel, "click", "[data-action='delete']", () => confirmDelete());
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
    on(panel, "click", "[data-action='accept']", () => {
      if (!editing || editing.status !== "접수대기") return;
      editing.status = "주문접수";
      b2bSetStatus(editing.id, "주문접수");
      refreshList();
      renderSlots(panel);
      toast("주문접수로 변경했습니다");
    });
    on(panel, "click", "[data-action='order-cancel']", () => {
      if (!editing || editing.status === "취소") return;
      openCancelModal({
        orderNo: editing.orderNo,
        amount: editing.amount,
        settle: true, // 수수료가 그 달 정산에 가산된다 — B2C 와 다른 안내문
        onConfirm: ({ reason, fee }) => {
          if (!editing) return;
          editing.status = "취소";
          editing.cancelReason = reason;
          editing.cancelFee = fee;
          b2bUpsert({ ...editing });
          b2bSetStatus(editing.id, "취소");
          refreshList();
          renderSlots(panel);
          if (mode === "read") renderModal();
          toast("주문을 취소 처리했습니다", "warn");
        },
      });
    });
    imgBox.bind(panel); // 업로드·다운로드·라이트박스 위임 일체
    on(panel, "click", "[data-action='pick-manager']", () => openManagerModal(panel));
    on(panel, "input", "input[data-f], textarea[data-f]", (e, t) => {
      if (!editing) return;
      editing[t.dataset.f] = t.dataset.f === "recipientPhone" ? formatPhone(t) : t.value;
    });

    /* 담당자 미지정(포털 자동 유입) 주문을 열면 담당자 지정 모달을 우선 노출 */
    if (!isNew && !editing.manager) openManagerModal(panel);
  }

  /* 입력 중 3-4-4 하이픈 (커서는 끝으로 — 중간 편집은 드물다) */
  function formatPhone(input) {
    const d = input.value.replace(/\D/g, "").slice(0, 11);
    const out = d.length > 7 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`
      : d.length > 3 ? `${d.slice(0, 3)}-${d.slice(3)}` : d;
    input.value = out;
    return out;
  }

  render();
  dateRange.bind();

  const offList = on(root, "click", "[data-action]", (e, t) => {
    const a = t.dataset.a || t.dataset.action;
    const v = t.dataset.v;
    if (a === "tab") { state.tab = v; refreshFilters(); return; }
    if (a === "datebasis") { state.dateBasis = v; refreshFilters(); return; }
    if (a === "date") {
      state.dateQuick = v;
      if (v === "전체") { state.dateStart = ""; state.dateEnd = ""; }
      else {
        const [s, e] = getDateRange(v);
        state.dateStart = formatDateLabel(s);
        state.dateEnd = formatDateLabel(e);
      }
      refreshFilters(); return;
    }
    if (a === "photofilter" || a === "notifilter") {
      const arr = a === "photofilter" ? state.photo : state.noti;
      const i = arr.indexOf(v);
      if (i >= 0) arr.splice(i, 1); else arr.push(v);
      refreshFilters(); return;
    }
    if (a === "detail-toggle") { state.detailOpen = !state.detailOpen; refreshFilters(); return; }
    if (a === "new") { openEditor(blankOrder(), true); return; }
    if (a === "edit") { const o = findOrder(t.dataset.id); if (o) openEditor(o, false); }
  });
  /* 검색은 필터 카드를 재렌더하지 않는다 — 입력 포커스가 날아간다 */
  const offSearch = on(root, "input", "[data-search]", (e, t) => {
    state[t.dataset.search] = t.value;
    refreshTableOnly();
  });

  return () => {
    offList();
    offSearch();
    dateRange.destroy();
    closeModal();
    toast.destroy();
  };
}
