import { useState } from "react";
import { DataTable, Column } from "../components/ui/DataTable";
import { PageTitle } from "../components/ui/PageTitle";
import { Search, CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

// ─── Data ─────────────────────────────────────────────────────────────────────

type Order = {
  id: number;
  담당자: string;
  배송요청일시: string;
  받는분구: string;
  발송프로필: string;
  주문상품: string;
  결제금액: string;
  주문현황: string;
  statusColor: string;
};

const orderData: Order[] = [
  { id: 1, 담당자: "할다운", 배송요청일시: "2025/09/15 14:30", 받는분구: "대구 수성구 유니버시마트로 180 대구스타디움 스타디움컨벤션...", 발송프로필: "올해표현(유) 미래변호사 상징이", 주문상품: "석석화환(기본형)", 결제금액: "50,000원", 주문현황: "주문접수", statusColor: "#4169e1" },
  { id: 2, 담당자: "할다운", 배송요청일시: "2025/09/10 14:30", 받는분구: "서울 강서구 공항대로 260 이음관더뷰목서울병원 항에식장 특6...", 발송프로필: "올해표현(유) 미래변호사 상징이", 주문상품: "근조화환(기본형)", 결제금액: "50,000원", 주문현황: "접수대기", statusColor: "#9e9e9e" },
  { id: 3, 담당자: "할다운", 배송요청일시: "2025/08/30 14:30", 받는분구: "경기 광주시 실마 소시오 327 가통대학교와 고전선도병원 부...", 발송프로필: "올해표현(유) 미래변호사 상징이", 주문상품: "근조화환(기본형)", 결제금액: "50,000원", 주문현황: "배송완료", statusColor: "#4caf50" },
  { id: 4, 담당자: "할다운", 배송요청일시: "2025/08/30 14:30", 받는분구: "수원전자화잠경사이(경기도 수원시 영동구 공교로 278 (이...", 발송프로필: "올해표현(유) 미래변호사 상징이", 주문상품: "근조화환(기본형)", 결제금액: "50,000원", 주문현황: "배송완료", statusColor: "#4caf50" },
  { id: 5, 담당자: "할다운", 배송요청일시: "2025/08/30 14:30", 받는분구: "부산 부산진구 법전동 839-19 부산 시민 항에식장 3층 304호", 발송프로필: "올해표현(유) 미래변호사 상징이", 주문상품: "근조화환(기본형)", 결제금액: "50,000원", 주문현황: "배송완료", statusColor: "#4caf50" },
];

// ─── Filter definitions ────────────────────────────────────────────────────────
type StatusFilter = { label: string; value: string; color: string; bg: string };

const statusFilters: StatusFilter[] = [
  { label: "전체", value: "all", color: "#555", bg: "#f5f5f5" },
  { label: "접수대기", value: "접수대기", color: "#757575", bg: "#f5f5f5" },
  { label: "주문접수", value: "주문접수", color: "#4169e1", bg: "#eef0ff" },
  { label: "배송완료", value: "배송완료", color: "#2e7d32", bg: "#e8f5e9" },
];

const imageFilters = [
  { label: "이미지 있음", value: "has-image" },
  { label: "이미지 없음", value: "no-image" },
];

const quickDates = ["오늘", "어제", "내일", "이번 달", "지난 달"];

// ─── Separator ─────────────────────────────────────────────────────────────────
function Divider() {
  return <div className="h-4 w-px bg-[#e0e0e0]" />;
}

// ─── Table columns ─────────────────────────────────────────────────────────────
const columns: Column<Order>[] = [
  { label: "담당자", width: "80px", align: "center", render: (r) => r.담당자 },
  { label: "배송요청일시", width: "140px", render: (r) => r.배송요청일시 },
  { label: "받는분 / 주소", render: (r) => <p className="truncate">{r.받는분구}</p> },
  { label: "발송 프로필", width: "190px", render: (r) => <p className="truncate">{r.발송프로필}</p> },
  { label: "주문상품", width: "130px", render: (r) => r.주문상품 },
  { label: "결제금액", width: "90px", align: "right", render: (r) => r.결제금액 },
  {
    label: "주문현황", width: "90px", align: "center",
    render: (r) => {
      const map: Record<string, string> = { "주문접수": "#eef0ff", "접수대기": "#f5f5f5", "배송완료": "#e8f5e9" };
      return (
        <span
          className="px-2 py-1 rounded-[4px] text-[12px] font-medium whitespace-nowrap"
          style={{ color: r.statusColor, backgroundColor: map[r.주문현황] ?? "#f5f5f5" }}
        >
          {r.주문현황}
        </span>
      );
    },
  },
  {
    label: "사진", width: "56px", align: "center",
    render: (r) => <div className="w-5 h-5 rounded-full mx-auto" style={{ backgroundColor: r.statusColor }} />,
  },
];

// ─── Main Component ────────────────────────────────────────────────────────────

export function RealTimeOrders() {
  const [activeStatus, setActiveStatus] = useState("all");
  const [imageFiltersOn, setImageFiltersOn] = useState<string[]>(["has-image", "no-image"]);
  const [activeDateFilter, setActiveDateFilter] = useState("이번 달");
  const [profileSearch, setProfileSearch] = useState("");
  const [recipientSearch, setRecipientSearch] = useState("");
  const [addressSearch, setAddressSearch] = useState("");

  const toggleImageFilter = (value: string) =>
    setImageFiltersOn((prev) =>
      prev.includes(value) ? prev.filter((f) => f !== value) : [...prev, value]
    );

  return (
    <div className="p-6">
      <PageTitle icon="☰" title="실시간 주문처리 내역" />

      {/* ── Filter panel ── */}
      <div className="bg-white border border-[#e0e0e0] rounded-[6px] mb-4 overflow-hidden">

        {/* Row 1: Status + Image filters */}
        <div className="flex items-center gap-0 border-b border-[#e0e0e0]">
          {/* Status chips */}
          <div className="flex items-center gap-0 px-4 py-3">
            <span className="text-[12px] text-[#888] font-medium mr-3 whitespace-nowrap">주문현황</span>
            <div className="flex items-center gap-1.5">
              {statusFilters.map((sf) => (
                <button
                  key={sf.value}
                  onClick={() => setActiveStatus(sf.value)}
                  className="px-3 py-1.5 rounded-[4px] text-[12px] font-medium transition-all border"
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

          {/* Image filter checkboxes */}
          <div className="flex items-center gap-4 px-4 py-3">
            <span className="text-[12px] text-[#888] font-medium whitespace-nowrap">사진 필터</span>
            {imageFilters.map((f) => (
              <label key={f.value} className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={imageFiltersOn.includes(f.value)}
                  onChange={() => toggleImageFilter(f.value)}
                  className="accent-[#f15a2a] w-3.5 h-3.5"
                />
                <span className={`text-[12px] ${imageFiltersOn.includes(f.value) ? "text-[#f15a2a]" : "text-[#888]"}`}>
                  {f.label}
                </span>
              </label>
            ))}
          </div>

          <Divider />

          {/* Flow guide */}
          <div className="flex items-center gap-2 px-4 py-3 text-[12px] text-[#aaa]">
            <span className="px-2 py-0.5 rounded-[3px] bg-[#f5f5f5] text-[#888]">접수대기</span>
            <span>→</span>
            <span className="px-2 py-0.5 rounded-[3px] bg-[#eef0ff] text-[#4169e1]">주문접수</span>
            <span>→</span>
            <span className="px-2 py-0.5 rounded-[3px] bg-[#e8f5e9] text-[#2e7d32]">배송완료</span>
          </div>
        </div>

        {/* Row 2: Date filter */}
        <div className="flex items-center gap-0 border-b border-[#e0e0e0] px-4 py-3">
          <span className="text-[12px] text-[#888] font-medium mr-3 whitespace-nowrap">배송요청일</span>

          {/* Date range */}
          <div className="flex items-center gap-1.5 border border-[#d0d0d0] rounded-[4px] px-3 py-1.5 mr-4 bg-[#fafafa]">
            <CalendarDays size={13} className="text-[#888]" />
            <span className="text-[13px] text-[#444]">2025-05-01</span>
            <ChevronLeft size={13} className="text-[#bbb]" />
            <ChevronRight size={13} className="text-[#bbb]" />
            <span className="text-[13px] text-[#444]">2025-05-31</span>
          </div>

          {/* Quick date buttons */}
          <div className="flex items-center gap-1.5">
            {quickDates.map((opt) => (
              <button
                key={opt}
                onClick={() => setActiveDateFilter(opt)}
                className={`px-3 py-1.5 rounded-[4px] text-[12px] border transition-all ${
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
                <span className="text-[12px] text-[#555] font-medium whitespace-nowrap">{s.label}</span>
              </div>
              <input
                type="text"
                value={s.value}
                onChange={(e) => s.onChange(e.target.value)}
                placeholder={s.placeholder}
                className="flex-1 px-3 py-2 text-[13px] placeholder-[#bbb] outline-none bg-white"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Notice */}
      <div className="flex items-center gap-2 mb-3 bg-[#fff5f5] border border-[#ffccc7] rounded-[4px] px-4 py-2">
        <span className="text-[13px]">🔴</span>
        <p className="text-[13px] text-[#666]">
          아래에 기재되어 있지 않은 주문은 누락 가능성이 있으므로, 고객센터로 확인 문의를 꼭 부탁드립니다.
        </p>
      </div>

      <DataTable columns={columns} data={orderData} rowKey={(r) => r.id} />
    </div>
  );
}
