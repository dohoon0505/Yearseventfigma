/* ============================================================
   order-history.js — 주문 처리 이력.

   주문 모달 우측의 '처리 이력' 카드가 읽는다. 접수 → 담당자 지정 → 상태 변경
   → 저장 → 취소를 시각과 함께 쌓는다. **배열은 시간순(오래된 것이 [0])** 이고
   화면도 같은 방향이다 — 새 이력은 카드 아래쪽에 붙는다.

   ⚠️ 시각은 **"YYYY-MM-DD HH:mm" 한 포맷으로 통일**한다. 이 프로젝트엔 이미
      주문 날짜 포맷이 셋이라(B2C 접수 대시 · B2B 주문 슬래시 · 배송희망 T)
      네 번째를 만들지 않는다. history 는 새 필드라 포맷을 강제할 수 있다.

   ⚠️ **모달 draft 에 history 를 실어 보내지 말 것.** `editing = { ...order }` 는
      얕은 복사라 배열이 같은 참조가 된다 — 편집 취소가 이력을 되돌리거나
      저장 전 push 가 이미 반영돼 버린다. b2c/b2bUpsert 는 rec.history 가
      undefined 면 기존 레코드의 것을 보존한다.

   실서비스에서는 서버가 감사 로그로 남긴다(→ docs/backend-spec.md 8장).
   ============================================================ */

/* 점 색 — 한눈에 무슨 일이 있었는지 읽히게 한다 */
export const HIST_DOT = {
  created: "var(--c-text-faint)",
  manager: "var(--c-text-faint)",
  edit: "var(--c-warn-soft-ink)",
  photo: "var(--c-blue)",
  status: "var(--c-blue)",
  delivered: "var(--c-success-ink)",
  cancel: "var(--c-danger-ink)",
};

const p2 = (n) => String(n).padStart(2, "0");
const stamp = (d) =>
  `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;

/** 주문 날짜 문자열(세 포맷 어느 것이든) + 분 오프셋 → "YYYY-MM-DD HH:mm" */
export function histAt(dateStr, addMin = 0) {
  const s = String(dateStr || "").replace(/\//g, "-").replace("T", " ");
  const [d, t] = s.split(" ");
  const [y, mo, da] = (d || "").split("-").map(Number);
  const [hh = 0, mm = 0] = (t || "00:00").split(":").map(Number);
  if (!y || !mo || !da) return "";
  return stamp(new Date(y, mo - 1, da, hh, mm + addMin));
}

export const histEntry = (type, label, at) => ({ type, label, at: at || stamp(new Date()) });

/** 최신이 **아래** — 카드가 위에서 아래로 시간순으로 읽힌다(대화 로그와 같은 방향).
    새 줄은 항상 끝에 붙으므로 카드를 맨 아래로 스크롤해 줘야 한다(→ histScrollEnd). */
export function pushHistory(order, type, label, at) {
  if (!order) return;
  if (!Array.isArray(order.history)) order.history = [];
  order.history.push(histEntry(type, label, at));
}

/* ── 시드 ─────────────────────────────────────────────────
   ⚠️ 절대 날짜를 새로 쓰지 말 것. 각 레코드의 **기존 날짜에서 분 오프셋으로만**
      파생한다 — 원본이 mockDates(DATA_NOW) 상대값이므로 상대 생성 규약이
      자동으로 지켜진다. 절대값을 쓰는 순간 '오늘' 집계가 다시 깨진다. */
export function seedHistory(order, receivedKey = "receivedAt") {
  const base = order[receivedKey];
  const list = [];
  const add = (type, label, at) => list.push(histEntry(type, label, at));

  add("created", `주문 접수${order.channel ? " · " + order.channel : ""}`, histAt(base));
  if (order.manager) add("manager", `담당자 ${order.manager} 지정`, histAt(base, 12));

  if (order.status === "취소") {
    const why = order.cancelReason ? ` · ${order.cancelReason}` : "";
    const fee = order.cancelFee ? ` · 수수료 ${Number(order.cancelFee).toLocaleString("ko-KR")}원` : "";
    add("cancel", `주문취소${why}${fee}`, histAt(base, 90));
  } else if (order.status !== "접수대기") {
    add("status", "주문접수로 변경", histAt(base, 48));
    if (order.status === "배송완료") {
      add("delivered", "배송완료 · 알림톡 발송", histAt(order.deliverAt || base, 30));
    }
  }

  order.history = list; // 시간순 — 접수가 맨 위, 최신이 맨 아래
  return order;
}
