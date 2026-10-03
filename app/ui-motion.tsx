"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

const clamp = (value: number) => Math.max(0, Math.min(1, value));

/** Content is visible by default; motion is enhanced only after hydration. */
export function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  return <div className={`reveal ${className}`} style={{ "--reveal-delay": `${delay}ms` } as CSSProperties}>{children}</div>;
}

export function MotionSurface({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const hero = root.querySelector<HTMLElement>(".hero");
    const nav = root.querySelector<HTMLElement>(".nav");
    const progress = root.querySelector<HTMLElement>(".scroll-progress span");
    const flow = root.querySelector<HTMLElement>(".execution-flow");
    const flowSteps = Array.from(root.querySelectorAll<HTMLElement>(".execution-flow li"));
    const openSection = root.querySelector<HTMLElement>(".open-section");
    const openMark = root.querySelector<HTMLElement>(".open-mark");
    const revealGroups = [".capability-grid", ".method-steps", ".case-card", ".domain-chips"];
    revealGroups.forEach(selector => {
      const parent = root.querySelector(selector);
      if (!parent) return;
      const items = selector === ".case-card" ? parent.querySelectorAll<HTMLElement>(".case-card-top, .case-outcome, .case-facts > div, .example-evidence-chain, .case-card-bottom") : parent.children;
      Array.from(items).forEach((item, index) => {
        (item as HTMLElement).classList.add("reveal");
        (item as HTMLElement).style.setProperty("--reveal-delay", `${Math.min(index * 90, 630)}ms`);
      });
    });
    root.querySelectorAll(".story-content, .section-heading, .method-main > h2, .case-copy, .research-domains > div:first-child, .open-section > div:nth-child(2), .console-heading, .why-columns > article").forEach(item => item.classList.add("reveal"));

    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-revealed");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -25px 0px" });
    root.querySelectorAll(".reveal").forEach(element => observer.observe(element));
    const visibilityObserver = new IntersectionObserver(entries => entries.forEach(entry => entry.target.classList.toggle("in-view", entry.isIntersecting)), { threshold: 0 });
    root.querySelectorAll(".evidence-map-viewport, .hero").forEach(element => visibilityObserver.observe(element));

    let frame = 0;
    const update = () => {
      frame = 0;
      const height = window.innerHeight;
      const maxScroll = document.documentElement.scrollHeight - height;
      progress?.style.setProperty("transform", `scaleX(${maxScroll > 0 ? clamp(window.scrollY / maxScroll) : 0})`);
      nav?.classList.toggle("is-scrolled", window.scrollY > 48);
      if (hero) {
        const rect = hero.getBoundingClientRect();
        const value = reduced.matches ? 0 : clamp(-rect.top / rect.height);
        hero.style.setProperty("--hero-shift", `${value * -12}px`);
        hero.style.setProperty("--graph-shift", `${value * 18}px`);
        hero.style.setProperty("--graph-scale", `${1 - value * 0.035}`);
        hero.style.setProperty("--graph-opacity", `${1 - value * 0.15}`);
      }
      if (flow) {
        const rect = flow.getBoundingClientRect();
        const value = clamp((height * 0.85 - rect.top) / (height * 0.65 + rect.height * 0.2));
        const active = Math.min(5, Math.floor(value * 6));
        flowSteps.forEach((step, index) => {
          step.classList.toggle("is-active", index === active);
          step.classList.toggle("is-complete", index < active);
        });
      }
      if (openSection && openMark) {
        const rect = openSection.getBoundingClientRect();
        const offset = reduced.matches ? 0 : (clamp((height - rect.top) / (height + rect.height)) - 0.5) * 40;
        openMark.style.setProperty("transform", `translateY(${offset}px)`);
      }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const syncMotion = () => {
      root.classList.toggle("motion-enabled", !reduced.matches);
      if (reduced.matches) root.querySelectorAll(".reveal").forEach(item => item.classList.add("is-revealed"));
      schedule();
    };
    syncMotion();
    const resizeObserver = new ResizeObserver(schedule);
    resizeObserver.observe(root);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    reduced.addEventListener("change", syncMotion);
    const revealOnFocus = (event: FocusEvent) => {
      if (event.target instanceof Element) event.target.closest(".reveal")?.classList.add("is-revealed");
    };
    root.addEventListener("focusin", revealOnFocus);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      visibilityObserver.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      reduced.removeEventListener("change", syncMotion);
      root.removeEventListener("focusin", revealOnFocus);
    };
  }, []);
  return <main ref={rootRef} className="shell"><div className="scroll-progress" aria-hidden="true"><span/></div>{children}</main>;
}

export function TiltCard({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState(false);
  const cardRef = useRef<HTMLButtonElement>(null);
  const frameRef = useRef(0);
  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);
  function reset() {
    cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
    cardRef.current?.style.removeProperty("--tilt-x");
    cardRef.current?.style.removeProperty("--tilt-y");
    cardRef.current?.style.removeProperty("--pointer-x");
    cardRef.current?.style.removeProperty("--pointer-y");
  }
  return <button ref={cardRef} type="button" className={`capability-card${selected ? " is-selected" : ""}`} aria-pressed={selected} onClick={() => setSelected(value => !value)} onPointerLeave={reset} onBlur={reset} onPointerMove={event => {
    if (event.pointerType !== "mouse" || !window.matchMedia("(hover: hover) and (pointer: fine)").matches || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const card = event.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = clamp((event.clientX - rect.left) / rect.width);
    const y = clamp((event.clientY - rect.top) / rect.height);
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      card.style.setProperty("--tilt-x", `${(0.5 - y) * 6}deg`);
      card.style.setProperty("--tilt-y", `${(x - 0.5) * 6}deg`);
      card.style.setProperty("--pointer-x", `${x * 100}%`);
      card.style.setProperty("--pointer-y", `${y * 100}%`);
    });
  }}>{children}</button>;
}

const questions = [
  ["How do agents respond to untrusted page content?", "Controlled experiments record the page content an agent encounters, the browser tools it requests, and the policy decisions those requests receive. Outcomes reflect observed actions, including ignored instructions and blocked requests."],
  ["Which browser actions and network requests followed?", "Playwright records browser navigation and network activity. The attribution and differential engines compare baseline and agent phases so provisioning, pre-action, and ambient events are not treated as agent-caused evidence."],
  ["What process and socket activity was observable?", "Procfs and socket providers sample process and connection activity inside the disposable sandbox. Recorded PID, executable, timing, and destination fields provide system context; missing observations remain visible as limitations."],
  ["Which conclusions have enough evidence to support them?", "The deterministic hypothesis engine evaluates recorded events and linked evidence. Findings can be supported or have insufficient evidence; the case preserves the source events and limitations for review."],
];

export function ResearchQuestions() {
  const [open, setOpen] = useState<number | null>(null);
  return <div className="question-list">{questions.map(([question, answer], index) => <div className={`question-row${open === index ? " is-open" : ""}`} key={question}>
    <h3><button type="button" id={`question-${index}`} aria-expanded={open === index} aria-controls={`answer-${index}`} onClick={() => setOpen(value => value === index ? null : index)}><span className="question-number">{String(index + 1).padStart(2, "0")}</span><span>{question}</span><span className="question-toggle" aria-hidden="true">{open === index ? "×" : "+"}</span></button></h3>
    <div id={`answer-${index}`} role="region" aria-labelledby={`question-${index}`} hidden={open !== index} className="question-answer"><p>{answer}</p></div>
  </div>)}</div>;
}
