import { createContext, forwardRef, isValidElement, useContext, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ChangeEvent, type FormEvent, type FormHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Check, Command, Info, AlertTriangle, XCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from './cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft' | 'quiet' | 'success';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover shadow-sm',
  secondary: 'bg-surface text-fg border border-border hover:bg-bg-subtle shadow-sm',
  ghost: 'text-fg hover:bg-bg-subtle',
  quiet: 'text-muted hover:text-fg hover:bg-bg-subtle',
  soft: 'bg-accent-soft text-accent hover:brightness-95',
  danger: 'bg-danger text-white hover:brightness-110 shadow-sm',
  /** A finished step ("Database updated"). The page background color keeps the text readable on both greens. */
  success: 'bg-success text-bg hover:brightness-105 shadow-sm',
};
const sizes: Record<Size, string> = {
  sm: 'h-8 text-[13px] gap-1.5',
  md: 'h-9 text-sm gap-2',
  lg: 'h-11 text-[15px] gap-2',
};
// Padding is separate so a caller's px-… (icon buttons use px-0) actually applies: cn() doesn't merge classes, and
// with both present the stylesheet order decided, which squeezed icons to 8px.
const padding: Record<Size, string> = { sm: 'px-2.5', md: 'px-3.5', lg: 'px-5' };

/**
 * Tracks a handler's promise so a control can show it's working. `run(value, result)` stores `value` (what the control
 * should show meanwhile) until `result` settles; plain (non-promise) results are ignored. Errors still reach the caller.
 */
export function usePending<T = true>(): [T | undefined, (value: T, result: unknown) => void] {
  const [pending, setPending] = useState<T | undefined>(undefined);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const run = (value: T, result: unknown) => {
    if (!result || typeof (result as PromiseLike<unknown>).then !== 'function') return;
    setPending(() => value);
    const done = () => alive.current && setPending(undefined);
    (result as PromiseLike<unknown>).then(done, (e: unknown) => {
      done();
      throw e;
    });
  };
  return [pending, run];
}

const FormBusy = createContext(false);

/** A `<form>` whose async onSubmit shows the spinner on its submit button until it finishes. */
export const Form = forwardRef<HTMLFormElement, Omit<FormHTMLAttributes<HTMLFormElement>, 'onSubmit'> & { onSubmit?: (e: FormEvent<HTMLFormElement>) => void | Promise<unknown> }>(
  function Form({ onSubmit, ...rest }, ref) {
    const [busy, run] = usePending();
    return (
      <FormBusy.Provider value={!!busy}>
        <form
          ref={ref}
          onSubmit={(e) => {
            if (busy) return e.preventDefault();
            run(true, onSubmit?.(e));
          }}
          {...rest}
        />
      </FormBusy.Provider>
    );
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading: loadingProp, icon, className, children, disabled, type = 'button', onClick, ...rest },
  ref,
) {
  // An async onClick shows the spinner (and blocks double taps) until it finishes, so every save button has a
  // loading state without each screen tracking one.
  const [busy, run] = usePending();
  const formBusy = useContext(FormBusy) && type === 'submit';
  const loading = loadingProp || !!busy || formBusy;
  return (
    <button
      ref={ref}
      type={type}
      data-variant={variant}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      onClick={onClick && ((e) => run(true, onClick(e)))}
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium whitespace-nowrap transition-colors duration-150 disabled:opacity-50 select-none [&_svg]:shrink-0',
        variants[variant],
        sizes[size],
        !/(^|\s)px-/.test(className ?? '') && padding[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

/**
 * An unstyled `<button>` (text links, small icons on cards) whose async onClick shows a spinner until it finishes:
 * an icon is swapped for the spinner, text gets one in front of it.
 */
export const BareButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(function BareButton(
  { className, children, disabled, type = 'button', onClick, ...rest },
  ref,
) {
  const [busy, run] = usePending();
  const spinner = <Loader2 className="inline size-3.5 animate-spin align-[-2px]" aria-hidden />;
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || !!busy}
      aria-busy={busy || undefined}
      onClick={onClick && ((e) => run(true, onClick(e)))}
      className={cn(busy && 'cursor-wait', className)}
      {...rest}
    >
      {busy && isValidElement(children) ? spinner : busy ? <>{spinner} {children}</> : children}
    </button>
  );
});

export const IconButton = forwardRef<HTMLButtonElement, ButtonProps & { label: string }>(function IconButton(
  { label, className, size = 'md', variant = 'ghost', children, ...rest },
  ref,
) {
  return (
    <Button
      ref={ref}
      aria-label={label}
      title={label}
      variant={variant === 'ghost' ? 'quiet' : variant}
      size={size}
      className={cn(size === 'sm' ? 'w-8 px-0' : size === 'lg' ? 'w-11 px-0' : 'w-9 px-0', className)}
      {...rest}
    >
      {children}
    </Button>
  );
});

/** Inputs fill their container unless the caller sets a width (cn() doesn't merge conflicting classes). */
const w = (c?: string) => (c && /(^|\s)(w-|max-w-|flex-1)/.test(c) ? '' : 'w-full');
const field =
  'rounded-md border border-border bg-surface px-3 text-sm text-fg placeholder:text-faint shadow-sm transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-soft disabled:opacity-60 aria-[invalid=true]:border-danger';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(field, w(className), 'h-9', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, rows = 4, ...rest },
  ref,
) {
  return <textarea ref={ref} rows={rows} className={cn(field, w(className), 'py-2 leading-relaxed', className)} {...rest} />;
});

