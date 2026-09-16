/* ============================================================
   admin-clients.js — 거래처 정보관리
   상단 필터(상태 탭 + 검색) · 가입 승인/거부 워크플로 · 상세/수정/생성/삭제.
   store.clients(영속). 모달은 HModal 규격(hm-field/hm-btn) + 커스텀 드롭다운.
   ============================================================ */
import { html, setHTML, on, qs, qsa } from "../dom.js";
import { makeToast } from "../toast.js";
import { icon } from "../icons.js";
import { store, MSG_RECEIVE, MSG_NONE, newContactId } from "../store.js";
import { pageTitle, tableGrid, openModal, simpleModal, makeDropdown, openLightbox } from "../ui.js";
import { autosize, openDeleteConfirm } from "../util/order-screen.js";
import { attachmentOf, fileSizeLabel } from "../util/image.js";
import { INVOICE_DAYS, CLIENT_CHANNELS } from "../data/admin-mock.js";
import { normalizeBiz, sharedBizKeys } from "../util/biz.js";
import { formatDateLabel } from "../util/date.js";
import { ensurePostcode, openPostcode } from "../util/postcode.js";
import { openContactsModal } from "../util/contacts-modal.js";

const STATUS_OPTS = ["활성", "승인대기", "정지", "반려"];
/* 구 시스템 계약체결 리스트(302)의 '계약요청유형'. 별도 화면 대신 거래처 레코드에
   붙였다 — 승인대기 탭이 이미 파이프라인 역할을 하므로 화면을 하나 더 두지 않는다. */
const SALES_ROUTES = ["미지정", "우체국 문서발송", "업체 방문영업", "SNS", "셀프 가입", "지인 소개", "기타"];
const TABS = [
  { value: "all", label: "전체" },
  { value: "활성", label: "활성" },
  { value: "승인대기", label: "승인대기" },
  { value: "정지", label: "정지" },
  { value: "반려", label: "반려" },
];

/* ── 필드 서술자 — 시안의 원장 카드 단위로 나눈다 ──────────────
   서술자: { k, label, req, type, ph, options, ddLabel, help, num, find }
   type: (없음)=text · select · seg · textarea · attach · static
   ⚠️ `managerName`·`contact` 는 **없앴다**(시안). 이관 실데이터 19곳 전부 비어 있었고,
      연락 주체는 담당자 저장공간으로 일원화된다. `accountId`·`password` 는 레일,
      `status` 는 헤더 pill 로 옮겼다. */
const CARD_COMPANY = [
  { k: "companyName", label: "회사명", req: true },
  { k: "bizNumber", label: "사업자번호", req: true, num: true, biz: true },
  { k: "ceoName", label: "대표자명", req: true, ph: "사업자등록증 기준" },
  /* '부서·직위'가 아니라 **계정 구분**이다 — 같은 사업자번호를 가르는 라벨.
     실데이터도 그 용도로 쓰고 있다(법무법인 세종 C008 '김동선 변호사' / C015 '이병한 변호사'). */
  { k: "department", label: "계정 구분", hint: true, ph: "예) 김동선 변호사 · 총무팀" },
  { k: "address", label: "사업장주소", find: true },
];
const CARD_BILL = [
  /* 아래로 연다 — 카드 첫 줄이라 위 공간이 113px 뿐이고 패널은 240px 다(유입 경로는 반대) */
  { k: "invoiceDay", label: "발급일", type: "select", down: true, options: () => INVOICE_DAYS, ddLabel: (v) => `매월 ${v}일` },
  { k: "email", label: "계산서 이메일", ph: "세금계산서 수신 주소" },
  { type: "static", label: "정산 일정" },
  { k: "channel", label: "매출 채널", type: "seg", options: CLIENT_CHANNELS,
    help: "'일반' 외 채널은 대쉬보드에서 B2B 합계와 분리해 자기 매출 카드를 갖습니다." },
];
const CARD_SALES = [
  { k: "bizLicense", label: "사업자등록증", type: "attach" },
  { k: "joinDate", label: "가입일", num: true },
  { k: "salesRoute", label: "유입 경로", type: "select", options: () => SALES_ROUTES },
  { k: "salesDate", label: "영업·요청일", num: true, ph: "2025-06-20" },
  { k: "salesMemo", label: "영업 메모", type: "textarea", ph: "예) 3월 방문 상담, 경조화환 월 20건 예상" },
];
/** 저장 게이트 — [키, 사람이 읽을 이름]. 중복 사업자번호가 있으면 계정 구분이 여기 붙는다. */
const REQUIRED = [["companyName", "회사명"], ["bizNumber", "사업자번호"], ["ceoName", "대표자명"]];

/* 상태 점 색 — 화면마다 다르면 같은 상태를 다시 배워야 한다(주문 ORDER_STATUS_STYLE 과 같은 취지) */
const STATUS_DOT = {
  "활성": "var(--c-success-ink)",
  "승인대기": "var(--c-warn-soft-ink)",
  "정지": "var(--c-danger-ink)",
  "반려": "var(--c-text-4)",
};

/** 사업자번호 입력 정형 — 숫자만 남겨 `###-##-#####` 로. 10자리를 넘기지 않는다. */
function fmtBiz(v) {
  const d = String(v || "").replace(/\D/g, "").slice(0, 10);
  if (d.length > 5) return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
  if (d.length > 3) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return d;
}
/** 그 달의 말일 — 정산기한 문구에 쓴다(윤년 포함, 하드코딩 금지). **m 은 0-based** 다. */
const monthEnd = (y, m) => new Date(y, m + 1, 0).getDate();

/** 그 거래처에 등록된 담당자 수 — 목록 배지와 다이얼로그 제목이 같이 읽는다. */
const contactCount = (id) => store.contactsOf(id).length;

/** 거래처 삭제 확인의 문구 — **모달 안(⋯ 메뉴)과 목록이 같은 말을 해야 한다.**
    예전엔 호출부가 둘인데 문구를 각자 넘겨, 한쪽만 고치면 조용히 갈렸다
    (실제로 제목이 `주문서를 삭제할까요?` 인 채로 남아 거래처를 지울 때도 그렇게 물었다). */
