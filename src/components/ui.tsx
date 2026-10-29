import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Button({
  variant = "primary",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" }) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-sm px-4 text-sm font-medium transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-40",
        variant === "primary" ? "bg-brass text-brass-ink hover:bg-ivory" : "border border-line bg-transparent text-ivory hover:border-brass",
        className,
      )}
      {...props}
    />
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-mist">{label}</span>
      {children}
    </label>
  );
}

const control = "min-h-11 w-full rounded-sm border border-line bg-ink px-3 text-sm text-ivory outline-none focus:border-brass";

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(control, props.className)} />;
}

export function Area(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(control, "min-h-28 py-3", props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(control, props.className)} />;
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("rounded-md border border-line bg-panel p-5", className)}>{children}</section>;
}

export function Kicker({ children }: { children: ReactNode }) {
  return <p className="text-xs font-medium tracking-widest text-brass uppercase">{children}</p>;
}
