import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ClipboardPen, Plus, Trash2, UserMinus, UserPlus, X } from 'lucide-react';
import { BareButton,
  Avatar,
  Button,
  Dialog,
  EmptyState,
  Field,
  IconButton,
  Input,
  ListRow,
  SmartGroupList,
  Spinner,
  StatusPill,
  Textarea,
  formatDate,
  formatTime,
  toDateTimeInput,
  toast,
  useConfirm,
  validateRequired,
} from '@teamhub/ui';
import {
  canWith,
  EntityLink,
  friendlyError,
  ModuleHeader,
  ModulePurpose,
  PersonPicker,
  ScopeVisibility,
  TeamBadge,
  TeamScopePicker,
  useCan,
  useCreateShortcut,
  useMe,
  useNewParam,
  usePeople,
  useSelectedParam,
  useSupabase,
  useTeamScope,
} from '@teamhub/sdk';
import { type Sheet, type SlotRow, type Claim, isOpen, useSheets, useSlots, useClaims } from './data';
export * from './data';

export default function SignupsRoutes() {
  const sheets = useSheets();
  const slots = useSlots();
  const claims = useClaims();
  const scope = useTeamScope();
  const me = useMe();
  const canCreate = useCan('signups.create');
  const [creating, setCreating, params] = useNewParam();
  const [selected, setSelected] = useSelectedParam();
  useCreateShortcut(() => setCreating(true), canCreate);
  const list = (sheets.data ?? []).filter((s) => !scope || !s.team_id || s.team_id === scope);
  const stats = (s: Sheet) => {
    const sl = (slots.data ?? []).filter((x) => x.sheet_id === s.id);
    const ids = new Set(sl.map((x) => x.id));
    const cl = (claims.data ?? []).filter((c) => ids.has(c.slot_id));
    return { cap: sl.reduce((n, x) => n + x.capacity, 0), taken: cl.length, mine: cl.some((c) => c.user_id === me.id) };
  };
  const current = list.find((s) => s.id === selected) ?? null;
  return (
    <div>
      <ModuleHeader moduleId="signups" actions={canCreate && <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>New sheet</Button>} />
      <div className="mx-auto max-w-3xl px-4 py-5 sm:px-6">
        {sheets.isLoading ? (
          <Spinner />
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <SmartGroupList
              groups={[
                { id: 'open', title: 'Open', items: list.filter(isOpen) },
                { id: 'closed', title: 'Closed', items: list.filter((s) => !isOpen(s)), collapsed: true },
              ]}
              keyOf={(s) => s.id}
              empty={<EmptyState icon={<ClipboardPen />} title="No sign-up sheets" body={<ModulePurpose moduleId="signups" compact className="mt-2 text-left" />} />}
              render={(s) => {
                const st = stats(s);
                return (
                  <ListRow onClick={() => setSelected(s.id)}>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-medium">{s.title}</p>
                      <p className="flex flex-wrap items-center gap-x-2 text-[12px] text-muted">
                        <TeamBadge teamId={s.team_id} />
                        {s.closes_at && isOpen(s) && <span>closes {formatDate(s.closes_at)}</span>}
                      </p>
                    </div>
                    {st.mine && <StatusPill label="You're signed up" tone="success" />}
                    <span className="w-24 text-right text-[12px] text-muted">
                      <span className="tabular">{st.taken}/{st.cap}</span> filled
                      <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-bg-subtle">
                        <span className="block h-full rounded-full bg-success" style={{ width: `${st.cap ? Math.min(100, (st.taken / st.cap) * 100) : 0}%` }} />
                      </span>
                    </span>
                  </ListRow>
                );
              }}
            />
          </div>
        )}
      </div>
      {creating && <SheetEditor sheet={null} eventRef={params.get('ref')} title={params.get('title')} onClose={() => setCreating(false)} />}
      {current && <SheetDialog sheet={current} slots={(slots.data ?? []).filter((x) => x.sheet_id === current.id)} claims={claims.data ?? []} onClose={() => setSelected(null)} />}
    </div>
  );
}

