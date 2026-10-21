/* ============================================================
   withdraw.js — 거래처 **탈퇴**의 단일 판정 (2026-10-22 운영자 답 A — '정지' 를 없애고 '탈퇴' 를 둔다)

   탈퇴 = 계정을 닫는다 · 기록은 남긴다. 로그인할 수 없고(util/client.js portalBlock) **되돌리지 않는다**(다시 쓰려면 새로 가입).
   지난 주문·거래명세서·계산서·입금 기록은 그대로 남는다(세무 서류 보관). 처리는 관리자만 한다 — 거래처 정보 창의 상태 칸.

   **끝나지 않은 정산이 있으면 탈퇴할 수 없다** — 그래서 '로그인 못 하는 거래처에 자동 동의가 걸리는' 일이 아예 생기지 않는다.
   막는 것:
     · 거래가 있는 달(지난 달들 · 이번 달 · 배송을 예약해 둔 앞으로의 달) 가운데 정산이 끝나지 않은 달 —
       settlementOf 의 status 가 PAID(입금까지 끝남 · 0원으로 닫힘)도 NONE(거래 없음)도 아닌 달.
       이번 달 주문은 다음 달 명세서가 나가고(SCHEDULED → 동의 → 계산서) 입금이 끝나야 풀린다.
       단 **0원 주문만 있는 달**(2026-10-22 운영자 답 B — 내역서도 계산서도 내지 않는다 · settlementOf 의 empty)은 거래 없는 달처럼
       정산할 것이 없어 막지 않는다(발행 전이어도 — 그 달은 발행 시각이 지나면 NONE 이다). 가입 혜택 '1회 무료' 만 쓰고 탈퇴하는
       거래처를 다음 달 발행일까지 붙잡아 둘 까닭이 없다. 대신 탈퇴한 **뒤에** 그 주문을 고쳐 정산을 새로 만드는 길은
       아래 `orderImpactOf` 가 막는다(주문 상세의 저장 · 주문취소 · 삭제).
     · 배송 전 주문(접수대기 · 주문접수) — 그 달이 이미 닫혔어도(상태를 안 바꾼 옛 주문) 막는다. 0원 주문이어도 막는다.
   훑는 달 = 이 거래처 주문의 정산 줄이 있는 달(data/billing-entries — 배송일의 달 · 취소 수수료는 취소한 달)
           ∪ 정산 금액 변경 기록이 있는 달(줄이 다 빠진 '고쳐서 0원' 달은 줄이 없어도 마감 전엔 동의대기다).
   판정은 이 함수 하나다 — 거래처 정보 창의 '탈퇴' 칸 잠금 · 확인 창을 확정하는 순간의 다시 판정이 같은 값을 본다.

   **탈퇴한 거래처의 주문은 정산에 닿게 고칠 수 없다**(`orderImpactOf`) — 금액 · 상품 · 다른 달로 옮기기 · 취소 · 삭제.
   탈퇴는 끝나지 않은 정산이 없을 때만 받았으므로, 그 뒤 주문을 고쳐 정산이 새로 생기면 로그인할 수 없는 거래처에 명세서가 나가고
   자동 동의가 걸린다(결정 A 가 없애려던 일 — 관리자 정산회계는 탈퇴한 거래처의 발행 전 줄을 감춰 아무도 모른다). 정산과 무관한
   저장(리본 문구 · 요청사항 · 같은 달 안의 배송 시각 · 담당자 · 사진 등)은 그대로 받는다.
   ⚠️ DOM 을 모른다(노드 시험이 그대로 부를 수 있게) — 확인 창은 admin-clients.js, 주문 상세의 막는 자리는 admin-orders.js 에 있다.
   ============================================================ */
import { store } from "../store.js";
import { b2bList, b2bSeedAmountChanges } from "../data/b2b-mock.js";
import { entriesOfOrder } from "../data/billing-entries.js";
import { fmtKoShortY } from "../data/settlement-rules.js";
import { settlementOf, settlementImpactOf } from "./settlement.js";
import { WITHDRAWN, isWithdrawn } from "./client.js";

/** 탈퇴 상태 낱말 — 레코드 `status` 값(정본은 data/admin-mock.js `WITHDRAWN` — store·b2b-mock 도 읽는 바닥층 · util/client.js 가 다시 내보낸다). 탈퇴한 시각은 `withdrawnAt`
 *  ("YYYY-MM-DD HH:mm") 한 칸(이력 장치가 아니라 사실 한 칸 — 목록·정보 창 표시와 시드 주문 생성에 쓴다). */
