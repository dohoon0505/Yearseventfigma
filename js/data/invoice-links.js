/* ============================================================
   invoice-links.js — public 거래명세서 링크 매핑 (DEMO mock).
   각 토큰 = 한 기업의 한 귀속 년/월 명세서. 공개 링크(/invoice/?link=토큰)로
   접근하며, 사업자번호(bizNumber) 입력으로 본인 확인 후 doc 노출.

   ⚠️ DEMO: 사업자번호는 비밀이 아니므로 이 게이트는 약식 확인일 뿐입니다.
   실서비스에서는 link 토큰 자체를 충분히 긴 무작위 비밀값(capability URL)으로
   발급하고, 서버에서 토큰↔명세서 매핑·만료·접근로그를 관리해야 합니다.
   ============================================================ */
const SUPPLIER = { company: "도랑플라워", bizNumber: "321-99-01778", ceo: "김도훈", email: "ehgns335@naver.com", fax: "053-715-2699" };
const ACCOUNT = "NH농협은행 352-2284-9916-83 예금주 김도훈(도랑플라워)";

export const INVOICE_LINKS = {
  // (주)싱크플로 · 2026년 04월
  FP9S0QA8YA: {
    bizNumber: "680-87-02988",
    doc: {
      title: "26년 04월 꽃배달 거래명세서",
      period: "2026년 04월 귀속",
      buyer: { address: "서울 중구 퇴계로 100 스테이트타워 남산 3층 주식회사 싱크플로", company: "주식회사 싱크플로", bizNumber: "680-87-02988", ceo: "홍길동", summary: "꽃배달 이용료 청구", issueDate: "2026년 05월 01일", invoiceNote: "명세서 조회 후 발급" },
      supplier: SUPPLIER,
      items: [
        { date: "2026년 04월 28일", sender: "홍길동", address: "서울 관악구 관악로 1 서울대학교 행정관", product: "근조화환(기본형)", amount: "70,000원" },
        { date: "2026년 04월 21일", sender: "김태권", address: "경기 성남시 분당구 판교로 289 삼환하이펙스", product: "축하화환(고급형)", amount: "75,000원" },
        { date: "2026년 04월 12일", sender: "박진찬", address: "부산 해운대구 센텀중앙로 79 센텀사이언스파크", product: "근조화환(기본형)", amount: "70,000원" },
      ],
      account: ACCOUNT,
      total: "215,000원",
    },
  },
  // (주)싱크플로 · 2026년 03월 (동일 기업, 다른 귀속월 → 별도 링크)
  KM3X7BQ2LP: {
    bizNumber: "680-87-02988",
    doc: {
      title: "26년 03월 꽃배달 거래명세서",
      period: "2026년 03월 귀속",
      buyer: { address: "서울 중구 퇴계로 100 스테이트타워 남산 3층 주식회사 싱크플로", company: "주식회사 싱크플로", bizNumber: "680-87-02988", ceo: "홍길동", summary: "꽃배달 이용료 청구", issueDate: "2026년 04월 01일", invoiceNote: "발급완료" },
      supplier: SUPPLIER,
      items: [
        { date: "2026년 03월 30일", sender: "홍길동", address: "서울 강남구 테헤란로 152 강남파이낸스센터", product: "3단화환(특대형)", amount: "95,000원" },
        { date: "2026년 03월 22일", sender: "정소빈", address: "대전 유성구 대학로 99 세종빌딩", product: "근조오브제(2단형)", amount: "120,000원" },
        { date: "2026년 03월 15일", sender: "임직원", address: "인천 연수구 송도과학로 32 송도컨벤시아", product: "서양란(고급형)", amount: "80,000원" },
        { date: "2026년 03월 08일", sender: "홍길동", address: "광주 서구 상무중앙로 110 김대중컨벤션센터", product: "근조화환(기본형)", amount: "50,000원" },
      ],
      account: ACCOUNT,
      total: "345,000원",
    },
  },
  // (주)진양코퍼레이션 · 2026년 04월 (다른 기업)
  ZT6W1HE4NC: {
    bizNumber: "123-45-67890",
    doc: {
      title: "26년 04월 꽃배달 거래명세서",
      period: "2026년 04월 귀속",
      buyer: { address: "서울 강남구 테헤란로 152 강남파이낸스센터 18층 (주)진양코퍼레이션", company: "(주)진양코퍼레이션", bizNumber: "123-45-67890", ceo: "김진양", summary: "꽃배달 이용료 청구", issueDate: "2026년 05월 01일", invoiceNote: "명세서 조회 후 발급" },
      supplier: SUPPLIER,
      items: [
        { date: "2026년 04월 26일", sender: "김사원", address: "서울 서초구 서초대로 396 강남빌딩", product: "축하화환(고급형)", amount: "75,000원" },
        { date: "2026년 04월 18일", sender: "총무팀", address: "경기 성남시 분당구 판교로 289", product: "관엽화분(중형)", amount: "80,000원" },
      ],
      account: ACCOUNT,
      total: "155,000원",
    },
  },
};

/** 사업자번호 비교용: 숫자만 추출. */
export const normalizeBiz = (s) => String(s || "").replace(/[^0-9]/g, "");
