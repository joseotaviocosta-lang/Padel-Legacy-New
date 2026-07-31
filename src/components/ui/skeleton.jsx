import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }) {
  return (
    <div
      className={cn("relative overflow-hidden rounded-md bg-secondary/60", className)}
      {...props}
    >
      <div className="absolute inset-0 shimmer" />
    </div>
  );
}

export { Skeleton }