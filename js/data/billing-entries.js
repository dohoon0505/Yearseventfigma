/* ============================================================
   billing-entries.js — 주문 한 건이 **몇 월 정산에 얼마를 보태는지**의 단일 규칙 (import 0 · 순수 함수).

   왜 여기인가 — 이 규칙을 두 층이 같이 쓴다:
     · util/settlement.js — 정산 금액·명세서 행·드릴다운(색인 `index()`)
     · data/b2b-mock.js   — 주문을 쓸 때 '명세서가 나간 달의 금액이 바뀌었는가'(정산 금액 변경 기록)
   b2b-mock 은 util/settlement 를 import 할 수 없다(util/settlement → b2b-mock → store … 순환). 그래서 규칙을
   import 0 인 이 모듈로 내려 두 층이 같은 함수를 부른다 — 정산 금액과 변경 기록이 **같은 규칙**이다(2026-10-16 DATA.md 1.3).

   ── 규칙 (명세 3.4 · 5.4 · decisions-2026-10-04 맨 끝 두 절) ──
   · 취소가 아니면 → 배송일시의 달에 `amount`(0원 주문도 한 줄 — 상태로 거르지 않는다: 접수대기·주문접수·배송완료)
   · 취소이고 수수료 > 0 → **취소한 달**(canceledAt — 없으면 처리 이력의 마지막 cancel 시각)에 `cancelFee`
   · 취소이고 수수료 0 / 지운 주문 → 어디에도 없다
   ⚠️ 줄 모양은 util/settlement 의 옛 색인 줄과 같다(화면이 읽는 칸 — kind · key · orderNo · at · ordererName · address ·
      product · amount). 새 칸은 **더하기만** 했다: orderId · clientId · ym, 수수료 줄의 deliverAt(원래 배송 예정 일시).
   ============================================================ */