export { WITHDRAWN, isWithdrawn };
/** 탈퇴한 날 "YYYY-MM-DD" — withdrawnAt 이 없으면 ""(옛 기록 · 시드) */
export const withdrawnDay = (client) => String((client && client.withdrawnAt) || "").slice(0, 10);
/** 탈퇴한 계정의 상태 칸이 잠긴 이유 — 거래처 정보 창(상태 pill 의 title · 화면낭독기 설명 · 누르면 토스트). */
export const WITHDRAWN_LOCK = "탈퇴한 계정은 되돌릴 수 없습니다 — 다시 쓰려면 새로 가입합니다";
/** 탈퇴를 막을 때 앞말 — 뒤에 `reason`(어느 달이 왜) 이 붙는다. */
export const WITHDRAW_BLOCK_LEAD = "끝나지 않은 정산이 있어 탈퇴할 수 없습니다";
/** 탈퇴한 거래처의 주문을 정산에 닿게 고치려 할 때의 이유(정본) — 주문 상세의 저장 줄(빨강) · 배송일시 안내 title · 확인 창 안 빨간 상자. */
export const WITHDRAWN_ORDER_LOCK = "탈퇴한 거래처의 주문은 금액 · 상품을 바꾸거나 다른 달로 옮길 수 없습니다 — 지난 기록은 그대로 남깁니다";
/** 같은 이유의 짧은 말 — 배송일시 줄 안내 자리(좁다). */
export const WITHDRAWN_ORDER_SHORT = "탈퇴한 거래처 · 다른 달로 못 옮김";
/** 막힌 동작 토스트 · ⋯ 메뉴 잠긴 '주문서 삭제' 아래 이유 — `what` = '지울' · '취소할'. */
export const withdrawnOrderMsg = (what) => `탈퇴한 거래처의 주문이라 ${what} 수 없습니다 — 지난 기록은 그대로 남깁니다`;
/** 배송 전 주문 — 정산이 아직 시작되지 않은 주문 */
const OPEN_ORDER = new Set(["접수대기", "주문접수"]);

/** 정산 상태 → 사람 말. SCHEDULED 는 따로 모은다(달마다 건수 + 명세서 날짜). */
function wordOf(s) {
  if (s.status === "AWAITING_AGREEMENT") return s.zeroEdited ? "마감 전" : "동의 전";
  if (s.status === "AGREED") return "계산서 발급 전";
  if (s.status === "ISSUED" || s.status === "OVERDUE") return "입금 전";
  return "정산 중";
}
const yOf = (ym) => Number(ym.slice(0, 4));
const mOf = (ym) => Number(ym.slice(5, 7));
/** "10월" — 지금과 해가 다르면 "2025년 12월"(연도 없이 쓰면 올해로 읽힌다 · fmtKoShortY 와 같은 규칙) */
const monthWord = (ym, now) => (yOf(ym) === now.getFullYear() ? `${mOf(ym)}월` : `${yOf(ym)}년 ${mOf(ym)}월`);
/** 귀속월 묶음 → "8·9월분" · 해가 섞이면 "2025년 12월분·1월분" 대신 달마다 연도를 붙인다 */
function monthsBun(yms, now) {
  if (yms.every((ym) => yOf(ym) === now.getFullYear())) return `${yms.map(mOf).join("·")}월분`;
  return yms.map((ym) => `${monthWord(ym, now)}분`).join("·");
}

/** 이 거래처에서 훑을 귀속월(오름차순) */
function monthsToScan(clientId) {
  const set = new Set();
  b2bList().forEach((o) => {
    if (o.clientId !== clientId) return;
    entriesOfOrder(o).forEach((e) => set.add(e.ym));
  });
  const log = (store.get().amountLog || {})[clientId] || {};
  Object.keys(log).forEach((ym) => { if ((log[ym] || []).length) set.add(ym); });
  const seed = (b2bSeedAmountChanges() || {})[clientId] || {};
  Object.keys(seed).forEach((ym) => { if ((seed[ym] || []).length) set.add(ym); });
  return [...set].filter((ym) => /^\d{4}-\d{2}$/.test(ym)).sort();
}

