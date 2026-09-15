/* ============================================================
   order.js — 경조상품 간편주문 (#/app) · 시안 mockups/order/08-brand.html 이식
   4단계 플로우: 경조사·상품 선택(단계적 공개) → 배송지·일시 → 리본문구·보내는분 → 확인·접수.
   데이터는 store(ALL_PRODUCTS·contacts·profiles) 연동. 드롭다운/데이트피커는 ui.js 공용 헬퍼.
   페이지 규약: mount(root, { nav }) → cleanup. dom.js html``/on() 사용.
   ============================================================ */
import { html, raw, setHTML, on, qs, qsa } from "../dom.js";
import { store, ALL_PRODUCTS, productKey, receivingContacts } from "../store.js";
import { pageTitle, makeDropdown, makeDatepicker, simpleModal } from "../ui.js";
import { deliveryFeeFor } from "../data/delivery-fees.js";
import { evaluateAddress, matchesProduct } from "../data/intake-rules.js";
import { ensurePostcode, openPostcode } from "../util/postcode.js";
import { BIZ, hourOptions, minOptions } from "../util/date.js";

/* 금액 문자열("70,000원") ↔ 숫자 — 배송지 추가 배송비 합산용 */
const parseWon = (s) => Number(String(s).replace(/[^0-9]/g, "")) || 0;
const won = (n) => Number(n).toLocaleString("ko-KR") + "원";

/* 연락처 자동 하이픈 — 순수 포맷. 받는분·추가 수신자 입력이 공유한다. */
const fmtPhone = (v) => {
  const d = String(v).replace(/\D/g, "").slice(0, 11);
  if (d.length > 7) return d.slice(0, 3) + "-" + d.slice(3, 7) + "-" + d.slice(7);
  if (d.length > 3) return d.slice(0, 3) + "-" + d.slice(3);
  return d;
};
const phoneOk = (v) => String(v).replace(/\D/g, "").length >= 10;

/* 합동 발송 시 함께 알림받을 추가 수신자 상한 */
const NT_MAX = 5;

/* ── 경조사 정의 (배너 · 카테고리 · 링크 안내문구) ───────────── */
/* Y 카탈로그의 3단화환은 목(축)·근조 겸용이라 두 경조사가 같은 카테고리를 공유한다. */
const OCC = {
  obit: { label: "근조 · 부고", cat: "경조화환",
    urlTitle: "부고장 링크가 있다면 붙여넣어주세요!", urlPh: "https:// 부고장 링크 붙여넣기" },
  wed:  { label: "축하 · 행사", cat: "경조화환",
    urlTitle: "청첩장 또는 초대장 링크가 있다면 붙여넣어주세요!", urlPh: "https:// 청첩장 · 초대장 링크 붙여넣기" },
};
/* 해당 경조사 3단화환 (기존 카탈로그 재사용 — 기본/고급/특대) */
const occProducts = (occ) => ALL_PRODUCTS.filter((p) => p.category === OCC[occ].cat && p.product.includes("3단화환"));

/* 리본 추천 문구 (기존 COMMON_PHRASES 재사용) */
const COMMON_PHRASES = [
  { group: "부고·근조", phrases: ["삼가 고인의 명복을 빕니다", "근조(謹弔)", "조의를 표합니다"] },
  { group: "결혼 축하", phrases: ["축 결혼(祝 結婚)", "화혼을 진심으로 축하드립니다", "행복한 새 출발을 축하합니다"] },
  { group: "개업·취임", phrases: ["축 개업(祝 開業)", "축 취임(祝 就任)", "번창하시길 기원합니다"] },
  { group: "기타", phrases: ["감사합니다", "항상 건강하세요", "축 승진(祝 昇進)"] },
];

/* 부고장·청첩장 URL 데모 DB (경조사별) — 실제 AI 파싱 도입 전, 불러오기 시 임의값 자동입력.
   obit: 배송지=장례식장 · 받는분=고인명(故) · 즉시배송.
   wed : 배송지=예식장 · 받는분=혼주 · 배송일시=예식시간(dayOffset 일 뒤 hour:min). */
const MOCK_URL_DB = {
  obit: {
    "kakao.com":    { addr: "서울특별시 종로구 대학로 101 서울대학교병원 장례식장 3호실", toName: "故 김영수", toPhone: "010-3921-4400" },
    "naeil.com":    { addr: "경기도 성남시 분당구 야탑로 59 분당차병원 장례식장 특2호실",  toName: "故 이정호", toPhone: "010-2277-8130" },
    "mobile.co.kr": { addr: "서울특별시 서초구 반포대로 222 서울성모병원 장례식장 7호실",  toName: "故 박순자", toPhone: "010-5540-9902" },
  },
  wed: {
    "wedding.me":      { addr: "서울특별시 서초구 강남대로 373 홀리데이인 서울 강남 3층 그랜드볼룸", toName: "혼주 최영호", toPhone: "010-8845-1120", dayOffset: 14, hour: "11", min: "00" },
    "weddingbook.com": { addr: "서울특별시 마포구 백범로 235 서울가든호텔 2층 다이아몬드홀",       toName: "혼주 정미경", toPhone: "010-6612-7788", dayOffset: 21, hour: "13", min: "30" },
  },
};

/* 배송 가능 시간 규정(09:00~18:30)은 관리자 주문 모달의 배송일시 피커와 공유한다
   → util/date.js. 한쪽만 고치면 포털에서 받은 시각을 관리자가 못 고른다. */
const pad2 = (n) => String(n).padStart(2, "0");
/* 배송 시간대 구분:
   beforeOpen 00:00~09:00 · biz 09:00~18:30 · afterClose 18:30~24:00
   즉시배송 버튼은 biz/beforeOpen 에는 '즉시배송', afterClose 에는 '익일 빠른배송'으로 전환.
   ※ 야간배송을 없애면서 18:30~20:00(evening)과 20:00~(night)을 나눌 이유가 사라졌다 —
     둘 다 '오늘은 마감, 내일 배송'으로 동일하게 처리된다. */
const timePhase = (d) => {
  const t = d.getHours() * 60 + d.getMinutes();
  if (t < BIZ.openH * 60) return "beforeOpen";
  if (t <= BIZ.closeH * 60 + BIZ.closeM) return "biz";
  return "afterClose";
};
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const fmtYMD = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
/* 영업시간(biz) 즉시배송 예상 슬롯: 접수시각 + 4시간(분 30분 단위 반올림), 마감(18:30) 초과 시 마감으로 클램프.
   드롭다운·안내문구·확인화면이 모두 이 값을 공유한다. */
const immBizSlot = () => {
  const d = new Date(Date.now() + 4 * 36e5);
  d.setMinutes(Math.round(d.getMinutes() / 30) * 30, 0, 0); // 60분이면 자동으로 다음 시로 넘어감
  const closeT = BIZ.closeH * 60 + BIZ.closeM;
  if (d.getHours() * 60 + d.getMinutes() > closeT) { d.setHours(BIZ.closeH); d.setMinutes(BIZ.closeM); }
  return d;
};

