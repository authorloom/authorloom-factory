"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

const defaultClassName =
  "inline-flex min-h-10 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800 active:translate-y-px active:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-500 disabled:active:translate-y-0";

type SubmitButtonProps = {
  children: ReactNode;
  pendingLabel?: string;
  savedLabel?: string;
  disabled?: boolean;
  className?: string;
};

export function SubmitButton({
  children,
  pendingLabel = "Saving...",
  savedLabel = "Saved",
  disabled = false,
  className = defaultClassName,
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const wasPending = useRef(false);
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    if (pending) {
      wasPending.current = true;
      return;
    }

    if (!wasPending.current) {
      return;
    }

    wasPending.current = false;
    const showTimeout = window.setTimeout(() => setShowSaved(true), 0);
    const hideTimeout = window.setTimeout(() => setShowSaved(false), 1400);

    return () => {
      window.clearTimeout(showTimeout);
      window.clearTimeout(hideTimeout);
    };
  }, [pending]);

  useEffect(() => {
    const form = buttonRef.current?.form;

    if (!form) {
      return;
    }

    function resetSavedState() {
      setShowSaved(false);
    }

    form.addEventListener("input", resetSavedState);
    form.addEventListener("change", resetSavedState);

    return () => {
      form.removeEventListener("input", resetSavedState);
      form.removeEventListener("change", resetSavedState);
    };
  }, []);

  return (
    <button
      ref={buttonRef}
      type="submit"
      disabled={disabled || pending}
      className={className}
      aria-live="polite"
      onPointerDown={() => setShowSaved(false)}
    >
      {pending ? pendingLabel : showSaved ? savedLabel : children}
    </button>
  );
}
