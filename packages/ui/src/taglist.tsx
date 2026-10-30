import { useState, type ReactNode } from 'react';
import { Plus, X } from 'lucide-react';
import { cn } from './cn';
import { BareButton, Button, Input } from './primitives';

/**
 * Edit a short list of words (sizes, platforms, answer choices…): each item is a tag with a remove button, plus a
 * box and an Add button for the next one. Pasting "S, M, L" adds three tags. Duplicates are ignored.
 */
export function TagListInput({
  value,
  onChange,
  label,
  placeholder = 'Type one, then Add',
  max = 50,
  maxLength = 60,
  className,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  /** What one item is, for screen readers and the remove buttons ("Size", "Platform"…). */
  label: string;
  placeholder?: string;
  max?: number;
  maxLength?: number;
  className?: string;
}) {
  const [draft, setDraft] = useState('');
  const add = (text: string) => {
    const next = [...value];
    for (const part of text.split(/[,\n]/)) {
      const t = part.trim().slice(0, maxLength);
      if (t && next.length < max && !next.some((x) => x.toLowerCase() === t.toLowerCase())) next.push(t);
    }
    if (next.length !== value.length) onChange(next);
    setDraft('');
  };
  return (
    <div className={cn('space-y-2', className)}>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={`${label} list`}>
          {value.map((v) => (
            <li key={v}>
              <RemovableTag label={v} onRemove={() => onChange(value.filter((x) => x !== v))} />
            </li>
          ))}
        </ul>
      )}
      {value.length < max && (
        <div className="flex gap-2">
          <Input
            aria-label={`Add ${label.toLowerCase()}`}
            value={draft}
            maxLength={maxLength * 4}
            placeholder={placeholder}
            onChange={(e) => (/[,\n]/.test(e.target.value) ? add(e.target.value) : setDraft(e.target.value))}
            onPaste={(e) => {
              const text = e.clipboardData.getData('text');
              if (/[,\n]/.test(text)) {
                e.preventDefault();
                add(draft + text);
              }
            }}
            onBlur={() => draft.trim() && add(draft)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add(draft);
              }
            }}
          />
          <Button type="button" icon={<Plus className="size-4" />} onClick={() => add(draft)} disabled={!draft.trim()}>
            Add
          </Button>
        </div>
      )}
      <PendingAddHint text={draft} />
    </div>
  );
}

/** A tag with a remove button (subteams, email domains, sizes…). */
export function RemovableTag({ label, onRemove, removeLabel }: { label: ReactNode; onRemove: () => void | Promise<unknown>; removeLabel?: string }) {
  return (
    <span className="inline-flex h-8 items-center gap-1 rounded-full border border-border bg-bg-subtle pl-3 pr-1 text-[13px]">
      {label}
      <BareButton
        aria-label={removeLabel ?? `Remove ${typeof label === 'string' ? label : 'item'}`}
        onClick={onRemove}
        className="grid size-6 place-items-center rounded-full text-muted transition-colors hover:bg-bg hover:text-fg"
      >
        <X className="size-4" />
      </BareButton>
    </span>
  );
}

/** Shown under a "type, then Add" box while something is typed but not added yet. */
export function PendingAddHint({ text }: { text: string }) {
  if (!text.trim()) return null;
  return <p className="text-[12px] text-muted">Press Enter or click Add to add “{text.trim()}”. It’s also added when you click away.</p>;
}

/** onBlur for a "type, then Add" box inside a form: adds what was typed instead of silently dropping it. */
export const submitOnBlur = (e: { currentTarget: HTMLInputElement }) => {
  if (e.currentTarget.value.trim()) e.currentTarget.form?.requestSubmit();
};
