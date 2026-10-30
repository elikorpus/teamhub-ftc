import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Download, ExternalLink, NotebookPen, Pencil, Plus, Printer, Trash2, Trophy } from 'lucide-react';
import { Form,
  Badge,
  Button,
  DetailPane,
  Dialog,
  EmptyState,
  IconButton,
  Input,
  ListRow,
  Markdown,
  Menu,
  SearchInput,
  Segmented,
  Select,
  SplitView,
  Toolbar,
  downloadText,
  formatDate,
  markdownExcerpt,
  matches,
  cn,
  toast,
  useConfirm,
  renderMarkdown,
  safeHref,
} from '@teamhub/ui';
import {
  canWith,
  CommentThread,
  EntityLink,
  friendlyError,
  ModuleHeader,
  ModulePurpose,
  Person,
  PersonName,
  Slot,
  TeamBadge,
  useCan,
  useCreateShortcut,
  useListNav,
  useMe,
  useNewParam,
  usePeople,
  useSelectedParam,
  useSignedUrls,
  useSupabase,
  useTeamScope,
  InlineEditText,
} from '@teamhub/sdk';
import { matrixTotals, toMarkdown, useEntries, useImages, useNbSettings, useSubsystems, type Entry } from './data';
import { EntryEditor } from './Editor';

type View = 'timeline' | 'subsystems';

