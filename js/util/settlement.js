/* ============================================================
   settlement.js — 정산 행 조합층 (util/client.js 와 같은 역할).
   정산 행 = **캐시된 날짜·금액**(data/admin-mock.js `settlementBaseRows`)
            + **호출 시점의 동의 상태 오버레이**(store.agreementOf → data/settlement-rules.js).

   왜 둘로 갈랐나 — 예전엔 `settlementsFor` 가 admin-mock 안에서 '발행일 ≤ 지금' 만으로
   동의·발급 문자열을 찍었다. 거래처가 포털에서 동의한 적이 없어도 발행일만 지나면
   관리자 화면은 '동의완료·발급완료' 였고, 포털의 동의 기록(store.invoiceAgreed)과는
   아무 관계가 없었다. admin-mock 은 store 를 import 할 수 없으므로(store → admin-mock)
   동의 기록을 아는 조합은 util 에 둔다.

   호출부(관리자 정산회계 · 대쉬보드 · 포털 정산 간편조회 · 월간 리포트)는 예전 이름
   `settlementsFor`/`settlementsMap` 을 **여기서** 가져온다. 문자열 계약(거래명세서동의 ·
   계산서발급 · 입금완료)은 유지하되 '동의하기' 센티널은 폐기했다 — 그 값이 PDF 의
   '계산서 발행' 칸으로 새던 결함이 있었다.
   ============================================================ */
import { store } from "../store.js";
import { settlementBaseRows } from "../data/admin-mock.js";

/**
 * 한 거래처의 최근 6개월 정산 행(m=0 이 이번 달 귀속).
 * 추가 필드: issued · open · 마감(Date) · 동의구분(null|"manual"|"auto") · 동의시각(Date|null) ·
 *            작성일자(Date|null). 표시 문자열은 호출부가 포맷한다(html`` 은 Date 를 String() 으로 찍는다).
 */
export function settlementsFor(client, now = new Date()) {
  return settlementBaseRows(client).map((b) => {
    const st = store.agreementOf(client.id, b.ym, now);
    const agreed = st.mode !== null;
    /* 입금은 날짜 파생이 아니라 결제 이벤트다 — 데모에서는 '두 달 이전은 입금됨' 을 유지하되
       동의(→계산서 발급)조차 안 된 달이 입금완료로 보이지 않게 agreed 를 함께 건다. */
    const paid = agreed && b.m >= 2;
    return {
      ...b,
      issued: st.issued,
      open: st.open,
      마감: st.deadline,
      동의구분: st.mode,
      동의시각: st.at,
      작성일자: st.docDate,
      /* 수동 기록은 읽을 때 항상 이긴다 — 동의 뒤에 발급일을 늦춰 '발행 전' 이 돼도 동의완료다. */
      거래명세서동의: agreed ? "동의완료" : !st.issued ? "발급예정" : "동의대기",
      계산서발급: agreed ? "발급완료" : "발급대기",
      입금완료: paid ? "입금완료" : "미입금",
    };
  });
}

/** report.js 계약 유지용 — { [clientId]: rows } */
export const settlementsMap = (clients, now = new Date()) =>
  Object.fromEntries(clients.map((c) => [c.id, settlementsFor(c, now)]));
