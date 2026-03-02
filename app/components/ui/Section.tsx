import { ReactNode } from "react";

export default function Section({
  children,
  glow = true,
  glowSide = "left",
}: {
  children: ReactNode;
  glow?: boolean;
  glowSide?: "left" | "right";
}) {
  const sideClass =
    glowSide === "left"
      ? "left-[-220px] md:left-[-160px]"
      : "right-[-220px] md:right-[-160px]";

  return (
    <section className="relative py-20">
      {glow && (
        <>
          {/* Main glow */}
          <div
            className={`pointer-events-none absolute top-[-220px] ${sideClass} h-[620px] w-[620px] rounded-full blur-3xl opacity-45`}
            style={{ backgroundColor: "var(--brandGlow)" }}
          />

          {/* Secondary glow for depth */}
          <div
            className="pointer-events-none absolute bottom-[-260px] left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full blur-3xl opacity-25"
            style={{ backgroundColor: "var(--brandSoft)" }}
          />
        </>
      )}

      <div className="relative mx-auto max-w-6xl px-6">{children}</div>
    </section>
  );
}
