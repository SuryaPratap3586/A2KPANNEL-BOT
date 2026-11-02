"use client";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

// Submit button for admin forms: disabled with ⏳ while the action runs (no double clicks), ✓ for a moment when it finished.
// Errors are shown by admin/error.tsx.
export default function Btn({
  children,
  className = "btn",
  disabled,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { pending } = useFormStatus();
  const was = useRef(false);
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const finished = was.current && !pending;
    was.current = pending;
    if (!finished) return;
    setOk(true);
    const t = setTimeout(() => setOk(false), 2500);
    return () => clearTimeout(t);
  }, [pending]);
  return (
    <button
      {...rest}
      className={className + (pending ? " opacity-60 cursor-wait" : "")}
      disabled={pending || disabled}
      aria-busy={pending}
    >
      {pending ? "⏳ " : ok ? "✓ " : ""}
      {children}
    </button>
  );
}
