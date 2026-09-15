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
import { pageTitle, tableGrid, openModal, makeDropdown } from "../ui.js";
import { getDateRange, formatDateLabel } from "../util/date.js";
import { openCancelModal } from "../util/cancel-modal.js";
import {
  won, pad2, dash, fmtFull, joinVals, parseFlexDate, statusBadge, tabDefs,
  tabBtn, filterCard, makeDateRange,
  dateCell, photoFlag, notiFlag, amtCell, editBtn,
  zone, docRow, ddField, txtField, makeImageBox, railBody as railOf,
  managerControl, openStaffPicker,
} from "../util/order-screen.js";
import {
  staffNames, B2C_CHANNELS, B2C_STATUSES, B2C_PRODUCTS, B2C_RIBBON_PHRASES,
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
  let mode = "read";       // "read" | "edit" — 좌측 본문 렌더 모드
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
    return tableGrid({ columns, rows, rowKey: (r) => r.id, compact: true });
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

  /* ══ 모달 — 읽기 우선(시안 C) ═══════════════════════════ */



  /* ── 헤더: 주문번호 강조 + 상태 배지 + 메타(+담당자 컨트롤) + [내용 수정] 토글 ── */
  function headInner() {
    const o = editing;
    if (isNew) {
      return html`
        <div class="ord-head__main">
          <div class="ord-head__row"><h3 class="ord-head__no">신규 B2C 주문 등록</h3></div>
          <p class="ord-head__meta"><span class="ord-mono">${o.orderNo}</span> · 주문접수 ${o.receivedAt} · ${managerControl(editing?.manager)}</p>
        </div>
        <div class="ord-head__acts">
          <button class="hm__x" data-action="close" aria-label="닫기">${icon("x", { size: 14 })}</button>
        </div>
      `;
    }
    return html`
      <div class="ord-head__main">
        <div class="ord-head__row">
          <h3 class="ord-head__no ord-mono">${o.orderNo}</h3>
          ${statusBadge(o.status)}
        </div>
        <p class="ord-head__meta">${o.channel} · 주문접수 ${o.receivedAt} · ${managerControl(editing?.manager)}</p>
      </div>
      <div class="ord-head__acts">
        <button class="hm-btn hm-btn--secondary ord-editbtn" data-action="toggle-edit">
          ${mode === "edit" ? html`${icon("x", { size: 13 })} 수정 취소` : html`${icon("pencil", { size: 13 })} 내용 수정`}
        </button>
        <button class="hm__x" data-action="close" aria-label="닫기">${icon("x", { size: 14 })}</button>
      </div>
    `;
  }

  /* ── 읽기 모드: 구역 카드(주문정보 / 발주정보 / 요청사항) + 큰 정의행 ── */
  function readBody() {
    const o = editing;
    const row = docRow;
    return html`
      <div class="ord-doc">
        ${zone("주문정보", html`
          ${row("주문자", joinVals(" · ", o.ordererName, o.ordererPhone))}
          ${row("주문상품", dash(o.product))}
          ${row("주문금액", won(o.amount), "ord-doc__v--price")}
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
      </div>
    `;
  }

  /* ── 편집 모드: 읽기와 동일한 구역(주문정보/발주정보/요청사항) 안에 표준 폼 ── */
  function editBody() {
    const o = editing;
    return html`
      <div class="ord-edit">
        ${zone("주문정보", html`
          <div class="ord-form">
            ${txtField("주문자 성함", "ordererName", editing.ordererName, { placeholder: "예) 홍길동", req: true })}
            ${txtField("주문자 연락처", "ordererPhone", editing.ordererPhone, { placeholder: "010-0000-0000", inputmode: "numeric" })}
            ${ddField("주문상품", "product", { req: true })}
            ${txtField("주문금액 (원)", "amount", editing.amount, { type: "number", min: 0, inputmode: "numeric" })}
            <div class="ord-form__full">${ddField("주문경로/거래처", "channel")}</div>
          </div>
        `)}
        ${zone("발주정보", html`
          <div class="ord-form ord-form--3">
            ${txtField("배송일시", "deliverAt", editing.deliverAt, { type: "datetime-local" })}
            ${txtField("받는분 성함", "recipientName", editing.recipientName, { placeholder: "예) 故 김○○" })}
            ${txtField("받는분 연락처", "recipientPhone", editing.recipientPhone, { placeholder: "010-0000-0000", inputmode: "numeric" })}
            <div class="hm-field ord-form__full">
              <label>배송지 주소</label>
              <textarea class="hm-input hm-textarea" data-f="address" placeholder="배송지 주소를 입력하세요">${o.address ?? ""}</textarea>
            </div>
            <div class="ord-form__pair">
              ${txtField("리본문구 (경조사어)", "ribbonPhrase", editing.ribbonPhrase, { placeholder: "예) 삼가 고인의 명복을 빕니다", list: "ord-phrases" })}
              ${txtField("보내는분 (리본)", "ribbonSender", editing.ribbonSender, { placeholder: "예) 홍길동 · ○○회사 임직원 일동" })}
            </div>
          </div>
        `)}
        ${zone("요청사항", html`
          <textarea class="hm-input hm-textarea" data-f="request" placeholder="고객이 남긴 요청사항">${o.request ?? ""}</textarea>
        `)}
        <datalist id="ord-phrases">${B2C_RIBBON_PHRASES.map((p) => html`<option value="${p}"></option>`)}</datalist>
      </div>
    `;
  }

  /* 현장사진 박스 — 업로드·다운로드·라이트박스 로직 일체 (공용) */
  const imgBox = makeImageBox({ get: () => editing, toast });

  /* 처리 레일 — 신규 등록은 레일 없이 1열 중앙 폼 */
  const railBody = () => (isNew ? "" : railOf({ order: editing, imgInner: imgBox.inner() }));

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
      <button class="hm-btn ord-delbtn" data-action="delete">${icon("trash2", { size: 14 })} 주문서 삭제</button>
      <button class="hm-btn ord-cancelbtn" data-action="order-cancel" ${cancelled ? "disabled" : ""}>${cancelled ? "취소됨" : "주문취소"}</button>
      ${o.status === "접수대기" ? html`<button class="hm-btn ord-acceptbtn" data-action="accept">${icon("check", { size: 14 })} 주문접수 처리</button>` : ""}
      <button class="hm-btn hm-btn--primary" data-action="save">${icon("save", { size: 14 })} 저장</button>
      <button class="hm-btn hm-btn--secondary" data-action="close">닫기</button>
    `;
  }

  function modalBody() {
    return html`
      <div class="hm__head ord-head" data-slot="head">${headInner()}</div>
      <div class="hm__body ord-body ${isNew ? "ord-body--new" : ""}">
        <div class="ord-main">${mode === "edit" ? editBody() : readBody()}</div>
        ${railBody()}
      </div>
      <div class="hm__foot ord-foot" data-slot="foot">${footInner()}</div>
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

  /* ── 담당자 지정 — 메인 위에 스택되는 공용 모달.
     API 자동등록 주문은 담당자 미지정으로 도착 → 열면 이 창이 우선 뜸다.
     지정은 즉시 반영(b2cSetManager). 폼/레일의 다른 미저장 편집은 건드리지 않는다. */
  function openManagerModal(mainPanel) {
    if (!editing) return;
    openStaffPicker({
      current: editing.manager,
      names: staffNames,
      toast,
      onPick: (v) => {
        if (!editing) return false;
        editing.manager = v;
        b2cSetManager(editing.id, v);
        refreshList();
        if (mainPanel) renderSlots(mainPanel); // 헤더 담당자 표시 갱신(편집 중이면 바디 보존)
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
    /* 주문취소 — 사유·수수료를 받고 반영한다. 구 시스템에서 필수 필드였고
       신규는 입력란만 없어서 값이 영원히 비어 있었다. 재취소 방지 위해 완료 후 비활성 */
    on(panel, "click", "[data-action='order-cancel']", () => {
      if (!editing || editing.status === "취소") return;
      openCancelModal({
        orderNo: editing.orderNo,
        amount: editing.amount,
        onConfirm: ({ reason, fee }) => {
          editing.status = "취소";
          editing.cancelReason = reason;
          editing.cancelFee = fee;
          b2cUpsert({ ...editing });
          b2cSetStatus(editing.id, "취소");
          refreshList();
          renderSlots(panel);
          toast("주문을 취소 처리했습니다", "warn");
        },
      });
    });
    imgBox.bind(panel); // 업로드·다운로드·라이트박스 위임 일체
    on(panel, "click", "[data-action='pick-manager']", () => openManagerModal(panel));
    on(panel, "input", "input[data-f], textarea[data-f]", (e, t) => {
      if (!editing) return;
      const k = t.dataset.f;
      editing[k] = k === "ordererPhone" || k === "recipientPhone" ? formatPhone(t) : t.value;
    });
    /* API 자동등록(담당자 미지정) 주문을 열면 담당자 지정 모달을 우선 노출 */
    if (!isNew && !editing.manager) openManagerModal(panel);
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
