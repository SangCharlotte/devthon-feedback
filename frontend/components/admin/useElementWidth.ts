"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Track an element's width so charts draw at real pixel size. Scaling one fixed
 * SVG with viewBox would make axis text unreadably small on a phone.
 */
export function useElementWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.round(entry.contentRect.width) || fallback);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [fallback]);

  return [ref, width] as const;
}
