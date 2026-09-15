/* ============================================================
   admin-orders.js — 거래처 주문관리 (#/admin/orders)

   구 시스템 '거래처 주문 조회(202)' 의 신규 대응 화면. B2C 통합주문관리와
   나눈 이유: 같은 화환을 팔지만 운영 절차가 다르다.
     ─ 주문자가 익명 개인(B2C) vs 거래처 소속 담당자(B2B)
     ─ 건별 결제 vs 월 후불 정산(귀속월이 붙는다)
     ─ 카탈로그 정가 vs 거래처별 적용 단가
   한 표에 합치면 열의 절반이 한쪽에서 영구히 "—" 가 된다.

   ⚠️ 거래처 참고사항(clientNote)은 메모가 아니라 거래 조건이다. 모달 최상단에
      경고 배너로 띄운다 — 빠지면 주문마다 사고가 난다((주)홈팩: 무조건 특대).

   데이터는 data/b2b-mock.js(세션 유지). 페이지 규약: mount(root, { nav }) → cleanup.
   ============================================================ */
import { html, setHTML, on, qs } from "../dom.js";
import { makeToast } from "../toast.js";
import { icon } from "../icons.js";
import { store } from "../store.js";
import { pageTitle, tableGrid, openModal } from "../ui.js";
import { getDateRange, parseOrderDate } from "../util/date.js";
import { sharedBizKeys, displayName } from "../util/biz.js";
import { openCancelModal } from "../util/cancel-modal.js";
import { B2C_STATUS_STYLE } from "../data/b2c-mock.js";
import { B2B_STATUSES, b2bList, b2bFind, b2bSetStatus, b2bUpsert } from "../data/b2b-mock.js";

const won = (n) => Number(n || 0).toLocaleString("ko-KR") + "원";
const dash = (v) => (v != null && String(v).trim() ? v : "-");

const TABS = [{ v: "all", label: "전체" }, ...B2B_STATUSES.map((s) => ({ v: s, label: s }))];
const QUICK_DATES = ["오늘", "어제", "내일", "이번 달", "지난 달"];

/* 상태 색은 B2C 와 같은 단일 맵을 쓴다 — 두 화면에서 같은 상태가 다른 색이면
   담당자가 화면마다 다시 학습해야 한다. */
const statusBadge = (s) => {
  const st = B2C_STATUS_STYLE[s] ?? { bg: "var(--c-surface-3)", color: "var(--c-text-4)" };
  return html`<span class="hm-badge" style="background:${st.bg};color:${st.color}">${s}</span>`;
};

/** "YYYY/MM/DD HH:mm" → 귀속월 라벨 "2026년 09월" (정산 기준월). */
function periodLabel(dateStr) {
  const d = parseOrderDate(dateStr);
  return `${d.getFullYear()}년 ${String(d.getMonth() + 1).padStart(2, "0")}월`;
}

