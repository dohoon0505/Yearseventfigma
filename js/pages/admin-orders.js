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
import { pageTitle, tableGrid, openModal, makeDropdown, makeDateTimePicker } from "../ui.js";
import { getDateRange, formatDateLabel } from "../util/date.js";
import { openCancelModal } from "../util/cancel-modal.js";
import { pushHistory } from "../data/order-history.js";
import { sharedBizKeys, displayName } from "../util/biz.js";
import { store, ALL_PRODUCTS, productKey, priceNum } from "../store.js";
import { staffNames, staffOptions } from "../data/staff-mock.js";
import {
  won, pad2, dash, fmtFull, parseFlexDate, statusBadge, tabDefs,
  tabBtn, filterCard, makeDateRange,
  dateCell, photoFlag, notiFlag, amtCell, editBtn,
  makeImageBox, managerControl, openStaffPicker, openDeleteConfirm,
  ordHeader, card, renderFields, autosize, railV2, summaryBodyV2, historyBody, histScrollEnd, footerV2,
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
  const dds = [];
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

  /* ══ 모달 v2 — 통합주문관리와 같은 셸. 필드 서술자만 B2B 것이다 ══ */
  const imgBox = makeImageBox({ get: () => editing, toast });
  let baseline = null;
  let savedAt = "";
  let menuOpen = false;

  /* 주문정보 — 4번째 칸이 주문금액(확정). B2B 는 거래처 계약 단가라 **잠근다**:
     여기서 바뀌면 정산 드릴다운과 그 달 청구가 어긋난다.
     2번째 칸은 거래처 대표 연락처 — B2B 에는 ordererPhone 이 없다. */
  const ORDER_FIELDS = () => [
    { k: "ordererName", label: "발송인", type: "text", ph: "예) 총무팀 · 한지훈" },
    { label: "연락처", type: "static", k: "clientPhone", value: (o) => dash(clientOf(o)?.contact) },
    { k: "product", label: "주문상품", type: "select" },
    { k: "amount", label: "주문금액", type: "won", lock: true },
  ];
  const DELIVER_FIELDS = [
    { k: "deliverAt", label: "배송일시", type: "datetime", full: true },
    { k: "address", label: "배송지", type: "textarea", full: true, ph: "배송지 주소를 입력하세요" },
    { k: "recipientName", label: "받는분", type: "text", ph: "예) 故 김○○" },
    { k: "recipientPhone", label: "연락처", type: "tel", ph: "010-0000-0000" },
    { k: "ribbonPhrase", label: "리본문구", type: "text", full: true, ph: "예) 삼가 고인의 명복을 빕니다" },
    { k: "ribbonSender", label: "보내는분", type: "text", full: true, ph: "예) ○○회사 임직원 일동" },
    { k: "request", label: "요청사항", type: "textarea", full: true, ph: "거래처가 남긴 요청사항" },
  ];
  /* 적용 단가는 파생값이라 dirty 대상이 아니다 */
  const DIRTY_KEYS = ["ordererName", "product", ...DELIVER_FIELDS.map((d) => d.k), "receiver", "memo", "image"];

  const canComplete = () => !!editing?.image && !!String(editing?.receiver || "").trim();
  const dirtyCount = () =>
    baseline ? DIRTY_KEYS.filter((k) => String(editing[k] ?? "") !== String(baseline[k] ?? "")).length : 0;

  const metaLine = () => `${clientName(editing)} · 주문 ${fmtFull(editing.date)} · ${fmtFull(editing.deliverAt)} 배송 예정`;

  /* 요약 레일 — 가운데 줄이 B2C 는 주문경로, B2B 는 거래처(확정).
     정산 귀속은 B2B 에만 있는 한 줄이다. */
  const summaryRows = () => [
    { k: "상품", v: dash(editing.product) },
    { k: "거래처", v: clientName(editing) },
    { k: "정산 귀속", v: periodLabel(editing.date) },
    { k: "담당자", v: editing.manager || "미지정", empty: !editing.manager, action: "pick-manager" },
  ];

  function modalBody() {
    const c = clientOf(editing);
    return html`
      <div class="hm__head ord-hd" data-slot="hd">
        ${ordHeader({ order: editing, meta: metaLine(), statuses: B2B_STATUSES, canComplete: canComplete(), menuOpen, isNew })}
      </div>
      <div class="ord-grid ${isNew ? "ord-grid--new" : ""}">
        ${isNew ? "" : railV2({ order: editing, imgInner: imgBox.inner() })}
        <div class="ord-pane">
          ${c && c.clientNote ? html`
            <div class="hm-warn ord-notebox"><span><b>거래 조건</b><br />${c.clientNote}</span></div>` : ""}
          <div class="ord-cols">
            <div class="ord-colL">
              ${card({ title: "주문정보", cap: "거래처 접수 내용", body: renderFields(ORDER_FIELDS(), editing) })}
              ${card({ title: "발주정보", cap: "화원 전달 내용", body: renderFields(DELIVER_FIELDS, editing) })}
            </div>
            <div class="ord-colR">
              <section class="ord-card" data-slot="sum">${summaryBodyV2({ order: editing, rows: summaryRows() })}</section>
              ${isNew ? "" : card({
                title: "처리 이력", cap: `${(editing.history || []).length}건`,
                body: historyBody(editing), slot: "hist",
              })}
            </div>
          </div>
        </div>
      </div>
      <div class="hm__foot ord-ft" data-slot="ft">${footerV2({ dirty: dirtyCount(), savedAt })}</div>`;
  }

  /* ── 부분 갱신 — 본문(입력)은 절대 다시 그리지 않는다 ────── */
  const panelOf = () => activeModal && activeModal.panel;
  function renderHd() {
    const p = panelOf(); if (!p) return;
    setHTML(qs(p, "[data-slot='hd']"),
      ordHeader({ order: editing, meta: metaLine(), statuses: B2B_STATUSES, canComplete: canComplete(), menuOpen, isNew }));
  }
  function renderSum() {
    const p = panelOf(); if (!p) return;
    const el = qs(p, "[data-slot='sum']");
    if (el) setHTML(el, summaryBodyV2({ order: editing, rows: summaryRows() }));
  }
  function renderHist() {
    const p = panelOf(); if (!p || isNew) return;
    const el = qs(p, "[data-slot='hist']");
    if (el) {
      setHTML(el, historyBody(editing));
      const cap = el.parentElement?.querySelector(".ord-card__cap");
      if (cap) cap.textContent = `${(editing.history || []).length}건`;
      histScrollEnd(el);
    }
  }
  function syncDirty() {
    const p = panelOf(); if (!p) return;
    const n = dirtyCount();
    const stat = qs(p, "[data-slot='dirty']");
    if (stat) {
      stat.textContent = n ? `수정한 항목 ${n}개` : savedAt ? `저장됨 · ${savedAt}` : "변경 없음";
      stat.className = `ord-ft__stat ${n ? "is-dirty" : savedAt ? "is-saved" : ""}`;
    }
    const btn = qs(p, "[data-action='save']");
    if (btn) { btn.disabled = !n; btn.textContent = n ? "변경사항 저장" : "저장"; }
  }

  function destroyDds() { dds.forEach((d) => d.destroy()); dds.length = 0; }
  function bindControls(panel) {
    destroyDds();
    const prod = qs(panel, "[data-dd-f='product']");
    if (prod) dds.push(makeDropdown(prod, {
      options: () => PRODUCTS.map((p) => p.name),
      /* 금액은 바로 옆 '주문금액/적용 단가' 칸에 이미 있다 — 상품명만 보여 준다 */
      label: (v) => v || "상품을 선택하세요",
      get: () => editing.product,
      set: (v) => {
        editing.product = v;
        /* 적용 단가는 (거래처 × 상품)에서 파생 — 직접 입력받지 않는다 */
        editing.amount = priceFor(editing.clientId, v);
        const amt = qs(panel, "[data-slot='amount']");
        if (amt) amt.value = won(editing.amount);
        renderSum(); syncDirty();
      },
    }));
    const dtp = qs(panel, "[data-dtp]");
    if (dtp) dds.push(makeDateTimePicker(dtp, {
      get: () => editing.deliverAt,
      set: (v) => { editing.deliverAt = v; renderHd(); renderSum(); syncDirty(); },
      min: DP_MIN, max: DP_MAX,
    }));
    qsa(panel, "textarea.ord-in").forEach(autosize);
  }

  function saveOrder() {
    if (!editing) return;
    if (!editing.clientId || !editing.product) { toast("거래처와 주문상품은 필수입니다", "warn"); return; }
    const n = dirtyCount();
    const merged = { ...editing, amount: Number(String(editing.amount).replace(/[^0-9]/g, "")) || 0 };
    let autoDone = false;
    if (!isNew && merged.status === "주문접수" && merged.image && String(merged.receiver || "").trim()) {
      merged.status = "배송완료";
      merged.notified = true;
      autoDone = true;
    }
    delete merged.history; // draft 의 history 는 넘기지 않는다(참조 공유 방지)
    b2bUpsert(merged);
    const stored = findOrder(merged.id);
    if (stored && n) pushHistory(stored, "edit", `주문 정보 수정 ${n}건`);
    if (stored && autoDone) pushHistory(stored, "delivered", "배송완료 · 알림톡 발송");
    refreshList();
    if (isNew) { closeModal(); toast("신규 주문을 등록했습니다"); return; }
    editing = { ...merged, history: stored ? stored.history : [] };
    baseline = { ...editing };
    const d = new Date();
    savedAt = `${d.getHours() < 12 ? "오전" : "오후"} ${d.getHours() % 12 || 12}:${pad2(d.getMinutes())}`;
    renderHd(); renderSum(); renderHist(); syncDirty();
    toast(autoDone ? "배송완료 처리됨 · 거래처 알림톡이 자동 발송됩니다" : "주문 정보를 저장했습니다");
  }

  function formatPhone(t) {
    const d = t.value.replace(/\D/g, "").slice(0, 11);
    t.value = d.length > 7 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`
      : d.length > 3 ? `${d.slice(0, 3)}-${d.slice(3)}` : d;
    return t.value;
  }

  function openManagerModal() {
    if (!editing) return;
    openStaffPicker({
      current: editing.manager,
      names: staffOptions,
      toast,
      onPick: (v) => {
        if (!editing) return false;
        editing.manager = v;
        if (!isNew) b2bSetManager(editing.id, v);
        const stored = findOrder(editing.id);
        if (stored) editing.history = stored.history;
        if (baseline) baseline.manager = v;
        refreshList();
        renderHd(); renderSum(); renderHist();
      },
    });
  }

  /* 스테퍼 — 앞으로만. 배송완료는 사진·인수자가 있어야 한다. */
  function stepTo(next) {
    if (!editing || isNew) return;
    const flow = B2B_STATUSES.filter((s) => s !== "취소");
    const cur = flow.indexOf(editing.status);
    const to = flow.indexOf(next);
    if (to < 0 || to === cur) return;
    if (to < cur) { toast("상태는 되돌릴 수 없습니다 · 잘못 눌렀다면 주문취소를 쓰세요", "warn"); return; }
    if (next === "배송완료" && !canComplete()) { toast("현장사진과 인수자를 먼저 입력하세요", "warn"); return; }
    editing.status = next;
    if (next === "배송완료") editing.notified = true;
    b2bSetStatus(editing.id, next);
    const stored = findOrder(editing.id);
    if (stored) editing.history = stored.history;
    refreshList();
    renderHd(); renderHist();
    toast(next === "배송완료" ? "배송완료로 전환 · 거래처 알림톡이 발송됩니다" : `${next}(으)로 변경했습니다`);
    const p = panelOf();
    if (p) qs(p, ".ord-step__btn.is-now")?.focus();
  }

  function openEditor(order, _isNew) {
    closeModal();
    const { history: _h, ...draft } = order;
    editing = { ...draft, history: order.history || [] };
    baseline = { ...editing };
    savedAt = "";
    menuOpen = false;
    isNew = _isNew;
    activeModal = openModal({
      panelClass: "modal-panel--ord",
      body: modalBody(),
      onClose: () => { destroyDds(); activeModal = null; editing = null; baseline = null; },
    });
    const panel = activeModal.panel;
    bindControls(panel);
    histScrollEnd(panel); // 최신 이력이 맨 아래라 처음부터 끝을 보여 준다

    on(panel, "click", "[data-action='close']", () => closeModal());
    on(panel, "click", "[data-action='save']", () => saveOrder());
    on(panel, "click", "[data-action='step']", (e, t) => stepTo(t.dataset.v));
    on(panel, "click", "[data-action='menu']", () => { menuOpen = !menuOpen; renderHd(); });
    /* 삭제 — B2B 주문은 그 달 청구의 근거다. 귀속월과 금액을 고지한다. */
    on(panel, "click", "[data-action='delete']", () => {
      menuOpen = false;
      openDeleteConfirm({
        orderNo: editing.orderNo,
        note: html`이 주문은 <b>${periodLabel(editing.date)} 정산</b>의 청구 근거입니다.
          삭제하면 그 달 청구 금액에서 <b>${won(editing.amount)}</b>이 빠집니다.`,
        onConfirm: () => {
          const name = editing.orderNo;
          b2bRemove(editing.id);
          closeModal();
          refreshList();
          toast(`${name} 주문을 삭제했습니다`, "warn");
        },
      });
    });
    on(panel, "click", "[data-action='order-cancel']", () => {
      menuOpen = false; renderHd();
      if (!editing || editing.status === "취소") return;
      openCancelModal({
        orderNo: editing.orderNo,
        amount: editing.amount,
        settle: true, // 수수료가 그 달 정산에 가산된다 — B2C 와 다른 안내문
        onConfirm: ({ reason, fee }) => {
          editing.status = "취소";
          editing.cancelReason = reason;
          editing.cancelFee = fee;
          const { history: _x, ...rec } = editing;
          b2bUpsert(rec);
          b2bSetStatus(editing.id, "취소");
          const stored = findOrder(editing.id);
          if (stored) editing.history = stored.history;
          refreshList();
          renderHd(); renderHist();
          toast("주문을 취소 처리했습니다", "warn");
        },
      });
    });
    imgBox.bind(panel, () => { renderHd(); renderSum(); syncDirty(); });
    on(panel, "click", "[data-action='pick-manager']", () => openManagerModal());
    on(panel, "input", "input[data-f], textarea[data-f]", (e, t) => {
      if (!editing) return;
      const k = t.dataset.f;
      editing[k] = k === "recipientPhone" ? formatPhone(t) : t.value;
      if (t.tagName === "TEXTAREA") autosize(t);
      if (k === "receiver" || k === "image") renderHd();
      syncDirty();
    });
    /* 담당자 미지정(포털 자동 유입) 주문은 열자마자 지정을 받는다 */
    if (!isNew && !editing.manager) openManagerModal();
  }

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
      request: "", memo: "", cancelFee: 0, cancelReason: "", history: [],
    };
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
