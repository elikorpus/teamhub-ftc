import { useMemo, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, BookOpen, Bot, Boxes, CalendarRange, Database, ExternalLink, HardDrive, IdCard, MailCheck, Shield, Trash2 } from 'lucide-react';
import { Form,
  Badge,
  Banner,
  Button,
  CHART_COLORS,
  Card,
  CopyBlock,
  CardHeader,
  DataTable,
  Dialog,
  Field,
  IconButton,
  Input,
  Meter,
  PageHeader,
  RelativeTime,
  Select,
  Sparkline,
  Spinner,
  StackedBar,
  StatusPill,
  cn,
  formatBytes,
  toast,
  useConfirm,
  validateRequired,
} from '@teamhub/ui';
import {
  AdminOnly,
  friendlyError,
  NoAccess,
  PersonPicker,
  runtime,
  useMe,
  usePeople,
  useSchemaStatus,
  useSettingsRow,
  useSupabase,
  Person,
} from '@teamhub/sdk';
import { agentPrompt } from '@teamhub/sdk/agent-prompt';
import { TEAMHUB_CREDIT, TEAMHUB_UPSTREAM_REPO } from '@teamhub/config-schema/util';
import { UpdateNotice } from './UpdateNotice';
import { WhoCanJoin } from './WhoCanJoin';
import { openTour } from '../shell/tourState';
import { ProfileFieldsAdmin } from './ProfileFieldsAdmin';

const SECTIONS = [
  { path: '', label: 'Storage & usage', icon: HardDrive },
  { path: 'modules', label: 'Tabs & database', icon: Boxes },
  { path: 'admins', label: 'Admins', icon: Shield },
  { path: 'join', label: 'Who can join', icon: MailCheck },
  { path: 'fields', label: 'Profile fields', icon: IdCard },
  { path: 'season', label: 'Season', icon: CalendarRange },
  { path: 'keepalive', label: 'Keep-alive', icon: Activity },
  { path: 'ai', label: 'AI assistant', icon: Bot },
  { path: 'help', label: 'Help', icon: BookOpen },
];

