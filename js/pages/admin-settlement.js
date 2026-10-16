/* ============================================================
   admin-settlement.js — 거래처 정산회계 (#/admin/settlement · 시안 'S-01 관리자 정산회계' · 2026-10-16)

   위에서부터: 머리글 · 필터 카드(.bf-* — 상태 탭 5개 + 건수 · 귀속월 스테퍼 · 저번달/이번달 · 거래처 검색)
   · 정산 표(머리 한 줄 요약 + 8칸 한 줄 표 + 줄 펼침) · '월간 분석' 접힘 줄(펼치면 예전 분석 블록 그대로).
   예전엔 분석 블록과 요약 카드 3장이 표 위에 있어 1440x900 에서 표가 첫 화면에 안 보였다(1,501px 지점).

   ── 규칙 ──
   · 상태는 `settlementOf`(util/settlement.js) 값만 찍는다 — 화면이 날짜로 상태를 짐작하지 않는다(명세 6.6).
   · 단계 셀은 공용 `settleMark`(util/settle-mark.js — ✓ 끝남 · ● 지금 · - 아직). 끝난 단계의 근거(동의 시각·수동/자동 ·
     작성일자 · 승인번호)는 title + .sr-only 로 남긴다 — 세무 근거라 버리지 않는다. 지금 단계의 기한·사유는 '기한 · 비고' 칸.
   · 빨간 글씨는 동의 마감 24시간 전부터 · 기한 초과 · 동의 뒤 30분 넘게 계산서가 안 나간 달(시안).
   · 조치 필요 = `needsAction`(보류 3종 · 계산서 발급 전에 머문 달 · 기한 초과 · 알림 수신자 없음) — 대쉬보드
     '정산 진행' 카드와 같은 판정이다. 그 카드의 '연락 필요' 칩·'조치 필요 열기' 는 지난달 한 달, '기한 초과' 칩만 최근
     6개월 전체의 OVERDUE 줄을 센다(사용자 결정 B — 지난달은 정산기한이 이번 달 말일이라 기한 초과가 될 수 없다). 이 표는
     언제나 한 달씩이다. 그 줄의 처리 버튼은 채운 주황.
   · 처리 칸 버튼은 하나 — AGREED 면 '발급 처리', ISSUED·OVERDUE 면 '입금 확인'(작은 창 — util/settle-dialogs.js).
     쓰기가 성공하면 **그 줄만** 다시 그린다(펼침 상태 보존 · 포커스는 그 줄의 펼침 버튼으로).
   · 줄 아무 데나 누르면 펼친다(onRowOpen 과 같은 가드 — 안쪽 컨트롤·드래그 선택은 비켜 간다). 키보드는 줄 끝의
     펼침 버튼이 맡는다 — 줄에 tabindex 를 달면 Tab 순서에 거래처 수만큼 끼어든다.
   · 이의는 고객센터로 받고 직원이 그 달 주문을 바로 고친다(2026-10-15 운영자 결정) — 이 화면에 따로 절차·상태를 두지 않는다.
   · 시안에 없는 새 표시(지금 고칠 수 있는지 · 발급 때↔지금 금액 · 금액 변경 기록)는 짓지 않는다(운영자 결정 1 — 디자이너 몫).

   ── 화면 사이 넘겨주기(session.js — 꺼내면 지운다) ──
   받기: takeFocusSection("admin-settlement") 가 "action" → '조치 필요' 탭으로 연다(대쉬보드 '조치 필요 열기').
         "action:YYYY-MM" → 그 달 · '조치 필요' 탭(대쉬보드 '기한 초과 N' 칩 — 기한 초과가 있는 가장 오래된 달).
         "period:YYYY-MM" + takeFocusClient("admin-settlement") → 그 달로 옮기고 그 줄을 펼쳐 화면에 보인다(주문 상세 '정산 귀속').
         두 'YYYY-MM' 꼴 모두 6개월 창 밖의 달이면 스테퍼 범위를 그 달까지 넓힌다.
   · 표 머리 '미입금' 은 util/settlement `isUnpaid`(명세서가 나간 달 전부 · 0원·거래 없음·발행 전 제외) — 월간 분석·대쉬보드와 같다.
   보내기: '이 거래처 · M월 주문 보기' → setFocusClient("orders", id) + setFocusSection("orders", "deliver:YYYY-MM").
   ============================================================ */
import { html, setHTML, on, qs, qsa, raw, won } from "../dom.js";
import { icon } from "../icons.js";
import { store } from "../store.js";
import { pageTitle } from "../ui.js";
import { makeToast } from "../toast.js";
import { USAGE_CATEGORIES, DATA_NOW } from "../data/admin-mock.js";
/* 정산 상태·청구 근거는 B2B 주문(배송일의 달)에서 파생한다(2026-10-16 — 주문과 정산 연결). 청구금액·펼친 품목·리포트가 같은 소스. */
import {
  settlementOf, settlementsMap, usageMap, billingEntriesOf, needsAction, isUnpaid, invoiceDocNoteOf, invoiceMonth,
} from "../util/settlement.js";
import {
  periodOf, periodLabel, shiftPeriod, fmtMd, fmtMdHm, fmtKoShort, fmtKoShortTime, HOLD_LABEL,
} from "../data/settlement-rules.js";
import { sharedBizKeys, normalizeBiz, displayName } from "../util/biz.js";
import { termsPending } from "../util/client.js";
import { buildMonthlyReport } from "../data/report.js";
import { issueLink, publicInvoiceUrl, SUPPLIER, ACCOUNT } from "../data/invoice-links.js";
import { invoiceDoc, printInvoiceDoc } from "../invoice-doc.js";
import { reportDoc } from "../report-doc.js";
import { setFocusClient, setFocusSection, takeFocusClient, takeFocusSection } from "../session.js";
import { settleMark } from "../util/settle-mark.js";
import { openIssueDialog, openPaymentDialog } from "../util/settle-dialogs.js";

const TABS = [
  { v: "all", label: "전체" },
  { v: "action", label: "조치 필요" },
  { v: "agree", label: "동의 전" },
  { v: "billing", label: "계산서 · 입금" },
  { v: "done", label: "정산완료" },
];
const HEADERS = [
  ["거래처", "name"], ["청구금액", "amt"], ["명세서 동의", ""], ["계산서", ""], ["거래대금", ""],
  ["기한 · 비고", ""], ["처리", "act"], ["링크 · PDF", "docs"],
];
/* 도넛/범례 9색 — 항목별(상품 9종) 비중이 겹치지 않도록 인접 대비 순으로 배치 */
const DONUT_VARS = ["var(--c-orange)", "var(--c-blue)", "var(--c-success)", "var(--ch-purple)", "var(--c-warn)", "var(--ch-cyan)", "var(--ch-pink)", "var(--ch-lime)", "var(--ch-slate)"];
const pad = (n) => String(n).padStart(2, "0");
const man = (n) => Math.round(n / 10000); // 만원 단위
const DAY = 864e5, MIN = 6e4;
const YM_RE = /^\d{4}-\d{2}$/;
const TOP_ITEMS = 4; // 품목을 다 펼치면 펼침이 표를 밀어낸다 — 나머지는 한 줄로 접는다
const monthOf = (ym) => Number(ym.slice(5, 7));
const modeWord = (m) => (m === "auto" ? "자동" : "수동");
/** 남은 시간 — "2일 3시간" · "3시간 20분" · "15분" */
function span(ms) {
  const m = Math.max(0, Math.floor(ms / MIN));
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mi = m % 60;
  return d ? `${d}일 ${h}시간` : h ? `${h}시간 ${mi}분` : `${mi}분`;
}
/** 지난 시간 — "2일" · "3시간" · "12분" */
function ago(ms) {
  const m = Math.max(0, Math.floor(ms / MIN));
  return m >= 1440 ? `${Math.floor(m / 1440)}일` : m >= 60 ? `${Math.floor(m / 60)}시간` : `${m}분`;
}

