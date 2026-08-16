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
    <div className={cn("glass flex h-full flex-col p-6", className)}>
      {(title || action) && (
        <div className="mb-5 flex items-center justify-between gap-2">
          {title && (
            <h3 className="font-heading text-[17px] font-bold tracking-tight text-foreground">
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
