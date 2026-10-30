import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BatteryCharging, Gauge, MoreHorizontal, Plus, StickyNote, Zap } from 'lucide-react';
import { BareButton,
  Button,
  Card,
  Dialog,
  EmptyState,
  Field,
  IconButton,
  Input,
  Menu,
  RelativeTime,
  Sparkline,
  Spinner,
  StatusPill,
  Switch,
  Textarea,
  toast,
  useConfirm,
  validateRequired,
} from '@teamhub/ui';
import { ScopeVisibility, canWith, friendlyError, ModuleHeader, ModulePurpose, TeamBadge, TeamScopePicker, useCan, useMe, useSupabase, useTeamScope } from '@teamhub/sdk';
import { batteryStatus, STATE_LABEL, useBatLogs, useBatSettings, useBatteries, type Battery, type BatLog } from './data';

export default function BatteriesRoutes() {
  const batteries = useBatteries();
  const logs = useBatLogs();
  const s = useBatSettings();
  const scope = useTeamScope();
  const canManage = useCan('batteries.manage');
  const [showRetired, setShowRetired] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Battery | null>(null);
  const list = (batteries.data ?? []).filter((b) => (!scope || !b.team_id || b.team_id === scope) && (showRetired || !b.retired));
  const order = { needs_charge: 0, weak: 1, unknown: 2, charged: 3, retired: 4 };
  const rows = list.map((b) => ({ b, st: batteryStatus(b, logs.data ?? [], s) })).sort((x, y) => order[x.st.state] - order[y.st.state] || x.b.label.localeCompare(y.b.label));
  return (
    <div>
      <ModuleHeader
        moduleId="batteries"
        actions={
          <>
            <Switch checked={showRetired} onChange={setShowRetired} label={<span className="text-[12.5px] font-normal">Show retired</span>} />
            {canManage && (
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
                Add battery
              </Button>
            )}
          </>
        }
      />
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
        {batteries.isLoading ? (
          <Spinner />
        ) : !rows.length ? (
          <EmptyState icon={<BatteryCharging />} title="No batteries yet" body={<ModulePurpose moduleId="batteries" compact className="mt-2 text-left" />} action={canManage && <Button onClick={() => setAdding(true)}>Add your batteries</Button>} />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map(({ b, st }) => (
              <BatteryCard key={b.id} b={b} st={st} logs={(logs.data ?? []).filter((l) => l.battery_id === b.id)} onEdit={() => setEditing(b)} />
            ))}
          </div>
        )}
        <p className="mt-4 text-[12px] text-faint">
          Thresholds: charged ≥ {s.chargedVolts} V · weak &lt; {s.weakVolts} V · recharge after {s.staleHours} h (change in setup).
        </p>
      </div>
      {(adding || editing) && <BatteryDialog battery={editing} onClose={() => (setAdding(false), setEditing(null))} />}
    </div>
  );
}

