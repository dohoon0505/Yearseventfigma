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
   표기·필터 카드·표 셀·모달 구역/레일/사진·담당자 지정은 거래처 주문관리와
   100% 공유한다 → js/util/order-screen.js (짝 CSS 는 components.css 의 .ord-*).
   여기 남은 것은 전부 B2C 도메인이다 — filtered()·columns·모달 본문·저장 규칙.
   데이터는 data/b2c-mock.js(세션 유지). 페이지 규약: mount(root, { nav }) → cleanup.
   ============================================================ */
import { html, setHTML, on, qs, qsa } from "../dom.js";
import { makeToast } from "../toast.js";
import { icon } from "../icons.js";
import { pageTitle, tableGrid, openModal, makeDropdown, makeDateTimePicker } from "../ui.js";
import { getDateRange, formatDateLabel, orderRowTone } from "../util/date.js";
import { openCancelModal } from "../util/cancel-modal.js";
import { pushHistory } from "../data/order-history.js";
import {
  won, pad2, dash, fmtFull, parseFlexDate, statusBadge, tabDefs,
  tabBtn, filterCard, makeDateRange,
  dateCell, photoFlag, notiFlag, amtCell, editBtn,
  makeImageBox, managerControl, openStaffPicker, openDeleteConfirm,
  ordHeader, card, renderFields, autosize, railV2, summaryBodyV2, historyBody, histScrollEnd, footerV2,
} from "../util/order-screen.js";
import {
  staffNames, staffOptions, B2C_CHANNELS, B2C_STATUSES, B2C_PRODUCTS, B2C_RIBBON_PHRASES,
  productPrice, b2cList, b2cUpsert, b2cRemove, b2cSetStatus,
  b2cSetManager, b2cNewId, b2cNextOrderNo,
} from "../data/b2c-mock.js";

/* 표기·상태배지·필터 마크업은 거래처 주문관리와 100% 공유 — util/order-screen.js */
const TABS = tabDefs(B2C_STATUSES);
const DATE_BASIS = [{ v: "received", label: "접수일" }, { v: "deliver", label: "배송일" }];