export const Select = forwardRef<
  HTMLSelectElement,
  Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> & { onChange?: (e: ChangeEvent<HTMLSelectElement>) => unknown }
>(function Select({ className, children, onChange, disabled, value, ...rest }, ref) {
  // An async onChange shows the new choice with a spinner in place of the arrow until it's saved.
  const [saving, run] = usePending<string>();
  return (
    <select
      ref={ref}
      className={cn(field, w(className), 'h-9 pr-8 appearance-none bg-no-repeat', className)}
      style={{ backgroundImage: saving !== undefined ? SPINNER : CHEVRON, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.6rem center', backgroundSize: '14px' }}
      disabled={disabled || saving !== undefined}
      aria-busy={saving !== undefined || undefined}
      value={saving ?? value}
      onChange={onChange && ((e) => run(e.target.value, onChange(e)))}
      {...rest}
    >
      {children}
    </select>
  );
});
// Lucide 'chevron-down' (24×24) as a background so the native <select> keeps its accessibility and mobile pickers.
const CHEVRON = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238e8e98' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`;
// Lucide 'loader-circle', spun by SVG animation (a background image can't use CSS animations).
const SPINNER = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238e8e98' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M21 12a9 9 0 1 1-6.219-8.56'%3E%3CanimateTransform attributeName='transform' type='rotate' from='0 12 12' to='360 12 12' dur='0.8s' repeatCount='indefinite'/%3E%3C/path%3E%3C/svg%3E")`;

export function Label({ children, htmlFor, className }: { children: ReactNode; htmlFor?: string; className?: string }) {
  return (
    <label htmlFor={htmlFor} className={cn('block text-[13px] font-medium text-fg', className)}>
      {children}
    </label>
  );
}

/** Label + control + hint/error, consistently spaced. Children receive the generated id via render prop or use `id`. */
export function Field({
  label,
  hint,
  error,
  children,
  className,
  id,
  optional,
  required,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode | ((id: string) => ReactNode);
  className?: string;
  id?: string;
  /** Shows an "Optional" tag next to the label. */
  optional?: boolean;
  /** Checked by validateRequired() (Save buttons, the wizard's Continue): empty = red box and "Please fill this in." */
  required?: boolean;
}) {
  const auto = useId();
  const fid = id ?? auto;
  const ref = useRef<HTMLDivElement>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !required) return;
    const update = (empty: boolean) => {
      setMissing(empty);
      const c = controlOf(el);
      if (empty) c?.setAttribute('aria-invalid', 'true');
      else c?.removeAttribute('aria-invalid');
    };
    const check = (e: Event) => {
      const empty = isEmptyField(el);
      update(empty);
      if (empty) (e as CustomEvent<{ missing: HTMLElement[] }>).detail.missing.push(el);
    };
    const clear = () => !isEmptyField(el) && update(false);
    el.addEventListener('th:check', check);
    el.addEventListener('input', clear);
    el.addEventListener('change', clear);
    return () => {
      el.removeEventListener('th:check', check);
      el.removeEventListener('input', clear);
      el.removeEventListener('change', clear);
    };
  }, [required]);
  const message = error ?? (missing ? 'Please fill this in.' : null);
  return (
    <div ref={ref} data-th-required={required || undefined} className={cn('space-y-1.5', className)}>
      {label && (
        <Label htmlFor={fid}>
          {label}
          {optional && <OptionalTag />}
        </Label>
      )}
      {typeof children === 'function' ? children(fid) : children}
      {message ? (
        <p className="text-[12.5px] text-danger" role="alert">
          {message}
        </p>
      ) : hint ? (
        <p className="text-[12.5px] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

/** The one way to mark a field as optional. */
export function OptionalTag() {
  return <span className="ml-1.5 text-[11.5px] font-normal text-faint">Optional</span>;
}

const controlOf = (el: Element) => el.querySelector<HTMLElement>('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea, select');
const isEmptyField = (el: Element) => {
  const c = controlOf(el) as HTMLInputElement | null;
  return !!c && !c.disabled && !String(c.value ?? '').trim();
};

/**
 * Checks every `<Field required>` in the open dialog (or `root`, or the page): marks empty ones, focuses the first.
 * Call it first in Save handlers: `if (!validateRequired()) return;`
 */
export function validateRequired(root?: ParentNode | null): boolean {
  const dialogs = document.querySelectorAll('[role="dialog"], [role="alertdialog"]');
  const scope: ParentNode = root ?? dialogs[dialogs.length - 1] ?? document;
  const missing: HTMLElement[] = [];
  scope.querySelectorAll('[data-th-required]').forEach((el) => el.dispatchEvent(new CustomEvent('th:check', { detail: { missing } })));
  if (!missing.length) return true;
  missing[0].scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  controlOf(missing[0])?.focus({ preventScroll: true });
  return false;
}

/** Native checkbox, styled (no Radix: keeps the core bundle small). Supports an indeterminate state. */
export function Checkbox({
  checked,
  onChange,
  label,
  disabled,
  id,
  size = 'md',
  className,
}: {
  checked: boolean | 'indeterminate';
  /** Return a promise to show a spinner (and block more taps) until it settles. */
  onChange: (v: boolean) => void | Promise<unknown>;
  label?: ReactNode;
  disabled?: boolean;
  id?: string;
  size?: 'md' | 'lg';
  className?: string;
}) {
  const auto = useId();
  const cid = id ?? auto;
  const [saving, run] = usePending<boolean>();
  // While saving, the box already shows the new value.
  const on = saving !== undefined ? saving : checked === true;
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      {/* The input is an invisible tap target over a drawn box. Safari doesn't stretch an absolutely positioned
          checkbox to fill its box, which left the check mark hanging off a smaller circle on iPhones. */}
      <span className={cn('relative grid shrink-0 place-items-center', size === 'lg' ? 'size-7' : 'size-[18px]')}>
        <input
          id={cid}
          type="checkbox"
          checked={on}
          ref={(el) => {
            if (el) el.indeterminate = saving === undefined && checked === 'indeterminate';
          }}
          disabled={disabled || saving !== undefined}
          aria-busy={saving !== undefined || undefined}
          onChange={(e) => run(e.target.checked, onChange(e.target.checked))}
          className="peer absolute inset-0 z-10 m-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
        <span
          aria-hidden
          className={cn(
            'pointer-events-none grid size-full place-items-center border transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent',
            size === 'lg' ? 'rounded-md' : 'rounded-[5px]',
            on ? 'border-accent bg-accent text-accent-fg' : 'border-border-strong bg-surface text-muted',
            disabled && 'opacity-50',
          )}
        >
          {saving !== undefined ? (
            <Loader2 className={cn('animate-spin', size === 'lg' ? 'size-4' : 'size-3')} strokeWidth={3} />
          ) : on ? (
            <Check className={size === 'lg' ? 'size-5' : 'size-3.5'} strokeWidth={3} />
          ) : null}
        </span>
      </span>
      {label && (
        <label htmlFor={cid} className="cursor-pointer select-none text-sm">
          {label}
        </label>
      )}
    </span>
  );
}

/** Native checkbox with switch styling and role="switch". */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
  description,
}: {
  checked: boolean;
  /** Return a promise to show a spinner (and block more taps) until it settles. */
  onChange: (v: boolean) => void | Promise<unknown>;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  const [saving, run] = usePending<boolean>();
  const on = saving !== undefined ? saving : checked;
  return (
    <div className="flex items-start justify-between gap-4">
      {label && (
        <label htmlFor={id} className="min-w-0">
          <span className="block text-sm font-medium">{label}</span>
          {description && <span className="block text-[12.5px] text-muted">{description}</span>}
        </label>
      )}
      {/* Invisible input over a drawn track, like Checkbox, so the track fills its box on every browser. */}
      <span className="relative inline-flex h-6 w-10 shrink-0">
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={on}
          disabled={disabled || saving !== undefined}
          aria-busy={saving !== undefined || undefined}
          onChange={(e) => run(e.target.checked, onChange(e.target.checked))}
          className="peer absolute inset-0 z-10 m-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
        <span
          aria-hidden
          className={cn(
            'pointer-events-none size-full rounded-full transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent',
            on ? 'bg-accent' : 'bg-border-strong',
            disabled && 'opacity-50',
          )}
        />
        <span aria-hidden className={cn('pointer-events-none absolute left-0.5 top-0.5 grid size-5 place-items-center rounded-full bg-white shadow-sm transition-transform', on && 'translate-x-4')}>
          {saving !== undefined && <Loader2 className="size-3.5 animate-spin text-neutral-500" strokeWidth={3} />}
        </span>
      </span>
    </div>
  );
}

export function Badge({
  children,
  tone = 'neutral',
  className,
  title,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';
  className?: string;
  title?: string;
}) {
  const tones = {
    neutral: 'bg-bg-subtle text-muted border-border',
    accent: 'bg-accent-soft text-accent border-transparent',
    success: 'bg-success-soft text-success border-transparent',
    warning: 'bg-warning-soft text-warning border-transparent',
    danger: 'bg-danger-soft text-danger border-transparent',
    info: 'bg-info-soft text-info border-transparent',
  };
  return (
    <span title={title} className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11.5px] font-medium leading-4 whitespace-nowrap', tones[tone], className)}>
      {children}
    </span>
  );
}

