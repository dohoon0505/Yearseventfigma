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
   - 주문정보 카드가 시안 S-06(2026-10-16) 배치다 — 거래처 | 귀속월 · 주문 요청자 | 연락처 · 주문상품 | 알림 수신 ·
     주문금액(한 줄 — 칸 + '원' + 잠긴 이유). 귀속월은 배송일시의 달에서 나오고(2026-10-15) 배송일시를 고치면 함께 바뀐다
   - **정산 잠금**(명세 3.4 '마감 전 수정' · 6.4 `409 SETTLEMENT_PERIOD_LOCKED`) — 저장된 배송일시의 달 정산이 고칠 수 없는
     상태(`settlementOf(...).editable === false`)면 주문금액·주문상품을 잠그고 이유(짧은 말 `lockShort` + 정본 `lockReason` 은
     title·보조기술용 글)를 금액 칸 옆에 둔다. 명세서가 나갔는데 아직 고칠 수 있는 달이면 칸이 호박색이 되고 수정 마감 시각을
     말한다(2차 시안 S-06 ①). 저장·삭제·주문취소·배송일 이동·등록의 판정은 **`settlementImpactOf` 하나**다(util/settlement —
     옛 lockHit·removeHit·cancelHit 를 대신한다). 명세서가 나간 달의 금액이 실제로 바뀌는 저장·등록은 '저장 전 금액 변경 확인'
     창(util/order-settle-dialog.js · 사유(선택) → b2b 쓰기 ctx.note → 정산 금액 변경 기록)을 지난다(⑦)
   - clientNote(거래 조건)는 최상단 배너가 아니라 **요약 레일 맨 아래 카드**다.
     메모가 아니라 거래 조건이고((주)홈박스: "무조건 특대상품 발송") 빠지면 주문마다 사고가 난다
   - 주문취소는 settle 에 달 이름을 넘긴다 — 수수료가 취소한 달 정산에 가산된다는 안내(귀속월은 배송한 달)
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
import { bindRadioGroup, linkReason } from "../util/dialog.js";
import { applyOrderText } from "../data/order-text.js";
import { histEntry } from "../data/order-history.js";
import { sharedBizKeys, displayName } from "../util/biz.js";
import { store, ALL_PRODUCTS, productKey, priceNum, receivingContacts, MSG_RECEIVE } from "../store.js";
import { invoiceDayOf, periodOf, periodLabel, fmtKoShortTime, fmtAt } from "../data/settlement-rules.js";
import { readWonInput, settleWonInput, DELIVER_AT_OK, dtpMarkup } from "../util/order-fields.js";
import { settlementOf, settlementImpactOf, intakeBlockOf } from "../util/settlement.js";
import { openSettleConfirm, sdlgMonths, sdlgNote, sdlgErr } from "../util/order-settle-dialog.js";
import { setFocusClient, setFocusSection, takeFocusClient, takeFocusSection } from "../session.js";
import { staffOptions } from "../data/staff-mock.js";
import {
  won, pad2, dash, fmtFull, parseFlexDate, statusBadge, tabDefs,
  tabBtn, filterCard, detailBlock, syncFilterCard, makeDateRange,
  dateCell, photoFlag, notiFlag, amtCell, editBtn, onRowOpen,
  makeImageBox, openStaffPicker, openDeleteConfirm, editIndexOf, focusAfterDelete, focusAfterClose, focusAfterSave, focusAfterStep,
  ordHeader, bindOrdMenu, card, renderFields, autosize, railV2, summaryBodyV2, historyBody, histScrollEnd, footerV2,
} from "../util/order-screen.js";
/* ⚠️ 주문 레코드는 **저장 함수로만** 고친다(b2bUpsert·b2bPushHistory·b2bCancel·…) — b2b-mock 이 변경분을
   store 에 영속한다. `findOrder()` 로 받은 레코드에 pushHistory·필드 대입을 직접 하면 새로고침에 사라진다. */
import {
  B2B_STATUSES, b2bList, b2bUpsert, b2bRemove, b2bCancel,
  b2bSetManager, b2bNewId, b2bNextOrderNo,
} from "../data/b2b-mock.js";
/* 취소 수수료 규칙(B2B·B2C 공통 · import 0 — 쓰기 함수가 같은 함수로 한 번 더 막는다). */
import { cancelFeeError, orderFeeError } from "../data/order-rules.js";

const TABS = tabDefs(B2B_STATUSES);
/* B2C 는 접수일/배송일, B2B 는 주문일/배송일 — 필드 이름이 date 라 라벨이 다르다 */
const DATE_BASIS = [{ v: "ordered", label: "주문일" }, { v: "deliver", label: "배송일" }];
const PRODUCTS = ALL_PRODUCTS.map((p) => ({ name: p.product, key: productKey(p), base: priceNum(p.price) }));
/* 적용 단가는 `store.appliedPrice` 단일 소스에 맡긴다 — 여기에 규칙을 복제하면
   포털과 관리자 화면이 갈린다(실제로 갈렸던 전력이 있다). */
const priceFor = (clientId, name) => store.appliedPrice(clientId, name);
/* 정산 귀속월 — **배송일시 문자열**에서 파생("2026-09-15T14:00" → "2026년 09월").
   2026-10-15 결정으로 귀속월은 배송한 달이다(명세 4.3 · 5.3 — 주문일시가 아니다). 지난달에 받아 이번 달에
   배송하는 예약 주문은 배송하는 달 명세서에 든다. 호출부는 `editing.deliverAt` 을 넘긴다.
   ⚠️ `settlement-rules.periodLabel` 은 기간("2026-09")을 받는 다른 함수다 — 이름을 갈라 둔다.
      같은 이름으로 두면 나중에 규칙 모듈을 import 하는 순간 조용히 섀도잉된다. */
function orderPeriodLabel(dateStr) {
  const d = parseFlexDate(dateStr);
  return d ? `${d.getFullYear()}년 ${pad2(d.getMonth() + 1)}월` : "-";
}
/** 날짜 문자열(세 포맷 어느 것이든) → 귀속월 "YYYY-MM" 또는 ""(없거나 깨짐). 정산 판정의 열쇠다. */
const ymOf = (dateStr) => { const d = parseFlexDate(dateStr); return d ? periodOf(d) : ""; };
/** 숫자 → "60,000"(단위 없이) — 상세 모달의 주문금액 칸은 시안대로 칸 옆에 '원' 이 따로 있다. */
const wonNum = (n) => Number(n || 0).toLocaleString("ko-KR");
const digitsOf = (p) => String(p || "").replace(/\D/g, "");

