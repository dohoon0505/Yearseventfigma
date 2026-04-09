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
import imgMessage from "figma:asset/e6dcd9f44bb0c3ff0c5e8a8d6dcb5c780f04eb1d.png";
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
      { label: "메세지 수신설정", path: "/app/messages", icon: imgMessage },
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
      <header className="flex items-center h-[55px] border-b border-[#e0e0e0] px-4 shrink-0 bg-white">
        <div className="flex items-center gap-4">
          <div className="w-[156px] h-[30px] relative">
            <img src={imgLogo} alt="올해의 경조사" className="h-full object-contain" />
          </div>
          <div className="flex items-center gap-2 ml-4">
            {/* Company badge */}
            <div className="flex items-center gap-2 px-[14px] py-[10px] bg-[#f2f2f2] rounded-[3px] border border-[#8b8c92]">
              <img src={imgCompany} alt="" className="w-[20px] h-[20px] object-cover" />
              <span className="text-[#555] text-[14px] whitespace-nowrap" style={{ fontWeight: 500 }}>(주)진양코퍼레이션</span>
            </div>
            {/* User badge */}
            <div className="flex items-center gap-2 px-[14px] py-[10px] bg-[#f6f7ff] rounded-[3px] border border-[#939dff]">
              <img src={imgUser} alt="" className="w-[20px] h-[20px] object-cover" />
              <span className="text-[#555] text-[14px] whitespace-nowrap" style={{ fontWeight: 500 }}>총무팀 김사원</span>
            </div>
            {/* Warning badge */}
            <div className="flex items-center justify-between px-[14px] py-[10px] bg-[#fffae6] rounded-[3px] border border-[#f2b117] w-[240px]">
              <img src={imgWarning} alt="" className="w-[20px] h-[20px] object-cover" />
              <span className="text-[#555] text-[14px] whitespace-nowrap" style={{ fontWeight: 500 }}>연간 상품 누락 및 오배송: 0건</span>
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-[218px] bg-white border-r border-[#e0e0e0] flex flex-col shrink-0 overflow-y-auto">
          <nav className="flex flex-col gap-[24px] p-3 flex-1">
            {menuItems.map((group) => (
              <div key={group.group} className="flex flex-col gap-[10px]">
                <div className="px-[2px]">
                  <span className="text-[#444] text-[13px]" style={{ fontWeight: 400 }}>{group.group}</span>
                </div>
                <div className="flex flex-col gap-[3px]">
                  {group.items.map((item) => (
                    <button
                      key={item.path}
                      onClick={() => navigate(item.path)}
                      className={`flex items-center gap-[6px] px-[12px] py-[8px] rounded-[5px] w-full text-left transition-colors ${
                        isActive(item.path)
                          ? "bg-[#ffe9e9]"
                          : "hover:bg-[#f0f0f0]"
                      }`}
                    >
                      <img src={item.icon} alt="" className="w-[23px] h-[23px] object-cover shrink-0" />
                      <span
                        className={`text-[14px] font-medium whitespace-nowrap ${
                          isActive(item.path) ? "text-[#222]" : "text-[#555]"
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
              className="flex items-center gap-[6px] px-[12px] py-[8px] w-full"
            >
              <img src={imgLogout} alt="" className="w-[23px] h-[23px] object-cover shrink-0" />
              <span className="text-[#333] text-[14px] font-medium opacity-70 whitespace-nowrap">
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