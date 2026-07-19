import { cn } from "@/lib/utils";

export function Widget({
  title,
  action,
  className,
  bodyClassName,
  children,
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("glass flex h-full flex-col p-5", className)}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-2">
          {title && (
            <h3 className="font-heading text-sm font-semibold text-foreground">
              {title}
            </h3>
          )}
          {action}
        </div>
      )}
      <div className={cn("flex-1", bodyClassName)}>{children}</div>
    </div>
  );
}