function BatteryCard({ b, st, logs, onEdit }: { b: Battery; st: ReturnType<typeof batteryStatus>; logs: BatLog[]; onEdit: () => void }) {
  const sb = useSupabase();
  const me = useMe();
  const qc = useQueryClient();
  const [testing, setTesting] = useState<'tested' | 'charged' | 'note' | null>(null);
  const [volts, setVolts] = useState('');
  const [note, setNote] = useState('');
  const canLog = canWith(me, 'batteries.log', b.team_id) && !b.retired;
  const log = async (kind: BatLog['kind'], voltage: number | null = null, n: string | null = null) => {
    const { error } = await sb.from('bat_logs').insert({ battery_id: b.id, kind, voltage, note: n, by: me.id });
    if (error) return toast.error(friendlyError(error));
    qc.invalidateQueries({ queryKey: ['batteries'] });
  };
  const L = STATE_LABEL[st.state];
  // Logs arrive newest first; the latest one can be undone by whoever logged it (or a manager).
  const latest = logs[0];
  const canUndo = !!latest && (latest.by === me.id || canWith(me, 'batteries.manage', b.team_id));
  const undo = async () => {
    const { error } = await sb.from('bat_logs').delete().eq('id', latest!.id);
    if (error) return toast.error(friendlyError(error));
    toast.success('Log entry removed');
    qc.invalidateQueries({ queryKey: ['batteries'] });
  };
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-semibold">{b.label}</p>
          <p className="text-[12px] text-muted">
            {b.type ?? 'Battery'} · {st.cycles} charge{st.cycles === 1 ? '' : 's'} <TeamBadge teamId={b.team_id} />
          </p>
        </div>
        <StatusPill label={L.label} tone={L.tone} />
        {canWith(me, 'batteries.manage', b.team_id) && (
          <IconButton label="Edit battery" size="sm" onClick={onEdit}>
            <MoreHorizontal className="size-4" />
          </IconButton>
        )}
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <div className="text-[12.5px] text-muted">
          {st.voltage != null && <p className="tabular text-[20px] font-semibold text-fg">{st.voltage.toFixed(2)} V</p>}
          {st.lastCharged ? (
            <p>
              Charged <RelativeTime date={st.lastCharged} />
            </p>
          ) : (
            <p>No charge logged yet</p>
          )}
        </div>
        <Sparkline values={st.volts.slice(-20)} width={110} height={34} label="Voltage history" />
      </div>
      {canLog && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Button size="sm" icon={<Zap className="size-3.5" />} onClick={() => (setVolts(''), setTesting('charged'))}>
            Charged
          </Button>
          <Button size="sm" onClick={() => log('used')}>
            Used
          </Button>
          <Button size="sm" icon={<Gauge className="size-3.5" />} onClick={() => (setVolts(''), setTesting('tested'))}>
            Test
          </Button>
          <Button size="sm" variant="ghost" icon={<StickyNote className="size-3.5" />} onClick={() => (setNote(''), setTesting('note'))}>
            Note
          </Button>
        </div>
      )}
      {canUndo && (
        <p className="mt-2 text-[12px] text-muted">
          Last: {latest!.kind === 'charged' ? 'charged' : latest!.kind === 'tested' ? `tested${latest!.voltage != null ? ` at ${latest!.voltage.toFixed(2)} V` : ''}` : latest!.kind === 'used' ? 'used' : 'note'} <RelativeTime date={latest!.at} />{' '}
          <BareButton type="button" className="font-medium text-accent hover:underline" onClick={undo}>
            Undo
          </BareButton>
        </p>
      )}
      {logs.find((l) => l.kind === 'note') && <p className="mt-2 truncate text-[12px] text-muted"><StickyNote className="mr-1 inline size-3.5" aria-hidden />{logs.find((l) => l.kind === 'note')!.note}</p>}
      <Dialog
        open={!!testing}
        onOpenChange={(v) => !v && setTesting(null)}
        title={testing === 'note' ? `Note on ${b.label}` : testing === 'charged' ? `${b.label} charged` : `Test ${b.label}`}
        size="sm"
        footer={
          <Button
            variant="primary"
            onClick={async () => {
              const v = volts ? Number(volts) : null;
              if (testing === 'tested' && v == null) return toast.error('Enter the voltage');
              await log(testing!, v, testing === 'note' ? note.trim() || null : null);
              setTesting(null);
            }}
          >
            Save
          </Button>
        }
      >
        {testing === 'note' ? (
          <Textarea rows={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. connector loose" aria-label="Note" />
        ) : (
          <Field label={testing === 'charged' ? 'Voltage after charging' : 'Voltage'} optional={testing === 'charged'}>
            {(id) => <Input id={id} type="number" inputMode="decimal" step="0.01" min={0} max={20} value={volts} onChange={(e) => setVolts(e.target.value)} autoFocus />}
          </Field>
        )}
      </Dialog>
    </Card>
  );
}

function BatteryDialog({ battery, onClose }: { battery: Battery | null; onClose: () => void }) {
  const sb = useSupabase();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const scope = useTeamScope();
  const [v, setV] = useState({ label: battery?.label ?? '', type: battery?.type ?? '', purchased: battery?.purchased ?? '', notes: battery?.notes ?? '', retired: battery?.retired ?? false, team_id: battery ? battery.team_id : scope });
  const save = async () => {
    if (!validateRequired()) return;
    if (!v.label.trim()) return toast.error('Give it a label, e.g. “B3”');
    const row = { ...v, label: v.label.trim(), type: v.type || null, purchased: v.purchased || null, notes: v.notes || null };
    const res = battery ? await sb.from('bat_batteries').update(row).eq('id', battery.id) : await sb.from('bat_batteries').insert(row);
    if (res.error) return toast.error(friendlyError(res.error));
    qc.invalidateQueries({ queryKey: ['batteries'] });
    onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(x) => !x && onClose()}
      title={battery ? `Edit ${battery.label}` : 'Add a battery'}
      footer={
        <>
          {battery && (
            <Menu
              trigger={<Button variant="ghost" className="mr-auto">More…</Button>}
              items={[
                {
                  label: 'Delete battery and its log',
                  danger: true,
                  onSelect: async () => {
                    if (!(await confirm({ title: `Delete ${battery.label}?`, danger: true, confirmLabel: 'Delete' }))) return;
                    const { error } = await sb.from('bat_batteries').delete().eq('id', battery.id);
                    if (error) return toast.error(friendlyError(error));
                    qc.invalidateQueries({ queryKey: ['batteries'] });
                    onClose();
                  },
                },
              ]}
            />
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Label" required>{(id) => <Input id={id} autoFocus maxLength={40} value={v.label} onChange={(e) => setV({ ...v, label: e.target.value })} placeholder="B3" />}</Field>
          <Field label="Type" optional>{(id) => <Input id={id} maxLength={60} value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })} placeholder="12V NiMH 3000mAh" />}</Field>
        </div>
        <Field label="Purchased" optional>{(id) => <Input id={id} type="date" value={v.purchased} onChange={(e) => setV({ ...v, purchased: e.target.value })} />}</Field>
        <Field label="Notes" optional>{(id) => <Textarea id={id} rows={2} maxLength={500} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} />}</Field>
        <TeamScopePicker value={v.team_id} onChange={(team_id) => setV({ ...v, team_id })} perm="batteries.manage" />
        <ScopeVisibility teamId={v.team_id} />
        {battery && <Switch checked={v.retired} onChange={(retired) => setV({ ...v, retired })} label="Retired" description="Retired batteries are hidden and never count as needing a charge." />}
      </div>
    </Dialog>
  );
}
