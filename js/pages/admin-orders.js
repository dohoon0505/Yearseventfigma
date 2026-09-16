/* ============================================================
   admin-orders.js — 거래처 주문관리 (구 시스템 '거래처 주문 조회(202)')

   통합주문관리(#/admin/b2c)와 **UI/UX 를 동일하게** 맞춘 화면이다. 같은 일을
   하는 두 화면이 다르게 생기면 담당자가 화면마다 조작을 다시 배워야 한다.
   표기·필터 카드·표 셀·모달 구역/레일/사진·담당자 지정은 전부 공용
   → js/util/order-screen.js (짝 CSS 는 components.css 의 .ord-*).

   B2C 와 의도적으로 다른 1%:
   - 표 1열이 주문경로가 아니라 **거래처**(사업자번호를 공유하면 부서 병기).
     ⚠️ 거래조건 `!` 배지는 **없다** — 모달이 전문을 띄우므로 중복이라 뺐다(되살리지 말 것)
   - 날짜 기준 세그가 '접수일'이 아니라 **'주문일'**(B2B 필드는 date)
   - 주문정보 존에 **정산 귀속월·적용 단가** 2행이 더 있다. 거래처 후불 정산의
     근거라 **잠가 둔다**(모달은 모드 없는 상시 편집이라 '편집 모드'라는 것이 없다)
     — 여기서 바뀌면 정산 드릴다운이 어긋난다
   - clientNote(거래 조건)는 최상단 배너가 아니라 **요약 레일 맨 아래 카드**다.
     메모가 아니라 거래 조건이고((주)홈팩: "무조건 특대상품 발송") 빠지면 주문마다 사고가 난다
   - 주문취소는 settle:true — 수수료가 그 달 정산에 가산된다는 안내
   - 주문서 삭제에 확인 모달. 정산 근거가 사라지는 일이라 B2C 처럼
     바로 지우지 않는다

   페이지 규약: mount(root, { nav }) → cleanup.
   ============================================================ */
