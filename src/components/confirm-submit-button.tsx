"use client";

import { useRef } from "react";
import type { MouseEvent, ReactNode } from "react";

import { SubmitButton } from "@/components/submit-button";

type ConfirmSubmitButtonProps = {
  children: ReactNode;
  confirmWhenCheckedName: string;
  confirmMessage: string;
  disabled?: boolean;
  pendingLabel?: string;
  savedLabel?: string;
  className?: string;
};

export function ConfirmSubmitButton({
  children,
  confirmWhenCheckedName,
  confirmMessage,
  disabled,
  pendingLabel,
  savedLabel,
  className,
}: ConfirmSubmitButtonProps) {
  const wrapperRef = useRef<HTMLSpanElement>(null);

  function handleClick(event: MouseEvent<HTMLSpanElement>) {
    const form = wrapperRef.current?.closest("form");
    const checkbox = form?.elements.namedItem(confirmWhenCheckedName);
    const shouldConfirm =
      checkbox instanceof HTMLInputElement &&
      checkbox.type === "checkbox" &&
      checkbox.checked;

    if (shouldConfirm && !window.confirm(confirmMessage)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  return (
    <span ref={wrapperRef} onClickCapture={handleClick}>
      <SubmitButton
        disabled={disabled}
        pendingLabel={pendingLabel}
        savedLabel={savedLabel}
        className={className}
      >
        {children}
      </SubmitButton>
    </span>
  );
}
