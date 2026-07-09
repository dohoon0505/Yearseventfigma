/* ============================================================
   invoice.js — 거래명세서 조회 (#/app/invoice) · 시안 mockups/invoice/02-brand.html 이식
   좌: A4 문서 미리보기(invoice-doc.js 그대로) · 우: 다운로드·공개링크·조회(연·월 드롭다운)·동의 레일.
   페이지 규약: mount(root, { nav }) → cleanup. dom.js html``/on() 사용.
   A4 문서·PDF 인쇄는 invoice-doc.js(invoiceDoc/printInvoiceDoc)를 변경 없이 호출.
   연·월 드롭다운은 ui.js 공용 makeDropdown() 재사용(페이지 내 재구현 없음).
   ============================================================ */
import { setHTML, on, qs, html } from "../dom.js";
import { invoiceDoc, printInvoiceDoc } from "../invoice-doc.js";
import { issueLink, publicInvoiceUrl, SUPPLIER, ACCOUNT } from "../data/invoice-links.js";
import { pageTitle, makeDropdown, simpleModal } from "../ui.js";
import { sheetToXlsx } from "../util/xlsx.js";

/* ── 월별 거래명세서 목데이터 (데모: 2026-03·04·06) ─────────────
   2026-06 은 멀티페이지 A4 시연용 60건 데이터.
   rows: [배송요청일시, 발송인, 배송지, 주문상품, 결제금액(숫자)] */