/** 주문의 날짜 문자열("YYYY-MM-DDTHH:mm" · "YYYY/MM/DD HH:mm" · "YYYY-MM-DD HH:mm") → "YYYY-MM-DD HH:mm" 또는 "" */
export function normAt(s) {
  const m = /^(\d{4})[-/](\d{2})[-/](\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(String(s || ""));
  return m ? `${m[1]}-${m[2]}-${m[3]} ${m[4] || "00"}:${m[5] || "00"}` : "";
}
/** 취소한 시각 — 레코드의 canceledAt, 없으면(옛 저장본) 처리 이력의 마지막 cancel 줄. "YYYY-MM-DD HH:mm" 또는 "" */
export function canceledAtOf(o) {
  const own = normAt(o && o.canceledAt);
  if (own) return own;
  const h = ((o && o.history) || []).filter((x) => x && x.type === "cancel").pop();
  return h ? normAt(h.at) : "";
}

/**
 * 주문 한 건의 정산 기여 — `[]` 또는 `[entry]`(지금 규칙으로는 언제나 0~1줄).
 * entry = {
 *   kind: "order" | "cancelFee", key(정렬 키 = at), orderId, orderNo, clientId, ym("YYYY-MM"),
 *   at("YYYY-MM-DD HH:mm" — 주문은 배송일시, 수수료는 취소한 시각), ordererName, address, product, amount(number),
 *   deliverAt?("YYYY-MM-DD HH:mm" — 수수료 줄에만: 그 주문의 원래 배송 예정 일시 · 없으면 "")
 * }
 */
export function entriesOfOrder(o) {
  if (!o || !o.clientId) return [];
  const base = { orderId: o.id || "", orderNo: o.orderNo || "", clientId: o.clientId, ordererName: o.ordererName || "" };
  if (o.status === "취소") {
    const fee = Number(o.cancelFee) || 0;
    const at = fee > 0 ? canceledAtOf(o) : "";
    if (!at) return [];
    return [{
      kind: "cancelFee", key: at, ...base, ym: at.slice(0, 7), at,
      address: `주문취소 · ${o.orderNo || ""}`, product: "취소 수수료", amount: fee,
      deliverAt: normAt(o.deliverAt),
    }];
  }
  const at = normAt(o.deliverAt);
  if (!at) return [];
  return [{
    kind: "order", key: at, ...base, ym: at.slice(0, 7), at,
    address: o.address || "", product: o.product || "", amount: Number(o.amount) || 0,
  }];
}

/** 명세서 행 정렬 — **주문 줄 먼저, 수수료 줄 뒤**(각각 날짜 내림차순 · 같은 시각이면 주문번호 순으로 고정).
 *  S-02 '수수료 줄은 맨 아래' · S-01 품목 내역의 수수료 줄 분리. 합계(usageFromEntries)는 순서와 무관하다. */
export function compareEntries(a, b) {
  const ka = a.kind === "cancelFee" ? 1 : 0;
  const kb = b.kind === "cancelFee" ? 1 : 0;
  if (ka !== kb) return ka - kb;
  if (a.key !== b.key) return a.key < b.key ? 1 : -1;
  return a.orderNo < b.orderNo ? -1 : a.orderNo > b.orderNo ? 1 : 0;
}

/**
 * 한 저장(before → after)이 정산에 주는 차이 — 달마다 한 칸.
 * `before`/`after` 는 주문 레코드(또는 null — 등록이면 before, 삭제면 after 가 null).
 * @returns {{ clientId, ym, before: number, after: number, delta: number, touched: boolean }[]}
 *   before/after = **그 주문이 그 달에 보태던 금액** 전 → 후(주문 한 건의 기여 — 그 달 합계가 아니다).
 *   touched = 그 달의 명세서 줄이 바뀌었는가 — 금액이 같아도 줄 소속이 바뀌었거나(0원 주문을 다른 달로) 주문상품이
 *             바뀌었으면 true. 잠금 검사의 대상이다(기록 대상은 delta ≠ 0 인 달뿐).
 *   순서: before 의 달 먼저, 그다음 after 에만 있는 달.
 */
export function contributionDiff(before, after) {
  const map = new Map();
  const slot = (e) => {
    const k = `${e.clientId}|${e.ym}`;
    if (!map.has(k)) map.set(k, { clientId: e.clientId, ym: e.ym, b: null, a: null });
    return map.get(k);
  };
  entriesOfOrder(before).forEach((e) => { slot(e).b = e; });
  entriesOfOrder(after).forEach((e) => { slot(e).a = e; });
  return [...map.values()].map(({ clientId, ym, b, a }) => {
    const bv = b ? b.amount : 0;
    const av = a ? a.amount : 0;
    const touched = !b !== !a || bv !== av || (!!b && !!a && (b.kind !== a.kind || b.product !== a.product));
    return { clientId, ym, before: bv, after: av, delta: av - bv, touched };
  });
}

/**
 * 이 저장의 원인(정산 금액 변경 기록의 `cause` · 저장 전 확인 창의 '바뀌는 것' 갈래가 같은 판정을 쓴다).
 * "create" 등록 · "remove" 삭제 · "feeRemove" 수수료 붙은 취소 주문 삭제 · "cancel" 주문취소 · "move" 배송일시를 다른 달로 ·
 * "product" 주문상품 변경(적용 단가로 다시 채움 포함) · "amount" 금액 직접 수정 · 정산과 무관한 저장이면 null.
 */
export function causeOf(before, after) {
  if (!before && !after) return null;
  if (!before) return "create";
  if (!after) return before.status === "취소" && Number(before.cancelFee) > 0 ? "feeRemove" : "remove";
  if (before.status !== "취소" && after.status === "취소") return "cancel";
  const bm = normAt(before.deliverAt).slice(0, 7);
  const am = normAt(after.deliverAt).slice(0, 7);
  if (before.status !== "취소" && bm !== am) return "move";
  if (String(before.product || "") !== String(after.product || "")) return "product";
  if ((Number(before.amount) || 0) !== (Number(after.amount) || 0)) return "amount";
  if (String(before.clientId || "") !== String(after.clientId || "")) return "move";
  return null;
}
