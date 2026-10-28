"use client";

import { useEffect, useRef } from "react";
import { level } from "@/lib/voice";

/** Ivy's animated orb. Static unless `animated`; with `getLevel`, it also swells as she speaks. */
export function IvyOrb({
  size = 36,
  animated = true,
  getLevel,
}: {
  size?: number;
  animated?: boolean;
  getLevel?: () => AnalyserNode | null;
}) {
  const img = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!getLevel) return;
    let raf = 0;
    let v = 0;
    const tick = () => {
      // Smooth so the orb breathes instead of flickering.
      v = v * 0.75 + level(getLevel()) * 0.25;
      if (img.current) img.current.style.transform = `scale(${1 + v * 0.25})`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [getLevel]);

  return (
    // eslint-disable-next-line @next/next/no-img-element -- animated WebP; next/image would re-encode it
    <img
      ref={img}
      src={animated ? "/ivy-orb.webp" : "/ivy-orb-still.png"}
      alt="Ivy"
      width={size}
      height={size}
      className="shrink-0 rounded-full transition-transform duration-75"
      style={{ width: size, height: size }}
    />
  );
}

export function StudentAvatar({ name, size = 28 }: { name: string; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-ivy-600 text-xs font-semibold text-white"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {name[0]?.toUpperCase() || "A"}
    </span>
  );
}
