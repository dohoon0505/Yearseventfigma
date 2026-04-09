import React from "react";

export type Column<T> = {
  label: string;
  headerLabel?: React.ReactNode;
  width?: string;
  align?: "left" | "center" | "right";
  render: (row: T, idx: number) => React.ReactNode;
};

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  rowKey: (row: T, idx: number) => string | number;
  compact?: boolean;
  fitContent?: boolean;
}

const headerAlignClass: Record<string, string> = {
  left: "justify-start",
  center: "justify-center",
  right: "justify-end",
};

const cellAlignClass: Record<string, string> = {
  left: "justify-start",
  center: "justify-center",
  right: "justify-end",
};

export function DataTable<T>({ columns, data, rowKey, compact = false, fitContent = false }: DataTableProps<T>) {
  const gridCols = columns.map((c) => c.width ?? "1fr").join(" ");
  const headerPad = compact ? "px-3 py-2" : "px-3 py-3";
  const cellPad   = compact ? "px-3 py-2" : "px-3 py-3";

  return (
    <div className={`bg-white rounded-[6px] border border-[#e0e0e0] overflow-hidden ${fitContent ? "w-fit" : "w-full"}`}>
      {/* Header */}
      <div className="grid bg-[#f5f5f5] border-b border-[#e0e0e0]" style={{ gridTemplateColumns: gridCols }}>
        {columns.map((col, i) => (
          <div
            key={i}
            className={`flex items-center ${headerPad} text-[14px] text-[#555] font-medium border-r last:border-r-0 border-[#e0e0e0] ${headerAlignClass[col.align ?? "left"]}`}
          >
            {col.headerLabel ?? col.label}
          </div>
        ))}
      </div>

      {/* Rows */}
      {data.map((row, idx) => (
        <div
          key={rowKey(row, idx)}
          className="grid border-b border-[#e0e0e0] last:border-b-0 hover:bg-[#fafafa] transition-colors"
          style={{ gridTemplateColumns: gridCols }}
        >
          {columns.map((col, i) => (
            <div
              key={i}
              className={`flex items-center ${cellPad} text-[14px] text-[#666] border-r last:border-r-0 border-[#e0e0e0] ${cellAlignClass[col.align ?? "left"]}`}
            >
              {col.render(row, idx)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
