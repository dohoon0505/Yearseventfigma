import { useState } from "react";
import { DataTable, Column } from "../components/ui/DataTable";
import { PageTitle } from "../components/ui/PageTitle";
import { X, Save, CheckCircle, Camera } from "lucide-react";
import { useAppStore, ALL_PRODUCTS, productKey, Product } from "../store/AppContext";
import imgProduct from "figma:asset/97a27d229243f9058487e5c0c95bdffcbc1d2c18.png";

// ─── Sample images per category ───────────────────────────────────────────────
const sampleImages: Record<string, string> = {
  경조화환: "https://images.unsplash.com/photo-1728080568516-28156ceae0ea?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmdW5lcmFsJTIwZmxvd2VyJTIwS29yZWElMjBjZXJlbW9ueXxlbnwxfHx8fDE3NzU2Mzk0ODd8MA&ixlib=rb-4.1.0&q=80&w=1080",
  관엽화분: "https://images.unsplash.com/photo-1771466883438-4b4564648309?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx0cm9waWNhbCUyMGZvbGlhZ2UlMjBncmVlbiUyMHBsYW50JTIwaW5kb29yfGVufDF8fHx8MTc3NTYzOTQ4N3ww&ixlib=rb-4.1.0&q=80&w=1080",
  동서양란: "https://images.unsplash.com/photo-1577378978713-9bebf3db8312?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx3aGl0ZSUyMHBoYWxhZW5vcHNpcyUyMG9yY2hpZCUyMGVsZWdhbnR8ZW58MXx8fHwxNzc1NjM5NDg3fDA&ixlib=rb-4.1.0&q=80&w=1080",
  생화: "https://images.unsplash.com/photo-1641430262389-93bbbd2dd754?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmcmVzaCUyMGZsb3dlciUyMGJvdXF1ZXQlMjBjb2xvcmZ1bCUyMGJsb29tfGVufDF8fHx8MTc3NTYzOTQ4N3ww&ixlib=rb-4.1.0&q=80&w=1080",
};

const categories = ["전체", "경조화환", "관엽화분", "동서양란", "생화"];

