/* ============================================================
   orders.js — ports RealTimeOrders.tsx (실시간 주문처리 내역)
   ============================================================ */
import { html, raw, setHTML, on, qs } from "../dom.js";
import { icon } from "../icons.js";
import { pageTitle, tableGrid, openModal, openLightbox } from "../ui.js";
import { getDateRange, parseOrderDate, formatDateLabel } from "../util/date.js";

/* 배송 현장사진은 2:3 세로형으로 촬영·수신된다. (데모: 카테고리별 샘플) */
const DELIVERY_PHOTO = {
  근조: "https://images.unsplash.com/photo-1728080568516-28156ceae0ea?auto=format&fit=crop&w=720&h=1080&q=80",
  축하: "https://images.unsplash.com/photo-1641430262389-93bbbd2dd754?auto=format&fit=crop&w=720&h=1080&q=80",
  기타: "https://images.unsplash.com/photo-1577378978713-9bebf3db8312?auto=format&fit=crop&w=720&h=1080&q=80",
};
function deliveryPhoto(order) {
  if (order.product.startsWith("근조")) return DELIVERY_PHOTO.근조;
  if (order.product.startsWith("축하")) return DELIVERY_PHOTO.축하;
  return DELIVERY_PHOTO.기타;
}

const orderData = [
  // 오늘 (2026/06/16)
  { id: 1, manager: "김총무", date: "2026/06/16 14:30", address: "서울 종로구 대학로 101 서울대학교병원 장례식장 5호실", sender: "홍길동", profile: "주식회사 싱크플로 대표이사 홍길동", product: "근조화환(고급형)", amount: "100,000원", status: "주문접수", statusColor: "#4169e1", hasPhoto: true },
  { id: 2, manager: "박사원", date: "2026/06/16 10:15", address: "경기 성남시 분당구 야탑로 59 분당차병원 장례식장 특실", sender: "김현수", profile: "주식회사 싱크플로 인사팀 김현수", product: "근조화환(기본형)", amount: "70,000원", status: "접수대기", statusColor: "#9e9e9e", hasPhoto: false },
  // 내일 (2026/06/17) — 예약 발송
  { id: 3, manager: "이대리", date: "2026/06/17 09:00", address: "부산 해운대구 센텀중앙로 90 벡스코 제2전시장 그랜드볼룸", sender: "영업본부", profile: "주식회사 싱크플로 영업본부", product: "축하화환(고급형)", amount: "100,000원", status: "접수대기", statusColor: "#9e9e9e", hasPhoto: false },
  // 어제 (2026/06/15)
  { id: 4, manager: "김총무", date: "2026/06/15 16:40", address: "인천 남동구 구월로 12 가천대길병원 장례식장 301호실", sender: "경영지원팀", profile: "주식회사 싱크플로 경영지원팀", product: "근조화환(기본형)", amount: "70,000원", status: "배송완료", statusColor: "#4caf50", hasPhoto: true },
  { id: 5, manager: "최과장", date: "2026/06/15 09:30", address: "대전 서구 둔산로 100 대전무역회관 4층 대강당", sender: "홍길동", profile: "주식회사 싱크플로 대표이사 홍길동", product: "축하화환(기본형)", amount: "70,000원", status: "배송완료", statusColor: "#4caf50", hasPhoto: false },
  // 이번 달 (2026/06/01 ~ 06/13)
  { id: 6, manager: "박사원", date: "2026/06/13 11:20", address: "광주 북구 첨단과기로 123 광주과학기술원 오룡관 컨벤션홀", sender: "이대리", profile: "주식회사 싱크플로 영업1팀 이대리", product: "축하화환(고급형)", amount: "100,000원", status: "주문접수", statusColor: "#4169e1", hasPhoto: true },
  { id: 7, manager: "오임찬", date: "2026/06/11 15:00", address: "울산 남구 삼산로 200 울산롯데호텔 3층 크리스탈볼룸", sender: "오임찬", profile: "주식회사 싱크플로 재경팀 오임찬", product: "동양란(중)", amount: "120,000원", status: "배송완료", statusColor: "#4caf50", hasPhoto: true },
  { id: 8, manager: "김총무", date: "2026/06/09 13:10", address: "경남 창원시 의창구 중앙대로 250 창원컨벤션센터 2층 컨벤션홀", sender: "경영지원팀", profile: "주식회사 싱크플로 경영지원팀", product: "축하화환(기본형)", amount: "70,000원", status: "배송완료", statusColor: "#4caf50", hasPhoto: false },
  { id: 9, manager: "이대리", date: "2026/06/06 10:00", address: "서울 강남구 테헤란로 152 강남파이낸스센터 지하1층 컨퍼런스홀", sender: "영업본부", profile: "주식회사 싱크플로 영업본부", product: "관엽화분(대)", amount: "130,000원", status: "배송완료", statusColor: "#4caf50", hasPhoto: true },
  { id: 10, manager: "박사원", date: "2026/06/04 17:30", address: "전북 전주시 덕진구 백제대로 567 전북대학교병원 장례식장 특2호실", sender: "김현수", profile: "주식회사 싱크플로 인사팀 김현수", product: "근조화환(고급형)", amount: "100,000원", status: "배송완료", statusColor: "#4caf50", hasPhoto: false },
  { id: 11, manager: "최과장", date: "2026/06/02 09:40", address: "경기 수원시 영통구 광교중앙로 140 수원컨벤션센터 3층 컨벤션홀", sender: "홍길동", profile: "주식회사 싱크플로 대표이사 홍길동", product: "서양란(대)", amount: "150,000원", status: "배송완료", statusColor: "#4caf50", hasPhoto: true },
  { id: 12, manager: "김총무", date: "2026/06/01 11:00", address: "대구 수성구 동대구로 99 대구은행 본점 2층 대강당", sender: "경영지원팀", profile: "주식회사 싱크플로 경영지원팀", product: "근조화환(기본형)", amount: "70,000원", status: "배송완료", statusColor: "#4caf50", hasPhoto: false },
  // 지난 달 (2026/05)
  { id: 13, manager: "오임찬", date: "2026/05/27 14:00", address: "서울 송파구 올림픽로 300 롯데월드타워 SKY31 컨벤션", sender: "오임찬", profile: "주식회사 싱크플로 재경팀 오임찬", product: "축하화환(고급형)", amount: "100,000원", status: "배송완료", statusColor: "#4caf50", hasPhoto: true },
  { id: 14, manager: "이대리", date: "2026/05/20 10:30", address: "충북 청주시 흥덕구 1순환로 776 청주성모병원 장례식장 5호실", sender: "이대리", profile: "주식회사 싱크플로 영업1팀 이대리", product: "근조화환(기본형)", amount: "70,000원", status: "배송완료", statusColor: "#4caf50", hasPhoto: false },
  { id: 15, manager: "박사원", date: "2026/05/13 16:20", address: "강원 춘천시 백령로 156 강원대학교병원 장례식장 특실", sender: "김현수", profile: "주식회사 싱크플로 인사팀 김현수", product: "근조화환(고급형)", amount: "100,000원", status: "배송완료", statusColor: "#4caf50", hasPhoto: true },
  { id: 16, manager: "김총무", date: "2026/05/06 09:00", address: "제주 제주시 첨단로 242 제주첨단과학기술단지 컨벤션홀", sender: "경영지원팀", profile: "주식회사 싱크플로 경영지원팀", product: "관엽화분(대)", amount: "130,000원", status: "배송완료", statusColor: "#4caf50", hasPhoto: false },
];

