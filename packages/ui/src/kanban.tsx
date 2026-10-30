import { useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from './cn';

export interface KanbanColumn<T> {
  id: string;
  title: ReactNode;
  items: T[];
  tone?: string;
}

/**
 * Accessible board: drag & drop with the mouse, or use the per-card menu (`moveTo` buttons rendered by the caller)
 * for keyboard/touch. Drop calls onMove(item, toColumn, index).
 */
export function Kanban<T>({
  columns,
  render,
  keyOf,
  onMove,
  canDrag = true,
  emptyLabel = 'Nothing here',
}: {
  columns: KanbanColumn<T>[];
  render: (item: T) => ReactNode;
  keyOf: (item: T) => string | number;
  /** Return a promise to show a spinner on the moved card until it is saved. */
  onMove?: (item: T, toColumn: string, index: number) => void | Promise<unknown>;
  canDrag?: boolean | ((item: T) => boolean);
  emptyLabel?: string;
}) {
  const [drag, setDrag] = useState<{ key: string | number; from: string } | null>(null);
  const [over, setOver] = useState<{ col: string; index: number } | null>(null);
  const [saving, setSaving] = useState<ReadonlySet<string | number>>(new Set());
  const draggable = (it: T) => (typeof canDrag === 'function' ? canDrag(it) : canDrag) && !!onMove;

  const drop = (col: string) => {
    if (!drag || !over || !onMove) return;
    const src = columns.find((c) => c.id === drag.from)?.items.find((i) => keyOf(i) === drag.key);
    if (src) {
      const result = onMove(src, col, over.index);
      if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
        const k = drag.key;
        const done = () => setSaving((s) => new Set([...s].filter((x) => x !== k)));
        setSaving((s) => new Set(s).add(k));
        (result as PromiseLike<unknown>).then(done, done);
      }
    }
    setDrag(null);
    setOver(null);
  };

  return (
    // Phones: one column fills the screen (with the next one peeking in) and swiping snaps to the next column.
    <div className="flex h-full gap-3 relative overflow-x-auto p-4 sm:px-6 max-sm:snap-x max-sm:snap-mandatory max-sm:scroll-px-4">
      {columns.map((col) => (
        <section
          key={col.id}
          aria-label={typeof col.title === 'string' ? col.title : col.id}
          className={cn('flex w-[290px] shrink-0 flex-col rounded-lg bg-bg-subtle/70 max-sm:w-[calc(100%-2rem)] max-sm:snap-start', over?.col === col.id && 'ring-2 ring-accent-soft')}
          onDragOver={(e) => {
            if (!drag) return;
            e.preventDefault();
            if (over?.col !== col.id) setOver({ col: col.id, index: col.items.length });
          }}
          onDrop={(e) => {
            e.preventDefault();
            drop(col.id);
          }}
        >
          <header className="flex items-center gap-2 px-3 pb-1.5 pt-2.5 text-[12.5px] font-semibold">
            {col.tone && <span className="size-2 rounded-full" style={{ background: col.tone }} />}
            <span className="flex-1 truncate">{col.title}</span>
            <span className="tabular text-faint">{col.items.length}</span>
          </header>
          <ul className="min-h-16 flex-1 space-y-2 relative overflow-y-auto px-2 pb-2">
            {col.items.map((it, idx) => {
              const k = keyOf(it);
              return (
                <li
                  key={k}
                  draggable={draggable(it)}
                  aria-busy={saving.has(k) || undefined}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    setDrag({ key: k, from: col.id });
                  }}
                  onDragEnd={() => {
                    setDrag(null);
                    setOver(null);
                  }}
                  onDragOver={(e) => {
                    if (!drag) return;
                    e.preventDefault();
                    e.stopPropagation();
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    const index = e.clientY < rect.top + rect.height / 2 ? idx : idx + 1;
                    if (over?.col !== col.id || over.index !== index) setOver({ col: col.id, index });
                  }}
                  className={cn(
                    'relative',
                    drag?.key === k && 'opacity-40',
                    over?.col === col.id && over.index === idx && drag?.key !== k && 'before:absolute before:-top-1.5 before:left-1 before:right-1 before:h-0.5 before:rounded before:bg-accent',
                  )}
                >
                  {render(it)}
                  {saving.has(k) && (
                    <Loader2 aria-hidden className="pointer-events-none absolute right-1.5 top-1.5 size-3.5 animate-spin text-muted" />
                  )}
                </li>
              );
            })}
            {!col.items.length && <li className="px-2 py-6 text-center text-[12px] text-faint">{emptyLabel}</li>}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function KanbanCard({ children, onClick, selected, accent }: { children: ReactNode; onClick?: () => void; selected?: boolean; accent?: string }) {
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        'rounded-md border border-border bg-surface p-2.5 text-[13px] shadow-sm transition-shadow hover:shadow-md',
        selected && 'ring-2 ring-accent',
        onClick && 'cursor-pointer',
      )}
      style={accent ? { borderLeft: `3px solid ${accent}` } : undefined}
    >
      {children}
    </div>
  );
}
