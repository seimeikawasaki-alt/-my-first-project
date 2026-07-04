import { useToastStore, type ToastVariant } from '../../stores/toastStore';

const STYLES: Record<ToastVariant, string> = {
  success: 'bg-green-600',
  error: 'bg-red-600',
  warning: 'bg-amber-500',
  info: 'bg-blue-600',
};

const ICONS: Record<ToastVariant, string> = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
};

/** Top-right stacking toasts. Mount once at the app root. */
export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const remove = useToastStore((s) => s.remove);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-[min(20rem,calc(100vw-2rem))]">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => remove(t.id)}
          className={`${STYLES[t.variant]} text-white rounded-lg shadow-lg px-4 py-3 text-sub flex items-start gap-2 text-left transition-opacity`}
        >
          <span className="mt-0.5 font-bold">{ICONS[t.variant]}</span>
          <span className="flex-1">{t.message}</span>
        </button>
      ))}
    </div>
  );
}
