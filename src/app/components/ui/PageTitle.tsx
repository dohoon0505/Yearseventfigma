import React from "react";

interface PageTitleProps {
  icon?: React.ReactNode;
  imgSrc?: string;
  title: string;
  action?: React.ReactNode;
}

export function PageTitle({ icon, imgSrc, title, action }: PageTitleProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        {imgSrc ? (
          <img src={imgSrc} alt="" className="w-[26px] h-[26px] object-contain" />
        ) : icon ? (
          <span className="text-[22px] leading-none">{icon}</span>
        ) : null}
        <h1 className="text-[22px] text-[#222] font-bold">{title}</h1>
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
