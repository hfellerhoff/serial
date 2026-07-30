type ExtensionHeaderProps = {
  title: string;
  description: string;
};

export function ExtensionHeader({ title, description }: ExtensionHeaderProps) {
  return (
    <header className="flex items-center gap-3">
      <img className="size-12 rounded-xl" src="/icon/128.png" alt="" />
      <div className="min-w-0">
        <h1 className="truncate text-lg font-semibold">{title}</h1>
        <p className="text-muted-foreground truncate text-sm">{description}</p>
      </div>
    </header>
  );
}
