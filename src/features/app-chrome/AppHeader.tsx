// 상단 제목 막대 (서버 컴포넌트). 높이 56px 이상, 제목 20px 이상.
export function AppHeader({ title }: { title: string }) {
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-surface">
      <div className="mx-auto flex min-h-header w-full max-w-xl items-center px-4">
        <h1 className="text-title font-bold text-ink">{title}</h1>
      </div>
    </header>
  );
}
