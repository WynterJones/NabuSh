export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-[var(--rule)] bg-[var(--surface)] px-5 py-3.5">
      <div className="min-w-0 flex-1">
        <h1 className="text-[17px] font-semibold leading-tight tracking-tight">{title}</h1>
        {subtitle && (
          <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--ink-3)] text-pretty">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </header>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="grid place-items-center px-6 py-16">
      <div className="max-w-[440px] text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-[12px] bg-[var(--surface-2)] text-[var(--ink-3)]">
          {icon}
        </span>
        <h2 className="mt-4 text-[17px] font-semibold tracking-tight text-balance">{title}</h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--ink-2)] text-pretty">{body}</p>
        {action && <div className="mt-5 flex justify-center">{action}</div>}
      </div>
    </div>
  );
}
