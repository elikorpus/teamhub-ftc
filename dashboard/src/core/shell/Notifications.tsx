import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { BareButton, Button, EmptyState, IconButton, RelativeTime, Sheet, Spinner, cn, sameDay } from '@teamhub/ui';
import { getModule, parseRef, PersonName, useMe, useRealtime, useSupabase, EntityLink } from '@teamhub/sdk';

interface Notif {
  id: number;
  type: string;
  ref: string;
  actor: string | null;
  created_at: string;
  read_at: string | null;
}

const CORE_TEXT: Record<string, string> = {
  'people.request': 'asked to join the team',
  'people.approved': 'approved your request to join',
  'people.deletion_request': 'asked for their account to be deleted',
};

function notifText(n: Notif): string {
  if (CORE_TEXT[n.type]) return CORE_TEXT[n.type];
  const mod = n.type.split('.')[0];
  return getModule(mod)?.client.notifications?.[n.type]?.text ?? 'updated something';
}

function notifHref(n: Notif): string | null {
  const r = parseRef(n.ref);
  if (!r) return null;
  if (r.module === 'core') return r.type === 'person' ? (n.type === 'people.request' ? '/people?tab=requests' : `/people/${r.id}`) : '/';
  return null;
}

/** Bell + Spark-style inbox (in-app only, spec §10.5). Realtime on the user's own rows. */
export function NotificationsButton() {
  const sb = useSupabase();
  const me = useMe();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const key = ['core', 'notifications'];
  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(60);
      if (error) throw error;
      return data as Notif[];
    },
  });
  useRealtime('notifications', `user_id=eq.${me.id}`, () => qc.invalidateQueries({ queryKey: key }));
  const unread = (q.data ?? []).filter((n) => !n.read_at).length;
  const markRead = async (ids: number[]) => {
    if (!ids.length) return;
    await sb.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids);
    qc.invalidateQueries({ queryKey: key });
  };
  const today = (q.data ?? []).filter((n) => sameDay(new Date(n.created_at), new Date()));
  const earlier = (q.data ?? []).filter((n) => !sameDay(new Date(n.created_at), new Date()));

  const item = (n: Notif) => {
    const href = notifHref(n);
    const open = async () => {
      await markRead([n.id]);
      if (href) {
        setOpen(false);
        nav(href);
      }
    };
    return (
      <li key={n.id} className={cn('flex gap-3 px-4 py-3', !n.read_at && 'bg-accent-soft/50')}>
        <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.read_at ? 'bg-transparent' : 'bg-accent')} />
        <div className="min-w-0 flex-1 text-[13.5px]">
          <BareButton type="button" onClick={open} className="text-left hover:underline">
            <strong className="font-semibold">{n.actor ? <PersonName id={n.actor} /> : 'TeamHub'}</strong> {notifText(n)}
          </BareButton>
          {parseRef(n.ref)?.module !== 'core' && (
            <div className="mt-1" onClickCapture={() => markRead([n.id]).then(() => setOpen(false))}>
              <EntityLink refStr={n.ref} />
            </div>
          )}
          <RelativeTime date={n.created_at} className="mt-0.5 block text-[12px] text-faint" />
        </div>
      </li>
    );
  };

  return (
    <>
      <IconButton label={unread ? `Notifications (${unread} unread)` : 'Notifications'} onClick={() => setOpen(true)} className="relative">
        <Bell className="size-[17px]" strokeWidth={1.9} />
        {unread > 0 && (
          <span className="tabular absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-4 text-white">{unread > 9 ? '9+' : unread}</span>
        )}
      </IconButton>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Notifications"
        footer={
          unread > 0 ? (
            <Button size="sm" icon={<CheckCheck className="size-4" />} onClick={() => markRead((q.data ?? []).filter((n) => !n.read_at).map((n) => n.id))}>
              Mark all read
            </Button>
          ) : undefined
        }
      >
        {q.isLoading ? (
          <Spinner className="m-8" />
        ) : !q.data?.length ? (
          <EmptyState icon={<Bell />} title="You're all caught up" body="Assignments, approvals and status changes show up here." />
        ) : (
          <div>
            {today.length > 0 && (
              <>
                <p className="px-4 pb-1 pt-3 text-[11.5px] font-semibold uppercase tracking-wider text-faint">Today</p>
                <ul className="divide-y divide-border">{today.map(item)}</ul>
              </>
            )}
            {earlier.length > 0 && (
              <>
                <p className="px-4 pb-1 pt-3 text-[11.5px] font-semibold uppercase tracking-wider text-faint">Earlier</p>
                <ul className="divide-y divide-border">{earlier.map(item)}</ul>
              </>
            )}
          </div>
        )}
      </Sheet>
    </>
  );
}