export function Card({ children, className, as: As = 'div', ...rest }: { children: ReactNode; className?: string; as?: any } & Record<string, unknown>) {
  return (
    <As className={cn('rounded-lg border border-border bg-surface shadow-sm', className)} {...rest}>
      {children}
    </As>
  );
}

export function CardHeader({ title, action, subtitle, icon }: { title: ReactNode; action?: ReactNode; subtitle?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-2">
      <div className="min-w-0 flex items-center gap-2">
        {icon && <span className="shrink-0">{icon}</span>}
        <div className="min-w-0">
          <h3 className="truncate text-[13.5px] font-semibold">{title}</h3>
          {subtitle && <p className="truncate text-[12.5px] text-muted">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return (
    <span role="status" aria-label={label} className={cn('inline-flex text-muted', className)}>
      <Loader2 className="size-5 animate-spin" />
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-md bg-bg-subtle', className)} />;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** The platform modifier key: the Command icon on Apple devices, “Ctrl” elsewhere. */
export function ModKey() {
  return isMac ? <Command className="size-3" aria-label="Command" /> : <>Ctrl</>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex h-5 min-w-5 items-center justify-center gap-0.5 rounded border border-border bg-bg-subtle px-1 font-sans text-[11px] text-muted">{children}</kbd>;
}

export function Banner({
  tone = 'info',
  title,
  children,
  action,
  className,
}: {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const Icon = { info: Info, success: CheckCircle2, warning: AlertTriangle, danger: XCircle }[tone];
  const tones = {
    info: 'bg-info-soft text-info',
    success: 'bg-success-soft text-success',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-danger-soft text-danger',
  };
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex items-start gap-3 rounded-md px-3.5 py-2.5', tones[tone], className)}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1 text-[13px] text-fg">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-muted">{children}</div>}
      </div>
      {action}
    </div>
  );
}

/** Pill-style segmented control (view switchers, visibility choice). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = 'md',
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; icon?: ReactNode }[];
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    // Below desktop width, choices that don't fit scroll sideways instead of squeezing their labels onto several lines.
    <div role="radiogroup" className={cn('inline-flex rounded-md border border-border bg-bg-subtle p-0.5 relative max-lg:max-w-full max-lg:overflow-x-auto max-lg:[scrollbar-width:none]', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-[calc(var(--th-radius-md)-2px)] font-medium text-muted transition-colors hover:text-fg max-lg:shrink-0 max-lg:whitespace-nowrap',
            size === 'sm' ? 'h-7 px-2 text-[12.5px]' : 'h-8 px-3 text-[13px]',
            value === o.value && 'bg-accent-soft text-fg shadow-sm ring-1 ring-accent/60',
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…', className, autoFocus }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; autoFocus?: boolean }) {
  return (
    <div className={cn('relative', className)}>
      <svg aria-hidden viewBox="0 0 16 16" className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-faint">
        <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <Input type="search" value={value} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pl-8" aria-label={placeholder} />
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn('border-0 border-t border-border', className)} />;
}

/** Classes for a link styled as a button (e.g. <Link className={buttonClass('primary')}>). */
export function buttonClass(variant: Variant = 'secondary', size: Size = 'md', extra?: string): string {
  return cn(
    'inline-flex items-center justify-center rounded-md font-medium whitespace-nowrap transition-colors duration-150 select-none [&_svg]:shrink-0',
    variants[variant],
    sizes[size],
    !/(^|\s)px-/.test(extra ?? '') && padding[size],
    extra,
  );
}
