import { useState, useMemo } from "react";
import { DataTable, Column } from "../components/ui/DataTable";
import { PageTitle } from "../components/ui/PageTitle";
import { Search, CalendarDays, ChevronLeft, ChevronRight, X, Camera } from "lucide-react";
import imgRealtime from "figma:asset/b0533b3229ad4950f3b043b3ae8667081710f64b.png";

// ─── Types & Data ──────────────────────────────────────────────────────────────
type Order = {
  id: number;
  담당자: string;
  배송요청일시: string;
  배송주소: string;
  발송프로필: string;
  주문상품: string;
  결제금액: string;
  주문현황: string;
  statusColor: string;
  hasPhoto: boolean;
};

const orderData: Order[] = [
  { id: 1, 담당자: "김총무", 배송요청일시: "2026/04/08 14:30", 배송주소: "대구 수성구 유니버시마트로 180 대구스타디움 스타디움컨벤션", 발송프로필: "올해표현(유) 미래변호사 상징이", 주문상품: "축하화환(기본형)", 결제금액: "50,000원", 주문현황: "주문접수", statusColor: "#4169e1", hasPhoto: true },
  { id: 2, 담당자: "김총무", 배송요청일시: "2026/04/07 09:00", 배송주소: "서울 강서구 공항대로 260 이음관더뷰목서울병원 항에식장 특6호", 발송프로필: "올해표현(유) 미래변호사 상징이", 주문상품: "근조화환(기본형)", 결제금액: "50,000원", 주문현황: "접수대기", statusColor: "#9e9e9e", hasPhoto: false },
  { id: 3, 담당자: "박사원", 배송요청일시: "2026/04/05 11:00", 배송주소: "경기 광주시 실마 소시오 327 가통대학교와 고전선도병원 부속동", 발송프로필: "올해표현(유) 총무팀 박사원", 주문상품: "근조화환(기본형)", 결제금액: "70,000원", 주문현황: "배송완료", statusColor: "#4caf50", hasPhoto: true },
  { id: 4, 담당자: "김총무", 배송요청일시: "2026/03/30 14:30", 배송주소: "수원전자화잠경사이(경기도 수원시 영동구 공교로 278)", 발송프로필: "올해표현(유) 미래변호사 상징이", 주문상품: "근조화환(기본형)", 결제금액: "50,000원", 주문현황: "배송완료", statusColor: "#4caf50", hasPhoto: false },
  { id: 5, 담당자: "이대리", 배송요청일시: "2026/03/25 10:00", 배송주소: "부산 부산진구 법전동 839-19 부산 시민 항에식장 3층 304호", 발송프로필: "올해표현(유) 영업팀 이대리", 주문상품: "근조화환(기본형)", 결제금액: "50,000원", 주문현황: "배송완료", statusColor: "#4caf50", hasPhoto: true },
];

// ─── Filter config ─────────────────────────────────────────────────────────────
type StatusFilter = { label: string; value: string; color: string; bg: string };

const statusFilters: StatusFilter[] = [
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

// ─── Date helpers ──────────────────────────────────────────────────────────────
function getDateRange(filter: string): [Date, Date] {
  const today = new Date();
  const start = new Date(today);
  const end = new Date(today);

  switch (filter) {
    case "오늘":
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case "어제":
      start.setDate(start.getDate() - 1); start.setHours(0, 0, 0, 0);
      end.setDate(end.getDate() - 1);     end.setHours(23, 59, 59, 999);
      break;
    case "내일":
      start.setDate(start.getDate() + 1); start.setHours(0, 0, 0, 0);
      end.setDate(end.getDate() + 1);     end.setHours(23, 59, 59, 999);
      break;
    case "이번 달":
      start.setDate(1); start.setHours(0, 0, 0, 0);
      end.setMonth(end.getMonth() + 1, 0); end.setHours(23, 59, 59, 999);
      break;
    case "지난 달":
      start.setMonth(start.getMonth() - 1, 1); start.setHours(0, 0, 0, 0);
      end.setDate(0); end.setHours(23, 59, 59, 999);
      break;
    default:
      start.setDate(1); start.setHours(0, 0, 0, 0);
      end.setMonth(end.getMonth() + 1, 0); end.setHours(23, 59, 59, 999);
  }
  return [start, end];
}

function parseOrderDate(str: string): Date {
  // "2026/04/08 14:30" → Date
  const [datePart, timePart] = str.split(" ");
  const [y, m, d] = datePart.split("/").map(Number);
  const [hh, mm] = (timePart ?? "00:00").split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm);
}

