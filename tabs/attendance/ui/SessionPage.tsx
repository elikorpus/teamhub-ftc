import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCheck, LogOut, Pencil, QrCode, Square, Trash2 } from 'lucide-react';
import { Avatar, Banner, Button, Checkbox, Dialog, EmptyState, Field, Input, SearchInput, Spinner, StatusPill, VisibilityNote, cn, formatDate, formatTime, matches, toDateInput, toast, useConfirm, validateRequired } from '@teamhub/ui';
import { canWith, friendlyError, TeamBadge, useActivePeople, useMe, useRealtime, useSupabase } from '@teamhub/sdk';
import { roster, sessionTitle, useAttSettings, type Presence, type Session } from '../data';
import { CheckInForm } from './CheckIn';

/** Roster checklist with big tap targets, "mark all present", live self check-ins (spec §13.1). */
export function SessionPage() {
  const { id } = useParams();
  const sb = useSupabase();
  const me = useMe();
  const qc = useQueryClient();
  const nav = useNavigate();
  const confirm = useConfirm();
  const settings = useAttSettings();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(false);
  const session = useQuery({
    queryKey: ['attendance', 'session', id],
    queryFn: async () => {
      const { data, error } = await sb.from('att_sessions').select('*').eq('id', id!).maybeSingle();
      if (error) throw error;
      return data as Session | null;
    },
  });
  const presence = useQuery({
    queryKey: ['attendance', 'session-presence', id],
    queryFn: async () => {
      const { data, error } = await sb.from('att_presence').select('*').eq('session_id', id!);
      if (error) throw error;
      return data as Presence[];
    },
  });
  const everyone = useActivePeople(null);
  const s = session.data;
  const canTake = !!s && canWith(me, 'attendance.take', s.team_id);
  const editable = !!s && ((canTake && s.date >= toDateInput(new Date(Date.now() - 86_400_000))) || canWith(me, 'attendance.edit', s.team_id));
  useRealtime('att_presence', `session_id=eq.${id}`, () => qc.invalidateQueries({ queryKey: ['attendance', 'session-presence', id] }), canTake);

  // Wait for who is here too, or everyone shows as absent for a moment.
  if (session.isLoading || presence.isLoading) return <Spinner className="m-8" />;
  if (!s) return <EmptyState title="Session not found" action={<Button onClick={() => nav('/attendance')}>Back</Button>} />;

  const refresh = () => qc.invalidateQueries({ queryKey: ['attendance'] });
  const byUser = new Map((presence.data ?? []).map((p) => [p.user_id, p]));

  if (!canTake && !canWith(me, 'attendance.view_all', s.team_id)) {
    const mine = byUser.get(me.id);
    return (
      <div className="mx-auto max-w-md px-4 py-8">
        <BackLink />
        <h1 className="text-[20px] font-semibold">{sessionTitle(s)}</h1>
        <p className="mb-5 text-[13px] text-muted">{formatDate(s.date, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        {mine ? <Banner tone="success" title="You're checked in">{mine.check_in && `at ${formatTime(mine.check_in)}`}</Banner> : !s.closed && settings.selfCheckIn ? <CheckInForm sessionId={s.id} onDone={refresh} /> : <Banner tone="info">You weren't marked present for this practice.</Banner>}
      </div>
    );
  }

  const list = roster(everyone, s, settings.includeMentors);
  // People marked present who aren't on the roster (e.g. a guest from another team) still show.
  const extras = (presence.data ?? []).filter((p) => !list.some((x) => x.id === p.user_id)).map((p) => everyone.find((x) => x.id === p.user_id)).filter(Boolean) as typeof list;
  const all = [...list, ...extras].filter((p) => !q || matches(p.name, q));
  const present = list.filter((p) => byUser.has(p.id)).length;

  const toggle = async (userId: string, on: boolean) => {
    const res = on ? await sb.from('att_presence').upsert({ session_id: s.id, user_id: userId, check_in: new Date().toISOString() }) : await sb.from('att_presence').delete().match({ session_id: s.id, user_id: userId });
    if (res.error) toast.error(friendlyError(res.error));
    // Wait for the refetch so the box keeps its spinner until the new state is really there.
    await qc.invalidateQueries({ queryKey: ['attendance', 'session-presence', id] });
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-5 sm:px-6">
      <BackLink />
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-[20px] font-semibold tracking-tight">{sessionTitle(s)}</h1>
          <p className="text-[13px] text-muted">
            {formatDate(s.date, { weekday: 'long', month: 'long', day: 'numeric' })} <TeamBadge teamId={s.team_id} />
          </p>
        </div>
        <StatusPill label={s.closed ? 'Closed' : 'Open'} tone={s.closed ? 'neutral' : 'success'} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="tabular mr-auto text-[15px] font-semibold">
          {present}
          <span className="font-normal text-muted"> / {list.length} present</span>
        </span>
        {!s.closed && canTake && settings.selfCheckIn && (
          <Button icon={<QrCode className="size-4" />} onClick={() => nav(`/attendance/session/${s.id}/code`)}>
            Show check-in code
          </Button>
        )}
        {editable && (
          <Button
            icon={<CheckCheck className="size-4" />}
            onClick={async () => {
              const missing = list.filter((p) => !byUser.has(p.id));
              if (!missing.length) return;
              const { error } = await sb.from('att_presence').upsert(missing.map((p) => ({ session_id: s.id, user_id: p.id, check_in: new Date().toISOString() })));
              if (error) toast.error(friendlyError(error));
              await refresh();
            }}
          >
            Mark all present
          </Button>
        )}
        {!s.closed && canTake && (
          <Button
            variant="primary"
            icon={<Square className="size-4" />}
            onClick={async () => {
              const out = settings.trackHours && (await confirm({ title: 'End practice', body: 'Check everyone who is still here out now?', confirmLabel: 'End & check everyone out' }));
              const { error } = await sb.rpc('att_close', { p_session: s.id, p_check_out: !!out });
              if (error) return toast.error(friendlyError(error));
              toast.success('Practice ended');
              refresh();
            }}
          >
            End practice
          </Button>
        )}
      </div>

      <SearchInput value={q} onChange={setQ} placeholder="Find someone…" className="mb-3" />
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
        {all.map((p) => {
          const pr = byUser.get(p.id);
          return (
            <li key={p.id} className={cn('flex min-h-14 items-center gap-3 px-4 py-2', pr && 'bg-success-soft/40')}>
              <Checkbox size="lg" checked={!!pr} disabled={!editable} onChange={(v) => toggle(p.id, v)} label={<span className="sr-only">{p.name} present</span>} />
              <Avatar name={p.name} src={p.avatarUrl} size={32} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-medium">{p.name}</span>
                {/* Phones: the times go under the name so the name stays readable. */}
                {settings.trackHours && pr && (
                  <span className="tabular block text-[12.5px] text-muted sm:hidden">
                    {pr.check_in ? formatTime(pr.check_in) : '–'} – {pr.check_out ? formatTime(pr.check_out) : '…'}
                  </span>
                )}
              </span>
              {settings.trackHours && pr && (
                <span className="tabular text-[12.5px] text-muted max-sm:hidden">
                  {pr.check_in ? formatTime(pr.check_in) : '–'} – {pr.check_out ? formatTime(pr.check_out) : '…'}
                </span>
              )}
              {settings.trackHours && pr && !pr.check_out && editable && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<LogOut className="size-3.5" />}
                  onClick={async () => {
                    const { error } = await sb.from('att_presence').update({ check_out: new Date().toISOString() }).match({ session_id: s.id, user_id: p.id });
                    if (error) toast.error(friendlyError(error));
                    await refresh();
                  }}
                >
                  Out
                </Button>
              )}
            </li>
          );
        })}
        {!all.length && <li className="px-4 py-8 text-center text-[13px] text-faint">No one on this roster yet.</li>}
      </ul>
      <VisibilityNote className="mt-3">Each person sees only their own attendance; captains and mentors see everyone's.</VisibilityNote>
      <div className="mt-6 flex flex-wrap gap-2">
      {(canWith(me, 'attendance.edit', s.team_id) || (canTake && s.date >= toDateInput(new Date(Date.now() - 864e5)))) && (
        <Button variant="ghost" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
          Edit details
        </Button>
      )}
      {canWith(me, 'attendance.edit', s.team_id) && (
        <Button
          variant="ghost"
          className="text-danger"
          icon={<Trash2 className="size-4" />}
          onClick={async () => {
            if (!(await confirm({ title: 'Delete this session?', body: 'Its attendance records are deleted too.', danger: true, confirmLabel: 'Delete' }))) return;
            const { error } = await sb.from('att_sessions').delete().eq('id', s.id);
            if (error) return toast.error(friendlyError(error));
            refresh();
            nav('/attendance');
          }}
        >
          Delete session
        </Button>
      )}
      </div>
      {editing && <EditSession session={s} onClose={() => (setEditing(false), refresh())} />}
    </div>
  );
}

const timeOf = (iso: string | null) => (iso ? new Date(iso).toTimeString().slice(0, 5) : '');
const at = (date: string, time: string) => (time ? new Date(`${date}T${time}`).toISOString() : null);

/** Fix a session's name, date or times (e.g. it was started on the wrong day). */
function EditSession({ session: s, onClose }: { session: Session; onClose: () => void }) {
  const sb = useSupabase();
  const [v, setV] = useState({ title: s.title ?? '', date: s.date, start: timeOf(s.starts_at), end: timeOf(s.ends_at) });
  const save = async () => {
    if (!validateRequired()) return;
    if (v.start && v.end && v.end <= v.start) return toast.error('The end time must be after the start time');
    const { error } = await sb.from('att_sessions').update({ title: v.title.trim() || null, date: v.date, starts_at: at(v.date, v.start), ends_at: at(v.date, v.end) }).eq('id', s.id);
    if (error) return toast.error(friendlyError(error));
    toast.success('Session updated');
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Edit practice session" footer={<Button variant="primary" onClick={save}>Save</Button>}>
      <div className="space-y-3">
        <Field label="Name" optional>{(id) => <Input id={id} maxLength={120} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="Practice" />}</Field>
        <Field label="Date" required>{(id) => <Input id={id} type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start" optional>{(id) => <Input id={id} type="time" value={v.start} onChange={(e) => setV({ ...v, start: e.target.value })} />}</Field>
          <Field label="End" optional>{(id) => <Input id={id} type="time" value={v.end} onChange={(e) => setV({ ...v, end: e.target.value })} />}</Field>
        </div>
      </div>
    </Dialog>
  );
}

function BackLink() {
  const nav = useNavigate();
  return (
    <button type="button" onClick={() => nav('/attendance')} className="mb-4 inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg">
      <ArrowLeft className="size-4" /> Attendance
    </button>
  );
}