const DONE_SVG = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12.5 10 17.5 19 7" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
/* 추가 수신자 행 삭제 (icons.js trash2 와 동일 형태) */
const TRASH_SVG = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
/* 간편선택 버튼 아이콘 (목록) */
const PICK_SVG = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="4.5" cy="6" r="1.4" fill="currentColor"/><circle cx="4.5" cy="12" r="1.4" fill="currentColor"/><circle cx="4.5" cy="18" r="1.4" fill="currentColor"/></svg>`;

function markup() {
  return html`
    <div class="page-order">
      ${pageTitle({ imgSrc: "./assets/nav-order.png", title: "경조상품 주문" })}
      <div class="sheet">
        <div class="sheet-head">
          <b>경조상품 간편주문</b>
          <span class="sub">경조상품을 간편하게 주문해보세요!</span>
        </div>

        <nav class="tabs">
          <button class="tab active" data-tab="1"><span class="done-dot">●</span>경조사 및 상품 선택</button>
          <button class="tab" data-tab="2"><span class="done-dot">●</span>배송지 정보 입력</button>
          <button class="tab" data-tab="3"><span class="done-dot">●</span>리본문구 입력</button>
          <button class="tab" data-tab="4"><span class="done-dot">●</span>작성내용 확인</button>
        </nav>

        <!-- STEP 1 · 경조사 및 상품 -->
        <section class="panel on" data-panel="1">
          <h2 class="q">어떤 경조사가 있으신가요?</h2>
          <p class="q-sub">경조사를 선택하면 알맞은 주문 방법을 안내해 드려요.</p>
          <div class="sec-gap" style="margin-top:24px;">
            <div class="sec-label" style="justify-content:space-between;">경조사 구분 <small>상황에 따른 상품선택</small></div>
            <div class="occ-stack">
              <button class="intake-card intake-obit" data-occ="obit">
                <span class="lbl"><b>근조 · 부고</b><span>부고장 간편접수 지원</span></span>
                <span class="occ-right"><span class="ck">✓</span><span class="arrow">›</span></span>
              </button>
              <button class="intake-card intake-wedding" data-occ="wed">
                <span class="lbl"><b>축하 · 행사</b><span>청첩장 · 초대장 간편접수 지원</span></span>
                <span class="occ-right"><span class="ck">✓</span><span class="arrow">›</span></span>
              </button>
            </div>
          </div>
          <div class="reveal" data-reveal="url">
            <div class="urlbox">
              <div class="ub-title"><span data-ub-title>부고장 링크가 있다면 붙여넣어주세요!</span> <span class="obadge">간편</span></div>
              <p class="ub-desc">링크 하나로 배송지 정보까지 자동으로 입력돼요.</p>
              <div class="url-row">
                <input type="text" data-url-input placeholder="https:// 부고장 링크 붙여넣기" />
                <button data-url-btn>불러오기</button>
              </div>
              <div class="url-msg" data-url-msg></div>
              <button class="direct-btn" data-direct-btn>링크 없이 직접 작성하기 →</button>
            </div>
          </div>
          <div class="reveal" data-reveal="prod">
            <div class="sec-gap" style="margin-top:32px;">
              <div class="sec-label">상품 선택 <small data-prod-hint></small></div>
              <div class="prod-list" data-prod-list></div>
            </div>
          </div>
          <div class="cta-row">
            <button class="btn-next" data-next="1" disabled>다음</button>
          </div>
        </section>

        <!-- STEP 2 · 배송지 -->
        <section class="panel" data-panel="2">
          <h2 class="q">어디로 보낼까요?</h2>
          <p class="q-sub">화환을 받으실 장소와 시간을 알려주세요.</p>
          <div class="sec-gap">
            <div class="ofield">
              <label>배송지 주소 <span class="auto-chip" data-auto-chip>링크에서 자동입력</span></label>
              <div class="addr-row">
                <input type="text" data-f-addr placeholder="장례식장 · 예식장 주소를 입력해 주세요" />
                <button type="button" class="addr-find" data-addr-find hidden>주소검색</button>
              </div>
              <p class="deliv-fee-note" data-deliv-fee></p>
            </div>
            <div class="grid2">
              <div class="ofield">
                <label>받는분 성함 <span class="side-req" data-side-req hidden>측근 필수</span></label>
                <div class="toname-row">
                  <input type="text" data-f-toname placeholder="예) 故 김○○ · 혼주 김○○" />
                  <!-- 청첩(wed) 전용: 측근(신랑측/신부측) 필수선택 -->
                  <div class="dd side-dd" data-dd-side hidden>
                    <button type="button" class="dd-trigger" aria-haspopup="listbox" aria-expanded="false"></button>
                    <div class="dd-panel" role="listbox"></div>
                  </div>
                </div>
              </div>
              <div class="ofield">
                <label>받는분 연락처 <span class="opt-chip">선택</span></label>
                <input type="text" data-f-tophone placeholder="010-0000-0000 (선택)" inputmode="numeric" />
              </div>
            </div>
          </div>
          <div class="sec-gap">
            <div class="sec-label">배송 일시</div>
            <div class="seg seg--deliv">
              <button data-seg="sched" class="sel">날짜 · 시간 지정</button>
              <button data-seg="imm">즉시배송</button>
            </div>
            <div class="dt-row" data-dt-row>
              <div class="dd datepick" data-dd-date>
                <button type="button" class="dd-trigger" aria-haspopup="dialog" aria-expanded="false"></button>
                <div class="dd-panel cal-panel" role="dialog" aria-label="배송 날짜 선택">
                  <div class="cal-head">
                    <button type="button" class="cal-nav cal-prev" aria-label="이전 달">‹</button>
                    <b class="cal-title"></b>
                    <button type="button" class="cal-nav cal-next" aria-label="다음 달">›</button>
                  </div>
                  <div class="cal-grid"></div>
                  <p class="cal-note">오늘부터 최대 30일까지 예약할 수 있어요</p>
                </div>
              </div>
              <div class="dd" data-dd-hour>
                <button type="button" class="dd-trigger" aria-haspopup="listbox" aria-expanded="false"></button>
                <div class="dd-panel" role="listbox"></div>
              </div>
              <div class="dd" data-dd-min>
                <button type="button" class="dd-trigger" aria-haspopup="listbox" aria-expanded="false"></button>
                <div class="dd-panel" role="listbox"></div>
              </div>
            </div>
            <div class="imm-note" data-imm-note></div>
            <p class="dt-info" data-dt-info>배송 시간은 <b>09:00 ~ 18:30</b> 사이에서 지정할 수 있어요</p>
          </div>
          <div class="cta-row">
            <button class="btn-back" data-goto="1">이전</button>
            <button class="btn-next" data-next="2" disabled>다음</button>
          </div>
        </section>

        <!-- STEP 3 · 리본문구 -->
        <section class="panel" data-panel="3">
          <h2 class="q">리본에 어떤 마음을 담을까요?</h2>
          <p class="q-sub">왼쪽 리본에는 문구가, 오른쪽 리본에는 보내는분이 새겨져요.</p>
          <div class="sec-gap">
            <div class="sec-label">리본 문구</div>
            <div class="rib-field">
              <div class="ribbon-wrap">
                <input type="text" data-ribbon-input maxlength="20" placeholder="문구를 직접 입력해 주세요" />
                <span class="cnt num" data-ribbon-cnt>0/20</span>
              </div>
              <button class="pick-btn" data-ribbon-pick type="button">${raw(PICK_SVG)}간편선택</button>
            </div>
            <p class="warn-line"><b>배송 시작 후 문구변경 시 비용이 청구될 수 있어요.</b> 한 번 더 확인해 주세요.</p>
          </div>
          <div class="sec-gap">
            <div class="sec-label">보내는분</div>
            <div class="rib-field">
              <div class="ribbon-wrap">
                <input type="text" data-sender-input maxlength="30" placeholder="보내는분을 직접 입력해 주세요" />
                <span class="cnt num" data-sender-cnt>0/30</span>
              </div>
              <button class="pick-btn" data-sender-pick type="button">${raw(PICK_SVG)}간편선택</button>
            </div>
            <p class="rib-hint">저장된 프로필에서 불러오거나, 직접 입력할 수 있어요.</p>
          </div>
          <div class="cta-row">
            <button class="btn-back" data-goto="2">이전</button>
            <button class="btn-next" data-next="3" disabled>다음</button>
          </div>
        </section>

        <!-- STEP 4 · 작성내용 확인 -->
        <section class="panel" data-panel="4">
          <h2 class="q">작성하신 내용을 확인해 주세요</h2>
          <p class="q-sub">잘못된 부분이 있다면 각 항목에서 바로 고칠 수 있어요.</p>
          <div class="confirm-list" data-cf-list></div>
          <div class="cf-amount" data-cf-pay></div>
          <div class="opt-box">
            <div class="opt-row">
              <div class="ol">주문 담당자<small>주문 처리 상황을 안내받을 담당자예요</small></div>
              <div class="dd dd--mgr" data-dd-mgr>
                <button type="button" class="dd-trigger" aria-haspopup="listbox" aria-expanded="false"></button>
                <div class="dd-panel" role="listbox"></div>
              </div>
            </div>
            <!-- 배송완료 알림 수신자 — 받는분·보내는분·담당자·추가 수신자를 한 명단으로.
                 누구에게 실제로 가는지 번호까지 보여야 오발송을 주문 전에 잡을 수 있다.
                 행 슬롯은 renderNotifyList()가 채운다(클릭 경로에서만 재렌더 — 입력 포커스 보호).
                 동적 행은 data-nte-* 접두사: 고정 행의 [data-nt] 핸들러와 겹치지 않게. -->
            <div class="nt-extra">
              <div class="nt-head">
                <div class="ol">배송완료 알림<small>배송이 끝나면 문자로 알려드려요</small></div>
                <span class="nt-count" data-nt-count></span>
              </div>
              <div class="nt-rows" data-nt-rows></div>
              <button type="button" class="nt-add" data-nte-add>
                <span class="nt-add__plus">+</span> 수신자 추가 <b data-nte-cnt>(0/${NT_MAX})</b>
              </button>
              <p class="nt-max" data-nte-max hidden>추가 수신자는 최대 ${NT_MAX}명까지 등록할 수 있어요.</p>
            </div>
          </div>
          <div class="cta-row">
            <button class="btn-back" data-goto="3">이전</button>
            <button class="btn-next" data-submit>주문 접수하기</button>
          </div>
          <p class="cta-hint">배송 시작 후 문구변경 시 비용이 청구될 수 있어요 · 문의 02-0000-0000</p>
        </section>

        <!-- 완료 -->
        <section class="panel panel-done" data-panel="done">
          <div class="done-ic">${raw(DONE_SVG)}</div>
          <h2>주문이 접수되었어요</h2>
          <p class="d-sub">배송이 시작되면 알림으로 알려드릴게요.<br />진행 상황은 실시간 주문내역에서 확인할 수 있어요.</p>
          <div class="done-box" data-done-box></div>
          <div class="done-redirect" data-redirect>
            <p class="done-redirect__label"><b class="num" data-redirect-n>5</b>초 후 <b>실시간 주문내역</b>으로 이동합니다</p>
            <div class="done-progress"><span class="done-progress__fill" data-redirect-bar></span></div>
          </div>
          <div class="done-cta">
            <button class="btn-back" data-done-new>새 주문 작성하기</button>
            <button class="btn-next" data-done-orders>지금 주문내역 보기</button>
          </div>
        </section>
      </div>
      <div class="o-toast" data-toast></div>
    </div>
  `;
}

export function mount(root, { nav }) {
  const state = {
    step: 1, maxStep: 1,
    occ: null, viaUrl: false,
    product: null, ribbon: "", sender: "",
    addr: "", toName: "", toPhone: "", side: "", // side: 측근(신랑측/신부측) — 청첩 전용 필수
    deliv: "sched", date: "", hour: "09", min: "00",
    manager: 0,
    notify: { recipient: true, sender: true },
    /* 담당자는 담당자 저장공간(store.contacts)의 수신 설정에서 자동 편입된다.
       이 주문에서만 끈 담당자의 번호(no)를 여기 담는다 — 저장공간 설정은 건드리지 않는다. */
    managerOff: new Set(),
    notifyExtra: [], // [{ id, name, phone, on }] — 합동 발송 추가 수신자(최대 NT_MAX)
  };
  let ntSeq = 0;
  /* 데이트피커 선택 범위: 오늘 00:00 ~ +30일. 기본값 = 내일. (in-place 갱신) */
  const dpMin = new Date(); dpMin.setHours(0, 0, 0, 0);
  const dpMax = new Date(dpMin); dpMax.setDate(dpMax.getDate() + 30);
  state.date = fmtYMD(new Date(dpMin.getTime() + 864e5));

  setHTML(root, markup());
  const $ = (s) => qs(root, s);
  const $$ = (s) => qsa(root, s);
  const scrollTop = () => (root.closest(".shell__main") || window).scrollTo({ top: 0, behavior: "smooth" });

  const valid = {
    1: () => !!(state.occ && state.product),
    /* 지역 규칙(구 시스템 503)을 여기서 막는다 — 주소를 다 적고 마지막에 반려되는
       것보다 입력 즉시 막는 편이 낫다. 배송불가 지역이거나, 고른 상품이 그 배송지의
       반입 허용 목록 밖이면 진행할 수 없다(안내만으로는 그냥 넘어가 버린다). */
    2: () => {
      if (!(state.addr && state.toName && (state.deliv !== "sched" || state.date) && (state.occ !== "wed" || state.side))) return false;
      const r = evaluateAddress(state.addr);
      if (r.blocked) return false;
      if (r.allowOnly.length && state.product && !matchesProduct(r.allowOnly, state.product.product)) return false;
      return true;
    },
    3: () => !!(state.ribbon && state.sender),
  };

  /* ── 단계 이동 ── */
  function go(n) {
    state.step = n;
    state.maxStep = Math.max(state.maxStep, n);
    $$("[data-panel]").forEach((p) => p.classList.toggle("on", p.dataset.panel === String(n)));
    $$(".tab").forEach((t) => {
      const s = +t.dataset.tab;
      t.classList.toggle("active", s === n);
      t.classList.toggle("reach", s <= state.maxStep && s !== n);
      t.classList.toggle("complete", s < 4 && valid[s] && valid[s]());
    });
    /* 4단계 진입마다 알림 명단을 다시 그린다 — 받는분·보내는분·담당자 값이
       앞 단계에서 바뀌었을 수 있고, 명단에 실제 번호가 보여야 의미가 있다. */
    if (n === 4) { renderConfirm(); renderNotifyList(); }
    scrollTop();
  }
  function refreshCtas() {
    $('[data-next="1"]').disabled = !valid[1]();
    $('[data-next="2"]').disabled = !valid[2]();
    $('[data-next="3"]').disabled = !valid[3]();
    $$(".tab").forEach((t) => {
      const s = +t.dataset.tab;
      if (s < 4 && valid[s]) t.classList.toggle("complete", valid[s]());
    });
  }

  /* ── STEP 1 · 단계적 공개 ── */
  function reveal(name) {
    const el = $(`[data-reveal="${name}"]`);
    if (el.classList.contains("show")) return;
    el.classList.add("show");
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  function revealProducts() { reveal("prod"); refreshCtas(); }

  function setOcc(occ) {
    if (state.occ !== occ) {
      state.occ = occ;
      state.product = null;
      state.ribbon = "";
      state.side = "";
      $("[data-ribbon-input]").value = "";
      updateCnt();
      ddSide.renderTrigger();
    }
    $$("[data-occ]").forEach((b) => b.classList.toggle("sel", b.dataset.occ === occ));
    $("[data-prod-hint]").textContent = OCC[occ].label + " 상품";
    $("[data-ub-title]").textContent = OCC[occ].urlTitle;
    $("[data-url-input]").placeholder = OCC[occ].urlPh;
    /* 청첩(wed) 전용: 받는분 성함 우측 측근(신랑측/신부측) 선택 노출 */
    const isWed = occ === "wed";
    $("[data-dd-side]").toggleAttribute("hidden", !isWed);
    $("[data-side-req]").toggleAttribute("hidden", !isWed);
    renderProducts(); refreshCtas();
    reveal("url");
  }
  function renderProducts() {
    if (!state.occ) return;
    setHTML($("[data-prod-list]"), html`
      ${occProducts(state.occ).map((p) => html`
        <button class="prod-row ${state.product && productKey(state.product) === productKey(p) ? "sel" : ""}" data-prod="${productKey(p)}">
          <span class="radio"></span>
          <span class="pi"><b>${p.product}</b><span>${p.category} · 표준 규격 · 당일배송 가능</span></span>
          <span class="pp num">${p.price}</span>
        </button>
      `)}
    `);
  }
  function onUrlLoad() {
    const url = $("[data-url-input]").value.trim().toLowerCase();
    const msg = $("[data-url-msg]");
    if (!url) { msg.className = "url-msg err"; msg.textContent = "링크를 입력해 주세요."; return; }
    for (const occ of ["obit", "wed"]) {
      const hit = Object.keys(MOCK_URL_DB[occ]).find((d) => url.includes(d));
      if (hit) {
        const d = MOCK_URL_DB[occ][hit];
        setOcc(occ);
        /* 배송지·받는분·연락처 자동입력 (실 AI 파싱 도입 전 임의값) */
        state.addr = d.addr; state.toName = d.toName; state.toPhone = d.toPhone; state.viaUrl = true;
        $("[data-f-addr]").value = d.addr;
        $("[data-f-toname]").value = d.toName;
        $("[data-f-tophone]").value = d.toPhone;
        $("[data-auto-chip]").classList.add("show");
        renderDelivFeeNote();
        /* 상품 미선택 시 표준 3단화환 기본 선택(데모) */
        if (!state.product) { state.product = occProducts(occ)[0] || null; renderProducts(); }
        msg.className = "url-msg ok";
        msg.textContent = (occ === "obit" ? "부고장" : "청첩장") + "을 확인했어요. 정보를 자동으로 입력했어요.";
        if (occ === "obit") {
          /* 부고: 즉시배송 세팅 → 바로 리본문구(STEP 3) 이동 */
          setDeliv("imm");
          refreshCtas();
          showToast("부고장 정보를 성공적으로 불러왔어요");
          go(3);
        } else {
          /* 청첩: 예식 시간으로 배송일시 세팅 → 측근 선택 위해 배송지(STEP 2) 이동 */
          const base = new Date(dpMin); base.setDate(base.getDate() + d.dayOffset);
          state.date = fmtYMD(base); state.hour = d.hour; state.min = d.min;
          setDeliv("sched");
          dpDate.renderTrigger(); ddHour.renderTrigger(); ddMin.renderTrigger();
          refreshCtas();
          showToast("청첩장 정보를 성공적으로 불러왔어요");
          go(2);
        }
        return;
      }
    }
    msg.className = "url-msg err";
    msg.textContent = "확인할 수 없는 링크예요. (데모: kakao.com · naeil.com · wedding.me · weddingbook.com)";
  }

  /* ── STEP 2 · 배송지 · 일시 ── */
  function onPhone(t) {
    t.value = fmtPhone(t.value);
    state.toPhone = t.value;
    refreshCtas();
  }
  const ddHour = makeDropdown($("[data-dd-hour]"), {
    unit: "시", options: hourOptions,
    get: () => state.hour,
    set: (v) => {
      state.hour = v;
      if (!minOptions(v).includes(state.min)) { state.min = "30"; ddMin.renderTrigger(); }
    },
  });
  const ddMin = makeDropdown($("[data-dd-min]"), {
    unit: "분", options: () => minOptions(state.hour),
    get: () => state.min,
    set: (v) => { state.min = v; },
  });
  const dpDate = makeDatepicker($("[data-dd-date]"), {
    get: () => state.date, set: (v) => { state.date = v; refreshCtas(); },
    min: dpMin, max: dpMax,
  });
  /* 주문 담당자 — 공용 커스텀 드롭다운(index→"이름 · 직위" label 매핑) */
  const ddMgr = makeDropdown($("[data-dd-mgr]"), {
    options: () => store.get().contacts.map((_, i) => String(i)),
    get: () => String(state.manager),
    set: (v) => { state.manager = +v; },
    label: (v) => { const c = store.get().contacts[+v]; return c ? `${c.name} · ${c.role}` : "담당자 없음"; },
  });
  /* 측근(신랑측/신부측) — 청첩 전용 필수선택(빈 값이면 "측근 선택" placeholder) */
  const SIDES = ["신랑측", "신부측"];
  const ddSide = makeDropdown($("[data-dd-side]"), {
    options: () => SIDES,
    get: () => state.side,
    set: (v) => { state.side = v; refreshCtas(); },
    label: (v) => v || "측근 선택",
  });

  /* 안내 토스트(불러오기 결과 등) */
  let toastTimer = null;
  function showToast(text) {
    const el = $("[data-toast]");
    if (!el) return;
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 3400);
  }

  function setDeliv(mode) {
    state.deliv = mode;
    $$("[data-seg]").forEach((b) => b.classList.toggle("sel", b.dataset.seg === mode));
    $("[data-dt-row]").classList.toggle("dim", mode !== "sched");
    $("[data-dt-info]").classList.toggle("hide", mode !== "sched");
    if (mode === "imm") applyImmSlot();
    renderDelivNote();
    refreshCtas();
  }
  /* 즉시/익일 빠른배송 선택 시 날짜·시간 픽커를 실제 배송 슬롯으로 동기화:
     영업시간(biz) → 접수시각 + 4시간(분 30분 단위 반올림), 마감(18:30) 초과 시 마감으로 클램프.
       예) 13:23 접수 → 17:30. · 영업 후(afterClose) → 익일 12:30 · 영업 전(beforeOpen) → 당일 12:30. */
  function applyImmSlot() {
    const ph = timePhase(new Date());
    const base = new Date();
    if (ph === "biz") {
      const slot = immBizSlot();
      state.date = fmtYMD(slot);
      state.hour = pad2(slot.getHours());
      state.min = pad2(slot.getMinutes());
      dpDate.renderTrigger(); ddHour.renderTrigger(); ddMin.renderTrigger();
      return;
    }
    if (ph === "afterClose") base.setDate(base.getDate() + 1);
    state.date = fmtYMD(base);
    state.hour = "12";
    state.min = "30";
    dpDate.renderTrigger(); ddHour.renderTrigger(); ddMin.renderTrigger();
  }
  /* 선택한 배송 모드의 안내문구 (모드·시간대별) */
  function renderDelivNote() {
    const note = $("[data-imm-note]");
    const ph = timePhase(new Date());
    let lines = [], tone = "ok";
    if (state.deliv === "imm") {
      if (ph === "afterClose") lines = ["금일 영업시간이 종료되어 다음 날 오전에 배송됩니다."];
      else if (ph === "beforeOpen") lines = ["영업 시작(09:00) 후 순차 배송되어 오늘 낮 12시 30분경 배송돼요."];
      else { const d = immBizSlot(); lines = [`영업시간 내 접수 건은 4시간 이내(오늘 ${pad2(d.getHours())}:${pad2(d.getMinutes())}경)에 배송해 드려요.`]; }
    }
    if (!lines.length) { note.classList.remove("show"); setHTML(note, ""); return; }
    note.className = `imm-note imm-note--${tone} show`;
    setHTML(note, html`${lines.map((l, i) => html`<span class="imm-note__line ${i ? "is-sub" : ""}">${l}</span>`)}`);
  }
  /* 시간대에 따라 즉시배송 라벨을 전환한다 (1분 주기).
     영업시간(09:00~18:30)에는 '즉시배송', 마감 후에는 '익일 빠른배송' — 같은 버튼이고
     접수 시각에 따라 실제 배송 슬롯이 달라진다는 사실을 라벨로 알린다.
     ※ 긴급배송·야간배송은 요금·가용성 정책이 확정되지 않아 제거했다(구 시스템에도 없던 옵션). */
  function applyBizRule() {
    const ph = timePhase(new Date());
    $('[data-seg="imm"]').textContent = ph === "afterClose" ? "익일 빠른배송" : "즉시배송";
    if (state.deliv === "imm") applyImmSlot();
    renderDelivNote();
  }

  /* ── STEP 3 · 리본문구 · 보내는분 (텍스트 입력 + 간편선택 모달) ── */
  function updateCnt() { $("[data-ribbon-cnt]").textContent = $("[data-ribbon-input]").value.length + "/20"; }
  function updateSenderCnt() { $("[data-sender-cnt]").textContent = $("[data-sender-input]").value.length + "/30"; }

  let pickModal = null;
  const closePick = () => { if (pickModal) { pickModal.close(); pickModal = null; } };

  /* 리본 문구 간편선택 — 추천 문구 가이드 모달(직접입력과 병행) */
  function openRibbonPick() {
    closePick();
    const body = html`
      <p class="pick-intro">추천 문구를 선택하면 입력란에 채워져요. 이후 자유롭게 수정할 수 있어요.</p>
      ${COMMON_PHRASES.map((g) => html`
        <div class="pick-group">
          <p class="pick-group__label">${g.group}</p>
          <div class="pick-opts">
            ${g.phrases.map((ph) => html`<button class="pick-opt ${state.ribbon === ph ? "sel" : ""}" data-pick-phrase="${ph}" type="button">${ph}</button>`)}
          </div>
        </div>
      `)}
    `;
    pickModal = simpleModal({ title: "리본 문구 간편선택", panelClass: "modal-panel--pick", body, onClose: () => { pickModal = null; } });
    on(pickModal.panel, "click", "[data-pick-phrase]", (e, t) => {
      state.ribbon = t.dataset.pickPhrase;
      $("[data-ribbon-input]").value = state.ribbon;
      updateCnt(); refreshCtas(); closePick();
    });
  }

  /* 보내는분 간편선택 — 저장된 프로필에서 불러오기(직접입력과 병행) */
  function openSenderPick() {
    closePick();
    const profiles = store.get().profiles;
    const body = html`
      ${profiles.length === 0
        ? html`<div class="pick-empty">저장된 프로필이 없습니다.<br />아래에서 새 명의를 등록해 주세요.</div>`
        : html`<div class="pick-senders">
            ${profiles.map((p) => {
              const text = (p.greeting && p.greeting.trim()) || `${p.role} ${p.name}`;
              return html`<button class="pick-sender ${state.sender === text ? "sel" : ""}" data-pick-sender="${text}" type="button">
                <span class="pick-sender__main"><b>${p.name}</b> · ${p.role}</span>
                <span class="pick-sender__sub">${text}</span>
              </button>`;
            })}
          </div>`}
      <button class="pick-addprofile" data-pick-newprofile type="button">＋ 새 명의 등록하기</button>
    `;
    pickModal = simpleModal({ title: "보내는분 간편선택", panelClass: "modal-panel--pick", body, onClose: () => { pickModal = null; } });
    on(pickModal.panel, "click", "[data-pick-sender]", (e, t) => {
      state.sender = t.dataset.pickSender;
      $("[data-sender-input]").value = state.sender;
      updateSenderCnt(); refreshCtas(); closePick();
    });
    on(pickModal.panel, "click", "[data-pick-newprofile]", () => { closePick(); nav("#/app/profile"); });
  }

  /* ── STEP 4 · 확인 · 접수 ── */
  function dateLabel() {
    if (state.deliv === "sched") {
      const d = new Date(state.date + "T00:00:00");
      return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]}) ${state.hour}:${state.min}`;
    }
    const ph = timePhase(new Date()); // imm
    if (ph === "afterClose") {
      const t = new Date(); t.setDate(t.getDate() + 1);
      return `익일 빠른배송 · ${t.getMonth() + 1}월 ${t.getDate()}일 (${DOW[t.getDay()]}) 12:30`;
    }
    if (ph === "beforeOpen") return "즉시배송 · 오늘 12:30";
    return `즉시배송 · 오늘 ${state.hour}:${state.min}`;
  }
  /* 주문 접수 재확인 모달 — '계산서 발급동의'와 동일 패턴(되돌릴 수 없어 한 번 더 확인). */
  let submitModal = null;
  function openSubmitConfirm() {
    if (submitModal) return;
    /* 접수 게이트: 미완료·무효 스텝이 있으면(예: 청첩 측근 미선택, 상품 미선택) 접수를 막고
       해당 스텝으로 이동 + 안내. 비정상 경로(탭 점프 등)로 무효 접수/크래시 방지. */
    for (const s of [1, 2, 3]) {
      if (!valid[s]()) {
        go(s);
        showToast(s === 2 && state.occ === "wed" && !state.side
          ? "신랑측/신부측 측근을 선택해 주세요"
          : "필수 항목을 모두 입력해 주세요");
        return;
      }
    }
    const body = html`
      <div class="hm-info"><span><b>${state.product.product}</b> · <b class="num">${won(parseWon(state.product.price) + deliveryFeeFor(state.addr).fee)}</b>으로 주문을 접수합니다. 접수 후에는 리본문구·보내는분을 수정할 수 없어요.</span></div>
    `;
    const footer = html`
      <button class="hm-btn hm-btn--secondary" data-action="close">취소</button>
      <button class="hm-btn hm-btn--primary" data-confirm>주문 접수하기</button>
    `;
    submitModal = simpleModal({ title: "이대로 주문을 접수할까요?", size: "sm", body, footer, onClose: () => { submitModal = null; } });
    submitModal.panel.addEventListener("click", (e) => {
      if (!e.target.closest("[data-confirm]")) return;
      submitModal.close();
      submit();
    });
  }

  /* 접수 완료 후 프로그래스바(n초) → 실시간 주문내역 자동 이동. */
  const REDIRECT_SEC = 5;
  let redirectTimer = null, redirectTick = null;
  function cancelRedirect() {
    if (redirectTimer) { clearTimeout(redirectTimer); redirectTimer = null; }
    if (redirectTick) { clearInterval(redirectTick); redirectTick = null; }
  }
  function startRedirect() {
    cancelRedirect();
    const bar = $("[data-redirect-bar]"), nEl = $("[data-redirect-n]");
    let remain = REDIRECT_SEC;
    if (nEl) nEl.textContent = String(remain);
    if (bar) {
      bar.style.transition = "none"; bar.style.width = "0%";
      void bar.offsetWidth; // reflow → 0%에서 트랜지션 시작
      bar.style.transition = `width ${REDIRECT_SEC}s linear`;
      bar.style.width = "100%";
    }
    redirectTick = setInterval(() => {
      remain -= 1;
      if (nEl) nEl.textContent = String(Math.max(0, remain));
      if (remain <= 0) { clearInterval(redirectTick); redirectTick = null; }
    }, 1000);
    redirectTimer = setTimeout(() => { cancelRedirect(); nav("#/app/orders"); }, REDIRECT_SEC * 1000);
  }

  /* 배송지에 따른 추가 배송비 안내(STEP2). 해당 지역이면 노출, 아니면 숨김. */
  function renderDelivFeeNote() {
    const el = $("[data-deliv-fee]");
    if (!el) return;
    /* 한 주소에 세 가지 규칙이 동시에 걸릴 수 있다 — 배송불가 / 반입 가능 상품 제한 /
       추가 배송비. 우선순위대로 한 번에 판정해 붙여 보여준다(intake-rules). */
    const r = evaluateAddress(state.addr);
    const lines = [];
    let tone = "";
    if (r.blocked) {
      lines.push(r.notice + " 다른 배송지를 입력해 주세요.");
      tone = "deliv-fee-note--block";
    } else {
      if (r.allowOnly.length) lines.push(r.notice);
      if (r.fee > 0) lines.push(`${r.region} 지역은 추가 배송비 +${won(r.fee)}이 적용돼요.`);
      /* 이미 고른 상품이 허용 목록 밖이면 그 사실을 분명히 알린다 — 상품은 1단계에서
         골랐고 주소는 2단계라 순서상 뒤늦게 드러난다. */
      if (r.allowOnly.length && state.product && !matchesProduct(r.allowOnly, state.product.product)) {
        lines.push(`선택하신 ${state.product.product}은(는) 이 배송지에 반입할 수 없어요. 상품을 다시 골라 주세요.`);
        tone = "deliv-fee-note--block";
      }
    }
    if (!lines.length) { el.textContent = ""; el.className = "deliv-fee-note"; return; }
    el.className = `deliv-fee-note show ${tone}`.trim();
    el.textContent = lines.join(" ");
  }

  /* ── 합동 발송 추가 수신자 ──────────────────────────────
     행 슬롯만 setHTML 로 갈아끼운다(renderProducts 와 같은 패턴).
     추가·삭제 클릭 경로에서만 호출 — 입력 중 호출하면 포커스가 날아간다. */
  const findExtra = (id) => state.notifyExtra.find((r) => r.id === id);
  const extraIncomplete = (r) => r.on && (r.name.trim() || r.phone) && !(r.name.trim() && phoneOk(r.phone));

  /* 발송인 프로필에 저장된 번호 — 프로필은 언제든 꺼내 쓰는 값이라 주문 시 여기서 당겨온다. */
  const senderPhone = () => {
    const p = store.get().profiles.find((x) => ((x.greeting && x.greeting.trim()) || `${x.role} ${x.name}`) === state.sender);
    return p ? p.phone : "";
  };
  /* 담당자 저장공간에서 수신함으로 설정된 담당자 — 주문서에 자동 편입된다. */
  const autoManagers = () => receivingContacts(store.get().contacts);

  const fixedRow = (key, label, name, phone, on) => html`
    <div class="nt-row nt-row--fixed">
      <span class="nt-kind">${label}</span>
      <span class="nt-who"><b>${name || "미입력"}</b>${phone ? html`<span>${phone}</span>` : ""}</span>
      <button type="button" class="toggle" role="switch" aria-checked="${on ? "true" : "false"}"
              data-nt="${key}" aria-label="${label} 배송완료 알림 수신">
        <span class="toggle__knob"></span>
      </button>
    </div>`;

  function renderNotifyList() {
    setHTML($("[data-nt-rows]"), html`
      ${fixedRow("recipient", "받는분", state.toName, state.toPhone, state.notify.recipient)}
      ${fixedRow("sender", "보내는분", state.sender, senderPhone(), state.notify.sender)}
      ${autoManagers().map((c) => html`
        <div class="nt-row nt-row--fixed">
          <span class="nt-kind">담당자</span>
          <span class="nt-who"><b>${c.name}</b><span>${c.phone}</span><em class="nt-auto">자동</em></span>
          <button type="button" class="toggle" role="switch" aria-checked="${state.managerOff.has(c.no) ? "false" : "true"}"
                  data-ntm="${c.no}" aria-label="담당자 ${c.name} 배송완료 알림 수신">
            <span class="toggle__knob"></span>
          </button>
        </div>`)}
      ${state.notifyExtra.map((r) => html`
        <div class="nt-row ${extraIncomplete(r) ? "nt-row--warn" : ""}" data-nte-row="${r.id}">
          <input class="nt-in nt-in--name" type="text" maxlength="20" data-nte-name data-nte-id="${r.id}"
                 value="${r.name}" placeholder="이름 (예: 김과장)" aria-label="추가 수신자 이름" />
          <input class="nt-in nt-in--phone" type="text" inputmode="numeric" data-nte-phone data-nte-id="${r.id}"
                 value="${r.phone}" placeholder="010-0000-0000" aria-label="추가 수신자 연락처" />
          <button type="button" class="toggle" role="switch" aria-checked="${r.on ? "true" : "false"}"
                  data-nte-toggle data-nte-id="${r.id}" aria-label="${r.name || "추가 수신자"} 배송완료 알림 수신">
            <span class="toggle__knob"></span>
          </button>
          <button type="button" class="nt-del" data-nte-del data-nte-id="${r.id}" aria-label="수신자 삭제">${raw(TRASH_SVG)}</button>
        </div>
      `)}
    `);
    syncAddBtn();
    syncNotifySummary();
  }
  /* 하위호환 별칭 — 추가·삭제 경로가 부르던 이름. */
  const renderNotifyExtra = renderNotifyList;
  /* 카운터·비활성은 DOM 직접 조작 — 행 슬롯은 건드리지 않는다. */
  function syncAddBtn() {
    const n = state.notifyExtra.length;
    const full = n >= NT_MAX;
    const cnt = $("[data-nte-cnt]"); if (cnt) cnt.textContent = `(${n}/${NT_MAX})`;
    const add = $("[data-nte-add]"); if (add) add.disabled = full;
    const max = $("[data-nte-max]"); if (max) max.toggleAttribute("hidden", !full);
  }

  /* 배송완료 알림 수신자 요약 — 접수 확인·완료 화면이 공유한다. */
  function notifyParts() {
    const base = [];
    if (state.notify.recipient) base.push("받는분");
    if (state.notify.sender) base.push("보내는분");
    const mgrs = autoManagers().filter((c) => !state.managerOff.has(c.no));
    const extra = state.notifyExtra.filter((r) => r.on && r.name.trim() && phoneOk(r.phone));
    return { base, mgrs, extra };
  }
  function notifyLabel() {
    const { base, mgrs, extra } = notifyParts();
    const parts = [...base];
    if (mgrs.length) parts.push(`담당자 ${mgrs.length}명`);
    if (!parts.length && !extra.length) return "받지 않음";
    if (!extra.length) return parts.join(" · ");
    if (!parts.length) return extra.length === 1 ? extra[0].name : `${extra[0].name} 외 ${extra.length - 1}명`;
    return `${parts.join(" · ")} 외 ${extra.length}명`;
  }
  /* 완료 화면의 상세 줄 — 담당자·추가 수신자의 실제 번호를 남긴다. */
  const notifyExtraDetail = () => {
    const { mgrs, extra } = notifyParts();
    return [...mgrs.map((c) => `${c.name} ${c.phone}`), ...extra.map((r) => `${r.name} ${r.phone}`)].join(" · ");
  };
  function syncNotifySummary() {
    const el = $("[data-cf-notify]"); // go(4) 전에는 아직 없다
    if (el) el.textContent = notifyLabel();
    const cnt = $("[data-nt-count]");
    if (cnt) {
      const { base, mgrs, extra } = notifyParts();
      const n = base.length + mgrs.length + extra.length;
      cnt.textContent = n ? `${n}명에게 발송` : "받지 않음";
    }
  }

  function renderConfirm() {
    const p = state.product;
    if (!p) return; // 상품 미선택 방어(경조사 전환 후 탭 점프 등 비정상 경로)
    const df = deliveryFeeFor(state.addr); // 배송지 추가 배송비
    setHTML($("[data-cf-list]"), html`
      <div class="cf-row"><span class="cl">선택상품</span>
        <span class="cv">${p.product}</span>
        <button class="edit" data-goto="1">변경</button></div>
      <div class="cf-row"><span class="cl">배송지</span>
        <span class="cv">${state.addr}</span>
        <button class="edit" data-goto="2">변경</button></div>
      <div class="cf-row"><span class="cl">받는분</span>
        <span class="cv">${state.toName}${state.occ === "wed" && state.side ? ` (${state.side})` : ""}${state.toPhone ? ` · ${state.toPhone}` : ""}</span>
        <button class="edit" data-goto="2">변경</button></div>
      <div class="cf-row"><span class="cl">배송 일시</span>
        <span class="cv">${dateLabel()}</span>
        <button class="edit" data-goto="2">변경</button></div>
      <div class="cf-row"><span class="cl">리본문구</span>
        <span class="cv">${state.ribbon}</span>
        <button class="edit" data-goto="3">변경</button></div>
      <div class="cf-row"><span class="cl">보내는분</span>
        <span class="cv">${state.sender}</span>
        <button class="edit" data-goto="3">변경</button></div>
      <!-- 알림 수신자: 컨트롤이 바로 아래 .opt-box 에 있어 '변경' 버튼은 두지 않는다 -->
      <div class="cf-row"><span class="cl">배송완료 알림</span>
        <span class="cv" data-cf-notify>${notifyLabel()}</span>
        <span class="cf-noedit"></span></div>
    `);
    /* 결제 금액: 추가 배송비가 있으면 상품/배송비 내역을 함께 표기 */
    const total = parseWon(p.price) + df.fee;
    setHTML($("[data-cf-pay]"), html`
      ${df.fee > 0
        ? html`<div class="cf-brk">
            <div class="cf-brk__row"><span class="k">상품 금액</span><span class="v num">${p.price}</span></div>
            <div class="cf-brk__row"><span class="k">추가 배송비 <em>${df.region} 지역</em></span><span class="v num">+${won(df.fee)}</span></div>
          </div>`
        : ""}
      <div class="cf-amount__total"><span>결제 금액</span><b class="num">${won(total)}</b></div>
    `);
  }
  function submit() {
    const contacts = store.get().contacts;
    const c = contacts[state.manager] || contacts[0];
    setHTML($("[data-done-box]"), html`
      <div class="cf-row"><span class="cl">상품</span><span class="cv">${state.product.product}</span></div>
      <div class="cf-row"><span class="cl">리본 문구</span><span class="cv">${state.ribbon}</span></div>
      <div class="cf-row"><span class="cl">배송</span><span class="cv">${dateLabel()}<small>${state.addr}</small></span></div>
      <div class="cf-row"><span class="cl">담당자</span><span class="cv">${c.name} (${c.phone})</span></div>
      <div class="cf-row"><span class="cl">배송완료 알림</span><span class="cv">${notifyLabel()}${notifyExtraDetail() ? html`<small>${notifyExtraDetail()}</small>` : ""}</span></div>
      <div class="cf-row"><span class="cl">결제 금액</span><span class="cv num done-amount">${won(parseWon(state.product.price) + deliveryFeeFor(state.addr).fee)}</span></div>
    `);
    $$("[data-panel]").forEach((p) => p.classList.remove("on"));
    $('[data-panel="done"]').classList.add("on");
    scrollTop();
    startRedirect();
  }

  /* ── 새 주문 작성하기: 페이지 재로드 없이 초기화 ── */
  function resetAll() {
    cancelRedirect();
    Object.assign(state, {
      step: 1, maxStep: 1, occ: null, viaUrl: false, product: null, ribbon: "", sender: "",
      addr: "", toName: "", toPhone: "", side: "", deliv: "sched", hour: "09", min: "00", manager: 0,
      notify: { recipient: true, sender: true },
      managerOff: new Set(),
      notifyExtra: [],
    });
    dpMin.setTime(Date.now()); dpMin.setHours(0, 0, 0, 0);
    dpMax.setTime(dpMin.getTime()); dpMax.setDate(dpMax.getDate() + 30);
    state.date = fmtYMD(new Date(dpMin.getTime() + 864e5));
    ["[data-url-input]", "[data-f-addr]", "[data-f-toname]", "[data-f-tophone]", "[data-ribbon-input]", "[data-sender-input]"].forEach((s) => { $(s).value = ""; });
    const msg = $("[data-url-msg]"); msg.className = "url-msg"; msg.textContent = "";
    $("[data-auto-chip]").classList.remove("show");
    $$("[data-reveal]").forEach((r) => r.classList.remove("show"));
    $$("[data-occ]").forEach((b) => b.classList.remove("sel"));
    $("[data-dd-side]").setAttribute("hidden", "");
    $("[data-side-req]").setAttribute("hidden", "");
    setHTML($("[data-prod-list]"), "");
    ntSeq = 0; renderNotifyList();
    setDeliv("sched");
    ddHour.renderTrigger(); ddMin.renderTrigger(); dpDate.renderTrigger(); ddMgr.renderTrigger(); ddSide.renderTrigger();
    updateCnt(); updateSenderCnt(); applyBizRule();
    go(1);
  }

  /* ── 이벤트 바인딩 (위임 · cleanup 시 해제) ── */
  const offs = [];
  const bind = (type, sel, fn) => offs.push(on(root, type, sel, fn));

  bind("click", ".tab.reach", (e, t) => go(+t.dataset.tab));
  bind("click", "[data-goto]", (e, t) => go(+t.dataset.goto));
  bind("click", '[data-next="1"]', () => go(2));
  bind("click", '[data-next="2"]', () => go(3));
  bind("click", '[data-next="3"]', () => go(4));
  bind("click", "[data-occ]", (e, t) => setOcc(t.dataset.occ));
  bind("click", "[data-url-btn]", onUrlLoad);
  bind("click", "[data-direct-btn]", revealProducts);
  bind("click", "[data-prod]", (e, t) => {
    state.product = occProducts(state.occ).find((p) => productKey(p) === t.dataset.prod) || null;
    renderProducts(); refreshCtas();
  });
  /* 주소검색 — 표준 주소를 넣고 상세주소만 직접 잇게 한다. 스크립트가 없는 환경에서는
     버튼 자체를 감춰 직접 입력을 그대로 쓴다(주문이 막히면 안 된다). */
  ensurePostcode().then((ok) => { const b = $("[data-addr-find]"); if (b && ok) b.hidden = false; });
  bind("click", "[data-addr-find]", () => {
    openPostcode(({ road }) => {
      const el = $("[data-f-addr]");
      el.value = road + " ";
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length); // 상세주소 이어 적기
    });
  });
  bind("input", "[data-f-addr]", (e, t) => {
    state.addr = t.value.trim();
    if (state.viaUrl) { state.viaUrl = false; $("[data-auto-chip]").classList.remove("show"); }
    renderDelivFeeNote();
    refreshCtas();
  });
  bind("input", "[data-f-toname]", (e, t) => { state.toName = t.value.trim(); refreshCtas(); });
  bind("input", "[data-f-tophone]", (e, t) => onPhone(t));
  bind("click", "[data-seg]", (e, t) => { if (!t.disabled) setDeliv(t.dataset.seg); });
  bind("click", "[data-ribbon-pick]", openRibbonPick);
  bind("input", "[data-ribbon-input]", (e, t) => {
    state.ribbon = t.value.trim();
    updateCnt(); refreshCtas();
  });
  bind("click", "[data-sender-pick]", openSenderPick);
  bind("input", "[data-sender-input]", (e, t) => {
    state.sender = t.value.trim();
    updateSenderCnt(); refreshCtas();
  });
  bind("click", "[data-ntm]", (e, t) => {
    /* 담당자 행은 이 주문에서만 끈다 — 담당자 저장공간 설정은 건드리지 않는다. */
    const no = t.dataset.ntm;
    const on = t.getAttribute("aria-checked") !== "true";
    if (on) state.managerOff.delete(no); else state.managerOff.add(no);
    t.setAttribute("aria-checked", on ? "true" : "false");
    syncNotifySummary();
  });
  bind("click", "[data-nt]", (e, t) => {
    const k = t.dataset.nt;
    state.notify[k] = !state.notify[k];
    t.setAttribute("aria-checked", state.notify[k] ? "true" : "false");
    syncNotifySummary();
  });
  /* 추가 수신자 — 행 재렌더는 추가/삭제(클릭) 경로에서만. */
  bind("click", "[data-nte-add]", () => {
    if (state.notifyExtra.length >= NT_MAX) return;
    const id = "nt" + ++ntSeq;
    state.notifyExtra.push({ id, name: "", phone: "", on: true });
    renderNotifyExtra();
    const el = $(`[data-nte-row="${id}"] [data-nte-name]`);
    if (el) el.focus();
  });
  bind("click", "[data-nte-del]", (e, t) => {
    state.notifyExtra = state.notifyExtra.filter((r) => r.id !== t.dataset.nteId);
    renderNotifyExtra();
  });
  bind("click", "[data-nte-toggle]", (e, t) => {
    const r = findExtra(t.dataset.nteId);
    if (!r) return;
    r.on = t.getAttribute("aria-checked") !== "true";
    t.setAttribute("aria-checked", r.on ? "true" : "false");
    t.closest(".nt-row").classList.toggle("nt-row--warn", extraIncomplete(r));
    syncNotifySummary();
  });
  /* 입력 핸들러는 state 갱신 + 요약 텍스트 패치만 — renderNotifyExtra 를 부르면 포커스가 날아간다. */
  bind("input", "[data-nte-name]", (e, t) => {
    const r = findExtra(t.dataset.nteId);
    if (!r) return;
    r.name = t.value;
    syncNotifySummary();
  });
  bind("input", "[data-nte-phone]", (e, t) => {
    const r = findExtra(t.dataset.nteId);
    if (!r) return;
    t.value = fmtPhone(t.value);
    r.phone = t.value;
    syncNotifySummary();
  });
  bind("click", "[data-submit]", openSubmitConfirm);
  bind("click", "[data-done-new]", resetAll);
  bind("click", "[data-done-orders]", () => { cancelRedirect(); nav("#/app/orders"); });

  /* ── 초기 렌더 ── */
  updateCnt();
  updateSenderCnt();
  refreshCtas();
  applyBizRule();
  const bizTimer = setInterval(applyBizRule, 60 * 1000);

  return () => {
    clearInterval(bizTimer);
    cancelRedirect();
    clearTimeout(toastTimer);
    closePick();
    if (submitModal) submitModal.close();
    ddHour.destroy(); ddMin.destroy(); dpDate.destroy(); ddMgr.destroy(); ddSide.destroy();
    offs.forEach((off) => off());
  };
}
