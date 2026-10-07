"use client";
import { useEffect, useRef } from "react";

/** Scoring owns the visible viewport; restore normal page scrolling on exit. */
export function useScoringViewport(active: boolean) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!active) return;
    const root = document.documentElement, body = document.body;
    const scrollX = window.scrollX, scrollY = window.scrollY;
    const rootKeys = ["overflow", "overscrollBehavior"] as const;
    const bodyKeys = ["position", "top", "left", "width", "height", "minHeight", "overflow", "overscrollBehavior"] as const;
    const rootBefore = rootKeys.map(key => root.style[key]);
    const bodyBefore = bodyKeys.map(key => body.style[key]);
    root.style.overflow = "hidden"; root.style.overscrollBehavior = "none";
    Object.assign(body.style, {position:"fixed",top:-scrollY+"px",left:-scrollX+"px",
      width:"100%",height:"100%",minHeight:"0",overflow:"hidden",overscrollBehavior:"none"});
    let frame = 0;
    const update = () => {
      const viewport = window.visualViewport, element = ref.current;
      if (!element) return;
      element.style.setProperty("--scoring-height", (viewport?.height ?? window.innerHeight)+"px");
      element.style.setProperty("--scoring-width", (viewport?.width ?? window.innerWidth)+"px");
      element.style.setProperty("--scoring-top", (viewport?.offsetTop ?? 0)+"px");
      element.style.setProperty("--scoring-left", (viewport?.offsetLeft ?? 0)+"px");
    };
    const schedule = () => { cancelAnimationFrame(frame); frame=requestAnimationFrame(update); };
    update();
    window.addEventListener("resize",schedule);
    window.visualViewport?.addEventListener("resize",schedule);
    window.visualViewport?.addEventListener("scroll",schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize",schedule);
      window.visualViewport?.removeEventListener("resize",schedule);
      window.visualViewport?.removeEventListener("scroll",schedule);
      rootKeys.forEach((key,index)=>{root.style[key]=rootBefore[index];});
      bodyKeys.forEach((key,index)=>{body.style[key]=bodyBefore[index];});
      window.scrollTo(scrollX,scrollY);
    };
  }, [active]);
  return ref;
}