/* KPI 전월 대비 증감 배지 (▲ 증가=레드워시 · ▼ 감소=블루워시 · 중립=그레이) */
function deltaBadge(delta, suffix = "원") {
  if (delta == null) return html`<span class="kpi__delta flat">전월 데이터 없음</span>`;
  if (delta === 0) return html`<span class="kpi__delta flat">지난달과 동일</span>`;
  const up = delta > 0;
  return html`<span class="kpi__delta ${up ? "up" : "down"}">${up ? "▲" : "▼"} ${Math.abs(delta).toLocaleString("ko-KR")}${suffix}</span>`;
}

/* ── 단계 셀 — settlementOf 값만 읽는다 ───────────────────────────────
   반환: { kind, label, tone, meta(보이는 기한·사유 — 지금 단계면 '기한 · 비고' 칸에), tip, hot, amb } */
const NONE = { kind: "none" };
function agreeStage(client, s, now) {
  if (s.status === "SCHEDULED") return { kind: "live", label: "발급예정", tone: "gray", meta: `${fmtMdHm(s.issueAt)} 발행`, tip: `${fmtKoShortTime(s.issueAt)}에 명세서가 발행됩니다` };
  if (s.status === "AWAITING_AGREEMENT") {
    const dl = fmtKoShortTime(s.deadline);
    /* 자동 동의 보류 3종(명세 6.6 autoAgreeHold) — 낱말은 settlement-rules HOLD_LABEL 한 벌. '보류' 는 Q19·Q20 둘에만 쓴다
       (약관 동의 전은 보류가 아니라 의제 조항이 없는 것이다 — 그래서 상태 낱말도 '동의대기' 다). */
    if (s.autoAgreeHold) {
      return {
        kind: "live", label: s.autoAgreeHold === "TERMS_NOT_AGREED" ? "동의대기" : "동의 보류", tone: "amber",
        meta: HOLD_LABEL[s.autoAgreeHold],
        /* 1280 에서는 칸이 좁아 낱말이 잘린다 — 마우스 올림 설명은 낱말부터 다시 말한다 */
        tip: `${HOLD_LABEL[s.autoAgreeHold]} — 마감 ${dl} 지남 · 거래처가 직접 동의할 수 있습니다`,
      };
    }
    /* 약관 동의 전 거래처의 마감 전 달 — 마감이 와도 자동 동의되지 않는다는 것을 미리 말한다(시안). */
    if (termsPending(client)) return { kind: "live", label: "동의대기", tone: "orange", meta: HOLD_LABEL.TERMS_NOT_AGREED, amb: true, tip: `${HOLD_LABEL.TERMS_NOT_AGREED} — 마감 ${dl} · 약관에 동의하기 전에는 마감에 자동 동의되지 않습니다` };
    const left = s.deadline.getTime() - now.getTime();
    if (left <= 0) return { kind: "live", label: "동의대기", tone: "orange", meta: `마감 ${fmtMdHm(s.deadline)} 지남`, hot: true, tip: `마감 ${dl}` };
    const soon = left <= DAY;
    return { kind: "live", label: "동의대기", tone: "orange", meta: soon ? `마감까지 ${span(left)}` : `마감 ${fmtMdHm(s.deadline)}`, hot: soon, tip: `마감 ${dl}` };
  }
  if (s.mode) return { kind: "done", label: "동의완료", meta: `${fmtMdHm(s.agreedAt)} · ${modeWord(s.mode)}` };
  return NONE;
}
function invStage(s, now) {
  if (s.status === "AGREED") {
    const d = now.getTime() - s.agreedAt.getTime();
    /* 정상이면 아주 짧게 지나간다. 30분을 넘겨 머물면 발급이 실패한 달(T15 로 알린다 — 표에 '실패' 표시는 두지 않는다 M59). */
    return d < 30 * MIN
      ? { kind: "live", label: "발급 중", tone: "gray", meta: `동의 후 ${ago(d)}` }
      : { kind: "live", label: "발급 전", tone: "amber", meta: `동의 후 ${ago(d)}`, hot: true, tip: `${fmtKoShortTime(s.agreedAt)} ${modeWord(s.mode)} 동의 · 계산서가 발급되지 않았습니다` };
  }
  if (s.einvoice) {
    const no = `승인번호 ${s.einvoice.no}${s.einvoice.mode === "manual" ? " · 직접 입력" : ""}`;
    return { kind: "done", label: "발급완료", meta: `작성 ${fmtMd(s.docDate)} · ${no}` , vis: `작성 ${fmtMd(s.docDate)}` };
  }
  return NONE;
}
function payStage(s, now) {
  if (s.status === "PAID" && s.paidAt) return { kind: "done", label: "입금완료", meta: `${fmtMd(s.paidAt)} 입금 확인`, tip: `${fmtKoShortTime(s.paidAt)} 입금 확인` };
  if (s.status === "OVERDUE") {
    const days = Math.max(1, Math.floor((now.getTime() - s.overdueAt.getTime()) / DAY));
    return { kind: "live", label: "기한 초과", tone: "red", meta: `${days}일 지남`, hot: true, tip: `정산기한 ${fmtKoShort(s.dueAt)} · ${fmtKoShortTime(s.overdueAt)}부터 기한 초과` };
  }
  if (s.status === "ISSUED") return { kind: "live", label: "미입금", tone: "gray", meta: `기한 ${fmtMd(s.dueAt)}`, tip: `정산기한 ${fmtKoShort(s.dueAt)} · ${fmtKoShortTime(s.overdueAt)}부터 기한 초과` };
  return NONE;
}
/** 세 칸 + '기한 · 비고'(지금 단계의 기한·사유 — 없으면 마지막으로 끝난 단계). 0원 달·거래 없는 달은 세 칸을 한 칸으로. */
function stagesOf(client, s, now) {
  if (s.status === "NONE") return { merged: { none: true, text: "거래 없음 · 명세서 없음" }, cur: null };
  if (s.zero && s.status === "PAID") {
    const z = { kind: "done", label: "0원 · 계산서 없음", tone: "gray", meta: "0원 주문만 있는 달 · 입금 없음", tip: "동의 · 계산서 · 입금 없이 입금완료 처리된 달입니다. 실제 입금은 없습니다" };
    return { merged: z, cur: z };
  }
  const cells = [agreeStage(client, s, now), invStage(s, now), payStage(s, now)];
  const cur = cells.find((c) => c.kind === "live") || [...cells].reverse().find((c) => c.kind === "done") || null;
  return { cells, cur };
}

/** 처리 칸 — 버튼은 하나(지금 상태에서 하는 일). 버튼이 없는 조치 필요 줄은 '연락 필요'(대쉬보드 칩과 같은 낱말). */
function actOf(s, need) {
  if (!s.zero && s.status === "AGREED") return { btn: "issue", label: "발급 처리", full: "계산서 발급 처리" };
  if (s.status === "ISSUED" || s.status === "OVERDUE") return { btn: "pay", label: "입금 확인", full: "입금 확인" };
  if (need) return { text: "연락 필요", need: true };
  if (s.zero || s.status === "NONE") return { text: "처리 없음" };
  if (s.status === "SCHEDULED") return { text: "발행 후 처리" };
  if (s.status === "AWAITING_AGREEMENT") return { text: "동의 후 처리" };
  return { text: "처리 완료" };
}

