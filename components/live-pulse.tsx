import { cn } from "@/lib/utils";

interface LivePulseProps {
  className?: string;
  color?: "emerald" | "amber" | "rose";
  size?: "sm" | "md" | "lg";
}

const colorMap = {
  emerald: { dot: "bg-emerald-500", ring: "bg-emerald-500/60" },
  amber: { dot: "bg-amber-500", ring: "bg-amber-500/60" },
  rose: { dot: "bg-rose-500", ring: "bg-rose-500/60" },
};

const sizeMap = {
  sm: "h-1.5 w-1.5",
  md: "h-2.5 w-2.5",
  lg: "h-3 w-3",
};

export function LivePulse({
  className,
  color = "emerald",
  size = "md",
}: LivePulseProps) {
  const c = colorMap[color];
  return (
    <span
      className={cn(
        "relative inline-flex items-center justify-center",
        sizeMap[size],
        className,
      )}
      aria-hidden
    >
      <span
        className={cn(
          "absolute inline-flex h-full w-full rounded-full animate-pulse-ring",
          c.ring,
        )}
      />
      <span
        className={cn(
          "relative inline-flex h-full w-full rounded-full ring-2 ring-white/70 shadow-sm",
          c.dot,
        )}
      />
    </span>
  );
}