/**
 * 이 거래처를 지금 탈퇴 처리할 수 없는 이유 — 막을 것이 없으면 null(이미 탈퇴한 거래처도 null — 호출부가 isWithdrawn 을 먼저 본다).
 * @returns {null | {
 *   reason: string,   // "9월분 입금 전 · 10월 주문 12건 정산 전 — 11월 1일 명세서 · 배송 전 주문 3건"
 *   text: string,     // WITHDRAW_BLOCK_LEAD + " · " + reason — 토스트 · title · 화면낭독기 설명에 그대로 쓴다
 *   months: { ym: string, status: string, word: string }[],   // 막는 달(오름차순) — word 는 SCHEDULED 면 "정산 전"
 *   open: number,     // 배송 전 주문(접수대기·주문접수) 건수
 * }}
 */
export function withdrawBlockOf(client, now = new Date()) {
  if (!client || isWithdrawn(client)) return null;
  const months = [];
  const scheduled = []; // { ym, s }
  const groups = new Map(); // word → ym[] (먼저 나온 달 순)
  monthsToScan(client.id).forEach((ym) => {
    const s = settlementOf(client, ym, now);
    if (s.status === "PAID" || s.status === "NONE") return;
    if (s.status === "SCHEDULED") {
      /* 발행 전인데 내역서가 나가지 않을 달은 정산할 것이 없다 — 줄이 없는 달(기록 줄만 있는 달 등)과 **0원 주문만 있는 달**
         (운영자 답 B · settlementOf 의 empty — 발행 시각이 지나면 거래 없는 달 NONE 이 된다). 탈퇴한 뒤 그 주문을 고쳐 정산을 새로
         만드는 길은 orderImpactOf 가 막는다. 배송 전 주문이면 아래 open 이 따로 막는다. */
      if (s.empty && !s.zeroEdited) return;
      scheduled.push({ ym, s });
      months.push({ ym, status: s.status, word: "정산 전" });
      return;
    }
    const w = wordOf(s);
    if (!groups.has(w)) groups.set(w, []);
    groups.get(w).push(ym);
    months.push({ ym, status: s.status, word: w });
  });
  const open = b2bList().filter((o) => o.clientId === client.id && OPEN_ORDER.has(o.status)).length;
  if (!months.length && !open) return null;

  const parts = [];
  groups.forEach((yms, w) => parts.push({ at: yms[0], text: `${monthsBun(yms, now)} ${w}` }));
  if (scheduled.length) {
    const each = scheduled.map(({ ym, s }) => {
      const what = s.count ? `주문 ${s.count}건` : s.feeCount ? `취소 수수료 ${s.feeCount}건` : "주문";
      return `${monthWord(ym, now)} ${what}`;
    });
    const first = scheduled[0].s.issueAt;
    parts.push({
      at: scheduled[0].ym,
      text: `${each.join(" · ")} 정산 전 — ${fmtKoShortY(first, now)} 명세서${scheduled.length > 1 ? "부터" : ""}`,
    });
  }
  parts.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const list = parts.map((p) => p.text);
  if (open) list.push(`배송 전 주문 ${open}건`);
  const reason = list.join(" · ");
  return { reason, text: `${WITHDRAW_BLOCK_LEAD} · ${reason}`, months, open };
}

/**
 * 주문 저장 · 주문취소 · 삭제가 정산에 주는 영향 — `settlementImpactOf` 그대로에 **탈퇴한 거래처의 잠금**을 더한다(B2B 주문 상세가
 * 이 함수로 판정한다 · 인자 모양도 같다: 저장 `(저장본, 작업본)` · 삭제 `(저장본, null)` · 취소 `(작업본, 취소 뒤 모양)`).
 * 바뀌는 달(`months`) 가운데 탈퇴한 거래처의 달이 있으면 그 달로 `lock` 을 세운다 — 모양은 settlementImpactOf 의 lock 과 같고
 * `withdrawn: true` · `isOld: false`(화면이 누르기 전부터 막고 이유를 그대로 말한다 — admin-orders preBlockOf). 정산과 무관한
 * 저장(months 가 빈 저장)은 그대로 둔다. 이미 잠긴 달이면(동의를 마친 달 등) 그 이유가 먼저다 — 더 구체적이고 그대로 맞는 말이다.
 */
export function orderImpactOf(stored, next, now = new Date()) {
  const imp = settlementImpactOf(stored, next, now);
  if (imp.lock || !imp.months.length) return imp;
  const clients = store.get().clients;
  const m = imp.months.find((x) => isWithdrawn(clients.find((c) => c.id === x.clientId)));
  if (!m) return imp;
  return {
    ...imp,
    lock: {
      ym: m.ym, label: m.label, s: m.s, moved: imp.moved, isOld: false, withdrawn: true,
      reason: WITHDRAWN_ORDER_LOCK, short: WITHDRAWN_ORDER_SHORT,
    },
  };
}
