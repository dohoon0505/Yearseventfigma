/* ============================================================
   admin-clients.js — 거래처 정보관리
   상단 필터(상태 탭 + 검색 + '약관 동의 전만 보기' 칩) · 가입 승인/거부 워크플로 · 상세/수정/생성/삭제.
   store.clients(영속). 모달은 HModal 규격(hm-field/hm-btn) + 커스텀 드롭다운.
   S-04(2026-10-16): 관리자가 등록해 아직 약관에 동의하지 않은 거래처를 목록(회사명 아래 배지 + 첫 명세서 일정)과
   정보 창(머리 칩 + 배너 + 임시비밀번호 즉시 발급)에서 늘 보인다 — 아래 '약관 동의 전' 블록.
   ============================================================ */
import { html, setHTML, on, qs, qsa } from "../dom.js";
import { makeToast } from "../toast.js";
import { icon } from "../icons.js";
import { store, MSG_RECEIVE, newContactId } from "../store.js";
import { onPhoneInput, phoneOk } from "../util/phone.js";
import { pageTitle, tableGrid, openModal, makeDropdown, openLightbox } from "../ui.js";
import { openDialog, dlgRule, dlgRow, dlgActions } from "../util/dialog.js";
import { autosize, openDeleteConfirm } from "../util/order-screen.js";
import { attachmentOf, fileSizeLabel } from "../util/image.js";
import { INVOICE_DAYS, CLIENT_CHANNELS } from "../data/admin-mock.js";
import { deadlineDayOf, invoiceDayOf, invoiceDayEffectiveFrom, periodLabel, shiftPeriod, MIN_CONSENT_DAYS, invoiceDayRangeLabel, fmtMdHm, fmtKoShortTime } from "../data/settlement-rules.js";
import { termsPending } from "../util/client.js";
import { termsWatchOf } from "../util/settlement.js";
import { normalizeBiz, sharedBizKeys, onBizInput } from "../util/biz.js";
import { formatDateLabel } from "../util/date.js";
import { ensurePostcode, openPostcode } from "../util/postcode.js";
import { openContactsModal } from "../util/contacts-modal.js";
import { setFocusClient, takeFocusClient } from "../session.js";

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
     실데이터도 그 용도로 쓰고 있다(법무법인 한결 C008 '정민수 변호사' / C015 '윤지아 변호사'). */
  { k: "department", label: "계정 구분", hint: true, ph: "예) 정민수 변호사 · 총무팀" },
  { k: "address", label: "사업장주소", find: true },
];
const CARD_BILL = [
  /* 아래로 연다 — 카드 첫 줄이라 위 공간이 113px 뿐이고 패널은 240px 다(유입 경로는 반대).
     선택지는 동의 기간이 3일 이상인 날뿐이다(2026-09-25 결정). 제한 전에 저장된 값(8~10·26~28)은 트리거에
     그대로 보여 주고 조용히 바꾸지 않는다 — 그 값으로 이미 발급된 달이 있다. */
  { k: "invoiceDay", label: "발급일", type: "select", down: true, options: () => INVOICE_DAYS,
    ddLabel: (v) => (INVOICE_DAYS.includes(String(v)) ? `매월 ${v}일` : `매월 ${v}일 · 지금은 고를 수 없는 날`) },
  { k: "email", label: "계산서 이메일", ph: "계산서를 수신할 이메일 주소" },
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

/** 그 거래처에 등록된 담당자 수 — 목록 배지와 다이얼로그 제목이 같이 읽는다. */
const contactCount = (id) => store.contactsOf(id).length;

/** 거래처 삭제 확인의 문구 — **모달 안(⋯ 메뉴)과 목록이 같은 말을 해야 한다.**
    예전엔 호출부가 둘인데 문구를 각자 넘겨, 한쪽만 고치면 조용히 갈렸다
    (실제로 제목이 `주문서를 삭제할까요?` 인 채로 남아 거래처를 지울 때도 그렇게 물었다). */
const deleteCopy = (client) => ({
  eyebrow: client.accountId || client.companyName,
  title: `${client.companyName} 거래처를 삭제할까요?`,
  okLabel: "거래처 삭제",
  desc: html`계정(아이디·비밀번호)·정산·주문 정보가 모두 삭제되며 되돌릴 수 없습니다.
    거래를 멈추는 것이라면 삭제 대신 <b>정지</b>를 사용하세요.`,
});

/** 정산 일정 안내문 — 초기 렌더와 부분 갱신이 **같은 문장**을 쓰게 한 곳에 둔다.
    사본이 둘이던 때, 발급일 드롭다운을 건드리는 순간 두 문장이 갈렸다.
    마감일(10일/28일)은 settlement-rules.js `deadlineDayOf` 단일 소스 — 여기서 숫자를 다시 적지 않는다.
    옛 문구의 "(최대 N일)" 은 **이번 달** 말일이라 거래처와 무관한 숫자였다(그 계산이 0-based 월
    함정으로 다음 달 말일이 나오던 결함까지 있었다). 뺐다. */
function invoiceHelpText(invoiceDay) {
  const day = invoiceDayOf({ invoiceDay });
  const dl = deadlineDayOf(day);
  /* 발급일 변경의 **적용 시점**을 같은 문단에서 말한다 — 안 적으면 관리자는 바꾸는 순간 과거 달까지
     다시 계산된다고 오해한다(실제로는 이미 발급된 달을 그대로 두는 것이 규칙이다). */
  const from = invoiceDayEffectiveFrom(new Date());
  return `매월 ${day}일 10:00에 전월 귀속 거래명세서가 발급됩니다. 계산서 발급 동의 마감은 같은 달 ${dl}일 13:00이며, `
    + `마감까지 동의가 없으면 그 시각에 자동 동의됩니다. 계산서 작성일자는 `
    + (day <= 10 ? "귀속월 말일" : `동의한 날(자동 동의면 ${dl}일)`)
    + `, 정산기한은 발급일이 속한 달의 말일입니다. `
    + `발급일을 바꾸면 ${periodLabel(from)} 귀속분(${periodLabel(shiftPeriod(from, 1))} 발급)부터 적용되고, 이미 발급된 달은 그대로 유지됩니다. `
    + `발급일은 동의 기간이 ${MIN_CONSENT_DAYS}일 이상 남는 ${invoiceDayRangeLabel()} 중에서 고릅니다.`;
}

const PILL = { "활성": "pill--success", "승인대기": "pill--warn", "정지": "pill--danger", "반려": "pill--gray" };
const statusPill = (s) => html`<span class="pill ${PILL[s] ?? "pill--gray"}">${s}</span>`;

/** 지금 시각 "오후 2:53" — 변경 이력·저장 표시에 쓴다(주문 모달과 같은 포맷). */
const nowHM = () => new Date().toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" });

/* ── 약관 동의 전 (S-04 · 명세 3.1 · N18) ─────────────────────────────
   관리자가 등록한 거래처는 약관 기록 없이 '활성'으로 생기고, 첫 로그인 게이트에서 처음 동의한다. 첫 명세서 마감까지
   동의가 없으면 그 달은 자동 동의되지 않는다(명세 3.4 예외표) — 직원이 미리 연락하도록 목록·정보 창에 늘 보인다.
   판정은 util/client.js `termsPending`, 일정·상태는 util/settlement.js `termsWatchOf`(settlementOf 파생) 한 곳이다 —
   화면이 날짜로 상태를 짐작하지 않는다. 약관 버전이 올라 재동의를 기다리는 계정은 '약관 동의 전'이 아니다. */
/** 임시비밀번호 유효시간 — 명세 8.1 '유효기간 24시간'. ⚠️ 데모 로그인은 만료를 검사하지 않는다(HANDOFF). */
const TEMP_PW_TTL = 24 * 60 * 60 * 1000;
/** 귀속월 목록 → "9월분" · "8·9월분" */
const monthsShort = (list) => `${list.map((h) => Number(h.ym.slice(5))).join("·")}월분`;
/** "10-28 13:00" 을 **한 덩어리**로 — 1280 에서 회사명 칸이 ≈220px 라 줄이 접힌다. 날짜·시각 사이를 NBSP 로만 묶었더니
 *  이번엔 하이픈 뒤에서 '마감 10- / 28 13:00' 으로 갈렸다(하이픈 뒤도 줄바꿈 자리다 — 실측). nowrap 조각으로 감싼다. */
const mdHm = (d) => html`<span class="cli-tsched__dt">${fmtMdHm(d)}</span>`;
/** 발급까지 남은 날 — 오늘이면 '오늘 발급'(대쉬보드 경고와 같은 낱말) */
const ddayText = (n) => (n <= 0 ? "오늘 발급" : `D-${n}`);

/**
 * 목록 회사명 칸 아래 한 줄의 조각들 `[{ text, hot }]`. 약관에 동의한 거래처면 null.
 * hot(빨강)은 7일 이내 발급 · 발급 뒤 마감 전 · **마감이 지나도 약관 동의 전이면 남는다**(운영자 결정 6) —
 * 마감이 지난 달은 '9월분 마감 지남 · 자동 동의 안 함' 에 다음 명세서 일정을 잇는다.
 */
function termsLineParts(client, now) {
  if (!termsPending(client)) return null;
  const w = termsWatchOf(client, now);
  if (!w) return [{ text: "아직 거래가 없어 첫 명세서 일정이 없습니다", hot: false }];
  const out = [];
  if (w.held.length) out.push({ text: `${monthsShort(w.held)} 마감 지남 · 자동 동의 안 함`, hot: true });
  const n = w.next;
  if (n) {
    out.push(n.phase === "open"
      ? { text: html`${n.first ? "" : monthsShort([n]) + " "}명세서 발급 완료 · 마감 ${mdHm(n.deadline)}`, hot: true }
      : { text: html`${n.first ? "첫" : "다음"} 명세서 ${mdHm(n.issueAt)} · ${ddayText(n.dDay)}`, hot: n.dDay <= 7 });
  }
  return out;
}
/** 목록 회사명 칸의 '약관 동의 전' 배지 + 일정 한 줄. 약관에 동의한 거래처는 빈 문자열. */
function termsLine(client, now) {
  const parts = termsLineParts(client, now);
  if (!parts) return "";
  return html`<div class="cli-terms">
    <span class="cli-tbadge">약관 동의 전</span>
    ${parts.map((p) => html`<span class="cli-tsched ${p.hot ? "is-hot" : ""}">${p.text}</span>`)}
  </div>`;
}
/** 임시비밀번호 무작위 10자(헷갈리는 글자 I·l·O·0·1 제외) */
function makeTempPassword() {
  const CH = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let pw = "";
  for (let i = 0; i < 10; i++) pw += CH[Math.floor(Math.random() * CH.length)];
  return pw;
}

function nextId(clients) {
  const max = clients.reduce((m, c) => Math.max(m, parseInt(String(c.id).replace(/\D/g, ""), 10) || 0), 0);
  return "C" + String(max + 1).padStart(3, "0");
}

export function mount(root, { nav }) {
  // expanded: 펼쳐 둔 사업자번호(정규화) 집합. 재렌더로 DOM이 통째로 갈리므로
  // 접힘 상태는 반드시 state 에서 읽는다(클래스 토글 방식은 검색 한 글자에 초기화됨).
  // termsOnly: '약관 동의 전만 보기' 칩(S-04). 상태 탭과 **다른 축**이다 — '활성 + 약관 동의 전'이 함께 성립한다.
  const state = { tab: "all", search: "", expanded: new Set(), termsOnly: false };
  /* 목록 한 번 그리는 동안 같은 시각으로 판정한다(줄마다 new Date() 면 경계 시각에 줄끼리 갈린다). */
  let listNow = new Date();
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
      if (state.termsOnly && !termsPending(c)) return false;
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
      const all = store.get().clients.filter((x) => normalizeBiz(x.bizNumber) === key);
      const total = all.length;
      const autoOpen = !!q && members.some((m) => matchesChild(m, q));
      const open = state.expanded.has(key) || autoOpen;
      const pno = String(++no).padStart(2, "0");
      /* 접힌 묶음도 '약관 동의 전' 계정이 있다는 것은 보여야 한다(시안) — 필터와 무관하게 묶음 전체에서 센다. */
      const pending = all.filter(termsPending).length;
      out.push({ kind: "group", key, client: members[0], count: total, open, no: pno, pending });
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
        /* 약관 표시는 상태 칸이 아니라 **회사명 아래**에 붙는다(시안) — 상태(활성·정지…)와 다른 종류의 사실이다. */
        if (r.kind === "group") {
          return html`<div class="cli-name">
            <button type="button" class="cli-grp" data-action="grp" data-k="${r.key}" aria-expanded="${r.open ? "true" : "false"}">
              <span class="cli-grp__chev"></span>
              <b class="ellipsis">${c.companyName}</b>
              <span class="cli-badge">부서 ${r.count}</span>
            </button>
            ${!r.open && r.pending ? html`<p class="cli-grpnote">${r.pending}곳 약관 동의 전</p>` : ""}
          </div>`;
        }
        if (r.kind === "child") {
          return html`<div class="cli-name"><div class="cli-child ellipsis">${c.department || "계정 구분 없음"}</div>${termsLine(c, listNow)}</div>`;
        }
        return html`<div class="cli-name"><div class="ellipsis">${c.companyName}</div>${termsLine(c, listNow)}</div>`;
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
    listNow = new Date();
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
  /* '약관 동의 전만 보기' — 상태 탭을 늘리지 않고 탭 줄 오른쪽에 칩으로 둔다(시안 · 공용 `.bf-chip`).
     건수는 탭과 같이 **전체 목록**에서 센다. 0건이면 칩을 숨긴다(누를 이유가 없다). */
  const termsCount = () => store.get().clients.filter(termsPending).length;
  function termsChipBody() {
    const n = termsCount();
    if (!n) return "";
    return html`<button type="button" class="bf-chip cli-termsonly ${state.termsOnly ? "is-on" : ""}" data-action="terms-only"
      aria-pressed="${state.termsOnly ? "true" : "false"}">약관 동의 전만 보기<b class="cli-termsonly__n">${n}</b></button>`;
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
                <div class="cli-termsslot" data-slot="termschip">${termsChipBody()}</div>
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
    /* 마지막 '약관 동의 전' 거래처가 사라지면(삭제 등) 칩이 숨으므로 필터도 함께 푼다 — 안 그러면 빈 표만 남는다. */
    if (state.termsOnly && !termsCount()) state.termsOnly = false;
    const chip = qs(root, "[data-slot='termschip']");
    if (chip) setHTML(chip, termsChipBody());
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
    /* 신규 등록은 저장하는 순간 **그 거래처의 수정 창**이 된다(아래 save 에서 true 로). 예전엔 상수라
       등록 뒤에도 버튼이 '등록'으로 남아, 한 번 더 누르면 같은 id 의 레코드가 하나 더 생겼다(실측 C020 ×2). */
    let isEdit = !!client;
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
    /* 이 창에서 발급한 임시비밀번호와 그 시각 — 레일·약관 배너가 '…까지 유효'를 같은 값으로 말한다.
       서버는 발급 API 가 한 번만 돌려준다(명세 6.3) — 그래서 창을 닫으면 다시 볼 수 없다(영속하지 않는다). */
    let pwShown = "";
    let pwAt = null;
    /* 방금 등록한 창인가 — 등록 버튼을 누르면 이 창이 그 거래처의 수정 창으로 바뀌는데, 그 순간부터
       '아이디·임시비밀번호를 전달하세요' 배너를 띄운다(S-04 시안). 창을 닫으면 끝난다. */
    let justCreated = false;
    let savedAt = "";
    const touched = {};
    /* 신규 등록의 정산·회계 담당자 — **필수**다(2026-09-29 사용자 결정 · 법무 답 '정산담당자는 필수 요소').
       가입 화면(register.js)은 2단계 담당자를 정산담당으로 만든다. 관리자 등록도 같은 불변식을 지켜야
       자동 동의의 알림(T3·T4)이 닿을 사람이 늘 있다. 레코드 키가 아니라 담당자 저장공간으로 가므로 form 밖에 둔다. */
    const bill = { name: "", phone: "" };
    const log = []; // 변경 이력 — 데모는 세션 한정. 서버에서는 감사 로그의 거래처 영역(명세 8.4)이 이 자리를 채운다(2026-09-17 결정). 레일은 최근 3건만 그린다(histBlock)

    /* 사업자번호 중복은 "같은 법인의 계정 분리"라는 정상 시나리오다 — 저장을 막지 않는다.
       대신 계정 구분을 비우면 목록에서 두 레코드를 구분할 수 없으므로 그때만 필수로 올린다. */
    const dupes = () => store.get().clients.filter(
      (c) => c.id !== form.id && normalizeBiz(c.bizNumber) && normalizeBiz(c.bizNumber) === normalizeBiz(form.bizNumber)
    );
    const missing = () => {
      const out = REQUIRED.filter(([k]) => !String(form[k] ?? "").trim()).map(([, l]) => l);
      if (isEdit ? false : !String(form.accountId ?? "").trim()) out.unshift("접속 아이디");
      if (!isEdit && !bill.name.trim()) out.push("정산담당자 이름");
      if (!isEdit && !phoneOk(bill.phone)) out.push("정산담당자 연락처");
      if (dupes().length && !String(form.department ?? "").trim()) out.push("계정 구분");
      return out;
    };
    /* 접속 아이디는 유일해야 한다(2026-09-25 — 로그인이 아이디 하나로 거래처를 가린다 · 명세 5.2 UNIQUE).
       신규만 본다 — 등록한 뒤에는 아이디를 바꿀 수 없다(레일에서 읽기 전용). */
    const idTaken = () => !isEdit && store.accountIdTaken(form.accountId, form.id);
    const dirty = () => Object.keys(touched).length;
    /* 이력 점 색 — 무슨 종류의 변경이었는지 색으로 먼저 읽힌다(주문 HIST_DOT 과 같은 취지).
       한 색으로 고정하면 목록이 길어질수록 "무엇이 중요한 줄인가"가 사라진다. */
    const push = (label, tone) => { log.push({ label, at: nowHM(), tone: tone || "info" }); };
    /** 이 창에서 발급한 임시비밀번호가 언제까지 유효한가 — "10월 17일 09:00" (발급 + 24시간 · 명세 8.1) */
    const pwUntil = () => (pwAt ? fmtKoShortTime(new Date(pwAt.getTime() + TEMP_PW_TTL)) : "");
    /** 레일 접속 아이디 카드의 발급 결과 한 줄. 등록 전이면 아직 레코드가 없어 등록할 때 함께 저장된다. */
    /* ⚠️ 두 줄을 넘기지 말 것 — 길어지는 만큼 짧은 화면에서 레일을 더 굴려야 이력·맨 아래 안내가 보인다(S-04 2차부터 레일이
       혼자 스크롤하고 이력은 눌리지 않는다 — 예전엔 레일이 고정 높이라 이 줄이 자라면 이력이 그만큼 눌렸다).
       '거래처 담당자에게만 전달' 은 레일 맨 아래 안내와 같은 말이라 뺐다. */
    const pwOutText = () => (isEdit
      ? `임시비밀번호 ${pwShown} · ${pwUntil()}까지 유효 · 창을 닫으면 다시 볼 수 없습니다.`
      : `임시비밀번호 ${pwShown} · 등록하면 적용됩니다(${pwUntil()}까지 유효). 창을 닫으면 다시 볼 수 없습니다.`);
    /** 지금 저장소의 이 거래처 레코드 — 정산 일정·약관 판정은 저장된 값으로 한다(원장에서 고치는 중인 값이 아니라). */
    const storedRec = () => store.get().clients.find((c) => c.id === form.id) || form;
    /** 이 창에서 레코드를 쓰는 길(저장·상태 pill·승인·거부). form 은 창을 연 순간의 사본이라, 발급일을 바꿔 저장하면
     *  저장소가 덧붙인 발급일 이력(`invoiceDayLog`)이 form 에는 없다 — 그 form 을 한 번 더 쓰면(두 번째 저장·상태 변경)
     *  발급일이 그대로라 `withInvoiceDayLog` 가 form 을 그대로 받아 **이력이 통째로 지워졌다**(실측: 20일 → 5일 저장 뒤
     *  한 번 더 저장하면 9월분이 5일 기준으로 다시 계산돼 '9월분 마감 지남 · 자동 동의 안 함' 으로 바뀌었다 — 작성일자가 걸린 값).
     *  그래서 쓸 때마다 저장소의 지금 이력을 실어 보내고, 쓴 뒤 form 에 되받는다. */
    const writeForm = () => {
      store.updateClient({ ...form, invoiceDayLog: storedRec().invoiceDayLog });
      form.invoiceDayLog = storedRec().invoiceDayLog;
    };

    /* ── 헤더 ── */
    const hdBody = () => {
      const shared = sharedBizKeys(store.get().clients);
      const showDept = isEdit && form.department && shared.has(normalizeBiz(form.bizNumber));
      const meta = [form.accountId || "아이디 미정", isEdit ? `가입 ${form.joinDate}` : "신규 등록",
        form.bizNumber ? `사업자 ${form.bizNumber}` : null, `명세서 매월 ${invoiceDayOf(form)}일 · 동의 마감 ${deadlineDayOf(invoiceDayOf(form))}일 13:00`]
        .filter(Boolean).join(" · ");
      return html`
        <div class="ord-hd__l">
          <div class="ord-hd__row">
            <h3 class="ord-hd__no" id="modal-title">${form.companyName || (isEdit ? "거래처" : "신규 거래처 등록")}</h3>
            ${isEdit ? html`<span class="ord-hd__pill" style="background:var(--c-surface-2);color:var(--c-text-strong)">
              <span class="ord-hd__dot" style="background:${STATUS_DOT[form.status] || "var(--c-text-4)"}"></span>${form.status}</span>` : ""}
            ${/* 상태 pill 옆 — 상태와 다른 종류의 사실이라 따로 단다(시안). 약관에 동의하면 사라진다. */ ""}
            ${isEdit && termsPending(storedRec()) ? html`<span class="cli-termschip">약관 동의 전</span>` : ""}
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

    /* 신규 등록용 — 입력 두 칸. 등록하면 이 사람이 그 거래처의 첫 담당자이자 정산담당이 되고,
       카드는 위의 읽기 전용 billingCard 로 바뀐다. */
    const newBillingCard = () => html`
      <div class="rail-card">
        <div class="rail-card__hd">
          <p class="rail-card__k">정산·회계 담당자</p>
          <span class="rail-card__bdg">필수</span>
        </div>
        <input class="hm-input" data-bill="name" value="${bill.name}" placeholder="이름" aria-label="정산·회계 담당자 이름" />
        <input class="hm-input" data-bill="phone" value="${bill.phone}" placeholder="010-0000-0000" inputmode="numeric" aria-label="정산·회계 담당자 연락처" />
        <p class="rail-card__out">거래명세서 발급·동의 마감 알림을 받는 사람입니다.</p>
      </div>`;

    /* 변경 이력 — **최근 3건만** 그린다(S-04 2차 시안 ⑪). 시간순이라 최신이 아래이고 그 줄에만 면을 칠한다.
       예전엔 전부 그려 336px 안에서 굴렸는데, 그 안쪽 스크롤러 때문에 목록이 줄어들 수 있어 1280x720 에서 높이 0 이 됐다.
       이제 묶음은 줄어들지 않고(.cli-hist flex 0 0 auto) 넘침은 레일이 받는다. 4건째부터의 옛 줄은 레일에 보이지 않지만
       'N건' 에는 센다 — 서버에서는 감사 로그 거래처 영역이 정본이다(명세 8.4 · '최근 3건 + 전체 건수'를 읽는다).
       캡션의 ' · 최근 3건' 은 **3건이 넘을 때만** 붙인다 — 1건뿐인데 '최근 3건' 이라 하면 화면이 사실과 다른 말을 한다
       (시안 등록 직후 프레임의 '1건 · 최근 3건' 은 따르지 않는다). */
    const HIST_SHOWN = 3;
    const histBlock = () => {
      const shown = log.slice(-HIST_SHOWN);
      const cap = log.length > HIST_SHOWN ? `${log.length}건 · 최근 ${HIST_SHOWN}건` : `${log.length}건`;
      return html`
        <div class="ord-side__h"><b class="ord-side__t">변경 이력</b><span class="ord-side__cap">${cap}</span></div>
        <div class="cli-hist">
          ${shown.length
            ? shown.map((h, i) => html`<div class="cli-hist__row ${i === shown.length - 1 ? "is-latest" : ""}">
                <span class="cli-hist__dot cli-hist__dot--${h.tone || "info"}"></span>
                <span class="cli-hist__lbl" title="${h.label}">${h.label}</span>
                <span class="cli-hist__at">${h.at}</span></div>`)
            : html`<p class="cli-hist__empty">이 창에서 한 변경이 여기에 쌓입니다. 창을 닫으면 사라집니다 — 영속 이력은 아직 없습니다.</p>`}
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
        ${pwShown ? html`<p class="rail-card__out">${pwOutText()}</p>` : ""}
      </div>
      ${isEdit ? billingCard() : newBillingCard()}
      ${isEdit ? histBlock() : ""}
      <p class="ord-side__note">아이디·비밀번호는 거래처 담당자에게만 전달합니다.</p>`;

    /* ── 푸터 ── */
    const ftBody = () => {
      const m = missing();
      const taken = idTaken();
      const stat = m.length ? `필수 ${m.length}개 비어 있음 · ${m.join(" · ")}`
        : taken ? `접속 아이디 '${String(form.accountId).trim()}' 는 이미 쓰고 있습니다`
        : savedAt && !dirty() ? `저장됨 · ${savedAt}`
        : dirty() ? `수정한 항목 ${dirty()}개` : "변경 없음";
      const cls = m.length || taken ? "is-dirty" : savedAt && !dirty() ? "is-saved" : dirty() ? "is-dirty" : "";
      return html`
        <span class="ord-ft__stat ${cls}" data-slot="stat">${stat}</span>
        <button class="hm-btn hm-btn--secondary" data-action="close">취소</button>
        <button class="hm-btn hm-btn--primary" data-action="save" ${m.length || taken ? "disabled" : ""}>
          ${!isEdit ? "등록" : dirty() ? "변경사항 저장" : "저장"}</button>`;
    };

    /* ── 배너 ── */
    /* 배너가 없을 때 슬롯을 **숨긴다** — `.cli-pane` 이 flex column + gap 이라
       높이 0 인 빈 자식도 gap 을 한 번 먹어 카드 위에 유령 간격이 남는다.
       `:empty` 로는 안 된다(템플릿이 공백 텍스트 노드를 남긴다). */
    const hasBanner = () => isEdit && (form.status === "승인대기" || (form.status === "반려" && !!form.rejectReason)
      || justCreated || termsPending(storedRec()));

    /* 약관 동의 전 배너(S-04 시안) — 사실(첫 로그인 때 동의해야 기록) · 일정(첫 명세서 발급·동의 마감) · 결과(마감까지
       동의가 없으면 그 달은 자동 동의되지 않는다) · 연락처 · 그리고 할 일(임시비밀번호 발급)을 한 자리에 둔다.
       ⚠️ 일정은 **저장된 레코드**로 계산한다(storedRec) — 원장에서 발급일을 고치는 중이어도 저장 전에는 바뀌지 않는다.
       마감이 지난 달(held)은 거래처가 약관에 동의할 때까지 남긴다(운영자 결정 6). */
    const termsBanner = () => {
      const rec = storedRec();
      if (!termsPending(rec)) return "";
      const w = termsWatchOf(rec, new Date());
      const b = store.getBillingContactOf(form.id);
      const contact = b
        ? html`<span>연락 <b>${b.name || "이름 없음"} ${b.phone || "· 연락처 미등록"}</b></span>`
        : html`<span>연락 <b class="cli-tb__dday">정산 담당자 없음</b></span>`;
      /* 정지 중인 거래처는 로그인 자체가 막혀 있다(util/client portalBlock) — 임시비밀번호를 새로 줘도 들어와 약관에 동의할 수
         없으므로 '연락할 때 새로 발급하세요' 를 말하지 않는다. 대신 정지 중이라 로그인할 수 없고, 정지를 풀어야 약관 동의를 받을
         수 있다는 사실만 말한다(2026-10-16 결정 E — 배너 모양은 그대로, 글자만). 대쉬보드 약관 경고가 정지 거래처를 빼는 것과
         같은 이유다. 상태 pill 을 바꾸면 renderBanner 가 다시 그리므로 저장된 레코드(rec)의 상태를 본다. */
      const suspended = rec.status === "정지";
      const SUSP = "정지 중이라 거래처가 로그인할 수 없습니다. 정지를 풀어야 첫 로그인 때 약관 동의를 받을 수 있습니다.";
      const pwCap = pwShown && isEdit ? `발급 완료 · ${pwUntil()}까지 유효`
        : suspended ? "24시간 유효 · 정지 중 로그인 불가"
        : "24시간 유효 · 연락할 때 새로 발급";
      const pwTail = suspended ? SUSP : "임시비밀번호는 24시간만 유효하니 연락할 때 새로 발급하세요.";
      let facts = "";
      let foot;
      if (!w) {
        /* 귀속월 = 배송일의 달(2026-10-15 결정) — '첫 주문이 생기면 다음 달' 이 아니라 배송일 기준으로 말한다. */
        foot = `아직 거래가 없어 첫 명세서 일정이 없습니다. 주문이 생기면 배송일이 속한 달의 다음 달 ${invoiceDayOf(rec)}일 10:00에 첫 명세서가 발급되고, `
          + "그 달 마감까지 약관 동의가 없으면 자동 동의되지 않습니다. " + (suspended ? SUSP : "임시비밀번호는 24시간만 유효합니다.");
      } else {
        const n = w.next;
        const heldOne = w.held.length === 1 ? w.held[0] : null;
        facts = html`
          ${/* 지난 달은 한 줄을 통째로 쓴다 — 다음 명세서의 '동의 마감'과 한 줄에 섞이면 어느 달의 마감인지 흐려진다. */ ""}
          ${w.held.length ? html`<span class="cli-tb__held"><b>${monthsShort(w.held)}</b>${heldOne ? html` 동의 마감 <b>${fmtKoShortTime(heldOne.deadline)}</b>` : ""}
            <b class="cli-tb__dday">마감 지남 · 자동 동의 안 함</b></span>` : ""}
          ${n ? html`<span>${n.first ? "첫" : "다음"} 명세서 <b>${fmtKoShortTime(n.issueAt)}</b>${n.phase === "open"
            ? html` <b class="cli-tb__dday">발급 완료</b>`
            : html` 발급 <b class="cli-tb__dday">${/* '발급 오늘 발급' 이 되지 않게(목록의 ddayText 는 앞에 '발급' 이 없다) */ n.dDay <= 0 ? "오늘" : `D-${n.dDay}`}</b>`}</span>
            <span>동의 마감 <b>${fmtKoShortTime(n.deadline)}</b></span>` : ""}
          ${contact}`;
        foot = w.held.length
          ? `${monthsShort(w.held)}은 약관 동의 전에 마감이 지나 자동 동의되지 않았습니다 — 거래처가 약관에 동의한 뒤 거래명세서에서 직접 동의해야 계산서가 나갑니다. `
            + (n ? "다음 명세서도 마감까지 약관 동의가 없으면 자동 동의되지 않습니다. " : "")
            + pwTail
          /* 동의를 기다리는 달이 하나도 없는 경우 — 거래가 0원 주문뿐이라 발행과 함께 닫혔다(가입 혜택 '1회 무료').
             '이 달은' 이라고 하면 가리킬 달이 없다(실측) — 거래 없음 문구에서 '아직 거래가 없어'만 뺀 말로 잇는다. */
          : !n ? `주문이 생기면 배송일이 속한 달의 다음 달 ${invoiceDayOf(rec)}일 10:00에 명세서가 발급되고, `
            + "그 달 마감까지 약관 동의가 없으면 자동 동의되지 않습니다. " + pwTail
          : "마감까지 약관 동의가 없으면 이 달은 자동 동의되지 않습니다. " + pwTail;
      }
      return html`
        <div class="cli-banner cli-banner--terms">
          <div class="cli-banner__msg">
            <p class="cli-tb__lead"><b>약관 동의 전</b> · 거래처가 첫 로그인 때 이용약관에 동의하면 기록됩니다.</p>
            ${facts ? html`<div class="cli-tb__facts">${facts}</div>` : ""}
            <p class="cli-tb__foot">${foot}</p>
          </div>
          <div class="cli-tb__act">
            <button type="button" class="cli-tb__btn" data-action="reset-pw">임시비밀번호 발급</button>
            <p class="cli-tb__cap">${pwCap}</p>
          </div>
        </div>`;
    };
    const banners = () => html`
      ${isEdit && form.status === "승인대기" ? html`
        <div class="cli-banner cli-banner--wait">
          <span class="cli-banner__msg"><b>가입 승인 심사</b> · ① 사업자등록증의 사업자번호·대표자명 확인
            ② 단가 조정 <em class="cli-banner__state">${priceState(form.id)}</em> ③ 승인</span>
          <span class="cli-banner__acts">
            <button class="cli-banner__btn cli-banner__btn--rej" data-action="reject">거부</button>
            <button class="cli-banner__btn cli-banner__btn--sub" data-action="to-pricing">단가 조정</button>
            <button class="cli-banner__btn cli-banner__btn--ok" data-action="approve">승인</button>
          </span>
        </div>` : ""}
      ${isEdit && form.status === "반려" && form.rejectReason ? html`
        <div class="cli-banner cli-banner--rej"><span class="cli-banner__msg"><b>거부 사유</b> · ${form.rejectReason}</span></div>` : ""}
      ${/* 등록 직후 → 약관 동의 전 순(S-04 시안). 가입 심사 배너가 먼저다 — 그 거래처의 지금 할 일이 승인이다. */ ""}
      ${isEdit && justCreated ? html`
        <div class="cli-banner cli-banner--new" role="status"><span class="cli-banner__msg"><b>방금 등록했습니다</b> · 아이디 <b>${form.accountId}</b>와
          임시비밀번호를 거래처 담당자에게 전달하세요. 첫 로그인 때 이용약관에 동의합니다.</span></div>` : ""}
      ${isEdit ? termsBanner() : ""}`;

    const body = () => html`
      <div class="hm__head ord-hd" data-slot="hd">${hdBody()}</div>
      <div class="cli-grid">
        <aside class="ord-side" data-slot="rail">${railBody()}</aside>
        <div class="cli-pane">
          <div class="cli-banners" data-slot="banner" ${hasBanner() ? "" : "hidden"}>${banners()}</div>
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
    /* 레일 슬롯(aside)이 곧 레일의 스크롤러다(S-04 2차 — `.modal-panel--cli .ord-side`). 다시 그릴 때 **굴려 둔 자리를 지킨다** —
       상태 pill·발급·첨부마다 레일이 맨 위로 튀면 이력을 보던 사람이 자리를 잃는다. 새 이력이 생겨도 저절로 굴리지 않는다
       (시안: '안 보이는 부분은 레일만 굴립니다' — 사람에게 맡긴다 · 변경은 토스트가 이미 알린다).
       예전의 `histEnd`(안쪽 336px 목록을 끝까지 내리기)는 안쪽 스크롤러가 없어져 지웠다. */
    const renderRail = () => {
      const e = slot("rail");
      if (!e) return;
      const top = e.scrollTop;
      setHTML(e, railBody());
      e.scrollTop = top;
    };
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
      if (k === "bizNumber") onBizInput(t); // 하이픈 정형 — 포털 회사정보 수정과 같은 규칙(util/biz.js)
      form[k] = t.value;
      touched[k] = 1;
      if (t.tagName === "TEXTAREA") autosize(t);
      if (k === "bizNumber" || k === "ceoName" || k === "department") syncStatics();
      if (k === "companyName" || k === "accountId" || k === "bizNumber") renderHd();
      renderFt();
    });
    on(panel, "input", "[data-bill]", (e, t) => {
      const k = t.dataset.bill;
      bill[k] = k === "phone" ? onPhoneInput(t) : t.value;
      touched[`bill.${k}`] = 1;
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
        writeForm();
        push("가입 거부 · 사유 통보", "danger");
        renderHd(); renderBanner(); renderRail(); refreshList();
      });
      form.status = v;
      if (v !== "반려") form.rejectReason = "";
      writeForm();
      push(`상태 변경 · ${v}`, v === "활성" ? "ok" : v === "반려" ? "danger" : "warn");
      renderHd(); renderBanner(); renderRail(); refreshList();
      toast(`${v}(으)로 변경했습니다`);
    });
    /* 저장하지 않은 편집을 두고 단가 화면으로 가면 편집이 사라진다(라우터가 모달을 닫는다) — 막고 이유를 말한다. */
    const canLeave = () => {
      if (!dirty()) return true;
      toast("저장하지 않은 변경이 있습니다 · 먼저 저장해 주세요", "warn");
      return false;
    };
    on(panel, "click", "[data-action='to-pricing']", () => { if (canLeave()) goPricing(form.id); });
    on(panel, "click", "[data-action='approve']", () => confirmApprove(form, () => {
      form.status = "활성"; form.rejectReason = "";
      writeForm();
      push("가입 승인 · 활성 전환", "ok");
      renderHd(); renderBanner(); renderRail(); refreshList();
      toast(`${form.companyName} 거래처를 승인했습니다 · 환영 알림이 발송되었습니다`);
    }, canLeave));
    on(panel, "click", "[data-action='reject']", () => openReject(form, (reason) => {
      form.status = "반려"; form.rejectReason = reason;
      writeForm();
      push("가입 거부 · 사유 통보", "danger");
      renderHd(); renderBanner(); renderRail(); refreshList();
    }));

    on(panel, "click", "[data-action='menu']", () => { menuOpen = !menuOpen; renderHd(); });
    /* 임시비밀번호 발급 — **누르는 즉시 적용**한다(S-04). 저장 버튼에 태우면 배너의 '…까지 유효'가 거짓말이 되고,
       관리자가 비밀번호만 알려 주고 창을 닫으면 그 비밀번호로는 들어갈 수 없었다.
       ⚠️ 레코드에는 **password 만** 쓴다 — 저장소의 지금 레코드 위에 덮는다. `{ ...form }` 을 넘기면 원장에서
          고치던(아직 저장하지 않은) 칸까지 같이 저장된다. 원장 편집은 form 에 그대로 남아 '수정한 항목'으로 센다.
       신규 등록 창(isEdit=false)은 아직 레코드가 없어 form 에만 두고 등록할 때 함께 저장한다. */
    const issueTempPassword = () => {
      const pw = makeTempPassword();
      pwShown = pw;
      pwAt = new Date();
      form.password = pw; // 나중에 원장을 저장해도 옛 비밀번호로 되돌아가지 않게
      if (isEdit) store.updateClient({ ...storedRec(), password: pw });
      else touched.password = 1;
      push("임시비밀번호 발급", "warn");
    };
    on(panel, "click", "[data-action='reset-pw']", (e, t) => {
      /* 누른 자리를 기억한다 — 레일·배너·⋯ 메뉴가 다시 그려져도 키보드 포커스가 같은 자리로 돌아오게 */
      const from = t.closest("[data-slot]");
      const where = from ? from.dataset.slot : "";
      issueTempPassword();
      menuOpen = false;
      renderHd(); renderRail(); renderBanner(); renderFt();
      const back = where === "hd" ? qs(panel, "[data-action='menu']") : qs(panel, `[data-slot='${where}'] [data-action='reset-pw']`);
      if (back) back.focus();
      toast(isEdit ? `임시비밀번호를 발급했습니다 · ${pwUntil()}까지 유효합니다` : "임시비밀번호를 발급했습니다 · 등록하면 적용됩니다");
    });
    /* 담당자 관리 — 원장 **위에 스택**으로 연다. 화면을 옮기지 않으므로 작성 중인
       원장 편집이 살아 있다. ⚠️ 핸들을 `activeModal` 에 담지 말 것(→ contacts-modal.js). */
    on(panel, "click", "[data-action='go-contacts']", () => {
      /* 약관 배너의 '연락' 줄이 정산 담당자를 읽는다 — 담당자를 고치면 배너도 같이 다시 그린다. */
      openContactsModal({ client: form, toast, onChange: () => { renderRail(); renderBanner(); refreshList(); } });
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
      if (idTaken()) { toast("이미 쓰고 있는 접속 아이디입니다", "warn"); return; }
      const created = !isEdit;
      if (created) {
        form.accountId = String(form.accountId).trim(); // 로그인이 아이디를 trim 해 비교한다
        /* 관리자 등록 거래처는 임시비밀번호로 처음 로그인한다(명세 3.1) — 발급하지 않고 등록하면 들어갈 길이 없는
           계정이 생긴다(로그인은 언제나 비밀번호를 검사한다). 등록 직후 배너가 '임시비밀번호를 전달하세요'라고
           말하므로 아직 없으면 여기서 발급한다(S-04 시안 — 등록 순간 레일에 비밀번호가 찍혀 있다). */
        if (!pwShown) issueTempPassword();
        /* 대표 연락처 키(managerName·contact)는 정산 명세서·주문 모달이 읽는다 — 비어 있으면 정산담당으로 채운다(가입과 같은 규칙). */
        if (!String(form.managerName ?? "").trim()) form.managerName = bill.name.trim();
        if (!String(form.contact ?? "").trim()) form.contact = bill.phone;
        store.addClient({ ...form });
        store.setContactsOf(form.id, [{
          id: newContactId(), name: bill.name.trim(), role: "", phone: bill.phone,
          message: MSG_RECEIVE, isBilling: true,
        }]);
        isEdit = true; // 이제 이 창은 방금 만든 거래처의 수정 창이다 — 헤더·레일·배너가 그 모습으로 바뀐다
        justCreated = true;
      } else writeForm();
      savedAt = nowHM();
      Object.keys(touched).forEach((k) => delete touched[k]);
      push(created ? "거래처 등록" : "거래처 정보 저장", "ok");
      if (created) renderHd();
      /* 저장한 발급일이 약관 배너의 일정을 바꾼다(배너는 저장된 레코드로 계산한다) — 수정 저장 때도 다시 그린다. */
      renderBanner();
      renderFt(); renderRail(); refreshList();
      toast(created ? `${form.companyName} 거래처를 등록했습니다` : "거래처 정보를 저장했습니다");
    });

    qsa(panel, "textarea").forEach(autosize);
  }

  // ── approve / reject ───────────────────────────────────
  function approve(client) {
    confirmApprove(client, () => {
      store.updateClient({ ...client, status: "활성", rejectReason: undefined });
      refreshList();
      toast(`${client.companyName} 거래처를 승인했습니다 · 환영 알림이 발송되었습니다`, "ok");
    });
  }

  /* 가입은 **신청 → 단가 조정 → 승인** 순서다(2026-09-29 사용자 지시). 승인 두 경로(목록 버튼·모달 배너)가
     이 함수 하나를 지난다. 맞춤 단가가 없으면 한 번 묻는다 — 정가 거래가 맞는 거래처도 있으니 막지는 않는다.
     맞춤 단가 = 저장된 양수 오버라이드(단가 화면이 정가와 같은 값·0 은 저장하지 않는다 — 같은 정의다). */
  function customPriceCount(id) {
    return Object.values(store.get().clientPrices[id] || {}).filter((v) => Number(v) > 0).length;
  }
  function priceState(id) {
    const n = customPriceCount(id);
    return n ? `맞춤 ${n}종` : "아직 없음 · 정가";
  }
  function goPricing(id) {
    setFocusClient("pricing", id);
    nav("#/admin/pricing");
  }
  function confirmApprove(client, doApprove, canLeave = () => true) {
    if (customPriceCount(client.id)) return doApprove();
    const d = openDialog({
      eyebrow: client.companyName,
      title: "단가를 조정하지 않았습니다",
      width: 460,
      body: html`<p class="dlg-desc">이 거래처에는 맞춤 단가가 없습니다. 이대로 승인하면 <b>모든 상품을 정가로</b> 거래하고,
        가입 완료 알림이 바로 나갑니다.</p>`,
      hint: "계약 단가가 있으면 먼저 단가를 조정하세요",
      actions: html`
        <button class="hm-btn hm-btn--secondary" data-action="to-pricing">단가 조정하기</button>
        <button class="hm-btn hm-btn--primary" data-action="ok">정가로 승인</button>`,
    });
    on(d.panel, "click", "[data-action='to-pricing']", () => {
      if (!canLeave()) return;
      d.close();
      goPricing(client.id);
    });
    on(d.panel, "click", "[data-action='ok']", () => { d.close(); doApprove(); });
  }

  /** 가입 거부 — 사유는 필수. onDone(reason) 이 있으면 저장은 호출부가 한다(모달 안에서 호출).
      ⚠️ 이 다이얼로그는 거래처 모달 **위에 스택**된다 — 핸들을 `activeModal` 에 담으면 안 된다.
         담았더니 아래 거래처 모달의 핸들이 덮여 사라지고, `closeModal()` 만 보는 X·취소 버튼이
         그 뒤로 **무반응**이 됐다(ESC 와 라우터의 closeAllModals 로만 닫혔다). 로컬 핸들을 쓴다. */
  /* 가입 거부 사유 — 공용 다이얼로그 규격(util/dialog.js, 2026-09-26 이식). 거래처 모달 **위에 스택**되므로
     핸들은 지역 변수다(페이지의 activeModal 에 담으면 아래 모달의 핸들이 덮인다 — 규약의 그 결함).
     사유가 **어디로 가는지**를 캡션이 말한다: 알림톡 T10(명세 9.4)과 로그인 화면(util/client.js portalBlock). */
  function openReject(client, onDone) {
    if (!onDone) closeModal();
    const HINT_OFF = "사유를 적어야 거부할 수 있습니다";
    const HINT_ON = "거부하면 상태가 '반려'로 바뀌고 신청자에게 알림톡이 갑니다";
    const d = openDialog({
      eyebrow: client.companyName,
      title: "가입을 거부할까요?",
      width: 480,
      bodyClass: "dlg-body--sections",
      body: html`
        <p class="dlg-desc"><b>${client.companyName}</b>의 가입 신청을 반려합니다. 신청자는 로그인할 수 없고, 로그인을 시도하면 이 사유를 봅니다.</p>
        <section>
          ${dlgRule({ t: "거부 사유", cap: "신청자에게 그대로 전달됩니다" })}
          <div class="dlg-rows">
            ${dlgRow({ k: "사유", req: true, top: true, htmlFor: "reject-reason",
              v: html`<textarea class="ord-in" id="reject-reason" data-reason rows="3" placeholder="예) 사업자등록증과 입력한 사업자번호가 다릅니다"></textarea>` })}
          </div>
        </section>`,
      hint: HINT_OFF,
      hintBlock: true,
      actions: dlgActions({ ok: "가입 거부", okClass: "hm-btn--danger", disabled: true }),
    });
    const ta = qs(d.panel, "[data-reason]");
    const btn = qs(d.panel, "[data-action='ok']");
    autosize(ta);
    on(d.panel, "input", "[data-reason]", () => {
      autosize(ta);
      const ok = !!ta.value.trim();
      btn.disabled = !ok;
      d.setHint(ok ? HINT_ON : HINT_OFF, !ok); /* 버튼만 흐려 두지 않는다 — 왜 못 누르는지 푸터가 말한다 */
    });
    on(d.panel, "click", "[data-action='ok']", () => {
      const reason = ta.value.trim();
      if (!reason) return;
      d.close();
      if (onDone) onDone(reason);
      else { store.updateClient({ ...client, status: "반려", rejectReason: reason }); closeModal(); refreshList(); }
      toast(`${client.companyName} 가입을 거부했습니다 · 사유가 통보되었습니다`, "warn");
    });
    ta.focus();
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
    if (a === "terms-only") {
      state.termsOnly = !state.termsOnly;
      /* 켜면 '약관 동의 전' 계정이 든 묶음을 펼친다(시안) — 접힌 채면 걸러 낸 자식이 묶음 줄 뒤에 숨는다.
         state.expanded 에 넣으므로 사용자가 다시 접을 수 있다(검색의 자동 펼침과 다르다). */
      if (state.termsOnly) {
        const clients = store.get().clients;
        const shared = sharedBizKeys(clients);
        clients.filter(termsPending).forEach((c) => {
          const k = normalizeBiz(c.bizNumber);
          if (shared.has(k)) state.expanded.add(k);
        });
      }
      /* 칩은 다시 그리지 않고 상태만 바꾼다 — 다시 그리면 키보드 포커스가 칩에서 떨어진다. */
      t.classList.toggle("is-on", state.termsOnly);
      t.setAttribute("aria-pressed", state.termsOnly ? "true" : "false");
      refreshTableOnly();
      return;
    }
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

  /* 단가 화면의 '승인하러 가기'로 돌아왔으면 그 거래처 창을 바로 연다 — 승인 배너가 거기 있다. */
  const back = takeFocusClient("clients");
  if (back && findClient(back)) openClientModal(findClient(back));

  return () => {
    offClick();
    offSearch();
    closeModal();
    toast.destroy();
  };
}