// 주문현황 정렬 우선순위(상단→하단): 접수대기 → 주문접수 → 배송완료
const STATUS_RANK = { "접수대기": 0, "주문접수": 1, "배송완료": 2 };

const statusFilters = [
  { label: "전체", value: "all", color: "#555", bg: "#f5f5f5" },
  { label: "접수대기", value: "접수대기", color: "#757575", bg: "#f5f5f5" },
  { label: "주문접수", value: "주문접수", color: "#4169e1", bg: "#eef0ff" },
  { label: "배송완료", value: "배송완료", color: "#2e7d32", bg: "#e8f5e9" },
];
const imageFilterOptions = [
  { label: "이미지 있음", value: "has-image" },
  { label: "이미지 없음", value: "no-image" },
];
const quickDates = ["오늘", "어제", "내일", "이번 달", "지난 달"];
const badgeBg = { "주문접수": "#eef0ff", "접수대기": "#f5f5f5", "배송완료": "#e8f5e9" };
const searchDefs = [
  { key: "profile", label: "프로필 검색", placeholder: "이름·문구를 입력해주세요" },
  { key: "recipient", label: "받는분 검색", placeholder: "받는 분 성함을 입력해주세요" },
  { key: "address", label: "주소지 검색", placeholder: "주소지를 입력해주세요" },
];