export function mount(root, { nav }) {
  const state = { tab: "all", date: "이번 달", qClient: "", qSender: "", qAddress: "" };
  let activeModal = null;
  const toast = makeToast();
  const closeModal = () => { if (activeModal) { activeModal.close(); activeModal = null; } };

  /* 거래처 조회는 store 에서 매번 — 거래처명을 고치면 주문 목록도 따라온다. */
  const clientOf = (o) => store.get().clients.find((c) => c.id === o.clientId) || null;
  const clientName = (o) => {
    const c = clientOf(o);
    return c ? displayName(c, sharedBizKeys(store.get().clients)) : "(삭제된 거래처)";
  };

  function filtered() {
    const [s, e] = getDateRange(state.date);
    return b2bList().filter((o) => {
      if (state.tab !== "all" && o.status !== state.tab) return false;
      const d = parseOrderDate(o.date);
      if (d < s || d > e) return false;
      if (state.qClient && !clientName(o).includes(state.qClient)) return false;
      if (state.qSender && !o.sender.includes(state.qSender)) return false;
      if (state.qAddress && !o.address.includes(state.qAddress)) return false;
      return true;
    });
  }

  const columns = [
    { label: "주문일시", width: "132px", render: (r) => html`<span class="ord-mono">${r.date}</span>` },
    {
      label: "거래처", width: "1fr",
      render: (r) => html`<div class="ellipsis" title="${clientName(r)}">${clientName(r)}${clientOf(r)?.clientNote ? html`<span class="ao-note" title="거래 조건 있음">!</span>` : ""}</div>`,
    },
    { label: "발송인", width: "104px", render: (r) => html`<div class="ellipsis">${dash(r.sender)}</div>` },
    { label: "배송지", width: "1.4fr", render: (r) => html`<div class="ellipsis ord-dim" title="${r.address}">${dash(r.address)}</div>` },
    { label: "상품", width: "128px", render: (r) => html`<div class="ellipsis">${dash(r.product)}</div>` },
    { label: "금액", width: "94px", align: "right", render: (r) => html`<span class="ord-amt">${won(r.amount)}</span>` },
    { label: "현황", width: "92px", align: "center", render: (r) => statusBadge(r.status) },
    {
      label: "관리", width: "56px", align: "center",
      render: (r) => html`<button class="ptbl-edit" data-action="open" data-id="${r.id}" aria-label="주문 상세">${icon("pencil", { size: 14 })}</button>`,
    },
  ];

  const srchBox = (key, label, ph) => html`
    <div class="bf-srch bf-srch--grow">
      ${icon("search", { size: 13, cls: "bf-srch__ic" })}
      <span class="bf-srch__lbl">${label}</span>
      <span class="bf-srch__dv"></span>
      <input type="text" data-search="${key}" value="${state[key]}" placeholder="${ph}" />
    </div>`;

  function tabsBody() {
    const all = b2bList();
    return TABS.map((t) => {
      const n = t.v === "all" ? all.length : all.filter((o) => o.status === t.v).length;
      return html`<button class="bf-tab ${state.tab === t.v ? "is-active" : ""}" data-action="tab" data-v="${t.v}">${t.label}<span class="bf-tab__cnt">${n}</span></button>`;
    });
  }
  const tableBody = () => {
    const rows = filtered();
    if (rows.length === 0) return html`<div class="admin-empty">조건에 맞는 주문이 없습니다.</div>`;
    return tableGrid({ columns, rows, compact: true, rowKey: (r) => r.id });
  };
  const summaryBody = () => html`조회 <strong>${filtered().length}</strong>건`;

  function render() {
    setHTML(
      root,
      html`
        <div class="page-admin">
          <div class="admin-inner">
            ${pageTitle({
              imgSrc: "./assets/nav-realtime.png",
              title: "거래처 주문관리",
            })}
            <div class="bf-card">
              <div class="bf-row bf-row--tabs">
                <div class="bf-tabs" data-slot="tabs">${tabsBody()}</div>
                <span class="bf-flow">접수대기 → 주문접수 → 배송완료</span>
              </div>
              <div class="bf-row bf-row--main">
                <span class="bf-lbl">기간</span>
                <div class="bf-seg">
                  ${QUICK_DATES.map((v) => html`<button class="bf-seg__btn ${state.date === v ? "is-sel" : ""}" data-action="date" data-v="${v}">${v}</button>`)}
                </div>
                <span class="bf-vdiv"></span>
                ${srchBox("qClient", "거래처", "회사명·부서")}
              </div>
              <div class="bf-row bf-row--main">
                ${srchBox("qSender", "발송인", "발송인 성함·부서")}
                ${srchBox("qAddress", "배송지", "배송지 주소")}
              </div>
            </div>
            <p class="admin-summary" data-slot="summary">${summaryBody()}</p>
            <div data-slot="table">${tableBody()}</div>
          </div>
        </div>
      `
    );
  }

  /* 검색은 탭 카운트(전체 목록 기준)에 영향이 없다 → 표·요약만 갱신.
     admin-b2c·admin-clients 의 refreshTableOnly 와 같은 이름·같은 구조. */
  const refreshTableOnly = () => {
    const sum = qs(root, "[data-slot='summary']");
    const tbl = qs(root, "[data-slot='table']");
    if (sum) setHTML(sum, summaryBody());
    if (tbl) setHTML(tbl, tableBody());
  };
  const refreshList = () => {
    const tabs = qs(root, "[data-slot='tabs']");
    if (tabs) setHTML(tabs, tabsBody());
    refreshTableOnly();
  };

  // ── 주문 상세 모달 (읽기 우선 — B2C 시안 C 규약과 동일) ──
  function openOrderModal(id) {
    closeModal();
    const o = b2bFind(id);
    if (!o) return;
    const c = clientOf(o);
    const draft = { receiver: o.receiver || "", memo: o.memo || "" };

    const rowsHtml = () => html`
      <div class="ao-row"><span class="ao-row__k">거래처</span><b class="ao-row__v">${clientName(o)}</b></div>
      <div class="ao-row"><span class="ao-row__k">주문번호</span><b class="ao-row__v">${o.orderNo}</b></div>
      <div class="ao-row"><span class="ao-row__k">주문일시</span><b class="ao-row__v">${o.date}</b></div>
      <div class="ao-row"><span class="ao-row__k">정산 귀속</span><b class="ao-row__v">${periodLabel(o.date)}</b></div>
      <div class="ao-row"><span class="ao-row__k">발송인</span><b class="ao-row__v">${dash(o.sender)}</b></div>
      <div class="ao-row"><span class="ao-row__k">배송지</span><b class="ao-row__v">${dash(o.address)}</b></div>
      <div class="ao-row"><span class="ao-row__k">주문상품</span><b class="ao-row__v">${dash(o.product)}</b></div>
      <div class="ao-row"><span class="ao-row__k">적용 단가</span><b class="ao-row__v">${won(o.amount)}</b></div>
      <div class="ao-row"><span class="ao-row__k">요청사항</span><b class="ao-row__v">${dash(o.request)}</b></div>
      ${o.status === "취소" ? html`
        <div class="ao-row"><span class="ao-row__k">취소 사유</span><b class="ao-row__v">${dash(o.cancelReason)}</b></div>
        <div class="ao-row"><span class="ao-row__k">취소 수수료</span><b class="ao-row__v">${won(o.cancelFee)}</b></div>` : ""}
    `;

    const body = html`
      <div class="hm__head">
        <div>
          <h3>주문 상세</h3>
          <p>${clientName(o)} · ${o.orderNo}</p>
        </div>
        <button class="hm__x" data-action="close" aria-label="닫기">${icon("x", { size: 14 })}</button>
      </div>
      <div class="hm__body">
        ${c && c.clientNote ? html`
          <div class="hm-warn ao-note-box">
            <span><b>거래 조건</b><br />${c.clientNote}</span>
          </div>` : ""}
        <div data-slot="rows">${rowsHtml()}</div>
        <div class="hm-section">처리</div>
        <div class="hm-field">
          <label for="ao-receiver">인수자</label>
          <input class="hm-input" id="ao-receiver" data-ao="receiver" type="text" value="${draft.receiver}" placeholder="현장에서 수령한 분" />
        </div>
        <div class="hm-field">
          <label for="ao-memo">처리 메모</label>
          <input class="hm-input" id="ao-memo" data-ao="memo" type="text" value="${draft.memo}" placeholder="배송·응대 기록" />
        </div>
      </div>
      <div class="hm__foot">
        <button class="hm-btn hm-btn--secondary" data-action="close">닫기</button>
        <button class="hm-btn hm-btn--secondary" data-action="status" data-v="주문접수" ${o.status === "접수대기" ? "" : "disabled"}>주문접수 처리</button>
        <button class="hm-btn hm-btn--danger" data-action="cancel" ${o.status === "취소" ? "disabled" : ""}>${o.status === "취소" ? "취소됨" : "주문취소"}</button>
        <button class="hm-btn hm-btn--primary" data-action="save">저장</button>
      </div>
    `;
    activeModal = openModal({ panelClass: "modal-panel--lg", body });

    on(activeModal.panel, "input", "[data-ao]", (e, t) => { draft[t.dataset.ao] = t.value; });
    on(activeModal.panel, "click", "[data-action='close']", () => closeModal());
    on(activeModal.panel, "click", "[data-action='status']", (e, t) => {
      b2bSetStatus(o.id, t.dataset.v);
      refreshList();
      setHTML(qs(activeModal.panel, "[data-slot='rows']"), rowsHtml());
      t.disabled = true;
      toast(`${t.dataset.v} 처리했습니다`);
    });
    on(activeModal.panel, "click", "[data-action='cancel']", (e, t) => {
      if (o.status === "취소") return;
      openCancelModal({
        orderNo: o.orderNo, amount: o.amount, settle: true,
        onConfirm: ({ reason, fee }) => {
          const next = { ...o, status: "취소", cancelReason: reason, cancelFee: fee };
          b2bUpsert(next);
          Object.assign(o, next);
          refreshList();
          setHTML(qs(activeModal.panel, "[data-slot='rows']"), rowsHtml());
          t.disabled = true;
          t.textContent = "취소됨";
          toast("주문을 취소 처리했습니다", "warn");
        },
      });
    });
    on(activeModal.panel, "click", "[data-action='save']", () => {
      /* 주문접수 + 인수자 입력 = 배송완료 자동 전환(B2C 규약과 동일한 판정). */
      const next = { ...o, receiver: draft.receiver.trim(), memo: draft.memo.trim() };
      if (next.status === "주문접수" && next.receiver) { next.status = "배송완료"; next.hasPhoto = true; }
      b2bUpsert(next);
      Object.assign(o, next);
      refreshList();
      setHTML(qs(activeModal.panel, "[data-slot='rows']"), rowsHtml());
      toast(next.status === "배송완료" ? "저장 · 배송완료로 전환했습니다" : "저장했습니다");
    });
  }

  render();

  const offs = [
    on(root, "click", "[data-action='tab']", (e, t) => { state.tab = t.dataset.v; refreshList(); }),
    on(root, "click", "[data-action='date']", (e, t) => {
      state.date = t.dataset.v;
      const seg = qs(root, ".bf-seg");
      if (seg) [...seg.children].forEach((b) => b.classList.toggle("is-sel", b.dataset.v === state.date));
      refreshTableOnly();
    }),
    on(root, "input", "[data-search]", (e, t) => { state[t.dataset.search] = t.value; refreshTableOnly(); }),
    on(root, "click", "[data-action='open']", (e, t) => openOrderModal(t.dataset.id)),
  ];

  return () => {
    offs.forEach((off) => off());
    closeModal();
    toast.destroy();
  };
}
