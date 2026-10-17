// 아직 만들지 않은 화면의 자리 표시 (U4·U5에서 실제 화면으로 바꾼다)
export function Placeholder({ title, description }: { title: string; description: string }) {
  return (
    <section className="rounded-card bg-surface p-6 shadow-card">
      <h2 className="text-heading font-bold">{title}</h2>
      <p className="mt-2 text-body text-muted">{description}</p>
    </section>
  );
}
