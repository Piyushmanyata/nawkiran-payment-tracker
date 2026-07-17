"use client";

import { useEffect, useRef, type ReactNode } from "react";

const focusableSelector =
  'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/** Bottom-sheet on mobile, centered dialog on sm+. Escape + backdrop close. */
export function Modal({
  open,
  titleId,
  title,
  onClose,
  children,
  disableClose = false,
}: {
  open: boolean;
  titleId: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
  disableClose?: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const disableCloseRef = useRef(disableClose);

  useEffect(() => {
    onCloseRef.current = onClose;
    disableCloseRef.current = disableClose;
  });

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const focusable = () =>
      Array.from(dialog?.querySelectorAll<HTMLElement>(focusableSelector) ?? []);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !disableCloseRef.current) onCloseRef.current();
      if (e.key !== "Tab") return;

      const items = focusable();
      if (items.length === 0) {
        e.preventDefault();
        dialog?.focus();
        return;
      }

      const first = items[0];
      const last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    (focusable()[0] ?? dialog)?.focus();

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      previousFocus?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={() => {
        if (!disableClose) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-bold text-slate-900">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
