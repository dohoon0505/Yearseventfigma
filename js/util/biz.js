/* ============================================================
   biz.js — 사업자번호 유틸 (순수 함수 · DOM 비의존).

   같은 법인이 부서별로 여러 거래처 레코드를 갖는 경우(기업B)를 다루기 위한
   공용 헬퍼. 사업자번호 중복은 정상 시나리오이므로 "중복 = 오류"가 아니라
   "중복 = 같은 법인의 부서 분리"로 해석한다.
   ============================================================ */

/** 사업자번호에서 숫자만 남긴다 — "680-87-02988" 과 "6808702988" 을 같은 값으로 취급. */
export const normalizeBiz = (s) => String(s || "").replace(/[^0-9]/g, "");

/** 2건 이상이 공유하는 사업자번호(정규화값) 집합 — 부서 분리 여부 판정의 단일 기준. */
export function sharedBizKeys(clients) {
  const count = new Map();
  (clients || []).forEach((c) => {
    const k = normalizeBiz(c && c.bizNumber);
    if (!k) return;
    count.set(k, (count.get(k) || 0) + 1);
  });
  const shared = new Set();
  count.forEach((n, k) => { if (n > 1) shared.add(k); });
  return shared;
}

/** 표시명 — 사업자번호를 공유하는 거래처만 "회사명 부서" 로 구분한다.
 *  전 거래처에 부서가 있으므로 무조건 병기하면 모든 행이 노이즈가 된다. */
export function displayName(client, shared) {
  if (!client) return "";
  const k = normalizeBiz(client.bizNumber);
  return shared && shared.has(k) && client.department
    ? `${client.companyName} ${client.department}`
    : client.companyName;
}
