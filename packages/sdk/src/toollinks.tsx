import { useState } from 'react';
import { ExternalLink, MessagesSquare } from 'lucide-react';
import { Form, Button, Favicon, Input, Select, cn, hostOf, OptionalTag, safeHref } from '@teamhub/ui';
import { useSlotLinks, useToolLink, type LinkRow } from './hooks';
import { TOOL_SLOT_LABELS } from './slots';
import { TeamScopePicker } from './teams';

// ── Tool links (spec §10.6) ────────────────────────────────────────────────
/** Small favicon chips of the team's tool links for the given slots ("Quick links" in a tab header). */
export function ToolLinks({ slots, className, label = 'Quick links' }: { slots: string[]; className?: string; label?: string }) {
  const shown = useSlotLinks(slots);
  if (!shown.length) return null;
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)} aria-label={label}>
      {shown.map((l) => (
        <a
          key={l.id}
          href={safeHref(l.url)}
          target="_blank"
          rel="noreferrer noopener"
          title={`${l.label} (${hostOf(l.url)})`}
          className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 text-[12px] font-medium text-fg shadow-sm hover:bg-bg-subtle"
        >
          <Favicon url={l.url} size={14} /> {l.label}
        </a>
      ))}
    </div>
  );
}

/** "Questions? Ask in Team chat ↗": the answer to "can we chat in TeamHub?" (spec §1.4). */
export function TeamChatLink({ prefix = 'Questions? Ask in', className }: { prefix?: string; className?: string }) {
  const chat = useToolLink('team_chat');
  if (!chat) return null;
  return (
    <p className={cn('flex items-center gap-1.5 text-[12.5px] text-muted', className)}>
      <MessagesSquare className="size-3.5" /> {prefix}{' '}
      <a href={safeHref(chat.url)} target="_blank" rel="noreferrer noopener" className="font-medium text-accent hover:underline">
        {chat.label} <ExternalLink className="inline size-3" aria-hidden />
      </a>
    </p>
  );
}

// ── Link editor (the Links page) ───────────────────────────────────────────
/**
 * Add or edit a link. A kind (Team chat, Onshape, Other…) makes it a team tool: it shows on Home, and as a quick link
 * in the tabs that use that kind. Without one it shows only on the Links page. Only people who can manage all links
 * (core.edit_links) choose a kind.
 */
export function LinkEditor({
  initial,
  onSave,
  onCancel,
  canSetKind,
  sections = [],
}: {
  initial?: Partial<LinkRow>;
  onSave: (v: Pick<LinkRow, 'label' | 'url' | 'description' | 'section' | 'slot' | 'team_id'>) => Promise<void> | void;
  onCancel: () => void;
  canSetKind?: boolean;
  sections?: string[];
}) {
  const [v, setV] = useState({
    label: initial?.label ?? '',
    url: initial?.url ?? '',
    description: initial?.description ?? '',
    section: initial?.section ?? '',
    slot: initial?.slot ?? '',
    team_id: initial?.team_id ?? null,
  });
  const [busy, setBusy] = useState(false);
  return (
    <Form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          // Without core.edit_links the kind can't change (the database also refuses one).
          await onSave({ ...v, description: v.description || null, section: v.section.trim() || null, slot: canSetKind ? v.slot || null : (initial?.slot ?? null) });
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="block text-[13px] font-medium">Label</span>
          <Input required maxLength={80} value={v.label} onChange={(e) => setV({ ...v, label: e.target.value })} />
        </label>
        <label className="space-y-1.5">
          <span className="block text-[13px] font-medium">URL</span>
          <Input required type="url" pattern="https?://.*" placeholder="https://" value={v.url} onChange={(e) => setV({ ...v, url: e.target.value })} />
        </label>
      </div>
      <label className="block space-y-1.5">
        <span className="block text-[13px] font-medium">
          Description <OptionalTag />
        </span>
        <Input maxLength={300} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
      </label>
      <label className="block space-y-1.5">
        <span className="block text-[13px] font-medium">
          Section <OptionalTag />
        </span>
        <Input list="th-link-sections" maxLength={60} value={v.section} placeholder="e.g. Programming" onChange={(e) => setV({ ...v, section: e.target.value })} />
        <datalist id="th-link-sections">
          {sections.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </label>
      {canSetKind && (
        <label className="block space-y-1.5">
          <span className="block text-[13px] font-medium">Team tool</span>
          <Select value={v.slot} onChange={(e) => setV({ ...v, slot: e.target.value })}>
            <option value="">Not a team tool (only on the Links page)</option>
            {Object.entries(TOOL_SLOT_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                {k === 'other' ? 'Other team tool (on Home, not in tabs)' : l}
              </option>
            ))}
          </Select>
          <span className="block text-[12px] text-muted">Team tools show in Team tools on Home. Most kinds also show as quick links in the tabs that use them, like Onshape in the Notebook.</span>
        </label>
      )}
      <TeamScopePicker value={v.team_id} onChange={(team_id) => setV({ ...v, team_id })} perm={canSetKind ? 'core.edit_links' : 'core.add_links'} />
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary" loading={busy}>
          Save link
        </Button>
      </div>
    </Form>
  );
}

export { TOOL_SLOT_LABELS } from './slots';