/** 펼침 '처리' 카드 — 동작마다 [할 수 있나, 그 이유]. 못 하는 이유는 글자로 그 자리에서 말한다(마우스 올림에 숨기지 않는다). */
function availOf(s) {
  let issue, pay;
  if (s.status === "NONE") issue = [false, "거래가 없는 달은 명세서가 없습니다"];
  else if (s.zero) issue = [false, "0원 달은 계산서가 없습니다"];
  else if (s.status === "AGREED") issue = [true, `${fmtMdHm(s.agreedAt)} ${modeWord(s.mode)} 동의 · 계산서가 아직 발급되지 않았습니다`];
  else if (s.einvoice) issue = [false, `발급완료 · 승인번호 ${s.einvoice.no}${s.einvoice.mode === "manual" ? " · 직접 입력" : ""}`];
  else if (s.status === "SCHEDULED") issue = [false, `명세서 발행 전입니다. ${fmtKoShortTime(s.issueAt)}에 발급됩니다`];
  else issue = [false, "동의 전에는 계산서를 발급할 수 없습니다"];
  if (s.status === "NONE") pay = [false, "청구할 금액이 없는 달입니다"];
  else if (s.zero) pay = [false, "0원 달은 입금 없이 입금완료 처리됩니다"];
  else if (s.status === "ISSUED" || s.status === "OVERDUE") pay = [true, `${won(s.amount)} 전액 · 정산기한 ${fmtKoShort(s.dueAt)}`];
  else if (s.status === "PAID" && s.paidAt) pay = [false, `${fmtKoShortTime(s.paidAt)} 입금 확인`];
  else pay = [false, "계산서 발급 뒤에 입금을 확인합니다"];
  return { issue, pay };
}

/** 펼침 '진행 기록' — 발행 · 마감(보류) · 동의 · 발급 · 기한 초과 · 입금. 시간순. */
function logOf(s, ct, now) {
  const L = [];
  const reach = ct && String(ct.phone || "").trim();
  if (s.status === "SCHEDULED") L.push([s.issueAt, "명세서 발행 예정", "자동"]);
  else if (s.status === "NONE") return [];
  else L.push([s.issueAt, "명세서 발행", reach ? `발급 안내 → ${ct.name}` : "알림 수신자 없음 · 안내를 보내지 못했습니다"]);
  if (s.autoAgreeHold && now.getTime() > s.deadline.getTime()) {
    const terms = s.autoAgreeHold === "TERMS_NOT_AGREED";
    L.push([s.deadline, terms ? "마감 · 자동 동의 안 함" : "마감 · 자동 동의 보류", HOLD_LABEL[s.autoAgreeHold].split(" · ")[0]]);
  }
  if (s.agreedAt) L.push([s.agreedAt, s.mode === "auto" ? "자동 동의" : "거래처 동의", s.mode === "auto" ? "마감 시각" : ""]);
  /* 안내(T6 발급 · T8 기한 지남)도 '명세서 발행' 줄과 같은 판정이다 — 알림 수신자가 없으면 '보냄' 이라고 말하지 않는다
     (같은 카드에서 발행 줄은 '보내지 못했습니다', 발급 줄은 '보냄' 이라고 갈리던 결함 — 2026-10-16 검토). */
  const NOT_SENT = "알림 수신자 없음 · 안내를 보내지 못했습니다";
  if (s.einvoice) {
    const how = s.einvoice.mode === "manual" ? "직접 입력" : s.einvoice.mode === "retry" ? "다시 시도" : "자동";
    L.push([s.einvoice.at, "계산서 발급", s.einvoice.mode === "manual" ? how : reach ? `${how} · 발급 안내 보냄` : `${how} · ${NOT_SENT}`]);
  }
  if (s.einvoice && now.getTime() >= s.overdueAt.getTime() && (s.status === "OVERDUE" || (s.paidAt && s.paidAt.getTime() >= s.overdueAt.getTime()))) {
    L.push([s.overdueAt, "기한 초과", reach ? "입금 기한 지남 안내 보냄" : NOT_SENT]);
  }
  if (s.paidAt) L.push([s.paidAt, "입금 확인", ""]);
  if (s.zero && s.status === "PAID") L.push([s.issueAt, "0원 달 · 입금 없이 입금완료 처리", "자동"]);
  return L.sort((a, b) => a[0] - b[0]).map(([t, what, who]) => ({ t: fmtMdHm(t), what, who }));
}

/** 그 달 청구 근거를 품목별로 — 명세서 행(billingEntriesOf)과 **같은 집합**이라 합이 곧 청구금액이다(명세 3.4).
 *  취소 수수료는 '취소 수수료' 품목 한 칸으로 묶인다(usageFor 와 같은 규칙 — 줄 모양은 디자이너 몫 ⑥). */
function itemsOf(client, ym) {
  const m = new Map();
  billingEntriesOf(client, ym).forEach((e) => {
    const it = m.get(e.product) || { name: e.product, count: 0, amount: 0 };
    it.count += 1;
    it.amount += e.amount;
    m.set(e.product, it);
  });
  return [...m.values()].sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, "ko"));
}

/* 내보낼 명세서가 있는 달 — 발행됐고 거래가 있다. 포털도 거래 없는 달에는 PDF·EXCEL·열람링크를 모두 잠근다. */
const hasDoc = (s) => s.issued && !s.empty;

// 정산 레코드 → 공개 명세서 doc — **포털 거래명세서(invoice.js `docData`)와 같은 문서**를 만든다.
// 같은 (거래처, 사업자번호, 귀속월)이면 issueLink 가 **같은 토큰을 돌려주고 본문을 덮어쓴다** — 여기서 다른 문서를 만들면
// 거래처에 이미 보낸 링크의 내용이 관리자가 링크를 복사한 순간 바뀐다(예전엔 '요약 1줄'이라 포털이 보낸 6줄 명세서가
// 1줄로 바뀌고 제목·발행일 표기도 달라졌다 — 2026-10-16 검토 실측). 행·합계는 billingRowsOf(invoiceMonth) 한 소스.
// '계산서 발행' 칸 낱말은 util/settlement `invoiceDocNoteOf` 한 곳. ⚠️ invoice.js docData 를 고치면 여기도 같이 고칠 것
// (두 페이지 모듈은 서로를 import 하지 않는다).
function buildDoc(client, s) {
  const ym = s.period;
  const m = invoiceMonth(client, ym);
  const label = periodLabel(ym);
  /* 포털과 같은 표시명 — 사업자번호를 공유하는 거래처만 계정 구분을 병기한다(util/biz displayName). */
  const name = displayName(client, sharedBizKeys(store.get().clients));
  const items = m.empty
    ? [{ date: "", sender: "", address: "해당 월의 거래 내역이 없습니다", product: "", amount: "" }]
    : m.rows.map((r) => ({ date: r[0], sender: r[1], address: r[2], product: r[3], amount: won(r[4]) }));
  return {
    title: `${ym.slice(2, 4)}년 ${ym.slice(5, 7)}월 꽃배달 거래명세서`,
    period: `${label} 귀속`,
    buyer: { address: `${client.address} ${name}`, company: name, bizNumber: client.bizNumber, ceo: client.ceoName, summary: "꽃배달 이용료 청구", issueDate: m.empty ? "-" : m.issue, invoiceNote: invoiceDocNoteOf(s) },
    supplier: SUPPLIER,
    items,
    account: ACCOUNT,
    total: won(m.total),
  };
}