export default function NotebookRoutes() {
  const entries = useEntries();
  const subsystems = useSubsystems();
  const settings = useNbSettings();
  const people = usePeople();
  const scope = useTeamScope();
  const canWrite = useCan('notebook.write');
  const [view, setView] = useState<View>('timeline');
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('');
  const [sub, setSub] = useState('');
  const [kind, setKind] = useState('');
  const [selected, setSelected] = useSelectedParam();
  const [creating, setCreating, params] = useNewParam();
  const [editing, setEditing] = useState<Entry | null>(null);
  const [managing, setManaging] = useState(false);
  useCreateShortcut(() => setCreating(true), canWrite);

  const list = useMemo(
    () =>
      (entries.data ?? []).filter(
        (e) =>
          (!scope || !e.team_id || e.team_id === scope) &&
          (!tag || e.tags.includes(tag)) &&
          (!sub || e.subsystem_id === sub) &&
          (!kind || e.kind === kind) &&
          (!q || matches(`${e.title} ${e.body} ${e.why ?? ''}`, q)),
      ),
    [entries.data, scope, tag, sub, kind, q],
  );
  const current = (entries.data ?? []).find((e) => e.id === selected) ?? null;
  useListNav(list, current, (e) => setSelected(e.id), (e) => e.id);
  const names = new Map([...(people.data?.values() ?? [])].map((p) => [p.id, p.name]));
  const allTags = [...new Set([...(settings.tags ?? []), ...(entries.data ?? []).flatMap((e) => e.tags)])];

  return (
    <div className="flex h-full flex-col">
      <ModuleHeader
        moduleId="notebook"
        actions={
          <>
            <Menu
              trigger={
                <Button size="sm" variant="ghost" icon={<Download className="size-4" />}>
                  Export
                </Button>
              }
              items={[
                { label: 'Download as Markdown', hint: `${list.length} entries (current filters)`, icon: <Download />, onSelect: () => downloadText(toMarkdown([...list].reverse(), subsystems.data ?? [], names), 'engineering-notebook.md', 'text/markdown') },
                { label: 'Print / save as PDF', icon: <Printer />, onSelect: () => printEntries([...list].reverse(), subsystems.data ?? [], names) },
              ]}
            />
            {canWrite && (
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
                New entry
              </Button>
            )}
          </>
        }
      >
        <Segmented
          size="sm"
          value={view}
          onChange={setView}
          options={[
            { value: 'timeline', label: 'Timeline' },
            { value: 'subsystems', label: 'Subsystems' },
          ]}
        />
      </ModuleHeader>
      <Toolbar>
        <SearchInput value={q} onChange={setQ} className="w-56" />
        <Select value={kind} onChange={(e) => setKind(e.target.value)} className="w-36" aria-label="Type">
          <option value="">All types</option>
          <option value="log">Log entries</option>
          <option value="iteration">Design iterations</option>
        </Select>
        <Select value={sub} onChange={(e) => setSub(e.target.value)} className="w-40" aria-label="Subsystem">
          <option value="">All subsystems</option>
          {(subsystems.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Select value={tag} onChange={(e) => setTag(e.target.value)} className="w-36" aria-label="Tag">
          <option value="">All tags</option>
          {allTags.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </Select>
        <ManageSubsystemsButton open={managing} setOpen={setManaging} />
      </Toolbar>
      <div className="min-h-0 flex-1">
        {view === 'subsystems' ? (
          <SubsystemsView entries={list} onOpen={(e) => setSelected(e.id)} />
        ) : (
          <SplitView
            onCloseDetail={() => setSelected(null)}
            detailTitle={current?.title}
            detail={current ? <EntryDetail entry={current} onEdit={() => setEditing(current)} onDeleted={() => setSelected(null)} /> : null}
            list={
              list.length ? (
                <ul className="divide-y divide-border">
                  {list.map((e) => (
                    <li key={e.id}>
                      <ListRow selected={e.id === selected} onClick={() => setSelected(e.id)}>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            {e.kind === 'iteration' && <Badge tone="accent">{e.version_label || 'Iteration'}</Badge>}
                            <p className="truncate text-[13.5px] font-medium">{e.title}</p>
                          </div>
                          <p className="line-clamp-2 text-[12.5px] text-muted">{markdownExcerpt(e.body, 150)}</p>
                          <p className="mt-1 text-[11.5px] text-faint">
                            {formatDate(e.date, { month: 'short', day: 'numeric', year: 'numeric' })} · {e.authors.map((a) => names.get(a) ?? '?').join(', ')}
                          </p>
                        </div>
                      </ListRow>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon={<NotebookPen />} title={entries.isLoading ? 'Loading…' : 'No entries yet'} body={<ModulePurpose moduleId="notebook" compact className="mt-2 text-left" />} action={canWrite && <Button onClick={() => setCreating(true)}>Write the first entry</Button>} />
              )
            }
          />
        )}
      </div>
      {(creating || editing) && (
        <EntryEditor
          entry={editing}
          draft={{ title: params.get('title') ?? undefined, refs: params.getAll('ref'), kind: (params.get('kind') as 'log') ?? undefined, body: params.get('body') ?? undefined }}
          onClose={(id) => {
            setCreating(false);
            setEditing(null);
            if (id) setSelected(id);
          }}
        />
      )}
    </div>
  );
}

function ManageSubsystemsButton({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const confirm = useConfirm();
  const can = useCan('notebook.manage_subsystems');
  const subsystems = useSubsystems();
  const sb = useSupabase();
  const qc = useQueryClient();
  const scope = useTeamScope();
  const [name, setName] = useState('');
  if (!can) return null;
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Subsystems…
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title="Subsystems" description="e.g. Drivetrain, Intake, Lift, Electronics. Used by notebook entries and the repair log.">
        <ul className="mb-3 divide-y divide-border rounded-md border border-border">
          {(subsystems.data ?? []).map((s) => (
            <li key={s.id} className="flex items-center gap-2 px-3 py-1.5 text-[13px]">
              <span className="flex-1">
                <InlineEditText
                  label={`${s.name} name`}
                  value={s.name}
                  onSave={async (v) => {
                    if (!v.trim()) return;
                    const { error } = await sb.from('nb_subsystems').update({ name: v.trim().slice(0, 60) }).eq('id', s.id);
                    if (error) toast.error(friendlyError(error));
                    qc.invalidateQueries({ queryKey: ['notebook'] });
                  }}
                />
              </span>
              <TeamBadge teamId={s.team_id} />
              <IconButton
                label={`Delete ${s.name}`}
                size="sm"
                onClick={async () => {
                  if (!(await confirm({ title: `Delete ${s.name}?`, body: 'Entries tagged with it are kept, without a subsystem.', danger: true, confirmLabel: 'Delete' }))) return;
                  const { error } = await sb.from('nb_subsystems').delete().eq('id', s.id);
                  if (error) toast.error(friendlyError(error));
                  qc.invalidateQueries({ queryKey: ['notebook'] });
                }}
              >
                <Trash2 className="size-4" />
              </IconButton>
            </li>
          ))}
        </ul>
        <Form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim()) return;
            const { error } = await sb.from('nb_subsystems').insert({ name: name.trim(), team_id: scope, sort: subsystems.data?.length ?? 0 });
            if (error) return toast.error(friendlyError(error));
            setName('');
            qc.invalidateQueries({ queryKey: ['notebook'] });
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New subsystem" maxLength={60} />
          <Button type="submit">Add</Button>
        </Form>
      </Dialog>
    </>
  );
}

/** Each subsystem's iteration history v1 → vN side by side (spec §13.10). */
function SubsystemsView({ entries, onOpen }: { entries: Entry[]; onOpen: (e: Entry) => void }) {
  const subsystems = useSubsystems();
  const cols = [...(subsystems.data ?? []), { id: '', name: 'No subsystem', team_id: null, sort: 999 }];
  return (
    <div className="flex h-full gap-3 relative overflow-x-auto p-4 sm:px-6">
      {cols.map((s) => {
        const its = entries.filter((e) => (e.subsystem_id ?? '') === s.id).sort((a, b) => a.date.localeCompare(b.date));
        if (!its.length && !s.id) return null;
        return (
          <section key={s.id || 'none'} className="flex w-72 shrink-0 flex-col rounded-lg bg-bg-subtle/70">
            <h3 className="px-3 pb-1 pt-2.5 text-[13px] font-semibold">
              {s.name} <span className="font-normal text-faint">{its.length}</span>
            </h3>
            <ol className="space-y-2 relative overflow-y-auto px-2 pb-2">
              {its.map((e, i) => (
                <li key={e.id} className="relative pl-4">
                  <span className={cn('absolute left-1 top-3 size-2 rounded-full', e.kind === 'iteration' ? 'bg-accent' : 'bg-border-strong')} />
                  {i < its.length - 1 && <span className="absolute left-[7.5px] top-5 h-full w-px bg-border" />}
                  <button type="button" onClick={() => onOpen(e)} className="w-full rounded-md border border-border bg-surface p-2 text-left shadow-sm hover:shadow-md">
                    <p className="text-[11.5px] text-faint">
                      {formatDate(e.date)} {e.version_label && <Badge tone="accent">{e.version_label}</Badge>}
                    </p>
                    <p className="text-[13px] font-medium">{e.title}</p>
                    {e.why && <p className="mt-0.5 line-clamp-2 text-[12px] text-muted">Why: {e.why}</p>}
                  </button>
                </li>
              ))}
              {!its.length && <li className="px-2 py-4 text-center text-[12px] text-faint">No entries yet</li>}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

function EntryDetail({ entry: e, onEdit, onDeleted }: { entry: Entry; onEdit: () => void; onDeleted: () => void }) {
  const sb = useSupabase();
  const me = useMe();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const subsystems = useSubsystems();
  const images = useImages([e.id]);
  const urls = useSignedUrls('notebook', (images.data ?? []).map((i) => i.path));
  const canEdit = canWith(me, 'notebook.edit_any', e.team_id) || ((e.created_by === me.id || e.authors.includes(me.id)) && canWith(me, 'notebook.write', e.team_id));
  const canDelete = canWith(me, 'notebook.delete_any', e.team_id) || (e.created_by === me.id && canWith(me, 'notebook.write', e.team_id));
  const m = e.decision_matrix;
  const totals = m ? matrixTotals(m) : [];
  const best = totals.length ? totals.indexOf(Math.max(...totals)) : -1;
  return (
    <DetailPane
      title={e.title}
      onClose={onDeleted}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          {formatDate(e.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          {e.kind === 'iteration' && <Badge tone="accent">Design iteration {e.version_label}</Badge>}
          {e.subsystem_id && <Badge>{subsystems.data?.find((s) => s.id === e.subsystem_id)?.name}</Badge>}
          <TeamBadge teamId={e.team_id} />
        </span>
      }
      meta={
        <>
          {e.authors.map((a) => (
            <Person key={a} id={a} size="sm" />
          ))}
          {e.tags.map((t) => (
            <Badge key={t}>#{t}</Badge>
          ))}
        </>
      }
      actions={
        <>
          {canEdit && (
            <IconButton label="Edit" size="sm" onClick={onEdit}>
              <Pencil className="size-4" />
            </IconButton>
          )}
          {canDelete && (
            <IconButton
              label="Delete"
              size="sm"
              onClick={async () => {
                if (!(await confirm({ title: 'Delete this entry?', body: 'Its photos and comments are deleted too.', danger: true, confirmLabel: 'Delete' }))) return;
                const { error } = await sb.from('nb_entries').delete().eq('id', e.id);
                if (error) return toast.error(friendlyError(error));
                qc.invalidateQueries({ queryKey: ['notebook'] });
                onDeleted();
              }}
            >
              <Trash2 className="size-4" />
            </IconButton>
          )}
        </>
      }
    >
      <Markdown source={e.body} />
      {e.why && (
        <div className="rounded-md border-l-4 border-accent bg-accent-soft/40 p-3">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-muted">Why</p>
          <Markdown source={e.why} className="text-[13.5px]" />
        </div>
      )}
      {e.onshape_url && (
        <a href={safeHref(e.onshape_url)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent hover:underline">
          Open in Onshape <ExternalLink className="size-3.5" />
        </a>
      )}
      {m && m.options.length > 0 && (
        <div className="relative overflow-x-auto rounded-md border border-border">
          <table className="w-full text-[12.5px]">
            <thead className="bg-bg-subtle/60">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">Option</th>
                {m.criteria.map((c) => (
                  <th key={c.name} className="px-2 py-1.5 font-medium">
                    {c.name} <span className="text-faint">×{c.weight}</span>
                  </th>
                ))}
                <th className="px-2 py-1.5 font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {m.options.map((o, i) => (
                <tr key={o.name} className={i === best ? 'bg-success-soft/40 font-medium' : ''}>
                  <td className="px-2 py-1.5">
                    {o.name} {i === best && <Trophy className="inline size-3.5 text-success" />}
                  </td>
                  {o.scores.map((s, j) => (
                    <td key={j} className="tabular px-2 py-1.5 text-center">
                      {s}
                    </td>
                  ))}
                  <td className="tabular px-2 py-1.5 text-center">{totals[i]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(images.data?.length ?? 0) > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {images.data!.map((img) => (
            <figure key={img.id} className="group relative">
              <a href={safeHref(urls.data?.get(img.path))} target="_blank" rel="noreferrer">
                <img src={urls.data?.get(img.path)} alt={img.caption ?? ''} className="aspect-square w-full rounded-md bg-bg-subtle object-cover" loading="lazy" />
              </a>
              {canEdit && (
                <IconButton
                  label="Delete photo"
                  size="sm"
                  variant="secondary"
                  className="absolute right-1 top-1 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:focus-visible:opacity-100"
                  onClick={async () => {
                    if (!(await confirm({ title: 'Delete this photo?', body: 'It is removed from the entry and the file is deleted.', danger: true, confirmLabel: 'Delete' }))) return;
                    const { error } = await sb.from('nb_images').delete().eq('id', img.id);
                    if (error) toast.error(friendlyError(error));
                    else await sb.storage.from('notebook').remove([img.path]);
                    qc.invalidateQueries({ queryKey: ['notebook'] });
                  }}
                >
                  <Trash2 className="size-3.5" />
                </IconButton>
              )}
              {canEdit ? (
                <figcaption className="mt-1 text-[12px]">
                  <InlineEditText
                    label="Photo caption"
                    value={img.caption ?? ''}
                    onSave={async (v) => {
                      const { error } = await sb.from('nb_images').update({ caption: v.trim().slice(0, 200) || null }).eq('id', img.id);
                      if (error) toast.error(friendlyError(error));
                      qc.invalidateQueries({ queryKey: ['notebook'] });
                    }}
                  />
                </figcaption>
              ) : (
                img.caption && <figcaption className="mt-1 text-[12px] text-muted">{img.caption}</figcaption>
              )}
            </figure>
          ))}
        </div>
      )}
      {e.refs.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
          <span className="text-muted">Linked:</span>
          {e.refs.map((r) => (
            <EntityLink key={r} refStr={r} />
          ))}
        </div>
      )}
      <Slot name="notebook.entry.actions" props={{ entry: e }} />
      <p className="text-[12px] text-faint">
        Written by <PersonName id={e.created_by} /> · season {e.season}
      </p>
      <CommentThread refStr={`notebook:entry:${e.id}`} />
    </DetailPane>
  );
}

function printEntries(entries: Entry[], subsystems: { id: string; name: string }[], names: Map<string, string>) {
  const w = window.open('', '_blank');
  if (!w) return toast.error('Allow pop-ups to print');
  const md = toMarkdown(entries, subsystems as never, names);
  w.document.write(
    `<!doctype html><title>Engineering notebook</title><style>body{font:14px/1.55 system-ui,sans-serif;max-width:760px;margin:40px auto;padding:0 20px;color:#111}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:2px 6px}</style>${renderMarkdown(md)}`,
  );
  w.document.close();
  w.print();
}
