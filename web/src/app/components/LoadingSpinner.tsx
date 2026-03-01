"use client";

type LoadingSpinnerProps = {
  /** Show "Loading…" text below the spinner */
  label?: boolean;
  /** Use full-page centered layout (default: true for page-level loading) */
  fullPage?: boolean;
  className?: string;
};

export function LoadingSpinner({ label = true, fullPage = true, className = "" }: LoadingSpinnerProps) {
  const content = (
    <div className={`flex flex-col items-center justify-center gap-3 ${className}`}>
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-stone-200 border-t-amber-600"
        aria-hidden
      />
      {label && <p className="text-sm text-stone-500">Loading…</p>}
    </div>
  );

  if (fullPage) {
    return <div className="flex min-h-[40vh] items-center justify-center p-8">{content}</div>;
  }
  return content;
}
