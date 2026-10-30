import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Award, Link2, Pause, Pencil, Play, Plus, Shuffle, Trash2, X } from 'lucide-react';
import { Form, Badge, Button, Card, CardHeader, Dialog, EmptyState, Field, IconButton, Input, Markdown, ProgressRing, Segmented, Spinner, Textarea, toast, useConfirm, validateRequired } from '@teamhub/ui';
import { EntityLink, friendlyError, ModuleHeader, ModulePurpose, Person, PersonPicker, Slot, useCan, useRows, useSeason, useSupabase, useTeamScope } from '@teamhub/sdk';

interface Question {
  id: string;
  team_id: string | null;
  question: string;
  notes: string | null;
  tags: string[];
  owner: string | null;
}
interface Criterion {
  id: string;
  team_id: string | null;
  award: string;
  criterion: string;
  evidence: string[];
  season: string;
  sort: number;
}

const STARTER: [string, string][] = [
  ['Engineering documentation', 'Our design process is documented from problem to solution'],
  ['Engineering documentation', 'We show iterations and why we changed designs'],
  ['Innovation & design', 'We can explain a unique or creative solution on our robot'],
  ['Control & software', 'We can explain our autonomous strategy and how we tested it'],
  ['Control & software', 'We use sensors and/or control algorithms purposefully'],
  ['Outreach & community', 'We can show the impact of our outreach (people reached, hours)'],
  ['Team sustainability', 'We have a plan for funding, mentoring and new members'],
  ['Team', 'Every member can describe their role and what they learned'],
];

export default function JudgingRoutes() {
  const [tab, setTab] = useState<'practice' | 'evidence'>('practice');
  return (
    <div>
      <ModuleHeader moduleId="judging">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented size="sm" value={tab} onChange={setTab} options={[{ value: 'practice', label: 'Interview practice' }, { value: 'evidence', label: 'Award evidence' }]} />
          <Slot name="judging.shortcuts" props={{}} />
        </div>
      </ModuleHeader>
      <div className="mx-auto max-w-4xl px-4 py-5 sm:px-6">{tab === 'practice' ? <Practice /> : <Evidence />}</div>
    </div>
  );
}

