"use client";

import { Fragment } from "react";
import { colToLetter, toPosition, type Cell } from "@/lib/grid";

interface Props {
  rows: number;
  cols: number;
  isFilled: (row: number, col: number) => boolean;
  summary?: (row: number, col: number) => string | undefined;
  selected: Cell | null;
  hovered: Cell | null;
  voiceHighlight?: Cell | null;
  onHover: (cell: Cell | null) => void;
  onSelect: (cell: Cell) => void;
}

const same = (a: Cell | null | undefined, r: number, c: number) =>
  !!a && a.row === r && a.col === c;

/** Pick circle/header sizing so small and large racks both look right. */
function sizing(rows: number, cols: number) {
  const dim = Math.max(rows, cols);
  const cell =
    dim <= 10 ? 36 : dim <= 16 ? 30 : dim <= 24 ? 24 : dim <= 36 ? 19 : 15;
  return {
    cell,
    gap: cell >= 24 ? 4 : 3,
    rowHeaderW: Math.max(cell, 26),
    headerFont: Math.max(9, Math.round(cell * 0.36)),
  };
}

export function RackGrid({
  rows,
  cols,
  isFilled,
  summary,
  selected,
  hovered,
  voiceHighlight,
  onHover,
  onSelect,
}: Props) {
  const { cell, gap, rowHeaderW, headerFont } = sizing(rows, cols);

  return (
    <div
      className="overflow-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-soft"
      onMouseLeave={() => onHover(null)}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `${rowHeaderW}px repeat(${cols}, ${cell}px)`,
          gap: `${gap}px`,
          width: "max-content",
        }}
      >
        {/* corner + column headers */}
        <div />
        {Array.from({ length: cols }).map((_, c) => (
          <div
            key={`h${c}`}
            className="grid place-items-center font-semibold text-slate-400"
            style={{ height: rowHeaderW, fontSize: headerFont }}
          >
            {colToLetter(c)}
          </div>
        ))}

        {Array.from({ length: rows }).map((_, r) => (
          <Fragment key={`r${r}`}>
            <div
              className="grid place-items-center font-semibold text-slate-400"
              style={{ width: rowHeaderW, height: cell, fontSize: headerFont }}
            >
              {r + 1}
            </div>
            {Array.from({ length: cols }).map((_, c) => {
              const filled = isFilled(r, c);
              const sum = summary?.(r, c);
              const isSel = same(selected, r, c);
              const isHov = same(hovered, r, c);
              const isVoice = same(voiceHighlight, r, c);
              return (
                <button
                  key={`c${r}-${c}`}
                  aria-label={`Slot ${toPosition({ row: r, col: c })}${
                    sum ? `, ${sum}` : ", empty"
                  }`}
                  onMouseEnter={() => onHover({ row: r, col: c })}
                  onClick={() => onSelect({ row: r, col: c })}
                  className={[
                    "rounded-full border transition",
                    filled
                      ? "border-transparent"
                      : "border-slate-200 bg-slate-50 hover:border-accent-blue/50",
                    isSel
                      ? "ring-2 ring-accent-blue"
                      : isHov
                        ? "ring-2 ring-accent-purple/70"
                        : isVoice
                          ? "ring-2 ring-accent-green"
                          : "",
                  ].join(" ")}
                  style={{
                    width: cell,
                    height: cell,
                    backgroundImage: filled
                      ? "linear-gradient(135deg,#10b981,#3b82f6,#8b5cf6)"
                      : undefined,
                  }}
                />
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
