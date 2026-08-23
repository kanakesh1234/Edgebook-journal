"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";
import { ChevronDownIcon } from "./icons";

const controlBase =
  "w-full rounded-control border border-line bg-raised px-3.5 py-2.5 text-[15px] text-ink placeholder:text-faint " +
  "transition-[border-color,box-shadow] duration-200 hover:border-line-strong " +
  "focus:border-gold/60 focus:outline-none focus:ring-4 focus:ring-gold/10";

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="flex items-baseline justify-between text-[13px] font-medium text-muted">
        <span>{label}</span>
        {hint && !error ? <span className="text-[11px] font-normal text-faint">{hint}</span> : null}
        {error ? (
          <span role="alert" className="text-[11px] font-normal text-loss">
            {error}
          </span>
        ) : null}
      </label>
      {children}
    </div>
  );
}

export function TextInput({
  invalid,
  className,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "ref"> & {
  invalid?: boolean;
  ref?: React.Ref<HTMLInputElement>;
}) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(controlBase, invalid && "border-loss/50 focus:border-loss focus:ring-loss/10", className)}
      {...props}
    />
  );
}

export function TextArea({
  invalid,
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={cn(
        controlBase,
        "min-h-28 resize-y leading-relaxed",
        invalid && "border-loss/50 focus:border-loss focus:ring-loss/10",
        className,
      )}
      {...props}
    />
  );
}

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        className={cn(controlBase, "cursor-pointer appearance-none pr-9", className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
    </div>
  );
}

/** Labelled composition of the above for common form use. */
export function TextField({
  label,
  hint,
  error,
  className,
  inputClassName,
  ...inputProps
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
  inputClassName?: string;
}) {
  const autoId = useId();
  const id = inputProps.id ?? autoId;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id} className={className}>
      <TextInput id={id} invalid={!!error} className={inputClassName} {...inputProps} />
    </Field>
  );
}
