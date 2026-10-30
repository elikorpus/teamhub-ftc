import { useMemo, useState } from 'react';
import { Check, Pencil, Users, X } from 'lucide-react';
import { Form, IconButton, Input, cn } from '@teamhub/ui';
import { isModuleEnabled } from './runtime';
import { useSession } from './session';

/** Who (a) the viewer is relative to an item: used for "Only you and mentors" style notes. */
export function useIsMine(createdBy: string | null | undefined): boolean {
  const { me } = useSession();
  return !!me && me.id === createdBy;
}

export function NoAccess({ what = 'this page' }: { what?: string }) {
  return (
    <div className="grid min-h-[50vh] place-items-center p-8 text-center">
      <div>
        <Users className="mx-auto mb-3 size-8 text-faint" />
        <p className="font-semibold">You don't have access to {what}</p>
        <p className="mt-1 text-[13px] text-muted">Ask a mentor or admin if you think you should.</p>
      </div>
    </div>
  );
}

export function InlineEditText({ value, onSave, className, label }: { value: string; onSave: (v: string) => Promise<void> | void; className?: string; label: string }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value);
  if (!editing)
    return (
      <button type="button" className={cn('group inline-flex items-center gap-1.5 text-left', className)} onClick={() => { setV(value); setEditing(true); }} aria-label={`Edit ${label}`}>
        {value || <span className="text-faint">Not set</span>}
        <Pencil className="size-3 text-faint opacity-0 group-hover:opacity-100" />
      </button>
    );
  return (
    <Form
      className="flex items-center gap-1.5"
      onSubmit={async (e) => {
        e.preventDefault();
        await onSave(v);
        setEditing(false);
      }}
    >
      <Input autoFocus value={v} onChange={(e) => setV(e.target.value)} aria-label={label} className="h-8" />
      <IconButton type="submit" label="Save" size="sm" variant="primary">
        <Check className="size-4" />
      </IconButton>
      <IconButton label="Cancel" size="sm" onClick={() => setEditing(false)}>
        <X className="size-4" />
      </IconButton>
    </Form>
  );
}

/** Group an array by key, preserving order. */
export function groupBy<T, K extends string | number>(items: T[], key: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const it of items) {
    const k = key(it);
    const arr = m.get(k);
    if (arr) arr.push(it);
    else m.set(k, [it]);
  }
  return m;
}

export function useModuleEnabled(id: string): boolean {
  return useMemo(() => isModuleEnabled(id), [id]);
}