// ─── Sample Photo Modal ────────────────────────────────────────────────────────
function SampleModal({ product, onClose }: { product: Product | null; onClose: () => void }) {
  if (!product) return null;
  const imgUrl = sampleImages[product.category];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white rounded-[10px] shadow-2xl w-full max-w-[460px] mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e0e0e0]">
          <div>
            <p className="text-[13px] text-[#888] font-medium">{product.category}</p>
            <h3 className="text-[17px] text-[#222] font-bold">{product.product}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 text-[#aaa] hover:text-[#555] transition-colors rounded">
            <X size={18} />
          </button>
        </div>

        <div className="relative w-full" style={{ paddingBottom: "70%" }}>
          <img
            src={imgUrl}
            alt={product.product}
            className="absolute inset-0 w-full h-full object-cover"
          />
        </div>

        <div className="p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[15px] text-[#333] font-medium">상품금액</span>
            <span className="text-[19px] text-[#f15a2a] font-bold">{product.price}</span>
          </div>
          <p className="text-[14px] text-[#666] leading-[1.6]">{product.description}</p>
          <div className="mt-4 bg-[#fffbf0] border border-[#f2e0a0] rounded-[4px] px-3 py-2">
            <p className="text-[13px] text-[#888]">※ 실제 상품은 사진과 다를 수 있으며, 계절 및 산지 사정에 따라 품종이 변경될 수 있습니다.</p>
          </div>
        </div>

        <div className="px-5 pb-5">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-[#f15a2a] text-white rounded-[4px] text-[15px] font-medium hover:bg-[#d94e24] transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export function ProductGuide() {
  const { favorites, setFavorites } = useAppStore();
  const [selectedCategory, setSelectedCategory] = useState("전체");
  const [sampleProduct, setSampleProduct] = useState<Product | null>(null);
  const [saved, setSaved] = useState(false);

  const filtered = selectedCategory === "전체" ? ALL_PRODUCTS : ALL_PRODUCTS.filter((p) => p.category === selectedCategory);

  const toggleFavorite = (r: Product) => {
    setSaved(false);
    setFavorites((prev) => {
      const next = new Set(prev);
      const k = productKey(r);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const columns: Column<Product>[] = [
    {
      label: "즐겨찾기", width: "64px", align: "center",
      headerLabel: <span style={{ display: "inline-block", textAlign: "center", wordBreak: "keep-all", lineHeight: "1.4" }}>즐겨<br />찾기</span>,
      render: (r) => (
        <input
          type="checkbox"
          checked={favorites.has(productKey(r))}
          onChange={() => toggleFavorite(r)}
          className="accent-[#f15a2a] cursor-pointer w-[15px] h-[15px]"
        />
      ),
    },
    { label: "구분", width: "90px", render: (r) => r.category },
    { label: "상세상품", width: "170px", render: (r) => r.product },
    { label: "상품금액", width: "120px", align: "right", render: (r) => <span className="font-medium text-[#444]">{r.price}</span> },
    { label: "상품설명 및 비고(규격)", width: "1fr", render: (r) => r.description },
    {
      label: "샘플사진", width: "96px", align: "center",
      render: (r) => (
        <button
          onClick={() => setSampleProduct(r)}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-[#f5f5f5] hover:bg-[#ffe9e9] border border-[#e0e0e0] hover:border-[#f15a2a] rounded-[4px] text-[13px] text-[#555] hover:text-[#f15a2a] transition-colors whitespace-nowrap"
        >
          <Camera size={13} />
          <span>보기</span>
        </button>
      ),
    },
  ];

  return (
    <div className="p-6">
      <PageTitle imgSrc={imgProduct} title="상품 규격 안내" />

      <div className="w-[1300px] flex flex-col gap-3">

      {/* Filters */}
      <div className="bg-white border border-[#e0e0e0] rounded-[6px] p-4 flex flex-col gap-3">
        <div className="flex items-center gap-4">
          <span className="text-[14px] text-[#555] font-medium w-[90px]">상품조회구분</span>
          <div className="flex items-center gap-4">
            {categories.map((cat) => (
              <label key={cat} className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" name="category" checked={selectedCategory === cat} onChange={() => setSelectedCategory(cat)} className="accent-[#f15a2a]" />
                <span className={`text-[14px] ${selectedCategory === cat ? "text-[#f15a2a] font-medium" : "text-[#555]"}`}>{cat}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="flex items-start gap-4">
          <span className="text-[14px] text-[#555] font-medium w-[90px] pt-0.5">즐겨찾기안내</span>
          <p className="text-[14px] text-[#666] leading-[1.6]">자주 이용하는 상품을 즐겨찾기에 선택해두면 경조상품 주문 시 상품 선택을 수월하게 할 수 있습니다.</p>
        </div>
      </div>

      {/* Save bar */}
      <div className="flex items-center justify-between bg-white border border-[#e0e0e0] rounded-[6px] px-5 py-3">
        <span className="text-[14px] text-[#666]">
          즐겨찾기 선택 항목: <strong className="text-[#f15a2a]">{favorites.size}개</strong>
        </span>
        <button
          onClick={handleSave}
          disabled={favorites.size === 0}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-[4px] text-[14px] font-semibold transition-colors ${
            favorites.size === 0
              ? "bg-[#e0e0e0] text-[#aaa] cursor-not-allowed"
              : saved
              ? "bg-[#4caf50] text-white"
              : "bg-[#4169e1] text-white hover:bg-[#3558c4]"
          }`}
        >
          {saved ? <CheckCircle size={15} /> : <Save size={15} />}
          {saved ? "저장 완료!" : "즐겨찾기 저장"}
        </button>
      </div>

      <DataTable columns={columns} data={filtered} rowKey={(r) => productKey(r)} compact />

      </div>{/* /w-fit */}

      <SampleModal product={sampleProduct} onClose={() => setSampleProduct(null)} />
    </div>
  );
}
