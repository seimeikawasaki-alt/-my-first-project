interface PlaceholderPageProps {
  title: string;
  phase: string;
}

export default function PlaceholderPage({ title, phase }: PlaceholderPageProps) {
  return (
    <div className="p-8 flex items-center justify-center min-h-96">
      <div className="text-center">
        <div className="text-5xl mb-4">🚧</div>
        <h1 className="text-heading font-bold text-text mb-2">{title}</h1>
        <p className="text-subtext">{phase} で実装予定です</p>
      </div>
    </div>
  );
}