import { html, setHTML, on, qs, qsa } from "../dom.js";
import { makeToast } from "../toast.js";
import { icon } from "../icons.js";
import { pageTitle, tableGrid, openModal, makeDropdown, makeDateTimePicker, rowToneLegend } from "../ui.js";
import { getDateRange, formatDateLabel, orderRowTone, byToneRank } from "../util/date.js";
import { openCancelModal } from "../util/cancel-modal.js";
import { onPhoneInput } from "../util/phone.js";
import { openOrderCreate } from "../util/order-create.js";
import { openRowPicker, openAutofill, MANUAL } from "../util/order-dialogs.js";
import { pushHistory } from "../data/order-history.js";
import { sharedBizKeys, displayName } from "../util/biz.js";
import { store, ALL_PRODUCTS, productKey, priceNum, receivingContacts, MSG_RECEIVE } from "../store.js";
import { staffNames, staffOptions } from "../data/staff-mock.js";
import {
  won, pad2, dash, fmtFull, parseFlexDate, statusBadge, tabDefs,
  tabBtn, filterCard, makeDateRange,
  dateCell, photoFlag, notiFlag, amtCell, editBtn, onRowOpen,
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
/* 적용 단가는 `store.appliedPrice` 단일 소스에 맡긴다 — 여기에 규칙을 복제하면
   포털과 관리자 화면이 갈린다(실제로 갈렸던 전력이 있다). */
const priceFor = (clientId, name) => store.appliedPrice(clientId, name);
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
    })
      /* 색 순서로 무조건 정렬 — 노랑(접수대기) → 핑크(당일·지연) → 파랑(예약)
         → 흰색(배송완료) → 회색(취소). 안정 정렬이라 색 안에서는 기존 순서 유지. */
      .sort(byToneRank((o) => o.deliverAt));
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
  const summaryBody = () => html`<span>조회 <strong>${filtered().length}</strong>건</span>${rowToneLegend()}`;
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
    /* 거래 조건(clientNote)은 목록에 표시하지 않는다 — 상세 모달의 '거래 조건'
       카드가 전문을 띄우므로 목록 배지는 중복이다. */
    {
      label: "거래처", width: "150px",
      render: (r) => html`<div class="ellipsis" title="${clientName(r)}">${clientName(r)}</div>`,
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
        ${ordHeader({ order: editing, meta: metaLine(), statuses: B2B_STATUSES, canComplete: canComplete(), menuOpen })}
      </div>
      <div class="ord-grid">
        ${railV2({ order: editing, imgInner: imgBox.inner() })}
        <div class="ord-pane">
          <div class="ord-cols">
            <div class="ord-colL">
              ${card({ title: "주문정보", cap: "거래처 접수 내용", body: renderFields(ORDER_FIELDS(), editing) })}
              ${card({ title: "발주정보", cap: "화원 전달 내용", body: renderFields(DELIVER_FIELDS, editing) })}
            </div>
            <div class="ord-colR">
              <section class="ord-card" data-slot="sum">${summaryBodyV2({ order: editing, rows: summaryRows() })}</section>
              ${card({
                title: "처리 이력", cap: `${(editing.history || []).length}건`,
                body: historyBody(editing), slot: "hist",
              })}
              ${/* 거래 조건은 메모가 아니라 거래 조건이다 — 요약 레일 맨 아래에 붙여
                   담당자가 발주를 결정하기 직전에 한 번 더 보게 한다.
                   껍데기는 요약·처리 이력과 **같은 .ord-card**, 본문 글자만 경고색. */ ""}
              ${c && c.clientNote ? card({
                title: "거래 조건", cap: c.companyName, cls: "ord-note",
                body: html`<p class="ord-note__body">${c.clientNote}</p>`,
              }) : ""}
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
      ordHeader({ order: editing, meta: metaLine(), statuses: B2B_STATUSES, canComplete: canComplete(), menuOpen }));
  }
  function renderSum() {
    const p = panelOf(); if (!p) return;
    const el = qs(p, "[data-slot='sum']");
    if (el) setHTML(el, summaryBodyV2({ order: editing, rows: summaryRows() }));
  }
  function renderHist() {
    const p = panelOf(); if (!p) return;
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


  /* ══ 주문서 등록 모달 (B2B) ═══════════════════════════════
     ⚠️ 상세 모달과 **다른 모달**이다 — 셸도 핸들도 따로다. `activeModal`/`editing`
     을 건드리지 않는다(`openEditor` 첫 줄이 `closeModal()` 이라 서로를 닫는다).

     시안: B2B 는 **거래처**가 주문의 성격을 정한다 — 계약단가·거래 조건·월 청구가
     거기서 갈린다. 그래서 1단계가 통째로 거래처 선택이다.
     ─────────────────────────────────────────────────────── */
  let createModal = null;   // ← 상세 모달의 activeModal 과 **별개 핸들**
  let cDraft = null;
  let cQuery = "";
  /* 요청자를 직접 적고 있는가. 담당자가 0명인 거래처에선 계산으로 항상 true —
     이 플래그는 "목록도 있는데 굳이 직접 적기를 골랐다"만 기억한다. */
  let cReqManual = false;
  /* 직접 적어 둔 값의 스냅샷 — 목록 행을 눌렀다 '직접 입력'으로 돌아오면 되살린다.
     실수로 행을 한 번 눌렀다고 방금 친 이름을 다시 치게 만들지 않는다. */
  let cReqManualSnap = { name: "", phone: "" };
  /* 1단계 부분 갱신용 렌더러 참조 — openCreate() 안의 클로저를 밖에서 부르려면 필요하다.
     (거래처를 고를 때 **거래처 카드는 다시 그리지 않는다** — 목록 스크롤과 검색 캐럿을
      지키려고 요청자 카드 슬롯만 갈아 끼운다.) */
  let cRenderReq = null;
  let cRenderList = null;
  let cRenderCli = null;
  let cRenderSum = null;
  /* 거래처를 이미 골랐는데도 목록을 **다시 펼쳐 둔** 상태인가('다른 거래처 선택'). */
  let cCliOpen = false;
  const cDds = [];
  const cDestroy = () => { cDds.forEach((d) => d.destroy()); cDds.length = 0; };

  const cClient = () => clients().find((c) => c.id === cDraft.clientId) || null;
  const cContacts = () => (cDraft.clientId ? store.contactsOf(cDraft.clientId) : []);
  const cRequester = () => cContacts().find((x) => x.id === cDraft.requesterId) || null;
  /* 직접 입력 칸이 살아 있는가 — 담당자 0명이면 선택지가 그것뿐이라 강제로 열려 있다.
     (이관 거래처 19곳 중 18곳이 담당자 0명이다 — 예외 경로가 아니라 주경로다.) */
  const cReqManualOn = () => !cContacts().length || cReqManual;
  const cProfile = () => store.get().profiles.find((p) => p.id === cDraft.profileId) || null;
  const profileText = (p) => (p ? (p.greeting && p.greeting.trim()) || `${p.role} ${p.name}` : "");

  /* 거래처 변경 시 초기화 대상 — 계약단가·거래 조건·담당자가 전부 거래처에 매인다.
     ⚠️ 배송지·받는분·리본문구는 **유지**한다. 거래처 하나 잘못 골랐다고 다 지우면
        아무도 안 쓴다. */
  /* 슬롯 하나만 갈아 끼우는 부분 갱신 — `card({ slot })` 이 만든 래퍼를 노린다.
     ⚠️ `setHTML` 은 Html 인스턴스가 아니면 이스케이프 없이 innerHTML 에 넣는다 —
        평문 문자열을 넘기지 말 것(회사명은 가입 화면의 자유 입력이다). */
  const cPut = (slot, body) => {
    const e = createModal && qs(createModal.panel, `[data-slot='${slot}']`);
    if (e) setHTML(e, typeof body === "string" ? html`${body}` : body);
  };

  /* 요청자 결과 한 줄만 갱신 — 입력의 형제 노드라 커서를 건드리지 않는다.
     텍스트라 `textContent` 로 쓴다(이스케이프 걱정이 아예 없다). */
  const syncReqSum = () => {
    const e = cRenderSum && createModal && qs(createModal.panel, "[data-slot='creqsum']");
    if (!e) return;
    e.textContent = cRenderSum.text();
    e.classList.toggle("is-warn", cRenderSum.warn());
  };

  function cPickClient(id) {
    if (cDraft.clientId === id) {
      /* 동일값 재선택은 채워둔 값을 날리지 않는다 — 다만 '다른 거래처 선택'으로 펼쳐
         둔 목록에서 **같은 거래처를 다시 골랐다면** 접어 줘야 한다. 안 그러면 목록이
         영영 펼쳐진 채 남아 아래 두 카드가 폴드 밖으로 밀린다. */
      if (cCliOpen) { cCliOpen = false; if (cRenderCli) cPut("cli", cRenderCli()); }
      return;
    }
    cDraft.clientId = id;
    cDraft.requesterId = ""; cDraft.requesterName = ""; cDraft.requesterPhone = "";
    cReqManual = false; cReqManualSnap = { name: "", phone: "" };
    cDraft.product = ""; cDraft.amount = 0; cDraft.notifyOff = [];
    /* ⚠️ 1단계를 통째로 재렌더하지 않는다 — 슬롯 둘만 갈아 끼운다(담당자 카드는 거래처와
       무관하므로 건드리지 않는다). 거래처 슬롯은 목록에서 '고른 한 줄'로 접히고,
       그만큼 아래 두 카드가 폴드 위로 올라온다. */
    cCliOpen = false;
    if (cRenderCli) cPut("cli", cRenderCli());
    if (cRenderReq) cPut("creq", cRenderReq());   /* 새 마크업이라 요약 한 줄도 같이 갱신된다 */
    createModal.rerenderStep("s2");
    createModal.rerenderRail(); createModal.syncFooter(); createModal.markTouched();
  }

  /* 계약단가 판정 — 규칙은 store.contractPrice 단일 소스를 쓴다(복제 금지). */
  function cBasis() {
    if (!cDraft.product) return "상품 선택 후 자동 적용";
    const base = priceNum((ALL_PRODUCTS.find((p) => p.product === cDraft.product) || {}).price);
    const c = store.contractPrice(cDraft.clientId, cDraft.product);
    const cur = Number(String(cDraft.amount).replace(/[^0-9]/g, "")) || 0;
    if (c == null || c === base) return "계약단가 미등록 · 기준단가 적용";
    return cur === c ? "계약단가 적용" : `계약단가(${won(c)})와 다름`;
  }

  /* 등록 모달의 발주정보 = 상세와 같은 배열 + 시안의 '발송 프로필' 한 줄.
     배열을 다시 타이핑하지 않는다 — 한 화면 안에서 두 모달이 갈린다. */
  const CREATE_DELIVER = [
    ...DELIVER_FIELDS.filter((d) => d.k !== "ribbonSender"),
    { k: "ribbonSender", label: "발송 프로필", type: "pick", full: true, ph: "저장된 프로필에서 불러오세요" },
  ];

  function openCreate() {
    if (createModal) return;   /* 두 번 눌러 등록 모달이 겹쳐 열리지 않게 */
    cDraft = draftOrder();
    cQuery = "";
    cReqManual = false;
    cReqManualSnap = { name: "", phone: "" };
    cCliOpen = false;

    /* ── step1: 거래처 ── */
    const cliRows = () => {
      const shared = sharedBizKeys(clients());
      const q = cQuery.trim().toLowerCase();
      /* 정지·반려 거래처의 주문이 그 달 청구에 들어가면 안 된다 — 활성만 노출. */
      return clients().filter((c) => c.status === "활성").filter((c) => {
        if (!q) return true;
        return [displayName(c, shared), c.accountId, c.bizNumber, c.department]
          .some((v) => String(v || "").toLowerCase().includes(q));
      });
    };
    const cliListBody = () => {
      const shared = sharedBizKeys(clients());
      const rows = cliRows();
      if (!rows.length) {
        return html`<p class="ordnew-cli__empty">'${cQuery}' 로 찾은 활성 거래처가 없습니다.
          <br />정지·반려 상태의 거래처에는 주문을 등록할 수 없습니다.</p>`;
      }
      return html`${rows.map((c) => html`
        <button type="button" class="ordnew-cli ${cDraft.clientId === c.id ? "is-on" : ""}"
          data-ccli="${c.id}" aria-pressed="${cDraft.clientId === c.id ? "true" : "false"}">
          <span class="ordnew-cli__nm">${displayName(c, shared)}</span>
          <span class="ordnew-cli__sub">${c.bizNumber}${c.department ? ` · ${c.department}` : ""}</span>
          ${c.clientNote ? html`<span class="ordnew-cli__badge">거래 조건</span>` : ""}
          <span class="ordnew-cli__ch">${c.channel || "일반"}</span>
        </button>`)}`;
    };
    /* 주문 요청자 — 거래처 쪽 사람. **필수**다.
       ⚠️ 예전엔 거래처 카드 맨 아랫줄에 작은 '선택' 버튼 한 개였고, 그걸 누르면
          다이얼로그가 떴다. 그런데 이관 거래처 19곳 중 18곳이 담당자 0명이라
          그 다이얼로그는 거의 언제나 "'직접 입력' 행을 찾아 눌러 이름을 적는"
          4클릭 우회로였다 — 예외 경로가 주경로였다. 그래서 **카드로 떼어 내고
          목록·직접 입력 칸을 그 자리에 펼친다**(담당자 0명이면 0클릭, 있으면 1클릭).
       ⚠️ 저장 스키마는 그대로다: 목록에서 고르면 requesterId + 이름·연락처 스냅샷,
          직접 적으면 requesterId="" + 이름·연락처. 담당자 저장공간은 건드리지 않는다. */
    const reqBody = () => {
      const cl = cClient();
      if (!cl) return html`<p class="ordnew-req__lead">거래처를 먼저 선택하면 그 거래처의 담당자가 여기에 나타납니다.</p>`;
      const cts = cContacts();
      const man = cReqManualOn();
      return html`
        ${cts.length ? html`
          <div class="ordnew-req" role="radiogroup" aria-label="주문 요청자 · 거래처 측"
            aria-describedby="creq-sum">
            ${cts.map((ct) => html`
              <button type="button" class="ordnew-req__row ${cDraft.requesterId === ct.id ? "is-sel" : ""}"
                role="radio" aria-checked="${cDraft.requesterId === ct.id ? "true" : "false"}" data-creq-pick="${ct.id}">
                <span class="ordnew-req__nm">${ct.name || "이름 없음"}</span>
                <span class="ordnew-req__sub">${[ct.role, ct.isBilling ? "정산 담당" : "",
                  ct.message === MSG_RECEIVE ? "" : "알림 수신 꺼짐"].filter(Boolean).join(" · ")}</span>
                <span class="ordnew-req__ph">${ct.phone || "연락처 미등록"}</span>
              </button>`)}
            <button type="button" class="ordnew-req__row ${man ? "is-sel" : ""}"
              role="radio" aria-checked="${man ? "true" : "false"}" data-creq-pick="${MANUAL}">
              <span class="ordnew-req__nm">직접 입력</span>
              <span class="ordnew-req__sub">담당자 프로필에 없는 요청자 — 이 주문에만 기록됩니다</span>
            </button>
          </div>`
          : html`<p class="ordnew-req__lead">${cl.companyName}에 등록된 담당자가 없습니다 · 요청자를 직접 적어 주세요.</p>`}
        <div class="ord-row ordnew-req__man" data-slot="creqman" ${man ? "" : "hidden"}>
          <label class="ord-k">이름</label>
          <input class="ord-in" data-creq="requesterName" value="${cDraft.requesterName}"
            placeholder="주문을 요청한 분" aria-label="주문 요청자 이름" aria-required="true"
            aria-describedby="creq-sum" ${man ? "" : "disabled"} />
          <label class="ord-k">연락처</label>
          <input class="ord-in ord-in--num" data-creq="requesterPhone" value="${cDraft.requesterPhone}"
            inputmode="numeric" placeholder="배송완료 알림을 받습니다" aria-label="주문 요청자 연락처"
            aria-describedby="creq-sum" ${man ? "" : "disabled"} />
        </div>
        <p class="ordnew-req__sum ${reqSumWarn() ? "is-warn" : ""}" id="creq-sum" data-slot="creqsum">${reqSum()}</p>`;
    };

    /* 이 요청자가 **정말로** 배송완료 알림을 받는가.
       ⚠️ 판정은 `notifySnapshot()`(저장되는 명단)과 같은 규칙이어야 한다. 목록에서 고른
          요청자는 담당자 저장공간의 수신 설정(`MSG_RECEIVE`)에 매이는데, 수신을 꺼 둔
          담당자(시드의 오임찬이 그렇다)를 골라 놓고 화면만 '받습니다'라고 말하면
          **거짓말**이 된다 — 2단계 레일 명단에는 그 행조차 생기지 않아 토글로 확인할
          수도 없다. 문구와 저장값이 갈리지 않게 여기 한 곳에서만 판정한다. */
    const reqNotify = () => {
      if (!String(cDraft.requesterPhone || "").trim()) {
        return { on: false, why: "연락처 미입력이라 배송완료 알림을 보낼 수 없습니다" };
      }
      if (cDraft.requesterId) {
        if (!receivingContacts(cContacts()).some((c) => c.id === cDraft.requesterId)) {
          return { on: false, why: "담당자 설정에서 알림 수신을 꺼 둬 배송완료 알림을 받지 못합니다" };
        }
        if (cDraft.notifyOff.includes(`ct:${cDraft.requesterId}`)) {
          return { on: false, why: "이 주문에서 배송완료 알림 수신을 껐습니다" };
        }
        return { on: true, why: "배송완료 알림을 받습니다" };
      }
      return cDraft.notifyOff.includes("requester")
        ? { on: false, why: "이 주문에서 배송완료 알림 수신을 껐습니다" }
        : { on: true, why: "배송완료 알림을 받습니다" };
    };

    /* 확정된 요청자 한 줄. **연락처가 없으면 배송완료 알림을 못 보낸다**는 사실이
       1단계 어디에도 없었다 — 레일의 알림 명단은 2단계(`i === 1`)에서만 그려진다.
       ⚠️ `aria-live` 는 걸지 않는다(글자마다 읽는다). 두 입력의 `aria-describedby` 로
          묶어 포커스가 들어올 때 한 번 읽히게 한다. */
    const reqSumWarn = () => !!String(cDraft.requesterName || "").trim() && !reqNotify().on;
    const reqSum = () => {
      if (!cDraft.clientId) return "";
      const nm = String(cDraft.requesterName || "").trim();
      if (!nm) return "요청자를 지정해야 다음 단계로 넘어갑니다.";
      const ph = String(cDraft.requesterPhone || "").trim();
      const via = cDraft.requesterId ? "담당자 프로필" : "이 주문에만 기록";
      return `${nm}${ph ? ` · ${ph}` : ""} · ${via} · ${reqNotify().why}.`;
    };

    /* 주문 담당자 — 우리 쪽 사람. 필수가 아니다(신규는 미지정으로 시작하는 규약).
       5명뿐이라 다이얼로그를 열 이유가 없다 — 칩으로 펼쳐 한 번에 고른다.
       ⚠️ 목록에서 사라진 담당자는 맨 앞에 남긴다(조용한 재배정이 가장 나쁜 결과다). */
    const mgrBody = () => {
      const list = staffOptions();
      const cur = cDraft.manager || "";
      const rows = cur && !list.some((s2) => s2.name === cur)
        ? [{ name: cur, dept: "목록에 없음" }, ...list] : list;
      const chip = (v, label, dept) => html`
        <button type="button" class="ordnew-mgr__chip ${cur === v ? "is-sel" : ""}"
          role="radio" aria-checked="${cur === v ? "true" : "false"}" data-cmgr="${v}">
          <b>${label}</b>${dept ? html`<span>${dept}</span>` : ""}
        </button>`;
      return html`
        <div class="ordnew-mgr" role="radiogroup" aria-label="주문 담당자 · 우리 직원">
          ${chip("", "지정하지 않음", "")}
          ${rows.map((s2) => chip(s2.name, s2.name, s2.dept))}
        </div>`;
    };

    /* 거래처 카드 본문 — **고르고 나면 목록을 접는다.**
       ⚠️ 1단계가 카드 셋(거래처·요청자·담당자)이 되면서, 목록(168px)+검색(62px)을 계속
          펼쳐 두면 1280x720·1366x768 에서 담당자 카드가 **폴드 아래로 통째로 사라진다**
          (실측: 담당자 칩 top 이 스크롤포트 바닥보다 35px 아래). 목록은 고르기 전에만
          필요하다 — 고른 뒤에는 무엇을 골랐는지 한 줄이면 되고, 그 자리를 요청자·담당자
          카드가 받는다. '다른 거래처 선택'으로 언제든 다시 편다. */
    const cliCardBody = () => {
      const c = cCliOpen ? null : cClient();
      if (!c) {
        return html`
          <div class="ordnew-clisrch">
            ${icon("search", { size: 14, cls: "ordnew-clisrch__ic" })}
            <input type="text" data-ccliq value="${cQuery}" placeholder="거래처명 · 사업자번호 · 담당 부서로 검색" aria-label="거래처 검색" />
          </div>
          <div class="ordnew-clilist" data-slot="clilist">${cliListBody()}</div>`;
      }
      return html`
        <div class="ordnew-clipick">
          <span class="ordnew-clipick__nm">${displayName(c, sharedBizKeys(clients()))}</span>
          <span class="ordnew-clipick__sub">${[c.bizNumber, c.department, `${c.channel || "일반"} 채널`].filter(Boolean).join(" · ")}</span>
          ${c.clientNote ? html`<span class="ordnew-cli__badge">거래 조건</span>` : ""}
          <button type="button" class="ordnew-clipick__btn" data-action="ccli-reopen">다른 거래처 선택</button>
        </div>`;
    };

    /* 부분 갱신용 렌더러 참조는 **선언이 끝난 뒤에** 잡는다 — 위로 올리면 `cliCardBody`
       가 아직 TDZ 라 모달이 열리지도 않는다. */
    cRenderReq = reqBody;
    cRenderList = cliListBody;
    cRenderCli = cliCardBody;
    cRenderSum = { text: reqSum, warn: reqSumWarn };

    const step1Body = () => html`
      <section class="ord-card">
        <div class="ord-card__head">
          <b class="ord-card__t">거래처</b>
          <span class="ord-card__cap">계약단가·거래 조건·월 청구 기준이 함께 정해집니다</span>
        </div>
        <div data-slot="cli">${cliCardBody()}</div>
      </section>
      ${card({ title: "주문 요청자", cap: "주문을 요청한 거래처 담당자",
               body: reqBody(), slot: "creq" })}
      ${card({ title: "주문 담당자", cap: "이 주문을 처리할 우리 직원", body: mgrBody(), slot: "cmgr" })}`;

    /* ── step2: 상품·단가 + 발주정보 ── */
    const step2Body = () => html`
        <section class="ord-card">
          <div class="ord-card__head">
            <b class="ord-card__t">상품 · 단가</b>
            <span class="ord-card__cap">${(() => {
              /* 레일에서 계약단가 카드를 뺐으므로 **계약 상품 개수는 여기서만 말한다** —
                 예전엔 이 캡션이 개수를 불리언으로만 썼다. */
              const n = store.contractCount(cDraft.clientId);
              return n ? `${n}개 상품에 계약단가가 적용됩니다` : "계약단가 미등록 · 기준단가가 적용됩니다";
            })()}</span>
          </div>
          ${renderFields(ORDER_FIELDS(), cDraft)}
          <div class="ord-row ord-row--full">
            <label class="ord-k">단가 기준</label>
            <span class="ordnew-basis" data-slot="basis">${cBasis()}</span>
          </div>
        </section>
        ${card({ title: "발주정보", cap: "화원 전달 내용",
                 body: renderFields(CREATE_DELIVER, cDraft) })}`;

    /* ── 레일 ── */
    const notifyRows = () => {
      const rows = [];
      if (String(cDraft.recipientName || "").trim()) {
        rows.push({ key: "recipient", name: cDraft.recipientName, sub: cDraft.recipientPhone || "연락처 미입력 · 발송 불가",
                    locked: !String(cDraft.recipientPhone || "").trim(), kind: "받는분" });
      }
      const pf = cProfile();
      if (pf) rows.push({ key: "sender", name: profileText(pf), sub: pf.phone, locked: false, kind: "보내는분" });
      /* 직접 입력한 요청자는 담당자 저장공간에 없어 아래 자동 편입에 걸리지 않는다.
         주문을 요청한 사람이야말로 배송완료를 가장 먼저 알아야 한다 — 따로 싣는다. */
      if (!cDraft.requesterId && String(cDraft.requesterName || "").trim()) {
        rows.push({ key: "requester", name: cDraft.requesterName,
                    sub: cDraft.requesterPhone || "연락처 미입력 · 발송 불가",
                    locked: !String(cDraft.requesterPhone || "").trim(), kind: "주문 요청자" });
      }
      receivingContacts(cContacts()).forEach((ct) => {
        rows.push({ key: `ct:${ct.id}`, name: ct.name, sub: ct.phone || "연락처 미등록",
                    locked: !String(ct.phone || "").trim(), kind: "주문 요청자·담당자", auto: true });
      });
      return rows;
    };
    /* ⚠️ 레일에서 계약단가·계산서 발행·이번 발주 **카드는 뺐다**(사용자 지시, 2026-09-16).
       세 값 모두 이미 다른 곳에서 말한다 — 계약단가는 '상품 · 단가' 카드 머리글과
       '단가 기준' 줄(cBasis)이, 이번 발주 금액은 step2 hint() 푸터가, 계산서 발행일은
       아래 식별 캡션 한 줄이 말한다. 레일의 자리는 **거래처마다 갈리는 것**,
       곧 거래 조건(clientNote)과 알림 명단에 준다. 되살리지 말 것. */
    const railBody = (i) => {
      const c = cClient();
      if (!c) {
        return html`<div class="ord-side__h"><b class="ord-side__t">거래처 미선택</b></div>
          <p class="ord-side__note">거래처를 고르면 그 거래처의 거래 조건과 청구 기준이 여기에 표시됩니다.</p>`;
      }
      return html`
        <div class="ord-side__h"><b class="ord-side__t">${c.companyName}</b></div>
        <p class="ord-side__cap">${[c.bizNumber, c.department, `${c.channel || "일반"} 채널`,
          `매월 ${Number(c.invoiceDay) || 1}일 계산서`].filter(Boolean).join(" · ")}</p>
        <div class="rail-card">
          <p class="rail-card__k">거래 조건</p>
          ${c.clientNote
            ? html`<p class="rail-card__note">${c.clientNote}</p>`
            : html`<p class="rail-card__note rail-card__note--none">등록된 거래 조건이 없습니다 · 기준 절차로 접수합니다</p>`}
        </div>
        ${i === 1 ? html`
          <div class="ordnew-nt" data-slot="railnoti">
            <p class="ord-side__lbl">배송완료 알림 수신</p>
            ${notifyRows().length ? notifyRows().map((r) => html`
              <div class="ordnew-nt__row">
                <span class="ordnew-nt__who">
                  <b>${r.name}</b>${r.auto ? html`<em class="ordnew-nt__auto">자동</em>` : ""}
                  <span>${r.sub}</span>
                </span>
                <button type="button" class="toggle" role="switch" data-cnt="${r.key}"
                  aria-checked="${!r.locked && !cDraft.notifyOff.includes(r.key) ? "true" : "false"}"
                  aria-label="${r.name} 배송완료 알림 수신" ${r.locked ? "disabled" : ""}><span class="toggle__knob"></span></button>
              </div>`)
              : html`<p class="ord-side__cap">받는분·발송 프로필을 입력하면 명단이 만들어집니다.</p>`}
          </div>` : ""}
        <p class="ord-side__note">거래처를 바꾸면 요청자·주문상품·알림 설정이 초기화됩니다.</p>`;
    };

    const missing1 = () => {
      const out = [];
      if (!cDraft.clientId) out.push("거래처");
      if (!String(cDraft.requesterName || "").trim()) out.push("주문 요청자");
      return out;
    };
    const missing2 = () => {
      const need = [["product", "주문상품"], ["address", "배송지"], ["recipientName", "받는분"],
                    ["ribbonPhrase", "리본문구"], ["profileId", "발송 프로필"]];
      return need.filter(([k]) => !String(cDraft[k] ?? "").trim()).map(([, l]) => l);
    };

    createModal = openOrderCreate({
      title: "B2B 거래처 주문 등록",
      subtitle: "거래처 계약단가로 접수하고, 월 마감 후 계산서로 청구합니다",
      autofill: true,
      toast,
      steps: [
        { key: "s1", title: "거래처", cap: "주문의 성격을 정합니다",
          render: step1Body, bind: () => [], required: missing1,
          hint: () => { const c = cClient(); return c ? `${c.companyName} · 매월 ${Number(c.invoiceDay) || 1}일 계산서로 청구합니다` : ""; } },
        { key: "s2", title: "주문서 작성", cap: "화원에 전달되는 내용",
          render: step2Body, bind: bindCreateControls, required: missing2,
          hint: () => {
            const cur = Number(String(cDraft.amount).replace(/[^0-9]/g, "")) || 0;
            const on = notifyRows().filter((r) => !r.locked && !cDraft.notifyOff.includes(r.key)).length;
            return `${won(cur)} (VAT 별도) · 알림 ${on}명${cDraft.manager ? ` · 담당 ${cDraft.manager}` : ""}`;
          } },
      ],
      rail: railBody,
      submitLabel: "주문 등록",
      onSubmit: submitCreate,
      onClose: () => {
        cDestroy();
        createModal = null; cDraft = null;
        cRenderReq = null; cRenderList = null; cRenderCli = null; cRenderSum = null;
      },
    });
    bindCreateDelegates(createModal.panel);
  }

  /* 등록 모달 전용 위임 — 셸 패널에 1회. 슬롯 부분 갱신에도 생존한다. */
  function bindCreateDelegates(panel) {
    /* 검색은 목록 슬롯만 갈아 끼운다 — 마크업은 `cliListBody` 한 벌뿐이다
       (예전엔 여기에 같은 마크업이 통째로 복제돼 있어 한쪽만 고쳐질 수 있었다). */
    on(panel, "input", "[data-ccliq]", (e, t) => {
      cQuery = t.value;
      if (cRenderList) cPut("clilist", cRenderList());
    });
    on(panel, "click", "[data-ccli]", (e, t) => cPickClient(t.dataset.ccli));
    /* 접힌 거래처 줄에서 목록을 다시 편다. 같은 거래처를 다시 골라도 no-op 이므로
       (cPickClient 의 동일값 가드) 실수로 열었다 닫아도 채워 둔 값이 날아가지 않는다. */
    on(panel, "click", "[data-action='ccli-reopen']", () => {
      cCliOpen = true;
      if (cRenderCli) cPut("cli", cRenderCli());
      const q = qs(panel, "[data-ccliq]");
      if (q) q.focus();
    });
    on(panel, "click", "[data-action='autofill']", () => {
      openAutofill({ toast, onApply: (r) => {
        cDraft.address = r.addr;
        cDraft.recipientName = r.toName;
        cDraft.recipientPhone = r.toPhone;
        if (r.kind === "wed" && r.dayOffset != null) {
          const d = new Date(); d.setDate(d.getDate() + r.dayOffset);
          cDraft.deliverAt = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${r.hour}:${r.min}`;
        }
        createModal.rerenderStep("s2"); createModal.rerenderRail();
        createModal.syncFooter(); createModal.markTouched();
      } });
    });
    /* 주문 담당자 칩 — 값이 그대로면 no-op(이력·토스트가 중복으로 쌓이지 않게).
       카드를 다시 그리지 않고 클래스·aria 만 바꾼다(요청자 입력 칸의 커서 보호). */
    on(panel, "click", "[data-cmgr]", (e, t) => {
      const v = t.dataset.cmgr;
      if ((cDraft.manager || "") === v) return;
      cDraft.manager = v;
      qsa(panel, "[data-cmgr]").forEach((b) => {
        const on2 = b.dataset.cmgr === v;
        b.classList.toggle("is-sel", on2);
        b.setAttribute("aria-checked", on2 ? "true" : "false");
      });
      createModal.syncFooter(); createModal.markTouched();
    });
    /* 주문 요청자 행 — 담당자 프로필에서 고르거나 '직접 입력'으로 내려간다.
       ⚠️ **재렌더하지 않는다.** 직접 입력 칸에 커서가 있는 채로 카드를 다시 그리면
          입력이 끊긴다 — openRowPicker 가 쓰는 것과 같은 수법(클래스·aria·disabled 토글)이다.
       ⚠️ 숨긴 칸은 `disabled` 로 막는다 — openModal 의 포커스 트랩이 hidden 요소도
          모으므로, 안 그러면 Tab 이 보이지 않는 칸으로 빠진다. */
    on(panel, "click", "[data-creq-pick]", (e, t) => {
      const v = t.dataset.creqPick;
      const was = cReqManualOn();
      if (v === MANUAL) {
        /* 저장공간에는 넣지 않는다 — 주문 한 건의 사실로만 남긴다(고아 행과 같은 원칙).
           직접 적어 둔 값이 있으면 되살린다(행을 잘못 눌렀다 돌아온 사람에게 다시 치게 하지 않는다). */
        if (!was) {
          cDraft.requesterId = "";
          cDraft.requesterName = cReqManualSnap.name;
          cDraft.requesterPhone = cReqManualSnap.phone;
        }
        cReqManual = true;
      } else {
        if (cDraft.requesterId === v) return;
        if (was) cReqManualSnap = { name: cDraft.requesterName || "", phone: cDraft.requesterPhone || "" };
        const c = cContacts().find((x) => x.id === v);
        cReqManual = false;
        cDraft.requesterId = v;
        cDraft.requesterName = c ? c.name : ""; cDraft.requesterPhone = c ? (c.phone || "") : "";
      }
      const man = cReqManualOn();
      qsa(panel, "[data-creq-pick]").forEach((b) => {
        const on2 = b.dataset.creqPick === (man ? MANUAL : v);
        b.classList.toggle("is-sel", on2);
        b.setAttribute("aria-checked", on2 ? "true" : "false");
      });
      const box = qs(panel, "[data-slot='creqman']");
      if (box) {
        box.hidden = !man;
        qsa(box, "input").forEach((el) => {
          el.disabled = !man;
          if (!was && man) el.value = el.dataset.creq === "requesterPhone" ? cDraft.requesterPhone : cDraft.requesterName;
        });
        if (man && !was) { const n = qs(box, "[data-creq='requesterName']"); if (n) n.focus(); }
      }
      syncReqSum();
      createModal.rerenderRail(); createModal.syncFooter(); createModal.markTouched();
    });
    /* 직접 입력 — write-through 만 한다. 푸터 카운터는 셸의 input 위임이
       queueMicrotask 로 다시 세므로 여기서 건드리지 않는다. */
    on(panel, "input", "[data-creq]", (e, t) => {
      const k = t.dataset.creq;
      cDraft[k] = k === "requesterPhone" ? onPhoneInput(t) : t.value;
      cDraft.requesterId = "";   /* 직접 적은 요청자는 담당자 프로필과 무관한 사실이다 */
      cReqManualSnap = { name: cDraft.requesterName || "", phone: cDraft.requesterPhone || "" };
      /* ⚠️ 입력의 **형제** 한 줄만 갈아 끼운다 — 조상을 다시 그리면 커서·IME 조합이 날아간다. */
      syncReqSum();
    });
    /* `fieldCell` 의 type:"pick" 버튼 — 발송 프로필 */
    on(panel, "click", "[data-pick='ribbonSender']", () => openProfilePicker());
    on(panel, "click", "[data-action='cpick-pf']", () => openProfilePicker());
    function openProfilePicker() {
      /* 시안 #7 은 '명의 한 줄'이다 — `${role} ${name}` 은 명의 문자열에 이미 들어 있어
         보조줄이 같은 말을 두 번 한다. 대신 연락처는 배지로 남긴다: 명의가 똑같은
         프로필이 실제로 여럿이라(임직원 일동) 그것 말고는 구분할 단서가 없다. */
      const rows = store.get().profiles.map((p2) => ({
        v: p2.id, name: profileText(p2), meta: p2.phone || "",
      }));
      openRowPicker({
        /* 시안 #7 — 제목은 '무엇을 고르는 화면인지'(리본 명의), 에어브로는 어디서 온
           목록인지, 푸터 힌트는 이 선택이 무엇과 이어지는지를 말한다. */
        eyebrow: "발송 프로필", title: "리본 보내는분 명의", width: 500, listH: 272,
        hint: "거래처 포털의 발송인 프로필과 같은 명단입니다",
        rows, current: cDraft.profileId, confirmLabel: "불러오기", toast,
        empty: "저장된 발송 프로필이 없습니다.",
        onPick: (v) => {
          cDraft.profileId = v;
          const pf = store.get().profiles.find((x) => x.id === v);
          cDraft.ribbonSender = profileText(pf);   /* 리본 문자열은 스냅샷이다 */
          createModal.rerenderStep("s2"); createModal.rerenderRail(); createModal.syncFooter();
        },
        pickedMsg: () => "발송 프로필을 불러왔습니다",
      });
    }
    on(panel, "click", "[data-cnt]", (e, t) => {
      const k = t.dataset.cnt;
      const on2 = t.getAttribute("aria-checked") !== "true";
      cDraft.notifyOff = on2 ? cDraft.notifyOff.filter((x) => x !== k) : [...cDraft.notifyOff, k];
      t.setAttribute("aria-checked", on2 ? "true" : "false");
      syncReqSum();   /* 1단계 DOM 은 살아 있다 — 요청자 줄이 이 토글과 갈리면 안 된다 */
      createModal.syncFooter();
    });
    on(panel, "input", "[data-f]", (e, t) => {
      const k = t.dataset.f;
      cDraft[k] = k === "recipientPhone" ? onPhoneInput(t) : t.value;
      if (t.tagName === "TEXTAREA") autosize(t);
      if (k === "amount") { const b = qs(panel, "[data-slot='basis']"); if (b) b.textContent = cBasis(); }
      if (k === "recipientName" || k === "recipientPhone") createModal.rerenderRail();
    });
  }

  /* step2 의 드롭다운·피커 */
  function bindCreateControls(pane) {
    cDestroy();
    const prod = qs(pane, "[data-dd-f='product']");
    if (prod) cDds.push(makeDropdown(prod, {
      options: () => PRODUCTS.map((p) => p.name),
      label: (v) => v || "상품을 선택하세요",
      get: () => cDraft.product,
      set: (v) => {
        if (cDraft.product === v) return; /* 동일값 재선택이 협의 금액을 덮지 않게 */
        cDraft.product = v;
        cDraft.amount = priceFor(cDraft.clientId, v);
        const amt = qs(pane, "[data-slot='amount']");
        if (amt) amt.value = won(cDraft.amount); /* DOM 직접 — 재렌더하면 커서가 날아간다 */
        const b = qs(pane, "[data-slot='basis']"); if (b) b.textContent = cBasis();
        createModal && createModal.rerenderRail();
        createModal && createModal.syncFooter();
      },
    }));
    const dtp = qs(pane, "[data-dtp]");
    if (dtp) cDds.push(makeDateTimePicker(dtp, {
      get: () => cDraft.deliverAt,
      set: (v) => { cDraft.deliverAt = v; createModal && createModal.syncFooter(); },
      min: DP_MIN, max: DP_MAX,
    }));
    qsa(pane, "textarea.ord-in").forEach(autosize);
    return cDds.slice();
  }

  function submitCreate() {
    const req = cRequester();
    const pf = cProfile();
    const rec = {
      ...cDraft,
      id: b2bNewId(), orderNo: b2bNextOrderNo(),
      amount: Number(String(cDraft.amount).replace(/[^0-9]/g, "")) || 0,
      /* 요청자 스냅샷은 고를 때 이미 draft 에 적혔다 — 여기서 목록으로 다시 파생하면
         직접 입력한 요청자가 저장 직전에 증발한다. 목록에 있는 사람만 최신값으로 갱신. */
      requesterName: req ? req.name : cDraft.requesterName,
      requesterPhone: req ? (req.phone || "") : cDraft.requesterPhone,
      ribbonSender: cDraft.ribbonSender || profileText(pf),
      /* 저장 시점 스냅샷 — id 로 지목하고 이름·번호를 함께 남긴다. 담당자가 나중에
         지워져도 이 주문이 "누구에게 보냈는지"를 잃지 않는다. */
      notifyList: notifySnapshot(),
    };
    delete rec.notifyOff;
    delete rec.history;
    b2bUpsert(rec);
    const stored = findOrder(rec.id);
    if (stored) pushHistory(stored, "created", `주문 접수 · ${(cClient() || {}).companyName || ""}`.trim());
    createModal && createModal.close();
    ensureVisible(rec);
  }

  function notifySnapshot() {
    const out = [];
    if (String(cDraft.recipientName || "").trim() && String(cDraft.recipientPhone || "").trim()
        && !cDraft.notifyOff.includes("recipient")) {
      out.push({ kind: "recipient", name: cDraft.recipientName, phone: cDraft.recipientPhone, on: true });
    }
    const pf = cProfile();
    if (pf && !cDraft.notifyOff.includes("sender")) {
      out.push({ kind: "sender", profileId: pf.id, name: profileText(pf), phone: pf.phone, on: true });
    }
    if (!cDraft.requesterId && String(cDraft.requesterName || "").trim()
        && String(cDraft.requesterPhone || "").trim() && !cDraft.notifyOff.includes("requester")) {
      out.push({ kind: "contact", name: cDraft.requesterName, phone: cDraft.requesterPhone, on: true });
    }
    receivingContacts(cContacts()).forEach((ct) => {
      if (!String(ct.phone || "").trim() || cDraft.notifyOff.includes(`ct:${ct.id}`)) return;
      out.push({ kind: "contact", contactId: ct.id, name: ct.name, phone: ct.phone, on: true });
    });
    return out;
  }

  /* 목록이 현재 탭·기간을 그대로 적용하므로 방금 등록한 주문이 안 보일 수 있다. */
  function ensureVisible(rec) {
    refreshList();
    if (filtered().some((o) => o.id === rec.id)) { toast(`${rec.orderNo} 주문을 등록했습니다`, "ok"); return; }
    state.tab = "all"; state.dateQuick = "전체"; state.dateStart = ""; state.dateEnd = "";
    render();
    toast(`${rec.orderNo} 등록 · 보이도록 목록 필터를 초기화했습니다`, "ok");
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
        /* ⚠️ 같은 상품을 다시 눌러도 이 set 이 돈다(makeDropdown 에 동일값 가드가 없다).
           그때 금액을 다시 파생시키면 주문에 적힌 **협의 금액이 정가로 덮인다** —
           `amount` 는 DIRTY_KEYS 에 없어 '수정한 항목' 에도 안 잡히고 저장까지 따라간다. */
        if (editing.product === v) return;
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
    if (merged.status === "주문접수" && merged.image && String(merged.receiver || "").trim()) {
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
    editing = { ...merged, history: stored ? stored.history : [] };
    baseline = { ...editing };
    const d = new Date();
    savedAt = `${d.getHours() < 12 ? "오전" : "오후"} ${d.getHours() % 12 || 12}:${pad2(d.getMinutes())}`;
    renderHd(); renderSum(); renderHist(); syncDirty();
    toast(autoDone ? "배송완료 처리됨 · 거래처 알림톡이 자동 발송됩니다" : "주문 정보를 저장했습니다");
  }

  function openManagerModal() {
    if (!editing) return;
    openStaffPicker({
      current: editing.manager,
      names: staffOptions,
      eyebrow: editing.orderNo, // 시안: 어느 주문의 담당자인지 헤더가 먼저 말한다
      toast,
      onPick: (v) => {
        if (!editing) return false;
        editing.manager = v;
        b2bSetManager(editing.id, v);
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
    if (!editing) return;
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

  function openEditor(order) {
    closeModal();
    const { history: _h, ...draft } = order;
    editing = { ...draft, history: order.history || [] };
    baseline = { ...editing };
    savedAt = "";
    menuOpen = false;
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
      editing[k] = k === "recipientPhone" ? onPhoneInput(t) : t.value;
      if (t.tagName === "TEXTAREA") autosize(t);
      if (k === "receiver" || k === "image") renderHd();
      syncDirty();
    });
    /* 담당자 미지정(포털 자동 유입) 주문은 열자마자 지정을 받는다 */
    if (!editing.manager) openManagerModal();
  }

  function draftOrder() {
    const now = new Date();
    return {
      /* ⚠️ id·주문번호를 여기서 만들지 않는다 — 열기만 하고 닫아도 번호가 소모된다.
         거래처도 못박지 않는다: 예전엔 `clients()[0]` 이 박혀 있어 "거래처는 필수"
         가드가 절대 실패하지 않는 죽은 검사였다. 담당자도 미지정으로 시작한다. */
      id: "", orderNo: "", clientId: "",
      date: `${now.getFullYear()}/${pad2(now.getMonth() + 1)}/${pad2(now.getDate())} ${pad2(now.getHours())}:${pad2(now.getMinutes())}`,
      ordererName: "", address: "", deliverAt: "",
      recipientName: "", recipientPhone: "", ribbonPhrase: "", ribbonSender: "",
      image: "", notified: false, product: "", amount: 0,
      status: "접수대기", receiver: "", manager: "",
      request: "", memo: "", cancelFee: 0, cancelReason: "", history: [],
      /* 시안 신규 — id 로 지목하고 스냅샷으로 표시한다(담당자가 지워져도 주문은
         "누구에게 보냈는지"를 잃지 않는다). */
      requesterId: "", requesterName: "", requesterPhone: "",
      profileId: "", notifyOff: [],
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
    if (a === "new") { openCreate(); return; }
    if (a === "edit") { const o = findOrder(t.dataset.id); if (o) openEditor(o, false); }
  });
  /* 검색은 필터 카드를 재렌더하지 않는다 — 입력 포커스가 날아간다 */
  /* 행 아무 데나 눌러도 열린다 — 연필은 같은 일을 하는 명시적 버튼으로 남는다 */
  const offRow = onRowOpen(root, (id) => { const o = findOrder(id); if (o) openEditor(o, false); });
  const offSearch = on(root, "input", "[data-search]", (e, t) => {
    state[t.dataset.search] = t.value;
    refreshTableOnly();
  });

  return () => {
    offList(); offRow();
    offSearch();
    dateRange.destroy();
    closeModal();
    toast.destroy();
  };
}