const DB = {
  "2026-06": {
    issue: "2026년 07월 01일",
    rows: [
      ["2026년 06월 30일", "채상운", "서울 종로구 대학로 101 서울대학교병원 장례식장 특2호실", "근조바구니", 50000],
      ["2026년 06월 30일", "최윤호", "인천 연수구 컨벤시아대로 165 송도컨벤시아 2층 프리미어볼룸", "중형 꽃바구니", 80000],
      ["2026년 06월 29일", "남기훈", "전북 익산시 무왕로 895 원광대학교병원 장례식장 2호실", "3단화환(고급형)", 60000],
      ["2026년 06월 29일", "박진찬", "대구 중구 달성로 56 계명대 동산병원 장례식장 4호실", "근조오브제(단형)", 50000],
      ["2026년 06월 28일", "강민재", "대구 수성구 동대구로 305 호텔인터불고 엑스코 3층", "3단화환(고급형)", 60000],
      ["2026년 06월 28일", "문채원", "경기 성남시 분당구 야탑로 59 분당차병원 장례식장 5호실", "근조바구니", 50000],
      ["2026년 06월 27일", "정소빈", "대전 중구 문화로 282 충남대학교병원 장례식장 3호실", "3단화환(기본형)", 50000],
      ["2026년 06월 27일", "신보라", "경기 성남시 분당구 판교역로 160 카노푸스 웨딩홀 4층", "3단화환(기본형)", 50000],
      ["2026년 06월 26일", "조현우", "서울 서초구 강남대로 373 홀리데이인 서울강남 그랜드볼룸", "3단화환(고급형)", 60000],
      ["2026년 06월 26일", "오임찬", "충남 천안시 동남구 망향로 201 순천향대 천안병원 장례식장 3호실", "평탁화(10kg)", 75000],
      ["2026년 06월 25일", "윤서준", "부산 서구 감천로 262 고신대복음병원 장례식장 2호실", "근조바구니", 50000],
      ["2026년 06월 25일", "서지안", "경기 고양시 일산동구 정발산로 24 웨스턴돔 웨딩홀 5층", "3단화환(기본형)", 50000],
      ["2026년 06월 24일", "한다운", "서울 종로구 대학로 101 서울대학교병원 장례식장 특2호실", "3단화환(고급형)", 60000],
      ["2026년 06월 24일", "임지훈", "광주 동구 필문대로 365 조선대학교병원 장례식장 1호실", "근조오브제(단형)", 50000],
      ["2026년 06월 23일", "홍길동", "부산 해운대구 마린시티2로 33 파라다이스호텔 그랜드볼룸", "평탁화(10kg)", 75000],
      ["2026년 06월 23일", "김현수", "대구 중구 달성로 56 계명대 동산병원 장례식장 4호실", "근조바구니", 50000],
      ["2026년 06월 22일", "권나은", "경기 수원시 영통구 월드컵로 164 아주대학교병원 장례식장 5호실", "3단화환(기본형)", 50000],
      ["2026년 06월 22일", "김태권", "인천 연수구 컨벤시아대로 165 송도컨벤시아 2층 프리미어볼룸", "중형 꽃바구니", 80000],
      ["2026년 06월 21일", "이정민", "서울 강남구 테헤란로 406 아펠가모 삼성 4층 그랜드홀", "평탁화(10kg)", 75000],
      ["2026년 06월 21일", "배동석", "서울 서초구 반포대로 222 서울성모병원 장례식장 3호실", "평탁화(10kg)", 75000],
      ["2026년 06월 20일", "채상운", "인천 남동구 남동대로774번길 21 가천대 길병원 장례식장 6호실", "근조바구니", 50000],
      ["2026년 06월 20일", "최윤호", "서울 중구 을지로 30 롯데호텔서울 3층 크리스탈볼룸", "중형 꽃바구니", 80000],
      ["2026년 06월 19일", "남기훈", "부산 서구 감천로 262 고신대복음병원 장례식장 2호실", "3단화환(고급형)", 60000],
      ["2026년 06월 19일", "박진찬", "울산 동구 방어진순환도로 877 울산대학교병원 장례식장 2호실", "근조오브제(단형)", 50000],
      ["2026년 06월 18일", "강민재", "서울 서초구 강남대로 373 홀리데이인 서울강남 그랜드볼룸", "3단화환(고급형)", 60000],
      ["2026년 06월 18일", "문채원", "광주 동구 필문대로 365 조선대학교병원 장례식장 1호실", "근조바구니", 50000],
      ["2026년 06월 17일", "정소빈", "전북 익산시 무왕로 895 원광대학교병원 장례식장 2호실", "3단화환(기본형)", 50000],
      ["2026년 06월 17일", "신보라", "경기 고양시 일산동구 정발산로 24 웨스턴돔 웨딩홀 5층", "3단화환(기본형)", 50000],
      ["2026년 06월 16일", "조현우", "대구 수성구 동대구로 305 호텔인터불고 엑스코 3층", "3단화환(고급형)", 60000],
      ["2026년 06월 16일", "오임찬", "경기 성남시 분당구 야탑로 59 분당차병원 장례식장 5호실", "평탁화(10kg)", 75000],
      ["2026년 06월 15일", "윤서준", "대전 중구 문화로 282 충남대학교병원 장례식장 3호실", "근조바구니", 50000],
      ["2026년 06월 15일", "서지안", "경기 성남시 분당구 판교역로 160 카노푸스 웨딩홀 4층", "3단화환(기본형)", 50000],
      ["2026년 06월 14일", "한다운", "인천 남동구 남동대로774번길 21 가천대 길병원 장례식장 6호실", "3단화환(고급형)", 60000],
      ["2026년 06월 14일", "임지훈", "충남 천안시 동남구 망향로 201 순천향대 천안병원 장례식장 3호실", "근조오브제(단형)", 50000],
      ["2026년 06월 13일", "홍길동", "서울 강남구 테헤란로 406 아펠가모 삼성 4층 그랜드홀", "평탁화(10kg)", 75000],
      ["2026년 06월 13일", "김현수", "울산 동구 방어진순환도로 877 울산대학교병원 장례식장 2호실", "근조바구니", 50000],
      ["2026년 06월 12일", "권나은", "서울 종로구 대학로 101 서울대학교병원 장례식장 특2호실", "3단화환(기본형)", 50000],
      ["2026년 06월 12일", "김태권", "서울 중구 을지로 30 롯데호텔서울 3층 크리스탈볼룸", "중형 꽃바구니", 80000],
      ["2026년 06월 11일", "이정민", "부산 해운대구 마린시티2로 33 파라다이스호텔 그랜드볼룸", "평탁화(10kg)", 75000],
      ["2026년 06월 11일", "배동석", "대구 중구 달성로 56 계명대 동산병원 장례식장 4호실", "평탁화(10kg)", 75000],
      ["2026년 06월 10일", "채상운", "경기 수원시 영통구 월드컵로 164 아주대학교병원 장례식장 5호실", "근조바구니", 50000],
      ["2026년 06월 10일", "최윤호", "인천 연수구 컨벤시아대로 165 송도컨벤시아 2층 프리미어볼룸", "중형 꽃바구니", 80000],
      ["2026년 06월 09일", "남기훈", "대전 중구 문화로 282 충남대학교병원 장례식장 3호실", "3단화환(고급형)", 60000],
      ["2026년 06월 09일", "박진찬", "서울 서초구 반포대로 222 서울성모병원 장례식장 3호실", "근조오브제(단형)", 50000],
      ["2026년 06월 08일", "강민재", "대구 수성구 동대구로 305 호텔인터불고 엑스코 3층", "3단화환(고급형)", 60000],
      ["2026년 06월 08일", "문채원", "충남 천안시 동남구 망향로 201 순천향대 천안병원 장례식장 3호실", "근조바구니", 50000],
      ["2026년 06월 07일", "정소빈", "부산 서구 감천로 262 고신대복음병원 장례식장 2호실", "3단화환(기본형)", 50000],
      ["2026년 06월 07일", "신보라", "경기 성남시 분당구 판교역로 160 카노푸스 웨딩홀 4층", "3단화환(기본형)", 50000],
      ["2026년 06월 06일", "조현우", "서울 서초구 강남대로 373 홀리데이인 서울강남 그랜드볼룸", "3단화환(고급형)", 60000],
      ["2026년 06월 06일", "오임찬", "광주 동구 필문대로 365 조선대학교병원 장례식장 1호실", "평탁화(10kg)", 75000],
      ["2026년 06월 05일", "윤서준", "전북 익산시 무왕로 895 원광대학교병원 장례식장 2호실", "근조바구니", 50000],
      ["2026년 06월 05일", "서지안", "경기 고양시 일산동구 정발산로 24 웨스턴돔 웨딩홀 5층", "3단화환(기본형)", 50000],
      ["2026년 06월 04일", "한다운", "경기 수원시 영통구 월드컵로 164 아주대학교병원 장례식장 5호실", "3단화환(고급형)", 60000],
      ["2026년 06월 04일", "임지훈", "경기 성남시 분당구 야탑로 59 분당차병원 장례식장 5호실", "근조오브제(단형)", 50000],
      ["2026년 06월 03일", "홍길동", "부산 해운대구 마린시티2로 33 파라다이스호텔 그랜드볼룸", "평탁화(10kg)", 75000],
      ["2026년 06월 03일", "김현수", "서울 서초구 반포대로 222 서울성모병원 장례식장 3호실", "근조바구니", 50000],
      ["2026년 06월 02일", "권나은", "인천 남동구 남동대로774번길 21 가천대 길병원 장례식장 6호실", "3단화환(기본형)", 50000],
      ["2026년 06월 02일", "김태권", "인천 연수구 컨벤시아대로 165 송도컨벤시아 2층 프리미어볼룸", "중형 꽃바구니", 80000],
      ["2026년 06월 01일", "이정민", "서울 강남구 테헤란로 406 아펠가모 삼성 4층 그랜드홀", "평탁화(10kg)", 75000],
      ["2026년 06월 01일", "배동석", "울산 동구 방어진순환도로 877 울산대학교병원 장례식장 2호실", "평탁화(10kg)", 75000],
    ],
  },
  "2026-04": {
    issue: "2026년 05월 01일",
    rows: [
      ["2026년 04월 28일", "홍길동", "서울 관악구 신림동 산 56-1 65동 서울대학교 교수회관", "3단화환(기본형)", 50000],
      ["2026년 04월 25일", "김태권", "서울 동산구 아에린로29 신정기념관내 로얄마크컨벤션 3층 포장홀", "3단화환(기본형)", 50000],
      ["2026년 04월 21일", "김태권", "경기 마주시 금품억로 190 새디인병원 장례식장 지하1층 특2호실", "3단화환(기본형)", 50000],
      ["2026년 04월 17일", "채상운", "부산 남구 황령대로 401-9 그랜드드몬트 6층 시그니처룸", "3단화환(고급형)", 60000],
      ["2026년 04월 14일", "박진찬", "경상북도 예천군 예천읍 양오로 154 (정북아) 예천농협장례식장 3호실", "3단화환(기본형)", 50000],
      ["2026년 04월 10일", "박진찬", "서울 강남구 논현로 645 렉시미나호텔", "3단화환(기본형)", 50000],
      ["2026년 04월 07일", "홍길동", "서울 관악구 신림동 산 56-1 65동 서울대학교 교수회관", "근조바구니", 50000],
      ["2026년 04월 03일", "김태권", "서울 동산구 아에린로29 신정기념관내 로얄마크컨벤션 3층 포장홀", "3단화환(기본형)", 50000],
    ],
  },
  "2026-03": {
    issue: "2026년 04월 01일",
    rows: [
      ["2026년 03월 27일", "오임찬", "서울 서초구 반포대로 179 서울성모병원 장례식장", "3단화환(고급형)", 60000],
      ["2026년 03월 19일", "한다운", "서울 송파구 올림픽로 319 웨딩시그니처 5층", "3단화환(기본형)", 50000],
      ["2026년 03월 12일", "김현수", "인천 연수구 컨벤시아대로 165 송도컨벤시아", "3단화환(기본형)", 50000],
      ["2026년 03월 05일", "오임찬", "대전 서구 둔산대로 100 대전예술의전당", "3단화환(고급형)", 60000],
    ],
  },
};
const BUYER = {
  address: "서울 중구 퇴계로 100 스테이트타워 남산 3층 (주)올해의경조사", company: "주식회사 싱크플로",
  bizNumber: "680-87-02988", ceo: "홍길동", summary: "꽃배달 이용료 청구", invoiceNote: "명세서 조회 후 발급",
};
const YEARS = ["2024", "2025", "2026"];
const MONTHS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
const won = (n) => Number(n).toLocaleString("ko-KR") + "원";
const pad2 = (n) => String(n).padStart(2, "0");

