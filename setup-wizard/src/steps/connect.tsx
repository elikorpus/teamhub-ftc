import { useEffect, useState } from 'react';
import { CheckCircle2, Database, ExternalLink, KeyRound } from 'lucide-react';
import type { TeamhubConfig } from '@teamhub/config-schema';
import { BareButton, Banner, Button, Checkbox, Field, Input, NameFields, joinName, Segmented, Select, Spinner, toast, validateRequired } from '@teamhub/ui';
import { TOOL_SLOT_LABELS } from '@teamhub/sdk';
import { api } from '../api';
import { Section, StepShell, TokenSteps, Why } from '../components';
import { hasSeveralTeams, useDraft } from '../draft';
import { ActionButton, Checklist, NextStep, useAction } from '../progress';
import type { StepProps } from './basics';

const HINTS: Record<string, string> = {
  team_chat: 'Google Chat, Discord, Slack, GroupMe, Remind… TeamHub has no chat on purpose; this link is shown wherever people might want to talk.',
  portfolio: 'Your engineering portfolio (Google Doc / Slides).',
  code_repo: 'Your robot code on GitHub.',
  cad: 'Your Onshape document or workspace.',
  drive: 'Shared Google Drive / OneDrive folder: big files go here, not in TeamHub.',
  manual: 'Paste this season’s competition manual URL.',
};
const PREFILL: Record<string, { label: string; url: string }> = {
  gm0: { label: 'Game Manual 0', url: 'https://gm0.org' },
  ftc_docs: { label: 'FTC Docs', url: 'https://ftc-docs.firstinspires.org' },
};
const ORDER = ['team_chat', 'portfolio', 'code_repo', 'cad', 'drive', 'website', 'social', 'manual', 'qa_forum'];
/** Filled in automatically; shown separately so it's clear nothing needs doing. */
const PREFILLED = ['ftcscout', 'gm0', 'ftc_docs'];

/** Links a team could have its own copy of (programs with several teams). */
const TEAMABLE = new Set(['team_chat', 'portfolio', 'code_repo', 'cad', 'drive', 'website', 'social', 'ftcscout']);

