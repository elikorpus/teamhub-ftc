import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, GripVertical, Sparkles, X } from 'lucide-react';
import { Button, Card, CardHeader, IconButton, Input, Spinner, cn, toast } from '@teamhub/ui';
import { canWith, friendlyError, runtime, useMe, useSupabase, useTeamScope, useViewableTeams } from '@teamhub/sdk';
import type { EventContext } from './event';
import type { useScoutingStats } from './stats';

interface Pick {
  team: number;
  note?: string;
  dnp?: boolean;
}

export function PickList({ ctx, stats, onTeam }: { ctx: EventContext; stats: ReturnType<typeof useScoutingStats>; onTeam: (n: number) => void }) {
  const sb = useSupabase();
  const me = useMe();
  const qc = useQueryClient();
  const scope = useTeamScope();
  const teams = runtime().config.teams;
  const mine = useViewableTeams();
  const ours = teams.find((t) => t.id === scope) ?? mine.find((t) => t.number && ctx.ours.includes(t.number)) ?? teams.find((t) => t.number && ctx.ours.includes(t.number)) ?? mine[0] ?? teams[0];
  const canEdit = canWith(me, 'scouting.manage_picklist', ours.id);
  const q = useQuery({
    queryKey: ['scouting', 'picklist', ctx.code, ours.id],
    queryFn: async () => ((await sb.from('sct_picklist').select('ranking').match({ event_code: ctx.code, team_id: ours.id }).maybeSingle()).data?.ranking ?? []) as Pick[],
  });
  const [list, setList] = useState<Pick[]>([]);
  const [drag, setDrag] = useState<number | null>(null);
  useEffect(() => setList(q.data ?? []), [q.data]);
  const save = async (next: Pick[]) => {
    setList(next);
    const { error } = await sb.from('sct_picklist').upsert({ event_code: ctx.code, team_id: ours.id, ranking: next, updated_at: new Date().toISOString() });
    if (error) toast.error(friendlyError(error));
    qc.invalidateQueries({ queryKey: ['scouting', 'picklist'] });
  };
  const move = (i: number, to: number) => {
    const n = [...list];
    const [x] = n.splice(i, 1);
    n.splice(to, 0, x);
    save(n);
  };
  const name = (n: number) => ctx.teams.find((t) => t.number === n)?.name;
  const t = (n: number) => ctx.teams.find((x) => x.number === n);
  // Best available by the data: pick score, then OPR, excluding our own team and already-ranked teams.
  const suggestions = ctx.teams
    .filter((x) => x.number !== ours.number && !list.some((p) => p.team === x.number))
    .map((x) => ({ n: x.number, s: stats.composite.get(x.number) ?? null, opr: x.stats?.opr?.totalPointsNp ?? null }))
    .sort((a, b) => (b.s ?? -99) - (a.s ?? -99) || (b.opr ?? -1) - (a.opr ?? -1));
  // Wait for the saved ranking: adding a team before it loads would save a one-team list over it.
  if (q.isLoading) return <Spinner className="m-8" />;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Card>
        <CardHeader title={`Pick list: ${ours.name}`} subtitle={canEdit ? 'Drag to reorder · notes save automatically' : undefined} />
        <ol className="space-y-1 px-2 pb-3">
          {list.map((p, i) => (
            <li
              key={p.team}
              draggable={canEdit}
              onDragStart={() => setDrag(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => drag != null && drag !== i && move(drag, i)}
              className={cn('flex items-center gap-2 rounded-md border border-border bg-surface px-2 py-1.5 text-[13.5px]', p.dnp && 'opacity-50')}
            >
              {canEdit && <GripVertical className="size-4 cursor-grab text-faint" />}
              <span className="tabular w-6 text-right font-semibold text-muted">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <button className={cn('font-semibold hover:underline', p.dnp && 'line-through')} onClick={() => onTeam(p.team)}>
                  {p.team}
                </button>{' '}
                <span className="text-muted">{name(p.team)}</span>{' '}
                <span className="text-[11.5px] text-faint">
                  {t(p.team)?.stats?.rank ? `rank ${t(p.team)!.stats!.rank}` : ''} {t(p.team)?.stats?.opr ? `· OPR ${t(p.team)!.stats!.opr!.totalPointsNp.toFixed(1)}` : ''}
                </span>
                {canEdit ? (
                  <Input className="mt-1 h-7 text-[12px]" value={p.note ?? ''} placeholder="Note" onChange={(e) => setList(list.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))} onBlur={() => save(list)} />
                ) : (
                  p.note && <span className="block text-[12px] text-muted">{p.note}</span>
                )}
              </span>
              {canEdit && (
                <>
                  <IconButton label="Up" size="sm" disabled={i === 0} onClick={() => move(i, i - 1)}>
                    <ArrowUp className="size-3.5" />
                  </IconButton>
                  <IconButton label="Down" size="sm" disabled={i === list.length - 1} onClick={() => move(i, i + 1)}>
                    <ArrowDown className="size-3.5" />
                  </IconButton>
                  <Button size="sm" variant="ghost" onClick={() => save(list.map((x, j) => (j === i ? { ...x, dnp: !x.dnp } : x)))}>
                    {p.dnp ? 'Undo DNP' : 'DNP'}
                  </Button>
                  <IconButton label="Remove" size="sm" onClick={() => save(list.filter((_, j) => j !== i))}>
                    <X className="size-3.5" />
                  </IconButton>
                </>
              )}
            </li>
          ))}
          {!list.length && <li className="px-2 py-6 text-center text-[13px] text-faint">Add teams from the suggestions to start ranking.</li>}
        </ol>
      </Card>
      <Card>
        <CardHeader
          icon={<Sparkles className="size-4" />}
          title="Suggested by the data"
          subtitle="Best available by pick score (OPR + your scouting)"
          action={
            canEdit &&
            suggestions.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => save([...list, ...suggestions.slice(0, 8).map((s) => ({ team: s.n }))])}>
                Add top 8
              </Button>
            )
          }
        />
        <ul className="max-h-[60vh] space-y-0.5 relative overflow-y-auto px-2 pb-3 text-[13px]">
          {suggestions.map((s) => (
            <li key={s.n} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-bg-subtle">
              <button className="flex-1 text-left" onClick={() => onTeam(s.n)}>
                <span className="font-medium">{s.n}</span> <span className="text-muted">{name(s.n)}</span>
              </button>
              <span className="tabular text-[12px] text-muted">{s.s != null ? `${s.s > 0 ? '+' : ''}${s.s.toFixed(2)}` : s.opr != null ? `OPR ${s.opr.toFixed(0)}` : '–'}</span>
              {canEdit && (
                <Button size="sm" variant="ghost" onClick={() => save([...list, { team: s.n }])}>
                  Add
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