/* ── 엑셀 스타일 팔레트(ARGB) · tokens.css 브랜드값 미러링 ────────
   워크시트 색상은 CSS 토큰을 참조할 수 없어 브랜드 hex 를 ARGB(FF+hex)로 옮겨 둔다. */
const XA = {
  orange: "FFF15A2A", orangeSoft: "FFFFF1EC", orangeInk: "FFD94000",
  white: "FFFFFFFF", ink: "FF111111", text2: "FF444444", muted: "FF888888",
  label: "FFF5F5F5", zebra: "FFFAFBFC", total: "FFFFF6EF",
};
const MONEY_FMT = '#,##0"원"';
const XS = {
  title:   { bold: true, size: 18, color: XA.orangeInk, fill: XA.orangeSoft, align: "center", valign: "center" },
  sub:     { size: 10.5, color: XA.muted, align: "center", valign: "center" },
  section: { bold: true, size: 11.5, color: XA.ink, fill: XA.label, align: "left", valign: "center" },
  mlabel:  { bold: true, size: 10.5, color: XA.text2, fill: XA.label, align: "right", valign: "center", border: true },
  mvalue:  { size: 10.5, color: XA.ink, align: "left", valign: "center", wrap: true, border: true },
  th:      { bold: true, size: 11, color: XA.white, fill: XA.orange, align: "center", valign: "center", border: true },
  tlabel:  { bold: true, size: 11, color: XA.ink, fill: XA.total, align: "right", valign: "center", border: true },
  tmoney:  { bold: true, size: 12, color: XA.orangeInk, fill: XA.total, align: "right", valign: "center", border: true, numFmt: MONEY_FMT },
  flabel:  { bold: true, size: 10.5, color: XA.text2, fill: XA.label, align: "right", valign: "center", border: true },
  fvalue:  { size: 10.5, color: XA.ink, align: "left", valign: "center", wrap: true, border: true },
  empty:   { size: 11, color: XA.muted, align: "center", valign: "center", border: true },
};
/* 거래내역 데이터 셀 (짝수 행 얼룩(zebra) 배경) */
const xCenter = (z) => ({ size: 10.5, color: XA.text2, align: "center", valign: "center", border: true, ...(z ? { fill: XA.zebra } : {}) });
const xLeft   = (z) => ({ size: 10.5, color: XA.ink, align: "left", valign: "center", wrap: true, border: true, ...(z ? { fill: XA.zebra } : {}) });
const xMoney  = (z) => ({ size: 10.5, color: XA.ink, align: "right", valign: "center", border: true, numFmt: MONEY_FMT, ...(z ? { fill: XA.zebra } : {}) });