export default function AdminPage() {
  return (
    <AdminOnly fallback={<NoAccess what="Admin" />}>
      <PageHeader title="Admin" icon={<Shield />} subtitle={`Storage, tabs, admins and program settings · TeamHub ${runtime().config.version}`}>
        <nav className="-mb-1 flex gap-1 relative overflow-x-auto" aria-label="Admin sections">
          {SECTIONS.map((s) => (
            <NavLink
              key={s.path}
              to={s.path ? `/admin/${s.path}` : '/admin'}
              end
              className={({ isActive }) => cn('inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium', isActive ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-bg-subtle')}
            >
              <s.icon className="size-4" /> {s.label}
            </NavLink>
          ))}
        </nav>
      </PageHeader>
      <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6">
        <UpdateNotice />
        <Routes>
          <Route index element={<Storage />} />
          <Route path="modules" element={<Modules />} />
          <Route path="admins" element={<Admins />} />
          <Route path="join" element={<WhoCanJoin />} />
          <Route path="fields" element={<ProfileFieldsAdmin />} />
          <Route path="season" element={<Season />} />
          <Route path="keepalive" element={<KeepAlive />} />
          <Route path="ai" element={<AiAssistant />} />
          <Route path="help" element={<Help />} />
        </Routes>
      </div>
    </AdminOnly>
  );
}

function projectRef(): string | null {
  const url = runtime().config.supabase.url;
  const m = url && /^https:\/\/([a-z0-9]+)\.supabase\.co/.exec(url);
  return m ? m[1] : null;
}

interface Usage {
  db_bytes: number;
  tables: Record<string, number>;
  buckets: { bucket: string; bytes: number; count: number }[];
  top_files: { bucket: string; name: string; bytes: number; created_at: string }[];
  limits: { db_mb: number; files_mb: number };
}

/** Storage dashboard (spec §11.4): meters vs plan limits, by-module bar, top files, egress note. */
function Storage() {
  const sb = useSupabase();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const settings = useSettingsRow();
  const [editLimits, setEditLimits] = useState(false);
  const [limits, setLimits] = useState({ db_mb: 500, files_mb: 1024 });
  const usage = useQuery({
    queryKey: ['core', 'storage-usage'],
    queryFn: async () => {
      const { data, error } = await sb.rpc('teamhub_storage_usage');
      if (error) throw error;
      return data as Usage;
    },
  });
  const installed = runtime().config.installed;
  const byModule = useMemo(() => {
    if (!usage.data) return [];
    const totals = new Map<string, number>();
    for (const [table, bytes] of Object.entries(usage.data.tables)) {
      const m = installed.find((x) => x.prefix && table.startsWith(x.prefix));
      const key = m ? m.name : 'Core (people, links, notifications…)';
      totals.set(key, (totals.get(key) ?? 0) + bytes);
    }
    return [...totals.entries()].map(([label, value], i) => ({ label, value, color: CHART_COLORS[i % CHART_COLORS.length] }));
  }, [usage.data, installed]);

  if (usage.isLoading) return <Spinner />;
  if (usage.error) return <Banner tone="danger">{friendlyError(usage.error)}</Banner>;
  const u = usage.data!;
  const files = u.buckets.reduce((s, b) => s + b.bytes, 0);
  const dbMax = u.limits.db_mb * 1024 * 1024;
  const filesMax = u.limits.files_mb * 1024 * 1024;
  const ref = projectRef();
  const history = settings.data?.storage_history ?? [];
  const bucketOwner = (b: string) => (b === 'avatars' ? 'Profile photos' : installed.find((m) => m.buckets.includes(b))?.name ?? b);

  return (
    <div className="space-y-4">
      {(u.db_bytes / dbMax >= 0.7 || files / filesMax >= 0.7) && (
        <Banner tone={u.db_bytes / dbMax >= 0.9 || files / filesMax >= 0.9 ? 'danger' : 'warning'} title="Storage is getting full">
          Delete old files below, or run the New Season tool in the setup wizard to export and clear last season’s files.
        </Banner>
      )}
      <Card className="space-y-5 p-4">
        <Meter label="Database" value={u.db_bytes} max={dbMax} format={formatBytes} />
        <Meter label="File storage" value={files} max={filesMax} format={formatBytes} />
        <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-muted">
          <span>
            Limits are the Supabase free plan ({u.limits.db_mb} MB database, {u.limits.files_mb} MB files).{' '}
            <button
              className="font-medium text-accent hover:underline"
              onClick={() => {
                setLimits(u.limits);
                setEditLimits(true);
              }}
            >
              On a paid plan? Change limits
            </button>
          </span>
          {history.length > 1 && (
            <span className="flex items-center gap-2">
              Trend <Sparkline values={history.map((h) => h.db + h.files)} width={90} height={22} label="Monthly storage trend" />
            </span>
          )}
        </div>
        <p className="text-[12.5px] text-muted">
          Bandwidth (egress, 5 GB/month on the free plan) can’t be measured from the database.{' '}
          {ref && (
            <a className="font-medium text-accent hover:underline" href={`https://supabase.com/dashboard/project/${ref}/usage`} target="_blank" rel="noreferrer">
              See it on the Supabase usage page <ExternalLink className="inline size-3" aria-hidden />
            </a>
          )}
        </p>
      </Card>

      <Card>
        <CardHeader icon={<Database className="size-4" />} title="Database by tab" />
        <div className="px-4 pb-4">
          <StackedBar segments={byModule} format={formatBytes} />
        </div>
      </Card>

      <Card>
        <CardHeader icon={<HardDrive className="size-4" />} title="Files by tab" />
        <div className="px-4 pb-4">
          {u.buckets.length ? (
            <DataTable
              rows={u.buckets}
              keyOf={(b) => b.bucket}
              columns={[
                { id: 'b', header: 'Used by', cell: (b) => bucketOwner(b.bucket) },
                { id: 'n', header: 'Files', cell: (b) => b.count, align: 'right', sort: (b) => b.count },
                { id: 's', header: 'Size', cell: (b) => formatBytes(b.bytes), align: 'right', sort: (b) => b.bytes },
              ]}
            />
          ) : (
            <p className="text-[13px] text-faint">No files stored yet.</p>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Largest files" />
        <ul className="divide-y divide-border px-4 pb-2">
          {u.top_files.map((f) => (
            <li key={f.bucket + f.name} className="flex items-center gap-3 py-2 text-[13px]">
              <span className="min-w-0 flex-1 truncate" title={f.name}>
                <span className="text-muted">{bucketOwner(f.bucket)} · </span>
                {f.name.split('/').pop()}
              </span>
              <span className="tabular text-muted">{formatBytes(f.bytes)}</span>
              <RelativeTime date={f.created_at} className="hidden text-faint sm:inline" />
              <IconButton
                label="Delete file"
                size="sm"
                onClick={async () => {
                  if (!(await confirm({ title: 'Delete this file?', body: 'Anything that showed it will show “file removed”.', danger: true, confirmLabel: 'Delete' }))) return;
                  const { error } = await sb.storage.from(f.bucket).remove([f.name]);
                  if (error) toast.error(friendlyError(error));
                  qc.invalidateQueries({ queryKey: ['core', 'storage-usage'] });
                }}
              >
                <Trash2 className="size-4" />
              </IconButton>
            </li>
          ))}
          {!u.top_files.length && <li className="py-3 text-[13px] text-faint">No files.</li>}
        </ul>
      </Card>

      <BulkDelete buckets={u.buckets.map((b) => b.bucket)} label={bucketOwner} />

      <Dialog
        open={editLimits}
        onOpenChange={setEditLimits}
        title="Plan limits"
        footer={
          <Button
            variant="primary"
            onClick={async () => {
              const { error } = await sb.from('teamhub_settings').update({ storage_limits: limits }).eq('id', 1);
              if (error) return toast.error(friendlyError(error));
              setEditLimits(false);
              qc.invalidateQueries({ queryKey: ['core'] });
            }}
          >
            Save
          </Button>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Database (MB)" required>{(id) => <Input id={id} type="number" min={100} value={limits.db_mb} onChange={(e) => setLimits({ ...limits, db_mb: Number(e.target.value) })} />}</Field>
          <Field label="File storage (MB)" required>{(id) => <Input id={id} type="number" min={100} value={limits.files_mb} onChange={(e) => setLimits({ ...limits, files_mb: Number(e.target.value) })} />}</Field>
        </div>
      </Dialog>
    </div>
  );
}

/** Bulk delete old files by tab (with a preview of MB freed). */
function BulkDelete({ buckets, label }: { buckets: string[]; label: (b: string) => string }) {
  const sb = useSupabase();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [bucket, setBucket] = useState('');
  const [months, setMonths] = useState(6);
  const before = new Date(Date.now() - months * 30 * 86_400_000).toISOString();
  const preview = useQuery({
    queryKey: ['core', 'bulk-files', bucket, months],
    enabled: !!bucket,
    queryFn: async () => {
      const { data, error } = await sb.rpc('teamhub_list_files', { p_bucket: bucket, p_before: before });
      if (error) throw error;
      return data as { name: string; bytes: number; created_at: string }[];
    },
  });
  const total = (preview.data ?? []).reduce((s, f) => s + f.bytes, 0);
  return (
    <Card>
      <CardHeader icon={<Trash2 className="size-4" />} title="Delete old files" subtitle="Free space by removing files older than a cutoff" />
      <div className="flex flex-wrap items-end gap-3 px-4 pb-4">
        <Field label="From">
          {(id) => (
            <Select id={id} value={bucket} onChange={(e) => setBucket(e.target.value)} className="w-56">
              <option value="">Choose…</option>
              {buckets.map((b) => (
                <option key={b} value={b}>
                  {label(b)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Older than">
          {(id) => (
            <Select id={id} value={months} onChange={(e) => setMonths(Number(e.target.value))} className="w-40">
              {[1, 3, 6, 12, 24].map((m) => (
                <option key={m} value={m}>
                  {m} month{m > 1 ? 's' : ''}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {bucket && (
          <Button
            variant="danger"
            disabled={!preview.data?.length}
            onClick={async () => {
              const n = preview.data!.length;
              if (!(await confirm({ title: `Delete ${n} files (${formatBytes(total)})?`, body: 'This cannot be undone. Consider exporting first with the wizard’s Backup & Export.', danger: true, confirmLabel: 'Delete files', typeToConfirm: 'DELETE' }))) return;
              const names = preview.data!.map((f) => f.name);
              for (let i = 0; i < names.length; i += 100) {
                const { error } = await sb.storage.from(bucket).remove(names.slice(i, i + 100));
                if (error) return toast.error(friendlyError(error));
              }
              toast.success(`Freed ${formatBytes(total)}`);
              qc.invalidateQueries({ queryKey: ['core'] });
            }}
          >
            {preview.isLoading ? 'Checking…' : `Delete ${preview.data?.length ?? 0} files · ${formatBytes(total)}`}
          </Button>
        )}
      </div>
    </Card>
  );
}

function Modules() {
  const schema = useSchemaStatus();
  const sb = useSupabase();
  const exp = runtime().schema;
  const installed = runtime().config.installed;
  const sizes = useQuery({
    queryKey: ['core', 'storage-usage'],
    queryFn: async () => {
      const { data, error } = await sb.rpc('teamhub_storage_usage');
      if (error) throw error;
      return data as Usage;
    },
  });
  const sizeOf = (prefix: string) => Object.entries(sizes.data?.tables ?? {}).reduce((s, [t, b]) => (prefix && t.startsWith(prefix) ? s + b : s), 0);
  const tone = (s: string) => (s === 'ok' ? 'success' : s === 'unknown' ? 'neutral' : 'warning');
  const label = (s: string) => (s === 'ok' ? 'Up to date' : s === 'behind' ? 'Needs DB update' : s === 'missing' ? 'Not in database' : 'Checking…');
  return (
    <div className="space-y-4">
      {schema.problems.length > 0 && (
        <Banner tone="warning" title="Database update needed">
          Run <code>npm run setup</code> on your computer and choose <strong>Update</strong>. Affected tabs show a friendly message until then; everything else keeps working.
        </Banner>
      )}
      <DataTable
        rows={[{ id: 'core', name: 'Core (people, links, notifications)', prefix: '', state: 'active' as const, buckets: [] }, ...installed]}
        keyOf={(m) => m.id}
        columns={[
          { id: 'name', header: 'Tab', cell: (m) => <span className="font-medium">{m.name}</span> },
          { id: 'state', header: 'State', cell: (m) => (m.state === 'dormant' ? <Badge tone="warning">Dormant (hidden, data kept)</Badge> : <Badge tone="success">Active</Badge>) },
          { id: 'ver', header: 'Version (code / DB)', cell: (m) => `${m.id === 'core' ? exp.core : exp.modules[m.id] ?? '–'} / ${schema.db?.get(m.id)?.version ?? '–'}` },
          { id: 'status', header: 'Status', cell: (m) => <StatusPill tone={tone(schema.status(m.id))} label={label(schema.status(m.id))} /> },
          { id: 'size', header: 'Size', align: 'right', cell: (m) => (m.prefix ? formatBytes(sizeOf(m.prefix)) : '–') },
        ]}
      />
      {Object.keys(exp.integrations).length > 0 && (
        <Card className="p-4">
          <p className="mb-2 text-[13px] font-semibold">Connections between tabs</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.keys(exp.integrations).map((id) => (
              <Badge key={id}>{id.replace('+', ' + ')}</Badge>
            ))}
          </div>
        </Card>
      )}
      <p className="text-[12.5px] text-muted">To add or remove tabs, use the setup wizard’s Edit mode (see Help).</p>
    </div>
  );
}

function Admins() {
  const people = usePeople();
  const sb = useSupabase();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const me = useMe();
  const [pick, setPick] = useState<string[]>([]);
  const admins = [...(people.data?.values() ?? [])].filter((p) => p.isAdmin && p.status === 'active');
  return (
    <div className="space-y-4">
      <Banner tone="info">Admins have every permission everywhere. Only admins can make or remove admins, and there must always be at least one.</Banner>
      <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
        {admins.map((a) => (
          <li key={a.id} className="flex items-center gap-3 px-4 py-2.5">
            <Person id={a.id} showRole />
            <span className="flex-1" />
            <Button
              size="sm"
              variant="ghost"
              disabled={admins.length <= 1}
              onClick={async () => {
                if (!(await confirm({ title: `Remove admin from ${a.name}?`, body: a.id === me.id ? 'You will lose access to Admin.' : undefined, danger: true }))) return;
                const { error } = await sb.rpc('people_set_admin', { p_user: a.id, p_on: false });
                if (error) toast.error(friendlyError(error));
                qc.invalidateQueries({ queryKey: ['core'] });
              }}
            >
              Remove admin
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex max-w-md items-end gap-2">
        <div className="flex-1">
          <PersonPicker value={pick} onChange={setPick} placeholder="Choose someone to make admin…" />
        </div>
        <Button
          variant="primary"
          disabled={!pick.length}
          onClick={async () => {
            const name = people.data?.get(pick[0])?.name ?? 'this person';
            if (!(await confirm({ title: `Make ${name} an admin?`, body: 'Admins can do everything: change every setting, see private profile fields, and make or remove other admins.', confirmLabel: 'Make admin' }))) return;
            const { error } = await sb.rpc('people_set_admin', { p_user: pick[0], p_on: true });
            if (error) return toast.error(friendlyError(error));
            setPick([]);
            qc.invalidateQueries({ queryKey: ['core'] });
          }}
        >
          Make admin
        </Button>
      </div>
    </div>
  );
}

function Season() {
  const settings = useSettingsRow();
  const sb = useSupabase();
  const qc = useQueryClient();
  const [label, setLabel] = useState<string | null>(null);
  const current = settings.data?.season_label ?? runtime().config.season;
  return (
    <Card className="max-w-xl space-y-4 p-4">
      <p className="text-[13.5px]">
        Current season: <strong>{current}</strong>
      </p>
      <p className="text-[13px] text-muted">
        The season label tags new items (scouting, notebook, outreach…) and sets which FTCScout season is shown. Changing it here only changes the label. For a full rollover (archive
        last season, reset checklists, free storage), use <strong>New Season</strong> in the setup wizard.
      </p>
      <Form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!validateRequired(e.currentTarget)) return;
          if (!label || !/^\d{4}[–-]\d{2}$/.test(label)) return toast.error('Use the format 2026–27');
          const { error } = await sb.from('teamhub_settings').update({ season_label: label.replace('-', '–') }).eq('id', 1);
          if (error) return toast.error(friendlyError(error));
          toast.success('Season label updated');
          qc.invalidateQueries({ queryKey: ['core', 'settings'] });
        }}
      >
        <Input value={label ?? current} onChange={(e) => setLabel(e.target.value)} aria-label="Season label" className="w-40" />
        <Button type="submit" variant="primary">
          Save
        </Button>
      </Form>
    </Card>
  );
}

function KeepAlive() {
  const settings = useSettingsRow();
  const last = settings.data?.last_keepalive;
  const stale = !last || Date.now() - new Date(last).getTime() > 4 * 86_400_000;
  return (
    <Card className="max-w-2xl space-y-3 p-4 text-[13.5px]">
      <p>
        Last keep-alive ping:{' '}
        <strong>{last ? <RelativeTime date={last} /> : 'never'}</strong> {stale ? <Badge tone="warning">check it</Badge> : <Badge tone="success">healthy</Badge>}
      </p>
      <p className="text-muted">
        Free Supabase projects pause after 7 days without activity. The <code>keepalive</code> GitHub Action in your fork pings the database every 3 days. GitHub turns off scheduled
        workflows in repositories with no commits for 60 days. If pings stop, open your fork on GitHub &gt; <strong>Actions</strong> &gt; <strong>Keep TeamHub awake</strong> &gt;{' '}
        <strong>Enable workflow</strong>, or push any small change.
      </p>
      {projectRef() && (
        <a className="inline-flex items-center gap-1 font-medium text-accent hover:underline" href={`https://supabase.com/dashboard/project/${projectRef()}`} target="_blank" rel="noreferrer">
          Open your Supabase project <ExternalLink className="size-3.5" />
        </a>
      )}
    </Card>
  );
}

/** A ready-made prompt for AI coding assistants, filled in with this program's name and tabs (see AGENTS.md). */
function AiAssistant() {
  const prompt = agentPrompt({ programName: runtime().config.program.name, tabs: runtime().modules.map((m) => m.manifest.name) });
  return (
    <div className="max-w-3xl space-y-4 text-[13.5px]">
      <Card className="space-y-2 p-4">
        <p className="font-semibold">Customize your dashboard with an AI assistant</p>
        <p className="text-muted">
          Want a change the setup wizard can't make, like new wording, a different layout or an extra field? An AI coding assistant can help. Open your copy of the TeamHub
          repository in a tool like Claude Code, Cursor or GitHub Copilot, paste the prompt below, and describe the change on the last line.
        </p>
        <p className="text-muted">
          The prompt points the assistant to <code>AGENTS.md</code>, a guide in your repository that explains how the code is organized and the rules that keep your
          dashboard safe (like never putting passwords in the code).
        </p>
      </Card>
      <CopyBlock text={prompt} label="Prompt" rows={16} />
      <Card className="space-y-1.5 p-4">
        <p className="font-semibold">Before you push the changes</p>
        <ul className="list-disc space-y-1 pl-5 text-muted">
          <li>Read what the assistant changed, and ask it to explain anything unclear.</li>
          <li>
            Make sure <code>npm run typecheck</code>, <code>npm run lint</code> and <code>npm test</code> pass.
          </li>
          <li>
            If it changed the database, run <code>npm run setup</code> &gt; Update so your live database matches.
          </li>
        </ul>
      </Card>
    </div>
  );
}

function Help() {
  return (
    <div className="max-w-2xl space-y-4 text-[13.5px]">
      <Card className="space-y-2 p-4">
        <p className="font-semibold">How to edit your dashboard</p>
        <ol className="list-decimal space-y-1.5 pl-5 text-muted">
          <li>On your computer, open your copy of the TeamHub repository (your GitHub fork).</li>
          <li>
            Run <code>npm install</code> then <code>npm run setup</code>. The wizard opens in your browser.
          </li>
          <li>
            Choose <strong>Edit</strong> to add or remove tabs, change colors, logos, positions or permissions. It shows every change before applying it, and always exports a
            backup before removing anything.
          </li>
          <li>The wizard commits and pushes; your host rebuilds the site automatically in a minute or two.</li>
        </ol>
      </Card>
      <Card className="space-y-2 p-4">
        <p className="font-semibold">Getting updates</p>
        <p className="text-muted">
          This site runs TeamHub {runtime().config.version}. When a new version is out, a notice appears at the top of this page. To update, run <code>npm run setup</code> on
          your computer and choose <strong>Update</strong>: it backs up your data, updates your database, then your site, and you can undo it. Avoid GitHub’s “Sync fork”
          button for updates.
        </p>
      </Card>
      <Card className="space-y-2 p-4">
        <p className="font-semibold">Change right here, no wizard needed</p>
        <p className="text-muted">
          New to TeamHub?{' '}
          <button type="button" className="font-medium text-accent hover:underline" onClick={openTour}>
            Take the welcome tour
          </button>{' '}
          (everyone can, from the menu under their name).
        </p>
        <ul className="list-disc space-y-1 pl-5 text-muted">
          <li>Approving new members: People &gt; Requests.</li>
          <li>Someone's name, teams, role and profile answers: open them in People &gt; Edit. Positions: People &gt; Positions.</li>
          <li>Deactivating or deleting an account, or a password reset link: the menu on their profile.</li>
          <li>Admins, who can join, extra profile fields and the season label: the sections above.</li>
          <li>Team tool links and other links: the Links page (under Program in the sidebar).</li>
          <li>Old files: Storage &amp; usage &gt; Delete old files.</li>
          <li>Everything inside a tab (events, tasks, checklists…): in that tab.</li>
        </ul>
      </Card>
      <Card className="space-y-2 p-4">
        <p className="font-semibold">Needs the setup wizard</p>
        <ul className="list-disc space-y-1 pl-5 text-muted">
          <li>Tabs and their options, teams, colors and logos, subteams, permissions, and who can see each setup profile field: wizard &gt; Edit. These are built into the site, so it rebuilds.</li>
          <li>Data backups and restore: wizard &gt; Backup &amp; Export.</li>
          <li>New season rollover: wizard &gt; New Season.</li>
          <li>Email (confirm new accounts, self-serve password reset): wizard &gt; Email. Add an email provider there, then turn it on.</li>
        </ul>
      </Card>
      <p className="text-muted">
        Invite your team: share <code>{`${location.origin}${import.meta.env.BASE_URL}join`}</code> or print the{' '}
        <a href={`${import.meta.env.BASE_URL}help/join`} className="font-medium text-accent hover:underline" target="_blank" rel="noreferrer">
          How to join page with a QR code
        </a>
        .
      </p>
      <Card className="space-y-2 p-4">
        <p className="font-semibold">About TeamHub</p>
        <p className="text-muted">
          TeamHub FTC is free, open-source software made by{' '}
          <a href={TEAMHUB_CREDIT.url} className="font-medium text-accent hover:underline" target="_blank" rel="noreferrer">
            {TEAMHUB_CREDIT.team}
          </a>
          . If it helps your team, tell other teams about it.
        </p>
        <a href={`https://github.com/${TEAMHUB_UPSTREAM_REPO}`} className="inline-flex items-center gap-1 font-medium text-accent hover:underline" target="_blank" rel="noreferrer">
          TeamHub on GitHub <ExternalLink className="size-3.5" />
        </a>
      </Card>
    </div>
  );
}