function blankOrder() {
  const now = new Date();
  const receivedAt = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} ${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
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
  const state = {
    tab: "all",
    photo: [], noti: [], // 켜진 토글만 담김 — 빈 배열 = 전체 (디자인 시안 의미론)
    detailOpen: true,    // 상세 필터(사진·알림·검색 4종) 펼침 상태
    dateBasis: "received", dateQuick: "전체", dateStart: "", dateEnd: "",
    qOrderer: "", qRecipient: "", qChannel: "", qOrderNo: "", qAddress: "",
  };
  const DP_MIN = new Date(2000, 0, 1);
  const DP_MAX = new Date(new Date().getFullYear() + 2, 11, 31);
  let activeModal = null;
  let editing = null;      // 편집 작업본 (입력은 전부 여기로 write-through)
  let isNew = false;
  const dds = [];          // makeDropdown 인스턴스 (renderModal 마다 destroy→재생성)
  const toast = makeToast();

  const findOrder = (id) => b2cList().find((o) => o.id === id);

  function closeModal() {
    const m = activeModal;
    activeModal = null; editing = null;
    if (m) m.close();
  }

  /* ── 목록 ─────────────────────────────────────────────── */
  function filtered() {
    const startD = state.dateStart ? new Date(state.dateStart + "T00:00:00") : null;
    const endD = state.dateEnd ? new Date(state.dateEnd + "T23:59:59") : null;
    const has = (v) => v != null && String(v).trim() !== "";
    const match = (field, q) => !has(q) || (field || "").includes(q.trim());
    return b2cList().filter((o) => {
      if (state.tab !== "all" && o.status !== state.tab) return false;
      /* 토글 칩: 켜진 항목이 있으면 그 항목들만 통과(빈 배열 = 전체) */
      const hasImg = !!o.image;
      if (state.photo.length && !state.photo.includes(hasImg ? "has" : "no")) return false;
      if (state.noti.length && !state.noti.includes(o.notified ? "on" : "off")) return false;
      if (startD || endD) {
        const d = parseFlexDate(state.dateBasis === "deliver" ? o.deliverAt : o.receivedAt);
        if (!d) return false;
        if (startD && d < startD) return false;
        if (endD && d > endD) return false;
      }
      if (!match(o.ordererName, state.qOrderer)) return false;
      if (!match(o.recipientName, state.qRecipient)) return false;
      if (!match(o.channel, state.qChannel)) return false;
      if (!match(o.orderNo, state.qOrderNo)) return false;
      if (!match(o.address, state.qAddress)) return false;
      return true;
    });
  }
  /* 상태 = 언더라인 탭 (활성: 오렌지 밑줄 + 카운트 강조) */
  function tabsBody() {
    const all = b2cList();
    return TABS.map((t) => {
      const count = t.v === "all" ? all.length : all.filter((o) => o.status === t.v).length;
      const active = state.tab === t.v;
      return tabBtn({ v: t.v, label: t.label, count, active });
    });
  }
  function summaryBody() {
    return html`조회 <strong>${filtered().length}</strong>건`;
  }

  /* ══ 필터 블록 — claude_design '필터 영역 리디자인' 시안 ══
     ① 상태 언더라인 탭(+카운트·플로우 텍스트) ② 기간 세그먼트 트랙 +
     datepicker + 배송지 인라인 검색 + 상세 필터 토글(활성 배지)
     ③ 접이식 상세(사진·알림 토글 칩 + 검색 4종 그리드) */
  const srch = (key, label, ph) => ({ key, label, ph, value: state[key] });
  function filterBody() {
    return filterCard({
      tabs: tabsBody(),
      basis: DATE_BASIS, basisActive: state.dateBasis,
      quickActive: state.dateQuick,
      addr: srch("qAddress", "배송지", "배송지 주소로 검색"),
      detailOpen: state.detailOpen, photo: state.photo, noti: state.noti,
      searches: [
        srch("qOrderer", "주문자", "주문자 성함"),
        srch("qRecipient", "받는분", "받는분 성함"),
        srch("qChannel", "주문경로", "예) 네이버 스토어"),
        srch("qOrderNo", "주문번호", "예) B2C-2607-0006"),
      ],
    });
  }
  /* 컬럼: 주문경로 | 주문접수/배송일시 | 배송지 | 받는분 | 상품 | 금액 | 메모 | 현황(배지) | 사진 | 알림 (+관리) */
  const columns = [
    { label: "주문경로", width: "108px", align: "center", render: (r) => html`<div class="ellipsis ord-dim">${r.channel}</div>` },
    { label: "주문접수 / 배송일시", width: "168px", render: (r) => dateCell(r.receivedAt, r.deliverAt, "접수") },
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
    if (rows.length === 0) return html`<div class="admin-empty">조건에 맞는 B2C 주문이 없습니다.</div>`;
    /* 행 배경 = 상태 + 배송일(→ util/date.js). 현황 배지 한 칸만 보고
       '오늘 나갈 건'을 찾던 걸 표 전체가 덩어리로 알려 준다. */
    return tableGrid({ columns, rows, rowKey: (r) => r.id, rowClass: (r) => orderRowTone(r.status, r.deliverAt), compact: true });
  }

  function render() {
    setHTML(root, html`
      <div class="page-admin page-ordscr">
        <div class="admin-inner">
          ${pageTitle({
            imgSrc: "./assets/nav-realtime.png",
            title: "B2C 통합주문관리",
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
  /* 기간 datepicker(시작·종료) — 필터 슬롯 재렌더마다 destroy→재생성, cleanup 에서도 destroy */
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
  /* 필터 조작 시 — 필터 블록(활성 상태) + 요약 + 표 재렌더 (검색 입력은 제외: 포커스 보존) */
  const refreshFilters = () => {
    dateRange.destroy();
    const f = qs(root, "[data-slot='filters']");
    if (f) setHTML(f, filterBody());
    dateRange.bind();
    refreshTableOnly();
  };

  /* ══ 모달 v2 — 모드 없는 상시 편집 (시안 '주문관리 모달 리모델링') ══
     본문(.ord-grid)은 열 때 **한 번만** 그린다. 입력 중 재렌더는 포커스와
     커서를 날리므로, 이후 갱신은 헤더·요약·이력·푸터 슬롯만 건드린다. */
  const imgBox = makeImageBox({ get: () => editing, toast });
  let baseline = null;   // 저장 시점 스냅샷 — dirty 판정 기준
  let savedAt = "";
  let menuOpen = false;

  /* 주문정보 — 4번째 칸이 주문금액(확정). 상품을 고르면 금액이 따라온다. */
  const ORDER_FIELDS = [
    { k: "ordererName", label: "주문자", type: "text", ph: "예) 홍길동" },
    { k: "ordererPhone", label: "연락처", type: "tel", ph: "010-0000-0000" },
    { k: "product", label: "주문상품", type: "select" },
    { k: "amount", label: "주문금액", type: "won" },
  ];
  /* 발주정보 — 두 화면이 글자까지 같다 */
  const DELIVER_FIELDS = [
    { k: "deliverAt", label: "배송일시", type: "datetime", full: true },
    { k: "address", label: "배송지", type: "textarea", full: true, ph: "배송지 주소를 입력하세요" },
    { k: "recipientName", label: "받는분", type: "text", ph: "예) 故 김○○" },
    { k: "recipientPhone", label: "연락처", type: "tel", ph: "010-0000-0000" },
    { k: "ribbonPhrase", label: "리본문구", type: "text", full: true, ph: "예) 삼가 고인의 명복을 빕니다" },
    { k: "ribbonSender", label: "보내는분", type: "text", full: true, ph: "예) 홍길동 · ○○회사 임직원 일동" },
    { k: "request", label: "요청사항", type: "textarea", full: true, ph: "고객이 남긴 요청사항" },
  ];
  const DIRTY_KEYS = [...ORDER_FIELDS, ...DELIVER_FIELDS].map((d) => d.k).concat(["receiver", "memo", "image"]);

  /* 배송완료로 넘어가려면 사진과 인수자가 있어야 한다(기존 자동전환 규칙과 같은 판정) */
  const canComplete = () => !!editing?.image && !!String(editing?.receiver || "").trim();
  const dirtyCount = () =>
    baseline ? DIRTY_KEYS.filter((k) => String(editing[k] ?? "") !== String(baseline[k] ?? "")).length : 0;

  const metaLine = () =>
    `${editing.channel || "경로 미상"} · 접수 ${fmtFull(editing.receivedAt)} · ${fmtFull(editing.deliverAt)} 배송 예정`;

  const summaryRows = () => [
    { k: "상품", v: dash(editing.product) },
    { k: "주문경로", v: dash(editing.channel) },
    { k: "담당자", v: editing.manager || "미지정", empty: !editing.manager, action: "pick-manager" },
  ];

  function modalBody() {
    return html`
      <div class="hm__head ord-hd" data-slot="hd">
        ${ordHeader({ order: editing, meta: metaLine(), statuses: B2C_STATUSES, canComplete: canComplete(), menuOpen, isNew })}
      </div>
      <div class="ord-grid ${isNew ? "ord-grid--new" : ""}">
        ${isNew ? "" : railV2({ order: editing, imgInner: imgBox.inner() })}
        <div class="ord-pane">
          <div class="ord-cols">
            <div class="ord-colL">
              ${card({ title: "주문정보", cap: "고객 접수 내용", body: renderFields(ORDER_FIELDS, editing) })}
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
      ordHeader({ order: editing, meta: metaLine(), statuses: B2C_STATUSES, canComplete: canComplete(), menuOpen, isNew }));
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
      /* 카드 헤더의 'N건' 은 슬롯 밖이라 따로 고친다 */
      const cap = el.parentElement?.querySelector(".ord-card__cap");
      if (cap) cap.textContent = `${(editing.history || []).length}건`;
      histScrollEnd(el);
    }
  }
  /* 입력마다 호출된다 — textContent 만 바꾼다(재렌더 금지) */
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

  /* ── 드롭다운·피커 수명주기 ───────────────────────────── */
  function destroyDds() { dds.forEach((d) => d.destroy()); dds.length = 0; }
  function bindControls(panel) {
    destroyDds();
    const prod = qs(panel, "[data-dd-f='product']");
    if (prod) dds.push(makeDropdown(prod, {
      options: () => B2C_PRODUCTS.map((p) => p.name),
      /* 금액은 바로 옆 '주문금액/적용 단가' 칸에 이미 있다 — 상품명만 보여 준다 */
      label: (v) => v || "상품을 선택하세요",
      get: () => editing.product,
      set: (v) => {
        editing.product = v;
        const price = productPrice(v);
        if (price > 0) {
          editing.amount = price;
          const amt = qs(panel, "[data-f='amount']");
          if (amt) amt.value = won(price); // DOM 직접 갱신 — 재렌더하면 커서가 날아간다
        }
        renderSum();
        syncDirty();
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

  /* 저장 — 모달은 유지한다. 신규만 등록 후 닫힘. */
  function saveOrder() {
    if (!editing) return;
    if (!String(editing.ordererName || "").trim() || !editing.product) {
      toast("주문자 성함과 주문상품은 필수입니다", "warn"); return;
    }
    const n = dirtyCount();
    const merged = { ...editing, amount: Number(String(editing.amount).replace(/[^0-9]/g, "")) || 0 };
    let autoDone = false;
    /* 자동 배송완료 — 주문접수 + 사진 + 인수자 */
    if (!isNew && merged.status === "주문접수" && merged.image && String(merged.receiver || "").trim()) {
      merged.status = "배송완료";
      merged.notified = true;
      autoDone = true;
    }
    delete merged.history; // ⚠️ draft 의 history 는 넘기지 않는다(참조 공유 방지)
    b2cUpsert(merged);
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
    toast(autoDone ? "배송완료 처리됨 · 고객 알림톡이 자동 발송됩니다" : "주문 정보를 저장했습니다");
  }

  /* 입력 중 3-4-4 하이픈 (커서는 끝으로 — 중간 편집은 드물다) */
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
        if (!isNew) b2cSetManager(editing.id, v); // 담당자만 즉시 반영 + 이력 기록
        const stored = findOrder(editing.id);
        if (stored) editing.history = stored.history;
        if (baseline) baseline.manager = v; // 담당자는 즉시 저장이라 dirty 가 아니다
        refreshList();
        renderHd(); renderSum(); renderHist();
      },
    });
  }

  /* 스테퍼 — 앞으로만. 배송완료는 사진·인수자가 있어야 한다. */
  function stepTo(next) {
    if (!editing || isNew) return;
    const flow = B2C_STATUSES.filter((s) => s !== "취소");
    const cur = flow.indexOf(editing.status);
    const to = flow.indexOf(next);
    if (to < 0 || to === cur) return;
    if (to < cur) { toast("상태는 되돌릴 수 없습니다 · 잘못 눌렀다면 주문취소를 쓰세요", "warn"); return; }
    if (next === "배송완료" && !canComplete()) {
      toast("현장사진과 인수자를 먼저 입력하세요", "warn"); return;
    }
    editing.status = next;
    if (next === "배송완료") editing.notified = true;
    b2cSetStatus(editing.id, next);
    const stored = findOrder(editing.id);
    if (stored) editing.history = stored.history;
    refreshList();
    renderHd(); renderHist();
    toast(next === "배송완료" ? "배송완료로 전환 · 고객 알림톡이 발송됩니다" : `${next}(으)로 변경했습니다`);
    const p = panelOf();
    if (p) qs(p, ".ord-step__btn.is-now")?.focus(); // 재렌더로 사라진 버튼의 포커스 복구
  }

  function openEditor(order, _isNew) {
    closeModal();
    const { history: _h, ...draft } = order; // ⚠️ history 는 draft 에 싣지 않는다
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

    /* 이벤트는 panel 위임으로 1회만 — 슬롯 재렌더에도 전부 생존 */
    on(panel, "click", "[data-action='close']", () => closeModal());
    on(panel, "click", "[data-action='save']", () => saveOrder());
    on(panel, "click", "[data-action='step']", (e, t) => stepTo(t.dataset.v));
    on(panel, "click", "[data-action='menu']", () => { menuOpen = !menuOpen; renderHd(); });
    on(panel, "click", "[data-action='delete']", () => {
      menuOpen = false;
      openDeleteConfirm({
        orderNo: editing.orderNo,
        onConfirm: () => {
          const name = editing.orderNo;
          b2cRemove(editing.id);
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
        onConfirm: ({ reason, fee }) => {
          editing.status = "취소";
          editing.cancelReason = reason;
          editing.cancelFee = fee;
          const { history: _x, ...rec } = editing;
          b2cUpsert(rec);
          b2cSetStatus(editing.id, "취소");
          const stored = findOrder(editing.id);
          if (stored) editing.history = stored.history;
          refreshList();
          renderHd(); renderHist();
          toast("주문을 취소 처리했습니다", "warn");
        },
      });
    });
    imgBox.bind(panel, () => { renderHd(); renderSum(); syncDirty(); }); // 업로드 후 스테퍼 조건이 바뀐다
    on(panel, "click", "[data-action='pick-manager']", () => openManagerModal());
    /* 상시 편집 — 값은 write-through 하고 **재렌더하지 않는다** */
    on(panel, "input", "input[data-f], textarea[data-f]", (e, t) => {
      if (!editing) return;
      const k = t.dataset.f;
      if (k === "ordererPhone" || k === "recipientPhone") editing[k] = formatPhone(t);
      else if (k === "amount") editing[k] = t.value;
      else editing[k] = t.value;
      if (t.tagName === "TEXTAREA") autosize(t);
      if (k === "receiver" || k === "image") renderHd(); // 배송완료 조건이 바뀐다
      syncDirty();
    });
    /* API 자동등록(담당자 미지정) 주문을 열면 담당자 지정을 우선 노출 */
    if (!isNew && !editing.manager) openManagerModal();
  }

  render();
  dateRange.bind(); // 초기 렌더 후 기간 datepicker 연결

  /* ── 목록 이벤트 (위임 · root 유지) ────────────────────── */
  const offList = on(root, "click", "[data-action]", (e, t) => {
    const a = t.dataset.action;
    if (a === "tab") { state.tab = t.dataset.v; refreshFilters(); return; }
    if (a === "datebasis") { state.dateBasis = t.dataset.v; refreshFilters(); return; }
    if (a === "date") {
      const label = t.dataset.v;
      state.dateQuick = label;
      if (label === "전체") { state.dateStart = ""; state.dateEnd = ""; }
      else { const [rs, re] = getDateRange(label); state.dateStart = formatDateLabel(rs); state.dateEnd = formatDateLabel(re); }
      refreshFilters();
      return;
    }
    if (a === "photofilter" || a === "notifilter") {
      const key = a === "photofilter" ? "photo" : "noti";
      const v = t.dataset.v;
      state[key] = state[key].includes(v) ? state[key].filter((x) => x !== v) : [...state[key], v];
      refreshFilters();
      return;
    }
    if (a === "detail-toggle") { state.detailOpen = !state.detailOpen; refreshFilters(); return; }
    if (a === "new") return openEditor(blankOrder(), true);
    if (a === "edit") { const o = findOrder(t.dataset.id); if (o) openEditor(o, false); return; }
  });
  const offSearch = on(root, "input", "[data-search]", (e, t) => {
    state[t.dataset.search] = t.value;
    const sum = qs(root, "[data-slot='summary']");
    const tbl = qs(root, "[data-slot='table']");
    if (sum) setHTML(sum, summaryBody());
    if (tbl) setHTML(tbl, tableBody());
  });

  return () => {
    offList(); offSearch();
    dateRange.destroy();
    closeModal();
    toast.destroy();
  };
}