export function ToolLinksStep({ onNext, onBack }: StepProps) {
  const { draft, update } = useDraft();
  const c = draft.config;
  const multi = hasSeveralTeams(c);
  useEffect(() => {
    update((x) => {
      for (const [slot, v] of Object.entries(PREFILL)) if (!x.toolLinks.some((l) => l.slot === slot)) x.toolLinks.push({ slot, teamId: null, ...v, section: null, description: null });
      if (!x.toolLinks.some((l) => l.slot === 'ftcscout')) {
        const numbered = x.teams.filter((t) => t.number);
        const each = hasSeveralTeams(x) && numbered.length > 1;
        for (const t of each ? numbered : numbered.slice(0, 1))
          x.toolLinks.push({ slot: 'ftcscout', teamId: each ? t.id : null, label: 'FTCScout', url: `https://ftcscout.org/teams/${t.number}`, section: null, description: null });
      }
    });
  }, []);
  const get = (slot: string, teamId: string | null) => c.toolLinks.find((l) => l.slot === slot && (l.teamId ?? null) === teamId);
  const set = (slot: string, teamId: string | null, url: string, label?: string) =>
    update((x) => {
      const i = x.toolLinks.findIndex((l) => l.slot === slot && (l.teamId ?? null) === teamId);
      if (!url.trim()) {
        if (i >= 0) x.toolLinks.splice(i, 1);
        return;
      }
      const l = { slot, teamId, url: url.trim(), label: label ?? x.toolLinks[i]?.label ?? TOOL_SLOT_LABELS[slot], section: null, description: null };
      if (i >= 0) x.toolLinks[i] = l;
      else x.toolLinks.push(l);
    });
  const perTeam = (slot: string) => multi && c.toolLinks.some((l) => l.slot === slot && l.teamId);
  const [eachTeam, setEachTeam] = useState<Record<string, boolean>>({});
  const isEach = (slot: string) => eachTeam[slot] ?? perTeam(slot);
  const setMode = (slot: string, each: boolean) => {
    setEachTeam({ ...eachTeam, [slot]: each });
    update((x) => {
      const mine = x.toolLinks.filter((l) => l.slot === slot);
      x.toolLinks = x.toolLinks.filter((l) => l.slot !== slot);
      if (each) {
        // The FTCScout page is naturally per team; other links start empty for each team.
        if (slot === 'ftcscout') for (const t of x.teams.filter((t) => t.number)) x.toolLinks.push({ slot, teamId: t.id, label: 'FTCScout', url: `https://ftcscout.org/teams/${t.number}`, section: null, description: null });
      } else if (mine[0]) x.toolLinks.push({ ...mine[0], teamId: null });
    });
  };
  // FTCScout is only filled in when a team number was entered; otherwise it belongs with the team's own links.
  const [prefilled] = useState(() => PREFILLED.filter((s) => s !== 'ftcscout' || c.teams.some((t) => t.number) || c.toolLinks.some((l) => l.slot === s)));
  const valid = (url: string) => /^https?:\/\/\S+$/.test(url);
  const invalid = c.toolLinks.some((l) => !valid(l.url));

  const linkInput = (slot: string, teamId: string | null, name: string) => {
    const l = get(slot, teamId);
    // Still typing "https://"? Not an error yet.
    const bad = !!l && !valid(l.url) && !['https://', 'http://'].some((p) => p.startsWith(l.url));
    return (
      <div className="space-y-2">
        <Input
          type="url"
          placeholder="Paste a link (https://…)"
          value={l?.url ?? ''}
          onChange={(e) => set(slot, teamId, e.target.value)}
          onBlur={(e) => {
            const u = e.target.value.trim();
            if (u && !/^https?:\/\//i.test(u) && /^[\w-]+(\.[\w-]+)+/.test(u)) set(slot, teamId, `https://${u}`);
          }}
          aria-label={`${name} link`}
          aria-invalid={bad || undefined}
        />
        {bad && <p className="text-[12px] text-danger">Links start with https://</p>}
        {l && !bad && (
          <label className="flex items-center gap-2 text-[12.5px] text-muted">
            <span className="shrink-0">Button text</span>
            <Input className="h-8 max-w-64" value={l.label} placeholder={TOOL_SLOT_LABELS[slot]} onChange={(e) => set(slot, teamId, l.url, e.target.value)} aria-label={`${name} button text`} />
          </label>
        )}
      </div>
    );
  };

  const row = (slot: string) => {
    const name = TOOL_SLOT_LABELS[slot];
    const canSplit = multi && TEAMABLE.has(slot);
    const each = canSplit && isEach(slot);
    return (
      <li key={slot} className="space-y-2 px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <span className="text-[13.5px] font-medium">{name}</span>
          <span className="text-[11.5px] text-faint">Optional</span>
          {canSplit && (
            <Segmented
              size="sm"
              className="ml-auto"
              value={each ? 'team' : 'program'}
              onChange={(v) => setMode(slot, v === 'team')}
              options={[
                { value: 'program', label: 'One for the program' },
                { value: 'team', label: 'One per team' },
              ]}
            />
          )}
        </div>
        {HINTS[slot] && <p className="-mt-1 text-[12px] text-muted">{HINTS[slot]}</p>}
        {each ? (
          <ul className="space-y-3 border-l-2 border-border pl-3">
            {c.teams.map((t) => (
              <li key={t.id} className="space-y-1.5">
                <p className="flex items-center gap-1.5 text-[12.5px] font-medium">
                  <span className="size-2 rounded-full" style={{ background: t.color }} />
                  {t.name || `Team ${t.shortCode}`}
                </p>
                {linkInput(slot, t.id, `${name} for ${t.name || t.shortCode}`)}
              </li>
            ))}
          </ul>
        ) : (
          linkInput(slot, null, name)
        )}
      </li>
    );
  };
  return (
    <StepShell
      title={multi ? "Your teams' tools" : "Your team's tools"}
      subtitle="Links to the tools you already use. They show up as quick-link buttons in the tabs where they help, like your team chat next to announcements."
      onBack={onBack}
      onNext={onNext}
      nextDisabled={invalid}
    >
      <Banner tone="info">
        Everything on this page is optional. Skip anything you don't use and press Continue. These links are saved only in your team's private database, never in your public GitHub copy, and you can change them any time on the dashboard's Links page.
        {multi && ' Links like the code repository can be one for the whole program or one per team: people then see their own team’s link.'}
      </Banner>
      <Section title={multi ? 'Your links' : "Your team's links"}>
        <ul className="-mx-4 divide-y divide-border">{[...ORDER, ...PREFILLED.filter((s) => !prefilled.includes(s))].map(row)}</ul>
      </Section>
      <Section title="Already filled in for you" description="Handy FTC links. Keep them, change them, or clear a box to remove one.">
        <ul className="-mx-4 divide-y divide-border">{prefilled.map(row)}</ul>
      </Section>
    </StepShell>
  );
}

interface ProjectRow {
  ref: string;
  name: string;
  region: string;
  status: string;
}

export function ConnectSupabase({ onNext, onBack }: StepProps) {
  const { draft, update, setDraft, server, refreshServer } = useDraft();
  const c = draft.config;
  const [pat, setPat] = useState('');
  const [remember, setRemember] = useState(true);
  const [projects, setProjects] = useState<ProjectRow[] | null>(null);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<{ lines: string[]; sql: string; fresh: boolean } | null>(null);
  const [showSql, setShowSql] = useState(false);
  const [existing, setExisting] = useState(false);
  const [dataApi, setDataApi] = useState<{ schemas: string[]; ok: boolean } | null>(null);

  useEffect(() => {
    if (server.supabase.connected && !projects) api<{ projects: ProjectRow[] }>('/supabase/projects').then((r) => setProjects(r.projects)).catch((e) => setProjectsError((e as Error).message));
  }, [server.supabase.connected, projects]);
  useEffect(() => {
    if (c.supabase.projectRef) api('/plan', c).then(setPlan).catch((e) => toast.error(e.message));
     
  }, [c.supabase.projectRef]);

  const connect = async () => {
    setBusy(true);
    try {
      const r = await api<{ projects: ProjectRow[] }>('/supabase/token', { pat, remember });
      setProjects(r.projects);
      await refreshServer();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const select = async (ref: string) => {
    setBusy(true);
    try {
      const r = await api<{ url: string; anonKey: string; projectRef: string; existingInstall: boolean; dataApi: { schemas: string[]; ok: boolean } | null }>('/supabase/select', { ref, remember });
      setExisting(r.existingInstall);
      setDataApi(r.dataApi);
      update((x) => void (x.supabase = { url: r.url, anonKey: r.anonKey, projectRef: r.projectRef }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const applyAction = useAction<{ log: { step: string; ok: boolean; detail?: string }[] }>();
  const apply = async () => {
    try {
      await api('/config', c);
    } catch (e) {
      return toast.error((e as Error).message);
    }
    const r = await applyAction.run('/apply', { config: c }, (x) => x.log.every((l) => l.ok));
    if (r) setDraft((d) => ({ ...d, done: { ...d.done, applied: true } }));
  };

  return (
    <StepShell title="Connect Supabase" subtitle="Supabase is your team's database, logins and file storage: on your own free account." onBack={onBack} onNext={onNext} nextDisabled={!draft.done.applied} nextLabel="Continue">
      <Section title="1. Create a free Supabase project" description="Skip this if you already made one for TeamHub.">
        <ol className="list-decimal space-y-1 pl-5 text-[13.5px] text-muted">
          <li>
            Go to{' '}
            <a className="font-medium text-accent hover:underline" href="https://supabase.com/dashboard/new" target="_blank" rel="noreferrer">
              supabase.com/dashboard/new <ExternalLink className="inline size-3" />
            </a>{' '}
            (sign up with GitHub if you don’t have an account).
          </li>
          <li>
            <strong>Organization</strong>: use your own (or create one). The free plan includes two free projects, so give TeamHub its own.
          </li>
          <li>
            <strong>Project name</strong>: your program’s name. <strong>Database password</strong>: click Generate and save it in a password manager (TeamHub
            never needs it). <strong>Region</strong>: the one closest to your team.
          </li>
          <li>
            <strong>Compute size</strong> (if shown): the free one (Nano) is plenty.
          </li>
          <li>
            Under <strong>Security</strong>:
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              <li>
                <strong>Enable Data API</strong>: <strong>on</strong> (required, the website talks to your database through it), and keep it on the{' '}
                <strong>public</strong> schema. Don’t switch it to a separate “api” schema.
              </li>
              <li>
                <strong>Automatically expose new tables and functions</strong>: <strong>off</strong> is recommended. TeamHub gives its tables exactly the access they
                need either way.
              </li>
              <li>
                <strong>Enable automatic RLS</strong>: <strong>on</strong>. TeamHub turns on row-level security for every table anyway; this is an extra safety net.
              </li>
            </ul>
          </li>
          <li>
            Under <strong>Advanced configuration</strong> (if shown): keep <strong>Postgres type</strong> on regular <strong>Postgres</strong>, not OrioleDB (a beta storage
            engine TeamHub isn’t tested with). Leave everything else as it is.
          </li>
          <li>Click Create, then wait a minute or two until the project says it is ready.</li>
        </ol>
        <Why title="Already created the project with different choices?">
          <p>
            The only thing that matters is the Data API serving the <strong>public</strong> schema. After you pick your project below, the wizard checks this and can fix it
            for you. After setting up the database it also tests that your website will be able to reach it.
          </p>
          <p>The other choices (automatic exposure, automatic RLS, region, compute) don’t change how TeamHub works.</p>
        </Why>
      </Section>
      <Section title="2. Let this wizard talk to Supabase" description="A personal access token lets the wizard set up your database. It stays on this computer and is never put on your website.">
        {server.supabase.connected ? (
          <p className="flex items-center gap-2 text-[13.5px]">
            <CheckCircle2 className="size-4 text-success" /> Connected{server.supabase.remembered ? ' (remembered on this computer)' : ''}.{' '}
            <BareButton
              className="text-accent hover:underline"
              onClick={async () => {
                await api('/supabase/forget', {});
                setProjects(null);
                await refreshServer();
              }}
            >
              Disconnect
            </BareButton>
          </p>
        ) : (
          <>
            <TokenSteps />
            <div className="flex gap-2">
              <Input type="password" value={pat} onChange={(e) => setPat(e.target.value)} placeholder="sbp_…" aria-label="Access token" />
              <Button variant="primary" icon={<KeyRound className="size-4" />} onClick={connect} loading={busy} disabled={!pat}>
                Connect
              </Button>
            </div>
            <Checkbox checked={remember} onChange={setRemember} label="Remember on this computer (saved in ~/.teamhub, never in your repository)" />
          </>
        )}
        {server.supabase.connected && !projects && (projectsError ? <Banner tone="danger" title="Couldn't load your Supabase projects">{projectsError}</Banner> : <Spinner label="Loading your projects" />)}
        {projects && (
          <Field label="Your project">
            {(id) => (
              <Select id={id} value={c.supabase.projectRef ?? ''} onChange={(e) => e.target.value && select(e.target.value)} disabled={busy}>
                <option value="">Choose a project…</option>
                {projects.map((p) => (
                  <option key={p.ref} value={p.ref}>
                    {p.name} ({p.region}){p.status !== 'ACTIVE_HEALTHY' ? ` (${p.status.toLowerCase()})` : ''}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        {dataApi && !dataApi.ok && (
          <Banner tone="danger" title={dataApi.schemas.length ? 'The Data API isn’t serving the "public" schema' : 'The Data API is turned off'}>
            <p>
              TeamHub’s website talks to your database through Supabase’s Data API, using the <code>public</code> schema.
              {dataApi.schemas.length ? ` Right now it only serves: ${dataApi.schemas.join(', ')}.` : ''} The wizard can fix this for you.
            </p>
            <Button
              size="sm"
              className="mt-2"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const r = await api<{ schemas: string[]; ok: boolean }>('/supabase/data-api/fix', {});
                  setDataApi(r);
                  if (r.ok) toast.success('Data API now serves the public schema');
                  else toast.error('Supabase didn’t accept the change. Turn on the Data API in Project Settings > Data API, then pick the project again.');
                } catch (e) {
                  toast.error((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Fix it for me
            </Button>
          </Banner>
        )}
        {existing && draft.flow === 'setup' && (
          <Banner tone="warning" title="This project already has TeamHub">
            Continuing updates it to match these settings. Existing data is kept. If you meant to start fresh, pick or create another project.
          </Banner>
        )}
        <Why>
          <p>The wizard uses the token to create tables and access rules, deploy three tiny server functions (password reset links, account deletion, file cleanup) and set sign-in options. It never sends the token anywhere else.</p>
          <p>Students can sign up without email confirmation because a captain or mentor approves every new account: Supabase’s built-in email only reaches your own Supabase team members.</p>
        </Why>
      </Section>
      {c.supabase.projectRef && (
        <Section title="3. Build your database" description="Review what will be created, then apply it. It runs as one transaction. If anything fails, nothing changes.">
          {!plan ? (
            <Spinner />
          ) : (
            <>
              <ul className="list-disc space-y-0.5 pl-5 text-[13.5px]">
                {plan.lines.map((l) => (
                  <li key={l}>{l}</li>
                ))}
                <li>Deploy server functions and configure sign-in</li>
              </ul>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
                <ActionButton state={applyAction.state === 'idle' && draft.done.applied ? 'done' : applyAction.state} label="Build my database" doneLabel="Database built" icon={<Database className="size-4" />} onClick={apply} disabled={busy} />
                <button type="button" className="text-[12.5px] text-accent hover:underline" onClick={() => setShowSql(!showSql)} aria-expanded={showSql}>
                  {showSql ? 'Hide' : 'Show'} the SQL
                </button>
              </div>
              {showSql && <pre className="max-h-72 relative overflow-auto rounded-md bg-bg-subtle p-3 text-[11px] leading-relaxed">{plan.sql}</pre>}
            </>
          )}
          <Checklist steps={applyAction.steps} />
          {applyAction.error && <Banner tone="danger" title="Nothing was changed">The database build runs as one step and was rolled back: {applyAction.error}</Banner>}
          {applyAction.state === 'failed' && !applyAction.error && <p className="text-[12.5px] text-danger">Your tables are ready, but a step after them didn't finish (see the list). Fix it and build again; it's safe to repeat.</p>}
          {(applyAction.state === 'done' || (applyAction.state === 'idle' && draft.done.applied)) && <NextStep>click Continue to create your admin account.</NextStep>}
        </Section>
      )}
    </StepShell>
  );
}

export function AdminAccount({ onNext, onBack }: StepProps) {
  const { draft, setDraft } = useDraft();
  const c: TeamhubConfig = draft.config;
  const [name, setName] = useState({ first: '', last: '' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [types, setTypes] = useState<Record<string, 'member' | 'captain' | 'mentor'>>(Object.fromEntries(c.teams.map((t) => [t.id, 'mentor'])));
  const [busy, setBusy] = useState(false);
  return (
    <StepShell
      title="Create your admin account"
      subtitle="This is you. Admins can do everything, including approving people and making others admins."
      onBack={onBack}
      onNext={onNext}
      nextDisabled={!draft.done.admin}
      footerExtra={
        draft.done.admin ? (
          <span className="flex items-center gap-1.5 text-[13px] text-success">
            <CheckCircle2 className="size-4" /> Admin created
          </span>
        ) : undefined
      }
    >
      <NameFields value={name} onChange={setName} autoComplete />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Email" required error={email && !/\S+@\S+\.\S+/.test(email) ? 'That doesn’t look like an email address.' : undefined}>{(id) => <Input id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />}</Field>
        <Field label="Password" required hint="At least 8 characters" error={password && password.length < 8 ? 'Use at least 8 characters.' : undefined}>
          {(id) => <Input id={id} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />}
        </Field>
      </div>
      <Section title="On each team you are a…" description="Used for display and things like attendance. As an admin you have every permission regardless.">
        {c.teams.map((t) => (
          <label key={t.id} className="flex items-center justify-between gap-3 text-[13.5px]">
            <span>{t.name || `Team ${t.shortCode}`}</span>
            <Select value={types[t.id]} onChange={(e) => setTypes({ ...types, [t.id]: e.target.value as 'mentor' })} className="w-40">
              <option value="mentor">Mentor</option>
              <option value="captain">Captain</option>
              <option value="member">Member</option>
            </Select>
          </label>
        ))}
      </Section>
      <Button
        variant="primary"
        loading={busy}
        onClick={async () => {
          if (!validateRequired() || !/\S+@\S+\.\S+/.test(email) || password.length < 8) return;
          setBusy(true);
          try {
            await api('/admin', { name: joinName(name), email: email.trim(), password, types });
            setDraft((d) => ({ ...d, done: { ...d.done, admin: true } }));
            toast.success('Admin account created. You can sign in with it once your site is live.');
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Create admin account
      </Button>
    </StepShell>
  );
}