function SheetDialog({ sheet: s, slots, claims, onClose }: { sheet: Sheet; slots: SlotRow[]; claims: Claim[]; onClose: () => void }) {
  const sb = useSupabase();
  const me = useMe();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const people = usePeople();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const manage = canWith(me, 'signups.manage_claims', s.team_id) || s.created_by === me.id;
  const canClaim = isOpen(s) && canWith(me, 'signups.claim', s.team_id);
  const refresh = () => qc.invalidateQueries({ queryKey: ['signups'] });
  const claim = async (slot: string, user: string) => {
    const { error } = await sb.from('sign_claims').insert({ slot_id: slot, user_id: user });
    if (error) return toast.error(friendlyError(error));
    refresh();
  };
  const unclaim = async (slot: string, user: string) => {
    const { error } = await sb.from('sign_claims').delete().match({ slot_id: slot, user_id: user });
    if (error) return toast.error(friendlyError(error));
    refresh();
  };
  if (editing) return <SheetEditor sheet={s} slots={slots} onClose={() => setEditing(false)} />;
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={s.title}
      description={s.closes_at ? (isOpen(s) ? `Closes ${new Date(s.closes_at).toLocaleString()}` : 'Closed') : undefined}
      size="lg"
      footer={
        manage && (
          <>
            <Button
              variant="ghost"
              className="mr-auto text-danger"
              icon={<Trash2 className="size-4" />}
              onClick={async () => {
                if (!(await confirm({ title: 'Delete this sheet?', body: 'All sign-ups on it are removed.', danger: true, confirmLabel: 'Delete' }))) return;
                await sb.from('sign_sheets').delete().eq('id', s.id);
                refresh();
                onClose();
              }}
            >
              Delete
            </Button>
            <Button onClick={() => setEditing(true)}>Edit sheet</Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        <ScopeVisibility teamId={s.team_id} suffix="(including who signed up for what)" />
        {s.description && <p className="whitespace-pre-wrap text-[13.5px]">{s.description}</p>}
        {s.event_ref && (
          <p className="text-[13px] text-muted">
            For: <EntityLink refStr={s.event_ref} />
          </p>
        )}
        <ul className="divide-y divide-border rounded-lg border border-border">
          {slots.map((sl) => {
            const who = claims.filter((c) => c.slot_id === sl.id);
            const mine = who.some((c) => c.user_id === me.id);
            const full = who.length >= sl.capacity;
            return (
              <li key={sl.id} className="space-y-2 px-4 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-medium">{sl.label}</p>
                    {sl.starts_at && <p className="text-[12px] text-muted">{formatDate(sl.starts_at, { weekday: 'short', month: 'short', day: 'numeric' })} · {formatTime(new Date(sl.starts_at))}</p>}
                  </div>
                  <span className="tabular text-[12.5px] text-muted">
                    {who.length}/{sl.capacity}
                  </span>
                  {mine ? (
                    <Button size="sm" icon={<UserMinus className="size-4" />} onClick={() => unclaim(sl.id, me.id)} disabled={!isOpen(s) && !manage}>
                      Leave
                    </Button>
                  ) : (
                    canClaim && (
                      <Button size="sm" variant="primary" icon={<UserPlus className="size-4" />} disabled={full} onClick={() => claim(sl.id, me.id)}>
                        {full ? 'Full' : 'Sign up'}
                      </Button>
                    )
                  )}
                </div>
                {(who.length > 0 || manage) && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {who.map((c) => {
                      const p = people.data?.get(c.user_id);
                      return (
                        <span key={c.user_id} className="inline-flex items-center gap-1.5 rounded-full bg-bg-subtle py-0.5 pl-0.5 pr-2 text-[12.5px]">
                          <Avatar name={p?.name ?? '?'} src={p?.avatarUrl} size={20} />
                          {p?.name ?? 'Former member'}
                          {manage && c.user_id !== me.id && (
                            <BareButton
                              aria-label={`Remove ${p?.name ?? 'person'}`}
                              className="text-muted hover:text-fg"
                              onClick={async () => {
                                if (!(await confirm({ title: `Remove ${p?.name ?? 'this person'} from ${sl.label}?`, body: 'They lose their spot, and someone else can take it.', danger: true, confirmLabel: 'Remove' }))) return;
                                await unclaim(sl.id, c.user_id);
                              }}
                            >
                              <X className="size-3" />
                            </BareButton>
                          )}
                        </span>
                      );
                    })}
                    {manage && !full && (adding === sl.id ? (
                      <span className="w-56">
                        <PersonPicker value={[]} teamId={s.team_id} onChange={([id]) => id && (claim(sl.id, id), setAdding(null))} placeholder="Add someone…" />
                      </span>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setAdding(sl.id)}>
                        Add someone
                      </Button>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </Dialog>
  );
}

interface SlotDraft {
  id?: string;
  label: string;
  starts_at: string;
  capacity: number;
}

function SheetEditor({ sheet, slots = [], eventRef, title, onClose }: { sheet: Sheet | null; slots?: SlotRow[]; eventRef?: string | null; title?: string | null; onClose: () => void }) {
  const sb = useSupabase();
  const me = useMe();
  const qc = useQueryClient();
  const scope = useTeamScope();
  const [v, setV] = useState({
    title: sheet?.title ?? title ?? '',
    description: sheet?.description ?? '',
    team_id: sheet ? sheet.team_id : scope,
    closes_at: sheet?.closes_at ? toDateTimeInput(new Date(sheet.closes_at)) : '',
    event_ref: sheet?.event_ref ?? eventRef ?? null,
  });
  const [rows, setRows] = useState<SlotDraft[]>(
    slots.length ? slots.map((s) => ({ id: s.id, label: s.label, starts_at: s.starts_at ? toDateTimeInput(new Date(s.starts_at)) : '', capacity: s.capacity })) : [{ label: '', starts_at: '', capacity: 1 }],
  );
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();
  const save = async () => {
    if (!validateRequired()) return;
    const clean = rows.filter((r) => r.label.trim());
    if (!v.title.trim()) return toast.error('Give the sheet a title');
    if (!clean.length) return toast.error('Add at least one slot');
    // Removing a slot also removes everyone signed up for it.
    const dropping = slots.filter((s) => !clean.some((r) => r.id === s.id)).map((s) => s.id);
    if (dropping.length) {
      const { count } = await sb.from('sign_claims').select('slot_id', { count: 'exact', head: true }).in('slot_id', dropping);
      if (count && !(await confirm({ title: `Remove ${dropping.length === 1 ? 'a slot' : `${dropping.length} slots`} people signed up for?`, body: `${count} sign-up${count === 1 ? '' : 's'} will be removed, and those people lose their spot.`, danger: true, confirmLabel: 'Remove and save' }))) return;
    }
    setBusy(true);
    try {
      const body = { title: v.title.trim(), description: v.description.trim() || null, team_id: v.team_id, closes_at: v.closes_at ? new Date(v.closes_at).toISOString() : null, event_ref: v.event_ref };
      const res = sheet ? await sb.from('sign_sheets').update(body).eq('id', sheet.id).select('id').single() : await sb.from('sign_sheets').insert({ ...body, created_by: me.id }).select('id').single();
      if (res.error) throw res.error;
      const id = res.data.id as string;
      const keep = new Set(clean.filter((r) => r.id).map((r) => r.id));
      const removed = slots.filter((s) => !keep.has(s.id)).map((s) => s.id);
      if (removed.length) {
        const del = await sb.from('sign_slots').delete().in('id', removed);
        if (del.error) throw del.error;
      }
      const up = await sb.from('sign_slots').upsert(
        clean.map((r, i) => ({ ...(r.id ? { id: r.id } : {}), sheet_id: id, label: r.label.trim(), starts_at: r.starts_at ? new Date(r.starts_at).toISOString() : null, capacity: Math.max(1, r.capacity), sort: i })),
        { defaultToNull: false },
      );
      if (up.error) throw up.error;
      qc.invalidateQueries({ queryKey: ['signups'] });
      toast.success(sheet ? 'Sheet saved' : 'Sheet created');
      onClose();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={sheet ? 'Edit sign-up sheet' : 'New sign-up sheet'} size="lg" footer={<Button variant="primary" onClick={save} loading={busy}>{sheet ? 'Save' : 'Create sheet'}</Button>}>
      <div className="space-y-4">
        {!sheet && <ModulePurpose moduleId="signups" compact />}
        <Field label="Title" required>{(id) => <Input id={id} autoFocus maxLength={120} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="Snacks for the qualifier" />}</Field>
        <Field label="Details" optional>{(id) => <Textarea id={id} rows={2} maxLength={2000} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />}</Field>
        {v.event_ref && (
          <p className="flex items-center gap-2 text-[13px] text-muted">
            For: <EntityLink refStr={v.event_ref} />
            <button className="text-muted hover:text-fg" aria-label="Unlink event" onClick={() => setV({ ...v, event_ref: null })}>
              <X className="size-3.5" />
            </button>
          </p>
        )}
        <div className="space-y-2">
          <p className="text-[13px] font-medium">Slots</p>
          {rows.map((r, i) => (
            <div key={i} className="flex flex-wrap gap-2">
              <Input className="min-w-40 flex-1" maxLength={120} placeholder={`Slot ${i + 1} (e.g. "Pit shift 9–11")`} value={r.label} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              <Input type="datetime-local" className="w-52" aria-label="Time (optional)" value={r.starts_at} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, starts_at: e.target.value } : x)))} />
              <Input type="number" min={1} max={200} className="w-20" aria-label="Spots" value={r.capacity} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, capacity: Number(e.target.value) || 1 } : x)))} />
              <IconButton label="Remove slot" onClick={() => setRows(rows.filter((_, j) => j !== i))} disabled={rows.length === 1}>
                <X className="size-4" />
              </IconButton>
            </div>
          ))}
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setRows([...rows, { label: '', starts_at: rows.at(-1)?.starts_at ?? '', capacity: rows.at(-1)?.capacity ?? 1 }])} disabled={rows.length >= 60}>
            Add slot
          </Button>
          <p className="text-[12px] text-faint">The number is how many people each slot needs. Removing a slot removes its sign-ups.</p>
        </div>
        <Field label="Closes" optional>{(id) => <Input id={id} type="datetime-local" value={v.closes_at} onChange={(e) => setV({ ...v, closes_at: e.target.value })} />}</Field>
        <TeamScopePicker value={v.team_id} onChange={(t) => setV({ ...v, team_id: t })} perm="signups.create" />
        <ScopeVisibility teamId={v.team_id} suffix="(including who signed up)" />
      </div>
    </Dialog>
  );
}