function markup() {
  return html`
    <div class="page-invoice">
      ${pageTitle({ imgSrc: "./assets/nav-invoice.png", title: "거래명세서 조회" })}
      <div class="cols">
        <!-- 좌: A4 문서 미리보기 (invoice-doc.js 렌더) -->
        <div class="doc"><div class="a4-frame" data-doc-host></div></div>

        <!-- 우: 단일 통합 리모컨 (기간 · 금액 · 프로세스 · 액션 · 동의 · 푸터) -->
        <aside class="remote">
          <!-- ① 기간 헤더 + 월 스테퍼 + 연·월 드롭다운 -->
          <div class="rm-period">
            <div class="rm-period__top">
              <button class="rm-step" data-prev aria-label="이전 달">‹</button>
              <div class="rm-period__label"><b data-period-lbl></b><span>귀속 명세서</span></div>
              <button class="rm-step" data-next aria-label="다음 달">›</button>
            </div>
            <div class="rm-period__dds">
              <div class="dd" data-dd="year"><button type="button" class="dd-trigger" aria-haspopup="listbox" aria-expanded="false"></button><div class="dd-panel" role="listbox"></div></div>
              <div class="dd" data-dd="month"><button type="button" class="dd-trigger" aria-haspopup="listbox" aria-expanded="false"></button><div class="dd-panel" role="listbox"></div></div>
            </div>
          </div>

          <!-- ② 금액 요약 (차분한 텍스트 라인) -->
          <div class="rm-hero">
            <p class="lbl" data-hero-lbl></p>
            <p class="amt num" data-hero-amt>0원</p>
          </div>

          <!-- ③ 액션 (PDF · EXCEL · 열람링크) · 아이콘 없음 -->
          <div class="rm-actions">
            <div class="rm-actions__row">
              <button class="rm-btn rm-btn--primary" data-pdf>PDF 다운로드</button>
              <button class="rm-btn rm-btn--dark" data-excel>EXCEL 다운로드</button>
            </div>
            <button class="rm-btn rm-btn--secondary" data-link>거래명세서 열람링크 <span class="rm-btn__sub">· 링크만으로 접속이 가능해요</span></button>
          </div>

          <!-- ④ 계산서 발급 동의 (조용한 섹션) -->
          <div class="rm-agree" data-agree-wrap>
            <div class="pending">
              <p>명세서 내용을 확인한 뒤 동의하면 <b>위 금액으로 세금계산서가 발급</b>됩니다. 동의 후에는 내용을 변경할 수 없습니다.</p>
              <button data-agree>해당 내용으로 계산서 발급에 동의합니다</button>
            </div>
            <div class="complete" tabindex="-1">
              <span class="ck">✓</span>
              <div><b>계산서 발급 동의 완료</b><span data-agree-date></span></div>
            </div>
          </div>

          <div class="rm-foot">동의 후 입금이 확인되면 정산이 완료됩니다 · 문의 02-0000-0000</div>
        </aside>
      </div>

      <div class="iv-toast" data-toast></div>
    </div>
  `;
}