export function mount(root, { nav }) {
  const toast = makeToast();
  const curYm = periodOf(DATA_NOW); // 목데이터 창(최근 6개월)의 기준 — 모듈은 재평가되지 않으므로 DATA_NOW 를 쓴다
  const lastYm = shiftPeriod(curYm, -1);
  /* 기본은 **저번달** — 명세서가 나가 동의·계산서·입금이 진행 중인 달이다(이번 달은 전부 발급예정). 대쉬보드 '정산 진행'
     카드와 '조치 필요' 칩도 같은 달을 센다. */
  const state = { ym: lastYm, tab: "all", q: "", expanded: new Set(), anaOpen: false };
  let minYm = shiftPeriod(curYm, -5);
  let maxYm = curYm;

  /* ── 다른 화면이 넘겨준 것(1회) ──
     "action"              → 기본 달(저번달) · '조치 필요' 탭(대쉬보드 '조치 필요 열기')
     "action:YYYY-MM"      → 그 달 · '조치 필요' 탭(대쉬보드 '기한 초과 N' 칩 — 기한 초과가 있는 가장 오래된 달)
     "period:YYYY-MM" + 거래처 → 그 달 · 그 줄 펼침(주문 상세 '정산 귀속') */
  const focusSec = takeFocusSection("admin-settlement");
  const focusCid = takeFocusClient("admin-settlement");
  let scrollTo = null;
  if (focusSec === "action") state.tab = "action";
  else if (focusSec && /^(period|action):/.test(focusSec)) {
    const [kind, ym] = focusSec.split(":");
    if (YM_RE.test(ym)) {
      state.ym = ym;
      /* 배송을 예약한 다음 달처럼 6개월 창 밖의 달도 열 수 있게 스테퍼 범위를 넓힌다. */
      if (ym < minYm) minYm = ym;
      if (ym > maxYm) maxYm = ym;
      if (kind === "action") state.tab = "action";
      else if (focusCid && store.get().clients.some((c) => c.id === focusCid)) { state.expanded.add(focusCid); scrollTo = focusCid; }
    }
  }

  /* ── 데이터 ── */
  function periodRows(now = new Date()) {
    const clients = store.get().clients;
    const shared = sharedBizKeys(clients);
    return clients.map((c) => {
      const s = settlementOf(c, state.ym, now);
      return { client: c, s, need: needsAction(s), shared: shared.has(normalizeBiz(c.bizNumber)) };
    });
  }
  const inTab = (tab, r) =>
    tab === "all"
    || (tab === "action" && r.need)
    || (tab === "agree" && (r.s.status === "SCHEDULED" || r.s.status === "AWAITING_AGREEMENT"))
    || (tab === "billing" && (r.s.status === "AGREED" || r.s.status === "ISSUED" || r.s.status === "OVERDUE"))
    || (tab === "done" && r.s.status === "PAID");
  const matchQ = (r, q) => !q || r.client.companyName.includes(q) || (r.client.department || "").includes(q);
  const visibleRows = (rows) => {
    const q = state.q.trim();
    return rows.filter((r) => inTab(state.tab, r) && matchQ(r, q));
  };
  const rowOf = (cid, now = new Date()) => {
    const c = store.get().clients.find((x) => x.id === cid);
    if (!c) return null;
    const s = settlementOf(c, state.ym, now);
    return { client: c, s, need: needsAction(s), shared: sharedBizKeys(store.get().clients).has(normalizeBiz(c.bizNumber)) };
  };

  /* 선택 월 분석 데이터 (월간 분석 · 리포트 공용) — 상태탭/검색과 무관 */
  function reportFor() {
    const cs = store.get().clients;
    const [y, m] = state.ym.split("-").map(Number);
    return buildMonthlyReport({
      year: y, month: m,
      clients: cs,
      usage: usageMap(cs), settlements: settlementsMap(cs), categories: USAGE_CATEGORIES,
    });
  }

  /* ── 월간 분석(예전 분석 블록 그대로 — 표 아래 접힌 줄로 내렸다) ── */
  function kpiCards(r) {
    return html`
      <div class="kpis">
        <div class="kpi"><span class="kpi__lbl">총 이용금액</span><div class="kpi__val num">${won(r.total)}</div>${deltaBadge(r.deltaTotal)}</div>
        <div class="kpi"><span class="kpi__lbl">주문 건수</span><div class="kpi__val num">${r.orders}건</div>${deltaBadge(r.deltaOrders, "건")}</div>
        <div class="kpi"><span class="kpi__lbl">이용 거래처</span><div class="kpi__val num">${r.activeClients}곳</div><span class="kpi__delta flat">전체 ${r.clientCount}곳 중</span></div>
        <div class="kpi"><span class="kpi__lbl">미입금액</span><div class="kpi__val num ${r.settle.unpaidAmount > 0 ? "warn" : ""}">${won(r.settle.unpaidAmount)}</div><span class="kpi__delta flat">정산 완료율 ${r.settle.paidRate}%</span></div>
      </div>
    `;
  }
  function insightCard(r) {
    const mm = monthOf(state.ym);
    let headline;
    if (r.deltaTotal == null) headline = html`<b>${mm}월</b> 총 이용금액은 <b class="num">${won(r.total)}</b>이에요`;
    else if (r.deltaTotal === 0) headline = html`총 이용금액이 지난달과 <b class="num">같아요</b> (${won(r.total)})`;
    else if (r.deltaTotal > 0) headline = html`총 이용금액이 지난달보다<br /><span class="up num">${won(r.deltaTotal)}</span> 늘었어요`;
    else headline = html`총 이용금액이 지난달보다<br /><span class="down num">${won(Math.abs(r.deltaTotal))}</span> 줄었어요`;
    const max = Math.max(...r.trend.map((t) => t.total), 1);
    return html`
      <div class="acard">
        <div class="acard__head"><b>월간 인사이트</b><span class="acard__hint">최근 6개월 · 만원</span></div>
        <div class="acard__body">
          <p class="headline">${headline}</p>
          <div class="bars" role="img" aria-label="최근 6개월 이용금액 추이">
            ${r.trend.map((t) => {
              const h = Math.max(10, Math.round((t.total / max) * 188));
              return html`<div class="bar ${t.isCurrent ? "cur" : ""}"><span class="bar__v num">${t.total === 0 ? "—" : man(t.total)}</span><span class="bar__c" style="height:${h}px"></span><span class="bar__l">${t.short}</span></div>`;
            })}
          </div>
        </div>
      </div>
    `;
  }
  /* 거래처별 이용 랭킹 — 막대 길이 = 전체 대비 이용 비중(share%) */
  function clientRankCard(r) {
    const RANK_LIMIT = 10;
    const top = r.affiliates.slice(0, RANK_LIMIT);
    const hint = r.affiliates.length > RANK_LIMIT
      ? `상위 ${RANK_LIMIT}곳 · 전체 ${r.affiliates.length}곳`
      : (r.affiliates[0] ? `최다 이용 거래처: ${r.affiliates[0].name}` : "");
    return html`
      <div class="acard">
        <div class="acard__head"><b>거래처별 이용 현황</b>${hint ? html`<span class="acard__hint">${hint}</span>` : ""}</div>
        <div class="acard__body" style="padding-top:12px;">
          ${top.map(
            (a, i) => html`
              <div class="rank">
                <span class="rank__no ${i < 3 ? "top" : ""}">${i + 1}</span>
                <span class="rank__name">${a.name}</span>
                <span class="rank__track"><span class="rank__bar" style="width:${Math.max(4, a.share)}%"></span></span>
                <span class="rank__amt num">${won(a.total)}</span>
                <span class="rank__share num">${a.share}%</span>
              </div>
            `
          )}
        </div>
      </div>
    `;
  }
  function donutSvg(r) {
    const R = 44, CX = 62, CY = 62, SW = 24, CIRC = 2 * Math.PI * R;
    let acc = 0;
    const segs = r.catStats
      .map((c, i) => {
        const len = r.total > 0 ? (c.amount / r.total) * CIRC : 0;
        const s = `<circle cx="${CX}" cy="${CY}" r="${R}" fill="none" style="stroke:${DONUT_VARS[i % DONUT_VARS.length]}" stroke-width="${SW}" stroke-dasharray="${len} ${CIRC - len}" stroke-dashoffset="${-acc}" transform="rotate(-90 ${CX} ${CY})"/>`;
        acc += len;
        return s;
      })
      .join("");
    return raw(
      `<svg width="124" height="124" viewBox="0 0 124 124" xmlns="http://www.w3.org/2000/svg" class="donut__svg" aria-hidden="true">` +
        `<circle cx="${CX}" cy="${CY}" r="${R}" fill="none" style="stroke:var(--c-divider)" stroke-width="${SW}"/>` + segs +
        `<text x="${CX}" y="${CY - 4}" text-anchor="middle" class="donut__t1">총 이용</text>` +
        `<text x="${CX}" y="${CY + 13}" text-anchor="middle" class="donut__t2">${man(r.total)}만</text>` +
        `</svg>`
    );
  }
  function categoryCard(r) {
    return html`
      <div class="acard">
        <div class="acard__head"><b>항목별 이용 비중</b></div>
        <div class="acard__body donut">
          ${donutSvg(r)}
          <div class="dleg">
            ${r.catStats.map(
              (c, i) => html`
                <div class="dleg__row">
                  <span class="dleg__l"><span class="dleg__dot" style="background:${DONUT_VARS[i % DONUT_VARS.length]}"></span><span class="dleg__name">${c.key}</span></span>
                  <span class="dleg__val num">${c.share}% · ${man(c.amount)}만</span>
                </div>
              `
            )}
          </div>
        </div>
      </div>
    `;
  }
  function progressCard(r) {
    const s = r.settle;
    const step = (lbl, done, cnt) => html`<div class="step ${cnt > 0 && done === cnt ? "done" : ""}"><b>${lbl}</b><span class="num">${done}/${cnt}</span></div>`;
    return html`
      <div class="acard">
        <div class="acard__head"><b>정산 진행 현황</b><span class="acard__hint">입금 기준 ${s.paidRate}%</span></div>
        <div class="acard__body">
          <div class="prog__track"><div class="prog__fill" style="width:${s.paidRate}%"></div></div>
          <div class="steps">
            ${step("명세서 동의", s.agreed, s.count)}
            ${step("계산서 발급", s.issued, s.count)}
            ${step("입금 완료", s.paid, s.count)}
          </div>
          <div class="prog__amts"><span>입금완료 <b class="num">${won(s.paidAmount)}</b></span><span class="warn">미입금 <b class="num">${won(s.unpaidAmount)}</b></span></div>
        </div>
      </div>
    `;
  }
  function reportCard(r) {
    return html`
      <div class="report">
        <div class="report__head"><b>월간 분석 리포트</b><span class="report__hint">A4 · PDF</span></div>
        <div class="report__body">
          <p class="report__desc">${r.label} 이용·정산 데이터를 분석한 리포트를 생성합니다.</p>
          <div class="report__list">
            <div class="report__row"><b>거래처별 이용 순위</b><span>전월 대비 증감 포함</span></div>
            <div class="report__row"><b>항목별 구성 변화</b><span>비중 · 건수</span></div>
            <div class="report__row"><b>정산 현황 · 코멘트</b><span>자동 분석 ${r.insights.length}건</span></div>
          </div>
          <p class="report__quote">"${r.insights[0] || ""}"</p>
        </div>
        <button class="report__btn" data-action="report">PDF 리포트 다운로드</button>
      </div>
    `;
  }
  function dashBody() {
    const r = reportFor();
    if (!r) return html`<div class="admin-empty">선택한 조건(${periodLabel(state.ym)})에 이용 데이터가 없습니다.</div>`;
    return html`
      <div class="adash">
        ${kpiCards(r)}
        <div class="row-main">${insightCard(r)}${clientRankCard(r)}</div>
        <div class="row-sub">${categoryCard(r)}${progressCard(r)}${reportCard(r)}</div>
      </div>
    `;
  }

  /* ── 표 ── */
  /** 표 머리 한 줄 요약 — 탭·검색과 무관하게 그 달 전체. 0원 달은 입금 없이 닫혀 입금완료 합계에서 뺀다(시안 · N20 ⓕ의 약점 —
   *  '입금이 없었는데 입금완료로 세어짐'). 미입금 = util/settlement `isUnpaid` — 명세서가 나간 달 전부(동의 전·계산서 발급 전
   *  포함 · 0원·거래 없음·발행 전 제외). 월간 분석 '미입금액'·대쉬보드 '미수금'·'정산 진행' 과 같은 판정이다(사용자 결정 A —
   *  예전엔 여기만 계산서가 나간 달(ISSUED·OVERDUE)만 세어 같은 9월을 월간 분석과 다른 금액으로 말했다).
   *  발행된 달이면 청구 합계 = 입금완료 + 미입금 이다(발행 전 달은 청구 합계에만 들어간다). */
  function sumBody(rows) {
    const nonZero = rows.filter((r) => !r.s.zero);
    const sum = (arr) => won(arr.reduce((a, r) => a + r.s.amount, 0));
    const zeroClosed = rows.filter((r) => r.s.zero && r.s.status === "PAID").length;
    return html`
      <b>${rows.length}개 거래처</b>
      <span>청구 합계 <b>${sum(nonZero)}</b></span>
      <span>입금완료 <b>${sum(nonZero.filter((r) => r.s.status === "PAID"))}</b></span>
      <span>미입금 <b class="is-unpaid">${sum(rows.filter((r) => isUnpaid(r.s)))}</b></span>
      ${zeroClosed ? html`<span class="settle-sumline__note">0원 달 ${zeroClosed}곳은 입금 없이 닫혀 입금완료 합계에서 뺐습니다</span>` : ""}
    `;
  }
  /** isCur — '기한 · 비고' 칸이 이 단계의 근거를 이미 보이고 있다(지금 단계, 또는 다 끝난 달의 마지막 단계).
   *  그 칸이 보이는 말은 여기서 .sr-only 로 다시 싣지 않는다 — 스크린리더가 같은 말을 두 번 읽는다(settle-mark.js 계약). */
  function cellHtml(st, isCur) {
    if (st.kind === "none") return html`<div class="settle-td">${settleMark({ kind: "none" })}</div>`;
    /* 지금 단계(live)의 기한·사유는 '기한 · 비고' 칸에 보이므로 여기선 title 만 준다. 끝난 단계는 근거를 title + .sr-only 로.
       done 은 tone 을 넘기지 않는다 — settleMark 의 done 기본값이 초록 ✓ 다(회색 ✓ 는 0원 달만). */
    return html`<div class="settle-td">${settleMark(st.kind === "live" || isCur
      ? { kind: st.kind, label: st.label, tone: st.tone, tip: st.tip || st.meta }
      : { kind: "done", label: st.label, tone: st.tone, meta: st.meta, tip: st.tip })}</div>`;
  }
  function rowHtml(r, now) {
    const { client: c, s, need } = r;
    const open = state.expanded.has(c.id);
    const ct = store.getBillingContactOf(c.id);
    const st = stagesOf(c, s, now);
    const act = actOf(s, need);
    const chips = [];
    /* 계정 구분은 사업자번호를 공유하는 거래처에만 — 전 거래처에 부서가 있어 무조건 병기하면 전 행이 노이즈다. */
    if (r.shared && c.department) chips.push(["", c.department]);
    if (c.status === "정지") chips.push(["amber", "정지 중"]);
    /* 정산·회계 담당자가 없거나 연락처가 비면 명세서·마감 안내(T3·T4)가 닿지 않는다 — 고지 미도달 보류로 이어진다(명세 3.4). */
    if (s.noRecipient) chips.push(["red", "알림 수신자 없음"]);
    const nameTip = ct && String(ct.phone || "").trim()
      ? `정산·회계 ${ct.name}${ct.role ? ` · ${ct.role}` : ""} · ${ct.phone}`
      : "정산·회계 담당자가 없거나 연락처가 비어 알림을 보낼 수 없습니다";
    const cur = st.cur;
    const detail = cur ? (cur.vis || cur.meta || "") : "";
    const detailTip = cur ? (cur.tip || cur.meta || "") : "";
    const M = monthOf(state.ym);
    return html`
      <div class="settle-trow ${open ? "is-open" : ""}" data-cid="${c.id}">
        <div class="settle-td settle-td--name" title="${nameTip}">
          <b class="settle-name">${c.companyName}</b>
          ${chips.map(([tone, t]) => html`<span class="settle-chip ${tone ? `settle-chip--${tone}` : ""}">${t}</span>`)}
        </div>
        <div class="settle-td settle-td--amt" title="주문 ${s.count}건">${won(s.amount)}</div>
        ${st.merged
          ? (st.merged.none
            ? html`<div class="settle-td settle-td--span3"><span class="settle-none">${st.merged.text}</span></div>`
            : html`<div class="settle-td settle-td--span3">${settleMark({ kind: "done", label: st.merged.label, tone: "gray", tip: st.merged.tip })}</div>`)
          : st.cells.map((x) => cellHtml(x, x === cur && !x.vis))}
        <div class="settle-td settle-td--detail ${cur && cur.hot ? "is-hot" : cur && cur.amb ? "is-amb" : ""}" ${detailTip ? html`title="${detailTip}"` : ""}>${detail}</div>
        <div class="settle-td settle-td--act">
          ${act.btn
            ? html`<button type="button" class="settle-actbtn ${need ? "is-need" : ""}" data-action="${act.btn}" data-cid="${c.id}" aria-label="${c.companyName} ${M}월 ${act.full}">${act.label}</button>`
            : html`<span class="settle-acttext ${act.need ? "is-need" : ""}">${act.text}</span>`}
          <button type="button" class="settle-chev" data-action="toggle" data-cid="${c.id}" aria-expanded="${open ? "true" : "false"}"
                  aria-controls="sx-${c.id}" aria-label="${c.companyName} ${open ? "접기" : "펼치기"}"></button>
        </div>
        <div class="settle-td settle-td--docs">
          ${hasDoc(s)
            ? html`<button type="button" class="settle-icbtn" data-action="copylink" data-cid="${c.id}" aria-label="${c.companyName} ${M}월 명세서 공개 링크 복사" title="공개 링크 복사">${icon("link", { size: 15 })}</button>
                   <button type="button" class="settle-icbtn" data-action="download" data-cid="${c.id}" aria-label="${c.companyName} ${M}월 명세서 PDF 다운로드" title="PDF 다운로드">${icon("download", { size: 15 })}</button>`
            : html`<span class="settle-docsoff" title="${s.status === "NONE" ? "거래가 없는 달은 명세서가 없습니다" : `명세서 발행 전입니다 — ${fmtKoShortTime(s.issueAt)}에 발급됩니다`}">${s.status === "NONE" ? "거래 없음" : "발행 전"}</span>`}
        </div>
      </div>
      <div class="settle-exp" id="sx-${c.id}" data-slot="exp" ${open ? "" : "hidden"}>${open ? expBody(r, now) : ""}</div>
    `;
  }
  function expBody(r, now) {
    const { client: c, s } = r;
    const ct = store.getBillingContactOf(c.id);
    const items = itemsOf(c, state.ym);
    const top = items.slice(0, TOP_ITEMS);
    const rest = items.slice(TOP_ITEMS);
    const restSum = rest.reduce((a, it) => ({ count: a.count + it.count, amount: a.amount + it.amount }), { count: 0, amount: 0 });
    const av = availOf(s);
    const log = logOf(s, ct, now);
    const reach = ct && String(ct.phone || "").trim();
    const ctText = !ct ? "없음 · 거래처 정보에서 지정하세요" : reach ? `${ct.name}${ct.role ? ` · ${ct.role}` : ""} · ${ct.phone}` : `${ct.name}${ct.role ? ` · ${ct.role}` : ""} · 연락처 없음`;
    const M = monthOf(state.ym);
    const itemRow = (name, count, amount, rest) => html`
      <div class="settle-it ${rest ? "settle-it--rest" : ""}"><span class="settle-it__n">${name}</span><span class="settle-it__q">${count.toLocaleString("ko-KR")}건</span><span class="settle-it__a">${won(amount)}</span></div>`;
    const doRow = (name, [can, why], action) => html`
      <div class="settle-do ${can ? "" : "is-off"}">
        <div class="settle-do__l"><b class="settle-do__n">${name}</b><p class="settle-do__w">${why}</p></div>
        ${can ? html`<button type="button" class="settle-dobtn" data-action="${action}" data-cid="${c.id}" aria-label="${c.companyName} ${M}월 ${name}">${action === "issue" ? "발급 처리" : "입금 확인"}</button>` : ""}
      </div>`;
    return html`
      <div class="settle-exp__grid">
        <section class="settle-card" aria-label="품목별 내역">
          <div class="settle-card__hd"><b>품목별 내역</b><span>합계 = 청구금액</span></div>
          ${items.length
            ? html`${top.map((it) => itemRow(it.name, it.count, it.amount))}
                   ${rest.length ? itemRow(`그 외 ${rest.length}개 품목`, restSum.count, restSum.amount, true) : ""}
                   <div class="settle-itsum"><b>합계</b><b>${won(s.amount)}</b></div>`
            : html`<p class="settle-noit">이 달의 이용 내역이 없습니다.</p>`}
          <button type="button" class="settle-pill settle-pill--start" data-action="orders" data-cid="${c.id}">이 거래처 · ${M}월 주문 보기 ›</button>
        </section>
        <section class="settle-card" aria-label="처리">
          <div class="settle-card__hd"><b>처리</b><span>이 달 상태에서 할 수 있는 일</span></div>
          <div class="settle-ct"><span class="settle-ct__k">정산·회계 담당자</span><b class="settle-ct__v ${reach ? "" : "is-warn"}">${ctText}</b></div>
          ${doRow("계산서 발급 처리", av.issue, "issue")}
          ${doRow("입금 확인", av.pay, "pay")}
        </section>
        <section class="settle-card" aria-label="진행 기록">
          <div class="settle-card__hd"><b>진행 기록</b><span>누가 언제</span></div>
          ${log.length
            ? log.map((l) => html`<div class="settle-log"><span class="settle-log__t">${l.t}</span><span class="settle-log__w"><b>${l.what}</b>${l.who ? html`<span>${l.who}</span>` : ""}</span></div>`)
            : html`<p class="settle-noit">거래가 없는 달이라 기록이 없습니다.</p>`}
        </section>
      </div>
    `;
  }
  function tableBody() {
    const now = new Date();
    const rows = periodRows(now);
    const vis = visibleRows(rows);
    const q = state.q.trim();
    return html`
      <div class="settle-sumline" data-slot="sum">${sumBody(rows)}</div>
      ${vis.length
        ? html`
          <div class="settle-thead">
            ${HEADERS.map(([t, k]) => html`<div class="settle-th ${k ? `settle-th--${k}` : ""}">${t}</div>`)}
          </div>
          <div data-slot="rows">${vis.map((r) => html`<div class="settle-rg" data-cid="${r.client.id}">${rowHtml(r, now)}</div>`)}</div>`
        : html`
          <div class="settle-emptyres">
            <p class="settle-emptyres__t">${q ? `선택한 조건(${periodLabel(state.ym)} · '${q}')에 정산 내역이 없습니다` : `선택한 조건(${periodLabel(state.ym)})에 정산 내역이 없습니다`}</p>
            ${q
              ? html`<p class="settle-emptyres__s">거래처 이름을 확인하거나 검색어를 지워 보세요.</p>
                     <button type="button" class="settle-pill" data-action="clearq">검색어 지우기</button>`
              : ""}
          </div>`}
    `;
  }

  /* ── 필터 카드 ── */
  function tabCounts(rows) {
    return Object.fromEntries(TABS.map((t) => [t.v, rows.filter((r) => inTab(t.v, r)).length]));
  }
  const segOf = () => [["last", "저번달", lastYm], ["this", "이번달", curYm]];
  function render() {
    const rows = periodRows();
    const cnt = tabCounts(rows);
    setHTML(
      root,
      html`
        <div class="page-admin page-settle">
          <div class="admin-inner">
            ${pageTitle({ imgSrc: "./assets/nav-accounting.png", title: "거래처 정산회계", desc: "귀속월마다 명세서 동의 · 계산서 · 입금을 처리합니다" })}
            <div class="bf-card">
              <div class="bf-row bf-row--tabs">
                <div class="bf-tabs" data-slot="tabs">
                  ${TABS.map((t) => html`<button type="button" class="bf-tab ${state.tab === t.v ? "is-active" : ""}" data-action="tab" data-v="${t.v}" aria-pressed="${state.tab === t.v ? "true" : "false"}">${t.label}<span class="bf-tab__cnt ${t.v === "action" && cnt.action ? "bf-tab__cnt--alert" : ""}" data-cnt="${t.v}">${cnt[t.v]}</span></button>`)}
                </div>
                <span class="bf-flow">발행 → 동의 → 계산서 → 입금</span>
              </div>
              <div class="bf-row bf-row--main">
                <div class="settle-mstep" role="group" aria-label="귀속월">
                  <button type="button" class="settle-mstep__b" data-action="mprev" aria-label="이전 달">${icon("chevron-left", { size: 16 })}</button>
                  <span class="settle-mstep__t" data-slot="mlabel" aria-live="polite">${periodLabel(state.ym)} 귀속</span>
                  <button type="button" class="settle-mstep__b" data-action="mnext" aria-label="다음 달">${icon("chevron-right", { size: 16 })}</button>
                </div>
                <div class="bf-seg">
                  ${segOf().map(([v, label, ym]) => html`<button type="button" class="bf-seg__btn ${state.ym === ym ? "is-sel" : ""}" data-action="qmonth" data-v="${v}" aria-pressed="${state.ym === ym ? "true" : "false"}">${label}</button>`)}
                </div>
                <div class="bf-right">
                  <div class="bf-srch bf-srch--addr">
                    ${icon("search", { size: 13, cls: "bf-srch__ic" })}
                    <span class="bf-srch__lbl" aria-hidden="true">거래처</span>
                    <span class="bf-srch__dv"></span>
                    <input type="text" data-search value="${state.q}" placeholder="거래처 이름으로 검색" aria-label="거래처 이름으로 검색" />
                  </div>
                </div>
              </div>
            </div>
            <div class="settle-table" data-slot="table">${tableBody()}</div>
            <div class="settle-ana">
              <div class="settle-ana__l"><b>월간 분석</b><span>총 이용금액 · 주문 건수 · 거래처별 이용 현황 · 항목별 비중</span></div>
              <div class="settle-ana__r">
                <button type="button" class="settle-pill" data-action="report">리포트 PDF</button>
                <button type="button" class="settle-pill" data-action="ana" aria-expanded="${state.anaOpen ? "true" : "false"}" aria-controls="settle-ana-body">${state.anaOpen ? "접기" : "펼치기"}</button>
              </div>
            </div>
            <div id="settle-ana-body" data-slot="dash" ${state.anaOpen ? "" : "hidden"}>${state.anaOpen ? dashBody() : ""}</div>
          </div>
        </div>
      `
    );
    syncStepper();
  }
  /** 탭 건수·선택·월 표시만 갈아 끼운다 — 버튼을 다시 그리면 누른 버튼의 포커스가 날아간다. */
  function syncFilters(rows = periodRows()) {
    const cnt = tabCounts(rows);
    qsa(root, "[data-action='tab']").forEach((b) => {
      const on_ = b.dataset.v === state.tab;
      b.classList.toggle("is-active", on_);
      b.setAttribute("aria-pressed", on_ ? "true" : "false");
      const c = qs(b, "[data-cnt]");
      if (c) {
        c.textContent = String(cnt[b.dataset.v]);
        if (b.dataset.v === "action") c.classList.toggle("bf-tab__cnt--alert", cnt.action > 0);
      }
    });
    const ml = qs(root, "[data-slot='mlabel']");
    if (ml) ml.textContent = `${periodLabel(state.ym)} 귀속`;
    const segYm = Object.fromEntries(segOf().map(([v, , ym]) => [v, ym]));
    qsa(root, "[data-action='qmonth']").forEach((b) => {
      const sel = segYm[b.dataset.v] === state.ym;
      b.classList.toggle("is-sel", sel);
      b.setAttribute("aria-pressed", sel ? "true" : "false");
    });
    syncStepper();
  }
  function syncStepper() {
    const prev = qs(root, "[data-action='mprev']");
    const next = qs(root, "[data-action='mnext']");
    if (prev) prev.disabled = state.ym <= minYm;
    if (next) next.disabled = state.ym >= maxYm;
  }
  function refreshTable() {
    const tbl = qs(root, "[data-slot='table']");
    if (tbl) setHTML(tbl, tableBody());
  }
  function refreshAna() {
    const box = qs(root, "[data-slot='dash']");
    const btn = qs(root, "[data-action='ana']");
    if (btn) {
      btn.setAttribute("aria-expanded", state.anaOpen ? "true" : "false");
      btn.textContent = state.anaOpen ? "접기" : "펼치기";
    }
    if (!box) return;
    box.hidden = !state.anaOpen;
    setHTML(box, state.anaOpen ? dashBody() : "");
  }
  /** 달이 바뀌었다 — 펼침은 달마다 뜻이 달라 비운다. */
  function setMonth(ym) {
    if (ym === state.ym) return;
    state.ym = ym;
    state.expanded.clear();
    syncFilters();
    refreshTable();
    refreshAna();
  }
  /** 그 줄만 다시 그린다(쓰기 성공 뒤) — 펼침 상태 보존. 탭 건수·머리 요약도 같은 소스라 함께 갱신한다. */
  function refreshRow(cid) {
    const g = qs(root, `.settle-rg[data-cid='${cid}']`);
    const now = new Date();
    const r = rowOf(cid, now);
    if (g && r) setHTML(g, rowHtml(r, now));
    const rows = periodRows(now);
    const sum = qs(root, "[data-slot='sum']");
    if (sum) setHTML(sum, sumBody(rows));
    syncFilters(rows);
    if (state.anaOpen) refreshAna();
  }
  /** 창이 닫힌 뒤 포커스가 사라졌으면(줄을 다시 그려 원래 버튼이 없어졌다) 그 줄의 펼침 버튼으로 되돌린다. */
  function refocus(cid) {
    const a = document.activeElement;
    if (a && a !== document.body && document.contains(a)) return;
    const b = qs(root, `.settle-chev[data-cid='${cid}']`);
    if (b) b.focus();
  }
  function toggle(cid) {
    const g = qs(root, `.settle-rg[data-cid='${cid}']`);
    if (!g) return;
    const open = !state.expanded.has(cid);
    if (open) state.expanded.add(cid); else state.expanded.delete(cid);
    const row = qs(g, ".settle-trow");
    const chev = qs(g, ".settle-chev");
    const exp = qs(g, "[data-slot='exp']");
    const r = rowOf(cid);
    if (row) row.classList.toggle("is-open", open);
    if (chev && r) {
      chev.setAttribute("aria-expanded", open ? "true" : "false");
      chev.setAttribute("aria-label", `${r.client.companyName} ${open ? "접기" : "펼치기"}`);
    }
    if (exp) {
      setHTML(exp, open && r ? expBody(r, new Date()) : "");
      exp.hidden = !open;
    }
  }

  render();

  /* 주문 상세 '정산 귀속' 에서 왔다 — 그 줄을 화면에 올린다. ⚠️ 다음 프레임에 한다: 라우터가 mount() 직후
     `scrollTop = 0` 으로 되돌린다(router.js — 프로필 저장공간의 담당자 카드와 같은 함정). */
  let raf = 0;
  if (scrollTo) {
    raf = requestAnimationFrame(() => {
      raf = 0;
      const g = qs(root, `.settle-rg[data-cid='${scrollTo}']`);
      if (!g) return;
      g.scrollIntoView({ block: "center" });
      const b = qs(g, ".settle-chev");
      if (b) b.focus({ preventScroll: true });
    });
  }

  const offs = [];
  offs.push(on(root, "click", "[data-action='tab']", (e, t) => {
    if (state.tab === t.dataset.v) return;
    state.tab = t.dataset.v;
    syncFilters();
    refreshTable();
  }));
  offs.push(on(root, "click", "[data-action='mprev']", (e, t) => {
    if (state.ym <= minYm) return;
    setMonth(shiftPeriod(state.ym, -1));
    if (t.disabled) { const n = qs(root, "[data-action='mnext']"); if (n) n.focus(); }
  }));
  offs.push(on(root, "click", "[data-action='mnext']", (e, t) => {
    if (state.ym >= maxYm) return;
    setMonth(shiftPeriod(state.ym, 1));
    /* 끝 달에 닿아 버튼이 잠기면 포커스가 사라진다 — 옆 버튼으로 옮긴다. */
    if (t.disabled) { const p = qs(root, "[data-action='mprev']"); if (p) p.focus(); }
  }));
  offs.push(on(root, "click", "[data-action='qmonth']", (e, t) => {
    setMonth(t.dataset.v === "last" ? lastYm : curYm);
  }));
  offs.push(on(root, "input", "[data-search]", (e, t) => {
    state.q = t.value;
    refreshTable();
  }));
  offs.push(on(root, "click", "[data-action='clearq']", () => {
    state.q = "";
    state.tab = "all";
    const inp = qs(root, "[data-search]");
    if (inp) inp.value = "";
    syncFilters();
    refreshTable();
    if (inp) inp.focus();
  }));
  /* 줄 아무 데나 → 펼침. onRowOpen 과 같은 가드: 안쪽 컨트롤은 비켜 가고(버튼 동작과 펼침이 둘 다 터지지 않게),
     드래그 선택 중이면 열지 않는다(금액·이름을 긁어 복사하는 흐름). */
  offs.push(on(root, "click", ".settle-trow", (e, t) => {
    if (e.target.closest("button, a, input, select, textarea, label")) return;
    if (!window.getSelection().isCollapsed) return;
    toggle(t.dataset.cid);
  }));
  offs.push(on(root, "click", "[data-action='toggle']", (e, t) => toggle(t.dataset.cid)));
  offs.push(on(root, "click", "[data-action='ana']", () => {
    state.anaOpen = !state.anaOpen;
    refreshAna();
  }));
  /* '이 거래처 · M월 주문 보기' — 주문관리를 그 거래처 · 날짜 기준 배송일 · 그 달 1일~말일로 연다(받는 쪽: admin-orders mount).
     귀속월 = 배송일의 달이라 기본 날짜 기준(주문일)으로 넘기면 다른 주문이 보인다(2026-10-15). */
  offs.push(on(root, "click", "[data-action='orders']", (e, t) => {
    setFocusClient("orders", t.dataset.cid);
    setFocusSection("orders", `deliver:${state.ym}`);
    nav("#/admin/orders");
  }));
  const openFor = (kind, cid) => {
    const c = store.get().clients.find((x) => x.id === cid);
    if (!c) return;
    const opts = {
      client: c, ym: state.ym, toast,
      onDone: () => refreshRow(cid),
      onClose: () => refocus(cid),
    };
    if (kind === "issue") openIssueDialog(opts);
    else openPaymentDialog(opts);
  };
  offs.push(on(root, "click", "[data-action='issue']", (e, t) => {
    const r = rowOf(t.dataset.cid);
    if (!r || r.s.status !== "AGREED" || r.s.zero) { refreshRow(t.dataset.cid); return; }
    openFor("issue", t.dataset.cid);
  }));
  offs.push(on(root, "click", "[data-action='pay']", (e, t) => {
    const r = rowOf(t.dataset.cid);
    if (!r || (r.s.status !== "ISSUED" && r.s.status !== "OVERDUE")) { refreshRow(t.dataset.cid); return; }
    openFor("pay", t.dataset.cid);
  }));
  offs.push(on(root, "click", "[data-action='copylink']", (e, t) => {
    const r = rowOf(t.dataset.cid);
    if (!r || !hasDoc(r.s)) return; // 발행 전·거래 없는 달에는 토큰을 발급하지 않는다(서버 409)
    const token = issueLink({ clientId: r.client.id, bizNumber: r.client.bizNumber, doc: buildDoc(r.client, r.s) });
    const url = publicInvoiceUrl(token);
    const done = () => toast(`${r.client.companyName} ${monthOf(state.ym)}월 명세서 공개 링크를 복사했습니다`);
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(done).catch(() => window.prompt("공개 링크", url));
    else window.prompt("공개 링크", url);
  }));
  // 명세서 PDF 즉시 다운로드: doc을 off-DOM으로 렌더 → printInvoiceDoc(새 창 인쇄 → PDF 저장)
  offs.push(on(root, "click", "[data-action='download']", (e, t) => {
    const r = rowOf(t.dataset.cid);
    if (!r || !hasDoc(r.s)) return; // 발행 전·거래 없는 달 명세서는 PDF 로도 내보내지 않는다
    const holder = document.createElement("div");
    setHTML(holder, invoiceDoc(buildDoc(r.client, r.s)));
    const docEl = holder.querySelector(".invoice-doc");
    if (!docEl) return;
    try { printInvoiceDoc(docEl, `${r.client.companyName}_${periodLabel(state.ym)}_거래명세서`); }
    catch (err) { console.error("PDF 생성 오류:", err); toast("PDF를 만들지 못했습니다. 다시 시도해 주세요.", "warn"); }
  }));
  // 월간 분석 리포트: 분석 실행 → A4 리포트 렌더 → printInvoiceDoc
  offs.push(on(root, "click", "[data-action='report']", () => {
    const r = reportFor();
    if (!r) { toast(`${periodLabel(state.ym)}에는 분석할 이용 데이터가 없습니다`, "warn"); return; }
    const dt = new Date();
    const generatedAt = `${dt.getFullYear()}. ${pad(dt.getMonth() + 1)}. ${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
    const holder = document.createElement("div");
    setHTML(holder, reportDoc(r, generatedAt));
    const docEl = holder.querySelector(".report-doc");
    if (!docEl) return;
    const [y, m] = state.ym.split("-");
    try { printInvoiceDoc(docEl, `거래처_이용분석_리포트_${y}_${m}`); }
    catch (err) { console.error("리포트 생성 오류:", err); toast("리포트를 만들지 못했습니다. 다시 시도해 주세요.", "warn"); }
  }));

  return () => {
    if (raf) cancelAnimationFrame(raf);
    offs.forEach((off) => off());
    toast.destroy();
  };
}
