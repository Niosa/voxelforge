interface Props {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

export function IconButton({ label, active, disabled, onClick }: Props) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={[
        'min-h-11 min-w-11 rounded-xl px-2 text-xs font-medium transition',
        active
          ? 'bg-teal-500/30 text-teal-100 ring-1 ring-teal-400/50'
          : 'bg-white/5 text-slate-200 hover:bg-white/10',
        disabled ? 'cursor-not-allowed opacity-40' : '',
      ].join(' ')}
    >
      {label}
    </button>
  );
}