export function mount(root, { nav }) {
  const state = { year: "2026", month: "06", agreed: false };
  setHTML(root, markup());
  const el = (s) => qs(root, s);

  /* 현재 선택 월 → invoice-doc.js 문서 데이터 객체 */
  function docData() {
    const key = `${state.year}-${state.month}`;
    const data = DB[key];
    const label = `${state.year}년 ${state.month}월`;
    const total = data ? data.rows.reduce((a, r) => a + r[4], 0) : 0;
    const items = data
      ? data.rows.map((r) => ({ date: r[0], sender: r[1], address: r[2], product: r[3], amount: won(r[4]) }))
      : [{ date: "", sender: "", address: "해당 월의 거래 내역이 없습니다", product: "", amount: "" }];
    return {
      _label: label,
      title: `${state.year.slice(2)}년 ${state.month}월 꽃배달 거래명세서`,
      period: `${label} 귀속`,
      buyer: { ...BUYER, issueDate: data ? data.issue : "-" },
      supplier: SUPPLIER,
      items,
      account: ACCOUNT,
      total: won(total),
    };
  }

  /* 스테퍼·드롭다운 어느 쪽으로 바꿔도 문서·기간 라벨·금액·기한·트리거가 함께 갱신.
     (동의 상태는 유지) */
  function render() {
    const d = docData();
    el("[data-doc-host]").innerHTML = invoiceDoc(d);
    el("[data-period-lbl]").textContent = d._label;
    el("[data-hero-lbl]").textContent = `${d._label} 결제금액`;
    el("[data-hero-amt]").textContent = d.total;
    ddYear.renderTrigger();
    ddMonth.renderTrigger();
  }
  /* 월 스테퍼: 연 경계를 넘어가면 연도까지 함께 이동 */
  function stepMonth(delta) {
    let m = Number(state.month) + delta, y = Number(state.year);
    if (m < 1) { m = 12; y -= 1; } else if (m > 12) { m = 1; y += 1; }
    state.year = String(y);
    state.month = pad2(m);
    render();
  }

  /* 현재 선택 월 거래명세서를 서식이 정리된 .xlsx 로 내려받는다 (의존성 없는 xlsx.js).
     제목 밴드 · 공급자/공급받는자 정보표 · 색상 헤더의 거래내역 표(얼룩 배경) · 합계 · 입금 안내로
     구성하고, 결제금액/합계는 숫자셀(₩ 서식)로 기록해 엑셀에서 바로 합계·편집이 가능하다. */
  function downloadExcel() {
    const data = DB[`${state.year}-${state.month}`];
    const label = `${state.year}년 ${state.month}월`;
    const total = data ? data.rows.reduce((a, r) => a + r[4], 0) : 0;

    const rows = [];
    const merges = [];
    const rowHeights = {};
    let R = 0;
    const push = (cells) => { rows.push(cells); R += 1; return R; };
    const mr = (a, z) => merges.push(`${a}${R}:${z}${R}`);
    const bl = (s) => ({ v: "", s }); /* 병합 범위를 채우는 서식 있는 빈 셀 */
    const band = (t) => { push([{ v: t, s: XS.section }, bl(XS.section), bl(XS.section), bl(XS.section), bl(XS.section)]); mr("A", "E"); };
    const meta = (l, v) => { push([{ v: l, s: XS.mlabel }, { v, s: XS.mvalue }, bl(XS.mvalue), bl(XS.mvalue), bl(XS.mvalue)]); mr("B", "E"); };
    const foot = (l, v) => { push([{ v: l, s: XS.flabel }, { v, s: XS.fvalue }, bl(XS.fvalue), bl(XS.fvalue), bl(XS.fvalue)]); mr("B", "E"); };

    /* 제목 · 부제 */
    push([{ v: "거래명세서", s: XS.title }, bl(XS.title), bl(XS.title), bl(XS.title), bl(XS.title)]); mr("A", "E"); rowHeights[R] = 34;
    push([{ v: `${label} 귀속 · ${BUYER.summary}`, s: XS.sub }, bl(XS.sub), bl(XS.sub), bl(XS.sub), bl(XS.sub)]); mr("A", "E"); rowHeights[R] = 18;
    push([]);
    /* 공급받는자 */
    band("■ 공급받는자");
    meta("회사명", BUYER.company);
    meta("사업자등록번호", BUYER.bizNumber);
    meta("대표자", BUYER.ceo);
    meta("소재지", BUYER.address);
    meta("청구 항목", BUYER.summary);
    push([]);
    /* 공급자 */
    band("■ 공급자");
    meta("회사명", SUPPLIER.company);
    meta("사업자등록번호", SUPPLIER.bizNumber);
    meta("대표자", SUPPLIER.ceo);
    meta("E-MAIL", SUPPLIER.email);
    meta("FAX", SUPPLIER.fax);
    push([]);
    /* 거래 내역 */
    band("■ 거래 내역");
    push([{ v: "배송요청일시", s: XS.th }, { v: "발송인", s: XS.th }, { v: "배송지", s: XS.th }, { v: "주문상품", s: XS.th }, { v: "결제금액", s: XS.th }]); rowHeights[R] = 24;
    if (data) {
      data.rows.forEach((r, i) => {
        const z = i % 2 === 1;
        push([{ v: r[0], s: xCenter(z) }, { v: r[1], s: xCenter(z) }, { v: r[2], s: xLeft(z) }, { v: r[3], s: xLeft(z) }, { v: r[4], s: xMoney(z) }]);
      });
      push([{ v: "합계", s: XS.tlabel }, bl(XS.tlabel), bl(XS.tlabel), bl(XS.tlabel), { v: total, s: XS.tmoney }]); mr("A", "D");
    } else {
      push([{ v: "해당 월의 거래 내역이 없습니다", s: XS.empty }, bl(XS.empty), bl(XS.empty), bl(XS.empty), bl(XS.empty)]); mr("A", "E");
    }
    push([]);
    /* 입금 계좌 */
    foot("입금 계좌", ACCOUNT);

    const cols = [18, 11, 46, 20, 14];

    try {
      const bytes = sheetToXlsx({ sheetName: label, rows, cols, merges, rowHeights });
      const blob = new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `거래명세서_${state.year}_${state.month}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      toast("EXCEL 파일을 다운로드했습니다");
    } catch (err) {
      console.error("EXCEL 생성 오류:", err);
      alert("EXCEL 생성 중 오류가 발생했습니다. 다시 시도해 주세요.");
    }
  }

  const ddYear = makeDropdown(el('[data-dd="year"]'), {
    unit: "년", options: () => YEARS, get: () => state.year,
    set: (v) => { state.year = v; render(); },
  });
  const ddMonth = makeDropdown(el('[data-dd="month"]'), {
    unit: "월", options: () => MONTHS, get: () => state.month,
    set: (v) => { state.month = v; render(); },
  });

  /* 토스트 (잉크 필) */
  let toastTimer = null;
  function toast(msg) {
    const t = el("[data-toast]");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2000);
  }

  /* 현재 월 문서에 대한 공개 링크 데이터 (invoice-links 계약) */
  function currentDoc() {
    const d = docData();
    return { title: d.title, period: d.period, buyer: d.buyer, supplier: d.supplier, items: d.items, account: d.account, total: d.total };
  }

  /* 계산서 발급 동의 적용 (재확인 모달에서 '동의하고 발급' 클릭 시 실행)
     → 동의 섹션 완료 라인 전환 */
  function applyAgree() {
    if (state.agreed) return;
    state.agreed = true;
    el("[data-agree-wrap]").classList.add("done");
    const dt = new Date();
    el("[data-agree-date]").textContent = `${dt.getFullYear()}. ${pad2(dt.getMonth() + 1)}. ${pad2(dt.getDate())} 동의`;
    toast("계산서 발급에 동의했습니다");
  }

  /* 계산서 발급 재확인 모달 — 되돌릴 수 없는 동작이라 한 번 더 확인받는다. */
  let confirmModal = null;
  function openAgreeConfirm() {
    if (state.agreed || confirmModal) return;
    const d = docData();
    const body = html`
      <div class="hm-info"><span><b class="num">${d._label} 결제금액 ${d.total}</b>으로 세금계산서가 발급됩니다. 동의 후에는 명세서 내용을 변경할 수 없습니다.</span></div>
    `;
    const footer = html`
      <button class="hm-btn hm-btn--secondary" data-action="close">취소</button>
      <button class="hm-btn hm-btn--primary" data-confirm>동의하고 발급</button>
    `;
    confirmModal = simpleModal({
      title: "계산서 발급에 동의할까요?",
      size: "sm",
      body,
      footer,
      onClose: () => { confirmModal = null; },
    });
    confirmModal.panel.addEventListener("click", (e) => {
      if (!e.target.closest("[data-confirm]")) return;
      applyAgree();
      confirmModal.close();
      /* close()가 (이미 숨겨진) 동의 버튼으로 포커스를 되돌려 body 로 흘리므로,
         드러난 '동의 완료' 블록으로 포커스를 옮겨 키보드·스크린리더 맥락을 유지한다. */
      const done = el(".rm-agree .complete");
      if (done) done.focus();
    });
  }

  const offs = [
    on(root, "click", "[data-pdf]", () => {
      const docEl = el(".invoice-doc");
      try { printInvoiceDoc(docEl, `거래명세서_${state.year}_${state.month}`); }
      catch (err) { console.error("PDF 생성 오류:", err); alert("PDF 생성 중 오류가 발생했습니다. 다시 시도해 주세요."); }
    }),
    on(root, "click", "[data-excel]", downloadExcel),
    on(root, "click", "[data-link]", () => {
      const token = issueLink({ bizNumber: BUYER.bizNumber, doc: currentDoc() });
      const url = publicInvoiceUrl(token);
      const ok = () => toast("거래명세서 열람링크가 복사되었습니다 · 링크만으로 접속이 가능해요");
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(ok).catch(() => window.prompt("거래명세서 열람링크 (복사하세요)", url));
      else window.prompt("거래명세서 열람링크 (복사하세요)", url);
    }),
    on(root, "click", "[data-prev]", () => stepMonth(-1)),
    on(root, "click", "[data-next]", () => stepMonth(1)),
    on(root, "click", "[data-agree]", openAgreeConfirm),
  ];

  render();

  return () => {
    offs.forEach((off) => off());
    ddYear.destroy();
    ddMonth.destroy();
    clearTimeout(toastTimer);
    if (confirmModal) confirmModal.close();
  };
}