export function mount(root, { nav }) {
  const state = {
    activeStatus: "all",
    imageFiltersOn: ["has-image", "no-image"],
    activeDateFilter: "이번 달",
    profile: "", recipient: "", address: "",
  };
  let activeModal = null;
  const closeModal = () => { if (activeModal) { activeModal.close(); activeModal = null; } };

  function filtered() {
    const [rangeStart, rangeEnd] = getDateRange(state.activeDateFilter);
    return orderData
      .filter((o) => {
        if (state.activeStatus !== "all" && o.status !== state.activeStatus) return false;
        if (!state.imageFiltersOn.includes("has-image") && o.hasPhoto) return false;
        if (!state.imageFiltersOn.includes("no-image") && !o.hasPhoto) return false;
        const od = parseOrderDate(o.date);
        if (od < rangeStart || od > rangeEnd) return false;
        if (state.profile && !o.profile.includes(state.profile)) return false;
        if (state.recipient && !o.manager.includes(state.recipient)) return false;
        if (state.address && !o.address.includes(state.address)) return false;
        return true;
      })
      // 주문현황 우선순위 내림차순(접수대기 상단 → 배송완료 하단). 동순위는 기존 순서 유지.
      .sort((a, b) => (STATUS_RANK[a.status] ?? 99) - (STATUS_RANK[b.status] ?? 99));
  }

  const columns = [
    { label: "담당자", width: "84px", align: "center", render: (r) => r.manager },
    { label: "배송요청일시", width: "148px", render: (r) => r.date },
    { label: "배송요청주소", render: (r) => html`<div class="orders-trunc">${r.address}</div>` },
    { label: "발송 프로필", width: "120px", render: (r) => html`<div class="orders-trunc">${r.sender}</div>` },
    { label: "주문상품", width: "140px", render: (r) => html`<div class="orders-trunc">${r.product}</div>` },
    { label: "결제금액", width: "96px", align: "right", render: (r) => r.amount },
    {
      label: "주문현황", width: "94px", align: "center",
      render: (r) => html`<span class="orders-badge" style="color:${r.statusColor};background:${badgeBg[r.status] ?? "#f5f5f5"}">${r.status}</span>`,
    },
    {
      label: "사진", width: "60px", align: "center",
      render: (r) => html`<button class="orders-photo ${r.hasPhoto ? "has" : "no"}" data-action="detail" data-id="${r.id}" title="${r.hasPhoto ? "사진 있음 — 클릭하여 상세 보기" : "사진 없음 — 클릭하여 주문 정보 보기"}" aria-label="주문 상세">${icon("camera", { size: 16 })}</button>`,
    },
  ];

  function tableBody() {
    return tableGrid({ columns, rows: filtered(), rowKey: (r) => r.id });
  }
  function countBody() {
    return html`총 <strong>${filtered().length}</strong>건`;
  }

  function render() {
    const [rangeStart, rangeEnd] = getDateRange(state.activeDateFilter);
    setHTML(
      root,
      html`
        <div class="page-orders">
          <div class="orders-inner">
            ${pageTitle({ imgSrc: "./assets/nav-realtime.png", title: "실시간 주문처리 내역" })}

            <div class="orders-filters">
              <!-- Row 1: status + image -->
              <div class="orders-frow orders-frow--1">
                <div class="orders-fgroup">
                  <span class="orders-flabel">주문현황</span>
                  <div class="orders-chips">
                    ${statusFilters.map((sf) => {
                      const active = state.activeStatus === sf.value;
                      const style = active
                        ? sf.value === "all"
                          ? "background:#333;color:#fff;border-color:#333"
                          : `background:${sf.bg};color:${sf.color};border-color:${sf.color}`
                        : "background:#fff;color:#888;border-color:#e0e0e0";
                      return html`<button class="orders-statbtn" style="${style}" data-action="status" data-v="${sf.value}">${sf.label}</button>`;
                    })}
                  </div>
                </div>
                <div class="orders-divider"></div>
                <div class="orders-fgroup">
                  <span class="orders-flabel">사진 필터</span>
                  ${imageFilterOptions.map((f) => {
                    const on = state.imageFiltersOn.includes(f.value);
                    return html`<label class="orders-check">
                      <input type="checkbox" data-action="imgfilter" data-v="${f.value}" ${on ? "checked" : ""} />
                      <span class="${on ? "is-on" : ""}">${f.label}</span>
                    </label>`;
                  })}
                </div>
                <div class="orders-divider"></div>
                <div class="orders-flow">
                  <span class="orders-flowtag" style="background:#f5f5f5;color:#888">접수대기</span><span>→</span>
                  <span class="orders-flowtag" style="background:#eef0ff;color:#4169e1">주문접수</span><span>→</span>
                  <span class="orders-flowtag" style="background:#e8f5e9;color:#2e7d32">배송완료</span>
                </div>
              </div>

              <!-- Row 2: date -->
              <div class="orders-frow orders-frow--2">
                <span class="orders-flabel">배송요청일</span>
                <div class="orders-daterange">
                  ${icon("calendar-days", { size: 13, cls: "tint-muted" })}
                  <span>${formatDateLabel(rangeStart)}</span>
                  ${icon("chevron-left", { size: 13 })}${icon("chevron-right", { size: 13 })}
                  <span>${formatDateLabel(rangeEnd)}</span>
                </div>
                <div class="orders-chips">
                  ${quickDates.map(
                    (opt) => html`<button class="orders-datebtn ${state.activeDateFilter === opt ? "is-active" : ""}" data-action="date" data-v="${opt}">${opt}</button>`
                  )}
                </div>
              </div>

              <!-- Row 3: search -->
              <div class="orders-frow orders-frow--3">
                ${searchDefs.map(
                  (s) => html`<div class="orders-search">
                    <div class="orders-search__lbl">${icon("search", { size: 12, cls: "tint-muted" })}<span>${s.label}</span></div>
                    <input type="text" data-search="${s.key}" value="${state[s.key]}" placeholder="${s.placeholder}" />
                  </div>`
                )}
              </div>
            </div>

            <div class="orders-notice">
              <span>🔴</span>
              <p>아래에 기재되어 있지 않은 주문은 누락 가능성이 있으므로, 고객센터로 확인 문의를 꼭 부탁드립니다.</p>
            </div>

            <div class="orders-count" data-slot="count">${countBody()}</div>

            <div class="orders-table" data-slot="table">${tableBody()}</div>
          </div>
        </div>
      `
    );
  }

  function openDetail(order) {
    closeModal();
    const sc = { "주문접수": { bg: "#eef0ff", text: "#4169e1" }, "접수대기": { bg: "#f5f5f5", text: "#757575" }, "배송완료": { bg: "#e8f5e9", text: "#2e7d32" } }[order.status] ?? { bg: "#f5f5f5", text: "#555" };
    const rows = [
      ["담당자", order.manager],
      ["배송요청일시", order.date],
      ["배송주소", order.address],
      ["발송 프로필", order.profile],
      ["주문상품", order.product],
      ["주문금액", order.amount],
    ];
    const head = html`
      <div class="hm__head">
        <div><p class="hm-eyebrow">주문 상세정보</p><h3>${order.product}</h3></div>
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="hm-badge" style="background:${sc.bg};color:${sc.text}">${order.status}</span>
          <button class="hm__x" data-action="close" aria-label="닫기">${icon("x", { size: 14 })}</button>
        </div>
      </div>
    `;
    const dl = html`
      <div class="hm-dl">
        ${rows.map(([label, value]) => {
          const vClass = label === "주문금액" ? "v amt num" : label === "배송요청일시" ? "v num" : "v";
          return html`<div class="row"><span class="k">${label}</span><span class="${vClass}">${value}</span></div>`;
        })}
      </div>
    `;
    const foot = html`<div class="hm__foot"><button class="hm-btn hm-btn--primary" data-action="close">닫기</button></div>`;

    /* 사진 보유: 세로형(2:3) 현장사진을 좌측 고정 배치, 정보는 우측 —
       사진 비율을 유지하면서도 모달 세로 길이가 늘어나지 않는다. */
    const body = order.hasPhoto
      ? html`
          <div class="msplit">
            <button class="msplit__media msplit__media--btn" data-action="zoom" aria-label="배송 사진 크게 보기">
              <img src="${deliveryPhoto(order)}" alt="배송 완료 현장사진" />
              <span class="msplit__zoomhint">${icon("search", { size: 12 })}크게 보기</span>
            </button>
            <div class="msplit__body">${head}<div class="msplit__scroll">${dl}</div>${foot}</div>
          </div>
        `
      : html`${head}<div class="hm__body">${dl}</div>${foot}`;
    activeModal = openModal({
      panelClass: order.hasPhoto ? "modal-panel--split" : "",
      body,
      onClose: () => {},
    });
    on(activeModal.panel, "click", "[data-action='close']", () => closeModal());
    on(activeModal.panel, "click", "[data-action='zoom']", () =>
      openLightbox({
        src: deliveryPhoto(order),
        alt: "배송 완료 현장사진",
        caption: `${order.product} — ${order.date} 배송사진`,
      })
    );
  }

  render();

  const offClick = on(root, "click", "[data-action]", (e, t) => {
    const a = t.dataset.action;
    if (a === "status") { state.activeStatus = t.dataset.v; render(); }
    else if (a === "date") { state.activeDateFilter = t.dataset.v; render(); }
    else if (a === "detail") {
      const o = orderData.find((x) => String(x.id) === t.dataset.id);
      if (o) openDetail(o);
    }
  });
  const offChange = on(root, "change", "[data-action='imgfilter']", (e, t) => {
    const v = t.dataset.v;
    state.imageFiltersOn = state.imageFiltersOn.includes(v)
      ? state.imageFiltersOn.filter((x) => x !== v)
      : [...state.imageFiltersOn, v];
    render();
  });
  const offInput = on(root, "input", "[data-search]", (e, t) => {
    state[t.dataset.search] = t.value;
    const tbl = qs(root, "[data-slot='table']");
    const cnt = qs(root, "[data-slot='count']");
    if (tbl) setHTML(tbl, tableBody());
    if (cnt) setHTML(cnt, countBody());
  });

  return () => { offClick(); offChange(); offInput(); closeModal(); };
}