function Practice() {
  const confirm = useConfirm();
  const qs = useRows<Question>(['judging', 'questions'], (sb) => sb.from('jdg_questions').select('*').order('question'));
  const scope = useTeamScope();
  const canManage = useCan('judging.manage');
  const sb = useSupabase();
  const qc = useQueryClient();
  const [drill, setDrill] = useState<Question | null>(null);
  const [secs, setSecs] = useState(0);
  const [running, setRunning] = useState(false);
  const [adding, setAdding] = useState(false);
  const [v, setV] = useState({ question: '', notes: '', owner: [] as string[] });
  const [editId, setEditId] = useState<string | null>(null);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [running]);
  const list = (qs.data ?? []).filter((q) => !scope || !q.team_id || q.team_id === scope);
  const next = () => {
    if (!list.length) return;
    const pool = list.filter((q) => q.id !== drill?.id);
    setDrill(pool[Math.floor(Math.random() * pool.length)] ?? list[0]);
    setSecs(0);
    setRunning(true);
  };
  if (qs.isLoading) return <Spinner />;
  return (
    <div className="space-y-4">
      <Card className="p-5 text-center">
        {drill ? (
          <>
            <p className="text-[12px] font-semibold uppercase tracking-wider text-faint">Judge asks</p>
            <p className="mx-auto mt-2 max-w-xl text-[20px] font-semibold leading-snug">{drill.question}</p>
            {drill.owner && (
              <p className="mt-2 text-[13px] text-muted">
                Usually answered by <Person id={drill.owner} size="sm" />
              </p>
            )}
            <div className="mt-4 flex items-center justify-center gap-3">
              <ProgressRing value={Math.min(1, secs / 90)} size={56} color={secs > 90 ? 'var(--danger)' : 'var(--accent)'}>
                {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}
              </ProgressRing>
              <Button icon={running ? <Pause className="size-4" /> : <Play className="size-4" />} onClick={() => setRunning(!running)}>
                {running ? 'Pause' : 'Resume'}
              </Button>
              <Button variant="primary" icon={<Shuffle className="size-4" />} onClick={next}>
                Next question
              </Button>
            </div>
            {drill.notes && <Markdown source={drill.notes} className="mx-auto mt-4 max-w-xl rounded-md bg-bg-subtle p-3 text-left text-[13px]" />}
            <p className="mt-2 text-[11.5px] text-faint">Aim for clear answers under 90 seconds.</p>
          </>
        ) : (
          <div className="py-4">
            <p className="mb-3 text-[14px] text-muted">Drill with random questions from your bank, with a timer.</p>
            <Button variant="primary" size="lg" icon={<Shuffle className="size-4" />} onClick={next} disabled={!list.length}>
              Start a drill
            </Button>
          </div>
        )}
      </Card>
      <div className="flex items-center justify-between">
        <h2 className="text-[12px] font-semibold uppercase tracking-wider text-faint">Question bank ({list.length})</h2>
        {canManage && (
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => (setEditId(null), setV({ question: '', notes: '', owner: [] }), setAdding(true))}>
            Add question
          </Button>
        )}
      </div>
      {!list.length ? (
        <EmptyState icon={<Award />} title="No questions yet" body={<ModulePurpose moduleId="judging" compact className="mt-2 text-left" />} />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {list.map((q) => (
            <li key={q.id} className="flex items-start gap-3 px-4 py-2.5 text-[13.5px] max-sm:flex-wrap max-sm:items-center">
              <span className="flex-1 max-sm:basis-full">{q.question}</span>
              {q.owner && <span className="flex max-sm:mr-auto"><Person id={q.owner} size="sm" /></span>}
              {canManage && (
                <IconButton
                  label="Edit question"
                  size="sm"
                  onClick={() => {
                    setEditId(q.id);
                    setV({ question: q.question, notes: q.notes ?? '', owner: q.owner ? [q.owner] : [] });
                    setAdding(true);
                  }}
                >
                  <Pencil className="size-4" />
                </IconButton>
              )}
              {canManage && (
                <IconButton
                  label="Delete question"
                  size="sm"
                  onClick={async () => {
                    if (!(await confirm({ title: 'Delete this question?', body: 'It is removed from practice for everyone.', danger: true, confirmLabel: 'Delete' }))) return;
                    const { error } = await sb.from('jdg_questions').delete().eq('id', q.id);
                    if (error) toast.error(friendlyError(error));
                    qc.invalidateQueries({ queryKey: ['judging'] });
                  }}
                >
                  <Trash2 className="size-4" />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={adding}
        onOpenChange={setAdding}
        title={editId ? 'Edit interview question' : 'Add an interview question'}
        footer={
          <Button
            variant="primary"
            onClick={async () => {
              if (!v.question.trim()) return;
              const body = { question: v.question.trim(), notes: v.notes || null, owner: v.owner[0] ?? null };
              const { error } = editId ? await sb.from('jdg_questions').update(body).eq('id', editId) : await sb.from('jdg_questions').insert({ ...body, team_id: scope });
              if (error) return toast.error(friendlyError(error));
              setV({ question: '', notes: '', owner: [] });
              setAdding(false);
              setEditId(null);
              qc.invalidateQueries({ queryKey: ['judging'] });
            }}
          >
            {editId ? 'Save' : 'Add'}
          </Button>
        }
      >
        <div className="space-y-3">
          <Field label="Question" required>{(id) => <Input id={id} autoFocus maxLength={300} value={v.question} onChange={(e) => setV({ ...v, question: e.target.value })} placeholder="What was your biggest design challenge?" />}</Field>
          <Field label="Talking points" optional>{(id) => <Textarea id={id} rows={3} maxLength={2000} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} />}</Field>
          <Field label="Who usually answers" optional>{() => <PersonPicker value={v.owner} onChange={(owner) => setV({ ...v, owner })} />}</Field>
        </div>
      </Dialog>
    </div>
  );
}

function Evidence() {
  const confirm = useConfirm();
  const season = useSeason();
  const cr = useRows<Criterion>(['judging', 'criteria', season], (sb) => sb.from('jdg_criteria').select('*').eq('season', season).order('award').order('sort'));
  const scope = useTeamScope();
  const canManage = useCan('judging.manage');
  const sb = useSupabase();
  const qc = useQueryClient();
  const [adding, setAdding] = useState<string | null>(null);
  const [evidence, setEvidence] = useState('');
  const [newC, setNewC] = useState({ award: '', criterion: '' });
  const list = (cr.data ?? []).filter((c) => !scope || !c.team_id || c.team_id === scope);
  const awards = [...new Set(list.map((c) => c.award))];
  const refresh = () => qc.invalidateQueries({ queryKey: ['judging'] });
  const setEv = async (c: Criterion, ev: string[]) => {
    const { error } = await sb.from('jdg_criteria').update({ evidence: ev }).eq('id', c.id);
    if (error) toast.error(friendlyError(error));
    refresh();
  };
  if (cr.isLoading) return <Spinner />;
  const covered = list.filter((c) => c.evidence.length).length;
  return (
    <div className="space-y-4">
      {list.length > 0 && (
        <p className="text-[13px] text-muted">
          {covered} of {list.length} criteria have evidence. Criteria without evidence are your to-do list before judging.
        </p>
      )}
      {!list.length && (
        <EmptyState
          icon={<Award />}
          title="No award criteria yet"
          body="Add the criteria from this season's competition manual, or start with a generic set you can edit."
          action={
            canManage && (
              <Button
                onClick={async () => {
                  const { error } = await sb.from('jdg_criteria').insert(STARTER.map(([award, criterion], i) => ({ award, criterion, sort: i, team_id: scope })));
                  if (error) return toast.error(friendlyError(error));
                  refresh();
                }}
              >
                Add the generic starter set
              </Button>
            )
          }
        />
      )}
      {awards.map((a) => (
        <Card key={a}>
          <CardHeader title={a} />
          <ul className="divide-y divide-border px-4 pb-2">
            {list
              .filter((c) => c.award === a)
              .map((c) => (
                <li key={c.id} className="space-y-1.5 py-2.5">
                  <div className="flex items-start gap-2 text-[13.5px]">
                    <span className={`mt-1 size-2 shrink-0 rounded-full ${c.evidence.length ? 'bg-success' : 'bg-warning'}`} aria-label={c.evidence.length ? 'Has evidence' : 'Needs evidence'} />
                    <span className="flex-1">{c.criterion}</span>
                    {canManage && (
                      <IconButton
                        label="Delete criterion"
                        size="sm"
                        onClick={async () => {
                          if (!(await confirm({ title: 'Delete this criterion?', body: c.evidence.length ? 'The evidence linked to it is removed too.' : undefined, danger: true, confirmLabel: 'Delete' }))) return;
                          const { error } = await sb.from('jdg_criteria').delete().eq('id', c.id);
                          if (error) toast.error(friendlyError(error));
                          refresh();
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </IconButton>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 pl-4">
                    {c.evidence.map((e) => (
                      <span key={e} className="inline-flex items-center gap-0.5">
                        <EntityLink refStr={e} />
                        {canManage && (
                          <IconButton label="Remove evidence" size="sm" className="size-6" onClick={() => setEv(c, c.evidence.filter((x) => x !== e))}>
                            <X className="size-3" />
                          </IconButton>
                        )}
                      </span>
                    ))}
                    {canManage &&
                      (adding === c.id ? (
                        <Form
                          className="flex gap-1"
                          onSubmit={(ev) => {
                            ev.preventDefault();
                            const val = evidence.trim();
                            if (!/^https?:\/\//.test(val) && !/^[a-z-]+:[a-z]+:.+/.test(val)) return toast.error('Paste a link (https://…) to the portfolio page, notebook entry, photo album…');
                            setEv(c, [...c.evidence, val]);
                            setEvidence('');
                            setAdding(null);
                          }}
                        >
                          <Input autoFocus className="h-7 w-72 text-[12px]" value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="https://… (portfolio page, notebook entry link…)" />
                          <Button size="sm" type="submit">
                            Add
                          </Button>
                        </Form>
                      ) : (
                        <Button size="sm" variant="ghost" icon={<Link2 className="size-3.5" />} onClick={() => setAdding(c.id)}>
                          Add evidence
                        </Button>
                      ))}
                  </div>
                </li>
              ))}
          </ul>
        </Card>
      ))}
      {canManage && list.length > 0 && (
        <Form
          className="flex flex-wrap gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!validateRequired(e.currentTarget)) return;
            if (!newC.award.trim() || !newC.criterion.trim()) return;
            const { error } = await sb.from('jdg_criteria').insert({ award: newC.award.trim(), criterion: newC.criterion.trim(), team_id: scope, sort: list.length });
            if (error) return toast.error(friendlyError(error));
            setNewC({ award: newC.award, criterion: '' });
            refresh();
          }}
        >
          <Input list="jdg-awards" className="w-56" placeholder="Award" value={newC.award} onChange={(e) => setNewC({ ...newC, award: e.target.value })} />
          <datalist id="jdg-awards">
            {awards.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
          <Input className="min-w-60 flex-1" placeholder="Criterion" value={newC.criterion} onChange={(e) => setNewC({ ...newC, criterion: e.target.value })} />
          <Button type="submit" icon={<Plus className="size-4" />}>
            Add criterion
          </Button>
        </Form>
      )}
      <Badge>Season {season}</Badge>
    </div>
  );
}