export function mount(root, { nav }) {
  const state = {
    tab: "all",
    photo: [], noti: [],   // 켜진 토글만 담김 — 빈 배열 = 전체
    detailOpen: true,
    dateBasis: "ordered", dateQuick: "전체", dateStart: "", dateEnd: "",
    qAddress: "", qClient: "", qRecipient: "", qOrderer: "", qOrderNo: "",
    /* 거래처 **정확히** 하나로 거르기 — 다른 화면이 '이 거래처 · 이 달 주문' 을 넘겨줄 때만 켠다(아래 takeFocus).
       qClient 는 글자 포함 검색이라 한빛과학(주)로 찾으면 같은 사업자번호의 '한빛과학(주) 연구소 계정' 까지 걸린다.
       검색칸에는 그 거래처 이름을 그대로 보여 주고, 사람이 검색칸을 고치면 이 값은 풀린다(보이는 글자와 숨은 조건이 갈리지 않게). */
    clientId: "",
  };
  const DP_MIN = new Date(2000, 0, 1);
  const DP_MAX = new Date(new Date().getFullYear() + 2, 11, 31);
  let activeModal = null;
  let editing = null;      // 편집 작업본 — 모든 입력이 write-through
  let editIdx = -1;        // 상세 창의 주문 줄이 마지막으로 목록에 있던 순번(창을 닫은 뒤 초점 — order-screen focusAfterClose)
  let alive = true;        // 화면을 떠나며 창을 닫을 때는 목록으로 초점을 옮기지 않는다(cleanup)
  const dds = [];
  const toast = makeToast();

  const clients = () => store.get().clients;
  const clientOf = (o) => clients().find((c) => c.id === o?.clientId) || null;
  const clientName = (o) => {
    const c = clientOf(o);
    return c ? displayName(c, sharedBizKeys(clients())) : "(삭제된 거래처)";
  };
  const findOrder = (id) => b2bList().find((o) => o.id === id);
  /* 주문 저장 함수는 브라우저 저장 공간이 차면 실패를 돌려준다(b2b-mock) — 그때 화면이 하는 말. */
  const SAVE_FAIL = "저장하지 못했습니다 · 브라우저 저장 공간이 부족합니다";
  /* 쓰기 함수는 취소 수수료 규칙(수수료 ≤ 금액 — 명세 5.3 · 6.4 `400 CANCEL_FEE_INVALID`)을 어겨도 같은 거짓 값을 돌려준다.
     저장 공간 문제와 다른 말을 하려면 쓰기 전에(또는 실패한 뒤) 같은 판정을 다시 본다. */
  const writeFail = (next, prev) => { const e = orderFeeError(next, prev); return e ? `저장하지 못했습니다 · ${e.message}` : SAVE_FAIL; };
  const closeModal = () => { const m = activeModal; activeModal = null; if (m) m.close(); };

  /* ══ 필터 ═══════════════════════════════════════════════ */
  function filtered() {
    const has = (v) => v && v.trim();
    const s = state.dateStart ? new Date(state.dateStart + "T00:00:00") : null;
    const e = state.dateEnd ? new Date(state.dateEnd + "T23:59:59") : null;
    const match = (field, q) => !has(q) || String(field || "").includes(q.trim());
    return b2bList().filter((o) => {
      if (state.clientId && o.clientId !== state.clientId) return false;
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
  const tabCount = (v) => {
    const all = b2bList();
    return v === "all" ? all.length : all.filter((o) => o.status === v).length;
  };
  function tabsBody() {
    return TABS.map((t) => tabBtn({ v: t.v, label: t.label, active: state.tab === t.v, count: tabCount(t.v) }));
  }
  const summaryBody = () => html`<span>조회 <strong>${filtered().length}</strong>건</span>${rowToneLegend()}`;
  const srch = (key, label, ph) => ({ key, label, ph, value: state[key] });

  const searches = () => [
    srch("qClient", "거래처", "회사명·부서"),
    srch("qRecipient", "받는분", "받는분 성함"),
    srch("qOrderer", "발송인", "발송인 성함·부서"),
    /* 자리표시는 지금 번호 체계로 — 시드는 배송 달별 `B2B-YYMMNNN`, 새 주문은 `B2B-YYMM9NNN`(b2b-mock).
       글자 포함 검색이라 앞부분('B2B-2609')만 넣어도 그 달 주문이 걸린다. */
    srch("qOrderNo", "주문번호", "예) B2B-2609001"),
  ];
  function filterBody() {
    return filterCard({
      tabs: tabsBody(),
      basis: DATE_BASIS, basisActive: state.dateBasis,
      quickActive: state.dateQuick,
      addr: srch("qAddress", "배송지", "배송지 주소로 검색"),
      detailOpen: state.detailOpen, photo: state.photo, noti: state.noti,
      searches: searches(),
    });
  }
  /* 필터 카드는 처음 한 번만 그리고 그 뒤로는 제자리에서 고친다(order-screen syncFilterCard — 누른 버튼에 초점이 남는다). */
  const syncFilters = () => syncFilterCard(qs(root, "[data-slot='filters']"), {
    tab: state.tab, tabCount,
    basisActive: state.dateBasis, quickActive: state.dateQuick,
    detailOpen: state.detailOpen, photo: state.photo, noti: state.noti,
    detail: () => detailBlock({ photo: state.photo, noti: state.noti, searches: searches() }),
  });

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
    /* 상세 창이 열린 채 다시 그리면(저장·스테퍼·취소·담당자 지정) 그 주문 줄의 지금 순번을 먼저 잰다 — 이번에 필터에서 빠지면
       창을 닫을 때 이 자리 줄로 초점을 옮긴다(focusAfterClose). */
    if (activeModal && editing) { const i = editIndexOf(root, editing.id); if (i >= 0) editIdx = i; }
    syncFilters(); // 탭 건수 — 탭은 다시 그리지 않는다
    const sum = qs(root, "[data-slot='summary']");
    const tbl = qs(root, "[data-slot='table']");
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
      syncFilters(); // 기간 빠른 선택 해제(is-sel · aria-pressed)
      refreshTableOnly();
    },
    min: DP_MIN, max: DP_MAX,
  });
  /* 필터 조작 시 — 필터 카드는 제자리에서 고치고(syncFilters) 요약 + 표만 다시 그린다. 예전엔 필터 카드를 통째로 다시 그려
     Enter·Space 로 누른 탭·세그먼트·칩·'상세 필터' 가 DOM 에서 떨어져 초점이 body 로 빠졌다(2026-10-19 실측). 기간 피커도 그대로
     두고 트리거 글자만 맞춘다(dateRange.sync). 검색 입력은 예전부터 이 경로를 지나지 않는다(포커스 보존). */
  const refreshFilters = () => {
    syncFilters();
    dateRange.sync();
    refreshTableOnly();
  };

  /* ══ 모달 v2 — 통합주문관리와 같은 셸. 필드 서술자만 B2B 것이다 ══ */
  const imgBox = makeImageBox({ get: () => editing, toast });
  let baseline = null;
  let savedAt = "";
  let menuOpen = false;

  /* 주문정보 — **등록 모달(2단계 '상품 · 단가')이 쓰는 서술자**다. 상세 모달은 시안 S-06 배치라 아래
     `orderInfoBody()` 가 따로 그린다(서술자를 바꾸면 등록 모달이 같이 바뀐다 — 등록은 다른 모달이다).
     4번째 칸이 주문금액. 상품을 고르면 거래처 계약 단가로 채워지고, **관리자가 고칠 수 있다**
     (2026-09-25 결정 — 가입 혜택 '1회 무료'를 0원 주문으로 처리한다. 예전엔 계약단가 보호로 잠가 뒀다).
     입력은 order-fields.js `readWonInput` — 숫자 외 문자를 지우지 않고 거부한다. 등록 모달의 '단가 기준' 줄이
     계약단가와 다르면 그렇다고 말한다.
     2번째 칸은 거래처 대표 연락처 — B2B 에는 ordererPhone 이 없다. */
  const ORDER_FIELDS = () => [
    { k: "ordererName", label: "발송인", type: "text", ph: "예) 총무팀 · 한지훈" },
    { label: "연락처", type: "static", k: "clientPhone", value: (o) => dash(clientOf(o)?.contact) },
    { k: "product", label: "주문상품", type: "select" },
    { k: "amount", label: "주문금액", type: "won" },
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
  const DIRTY_KEYS = ["ordererName", "product", "amount", ...DELIVER_FIELDS.map((d) => d.k), "receiver", "memo", "image"];

  const canComplete = () => !!editing?.image && !!String(editing?.receiver || "").trim();
  const dirtyCount = () =>
    baseline ? DIRTY_KEYS.filter((k) => String(editing[k] ?? "") !== String(baseline[k] ?? "")).length : 0;

  const metaLine = () => `${clientName(editing)} · 주문 ${fmtFull(editing.date)} · ${fmtFull(editing.deliverAt)} 배송 예정`;

  /* ── 정산 잠금 (시안 S-06 · 명세 3.4 '마감 전 수정' · 6.4 '정산 잠금') ─────────────────────
     칸 모양의 판정은 `settlementOf(거래처, 달).editable` 하나다 — 화면이 날짜로 짐작하지 않는다(명세 6.6). 그 달 = **저장된**
     배송일시의 달(명세 6.4 '주문 상세의 정산 요약' — `settlement` 은 저장된 배송일시의 달 정산). 고치는 중인 배송일시가
     아니다: 저장·삭제·취소의 판정은 `settlementImpactOf(저장본, 작업본)` 이 옛 달·새 달을 **둘 다** 본다(이동은 옛 달 먼저).
     ⚠️ 잠기는 칸은 주문금액·주문상품 둘이다. 금액에 영향이 없는 칸(리본 문구·요청사항·같은 달 안의 배송일시 등)은
        그대로 고친다(명세 6.4). 배송지는 이 화면이 금액을 다시 채우지 않으므로(N15 는 아직) 잠그지 않는다. */
  let amtLock = null;   // 잠겼으면 그 달의 settlementOf 결과, 열려 있으면 null
  let prodDd = null;    // 주문상품 드롭다운 — 잠글 때 이것만 걷어낸다(배송일시 피커는 그대로)
  /* 저장된 배송일시의 달 정산 — 요약 'M월 정산' 줄·금액 칸 안내·배송일시 안내가 모두 이 달을 말한다(2차 시안 S-06 — 라벨은
     저장된 달이고, 다른 달로 옮기는 중이면 두 달 금액을 함께 쓴다). 열 때와 저장·취소 뒤에 다시 읽는다. */
  let s0 = null;
  /* 저장 순간 잠긴 것이 드러나 금액·상품을 되돌렸을 때 **적은 값**의 메모(2026-10-16 사용자 답 2) — 저장 줄(푸터 힌트 자리)에
     남고 다음 저장·창 닫기 때 사라진다. 칸은 저장돼 있던 값으로 잠근다(그 값은 그 달에 저장될 수 없다). */
  let unsaved = "";
  let unsavedTip = "";
  /* 마지막 syncDirty 의 판정 — 요약 줄이 같은 값을 읽는다(입력마다 두 번 계산하지 않게). */
  let lastImp = null;
  const settleOf = (o, ym = ymOf(o?.deliverAt), now = new Date()) => {
    const c = clientOf(o);
    return c && ym ? settlementOf(c, ym, now) : null;
  };
  const lockOf = (o, now = new Date()) => { const s = settleOf(o, undefined, now); return s && !s.editable ? s : null; };
  const monthNo = (ym) => Number(String(ym || "").slice(5, 7));
  /** 정산이 '명세서' 인 달인가(발행 뒤 · 거래 없는 달 제외) — 낱말이 '9월 명세서' / '10월 정산' 으로 갈린다(시안). */
  const isSheet = (s) => !!s && s.issued && s.status !== "NONE";
  const monthWord = (m) => `${monthNo(m.ym)}월 ${isSheet(m.s) ? "명세서" : "정산"}`;
  const num = (n) => Number(n || 0).toLocaleString("ko-KR");
  /** 'M월 D일 HH:mm' — 확인 창의 배송일시 전후(시안 '9월 29일 15:00 → 10월 3일 14:00'). */
  const koDT = (s) => { const d = parseFlexDate(s); return d ? fmtKoShortTime(d) : dash(s); };
  /** 지금 작업본을 저장하면 들어갈 레코드(이력 제외 — 판정용). */
  const mergedNow = () => { const { history: _h, ...rec } = editing; return { ...rec, amount: Number(editing.amount) || 0 }; };
  /** 지금 작업본을 저장하면 정산에 주는 영향(서버 409 의 데모 대역 · 저장 전 확인 창의 근거) — 저장된 레코드가 없으면 null. */
  const impactNow = (now = new Date()) => {
    const st = editing && findOrder(editing.id);
    return st ? settlementImpactOf(st, mergedNow(), now) : null;
  };
  /** 누르기 전부터 막는 잠김 — 배송일시를 옮기는 저장(옛 달이 잠김)과 잠긴 달·발행이 지난 거래 없는 달로 들어가는 저장(시안 —
   *  저장 줄이 어느 달 때문인지 말하고 저장 버튼이 잠긴다). 같은 달 안에서 금액·상품만 바꾸다 잠긴 경우(창을 열어 둔 사이 수정 마감)는
   *  여기 넣지 않는다 — 저장을 누르면 그 두 칸만 되돌리고 메모를 남긴다(사용자 답 2 · 결정 F: 다른 칸 저장까지 막히면 안 된다). */
  const preBlockOf = (imp) => (imp && imp.lock && (imp.moved || !imp.lock.isOld) ? imp.lock : null);
  /** LOCK_REASON 의 꼬리('금액 조정은 동의 뒤 수정계산서로') — 상태별 꼬리를 그대로 쓴다(정본 낱말을 짓지 않는다). */
  const tailOf = (r) => { const t = String(r || ""); const i = t.indexOf(" — "); return i >= 0 ? t.slice(i + 3) : t; };
  /** 막힌 달 문장 — '9월은 수정 마감이 지난 달이라 이 주문을 다른 달로 옮길 수 없습니다 — 금액 조정은 동의 뒤 수정계산서로'.
   *  발행이 지난 거래 없는 달은 규칙 모듈의 이유 그대로(issuedEmptyReason — 사용자 답 3). `verb` 는 '다른 달로 옮길' 등. */
  function lockSentence(lock, verb) {
    if (lock.s.status === "NONE" && !lock.isOld) return lock.reason;
    const kind = lock.s.zero || lock.s.zeroEdited ? "0원으로 닫는 달"
      : lock.s.status === "AWAITING_AGREEMENT" ? "수정 마감이 지난 달" : "동의를 마친 달";
    return `${monthNo(lock.ym)}월은 ${kind}이라 이 주문을 ${verb} 수 없습니다 — ${tailOf(lock.s.lockReason)}`;
  }
  /** 저장 순간 막혔을 때의 제목 — 확인 창 안의 빨간 안내 · 토스트. */
  function lockTitle(lock) {
    if (lock.s.status === "NONE" && !lock.isOld) return `저장하지 못했습니다 — ${lock.reason}`;
    if (lock.s.status === "AWAITING_AGREEMENT") return `저장하지 못했습니다 — 그사이 수정 마감(${fmtKoShortTime(lock.s.editLockAt)})이 지났습니다`;
    if (lock.s.zero || lock.s.zeroEdited) return `저장하지 못했습니다 — 그사이 ${monthNo(lock.ym)}월이 0원으로 닫혔습니다`;
    return `저장하지 못했습니다 — 그사이 ${monthNo(lock.ym)}월 정산의 동의가 끝났습니다`;
  }
  /** 금액·상품 중 저장되지 않을 값('3단화환(고급형) 130,000원') — 바꾸지 않았으면 "". */
  function unsavedVals(stored) {
    if (!stored || !editing) return "";
    const prod = String(editing.product || "") !== String(stored.product || "") ? editing.product : "";
    const amt = Number(editing.amount || 0) !== Number(stored.amount || 0) ? won(editing.amount) : "";
    return [prod, amt].filter(Boolean).join(" ");
  }

  /* ── 알림 수신 — 배송완료 알림(T2)이 실제로 닿을 사람(명세 5.3 'T2 발송 규칙'의 화면 대역) ──────────
     명단(notifyList — 등록·포털 접수 때의 스냅샷)이 있으면 그것을, 없으면(시드 주문) 지금 규칙(받는분 + 수신 ON 담당자)을 쓴다.
     ⚠️ 수신을 꺼 둔 담당자·이 주문에서 끈 줄·번호 없는 줄은 **받는 사람으로 세지 않는다**(규칙 2) — 화면이 '받음' 이라고
        말하는데 실제로 안 가는 일을 만들지 않는다. 받는분 줄은 주문의 **지금** 받는분 이름·번호로 맞추고(규칙 1),
        삭제된 담당자의 줄은 보내지 않으며(규칙 1), 같은 번호는 한 번만 센다(규칙 3).
     순서는 담당자 → 추가 수신자 → 보내는분 → 받는분(관리자가 먼저 찾는 것은 거래처 쪽 사람이다). */
  function notifyPeople(o) {
    const cts = o && o.clientId ? store.contactsOf(o.clientId) : [];
    const out = [];
    const seen = new Set();
    const add = (name, phone, role) => {
      const d = digitsOf(phone);
      if (!d || seen.has(d)) return;
      seen.add(d);
      out.push({ name: String(name || "").trim() || role, role });
    };
    if (Array.isArray(o.notifyList)) {
      const rows = o.notifyList.filter((r) => r && r.on !== false);
      rows.filter((r) => r.kind === "contact").forEach((r) => {
        if (r.contactId && !cts.some((x) => x.id === r.contactId)) return;
        add(r.name, r.phone, "담당자");
      });
      rows.filter((r) => r.kind === "extra").forEach((r) => add(r.name, r.phone, "추가 수신자"));
      rows.filter((r) => r.kind === "sender").forEach((r) => add(r.name, r.phone, "보내는분"));
      if (rows.some((r) => r.kind === "recipient")) add(o.recipientName, o.recipientPhone, "받는분");
    } else {
      receivingContacts(cts).forEach((ct) => add(ct.name, ct.phone, "담당자"));
      add(o.recipientName, o.recipientPhone, "받는분");
    }
    return out;
  }
  /** "오임찬 외 2명" — 칸이 좁아(1280 에서 약 170px) 첫 사람과 인원만. 전부는 title 로. */
  const peopleShort = (list) => (!list.length ? "" : list.length === 1 ? list[0].name : `${list[0].name} 외 ${list.length - 1}명`);
  const peopleFull = (list) => list.map((p) => `${p.name}(${p.role})`).join(" · ");
  /** 접수 확인(T1)을 받는 주문 요청자 — 요청자 기록(등록·포털 접수) → 같은 이름의 담당자 순, 없으면 null(스테퍼 이력 전용).
   *  시드 주문에는 요청자 기록이 없다(주문 요청자 칸 = 발송인 이름). 화면의 '연락처' 칸은 아래 `reqPhoneCell` 이다. */
  function requesterOf(o) {
    if (o.requesterName && digitsOf(o.requesterPhone)) return { name: o.requesterName, phone: o.requesterPhone };
    const nm = String(o.requesterName || o.ordererName || "").trim();
    const ct = nm && o.clientId ? store.contactsOf(o.clientId).find((x) => x.name === nm && digitsOf(x.phone)) : null;
    return ct ? { name: ct.name, phone: ct.phone } : null;
  }
  /** '주문 요청자' 칸(= ordererName) 옆 연락처 — **그 칸에 적힌 사람**의 번호만 쓴다. 요청자 기록의 이름이 칸과 같으면 그 번호
   *  (포털 접수는 ordererName = 요청자), 아니면 같은 이름의 담당자, 둘 다 없으면 거래처 대표 연락처(title 이 어느 쪽인지 말한다).
   *  ⚠️ `requesterOf`(T1 받는 사람)를 그대로 쓰면 안 된다 — 관리자 등록 주문은 요청자(목록에서 고름)와 이 칸(발송인)이 다를 수
   *     있어, 이름 확인 없이 요청자 번호를 쓰면 **다른 사람의 번호가 이 이름 옆에 선다**(2026-10-16 검토 실측: 칸은 비었는데
   *     연락처는 담당자 할다운의 번호). 칸을 고치면 따라 바뀐다(syncReqPhone). */
  function reqPhoneCell(o) {
    const nm = String(o.ordererName || "").trim();
    let phone = "";
    if (nm && String(o.requesterName || "").trim() === nm && digitsOf(o.requesterPhone)) phone = o.requesterPhone;
    else if (nm && o.clientId) phone = (store.contactsOf(o.clientId).find((x) => x.name === nm && digitsOf(x.phone)) || {}).phone || "";
    return phone
      ? { text: phone, title: "주문 요청자 연락처" }
      : { text: dash(clientOf(o)?.contact), title: "거래처 대표 연락처" };
  }

  /* ── 상세 모달 본문 — 시안 S-06 ─────────────────────────────────────────────── */
  /* 발주정보 — 등록 모달과 같은 키(DELIVER_FIELDS)를 쓰되 시안대로 두 가지만 다르다:
     ① 배송지는 한 줄 칸(길면 말줄임 — 칸을 눌러 고친다) ② 요청사항은 **열 때 비어 있으면 줄째 감춘다**
     (거래처가 남기는 칸이라 관리자가 새로 적을 일이 드물다 — 1280x720 에서 스크롤 없이 한 주문을 끝내려는 시안의 선택). */
  /* ⚠️ 배송일시는 여기서 빼고 발주정보 첫 줄을 직접 그린다(`delivRow` — 같은 줄에 안내가 붙는다 · 시안 S-06).
     공유하는 renderFields/fieldCell(order-fields.js)은 건드리지 않는다(등록 모달이 같이 바뀐다). */
  const detailDeliverFields = (o) => DELIVER_FIELDS
    .filter((d) => d.k !== "deliverAt")
    .filter((d) => d.k !== "request" || String(o.request || "").trim())
    .map((d) => (d.k === "address" ? { ...d, type: "text" } : d));

  const AMT_ID = "ord-amt-in";
  const AMT_WHY = "ord-amt-why";
  const AMT_WHY_FULL = "ord-amt-why-full";
  const DELIV_ID = "ord-deliv-in";
  const DELIV_WHY = "ord-deliv-why";
  const periodText = () => { const ym = ymOf(editing.deliverAt); return ym ? `${periodLabel(ym)} 귀속` : "-"; };
  /** 명세서가 나갔는데 아직 고칠 수 있는 달(시안 '발급 후 · 동의 전 · 수정 마감 전') — 금액 칸이 호박색이 되고 수정 마감을 말한다.
   *  취소한 주문은 그 달에 금액을 보태지 않으므로(수수료만 취소한 달에) 말하지 않는다. */
  const amtOpenOf = () => (!amtLock && isSheet(s0) && s0.editable && editing && editing.status !== "취소" ? s0 : null);
  /* 주문금액 칸 — 열려 있으면 입력(거부형 readWonInput), 잠겼으면 시안의 잠김 모양(자물쇠 + 금액, 읽기 전용)과 같은 줄의 이유.
     잠긴 이유는 시안의 **짧은 말**(`lockShort` — settlement-rules LOCK_SHORT)을 줄에 두고, 정본(`lockReason` — 명세 6.4)은
     title(마우스)과 보조기술이 읽는 숨은 글(aria-describedby)로 살린다. 0원 달은 짧은 말이 없어 정본 전체를 줄에 둔다(말줄임). */
  function amtBox() {
    if (amtLock) {
      const short = amtLock.lockShort || amtLock.lockReason;
      return html`
        <span class="ord-amtf__lock" id="${AMT_ID}" role="textbox" aria-readonly="true" aria-label="주문금액"
          aria-describedby="${AMT_WHY_FULL}" tabindex="0">${icon("lock", { size: 14 })}<span>${wonNum(editing.amount)}</span></span>
        <span class="ord-amtf__unit">원</span>
        <span class="ord-amtf__why" id="${AMT_WHY}" title="${amtLock.lockReason}" aria-hidden="true">${short}</span>
        <span class="sr-only" id="${AMT_WHY_FULL}">${amtLock.lockReason}</span>`;
    }
    const op = amtOpenOf();
    if (op) {
      const m = monthNo(op.period);
      const at = fmtKoShortTime(op.editLockAt);
      return html`
        <input class="ord-in ord-amtf__in is-issued" id="${AMT_ID}" data-f="amount" value="${wonNum(editing.amount)}" inputmode="numeric"
          aria-describedby="${AMT_WHY}" />
        <span class="ord-amtf__unit">원</span>
        <span class="ord-amtf__why ord-amtf__why--open" id="${AMT_WHY}"
          title="${m}월 명세서가 이미 나간 주문입니다 — 고치면 거래처가 보는 명세서 금액이 바로 바뀝니다(${at}까지)">${m}월 명세서 나감 · 수정 마감 ${at}</span>`;
    }
    return html`
      <input class="ord-in ord-amtf__in" id="${AMT_ID}" data-f="amount" value="${wonNum(editing.amount)}" inputmode="numeric" />
      <span class="ord-amtf__unit">원</span>`;
  }
  /* 금액 칸의 모양(잠김 · 명세서 나감 · 보통)이 바뀌었을 때만 다시 그린다 — 저장·취소 뒤(배송일시를 옮겨 저장된 달이 바뀌었거나
     취소로 그 달에 금액을 보태지 않게 됐다). ⚠️ 입력 중에는 부르지 않는다(커서). */
  let amtSig = "";
  const amtSigOf = () => (amtLock ? `L${amtLock.period}` : amtOpenOf() ? `O${s0.period}${+s0.editLockAt}` : "P");
  function refreshAmtBox() {
    const sig = amtSigOf();
    if (sig === amtSig) return;
    amtSig = sig;
    const ab = panelOf() && qs(panelOf(), "[data-slot='amtbox']");
    if (ab) setHTML(ab, amtBox());
  }
  /* 발주정보 첫 줄 — 배송일시 피커(190px) + 같은 줄 안내(시안 S-06). 안내 글자·색은 syncDeliv 가 정한다(다시 그리지 않는다). */
  const delivRow = () => html`
    <div class="ord-row ord-row--full">
      <label class="ord-k" for="${DELIV_ID}">배송일시</label>
      <div class="ord-delivf" data-slot="delivf">
        ${dtpMarkup()}
        <span class="ord-delivf__why" id="${DELIV_WHY}" data-slot="delivwhy"></span>
      </div>
    </div>`;
  /** 배송일시 줄 안내 — 저장된 달이 명세서가 나간 달이면 '다른 달로 옮기면 두 달 정산이 함께 바뀜'(고칠 수 있음) /
   *  '같은 달 안에서만 · 다른 달로 못 옮김'(잠김). 다른 달로 옮기는 중이면 칸에 호박색, 막히면 빨간색(시안). */
  function syncDeliv(imp) {
    const p = panelOf(); if (!p || !editing) return;
    const box = qs(p, "[data-slot='delivf']");
    const why = qs(p, "[data-slot='delivwhy']");
    if (!box || !why) return;
    const st = findOrder(editing.id);
    const moved = !!st && editing.status !== "취소" && ymOf(st.deliverAt) !== ymOf(editing.deliverAt);
    const lock = preBlockOf(imp);
    let text = "", tip = "귀속월은 배송일시의 달입니다", tone = "";
    if (isSheet(s0) && editing.status !== "취소") {
      if (!s0.editable) {
        text = "같은 달 안에서만 · 다른 달로 못 옮김";
        tip = `${s0.lockReason} · 같은 달 안의 날짜·시각 변경은 금액 영향이 없어 저장됩니다`;
        tone = "is-lock";
      } else {
        text = "다른 달로 옮기면 두 달 정산이 함께 바뀜";
        tip = `배송일을 다른 달로 옮기면 이 주문 금액이 ${monthNo(s0.period)}월 명세서에서 빠지고 새 달 정산에 듭니다. 두 달 모두 고칠 수 있어야 저장됩니다`;
        tone = "is-open";
      }
    }
    /* 들어가는 달이 막혔으면(잠긴 달 · 발행이 지난 거래 없는 달) 그 달의 짧은 말을 쓴다 — 옛 달 안내가 거기서는 틀린 말이다. */
    if (lock && !lock.isOld) { text = `${monthNo(lock.ym)}월 · ${lock.short}`; tip = lock.reason; }
    box.classList.toggle("is-moved", moved && !lock);
    box.classList.toggle("is-blocked", !!lock);
    why.textContent = text;
    why.title = tip;
    why.className = `ord-delivf__why ${lock ? "is-block" : tone}`;
  }
  function prodCell() {
    if (amtLock) return html`<span class="ord-val ord-val--lock" title="${dash(editing.product)}">${dash(editing.product)}</span>`;
    return html`<div class="dd ord-fdd" data-dd-f="product">
      <button type="button" class="dd-trigger" aria-haspopup="listbox" aria-expanded="false"></button>
      <div class="dd-panel" role="listbox"></div>
    </div>`;
  }
  function notifyCell() {
    const list = notifyPeople(editing);
    return list.length
      ? { text: peopleShort(list), title: peopleFull(list), empty: false }
      : { text: "받을 사람 없음", title: "번호가 있고 켜진 수신자가 없어 배송완료 알림이 나가지 않습니다", empty: true };
  }
  function orderInfoBody() {
    const name = clientName(editing);
    const rp = reqPhoneCell(editing);
    const nt = notifyCell();
    return html`
      <div class="ord-row">
        <span class="ord-k">거래처</span><span class="ord-val" title="${name}">${name}</span>
        <span class="ord-k">귀속월</span><span class="ord-val ord-val--num" data-slot="period" title="귀속월은 배송일시의 달입니다">${periodText()}</span>
      </div>
      <div class="ord-row">
        <label class="ord-k" for="ord-orderer">주문 요청자</label>
        <input class="ord-in" id="ord-orderer" data-f="ordererName" value="${editing.ordererName ?? ""}" placeholder="예) 총무팀 · 한지훈" />
        <span class="ord-k">연락처</span><span class="ord-val ord-val--num" data-slot="reqphone" title="${rp.title}">${rp.text}</span>
      </div>
      <div class="ord-row">
        <span class="ord-k">주문상품</span><div class="ord-prodcell" data-slot="prodcell">${prodCell()}</div>
        <span class="ord-k">알림 수신</span><span class="ord-val ${nt.empty ? "is-empty" : ""}" data-slot="notify" title="${nt.title}">${nt.text}</span>
      </div>
      <div class="ord-row ord-row--full">
        <label class="ord-k" for="${AMT_ID}">주문금액</label>
        <div class="ord-amtf" data-slot="amtbox">${amtBox()}</div>
      </div>`;
  }

  /* 요약 — 상품 · 담당자 · 'M월 정산' 줄. 거래처·귀속월은 시안대로 주문정보 카드로 옮겼다.
     정산 줄은 2차 시안(S-06)대로 **언제나 보이고 저장된 배송일시의 달**을 말한다(s0) — 발행 전이면 회색 칩 '발급 전'.
     칩 옆에 그 달 지금 금액을 두고, 이 수정으로 바뀌면 그 자리에서 '955,000 → 1,025,000원', 다른 달로 옮기는 중이면
     '9월 895,000 · 10월 580,000' 이다. 막힌 저장이면 저장되지 않을 '뒤' 금액 대신 지금 금액만 보인다(오해 방지).
     낱말은 관리자 정산회계(S-01)와 같은 말이다. 동의대기·동의 보류에는 '· 고칠 수 있음' / '· 금액 고정' 을 붙인다. */
  const SETTLE_CHIP = {
    AGREED: ["동의완료 · 발급 전", "warn"],
    ISSUED: ["동의완료 · 발급완료", "ok"],
    OVERDUE: ["기한 초과", "danger"],
    PAID: ["입금완료", "ok"],
    NONE: ["거래 없음", "gray"],
  };
  /** 칩 [낱말, 색, title] — 저장된 달 s0 기준(고치는 동안 바뀌지 않는다). */
  function chipOf(s) {
    if (s.status === "SCHEDULED") return ["발급 전", "gray", `명세서 발행 전 · ${fmtKoShortTime(s.issueAt)} 발행`];
    if (s.status === "NONE") return SETTLE_CHIP.NONE.concat("");
    if (s.zero || s.zeroEdited) return ["0원 · 계산서 없음", "gray", ""];
    if (s.status === "AWAITING_AGREEMENT") {
      /* 잠정 보류 둘(Q19·Q20)만 '보류' 라고 말한다(S-01 과 같은 낱말 — 약관 동의 전은 그냥 동의대기다). */
      const held = s.autoAgreeHold === "NOTICE_UNDELIVERED" || s.autoAgreeHold === "CLIENT_SUSPENDED";
      return [`${held ? "동의 보류" : "동의대기"} · ${s.editable ? "고칠 수 있음" : "금액 고정"}`, "warn", s.editable ? "" : s.lockReason];
    }
    const [l, t] = SETTLE_CHIP[s.status] || [s.status, "gray"];
    return [l, t, ""];
  }
  /** 칩 옆 금액 { text, changed } — 판정(imp)이 막히지 않았고 그 달 금액이 바뀌면 전 → 후. */
  function liveOf(imp) {
    const ch = imp && !imp.lock ? imp.months.filter((m) => m.delta !== 0) : [];
    if (imp && imp.moved && ch.length >= 2) {
      return { text: ch.map((m) => `${monthNo(m.ym)}월 ${num(m.after)}`).join(" · "), changed: true };
    }
    const mine = ch.find((m) => s0 && m.ym === s0.period && m.clientId === editing.clientId);
    if (mine) return { text: `${num(mine.before)} → ${num(mine.after)}원`, changed: true };
    return { text: won(s0 ? s0.amount : 0), changed: false };
  }
  function settleRow() {
    const s = s0;
    if (!s) return null;
    const [chip, tone, chipTip] = chipOf(s);
    const lv = liveOf(lastImp);
    const m = monthNo(s.period);
    return {
      k: `${m}월 정산`, action: "go-settle", cls: `ord-sum__row--settle ${lv.changed ? "is-changed" : ""}`,
      aria: `거래처 정산회계에서 ${m}월 열기 · ${chip} · ${lv.text}`, arrowIn: true,
      v: html`<span class="ord-schip ord-schip--${tone}" title="${chipTip}">${chip}</span><span class="ord-sum__amtw"><b class="ord-sum__amt" data-slot="settleamt" aria-live="polite">${lv.text}</b> ›</span>`,
    };
  }
  /** 입력마다 정산 줄의 금액만 제자리에서 바꾼다 — 줄을 다시 그리면 aria-live 가 읽히지 않는다. */
  function syncSettleRow(imp) {
    const p = panelOf(); if (!p || !s0) return;
    const amt = qs(p, "[data-slot='settleamt']");
    if (!amt) return;
    const lv = liveOf(imp);
    if (amt.textContent !== lv.text) amt.textContent = lv.text;
    const row = amt.closest(".ord-sum__row--settle");
    if (row) {
      row.classList.toggle("is-changed", lv.changed);
      row.setAttribute("aria-label", `거래처 정산회계에서 ${monthNo(s0.period)}월 열기 · ${chipOf(s0)[0]} · ${lv.text}`);
    }
  }
  const summaryRows = () => [
    { k: "상품", v: dash(editing.product) },
    { k: "담당자", v: editing.manager || "미지정", empty: !editing.manager, action: "pick-manager" },
    settleRow(),
  ].filter(Boolean);

  function modalBody() {
    const c = clientOf(editing);
    return html`
      <div class="hm__head ord-hd" data-slot="hd">
        ${ordHeader({ order: editing, meta: metaLine(), statuses: B2B_STATUSES, canComplete: canComplete(), menuOpen, delLock: delLockNow() })}
      </div>
      <div class="ord-grid">
        ${railV2({ order: editing, imgInner: imgBox.inner() })}
        <div class="ord-main">
          <div class="ord-pane">
            <div class="ord-cols">
              <div class="ord-colL">
                ${card({ title: "주문정보", cap: "거래처 접수 내용", body: orderInfoBody() })}
                ${card({ title: "발주정보", cap: "화원 전달 내용", body: html`${delivRow()}${renderFields(detailDeliverFields(editing), editing)}` })}
              </div>
              <div class="ord-colR">
                <section class="ord-card" data-slot="sum">${summaryBodyV2({ order: editing, rows: summaryRows() })}</section>
                ${card({
                  title: "처리 이력", cap: `${(editing.history || []).length}건`, cls: "ord-histcard",
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
          <div class="hm__foot ord-ft" data-slot="ft">${footerV2({ dirty: dirtyCount(), savedAt })}</div>
        </div>
      </div>`;
  }

  /* ── 부분 갱신 — 본문(입력)은 절대 다시 그리지 않는다 ────── */
  const panelOf = () => activeModal && activeModal.panel;
  /** 지울 수 없는 이유(메뉴의 '주문서 삭제' 를 잠근다 · 시안 S-06) — 메뉴가 열릴 때만 판정한다. 저장된 레코드 기준이다(지우면
   *  저장 안 한 수정은 버려진다). 귀속월이 잠겼으면 정본 이유 그대로, 수수료가 붙은 취소 주문의 **취소한 달**이 잠겼으면
   *  어느 달인지를 앞에 붙인다(명세 6.4 — 둘 다 보고 앞선 달). 판정은 settlementImpactOf(saved, null). */
  function delLockNow() {
    if (!menuOpen || !editing) return null;
    const saved = findOrder(editing.id);
    if (!saved) return null;
    const l = settlementImpactOf(saved, null, new Date()).lock;
    if (!l) return null;
    return l.ym !== ymOf(saved.deliverAt) ? `${periodLabel(l.ym)} 정산이 잠겨 지울 수 없습니다 · ${l.reason}` : l.reason;
  }
  function renderHd() {
    const p = panelOf(); if (!p) return;
    setHTML(qs(p, "[data-slot='hd']"),
      ordHeader({ order: editing, meta: metaLine(), statuses: B2B_STATUSES, canComplete: canComplete(), menuOpen, delLock: delLockNow() }));
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
  /** 바뀌는 달들 한 줄 — '9월 명세서 955,000 → 1,025,000원 · 10월 정산 520,000 → 580,000원'. */
  const monthsLine = (imp) => imp.months.filter((m) => m.delta !== 0)
    .map((m) => `${monthWord(m)} ${num(m.before)} → ${num(m.after)}원`).join(" · ");
  /* 저장 줄(푸터 왼쪽 — '왜 못 누르는지' 장치) — '수정한 항목 N개'(CLAUDE.md 규약)는 남기고, 정산이 걸린 세 경우만 시안대로
     바꾼다(2차 시안 S-06 · 자동 결정): ① 막힘(빨강 · 저장 잠김 — 옮기는 달·들어가는 달이 잠김) ② '저장 전에 확인합니다 · …'
     (확인 창이 뜰 저장 — 버튼 '변경사항 저장…') ③ 저장 순간 잠겨 되돌린 값의 메모(빨강 · 사용자 답 2 — 버튼은 다른 칸이 있으면 열림).
     입력마다 돈다 — 판정은 settlementImpactOf 한 번이고 DOM 은 글자·클래스만 바꾼다(getComputedStyle 금지). */
  function syncDirty() {
    const p = panelOf(); if (!p) return;
    const n = dirtyCount();
    const imp = n ? impactNow() : null;
    lastImp = imp;
    const pre = preBlockOf(imp);
    /* 취소한 주문의 금액을 수수료보다 작게 고치면 막는다(명세 5.3 불변식 `cancel_fee ≤ amount` — 취소한 뒤에도). 칸은 그대로 두고 저장 줄이
       이유를 말한다. 정산 잠김(pre)보다 **먼저** 말한다 — 이것은 고친 값 자체가 틀린 것(서버 400)이고 칸을 고치면 바로 풀리지만, 잠김은
       상태 충돌(409)이다. 취소한 주문은 금액이 정산에 들지 않아(수수료만 취소한 달에) 둘이 함께 걸리는 일은 지금 규칙으로는 없다. */
    const feeLow = n ? orderFeeError(mergedNow(), findOrder(editing.id)) : null;
    let text, cls, tip = "", ask = false;
    if (feeLow) { text = feeLow.message; cls = "is-block"; }
    else if (pre) { text = lockSentence(pre, pre.isOld ? "다른 달로 옮길" : "그 달로 옮길"); cls = "is-block"; tip = pre.reason; }
    else if (unsaved) { text = n ? `수정한 항목 ${n}개 · ${unsaved}` : unsaved; cls = "is-block"; tip = unsavedTip; }
    else if (!n) { text = savedAt ? `저장됨 · ${savedAt}` : "변경 없음"; cls = savedAt ? "is-saved" : ""; }
    else if (imp && !imp.lock && imp.confirm.length) { text = `저장 전에 확인합니다 · ${monthsLine(imp)}`; cls = "is-dirty"; ask = true; }
    else { text = `수정한 항목 ${n}개`; cls = "is-dirty"; }
    const stat = qs(p, "[data-slot='dirty']");
    if (stat) {
      stat.textContent = text;
      stat.className = `ord-ft__stat ${cls}`;
      if (tip) stat.title = tip; else stat.removeAttribute("title");
    }
    const btn = qs(p, "[data-action='save']");
    if (btn) { btn.disabled = !n || !!pre || !!feeLow; btn.textContent = !n ? "저장" : ask ? "변경사항 저장…" : "변경사항 저장"; }
    linkAmtWhy(!!feeLow);
    syncDeliv(imp);
    syncSettleRow(imp);
  }
  /* 금액 < 수수료로 막혔으면 그 이유(저장 줄)를 **금액 칸에 잇는다**(util/dialog.js linkReason — aria-invalid + aria-describedby).
     저장 줄은 live 가 아니라(order-screen footerV2 — 입력마다 읽히면 시끄럽다) 칸에 있는 화면낭독기 사용자는 왜 저장이 잠겼는지
     듣지 못했다. 풀리면 걷는다 — 칸이 원래 갖던 설명('명세서 나감' 줄)은 남는다. focusout 이 칸을 받아들인 값으로 다시 쓰며
     aria-invalid 를 끄므로(putAmt) 거기서도 다시 잇는다. */
  function linkAmtWhy(low = !!(editing && dirtyCount() && orderFeeError(mergedNow(), findOrder(editing.id)))) {
    const p = panelOf(); if (!p) return;
    linkReason(qs(p, "input[data-f='amount']"), qs(p, "[data-slot='dirty']"), low);
  }
  /* 주문정보 카드의 파생 칸 두 개 — 입력의 형제라 textContent·title 만 바꾼다(커서 보호). */
  function syncPeriod() {
    const el = panelOf() && qs(panelOf(), "[data-slot='period']");
    if (el) el.textContent = periodText();
  }
  function syncReqPhone() {
    const el = panelOf() && qs(panelOf(), "[data-slot='reqphone']");
    if (!el) return;
    const rp = reqPhoneCell(editing);
    el.textContent = rp.text;
    el.title = rp.title;
  }
  function syncNotify() {
    const el = panelOf() && qs(panelOf(), "[data-slot='notify']");
    if (!el) return;
    const nt = notifyCell();
    el.textContent = nt.text;
    el.title = nt.title;
    el.classList.toggle("is-empty", nt.empty);
  }
  /** 금액·상품 칸을 잠근다(열 때 이미 잠긴 달 · 저장 순간 잠긴 것이 드러난 달). 다른 칸은 다시 그리지 않는다.
   *  잠긴 칸에는 **저장된** 금액·상품을 보인다 — 고쳐 둔 값은 그 달에 저장될 수 없어서, 들고 있으면 '수정한 항목' 이
   *  영영 남아 다른 칸까지 저장하지 못하게 된다(다른 칸의 입력은 그대로 둔다). */
  function applyLock(s, stored) {
    amtLock = s;
    if (s0 && s.period === s0.period) s0 = s; // 요약 칩('금액 고정')·배송일시 안내가 같은 판정을 말하게
    if (stored) { editing.amount = stored.amount; editing.product = stored.product; }
    const p = panelOf(); if (!p) return;
    if (prodDd) { prodDd.destroy(); const i = dds.indexOf(prodDd); if (i >= 0) dds.splice(i, 1); prodDd = null; }
    const pc = qs(p, "[data-slot='prodcell']"); if (pc) setHTML(pc, prodCell());
    amtSig = amtSigOf();
    const ab = qs(p, "[data-slot='amtbox']"); if (ab) setHTML(ab, amtBox());
    syncDirty(); renderSum();
  }
  /** 저장 순간 잠긴 것이 드러났을 때(서버 409 의 데모 대역) — 사용자 답 2: 옛 달이 잠겼으면 금액·상품을 저장돼 있던 값으로
   *  되돌려 잠그고, 적은 값은 저장 줄에 메모로 남긴다(다음 저장·창 닫기 때 사라짐). 다른 칸은 그대로 두어 다시 저장할 수 있다.
   *  옮겨 들어가는 달이 막혔으면 칸은 그대로고 저장 줄이 막힌 이유를 말한다(syncDirty). */
  function rejectLocked(lock, stored) {
    if (!editing) return;
    if (lock.isOld && stored) {
      const vals = unsavedVals(stored);
      if (vals) { unsaved = `저장되지 않은 값 ${vals} · ${lock.short}`; unsavedTip = lock.reason; }
      applyLock(lock.s, stored);
    } else syncDirty();
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
  /* 주문 요청자 행의 라디오 그룹 위임(util/dialog.js `bindRadioGroup`) — 거래처를 바꾸면 요청자 카드를 다시 그리므로
     그 뒤 `sync()` 로 roving tabindex 를 다시 세운다(새 마크업은 tabindex 가 없어 행마다 Tab 정거장이 된다). */
  let cReqRadios = null;
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
  /* 발송 프로필은 **고른 거래처의 것만** — 담당자(cContacts)와 같은 스코프. 전역 목록이던 시절
     한빛과학 주문에 다른 회사 명의를 고를 수 있었다(2026-09-17 결정). */
  const cProfiles = () => (cDraft.clientId ? store.profilesOf(cDraft.clientId) : []);
  const cProfile = () => cProfiles().find((p) => p.id === cDraft.profileId) || null;
  /* 고정문구는 2026-09-17 부터 **저장 시점 필수**라 새 프로필은 늘 값이 있다. 이 폴백은 그 이전에
     저장된 레코드(빈 고정문구)가 빈 이름으로 찍히는 것만 막는다 — 자동조립을 되살린 것이 아니다. */
  const profileText = (p) => (p ? (p.greeting && p.greeting.trim()) || `${p.role} ${p.name}` : "");
  /* 배송완료 알림 명단 — 등록 레일이 보여 주는 줄이자 **저장하는 줄**이다(notifySnapshot 이 이걸 그대로 쓴다).
     한 곳에서 만들어야 화면에 보인 명단과 저장된 명단이 갈리지 않는다(예전엔 둘이 따로 만들어 끈 줄이 저장에서 빠졌다).
     `locked` = 보낼 번호가 없어 켤 수 없는 줄. */
  const notifyRows = () => {
    const rows = [];
    if (String(cDraft.recipientName || "").trim()) {
      rows.push({ key: "recipient", name: cDraft.recipientName, sub: cDraft.recipientPhone || "연락처 미입력 · 발송 불가",
                  phone: cDraft.recipientPhone, locked: !String(cDraft.recipientPhone || "").trim(), kind: "받는분" });
    }
    const pf = cProfile();
    if (pf) rows.push({ key: "sender", name: profileText(pf), sub: pf.phone, phone: pf.phone,
                        profileId: pf.id, profileName: pf.name, locked: !String(pf.phone || "").trim(), kind: "보내는분" });
    /* 직접 입력한 요청자는 담당자 저장공간에 없어 아래 자동 편입에 걸리지 않는다.
       주문을 요청한 사람이야말로 배송완료를 가장 먼저 알아야 한다 — 따로 싣는다. */
    if (!cDraft.requesterId && String(cDraft.requesterName || "").trim()) {
      rows.push({ key: "requester", name: cDraft.requesterName,
                  sub: cDraft.requesterPhone || "연락처 미입력 · 발송 불가", phone: cDraft.requesterPhone,
                  locked: !String(cDraft.requesterPhone || "").trim(), kind: "주문 요청자" });
    }
    receivingContacts(cContacts()).forEach((ct) => {
      rows.push({ key: `ct:${ct.id}`, name: ct.name, sub: ct.phone || "연락처 미등록", phone: ct.phone, contactId: ct.id,
                  locked: !String(ct.phone || "").trim(), kind: "주문 요청자·담당자", auto: true });
    });
    return rows;
  };

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

  /* 거래처를 고르면 목록이 한 줄로 접히며(`cPut("cli")`) 누른 줄이 DOM 에서 떨어진다 — 초점이 body 로 빠져 다음 Tab 이
     창 맨 앞('자동작성')부터 다시 시작했다(실측 · Enter·Space·마우스 모두 · 같은 거래처를 다시 골라 접힐 때도).
     그 자리를 대신하는 **'다른 거래처 선택'** 으로 옮긴다:
     ① 접힌 줄의 유일한 조작이고 펴기와 짝이다 — 펴면 검색칸으로, 접으면 이 버튼으로(여닫는 단추가 초점을 쥐는 WAI 디스클로저 관례).
     ② 다음 할 일(요청자)은 바로 다음 Tab 이다 — 한 번 더 누르면 간다.
     ③ 요청자 카드로 끌고 가지 않는다 — 같은 거래처를 다시 골라 접힐 때는 요청자가 그대로라 엉뚱하고, 카드의 첫 칸도
        거래처마다 다르다(담당자 줄 / 담당자 0명이면 직접 입력 칸 — 고르자마자 입력 칸에 떨어지면 무엇을 골랐는지 듣지 못한다).
     버튼의 `aria-describedby` 가 고른 거래처 이름·번호를 읽어 준다. 셸의 '이전'(goStep) 도 1단계에 돌아올 때 (접혀 있으면) 이 버튼에 둔다.
     초점을 잃었을 때만 옮긴다(order-screen `focusAfterStep` 과 같은 규칙 — 사람이 이미 둔 초점은 건드리지 않는다).
     마우스로 고른 경우도 옮기지만 `:focus-visible` 이 아니라 링은 서지 않는다. */
  const focusCliPick = () => {
    const a = document.activeElement;
    if (a && a !== document.body && a.isConnected) return;
    const b = createModal && qs(createModal.panel, "[data-action='ccli-reopen']");
    if (b) b.focus();
  };

  function cPickClient(id) {
    if (cDraft.clientId === id) {
      /* 동일값 재선택은 채워둔 값을 날리지 않는다 — 다만 '다른 거래처 선택'으로 펼쳐
         둔 목록에서 **같은 거래처를 다시 골랐다면** 접어 줘야 한다. 안 그러면 목록이
         영영 펼쳐진 채 남아 아래 두 카드가 폴드 밖으로 밀린다. */
      if (cCliOpen) { cCliOpen = false; if (cRenderCli) cPut("cli", cRenderCli()); focusCliPick(); }
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
    if (cReqRadios) cReqRadios.sync();            /* 새 행들 — 그룹을 다시 Tab 한 정거장으로 */
    createModal.rerenderStep("s2");
    createModal.rerenderRail(); createModal.syncFooter(); createModal.markTouched();
    focusCliPick(); // 위 슬롯 갈이로 누른 줄이 사라졌다 — 그 자리의 '다른 거래처 선택' 으로
  }

  /* 계약단가 판정 — 규칙은 store.contractPrice 단일 소스를 쓴다(복제 금지). */
  function cBasis() {
    if (!cDraft.product) return "상품 선택 후 자동 적용";
    const base = priceNum((ALL_PRODUCTS.find((p) => p.product === cDraft.product) || {}).price);
    const c = store.contractPrice(cDraft.clientId, cDraft.product);
    const cur = Number(cDraft.amount) || 0;
    /* 금액을 고칠 수 있으므로(2026-09-25) 계약단가가 없는 거래처에서도 '적용 단가와 다름'을 말해야 한다 —
       예전엔 이 경우 금액과 무관하게 "기준단가 적용"이라 0원(가입 혜택)을 적어도 그렇게 찍혔다. */
    const contract = c != null && c !== base;
    const ref = contract ? c : base;
    if (cur === ref) return contract ? "계약단가 적용" : "계약단가 미등록 · 기준단가 적용";
    return `${contract ? "계약단가" : "기준단가"}(${won(ref)})와 다름 — 직접 입력한 금액`;
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
      /* 고른 뒤 초점은 '다른 거래처 선택' 에 온다(focusCliPick) — 그 버튼이 고른 거래처를 읽어 주게 이름·번호 줄을 설명으로 잇는다
         (등록 창은 한 번에 하나라 id 가 겹치지 않는다 · openCreate 의 가드). */
      return html`
        <div class="ordnew-clipick">
          <span class="ordnew-clipick__nm" id="ccli-picked-nm">${displayName(c, sharedBizKeys(clients()))}</span>
          <span class="ordnew-clipick__sub" id="ccli-picked-sub">${[c.bizNumber, c.department, `${c.channel || "일반"} 채널`].filter(Boolean).join(" · ")}</span>
          ${c.clientNote ? html`<span class="ordnew-cli__badge">거래 조건</span>` : ""}
          <button type="button" class="ordnew-clipick__btn" data-action="ccli-reopen"
            aria-describedby="ccli-picked-nm ccli-picked-sub">다른 거래처 선택</button>
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
    /* ⚠️ 레일에서 계약단가·계산서 발행·이번 발주 **카드는 뺐다**(사용자 지시, 2026-09-16).
       세 값 모두 이미 다른 곳에서 말한다 — 계약단가는 '상품 · 단가' 카드 머리글과
       '단가 기준' 줄(cBasis)이, 이번 발주 금액은 step2 hint() 푸터가, 명세서 발행일은
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
          `명세서 매월 ${invoiceDayOf(c)}일`].filter(Boolean).join(" · ")}</p>
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
    /* 배송일시는 필수다 — 날짜와 시각 모두(명세 4.3 · M32). 정산 귀속월이 이 값의 달이라, 비면 그 주문은 어느 달
       명세서에도 들어가지 않고 포털 실시간 주문내역에서는 날짜 없이 모든 기간 필터를 통과했다(2026-10-16 검증). */
    const missing2 = () => {
      const need = [["product", "주문상품"], ["address", "배송지"], ["recipientName", "받는분"],
                    ["ribbonPhrase", "리본문구"], ["profileId", "발송 프로필"]];
      const out = need.filter(([k]) => !String(cDraft[k] ?? "").trim()).map(([, l]) => l);
      if (!DELIVER_AT_OK.test(String(cDraft.deliverAt || ""))) out.splice(1, 0, "배송일시");
      return out;
    };

    createModal = openOrderCreate({
      title: "B2B 거래처 주문 등록",
      subtitle: "거래처 계약단가로 접수하고, 월 마감 후 거래명세서 발급 → 동의 → 계산서로 청구합니다",
      autofill: true,
      toast,
      steps: [
        { key: "s1", title: "거래처", cap: "주문의 성격을 정합니다",
          render: step1Body, bind: () => [], required: missing1,
          hint: () => { const c = cClient(); return c ? `${c.companyName} · 매월 ${invoiceDayOf(c)}일 거래명세서 발급 → 동의 후 계산서` : ""; } },
        { key: "s2", title: "주문서 작성", cap: "화원에 전달되는 내용",
          render: step2Body, bind: bindCreateControls, required: missing2, block: createBlock,
          hint: () => { // 전 품목 면세 — 금액 뒤에 VAT 표기를 두지 않는다(2026-09-17 사용자 확인)
            const cur = Number(cDraft.amount) || 0;
            const on = notifyRows().filter((r) => !r.locked && !cDraft.notifyOff.includes(r.key)).length;
            return `${won(cur)} · 알림 ${on}명${cDraft.manager ? ` · 담당 ${cDraft.manager}` : ""}`;
          } },
      ],
      rail: railBody,
      submitLabel: "주문 등록",
      onSubmit: submitCreate,
      onClose: () => {
        cDestroy();
        createModal = null; cDraft = null;
        cRenderReq = null; cRenderList = null; cRenderCli = null; cRenderSum = null; cReqRadios = null;
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
      /* 링크·문자 어느 쪽이든 **매핑은 한 곳**(data/order-text.js)이다 —
         화면마다 적으면 같은 입력이 화면마다 다르게 채워진다.
         ⚠️ 읽은 것만 덮는다(빈 값으로 기존 입력을 지우지 않는다). */
      openAutofill({ toast, onApply: (r) => {
        applyOrderText(cDraft, r);
        createModal.rerenderStep("s2"); createModal.rerenderRail();
        createModal.syncFooter(); createModal.markTouched();
      } });
    });
    /* 주문 담당자 칩 — 값이 그대로면 no-op(이력·토스트가 중복으로 쌓이지 않게 — onPick 은 값이 바뀔 때만 온다).
       카드를 다시 그리지 않고 클래스·aria 만 바꾼다(요청자 입력 칸의 커서 보호). `role="radio"` 라 화살표로 옮긴다
       (공용 `bindRadioGroup` — 예전엔 선언만 있고 키가 없어 칩 6개가 Tab 6정거장이었다). 화살표로 골라도 ESC 이중 확인이
       켜지게 markTouched 를 여기서 부른다(셸은 클릭만 센다). */
    bindRadioGroup(panel, {
      item: "[data-cmgr]", selClass: "is-sel",
      onPick: (t) => { cDraft.manager = t.dataset.cmgr; createModal.syncFooter(); createModal.markTouched(); },
    });
    /* 주문 요청자 행 — 담당자 프로필에서 고르거나 '직접 입력'으로 내려간다.
       ⚠️ **재렌더하지 않는다.** 직접 입력 칸에 커서가 있는 채로 카드를 다시 그리면
          입력이 끊긴다 — openRowPicker 가 쓰는 것과 같은 수법(클래스·aria·disabled 토글)이다.
       숨긴 칸은 `disabled` 로도 막는다 — openModal 의 포커스 트랩이 hidden 요소도 모아 Tab 이 보이지 않는 칸으로 빠지던 때의
          처방이고, 2026-10-17 부터 트랩(ui.js `tabbables()`)이 숨은 칸을 스스로 빼 지금은 겹치는 안전장치다(셸 setDisabled 가
          이 표시를 보고 '호출부가 끈 칸' 으로 남겨 두는 일은 그대로 한다).
       `role="radio"` 라 화살표로 옮긴다(공용 `bindRadioGroup` — 예전엔 선언만 있고 키가 없어 행마다 Tab 정거장이었다).
       표시(is-sel·aria-checked·tabindex)는 그쪽이 바꾸고, onPick 은 값이 바뀔 때만 온다(같은 행을 다시 눌러도 no-op — 예전 가드).
       ⚠️ 화살표('key')로 '직접 입력' 에 닿을 때는 이름 칸으로 초점을 옮기지 않는다 — 옮기면 화살표로 지나가는 순간 초점이 칸으로
          끌려가 그룹 안에서 되돌아갈 수 없다(관리자 발급 처리 창의 방식 고르기가 겪었다). 칸은 열리고 바로 다음 Tab 이 그 칸이다.
          누르거나 Enter·Space 로 고를 때('click')만 예전처럼 이름 칸으로 간다. */
    cReqRadios = bindRadioGroup(panel, { item: "[data-creq-pick]", selClass: "is-sel", onPick: (t, how) => {
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
      const box = qs(panel, "[data-slot='creqman']");
      if (box) {
        box.hidden = !man;
        qsa(box, "input").forEach((el) => {
          el.disabled = !man;
          if (!was && man) el.value = el.dataset.creq === "requesterPhone" ? cDraft.requesterPhone : cDraft.requesterName;
        });
        if (man && !was && how === "click") { const n = qs(box, "[data-creq='requesterName']"); if (n) n.focus(); }
      }
      syncReqSum();
      createModal.rerenderRail(); createModal.syncFooter(); createModal.markTouched();
    } });
    /* 직접 입력 — write-through 만 한다. 푸터 카운터는 셸이 오버레이에서(이 위임이
       끝난 뒤에) 다시 세므로 여기서 건드리지 않는다. */
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
         보조줄이 같은 말을 두 번 한다. 대신 연락처는 배지로 남긴다: 거래처가 포털 발송인 프로필에
         같은 명의를 여러 번 등록할 수 있어(막지 않는다) 그때는 연락처 말고는 구분할 단서가 없다.
         (시드의 같은 명의 셋은 2026-10-19 에 서로 다른 가상 값으로 바꿨다.) */
      const rows = cProfiles().map((p2) => ({
        v: p2.id, name: profileText(p2), meta: p2.phone || "",
      }));
      openRowPicker({
        /* 시안 #7 — 제목은 '무엇을 고르는 화면인지'(리본 명의), 에어브로는 어디서 온
           목록인지, 푸터 힌트는 이 선택이 무엇과 이어지는지를 말한다. */
        eyebrow: "발송 프로필", title: "리본 보내는분 명의", width: 500, listH: 272,
        hint: "이 거래처가 포털 발송인 프로필에 저장한 명단입니다",
        rows, current: cDraft.profileId, confirmLabel: "불러오기", toast,
        empty: "이 거래처에 저장된 발송 프로필이 없습니다.",
        onPick: (v) => {
          cDraft.profileId = v;
          const pf = cProfiles().find((x) => x.id === v);
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
      if (k === "amount") {
        const n = readWonInput(t);
        if (n === null) return; /* 거부 — draft 는 마지막으로 받은 값 그대로 */
        cDraft.amount = n;
        const b = qs(panel, "[data-slot='basis']"); if (b) b.textContent = cBasis();
        createModal.syncFooter(); /* 푸터 hint() 가 이번 발주 금액을 말한다 */
        return;
      }
      cDraft[k] = k === "recipientPhone" ? onPhoneInput(t) : t.value;
      if (t.tagName === "TEXTAREA") autosize(t);
      if (k === "recipientName" || k === "recipientPhone") createModal.rerenderRail();
    });
    on(panel, "focusout", "input[data-f='amount']", (e, t) => { if (cDraft) settleWonInput(t, cDraft.amount); });
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
        const amt = qs(pane, "[data-f='amount']"); /* data-slot 은 잠긴 칸에만 붙는다 — 상세 모달 주석 참조 */
        if (amt) settleWonInput(amt, cDraft.amount); /* DOM 직접 — 재렌더하면 커서가 날아간다 */
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

  /** 그 배송일시의 달로 등록을 받을 수 없는 이유(사용자 답 3 · 명세 6.4) — 발행 시각이 지난 거래 없는 달은 규칙 모듈의 이유
   *  그대로('9월은 명세서 발행이 지난 달입니다 — 배송일을 확인해 주세요'), 잠긴 달(동의된 달 · 수정 마감 지난 달)은
   *  '9월은 동의를 마친 달이라 이 주문을 그 달로 넣을 수 없습니다 — …'. 발행 전 달(이번 달·다음 달)은 "" (받는다).
   *  등록 위저드 푸터가 '왜 못 누르는지' 자리에 이 말을 쓰고 등록 버튼을 잠근다(order-create.js `block`). */
  function createBlock() {
    if (!cDraft || !cDraft.clientId || !DELIVER_AT_OK.test(String(cDraft.deliverAt || ""))) return "";
    const l = intakeBlockOf(cDraft.clientId, cDraft.deliverAt, new Date());
    return l ? lockSentence(l, "그 달로 넣을") : "";
  }
  /* 등록 — 막힘(createBlock)은 누르는 순간 한 번 더 본다. 명세서가 나간 달(고칠 수 있음)로 드는 늦은 등록이면 저장 전 금액 변경
     확인 창을 지난다(명세 3.4 '마감 전 수정' 8 '들어오면' · 사유 → b2bUpsert ctx.note). 채번은 쓰는 순간에만(확인 창에서 취소하면
     번호가 소모되지 않는다). */
  function submitCreate() {
    const blk = createBlock();
    if (blk) { toast(blk, "warn"); createModal && createModal.syncFooter(); return; }
    const probe = { ...cDraft, id: "", orderNo: "", amount: Number(cDraft.amount) || 0 };
    const imp = settlementImpactOf(null, probe, new Date());
    if (imp.lock) { toast(lockSentence(imp.lock, "그 달로 넣을"), "warn"); return; }
    if (!imp.confirm.length) { doCreate(""); return; }
    let lockSeen = false;
    const cl = cClient();
    openSettleConfirm({
      eyebrow: `${cl ? displayName(cl, sharedBizKeys(clients())) : ""} · 등록 전 확인`,
      title: "명세서 금액이 바뀝니다. 등록할까요?",
      months: monthRows(imp),
      what: whatOf(imp, null, probe),
      notes: [confirmNote(imp, "등록하는")],
      okLabel: "등록하고 명세서에 반영",
      hint: "등록하면 바로 반영됩니다 · 되돌리려면 주문을 지우거나 고쳐 저장합니다",
      recheck: () => {
        if (!cDraft) return null;
        const l = intakeBlockOf(cDraft.clientId, cDraft.deliverAt, new Date());
        if (!l) return null;
        lockSeen = true;
        const e = lockErr(l, null, { what: "등록" });
        return { ...e, hint: "창을 닫으면 등록 창 아래에 막힌 이유가 남습니다" };
      },
      onConfirm: (note) => (cDraft ? doCreate(note) : true),
      onLockedClose: () => { if (lockSeen && createModal) createModal.syncFooter(); },
    });
  }
  function doCreate(note) {
    const req = cRequester();
    const pf = cProfile();
    const rec = {
      ...cDraft,
      id: b2bNewId(), orderNo: b2bNextOrderNo(),
      amount: Number(cDraft.amount) || 0,
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
    /* 첫 이력은 레코드와 **한 번에** 저장한다 — 저장 뒤 레코드에 직접 push 하면 영속되지 않는다. */
    rec.history = [histEntry("created", `주문 접수 · ${(cClient() || {}).companyName || ""}`.trim())];
    if (!b2bUpsert(rec, { note })) { toast(SAVE_FAIL, "warn"); return false; } // 등록 창을 닫지 않는다 — 적은 내용을 잃지 않게
    createModal && createModal.close();
    ensureVisible(rec);
    return true;
  }

  /* 등록할 때 남기는 알림 명단 — 레일에 보인 **그 줄 그대로**(notifyRows) 저장한다(명세 5.3 · M48 · M50).
     ⚠️ 예전엔 번호 없는 줄과 이 주문에서 끈 줄을 빼고 저장해, '받는분에게는 왜 문자가 안 갔나' 를 확인할 길이 없었다
        — 끈 것인지 처음부터 없던 것인지 구분되지 않는다(2026-10-15 실측: 받는분을 끄고 등록한 B2B-0045 에 그 줄이 없었다).
        이제 끈 줄은 `on: false`, 번호 없는 줄은 `phone: null` 로 남는다.
     ⚠️ 번호 없는 줄의 `on` 은 **사람의 의사 그대로**다(명세 5.3 'T2 발송 규칙' 2) — 레일 스위치가 잠겨 꺼져 보여도 `false` 로
        굳히지 않는다. 받는분 번호는 상세 모달에서 나중에 채울 수 있고, 서버는 발송 때 그 줄을 지금 번호로 다시 맞춰(규칙 1)
        켜져 있으면 보낸다. 잠긴 줄을 `on: false` 로 저장하면 번호를 채워도 영영 안 간다. 보낼지 말지는 번호가 정한다(규칙 2).
     보내는분 줄의 name 은 프로필의 **성함**이다(리본 문구가 아니다 — 명세 5.3 · M65). */
  function notifySnapshot() {
    return notifyRows().map((r) => {
      const on = !cDraft.notifyOff.includes(r.key);
      const phone = String(r.phone || "").trim() || null;
      if (r.key === "recipient") return { kind: "recipient", name: r.name, phone, on };
      if (r.key === "sender") return { kind: "sender", profileId: r.profileId, name: r.profileName, phone, on };
      if (r.key === "requester") return { kind: "contact", name: r.name, phone, on };
      return { kind: "contact", contactId: r.contactId, name: r.name, phone, on };
    });
  }

  /* 목록이 현재 탭·기간을 그대로 적용하므로 방금 등록한 주문이 안 보일 수 있다. */
  function ensureVisible(rec) {
    refreshList();
    if (filtered().some((o) => o.id === rec.id)) { toast(`${rec.orderNo} 주문을 등록했습니다`, "ok"); return; }
    state.tab = "all"; state.dateQuick = "전체"; state.dateStart = ""; state.dateEnd = "";
    if (state.clientId && state.clientId !== rec.clientId) {
      state.clientId = ""; state.qClient = "";
      const q = qs(root, "[data-search='qClient']");
      if (q) q.value = "";
    }
    /* 화면을 통째로 다시 그리지 않는다 — 등록 창이 닫히며 초점을 돌려준 '신규 주문 등록' 이 갈려 초점이 body 로 빠졌다(2026-10-19). */
    refreshFilters();

    toast(`${rec.orderNo} 등록 · 보이도록 목록 필터를 초기화했습니다`, "ok");
  }

  function destroyDds() { dds.forEach((d) => d.destroy()); dds.length = 0; prodDd = null; }
  /* 상세 모달의 주문금액 칸 — 단위('원')가 칸 밖에 따로 있어 칸에는 숫자만 쓴다(시안 S-06). 받는 규칙은 등록 모달과 같은
     `readWonInput`(거부형)이고, 되돌릴 때만 단위 없이 쓴다(주문취소 수수료 칸과 같은 수법 — settleWonInput 은 'N원' 을 쓴다). */
  const putAmt = (t, n) => { t.value = wonNum(n); t.classList.remove("is-bad"); t.setAttribute("aria-invalid", "false"); };
  function bindControls(panel) {
    destroyDds();
    const prod = qs(panel, "[data-dd-f='product']");
    if (prod) dds.push(prodDd = makeDropdown(prod, {
      options: () => PRODUCTS.map((p) => p.name),
      /* 금액은 바로 옆 '주문금액/적용 단가' 칸에 이미 있다 — 상품명만 보여 준다 */
      label: (v) => v || "상품을 선택하세요",
      get: () => editing.product,
      set: (v) => {
        /* ⚠️ 같은 상품을 다시 눌러도 이 set 이 돈다(makeDropdown 에 동일값 가드가 없다).
           그때 금액을 다시 파생시키면 주문에 적힌 **협의 금액(0원 가입 혜택 포함)이 정가로 덮인다**. */
        if (editing.product === v) return;
        editing.product = v;
        /* 상품을 바꾸면 (거래처 × 상품) 적용 단가로 다시 채운다 — 그 뒤 고치는 것은 관리자 몫 */
        editing.amount = priceFor(editing.clientId, v);
        /* ⚠️ `[data-slot]` 이 아니라 `[data-f]` 다 — data-slot 은 잠긴 칸에만 붙는다(order-fields fieldCell).
           잠금을 풀 때 이걸 안 바꾸면 상품을 바꿔도 칸의 금액이 옛 값으로 남는다. */
        const amt = qs(panel, "[data-f='amount']");
        if (amt) putAmt(amt, editing.amount);
        renderSum(); syncDirty();
      },
    }));
    const dtp = qs(panel, "[data-dtp]");
    if (dtp) dds.push(makeDateTimePicker(dtp, {
      get: () => editing.deliverAt,
      /* 귀속월 칸·정산 줄·배송일시 안내·저장 줄이 함께 바뀐다(2차 시안 — 다른 달로 옮기는 중이면 칸이 호박색, 옛 달·새 달이
         막혔으면 빨간색이고 저장 줄이 어느 달 때문인지 말하며 저장 버튼이 누르기 전부터 잠긴다). 고르는 동안에는 토스트 없이
         글자만 바뀐다 — 날짜·시·분마다 불리므로 판정은 syncDirty 의 settlementImpactOf 한 번이다. 저장 순간 한 번 더 판정한다. */
      set: (v) => { editing.deliverAt = v; renderHd(); renderSum(); syncPeriod(); syncDirty(); },
      min: DP_MIN, max: DP_MAX,
    }));
    /* 라벨·안내를 피커 트리거에 묶는다(마크업은 공용 dtpMarkup 이라 id 가 없다). */
    const trg = dtp && qs(dtp, ".ord-dtp__trigger");
    if (trg) { trg.id = DELIV_ID; trg.setAttribute("aria-describedby", DELIV_WHY); }
    qsa(panel, "textarea.ord-in").forEach(autosize);
  }

  /* 잠긴 달 때문에 막힌 삭제·취소가 하는 말(토스트). 이유는 settlementImpactOf 의 lock.reason — 명세 6.4 정본(lockReason) 또는
     발행이 지난 거래 없는 달의 이유(issuedEmptyReason · 사용자 답 3)다. 어느 달 때문인지를 앞에 붙인다. */
  const lockMsg = (hit, what) => (hit.moved
    ? `배송일시를 ${periodLabel(hit.ym)}${hit.isOld ? "에서" : "로"} 옮길 수 없습니다 · ${hit.reason}`
    : `${periodLabel(hit.ym)} 정산이 잠겨 ${what} 수 없습니다 · ${hit.reason}`);

  /* ── 정산 결과 한 줄 · 확인 창 조각 (2차 시안 S-06 ⑦) ─────────────────────────────── */
  /** 저장·삭제 뒤 토스트 꼬리 — 명세서가 나간 달이 바뀌었으면 '9월 명세서가 1,025,000원, 10월 정산이 580,000원으로 바뀌었습니다',
   *  발행 전 달만이면 '10월 정산(발급 전)이 590,000원으로 다시 계산되었습니다', 정산과 무관하면 '정산 금액은 그대로입니다'.
   *  금액은 쓴 뒤 다시 읽는다(settlementOf — 화면이 더하기를 하지 않는다). 조사는 '원으로'(시안 '원로' 는 오자). */
  function settleAfter(imp) {
    const ch = imp ? imp.months.filter((m) => m.delta !== 0) : [];
    if (!ch.length) return "정산 금액은 그대로입니다";
    const now = new Date();
    const rows = ch.map((m) => {
      const c = clients().find((x) => x.id === m.clientId);
      const s = c ? settlementOf(c, m.ym, now) : m.s;
      return { label: monthWord({ ym: m.ym, s }), amt: s.amount, sheet: isSheet(s) };
    });
    const josa = (l) => (l.endsWith("서") ? "가" : "이");
    if (rows.some((r) => r.sheet)) return `${rows.map((r) => `${r.label}${josa(r.label)} ${won(r.amt)}`).join(", ")}으로 바뀌었습니다`;
    return `${rows.map((r) => `${r.label}(발급 전)이 ${won(r.amt)}`).join(", ")}으로 다시 계산되었습니다`;
  }
  /** 확인 창의 달 한 줄 보조 — '10월 1일 10:00 발급 · 동의대기 · 수정 마감 10월 9일 10:00' / '발급 전 · 11월 1일 10:00 발행'. */
  const monthSub = (s) => (isSheet(s)
    ? `${fmtKoShortTime(s.issueAt)} 발급 · ${chipOf(s)[0].split(" · ")[0]} · 수정 마감 ${fmtKoShortTime(s.editLockAt)}`
    : `발급 전 · ${fmtKoShortTime(s.issueAt)} 발행`);
  const monthRows = (imp) => imp.months.filter((m) => m.delta !== 0)
    .map((m) => ({ label: monthWord(m), sub: monthSub(m.s), before: m.before, after: m.after }));
  /** '바뀌는 것' — 원인별(자동 결정): 직접 고침 / 상품을 바꿔 적용 단가로 다시 채워짐 / 배송일시를 다른 달로(금액도 바뀌면 둘 다). */
  function whatOf(imp, stored, next) {
    const a = Number(stored ? stored.amount : 0) || 0;
    const b = Number(next ? next.amount : 0) || 0;
    if (!stored) return `새 주문 ${won(b)}이 ${imp.months[0] ? monthWord(imp.months[0]) : "그 달 정산"}에 듭니다 · ${dash(next.product)}`;
    if (imp.cause === "move") {
      const o = imp.months.find((m) => m.isOld), n = imp.months.find((m) => !m.isOld);
      const ol = o ? monthWord(o) : "옛 달 정산", nl = n ? monthWord(n) : "새 달 정산";
      const tail = a === b ? `주문금액 ${won(a)}이 ${ol}에서 빠지고 ${nl}에 듭니다`
        : `주문금액 ${won(a)}이 ${ol}에서 빠지고 ${won(b)}이 ${nl}에 듭니다`;
      return `배송일시 ${koDT(stored.deliverAt)} → ${koDT(next.deliverAt)} · ${tail}`;
    }
    if (imp.cause === "product") {
      return b === priceFor(next.clientId, next.product)
        ? `주문상품 ${dash(stored.product)} → ${dash(next.product)} · 적용 단가로 다시 채워짐(${won(a)} → ${won(b)})`
        : `주문상품 ${dash(stored.product)} → ${dash(next.product)} · 주문금액 ${won(a)} → ${won(b)} · 직접 고침`;
    }
    return `주문금액 ${won(a)} → ${won(b)} · 직접 고침`;
  }
  /** 회색 안내 — '저장하는 순간 거래처가 보는 9월 명세서가 바뀝니다'. 마감 하루 전 안내(T4)는 알림이 닿을 때만 말한다(자동 결정 —
   *  정산 담당 연락처가 없으면 거짓이 된다). */
  function confirmNote(imp, verb = "저장하는") {
    const iss = imp.confirm;
    const s = iss[0].s;
    const at = fmtKoShortTime(s.editLockAt);
    return {
      title: `${verb} 순간 거래처가 보는 ${iss.map((m) => `${monthNo(m.ym)}월`).join("·")} 명세서가 바뀝니다`,
      body: s.noRecipient ? `수정 마감 ${at} 뒤에는 금액을 바꿀 수 없습니다.`
        : `수정 마감 ${at}에 마감 하루 전 안내가 최종 금액으로 나갑니다. 그 뒤에는 금액을 바꿀 수 없습니다.`,
    };
  }
  /** 확인 창 안 빨간 안내(서버 409 대역) — 제목 + [고정된 금액 · 적은 값이 어디 남는지, 정본 이유]. */
  function lockErr(lock, stored, { what = "저장" } = {}) {
    const vals = lock.isOld ? unsavedVals(stored) : "";
    const fixed = isSheet(lock.s) ? `${monthNo(lock.ym)}월 명세서 금액은 ${won(lock.s.amount)}으로 고정되었습니다.` : "";
    const keep = vals ? ` 적은 값 ${vals}은 창을 닫으면 저장 줄에 남습니다.` : "";
    return {
      title: what === "저장" ? lockTitle(lock) : lockTitle(lock).replace("저장하지", `${what}하지`),
      body: [`${fixed}${keep}`.trim(), lock.reason].filter(Boolean),
      hint: vals ? "창을 닫으면 주문금액 칸이 잠긴 모습으로 바뀝니다" : "창을 닫으면 막힌 이유가 저장 줄에 남습니다",
    };
  }

  /* 배송완료 알림(T2)·접수 확인(T1) 이력 줄 — 누구에게 갔는지 이름을 함께 남긴다(시안 S-06 '이력에 받는 사람').
     데모라 실제 발송은 없고, 명세 5.3 규칙으로 '보낼 사람' 을 정해 적는다. 받을 사람이 없으면 그렇다고 적는다(M58 '못 보냄'). */
  const deliveredEntries = (o) => {
    const list = notifyPeople(o);
    return [
      histEntry("delivered", "배송완료로 변경"),
      histEntry("delivered", list.length ? `배송완료 알림 · ${peopleShort(list)}` : "배송완료 알림 · 받을 사람 없음"),
    ];
  };

  /* 저장 — **판정 → (확인 창) → 쓰기** 세 단계(2차 시안 S-06 ⑦).
     판정은 settlementImpactOf 하나다(서버 409 SETTLEMENT_PERIOD_LOCKED 의 데모 대역 — 누르는 순간 다시 판정한다. 창을 열어 둔 사이
     수정 마감이 지났거나 거래처가 동의했을 수 있다). 막히면 쓰지 않는다 — 옛 달이 잠겼으면 금액·상품을 되돌리고 적은 값은
     저장 줄 메모로(사용자 답 2), 들어가는 달이 막혔으면 저장 줄이 이유를 말한다. 명세서가 나간 달의 금액이 실제로 바뀌면
     확인 창을 지나고(사유 → b2bUpsert ctx.note → 정산 금액 변경 기록), 그 밖에는 바로 쓴다(리본 문구·발행 전 달). */
  function saveOrder() {
    if (!editing) return;
    if (!editing.clientId || !editing.product) { toast("거래처와 주문상품은 필수입니다", "warn"); return; }
    const stored = findOrder(editing.id);
    /* 취소한 주문의 금액 < 수수료(서버 400 대역) — 저장 줄이 이미 막지만 누르는 순간 한 번 더 본다. 정산 판정보다 먼저(syncDirty 와 같은 순서). */
    if (orderFeeError(mergedNow(), stored)) { syncDirty(); toast(writeFail(mergedNow(), stored), "warn"); focusAfterSave(panelOf()); return; }
    const imp = stored ? settlementImpactOf(stored, mergedNow(), new Date()) : null;
    if (imp && imp.lock) {
      rejectLocked(imp.lock, stored);
      toast(lockTitle(imp.lock), "warn");
      focusAfterSave(panelOf()); // 금액·상품을 되돌려 고친 칸이 0 이 되면 저장 버튼이 잠긴다 — 그 버튼에 있던 초점 → '닫기'
      return;
    }
    if (imp && imp.confirm.length) { openSaveConfirm(imp, stored); return; }
    commitSave(imp, "");
  }
  /** 저장 전 금액 변경 확인 창 — 상세 창 위에 스택된다(핸들을 activeModal 에 담지 않는다). */
  function openSaveConfirm(imp, stored) {
    let pending = imp;
    let lockSeen = null;
    openSettleConfirm({
      eyebrow: `${editing.orderNo} · ${clientName(stored)} · 저장 전 확인`,
      title: "명세서 금액이 바뀝니다. 저장할까요?",
      months: monthRows(imp),
      what: whatOf(imp, stored, mergedNow()),
      notes: [confirmNote(imp)],
      okLabel: "저장하고 명세서에 반영",
      hint: "저장하면 바로 반영됩니다 · 되돌리려면 다시 고쳐 저장합니다",
      recheck: () => {
        if (!editing) return null;
        const st = findOrder(editing.id) || stored;
        const imp2 = settlementImpactOf(st, mergedNow(), new Date());
        if (!imp2.lock) { pending = imp2; return null; }
        lockSeen = imp2.lock;
        return lockErr(imp2.lock, st);
      },
      onConfirm: (note) => (editing ? commitSave(pending, note) : true),
      onLockedClose: () => {
        if (!editing || !lockSeen) return;
        rejectLocked(lockSeen, findOrder(editing.id) || stored);
        focusAfterSave(panelOf()); // 확인 창이 돌려준 저장 버튼이 잠겼으면 '닫기' 로(order-screen)
      },
    });
  }
  /** 쓰기 — 실패하면(저장 공간 한도) false 를 돌려 확인 창을 닫지 않는다(적은 사유를 잃지 않게). */
  function commitSave(imp, note) {
    const n = dirtyCount();
    const stored = findOrder(editing.id);
    const merged = { ...editing, amount: Number(editing.amount) || 0 }; // 칸은 readWonInput 이 받은 숫자만 쓴다
    let autoDone = false;
    if (merged.status === "주문접수" && merged.image && String(merged.receiver || "").trim()) {
      merged.status = "배송완료";
      merged.notified = notifyPeople(merged).length > 0; // 받을 사람이 0명이면 보내지 않는다(M58 — 스테퍼와 같은 규칙)
      autoDone = true;
    }
    /* 이력은 레코드와 **한 번에** 저장한다(쓰기 하나 — 둘로 나누면 둘째가 실패할 때 '수정했는데 이력 없음' 이 남는다). */
    const hist = [...((stored && stored.history) || [])];
    if (n) hist.push(histEntry("edit", `주문 정보 수정 ${n}건`));
    if (autoDone) hist.push(...deliveredEntries(merged));
    merged.history = hist;
    /* 저장이 실패하면(저장 공간 한도) 모달은 고친 값을 그대로 든 채 '수정한 항목' 도 남긴다 — 저장된 척하지 않는다.
       사유(note)는 명세서가 나간 달의 금액이 바뀌면 b2b-mock 이 정산 금액 변경 기록에 함께 남긴다(처리자는 currentActor). */
    if (!b2bUpsert(merged, { note })) { toast(writeFail(merged, stored), "warn"); return false; }
    const saved = findOrder(merged.id);
    delete merged.history; // 작업본(editing)에는 저장된 레코드의 이력을 따로 붙인다(참조 공유 방지)
    refreshList();
    editing = { ...merged, history: saved ? saved.history : [] };
    baseline = { ...editing };
    unsaved = ""; unsavedTip = ""; // 저장 줄 메모는 다음 저장 때 사라진다(사용자 답 2)
    if (saved) s0 = settleOf(saved); // 다른 달로 옮겨 저장했으면 요약·안내가 새 달을 말한다
    const d = new Date();
    savedAt = `${d.getHours() < 12 ? "오전" : "오후"} ${d.getHours() % 12 || 12}:${pad2(d.getMinutes())}`;
    /* 금액에 영향이 없는 저장은 잠긴 달에서도 받는다 — 그 사이 그 달이 잠겼으면(열어 둔 동안 수정 마감·동의) 칸을 지금 잠근다. */
    if (!amtLock && saved) { const nl = lockOf(saved); if (nl) applyLock(nl, null); }
    refreshAmtBox();
    syncDirty(); renderHd(); renderSum(); renderHist();
    /* 정산 꼬리는 자동 배송완료 저장에도 같은 규칙으로 붙인다 — 같은 저장이 명세서가 나간 달의 금액을 바꿨을 수 있다
       (금액·상품·배송일시를 고치고 사진·인수자까지 넣어 한 번에 저장). 예전엔 이 갈래만 꼬리가 없어 확인 창을 지나 저장해도
       바뀐 명세서 금액을 말하지 않았다. */
    const tail = `${settleAfter(imp)}${note && imp && imp.confirm.length ? " · 사유를 변경 기록에 남겼습니다" : ""}`;
    toast(autoDone
      ? `${merged.notified ? "배송완료 처리됨 · 거래처 알림톡이 자동 발송됩니다" : "배송완료 처리됨 · 받을 사람이 없어 알림톡은 나가지 않습니다"} · ${tail}`
      : `저장했습니다 · ${tail}`);
    focusAfterSave(panelOf()); // 잠긴 저장 버튼에 있던 초점 → '닫기'(order-screen)
    return true;
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
        if (!b2bSetManager(editing.id, v)) { toast(SAVE_FAIL, "warn"); return false; }
        editing.manager = v;
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
    /* 배송완료의 근거(사진·인수자)는 **상태와 함께 저장**한다. canComplete() 는 작성 중인 값(editing)을 보는데
       b2bSetStatus 는 저장된 레코드에만 상태를 쓴다 — 저장 안 한 사진·인수자로 스테퍼를 누르면 '배송완료 · 사진
       없음 · 인수자 없음' 레코드가 영속됐다(2026-10-16 검증). 다른 미저장 수정은 건드리지 않는다(저장 버튼 몫). */
    /* 상태 · 근거 · 이력을 **쓰기 한 번**으로 남긴다. 이력에는 알림이 누구에게 갔는지를 함께 적는다(시안 S-06) —
       배송완료면 배송완료 알림(T2) 받는 사람, 주문접수면 접수 확인(T1)을 받는 주문 요청자(명세 3.3 · 9.4).
       그래서 b2bSetStatus('배송완료 · 알림톡 발송' 한 줄만 쓴다)를 지나지 않는다. 요청자 번호를 모르는 주문(시드)은
       T1 줄을 쓰지 않는다 — 보낼 곳이 없는 알림을 보냈다고 적지 않는다. */
    const st = findOrder(editing.id);
    if (!st) return;
    const rec = { ...st, status: next };
    const add = [];
    if (next === "배송완료") {
      rec.image = editing.image; rec.receiver = editing.receiver;
      /* 받을 사람이 0명이면 보내지 않고 notified=false 다(명세 5.3 'T2 발송 규칙' 4 · M58) — 이력('받을 사람 없음')·
         목록 '알림' 칸·토스트가 같은 말을 하게 한다(예전엔 이력은 '받을 사람 없음' 인데 목록은 '알림 발송완료' 였다). */
      rec.notified = notifyPeople(rec).length > 0;
      add.push(...deliveredEntries(rec));
    } else {
      add.push(histEntry("status", `${next}로 변경`));
      const rq = next === "주문접수" ? requesterOf(rec) : null;
      if (rq) add.push(histEntry("status", `주문접수 알림 · ${rq.name}`));
    }
    rec.history = [...(st.history || []), ...add];
    if (!b2bUpsert(rec)) { toast(SAVE_FAIL, "warn"); syncDirty(); return; }
    if (next === "배송완료" && baseline) { baseline.image = editing.image; baseline.receiver = editing.receiver; }
    editing.status = next;
    if (next === "배송완료") editing.notified = rec.notified;
    if (baseline) { baseline.status = next; baseline.notified = editing.notified; }
    const stored = findOrder(editing.id);
    if (stored) editing.history = stored.history;
    refreshList();
    renderHd(); renderSum(); renderHist(); syncDirty(); // 사진·인수자가 함께 저장됐으면 '수정한 항목' 에서 빠진다 · 요약은 '배송 완료'
    toast(next !== "배송완료" ? `${next}(으)로 변경했습니다`
      : rec.notified ? "배송완료로 전환 · 거래처 알림톡이 발송됩니다" : "배송완료로 전환 · 받을 사람이 없어 알림톡은 나가지 않습니다");
    focusAfterStep(panelOf()); // 새 '지금' 단계는 disabled 라 초점을 못 받는다 — 다음 단계로(order-screen)
  }

  function openEditor(order) {
    closeModal();
    editIdx = editIndexOf(root, order.id);
    const { history: _h, ...draft } = order;
    editing = { ...draft, history: order.history || [] };
    baseline = { ...editing };
    savedAt = "";
    menuOpen = false;
    unsaved = ""; unsavedTip = ""; lastImp = null; // 저장 줄 메모는 창을 닫으면 사라진다(사용자 답 2)
    s0 = settleOf(order); // 저장된 배송일시의 달 — 요약 줄·금액 칸 안내·배송일시 안내의 기준
    amtLock = s0 && !s0.editable ? s0 : null; // 저장된 배송일시의 달이 잠겼으면 금액·상품 칸을 처음부터 잠근다
    let menu = null; // ··· 메뉴 키보드(order-screen bindOrdMenu) — 열려 있으면 ESC 는 메뉴만 닫는다
    activeModal = openModal({
      panelClass: "modal-panel--ord",
      body: modalBody(),
      onEsc: () => (menu ? menu.escape() : true),
      onClose: () => {
        destroyDds(); activeModal = null; editing = null; baseline = null; s0 = null; lastImp = null;
        if (alive) focusAfterClose(root, order.id, editIdx); // 연필이 다시 그려졌으면 같은 주문의 새 연필로 · 빠졌으면 그 자리 줄로
      },
    });
    amtSig = amtSigOf();
    const panel = activeModal.panel;
    bindControls(panel);
    syncDirty(); // 배송일시 줄 안내를 채운다(입력이 없으면 '변경 없음' 그대로)
    histScrollEnd(panel); // 최신 이력이 맨 아래라 처음부터 끝을 보여 준다

    on(panel, "click", "[data-action='close']", () => closeModal());
    on(panel, "click", "[data-action='save']", () => saveOrder());
    on(panel, "click", "[data-action='step']", (e, t) => stepTo(t.dataset.v));
    /* ··· 메뉴 — 열면 첫 항목에 초점, ↑↓·Home·End 로 옮기고 ESC·Tab 은 메뉴를 닫는다(order-screen bindOrdMenu).
       머리를 다시 그리면 눌린 버튼이 갈리므로 초점은 그 함수가 다시 그린 뒤에 준다. 잠긴 '주문서 삭제' 에도 화살표로 닿는다. */
    menu = bindOrdMenu(panel, { isOpen: () => menuOpen, setOpen: (v) => { menuOpen = v; renderHd(); } });
    /* 잠긴 '주문서 삭제'(aria-disabled) — 아무것도 하지 않는다. 이유는 바로 아래 줄에 적혀 있고 aria-describedby 가 읽는다. */
    on(panel, "click", "[data-action='delete-locked']", () => {});
    /* 삭제 — B2B 주문은 그 달 청구의 근거다. 판정은 settlementImpactOf(저장본, null) 하나다(명세 6.4 — 귀속월과, 수수료가
       붙은 취소 주문이면 **취소한 달**도 · 둘 다 잠겼으면 앞선 달 · 수수료 0원이어도 취소 주문의 귀속월이 잠겼으면 막는다).
       ⚠️ 저장된 값으로 말한다 — 삭제하면 저장 안 한 수정은 버려지므로, 화면에서 배송일시·금액을 고쳐 둔 채 지우면 청구에서
       빠지는 것은 저장돼 있던 달·금액이다(귀속월 = 배송일의 달). */
    on(panel, "click", "[data-action='delete']", () => {
      const saved = findOrder(editing.id) || baseline || editing;
      const imp = settlementImpactOf(saved, null, new Date());
      /* 메뉴를 연 사이 잠겼다 — 메뉴를 다시 그려 잠긴 항목 + 이유를 보이고 초점을 그 항목에 둔다(다시 그리면 누른 항목이 사라진다). */
      if (imp.lock) { renderHd(); qs(panel, "[data-action='delete-locked']")?.focus(); toast(lockMsg(imp.lock, "지울"), "warn"); return; }
      menu.close(); // 확인 창이 닫히면 초점이 ··· 로 돌아온다
      const name = editing.orderNo;
      const doRemove = (imp2) => {
        const idx = editIndexOf(root, editing.id); // 지우기 전 순번 — 그 자리에 올라온 줄로 초점을 옮긴다
        if (!b2bRemove(editing.id)) { toast(SAVE_FAIL, "warn"); return; }
        closeModal();
        refreshList();
        focusAfterDelete(root, idx); // 창이 돌려준 연필이 다시 그린 목록에서 사라졌다(body) — order-screen
        const tail = settleAfter(imp2);
        toast(`${name} 주문을 삭제했습니다${imp2.months.some((m) => m.delta !== 0) ? ` · ${tail}` : ""}`, "warn");
      };
      /* 명세서가 나간 달(고칠 수 있음)의 금액이 빠지면 시안의 삭제 확인 — 바뀌는 정산 금액 한 줄 + '바뀌는 것'(규격은 공용
         openDeleteConfirm 그대로: 빨간 '주문서 삭제' + 휴지통 · '돌아가기'). 발행 전 달이면 예전 문단('… 정산의 청구 근거입니다'). */
      if (imp.confirm.length) {
        let imp2 = imp;
        const fee = Number(saved.cancelFee) || 0;
        const cancelled = saved.status === "취소";
        const lbl = monthWord(imp.confirm[0]);
        openDeleteConfirm({
          orderNo: name,
          eyebrow: `${name} · ${clientName(saved)}`,
          width: 560,
          body: html`
            <div class="sdlg-del">
              <div data-slot="alert" hidden></div>
              ${sdlgMonths({
                months: monthRows(imp),
                what: cancelled
                  ? `이 주문의 취소 수수료 ${won(fee)}이 ${lbl}에서 빠집니다 · 거래처가 보는 명세서가 바로 바뀝니다`
                  : `이 주문 금액 ${won(saved.amount)}이 ${lbl}에서 빠집니다 · 거래처가 보는 명세서가 바로 바뀝니다`,
              })}
              ${sdlgNote({
                title: "삭제는 되돌릴 수 없습니다",
                body: cancelled ? "목록과 정산 근거에서 함께 사라집니다."
                  : "목록과 정산 근거에서 함께 사라집니다. 기록을 남겨야 한다면 삭제 대신 주문취소를 사용하세요.",
              })}
            </div>`,
          checkLabel: "명세서에서 빠지는 것과 되돌릴 수 없음을 확인했습니다",
          hintOn: `삭제하면 ${imp.confirm.map((m) => `${monthNo(m.ym)}월`).join("·")} 명세서가 바로 다시 계산됩니다`,
          /* 지우는 순간 한 번 더 판정한다(서버 409 대역) — 막히면 창 안에 빨간 안내를 띄우고 버튼을 잠근다(저장 409 와 같은 모양). */
          guard: (d) => {
            const st = findOrder(editing.id) || saved;
            const again = settlementImpactOf(st, null, new Date());
            if (!again.lock) { imp2 = again; return true; }
            const p = d.panel;
            const al = qs(p, "[data-slot='alert']");
            const e = lockErr(again.lock, null, { what: "삭제" });
            if (al) { setHTML(al, sdlgErr(e)); al.hidden = false; }
            const ok = qs(p, "[data-action='ok']"); if (ok) ok.disabled = true;
            const ck = qs(p, "[data-action='ack']"); if (ck) ck.disabled = true;
            const cancelBtn = qs(p, ".dlg-ft [data-action='close']");
            if (cancelBtn) { cancelBtn.textContent = "닫기"; cancelBtn.focus(); }
            d.setHint("이 주문은 지울 수 없습니다 · 창을 닫으면 메뉴에 이유가 남습니다", true);
            /* 힌트가 말한 대로 — 창 뒤의 ··· 메뉴를 열어 둔다(잠긴 '주문서 삭제' + 이유 · 440 창 경로와 같은 결과).
               예전엔 메뉴가 닫힌 채라 창을 닫으면 이유가 어디에도 없었다(2026-10-16 검토 실측). */
            menuOpen = true; renderHd();
            return false;
          },
          /* 위에서 머리를 다시 그렸으면 창이 되돌려 줄 ··· 가 사라져 초점이 body 로 빠진다 — 열어 둔 잠긴 항목에 둔다.
             막히지 않고 닫혔으면(돌아가기·삭제) 메뉴가 닫혀 있어 아무것도 하지 않는다. */
          onClose: () => { if (menuOpen && panelOf()) qs(panel, "[data-action='delete-locked']")?.focus(); },
          onConfirm: () => doRemove(imp2),
        });
        return;
      }
      /* 취소한 주문의 금액은 이미 정산에 없다 — 남은 것은 수수료(취소한 달)뿐이다. 예전엔 취소 주문에도 '그 달 청구 금액에서
         주문금액이 빠집니다' 라고 말해 사실과 달랐다. */
      const fee = Number(saved.cancelFee) || 0;
      const note = saved.status !== "취소"
        ? html`이 주문은 <b>${orderPeriodLabel(saved.deliverAt)} 정산</b>의 청구 근거입니다.
            삭제하면 그 달 청구 금액에서 <b>${won(saved.amount)}</b>이 빠집니다.`
        : fee > 0
          ? html`이 주문의 취소 수수료는 <b>${orderPeriodLabel(saved.canceledAt)} 정산</b>의 청구 근거입니다.
              삭제하면 그 달 청구 금액에서 <b>${won(fee)}</b>이 빠집니다.`
          : null;
      let impB = imp;
      openDeleteConfirm({
        orderNo: name,
        note,
        /* 확인 창을 띄워 둔 사이 잠겼을 수 있다 — 지우는 순간 한 번 더 판정한다(서버 409 대역). 이 창은 예전 규격(440)이라
           창을 닫고 토스트로 말한다. 그사이 명세서가 나갔으면(발행 시각이 지남) 바뀐 금액을 같은 판정으로 다시 센다. */
        guard: (d) => {
          const again = settlementImpactOf(findOrder(editing.id) || saved, null, new Date());
          if (!again.lock) { impB = again; return true; }
          /* 창이 닫히며 ··· 로 돌아간 초점은 머리를 다시 그리면 사라진다(body) — 잠긴 항목에 둬 이유를 읽게 한다(위 메뉴 경로와 같다). */
          d.close(); menuOpen = true; renderHd(); qs(panel, "[data-action='delete-locked']")?.focus();
          toast(lockMsg(again.lock, "지울"), "warn");
          return false;
        },
        onConfirm: () => doRemove(impB),
      });
    });
    /* 주문취소 — 그 달 정산이 잠겼으면 취소할 수 없다(명세 3.4 '마감 전 수정' 6 · 6.4 — 그런 달의 주문은 배송일이 모두 지났다).
       취소는 작성 중인 수정도 함께 저장하므로(쓰기 둘: 작업본 → 취소) 두 쓰기 모두 settlementImpactOf 로 본다. 확인 창은 두지 않는다
       (주문취소 창 문구는 요청서 O-6 몫 — 시안 미도착). */
    const cancelHit = (fee = 0, now = new Date()) => {
      const st = findOrder(editing.id);
      if (!st) return null;
      const rec = mergedNow();
      const a = settlementImpactOf(st, rec, now);
      if (a.lock) return a.lock;
      return settlementImpactOf(rec, { ...rec, status: "취소", cancelFee: Number(fee) || 0, canceledAt: fmtAt(now) }, now).lock;
    };
    on(panel, "click", "[data-action='order-cancel']", () => {
      menu.close(); // 주문취소 창이 닫히면 초점이 ··· 로 돌아온다
      if (!editing || editing.status === "취소") return;
      const hit = cancelHit();
      if (hit) { toast(lockMsg(hit, "취소할"), "warn"); return; }
      openCancelModal({
        orderNo: editing.orderNo,
        amount: editing.amount,
        /* 수수료는 **취소한 날이 속한 달**의 정산에 붙는다(2026-10-15 기본값 — 명세 3.4 '마감 전 수정' 6).
           주문의 귀속월(배송한 달)이 아니다 — 그래서 달 이름을 넘겨 안내문이 그 달을 말하게 한다. B2C 는 정산이 없다. */
        settle: periodLabel(periodOf(new Date())),
        /* 확정하면 아래에서 머리를 다시 그려 창이 돌려줄 ··· 가 사라진다(초점이 body 로 빠졌다) — 새 ··· 로. */
        onClose: () => menu.refocus(),
        onConfirm: ({ reason, fee }) => {
          const { history: _x, ...rec } = editing;
          /* 수수료 상한(명세 6.4 `400 CANCEL_FEE_INVALID` — 0원부터 이 주문 금액까지). 창이 이미 '주문 취소하기' 를 잠그지만 쓰기 **전에**
             같은 규칙(b2bCancel 과 같은 함수)으로 한 번 더 본다 — 쓰기 둘 중 앞의 것(작업본 저장)만 들어가고 취소는 막힌 채 남지 않게.
             기준은 곧 저장될 작업본 금액이다(아래에서 먼저 저장한다 — 창에 보인 금액과 같다). 잠김(409)보다 먼저 본다(저장 줄과 같은 순서). */
          const feeErr = cancelFeeError(rec.amount, fee);
          if (feeErr) { toast(`취소하지 못했습니다 · ${feeErr.message}`, "warn"); return; }
          /* 사유를 적는 사이 잠겼을 수 있다 — 취소하는 순간 한 번 더 판정한다(서버 409 대역 · 적은 수수료로). */
          const h2 = cancelHit(fee);
          if (h2) { toast(lockMsg(h2, "취소할"), "warn"); return; }
          /* 작성 중인 수정은 지금 상태 그대로 먼저 저장하고, 취소는 b2bCancel 이 한 번에 남긴다(사유·수수료·
             취소 시각 canceledAt·이력). ⚠️ 예전엔 상태를 '취소'로 바꾼 레코드를 먼저 upsert 해서 뒤의
             b2bSetStatus 가 '값이 그대로'로 건너뛰어 **취소 이력이 한 줄도 남지 않았다**. */
          if (!b2bUpsert(rec)) { toast(writeFail(rec, findOrder(editing.id)), "warn"); return; }
          if (!b2bCancel(editing.id, { reason, fee })) {
            const e2 = cancelFeeError((findOrder(editing.id) || rec).amount, fee);
            toast(e2 ? `취소하지 못했습니다 · ${e2.message}` : SAVE_FAIL, "warn");
            return;
          }
          const stored = findOrder(editing.id);
          if (stored) {
            Object.assign(editing, {
              status: stored.status, cancelReason: stored.cancelReason, cancelFee: stored.cancelFee,
              canceledAt: stored.canceledAt, history: stored.history,
            });
          }
          baseline = { ...editing }; // 작성 중이던 수정도 방금 함께 저장됐다
          unsaved = ""; unsavedTip = "";
          if (stored) s0 = settleOf(stored); // 그 달 금액에서 이 주문이 빠졌다 · 금액 칸의 '명세서 나감' 안내도 걷힌다
          refreshList();
          refreshAmtBox();
          syncDirty(); renderHd(); renderSum(); renderHist();
          toast("주문을 취소 처리했습니다", "warn");
        },
      });
    });
    imgBox.bind(panel, () => { renderHd(); renderSum(); syncDirty(); });
    on(panel, "click", "[data-action='pick-manager']", () => openManagerModal());
    /* 'M월 정산' 줄 → 관리자 정산회계의 그 거래처 · 그 달(1회 전달 — session.js). 받는 쪽(admin-settlement)이
       그 달로 옮기고 그 거래처 줄을 펼친다. ⚠️ 저장 안 한 수정이 있으면 떠나지 않는다 — 화면을 옮기면 라우터가
       창을 닫아(closeAllModals) 고친 내용이 사라진다(포털 회사정보 수정의 '정산 담당 › 변경' 과 같은 규칙). */
    on(panel, "click", "[data-action='go-settle']", () => {
      if (!editing) return;
      if (dirtyCount()) { toast("저장하지 않은 수정이 있습니다 · 저장한 뒤 정산회계로 이동하세요", "warn"); return; }
      const ym = s0 ? s0.period : ymOf(editing.deliverAt); // 저장된 달로 보낸다(줄의 라벨과 같은 달)
      if (!ym || !editing.clientId) return;
      setFocusClient("admin-settlement", editing.clientId);
      setFocusSection("admin-settlement", `period:${ym}`);
      nav("#/admin/settlement");
    });
    on(panel, "input", "input[data-f], textarea[data-f]", (e, t) => {
      if (!editing) return;
      const k = t.dataset.f;
      if (k === "amount") {
        const n = readWonInput(t);
        if (n === null) return; /* 거부 — 잘못 읽힌 수가 저장되는 것보다 낫다 */
        editing.amount = n;
        /* 요약 'M월 정산' 줄의 금액은 아래 syncDirty → syncSettleRow 가 제자리에서 바꾼다(줄을 다시 그리면 aria-live 가 안 읽힌다). */
      } else editing[k] = k === "recipientPhone" ? onPhoneInput(t) : t.value;
      if (t.tagName === "TEXTAREA") autosize(t);
      if (k === "receiver" || k === "image") renderHd();
      /* 받는분 줄은 지금 이름·번호로 보낸다(명세 5.3 규칙 1) — 알림 수신 칸이 그 자리에서 따라온다 */
      if (k === "recipientName" || k === "recipientPhone") syncNotify();
      if (k === "ordererName") syncReqPhone(); // 연락처는 이 칸에 적힌 사람의 번호다
      syncDirty();
    });
    on(panel, "focusout", "input[data-f='amount']", (e, t) => { if (editing) { putAmt(t, editing.amount); linkAmtWhy(); } });
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

  /* ── 다른 화면이 넘겨준 '이 거래처 · 이 달 주문' (관리자 정산회계 줄 펼침의 '이 거래처 · M월 주문 보기') ──
     session.js 의 1회 전달 두 개를 받는다 — takeFocusClient("orders") = 거래처 id,
     takeFocusSection("orders") = "deliver:YYYY-MM". 거래처는 정확히 그 하나로(state.clientId — 검색칸에도 이름을 보인다),
     날짜 기준은 **배송일**(정산 달 = 배송일의 달, 2026-10-15), 기간은 그 달 1일~말일. 상태 탭은 '전체'로 연다 —
     정산 금액은 상태로 거르지 않는다(접수대기·주문접수·배송완료 모두 든다). 꺼내면 지워지므로 새로고침하면 평소 화면이다. */
  (function takeFocus() {
    const cid = takeFocusClient("orders");
    const sec = takeFocusSection("orders");
    const m = /^deliver:(\d{4})-(\d{2})$/.exec(sec || "");
    const c = cid ? clients().find((x) => x.id === cid) : null;
    if (c) {
      state.clientId = c.id;
      state.qClient = displayName(c, sharedBizKeys(clients()));
      state.detailOpen = true; // 거래처 검색칸이 상세 필터 안에 있다 — 무엇으로 걸렀는지 보이게 편다
    }
    if (m) {
      state.dateBasis = "deliver";
      state.dateQuick = "custom";
      state.dateStart = `${m[1]}-${m[2]}-01`;
      state.dateEnd = formatDateLabel(new Date(Number(m[1]), Number(m[2]), 0));
    }
    if (c || m) state.tab = "all";
  })();

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
  /* ⚠️ 필터 버튼은 이제 누른 뒤에도 초점을 지키므로 Enter 를 누른 채로 두면 자동 반복 keydown 마다 같은 버튼이 다시 눌린다 —
     사진·알림 칩과 '상세 필터' 는 반복 수만큼 켜졌다 꺼졌고(실측), 탭·세그먼트는 같은 값이라도 반복마다 표(수백 줄)를 다시 그렸다.
     반복 keydown 의 Enter 를 버린다 — 떼었다 다시 누르면 그대로 눌린다(거래처 목록 묶음 줄 · 담당자 설정 토글과 같은 처리).
     Space 는 뗄 때 한 번만 눌려 해당 없다. ⚠️ 기간 달력 안('이전 달'·'다음 달')은 뺀다 — 꾹 눌러 여러 달을 넘기는 것은 예전부터
     되던 동작이고 초점도 그대로다(2026-10-19 검토 실측: 반복 6번에 10월 → 3월, 막으면 9월에서 멈췄다). 날짜 칸은 첫 누름에 달력이 닫힌다. */
  const offKey = on(root, "keydown", "[data-slot='filters'] button", (e, t) => {
    if (e.repeat && e.key === "Enter" && !t.closest(".cal-panel")) e.preventDefault();
  });
  /* 검색은 필터 카드를 재렌더하지 않는다 — 입력 포커스가 날아간다 */
  /* 행 아무 데나 눌러도 열린다 — 연필은 같은 일을 하는 명시적 버튼으로 남는다 */
  const offRow = onRowOpen(root, (id) => { const o = findOrder(id); if (o) openEditor(o, false); });
  const offSearch = on(root, "input", "[data-search]", (e, t) => {
    state[t.dataset.search] = t.value;
    /* 넘겨받은 '정확히 이 거래처' 조건은 사람이 거래처 검색칸을 고치는 순간 푼다 — 그 뒤로는 보이는 글자가 조건이다. */
    if (t.dataset.search === "qClient") state.clientId = "";
    refreshTableOnly();
  });

  return () => {
    alive = false;
    offList(); offRow(); offKey();
    offSearch();
    dateRange.destroy();
    closeModal();
    toast.destroy();
  };
}
