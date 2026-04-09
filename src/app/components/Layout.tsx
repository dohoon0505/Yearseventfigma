import { Outlet, useNavigate, useLocation } from "react-router";
import imgLogo from "figma:asset/9f45d2cc6704b4f034e7928bd437f55f2a05331c.png";
import imgCompany from "figma:asset/84be40dc74a54529344bc39d30b6fa8f58440ad0.png";
import imgUser from "figma:asset/22b84235835e58a01194dd9ee625b682e96615a1.png";
import imgWarning from "figma:asset/fd06418440b4d84b613847aec8f6e72072705a72.png";
import imgOrder from "figma:asset/a434853cde239de73a36073c49ed24faace42a4a.png";
import imgRealtime from "figma:asset/b0533b3229ad4950f3b043b3ae8667081710f64b.png";
import imgInvoice from "figma:asset/ee2ff27ff07231dd3da62b67b66ec977af5f6f69.png";
import imgAccounting from "figma:asset/89f44e86951b9673b222bf64d04181d919c190b3.png";
import imgProfile from "figma:asset/fab737052638e076fb0189281951c841b72f5549.png";
import imgProduct from "figma:asset/97a27d229243f9058487e5c0c95bdffcbc1d2c18.png";
import imgLogout from "figma:asset/7bbdafe5ba0b00fdbb02e5303a951c414bab68a8.png";

const menuItems = [
  {
    group: "사용자 메뉴",
    items: [
      { label: "경조상품 주문", path: "/app", icon: imgOrder },
      { label: "실시간 주문내역", path: "/app/orders", icon: imgRealtime },
    ],
  },
  {
    group: "정산관련메뉴",
    items: [
      { label: "거래명세서 조회", path: "/app/invoice", icon: imgInvoice },
      { label: "정산회계 조회", path: "/app/settlement", icon: imgAccounting },
    ],
  },
  {
    group: "회사관련메뉴",
    items: [
      { label: "프로필 저장공간", path: "/app/profile", icon: imgProfile },
      { label: "상품 규격 안내", path: "/app/products", icon: imgProduct },
    ],
  },
];

export function Layout() {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === "/app") return location.pathname === "/app";
    return location.pathname.startsWith(path);
  };

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Header */}
      <header className="flex items-center justify-between h-[62px] border-b border-[#e0e0e0] px-6 shrink-0 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
        {/* Left: Logo + Badges */}
        <div className="flex items-center gap-5">
          <div className="h-[32px]">
            <img src={imgLogo} alt="올해의 경조사" className="h-full object-contain" />
          </div>
          <div className="h-5 w-px bg-[#e8e8e8]" />
          <div className="flex items-center gap-2">
            {/* Company badge */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[#f5f5f5] rounded-[5px] border border-[#d8d8d8]">
              <img src={imgCompany} alt="" className="w-[18px] h-[18px] object-contain" />
              <span className="text-[#444] text-[14px] whitespace-nowrap font-medium">(주)진양코퍼레이션</span>
            </div>
            {/* User badge */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[#f0f3ff] rounded-[5px] border border-[#c5cdff]">
              <img src={imgUser} alt="" className="w-[18px] h-[18px] object-contain" />
              <span className="text-[#4169e1] text-[14px] whitespace-nowrap font-semibold">총무팀 김사원</span>
            </div>
          </div>
        </div>

        {/* Right: Warning */}
        <div className="flex items-center gap-2 px-4 py-2 bg-[#fffae6] rounded-[5px] border border-[#f0c040]">
          <img src={imgWarning} alt="" className="w-[18px] h-[18px] object-contain" />
          <span className="text-[14px] text-[#555] whitespace-nowrap">
            연간 상품 누락 및 오배송: <strong className="text-[#c87000]">0건</strong>
          </span>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-[220px] bg-white border-r border-[#e0e0e0] flex flex-col shrink-0 overflow-y-auto">
          <nav className="flex flex-col gap-[22px] p-3 flex-1">
            {menuItems.map((group) => (
              <div key={group.group} className="flex flex-col gap-[8px]">
                <div className="px-[4px]">
                  <span className="text-[#888] text-[12px] font-semibold tracking-wide uppercase">{group.group}</span>
                </div>
                <div className="flex flex-col gap-[2px]">
                  {group.items.map((item) => (
                    <button
                      key={item.path}
                      onClick={() => navigate(item.path)}
                      className={`flex items-center gap-[8px] px-[12px] py-[9px] rounded-[6px] w-full text-left transition-colors ${
                        isActive(item.path)
                          ? "bg-[#ffe9e9]"
                          : "hover:bg-[#f4f4f4]"
                      }`}
                    >
                      <img src={item.icon} alt="" className="w-[22px] h-[22px] object-contain shrink-0" />
                      <span
                        className={`text-[15px] font-medium whitespace-nowrap ${
                          isActive(item.path) ? "text-[#d94000]" : "text-[#444]"
                        }`}
                      >
                        {item.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          {/* Logout */}
          <div className="p-3 border-t border-[#e0e0e0]">
            <button
              onClick={() => navigate("/login")}
              className="flex items-center gap-[8px] px-[12px] py-[9px] w-full rounded-[6px] hover:bg-[#f4f4f4] transition-colors"
            >
              <img src={imgLogout} alt="" className="w-[22px] h-[22px] object-contain shrink-0" />
              <span className="text-[#888] text-[15px] font-medium whitespace-nowrap">
                서비스 로그아웃
              </span>
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto bg-[#f9f9f9]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