const deleteCopy = (client) => ({
  eyebrow: client.accountId || client.companyName,
  title: `${client.companyName} 거래처를 삭제할까요?`,
  desc: html`계정(아이디·비밀번호)·정산·주문 정보가 모두 삭제되며 되돌릴 수 없습니다.
    거래를 멈추는 것이라면 삭제 대신 <b>정지</b>를 사용하세요.`,
});

/** 정산 일정 안내문 — 초기 렌더와 부분 갱신이 **같은 문장**을 쓰게 한 곳에 둔다.
    사본이 둘이던 때, 발급일 드롭다운을 건드리는 순간 두 문장이 갈렸다.
    ⚠️ `monthEnd` 는 0-based 월을 받는다. `getMonth() + 1` 을 넘겨 **다음 달** 말일이
       나오던 결함이 있었다(2026-09 에 31일 = 10월). 규약은 "정산기한 = 그 발행일이
       속한 달의 말일" 이므로 이번 달이 맞다. */
function invoiceHelpText(invoiceDay) {
  const day = Number(invoiceDay) || 1;
  const now = new Date();
  return `매월 ${day}일에 전월 귀속 거래명세서·계산서가 발급되고, `
    + `정산기한은 그 발급일이 속한 달의 말일(최대 ${monthEnd(now.getFullYear(), now.getMonth())}일)입니다.`;
}

const PILL = { "활성": "pill--success", "승인대기": "pill--warn", "정지": "pill--danger", "반려": "pill--gray" };
const statusPill = (s) => html`<span class="pill ${PILL[s] ?? "pill--gray"}">${s}</span>`;

/** 지금 시각 "오후 2:53" — 변경 이력·저장 표시에 쓴다(주문 모달과 같은 포맷). */
const nowHM = () => new Date().toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" });

function nextId(clients) {
  const max = clients.reduce((m, c) => Math.max(m, parseInt(String(c.id).replace(/\D/g, ""), 10) || 0), 0);
  return "C" + String(max + 1).padStart(3, "0");
}

