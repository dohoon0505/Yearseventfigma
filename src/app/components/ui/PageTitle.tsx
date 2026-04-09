import React from "react";

interface PageTitleProps {
  icon: React.ReactNode;
  title: string;
  action?: React.ReactNode;
}

export function PageTitle({ icon, title, action }: PageTitleProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        <span className="text-[26px] leading-none">{icon}</span>
        <h1 className="text-[24px] text-[#222] font-bold">{title}</h1>
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