function formatDateLabel(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ─── Order Detail Modal ────────────────────────────────────────────────────────
function OrderDetailModal({ order, onClose }: { order: Order | null; onClose: () => void }) {
  if (!order) return null;

  const rows = [
    { label: "담당자", value: order.담당자 },
    { label: "배송요청일시", value: order.배송요청일시 },
    { label: "배송주소", value: order.배송주소 },
    { label: "발송 프로필", value: order.발송프로필 },
    { label: "주문상품", value: order.주문상품 },
    { label: "주문금액", value: order.결제금액 },
  ];

  const statusColorMap: Record<string, { bg: string; text: string }> = {
    "주문접수": { bg: "#eef0ff", text: "#4169e1" },
    "접수대기": { bg: "#f5f5f5", text: "#757575" },
    "배송완료": { bg: "#e8f5e9", text: "#2e7d32" },
  };
  const sc = statusColorMap[order.주문현황] ?? { bg: "#f5f5f5", text: "#555" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white rounded-[10px] shadow-2xl w-full max-w-[440px] mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e0e0e0]">
          <div className="flex items-center gap-2">
            <Camera size={18} className="text-[#f15a2a]" />
            <div>
              <p className="text-[13px] text-[#888]">주문 상세정보</p>
              <h3 className="text-[16px] text-[#222] font-bold">{order.주문상품}</h3>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="px-2.5 py-1 rounded-[4px] text-[12px] font-semibold"
              style={{ backgroundColor: sc.bg, color: sc.text }}
            >
              {order.주문현황}
            </span>
            <button onClick={onClose} className="p-1.5 text-[#aaa] hover:text-[#555] transition-colors rounded">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Photo placeholder or no-photo notice */}
        {order.hasPhoto ? (
          <div className="w-full h-[160px] bg-[#f5f5f5] flex items-center justify-center border-b border-[#e0e0e0]">
            <div className="flex flex-col items-center gap-2 text-[#ccc]">
              <Camera size={40} />
              <span className="text-[13px]">주문 사진</span>
            </div>
          </div>
        ) : (
          <div className="w-full h-[80px] bg-[#fafafa] flex items-center justify-center border-b border-[#e0e0e0]">
            <div className="flex items-center gap-2 text-[#bbb]">
              <Camera size={18} />
              <span className="text-[13px]">등록된 사진이 없습니다</span>
            </div>
          </div>
        )}

        {/* Info rows */}
        <div className="divide-y divide-[#f0f0f0]">
          {rows.map(({ label, value }) => (
            <div key={label} className="flex items-start">
              <div className="w-[120px] shrink-0 px-4 py-2.5 bg-[#f8f8f8] text-[13px] text-[#666] font-medium border-r border-[#f0f0f0]">
                {label}
              </div>
              <div className={`flex-1 px-4 py-2.5 text-[14px] ${label === "주문금액" ? "text-[#f15a2a] font-bold" : "text-[#333]"}`}>
                {value}
              </div>
            </div>
          ))}
        </div>

        <div className="px-5 py-4">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-[#f15a2a] text-white rounded-[4px] text-[14px] font-medium hover:bg-[#d94e24] transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Photo Icon Button ─────────────────────────────────────────────────────────
function PhotoButton({ hasPhoto, onClick }: { hasPhoto: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={hasPhoto ? "사진 있음 — 클릭하여 상세 보기" : "사진 없음 — 클릭하여 주문 정보 보기"}
      className={`w-8 h-8 rounded-[5px] flex items-center justify-center transition-colors mx-auto ${
        hasPhoto
          ? "bg-[#fff0ea] hover:bg-[#ffd9c7] border border-[#f15a2a]/30"
          : "bg-[#f0f0f0] hover:bg-[#e8e8e8] border border-[#ddd]"
      }`}
    >
      <Camera size={16} className={hasPhoto ? "text-[#f15a2a]" : "text-[#bbb]"} />
    </button>
  );
}

function Divider() {
  return <div className="h-5 w-px bg-[#e0e0e0]" />;
}

// ─── Main Component ────────────────────────────────────────────────────────────
export function RealTimeOrders() {
  const [activeStatus, setActiveStatus] = useState("all");
  const [imageFiltersOn, setImageFiltersOn] = useState<string[]>(["has-image", "no-image"]);
  const [activeDateFilter, setActiveDateFilter] = useState("이번 달");
  const [profileSearch, setProfileSearch] = useState("");
  const [recipientSearch, setRecipientSearch] = useState("");
  const [addressSearch, setAddressSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const toggleImageFilter = (value: string) =>
    setImageFiltersOn((prev) =>
      prev.includes(value) ? prev.filter((f) => f !== value) : [...prev, value]
    );

  // ── Computed date range label ───────────────────────────────────────────────
  const [rangeStart, rangeEnd] = useMemo(() => getDateRange(activeDateFilter), [activeDateFilter]);

  // ── Filtered data ───────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return orderData.filter((order) => {
      // 주문현황 필터
      if (activeStatus !== "all" && order.주문현황 !== activeStatus) return false;

      // 사진 필터
      if (!imageFiltersOn.includes("has-image") && order.hasPhoto) return false;
      if (!imageFiltersOn.includes("no-image") && !order.hasPhoto) return false;

      // 날짜 필터
      const orderDate = parseOrderDate(order.배송요청일시);
      if (orderDate < rangeStart || orderDate > rangeEnd) return false;

      // 검색 필터
      if (profileSearch && !order.발송프로필.includes(profileSearch)) return false;
      if (recipientSearch && !order.담당자.includes(recipientSearch)) return false;
      if (addressSearch && !order.배송주소.includes(addressSearch)) return false;

      return true;
    });
  }, [activeStatus, imageFiltersOn, rangeStart, rangeEnd, profileSearch, recipientSearch, addressSearch]);

  // ── Table columns ───────────────────────────────────────────────────────────
  const columns: Column<Order>[] = [
    { label: "담당자", width: "84px", align: "center", render: (r) => r.담당자 },
    { label: "배송요청일시", width: "148px", render: (r) => r.배송요청일시 },
    { label: "배송요청주소", render: (r) => <p className="truncate">{r.배송주소}</p> },
    { label: "발송 프로필", width: "200px", render: (r) => <p className="truncate">{r.발송프로필}</p> },
    { label: "주문상품", width: "140px", render: (r) => r.주문상품 },
    { label: "결제금액", width: "96px", align: "right", render: (r) => r.결제금액 },
    {
      label: "주문현황", width: "94px", align: "center",
      render: (r) => {
        const map: Record<string, string> = { "주문접수": "#eef0ff", "접수대기": "#f5f5f5", "배송완료": "#e8f5e9" };
        return (
          <span
            className="px-2 py-1 rounded-[4px] text-[13px] font-medium whitespace-nowrap"
            style={{ color: r.statusColor, backgroundColor: map[r.주문현황] ?? "#f5f5f5" }}
          >
            {r.주문현황}
          </span>
        );
      },
    },
    {
      label: "사진", width: "60px", align: "center",
      render: (r) => <PhotoButton hasPhoto={r.hasPhoto} onClick={() => setSelectedOrder(r)} />,
    },
  ];

  return (
    <div className="p-6">
      <div className="w-[1300px] flex flex-col gap-4">
      <PageTitle imgSrc={imgRealtime} title="실시간 주문처리 내역" />

      {/* ── Filter panel ── */}
      <div className="bg-white border border-[#e0e0e0] rounded-[6px] overflow-hidden">

        {/* Row 1: Status + Image filters */}
        <div className="flex items-center gap-0 border-b border-[#e0e0e0]">
          <div className="flex items-center gap-0 px-4 py-3">
            <span className="text-[13px] text-[#888] font-medium mr-3 whitespace-nowrap">주문현황</span>
            <div className="flex items-center gap-1.5">
              {statusFilters.map((sf) => (
                <button
                  key={sf.value}
                  onClick={() => setActiveStatus(sf.value)}
                  className="px-3 py-1.5 rounded-[4px] text-[13px] font-medium transition-all border"
                  style={
                    activeStatus === sf.value
                      ? { backgroundColor: sf.value === "all" ? "#333" : sf.bg, color: sf.value === "all" ? "#fff" : sf.color, borderColor: sf.value === "all" ? "#333" : sf.color }
                      : { backgroundColor: "#fff", color: "#888", borderColor: "#e0e0e0" }
                  }
                >
                  {sf.label}
                </button>
              ))}
            </div>
          </div>

          <Divider />

          <div className="flex items-center gap-4 px-4 py-3">
            <span className="text-[13px] text-[#888] font-medium whitespace-nowrap">사진 필터</span>
            {imageFilterOptions.map((f) => (
              <label key={f.value} className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={imageFiltersOn.includes(f.value)}
                  onChange={() => toggleImageFilter(f.value)}
                  className="accent-[#f15a2a] w-3.5 h-3.5"
                />
                <span className={`text-[13px] ${imageFiltersOn.includes(f.value) ? "text-[#f15a2a]" : "text-[#888]"}`}>
                  {f.label}
                </span>
              </label>
            ))}
          </div>

          <Divider />

          <div className="flex items-center gap-2 px-4 py-3 text-[13px] text-[#aaa]">
            <span className="px-2 py-0.5 rounded-[3px] bg-[#f5f5f5] text-[#888]">접수대기</span>
            <span>→</span>
            <span className="px-2 py-0.5 rounded-[3px] bg-[#eef0ff] text-[#4169e1]">주문접수</span>
            <span>→</span>
            <span className="px-2 py-0.5 rounded-[3px] bg-[#e8f5e9] text-[#2e7d32]">배송완료</span>
          </div>
        </div>

        {/* Row 2: Date filter */}
        <div className="flex items-center gap-0 border-b border-[#e0e0e0] px-4 py-3">
          <span className="text-[13px] text-[#888] font-medium mr-3 whitespace-nowrap">배송요청일</span>

          <div className="flex items-center gap-1.5 border border-[#d0d0d0] rounded-[4px] px-3 py-1.5 mr-4 bg-[#fafafa]">
            <CalendarDays size={13} className="text-[#888]" />
            <span className="text-[13px] text-[#444]">{formatDateLabel(rangeStart)}</span>
            <ChevronLeft size={13} className="text-[#bbb]" />
            <ChevronRight size={13} className="text-[#bbb]" />
            <span className="text-[13px] text-[#444]">{formatDateLabel(rangeEnd)}</span>
          </div>

          <div className="flex items-center gap-1.5">
            {quickDates.map((opt) => (
              <button
                key={opt}
                onClick={() => setActiveDateFilter(opt)}
                className={`px-3 py-1.5 rounded-[4px] text-[13px] border transition-all ${
                  activeDateFilter === opt
                    ? "bg-[#f15a2a] text-white border-[#f15a2a] font-medium"
                    : "bg-white text-[#666] border-[#e0e0e0] hover:border-[#f15a2a] hover:text-[#f15a2a]"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        {/* Row 3: Search fields */}
        <div className="flex items-center gap-3 px-4 py-3">
          {[
            { label: "프로필 검색", placeholder: "이름·문구를 입력해주세요", value: profileSearch, onChange: setProfileSearch },
            { label: "받는분 검색", placeholder: "받는 분 성함을 입력해주세요", value: recipientSearch, onChange: setRecipientSearch },
            { label: "주소지 검색", placeholder: "주소지를 입력해주세요", value: addressSearch, onChange: setAddressSearch },
          ].map((s) => (
            <div key={s.label} className="flex items-center flex-1 border border-[#d0d0d0] rounded-[4px] overflow-hidden focus-within:border-[#f15a2a] transition-colors">
              <div className="px-3 py-2 bg-[#f5f5f5] border-r border-[#d0d0d0] flex items-center gap-1.5 shrink-0">
                <Search size={12} className="text-[#888]" />
                <span className="text-[13px] text-[#555] font-medium whitespace-nowrap">{s.label}</span>
              </div>
              <input
                type="text"
                value={s.value}
                onChange={(e) => s.onChange(e.target.value)}
                placeholder={s.placeholder}
                className="flex-1 px-3 py-2 text-[14px] placeholder-[#bbb] outline-none bg-white"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Notice */}
      <div className="flex items-center gap-2 mb-3 bg-[#fff5f5] border border-[#ffccc7] rounded-[4px] px-4 py-2">
        <span className="text-[14px]">🔴</span>
        <p className="text-[14px] text-[#666]">
          아래에 기재되어 있지 않은 주문은 누락 가능성이 있으므로, 고객센터로 확인 문의를 꼭 부탁드립니다.
        </p>
      </div>

      {/* Result count */}
      <div className="mb-2 text-[13px] text-[#888]">
        총 <strong className="text-[#333]">{filtered.length}</strong>건
      </div>

      <DataTable columns={columns} data={filtered} rowKey={(r) => r.id} />

      </div>{/* /w-[1300px] */}

      {/* Order detail modal */}
      <OrderDetailModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />
    </div>
  );
}