export function mount(root, { nav }) {
  // expanded: 펼쳐 둔 사업자번호(정규화) 집합. 재렌더로 DOM이 통째로 갈리므로
  // 접힘 상태는 반드시 state 에서 읽는다(클래스 토글 방식은 검색 한 글자에 초기화됨).
  const state = { tab: "all", search: "", expanded: new Set() };
  let activeModal = null;
  let saveTimer = null;
  const toast = makeToast();

  function closeModal() {
    if (activeModal) { activeModal.close(); activeModal = null; }
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  }

  /** 자식 필드(계정 구분) 매칭 — 이 경우에만 그룹을 자동으로 펼친다.
      담당자명은 더 이상 거래처 레코드에서 관리하지 않으므로 검색 대상에서 뺐다. */
  const matchesChild = (c, q) => (c.department || "").includes(q);
  const matchesParent = (c, q) => c.companyName.includes(q) || c.bizNumber.includes(q);

  function filtered() {
    const q = state.search.trim();
    return store.get().clients.filter((c) => {
      if (state.tab !== "all" && c.status !== state.tab) return false;
      if (q && !(matchesParent(c, q) || matchesChild(c, q))) return false;
      return true;
    });
  }

  /* 표에 실제로 그릴 행 목록.
     같은 사업자번호를 2곳 이상이 쓰면 부모(그룹) + 자식(부서) 구조로 접는다.
     ─ 그룹 성립은 전체 목록 기준 → 필터로 1건만 남아도 '부서 N' 배지가 맥락을 준다.
     ─ 자식 필드에 검색이 걸리면 자동으로 펼친다(비매칭 형제는 filtered()에서 이미 탈락).
     ─ 부모 필드(회사명·사업자번호) 매칭은 형제 전원이 살아남으므로 펼치지 않는다.
       접힌 부모 한 줄이 더 정확한 요약이다. */
  function displayRows() {
    const q = state.search.trim();
    const shared = sharedBizKeys(store.get().clients);
    const rows = filtered();
    const out = [];
    const seen = new Set();
    let no = 0;

    rows.forEach((c) => {
      const key = normalizeBiz(c.bizNumber);
      if (!shared.has(key)) { out.push({ kind: "flat", key: c.id, client: c, no: String(++no).padStart(2, "0") }); return; }
      if (seen.has(key)) return;
      seen.add(key);
      const members = rows.filter((x) => normalizeBiz(x.bizNumber) === key);
      const total = store.get().clients.filter((x) => normalizeBiz(x.bizNumber) === key).length;
      const autoOpen = !!q && members.some((m) => matchesChild(m, q));
      const open = state.expanded.has(key) || autoOpen;
      const pno = String(++no).padStart(2, "0");
      out.push({ kind: "group", key, client: members[0], count: total, open, no: pno });
      if (open) members.forEach((m, i) => out.push({ kind: "child", key: m.id, client: m, no: `${pno}-${i + 1}` }));
    });
    return out;
  }

  const dash = html`<span class="cli-dash">—</span>`;
  const columns = [
    { label: "순번", width: "56px", align: "center", render: (r) => r.no },
    {
      label: "회사명", width: "1fr",
      render: (r) => {
        const c = r.client;
        if (r.kind === "group") {
          return html`<button type="button" class="cli-grp" data-action="grp" data-k="${r.key}" aria-expanded="${r.open ? "true" : "false"}">
            <span class="cli-grp__chev"></span>
            <b class="ellipsis">${c.companyName}</b>
            <span class="cli-badge">부서 ${r.count}</span>
          </button>`;
        }
        if (r.kind === "child") return html`<div class="cli-child ellipsis">${c.department || "계정 구분 없음"}</div>`;
        return html`<div class="ellipsis">${c.companyName}</div>`;
      },
    },
    { label: "사업자번호", width: "128px", align: "center", render: (r) => (r.kind === "child" ? dash : r.client.bizNumber) },
    { label: "대표자명", width: "84px", align: "center", render: (r) => (r.kind === "child" ? dash : r.client.ceoName) },
    /* 담당자·연락처 열은 뺐다 — 모달에서 더는 편집하지 않아 이관 19곳 전부 영구히
       빈 칸이 된다. 연락 주체는 거래처별 담당자 표로 일원화됐다. */
    { label: "계정 구분", width: "136px", align: "center", render: (r) => (r.kind === "group" ? dash : (r.client.department || dash)) },
    { label: "상태", width: "92px", align: "center", render: (r) => (r.kind === "group" ? dash : statusPill(r.client.status)) },
    { label: "가입일", width: "108px", align: "center", render: (r) => (r.kind === "group" ? dash : r.client.joinDate) },
    {
      label: "관리", width: "184px", align: "center",
      render: (r) => {
        if (r.kind === "group") return dash; // 개별 관리는 자식 행에서
        const c = r.client;
        /* 승인대기 행에도 상세를 연다 — 사업자등록증을 못 보고 승인하면 심사가 아니다. */
        return c.status === "승인대기"
          ? html`<div class="admin-rowact">
              <button class="tbl-edit" data-action="edit" data-id="${c.id}" aria-label="가입 정보 확인">${icon("search", { size: 14 })}</button>
              <button class="btn-approve" data-action="approve" data-id="${c.id}">승인</button>
              <button class="btn-reject" data-action="reject" data-id="${c.id}">거부</button>
            </div>`
          : html`<div class="admin-rowact">
              ${/* 담당자는 거래처 원장이 아니라 **별도 다이얼로그**에서 고친다(시안).
                   목록에서 바로 열 수 있어야 한다 — 담당자만 보러 원장을 열 이유가 없다.
                   배지는 등록 인원수, 0명이면 흐리게 두어 "비어 있다"가 보이게 한다. */ ""}
              <button class="tbl-users ${contactCount(c.id) ? "" : "is-empty"}" data-action="contacts" data-id="${c.id}"
                aria-label="${c.companyName} 담당자 관리" title="담당자 ${contactCount(c.id)}명">
                ${icon("users", { size: 14 })}<span class="tbl-users__n">${contactCount(c.id) || "0"}</span></button>
              <button class="tbl-edit" data-action="edit" data-id="${c.id}" aria-label="수정">${icon("pencil", { size: 14 })}</button>
              <button class="tbl-del" data-action="del" data-id="${c.id}" aria-label="삭제">${icon("trash2", { size: 14 })}</button>
            </div>`;
      },
    },
  ];

  function tableBody() {
    const rows = displayRows();
    if (rows.length === 0) return html`<div class="admin-empty">조건에 맞는 거래처가 없습니다.</div>`;
    return tableGrid({
      columns, rows, compact: true,
      rowKey: (r) => (r.kind === "group" ? `g:${r.key}` : r.key),
      rowClass: (r) => (r.kind === "group" ? "is-group" : r.kind === "child" ? "is-child" : ""),
    });
  }
  function summaryBody() {
    return html`조회 <strong>${filtered().length}</strong>개 거래처`;
  }
  function tabsBody() {
    const clients = store.get().clients;
    return TABS.map((t) => {
      const count = t.value === "all" ? clients.length : clients.filter((c) => c.status === t.value).length;
      const active = state.tab === t.value;
      const alert = t.value === "승인대기" && count > 0;
      return html`<button class="bf-tab ${active ? "is-active" : ""}" data-action="tab" data-v="${t.value}">${t.label}<span class="bf-tab__cnt ${alert ? "bf-tab__cnt--alert" : ""}">${count}</span></button>`;
    });
  }

  function render() {
    setHTML(
      root,
      html`
        <div class="page-admin">
          <div class="admin-inner">
            ${pageTitle({
              imgSrc: "./assets/nav-profile.png",
              title: "거래처 정보관리",
              action: html`<button class="btn btn-secondary" data-action="new">${icon("user-plus", { size: 14 })} 신규 거래처 등록</button>`,
            })}
            <div class="bf-card">
              <div class="bf-row bf-row--tabs">
                <div class="bf-tabs" data-slot="tabs">${tabsBody()}</div>
              </div>
              <div class="bf-row bf-row--main">
                <div class="bf-srch bf-srch--grow">
                  ${icon("search", { size: 13, cls: "bf-srch__ic" })}
                  <span class="bf-srch__lbl">거래처</span>
                  <span class="bf-srch__dv"></span>
                  <input type="text" data-search value="${state.search}" placeholder="회사명·사업자번호·담당자·부서 검색" />
                </div>
              </div>
            </div>
            <p class="admin-summary" data-slot="summary">${summaryBody()}</p>
            <div data-slot="table">${tableBody()}</div>
          </div>
        </div>
      `
    );
  }
  /* 검색은 탭 카운트에 영향이 없다(tabsBody 는 전체 목록을 센다) → 표·요약만 갱신.
     admin-b2c 의 refreshTableOnly 와 같은 이름·같은 구조. */
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

  /* ══════════════════════════════════════════════════════════
     거래처 정보 수정 모달 — 시안 1a(원장 + 좌측 다크 레일).
     주문 모달과 같은 언어다: 상시 편집 · 헤더에 정체성과 상태 · 카드로 묶은 원장.

     ⚠️ 입력 중에는 **절대 재렌더하지 않는다.** form 에 write-through 만 하고
        슬롯(data-slot)만 부분 갱신한다 — 재렌더하면 포커스와 커서가 날아간다.
     ══════════════════════════════════════════════════════════ */

  /** 한 필드 셀. 값은 항상 form 에서 읽는다. */
  function cliCell(f, form, lockId) {
    if (f.type === "static") {
      return html`<p class="cli-static">${invoiceHelpText(form.invoiceDay)}</p>`;
    }
    if (f.type === "seg") {
      return html`<div class="seg-pill" role="radiogroup" aria-label="${f.label}">
        ${f.options.map((v) => html`<button type="button" class="seg-pill__btn ${form[f.k] === v ? "is-on" : ""}"
          data-seg="${f.k}" data-v="${v}" role="radio" aria-checked="${form[f.k] === v ? "true" : "false"}">${v}</button>`)}
      </div>`;
    }
    if (f.type === "select") {
      return html`<div class="dd cli-fdd ${f.down ? "cli-fdd--down" : ""}" data-dd-cf="${f.k}">
        <button type="button" class="dd-trigger" aria-haspopup="listbox" aria-expanded="false"></button>
        <div class="dd-panel" role="listbox"></div>
      </div>`;
    }
    if (f.type === "textarea") {
      return html`<textarea class="ord-in" data-cf="${f.k}" rows="2" placeholder="${f.ph ?? ""}">${form[f.k] ?? ""}</textarea>`;
    }
    if (f.type === "attach") {
      const a = form.bizLicense;
      return html`<div class="cli-inline">
        <button type="button" class="cli-attachbtn" data-action="attach-zoom" ${a ? "" : "disabled"}>
          <span class="cli-attachbtn__n ${a ? "" : "is-empty"}">${a ? a.name : "첨부자료 없음"}</span>
          ${a ? html`<span class="cli-attachbtn__m">${fileSizeLabel(a.size)}</span>` : ""}
        </button>
        ${/* 시안: 붙이거나 바꾸는 버튼이 있어야 한다. 예전엔 미리보기뿐이라
             사업자등록증을 **관리자가 새로 붙일 방법이 아예 없었다** — 가입 심사의
             근거인데 이관 계정은 증빙이 없어 전부 '첨부자료 없음' 이다. */ ""}
        <button type="button" class="cli-minibtn" data-attach-pick>${a ? "변경" : "파일 선택"}</button>
        <input type="file" hidden data-attach-file accept="image/*,application/pdf" />
      </div>`;
    }
    const cls = "ord-in" + (f.num ? " ord-in--num" : "");
    const input = html`<input class="${cls}" data-cf="${f.k}" value="${form[f.k] ?? ""}" placeholder="${f.ph ?? ""}" />`;
    if (f.find) {
      return html`<div class="cli-inline">${input}
        <button type="button" class="cli-minibtn" data-addr-find hidden>주소검색</button></div>`;
    }
    if (lockId && f.k === "accountId") return input;
    return input;
  }

  /** 카드 하나 — 행마다 라벨 + 셀, 힌트가 붙는 필드는 아래에 한 줄 더. */
  function cliCard(title, cap, defs, form) {
    return html`<section class="ord-card">
      <div class="ord-card__head"><b class="ord-card__t">${title}</b>${cap ? html`<span class="ord-card__cap">${cap}</span>` : ""}</div>
      <div>
        ${/* 보조 문구는 **값 칸 안**에 둔다(시안) — 행 밖 형제로 두면 카드 폭 전체를
             차지해 입력 아래가 아니라 라벨 아래에서 시작한다. 라벨은 그때 위로 붙인다. */ ""}
        ${defs.map((f) => {
          const sub = f.hint || f.biz || f.help;
          return html`
          <div class="ord-row ord-row--full ${f.type === "textarea" || sub ? "ord-row--top" : ""}">
            <label class="ord-k">${f.label}${f.req ? html`<span class="req">*</span>` : ""}</label>
            <div class="cli-cell">
              ${f.type === "attach" ? html`<div data-attach-cell>${cliCell(f, form)}</div>` : cliCell(f, form)}
              ${f.hint || f.biz ? html`<p class="cli-hint" data-hint="${f.k}"></p>` : ""}
              ${f.help ? html`<p class="cli-hint cli-hint--mute">${f.help}</p>` : ""}
            </div>
          </div>`;
        })}
      </div>
    </section>`;
  }

  function openClientModal(client) {
    closeModal();
    const isEdit = !!client;
    const form = client
      ? { salesRoute: "미지정", salesDate: "", salesMemo: "", bizLicense: null, clientNote: "", channel: "일반", ...client }
      : {
          id: nextId(store.get().clients), accountId: "", password: "", companyName: "", bizNumber: "", ceoName: "",
          /* 모달에서 편집하지는 않지만 키는 남긴다 — 정산 명세서·주문 모달의 거래처 대표
             연락처가 계속 읽는다. 가입 폼(register.js)은 여전히 값을 채운다. */
          managerName: "", contact: "",
          department: "", email: "", address: "", status: "활성", joinDate: formatDateLabel(new Date()),
          invoiceDay: "1", clientNote: "", channel: "일반", bizLicense: null,
          salesRoute: "미지정", salesDate: "", salesMemo: "",
        };
    let menuOpen = false;
    let pwOut = "";
    let savedAt = "";
    const touched = {};
    const log = []; // 변경 이력 — 세션 한정(Client 에 이력 스키마가 없다)

    /* 사업자번호 중복은 "같은 법인의 계정 분리"라는 정상 시나리오다 — 저장을 막지 않는다.
       대신 계정 구분을 비우면 목록에서 두 레코드를 구분할 수 없으므로 그때만 필수로 올린다. */
    const dupes = () => store.get().clients.filter(
      (c) => c.id !== form.id && normalizeBiz(c.bizNumber) && normalizeBiz(c.bizNumber) === normalizeBiz(form.bizNumber)
    );
    const missing = () => {
      const out = REQUIRED.filter(([k]) => !String(form[k] ?? "").trim()).map(([, l]) => l);
      if (isEdit ? false : !String(form.accountId ?? "").trim()) out.unshift("접속 아이디");
      if (dupes().length && !String(form.department ?? "").trim()) out.push("계정 구분");
      return out;
    };
    const dirty = () => Object.keys(touched).length;
    /* 이력 점 색 — 무슨 종류의 변경이었는지 색으로 먼저 읽힌다(주문 HIST_DOT 과 같은 취지).
       한 색으로 고정하면 목록이 길어질수록 "무엇이 중요한 줄인가"가 사라진다. */
    const push = (label, tone) => { log.push({ label, at: nowHM(), tone: tone || "info" }); };

    /* ── 헤더 ── */
    const hdBody = () => {
      const shared = sharedBizKeys(store.get().clients);
      const showDept = isEdit && form.department && shared.has(normalizeBiz(form.bizNumber));
      const meta = [form.accountId || "아이디 미정", isEdit ? `가입 ${form.joinDate}` : "신규 등록",
        form.bizNumber ? `사업자 ${form.bizNumber}` : null, `계산서 매월 ${Number(form.invoiceDay) || 1}일`]
        .filter(Boolean).join(" · ");
      return html`
        <div class="ord-hd__l">
          <div class="ord-hd__row">
            <h3 class="ord-hd__no" id="modal-title">${form.companyName || (isEdit ? "거래처" : "신규 거래처 등록")}</h3>
            ${isEdit ? html`<span class="ord-hd__pill" style="background:var(--c-surface-2);color:var(--c-text-strong)">
              <span class="ord-hd__dot" style="background:${STATUS_DOT[form.status] || "var(--c-text-4)"}"></span>${form.status}</span>` : ""}
            ${showDept ? html`<span class="cli-deptchip">${form.department}</span>` : ""}
          </div>
          <p class="ord-hd__meta ord-mono">${meta}</p>
        </div>
        <div class="ord-hd__r">
          ${isEdit ? html`<div class="cli-st">
            ${STATUS_OPTS.map((s) => html`<button type="button" class="cli-st__btn ${form.status === s ? "is-on" : ""}" data-status="${s}">
              <span class="cli-st__dot" style="background:${STATUS_DOT[s]}"></span>${s}</button>`)}
          </div>
          <span class="ord-hd__vdiv"></span>
          <div class="ord-more">
            <button class="ord-iconbtn ${menuOpen ? "is-on" : ""}" data-action="menu" aria-haspopup="menu"
              aria-expanded="${menuOpen ? "true" : "false"}" aria-label="더보기">⋯</button>
            ${menuOpen ? html`<div class="ord-menu" role="menu">
              <button class="ord-menu__item" role="menuitem" data-action="reset-pw">임시비밀번호 발급</button>
              <button class="ord-menu__item ord-menu__item--danger" role="menuitem" data-action="delete">거래처 삭제</button>
            </div>` : ""}
          </div>` : ""}
          <button class="ord-iconbtn hm__x" data-action="close" aria-label="닫기">${icon("x", { size: 14 })}</button>
        </div>`;
    };

    /* 레일 2번 카드 — 정산·회계 담당자. **읽기 전용**이다(시안).
       이 사람이 거래명세서·정산기한 알림을 받으므로 거래처 원장을 보는 자리에서
       "누구에게 청구가 가는가"가 보여야 한다. 고치는 곳은 담당자 관리 다이얼로그다
       (카드 자체가 그 다이얼로그를 연다 — util/contacts-modal.js).
       ⚠️ 이관 거래처 18곳은 담당자가 0명이라 **비어 있는 것이 정상**이다 —
          빈 카드를 숨기면 "없다"는 사실이 안 보여 아무도 채우지 않는다. */
    const billingCard = () => {
      const list = store.contactsOf(form.id);
      const b = list.find((c) => c.isBilling) || null;
      return html`
        <div class="rail-card">
          <div class="rail-card__hd">
            <p class="rail-card__k">정산·회계 담당자</p>
            <span class="rail-card__bdg">${list.length ? "거래처 지정" : "미등록"}</span>
          </div>
          ${b
            ? html`<p class="rail-card__v">${b.name || "이름 없음"}${b.role ? html` <em class="rail-card__sub">${b.role}</em>` : ""}</p>
              <p class="rail-card__v2">${b.phone || "연락처 미등록"}</p>`
            : html`<p class="rail-card__v rail-card__v--empty">담당자 없음</p>
              <p class="rail-card__out">명세서·정산기한 알림을 받을 사람이 없습니다.</p>`}
          <button type="button" class="rail-card__btn rail-card__btn--ghost" data-action="go-contacts">
            담당자 관리</button>
        </div>`;
    };

    /* ── 레일 ── */
    const railBody = () => html`
      <div class="ord-side__h"><b class="ord-side__t">계정</b><span class="ord-side__cap">${isEdit ? "아이디 변경 불가" : "새 계정"}</span></div>
      <div class="rail-card">
        <p class="rail-card__k">접속 아이디</p>
        ${isEdit
          ? html`<p class="rail-card__v">${form.accountId || "-"}</p>`
          : html`<input class="hm-input" data-cf="accountId" value="${form.accountId ?? ""}" placeholder="영문·숫자" />`}
        <button type="button" class="rail-card__btn" data-action="reset-pw">임시비밀번호 발급</button>
        ${/* 안내문은 **발급 후에만**(시안). 평소에도 띄워 두면 카드가 늘 3줄이라
             정작 비밀번호가 찍혔을 때 눈에 들어오지 않는다. */ ""}
        ${pwOut ? html`<p class="rail-card__out">${pwOut}</p>` : ""}
      </div>
      ${isEdit ? billingCard() : ""}
      ${isEdit ? html`
        <div class="ord-side__h"><b class="ord-side__t">변경 이력</b><span class="ord-side__cap">${log.length}건</span></div>
        <div class="cli-hist">
          ${log.length
            ? log.map((h, i) => html`<div class="cli-hist__row ${i === log.length - 1 ? "is-latest" : ""}">
                <span class="cli-hist__dot cli-hist__dot--${h.tone || "info"}"></span>
                <span class="cli-hist__lbl" title="${h.label}">${h.label}</span>
                <span class="cli-hist__at">${h.at}</span></div>`)
            : html`<p class="cli-hist__empty">이 창에서 한 변경이 여기에 쌓입니다. 창을 닫으면 사라집니다 — 영속 이력은 아직 없습니다.</p>`}
        </div>` : ""}
      <p class="ord-side__note">아이디·비밀번호는 거래처 담당자에게만 전달합니다.</p>`;

    /* ── 푸터 ── */
    const ftBody = () => {
      const m = missing();
      const stat = m.length ? `필수 ${m.length}개 비어 있음 · ${m.join(" · ")}`
        : savedAt && !dirty() ? `저장됨 · ${savedAt}`
        : dirty() ? `수정한 항목 ${dirty()}개` : "변경 없음";
      const cls = m.length ? "is-dirty" : savedAt && !dirty() ? "is-saved" : dirty() ? "is-dirty" : "";
      return html`
        <span class="ord-ft__stat ${cls}" data-slot="stat">${stat}</span>
        <button class="hm-btn hm-btn--secondary" data-action="close">취소</button>
        <button class="hm-btn hm-btn--primary" data-action="save" ${m.length ? "disabled" : ""}>
          ${dirty() ? "변경사항 저장" : isEdit ? "저장" : "등록"}</button>`;
    };

    /* ── 배너 ── */
    /* 배너가 없을 때 슬롯을 **숨긴다** — `.cli-pane` 이 flex column + gap 이라
       높이 0 인 빈 자식도 gap 을 한 번 먹어 카드 위에 유령 간격이 남는다.
       `:empty` 로는 안 된다(템플릿이 공백 텍스트 노드를 남긴다). */
    const hasBanner = () => isEdit && (form.status === "승인대기" || (form.status === "반려" && !!form.rejectReason));
    const banners = () => html`
      ${isEdit && form.status === "승인대기" ? html`
        <div class="cli-banner cli-banner--wait">
          <span class="cli-banner__msg"><b>가입 승인 심사</b> · 사업자등록증의 사업자번호·대표자명이 입력값과 일치하는지 확인하세요.</span>
          <span class="cli-banner__acts">
            <button class="cli-banner__btn cli-banner__btn--rej" data-action="reject">거부</button>
            <button class="cli-banner__btn cli-banner__btn--ok" data-action="approve">승인</button>
          </span>
        </div>` : ""}
      ${isEdit && form.status === "반려" && form.rejectReason ? html`
        <div class="cli-banner cli-banner--rej"><span class="cli-banner__msg"><b>거부 사유</b> · ${form.rejectReason}</span></div>` : ""}`;

    const body = () => html`
      <div class="hm__head ord-hd" data-slot="hd">${hdBody()}</div>
      <div class="cli-grid">
        <aside class="ord-side" data-slot="rail">${railBody()}</aside>
        <div class="cli-pane">
          <div data-slot="banner" ${hasBanner() ? "" : "hidden"}>${banners()}</div>
          ${/* 시안: 원장은 2열 2행이다. 위가 거래 조건과 회사 정보(주문에 실리는 것),
               아래가 계산서·정산과 증빙·영업(청구·심사에 쓰는 것). 전폭 카드를 세로로
               쌓으면 가로 공간이 남는데 세로로만 길어져 스크롤을 부른다. */ ""}
          <div class="cli-rows cli-rows--stretch">
            <div class="cli-note">
              <div class="cli-note__head"><b class="cli-note__t">거래 조건</b><span class="cli-note__cap">주문 화면 노출</span></div>
              <div class="cli-note__body">
                <textarea data-cf="clientNote" rows="8" placeholder="예) 상품금액 75,000원으로 기재, 무조건 특대상품 발송">${form.clientNote ?? ""}</textarea>
                <p class="cli-note__help">메모가 아니라 이 거래처에만 적용되는 상품·금액·절차 규칙입니다. 한 줄에 한 규칙.</p>
              </div>
            </div>
            ${cliCard("회사 정보", "계산서 발행 기준", CARD_COMPANY, form)}
          </div>
          <div class="cli-rows">
            ${cliCard("계산서 · 정산", "월 후불", CARD_BILL, form)}
            ${cliCard("증빙 · 영업", "가입 심사 근거", CARD_SALES, form)}
          </div>
        </div>
      </div>
      <div class="hm__foot ord-ft" data-slot="ft">${ftBody()}</div>`;

    const ddCfs = [];
    const destroyDds = () => { ddCfs.forEach((d) => d.destroy()); ddCfs.length = 0; };
    activeModal = openModal({
      panelClass: "modal-panel--cli",
      body: body(),
      labelledBy: "modal-title",
      onClose: () => { destroyDds(); activeModal = null; },
    });
    const panel = activeModal.panel;
    const slot = (n) => qs(panel, `[data-slot='${n}']`);
    const renderHd = () => { const e = slot("hd"); if (e) setHTML(e, hdBody()); };
    /* 이력은 시간순(최신이 끝)이라 카드가 아래로 자란다 — 잘린 목록은 렌더 후 끝까지
       내려야 방금 한 일이 보인다(order-screen.js `histScrollEnd` 와 같은 규칙). */
    const histEnd = () => {
      const h = qs(panel, ".cli-hist");
      if (h) requestAnimationFrame(() => { h.scrollTop = h.scrollHeight; });
    };
    const renderRail = () => { const e = slot("rail"); if (e) { setHTML(e, railBody()); histEnd(); } };
    /* 첨부 칸만 부분 갱신 — 카드를 통째로 다시 그리면 옆 입력의 커서가 날아간다 */
    const renderAttach = () => {
      const cell = qs(panel, "[data-attach-cell]");
      const def = CARD_SALES.find((x) => x.k === "bizLicense");
      if (cell && def) setHTML(cell, cliCell(def, form));
    };
    const renderFt = () => { const e = slot("ft"); if (e) setHTML(e, ftBody()); };
    const renderBanner = () => {
      const e = slot("banner");
      if (!e) return;
      setHTML(e, banners());
      e.hidden = !hasBanner();
    };

    /* 담당자 명단은 이 모달의 원장에서 다루지 않는다(시안) — **담당자 관리 다이얼로그**
       (util/contacts-modal.js) 소관이다. 별도 탭은 두지 않는다.
       모달의 본업은 거래처 원장이고, 담당자는 거래처별 저장공간(포털과 같은 레코드)이라
       편집 규칙(정산담당 1명 불변식·삭제 잠금)이 따로 산다. 레일의 '정산·회계 담당자'
       카드가 **읽기 전용**으로 현재 담당을 보여 주고, 누르면 그 다이얼로그를 띄운다.
       ⚠️ 관리자가 담당자를 고칠 경로 자체를 없애면 안 된다 — 이관 거래처 19곳 중
          18곳이 담당자 0명이라, 경로가 없으면 그 거래처들은 영영 빈 채로 남는다. */

    /* 드롭다운(발급일·유입 경로) — 재렌더가 없으므로 한 번만 만든다.
       ⚠️ 패널은 공용 기본값대로 **위로** 연다. `--cli` 에는 아래로 뒤집는 규칙이 없다. */
    function bindDds() {
      destroyDds();
      qsa(panel, "[data-dd-cf]").forEach((el) => {
        const k = el.dataset.ddCf;
        const f = [...CARD_BILL, ...CARD_SALES].find((x) => x.k === k);
        if (!f) return;
        ddCfs.push(makeDropdown(el, {
          options: f.options,
          label: f.ddLabel,
          get: () => form[k],
          set: (v) => { form[k] = v; touched[k] = 1; syncStatics(); renderHd(); renderFt(); },
        }));
      });
    }
    bindDds();

    /* 중복 안내 · 정산 일정 문구 — **텍스트 노드만** 갈아 끼운다(포커스 무해) */
    function syncStatics() {
      const d = dupes();
      const hb = qs(panel, "[data-hint='bizNumber']");
      if (hb) hb.textContent = d.length
        ? `이미 등록된 사업자번호입니다 · ${d[0].companyName}(${d.map((x) => x.department || "계정 구분 없음").join(", ")})`
        : "";
      const hd = qs(panel, "[data-hint='department']");
      if (hd) hd.textContent = d.length ? "같은 사업자번호가 있어 계정 구분이 필요합니다 — 목록에서 이 값으로 갈라집니다." : "";
      const dep = qs(panel, "[data-cf='department']");
      if (dep) dep.classList.toggle("is-warn", d.length > 0 && !String(form.department ?? "").trim());
      const ce = qs(panel, "[data-cf='ceoName']");
      if (ce) ce.classList.toggle("is-warn", !String(form.ceoName ?? "").trim());
      const st = qs(panel, ".cli-static");
      if (st) st.textContent = invoiceHelpText(form.invoiceDay);
    }
    syncStatics();


    /* 상시 편집 — 값은 write-through 하고 **재렌더하지 않는다** */
    on(panel, "input", "[data-cf]", (e, t) => {
      const k = t.dataset.cf;
      if (k === "bizNumber") {
        const pos = t.selectionStart;
        const before = t.value.length;
        t.value = fmtBiz(t.value);
        const move = t.value.length - before;
        t.setSelectionRange(Math.max(0, pos + move), Math.max(0, pos + move));
      }
      form[k] = t.value;
      touched[k] = 1;
      if (t.tagName === "TEXTAREA") autosize(t);
      if (k === "bizNumber" || k === "ceoName" || k === "department") syncStatics();
      if (k === "companyName" || k === "accountId" || k === "bizNumber") renderHd();
      renderFt();
    });
    on(panel, "click", "[data-seg]", (e, t) => {
      form[t.dataset.seg] = t.dataset.v;
      touched[t.dataset.seg] = 1;
      qsa(panel, `[data-seg='${t.dataset.seg}']`).forEach((b) => {
        const on_ = b.dataset.v === t.dataset.v;
        b.classList.toggle("is-on", on_);
        b.setAttribute("aria-checked", on_ ? "true" : "false");
      });
      renderFt();
    });

    /* 상태 전환은 **즉시 반영**한다 — 지금 동작이 그렇고 토스트 문구도 즉시 통보를 전제한다.
       저장 버튼에 태우면 "승인했습니다"가 거짓말이 된다. */
    on(panel, "click", "[data-status]", (e, t) => {
      const v = t.dataset.status;
      if (v === form.status) return;
      if (v === "반려") return openReject(form, (reason) => {
        form.status = "반려"; form.rejectReason = reason;
        store.updateClient({ ...form });
        push("가입 거부 · 사유 통보", "danger");
        renderHd(); renderBanner(); renderRail(); refreshList();
      });
      form.status = v;
      if (v !== "반려") form.rejectReason = "";
      store.updateClient({ ...form });
      push(`상태 변경 · ${v}`, v === "활성" ? "ok" : v === "반려" ? "danger" : "warn");
      renderHd(); renderBanner(); renderRail(); refreshList();
      toast(`${v}(으)로 변경했습니다`);
    });
    on(panel, "click", "[data-action='approve']", () => {
      form.status = "활성"; form.rejectReason = "";
      store.updateClient({ ...form });
      push("가입 승인 · 활성 전환", "ok");
      renderHd(); renderBanner(); renderRail(); refreshList();
      toast(`${form.companyName} 거래처를 승인했습니다 · 환영 알림이 발송되었습니다`);
    });
    on(panel, "click", "[data-action='reject']", () => openReject(form, (reason) => {
      form.status = "반려"; form.rejectReason = reason;
      store.updateClient({ ...form });
      push("가입 거부 · 사유 통보", "danger");
      renderHd(); renderBanner(); renderRail(); refreshList();
    }));

    on(panel, "click", "[data-action='menu']", () => { menuOpen = !menuOpen; renderHd(); });
    on(panel, "click", "[data-action='reset-pw']", () => {
      const CH = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
      let pw = "";
      for (let i = 0; i < 10; i++) pw += CH[Math.floor(Math.random() * CH.length)];
      form.password = pw;
      touched.password = 1;
      pwOut = `임시비밀번호 ${pw} — 저장해야 적용됩니다. 창을 닫으면 다시 볼 수 없습니다.`;
      menuOpen = false;
      push("임시비밀번호 발급", "warn");
      renderHd(); renderRail(); renderFt();
      toast("임시비밀번호를 발급했습니다");
    });
    /* 담당자 관리 — 원장 **위에 스택**으로 연다. 화면을 옮기지 않으므로 작성 중인
       원장 편집이 살아 있다. ⚠️ 핸들을 `activeModal` 에 담지 말 것(→ contacts-modal.js). */
    on(panel, "click", "[data-action='go-contacts']", () => {
      openContactsModal({ client: form, toast, onChange: () => { renderRail(); refreshList(); } });
    });
    on(panel, "click", "[data-action='delete']", () => {
      menuOpen = false; renderHd();
      openDeleteConfirm({
        ...deleteCopy(form),
        onConfirm: () => {
          const name = form.companyName;
          store.removeClient(form.id);
          closeModal();
          refreshList();
          toast(`${name} 거래처를 삭제했습니다`, "warn");
        },
      });
    });

    ensurePostcode().then((ok) => { const b = qs(panel, "[data-addr-find]"); if (b && ok) b.hidden = false; });
    on(panel, "click", "[data-addr-find]", () => {
      openPostcode(({ road }) => {
        const el = qs(panel, "[data-cf='address']");
        if (!el) return;
        el.value = road + " ";
        form.address = el.value;
        touched.address = 1;
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
        renderFt();
      });
    });
    on(panel, "click", "[data-attach-pick]", () => {
      const inp = qs(panel, "[data-attach-file]");
      if (inp) inp.click();
    });
    on(panel, "change", "[data-attach-file]", async (e, t) => {
      const file = t.files && t.files[0];
      if (!file) return;
      t.value = ""; /* 같은 파일을 다시 골라도 change 가 나게 */
      try {
        /* 이미지는 축소해 dataURL 로, PDF 는 이름·크기만 남긴다(미리보기 불가). */
        const att = file.type.startsWith("image/")
          ? await attachmentOf(file)
          : { name: file.name, size: file.size, dataUrl: "" };
        form.bizLicense = att;
        touched.bizLicense = 1;
        renderAttach(); renderFt();
        push(`사업자등록증 첨부 · ${att.name}`, "info");
        renderRail();
        toast(`${att.name} 을 첨부했습니다 · 저장해야 적용됩니다`);
      } catch (err) {
        console.error("[clients] attach failed", err);
        toast("파일을 읽지 못했습니다", "warn");
      }
    });
    on(panel, "click", "[data-action='attach-zoom']", () => {
      const a = form.bizLicense;
      if (a && a.dataUrl) openLightbox({ src: a.dataUrl, alt: "사업자등록증", caption: `${form.companyName} 사업자등록증` });
    });
    on(panel, "click", "[data-action='close']", () => closeModal());
    on(panel, "click", "[data-action='save']", () => {
      if (missing().length) { toast("필수 항목을 채워야 저장됩니다", "warn"); return; }
      if (isEdit) store.updateClient({ ...form });
      else store.addClient({ ...form });
      savedAt = nowHM();
      Object.keys(touched).forEach((k) => delete touched[k]);
      push(isEdit ? "거래처 정보 저장" : "거래처 등록", "ok");
      renderFt(); renderRail(); refreshList();
      toast(isEdit ? "거래처 정보를 저장했습니다" : `${form.companyName} 거래처를 등록했습니다`);
    });

    qsa(panel, "textarea").forEach(autosize);
  }

  // ── approve / reject ───────────────────────────────────
  function approve(client) {
    store.updateClient({ ...client, status: "활성", rejectReason: undefined });
    refreshList();
    toast(`${client.companyName} 거래처를 승인했습니다 · 환영 알림이 발송되었습니다`, "ok");
  }

  /** 가입 거부 — 사유는 필수. onDone(reason) 이 있으면 저장은 호출부가 한다(모달 안에서 호출).
      ⚠️ 이 다이얼로그는 거래처 모달 **위에 스택**된다 — 핸들을 `activeModal` 에 담으면 안 된다.
         담았더니 아래 거래처 모달의 핸들이 덮여 사라지고, `closeModal()` 만 보는 X·취소 버튼이
         그 뒤로 **무반응**이 됐다(ESC 와 라우터의 closeAllModals 로만 닫혔다). 로컬 핸들을 쓴다. */
  function openReject(client, onDone) {
    if (!onDone) closeModal();
    const body = html`
      <div class="hm-warn"><span><b>${client.companyName}</b> 거래처의 가입을 거부합니다. 입력한 사유는 담당자에게 통보됩니다.</span></div>
      <div class="hm-field" style="margin-top:16px;">
        <label for="reject-reason">거부 사유<span class="req">*</span></label>
        <textarea class="hm-input hm-textarea" id="reject-reason" data-reason rows="3" placeholder="거부 사유를 입력하세요."></textarea>
      </div>
    `;
    const footer = html`
      <button class="hm-btn hm-btn--secondary" data-action="close">취소</button>
      <button class="hm-btn hm-btn--danger" data-action="do-reject" disabled>거부 처리</button>
    `;
    const m = simpleModal({ title: "가입 거부", subtitle: client.companyName, size: "sm", body, footer });
    const ta = qs(m.panel, "[data-reason]");
    const btn = qs(m.panel, "[data-action='do-reject']");
    on(m.panel, "input", "[data-reason]", () => { btn.disabled = !ta.value.trim(); });
    on(m.panel, "click", "[data-action='do-reject']", () => {
      const reason = ta.value.trim();
      if (!reason) return;
      m.close();
      if (onDone) onDone(reason);
      else { store.updateClient({ ...client, status: "반려", rejectReason: reason }); closeModal(); refreshList(); }
      toast(`${client.companyName} 가입을 거부했습니다 · 사유가 통보되었습니다`, "warn");
    });
  }

  /* 삭제 확인은 모달 안(⋯ 메뉴)과 목록이 **같은 다이얼로그**를 쓴다 —
     같은 파괴적 동작이 자리에 따라 다른 확인 절차를 요구하면 안 된다.
     `openDeleteConfirm` 은 '되돌릴 수 없음' 체크를 해야 삭제가 열린다. */
  function openDelete(client) {
    closeModal();
    openDeleteConfirm({
      ...deleteCopy(client),
      onConfirm: () => {
        store.removeClient(client.id);
        refreshList();
        toast(`${client.companyName} 거래처를 삭제했습니다`, "warn");
      },
    });
  }

  render();

  const findClient = (id) => store.get().clients.find((c) => c.id === id);
  const offClick = on(root, "click", "[data-action]", (e, t) => {
    const a = t.dataset.action;
    if (a === "tab") { state.tab = t.dataset.v; refreshList(); return; }
    if (a === "new") return openClientModal(null);
    // 그룹 토글은 data-id 가 없으므로 findClient 앞에서 처리해야 한다(뒤면 조용히 무시됨).
    if (a === "grp") {
      const k = t.dataset.k;
      if (state.expanded.has(k)) state.expanded.delete(k); else state.expanded.add(k);
      refreshList();
      return;
    }
    const c = findClient(t.dataset.id);
    if (!c) return;
    if (a === "contacts") openContactsModal({ client: c, toast, onChange: () => refreshList() });
    else if (a === "edit") openClientModal(c);
    else if (a === "del") openDelete(c);
    else if (a === "approve") approve(c);
    else if (a === "reject") openReject(c);
  });
  const offSearch = on(root, "input", "[data-search]", (e, t) => {
    state.search = t.value;
    refreshTableOnly();
  });

  return () => {
    offClick();
    offSearch();
    closeModal();
    toast.destroy();
  };
}
