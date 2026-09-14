/* ============================================================
   postcode.js — 우편번호(주소) 검색 팝업 래퍼.

   구 시스템은 주문·거래처 모두 「주소검색」 버튼으로 표준 주소를 넣었는데
   신규는 자유 입력이라 「전남 신안」과 「전라남도 신안군」이 다른 문자열이
   되어 지역 규칙(intake-rules)에 걸리지 않는 문제가 있었다.

   ⚠️ 외부 스크립트에 의존하므로 **실패해도 주문이 막히면 안 된다.**
      로드 실패·차단 환경에서는 ensurePostcode() 가 false 를 돌려주고
      호출부는 기존 직접 입력을 그대로 쓴다. 버튼만 조용히 숨긴다.

   반환 형식: { zip, road, sido, sigungu } — 상세주소는 사용자가 직접 잇는다.
   ============================================================ */
const SRC = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";

let loading = null;

/** 스크립트를 1회만 로드한다. @returns {Promise<boolean>} 사용 가능 여부 */
export function ensurePostcode() {
  if (window.daum && window.daum.Postcode) return Promise.resolve(true);
  if (loading) return loading;
  loading = new Promise((resolve) => {
    const el = document.createElement("script");
    el.src = SRC;
    el.async = true;
    el.onload = () => resolve(!!(window.daum && window.daum.Postcode));
    el.onerror = () => resolve(false); // 차단·오프라인 — 직접 입력으로 폴백
    document.head.appendChild(el);
  });
  return loading;
}

/**
 * 주소 검색 팝업을 띄우고 선택 결과를 콜백으로 준다.
 * 사용 불가 환경이면 아무 일도 하지 않고 false 를 돌려준다(호출부는 직접 입력 유지).
 */
export async function openPostcode(onPick) {
  const ok = await ensurePostcode();
  if (!ok) return false;
  new window.daum.Postcode({
    oncomplete: (data) => {
      const road = data.roadAddress || data.jibunAddress || "";
      onPick({
        zip: data.zonecode || "",
        road,
        sido: data.sido || "",
        sigungu: data.sigungu || "",
      });
    },
  }).open();
  return true;
}
