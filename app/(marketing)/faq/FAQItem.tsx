"use client";

import { useState } from "react";

export function FAQItem({ q, a, first }: { q: string; a: string; first: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="px-6 py-5"
      style={{ borderTop: first ? "none" : "1px solid rgba(255,255,255,0.08)" }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-4 text-left"
        aria-expanded={open}
      >
        <h2 className="text-sm font-semibold text-white">{q}</h2>
        <span
          className="flex-shrink-0 text-neutral-400 transition-transform duration-200"
          style={{ transform: open ? "rotate(45deg)" : "rotate(0deg)" }}
          aria-hidden
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        </span>
      </button>

      {open && (
        <p className="mt-3 text-sm leading-relaxed text-neutral-300">{a}</p>
      )}
    </div>
  );
}
