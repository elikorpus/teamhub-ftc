import { useState } from 'react';
import { Link, Navigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { emailDomainAllowed } from '@teamhub/config-schema/util';
import { Check, MailCheck } from 'lucide-react';
import { Form, Banner, Button, Field, Input, NameFields, Segmented, Textarea, VisibilityNote, cn, joinName } from '@teamhub/ui';
import { friendlyError, isMultiTeam, runtime, useSession, useSupabase } from '@teamhub/sdk';
import { AuthLayout, TeamLogo } from './AuthLayout';

type ReqType = 'member' | 'captain' | 'mentor';

/** Public signup (spec §7.5): account is created immediately as pending; a captain/mentor approves it. */
export function Join() {
  const sb = useSupabase();
  const { session } = useSession();
  const teams = runtime().config.teams;
  const multi = isMultiTeam();
  const [name, setName] = useState({ first: '', last: '' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [picked, setPicked] = useState<string[]>(multi ? [] : [teams[0].id]);
  const [type, setType] = useState<ReqType>('member');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  // Optional rule from Admin > Who can join. The database enforces it; this is only for clear messages.
  const rules = useQuery({
    queryKey: ['core', 'join-rules'],
    queryFn: async () => {
      const { data, error } = await sb.rpc('teamhub_join_rules');
      if (error) throw error;
      return data as { allowed_email_domains: string[] };
    },
  });
  const domains = rules.data?.allowed_email_domains ?? [];
  const domainList = domains.map((d) => `@${d}`).join(' or ');

  if (session) return <Navigate to="/" replace />;

  if (sentTo) {
    return (
      <AuthLayout title="Check your email" subtitle="One more step to join">
        <div className="space-y-4 text-[13.5px]">
          <div className="flex items-start gap-3 rounded-md border border-border bg-bg-subtle p-3">
            <MailCheck className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
            <p>
              We sent a link to <span className="font-medium">{sentTo}</span>. Open it to confirm your email. Then a captain or mentor will approve your account.
            </p>
          </div>
          <p className="text-muted">No email after a few minutes? Check your spam folder, or make sure you typed your address right.</p>
          <Button variant="secondary" className="w-full" onClick={() => setSentTo(null)}>
            Use a different email
          </Button>
        </div>
        <div className="mt-5 border-t border-border pt-4 text-center text-[13px]">
          Already confirmed?{' '}
          <Link to="/login" className="font-medium text-accent hover:underline">
            Sign in
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Join the team" subtitle="Create your account. A captain or mentor will approve it." wide>
      <Form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!picked.length) return setError('Pick at least one team.');
          if (password.length < 8) return setError('Use at least 8 characters for your password.');
          setBusy(true);
          setError(null);
          const { data, error } = await sb.auth.signUp({
            email: email.trim(),
            password,
            options: {
              data: { name: joinName(name), teams: picked, requested_type: type, note: note.trim() || null },
              // With email confirmation on (setup wizard > Email), the link in the email comes back to this site.
              emailRedirectTo: `${location.origin}${import.meta.env.BASE_URL}`,
            },
          });
          setBusy(false);
          if (!error) {
            // Email confirmation on: Supabase answers an existing address with a user that has no identities.
            if (data.user && data.user.identities?.length === 0) return setError('That email already has an account. Try signing in.');
            // No session means Supabase emailed a confirmation link; with confirmation off, the session signs them in.
            if (!data.session) setSentTo(email.trim());
            return;
          }
          if (/registered/i.test(error.message)) return setError('That email already has an account. Try signing in.');
          if (/TEAMHUB_EMAIL_NOT_ALLOWED/.test(error.message) || (!emailDomainAllowed(email, domains) && /saving new user/i.test(error.message))) {
            return setError(
              `This program only accepts sign-ups with ${domainList || 'certain'} email addresses. If you're a mentor or parent without one, ask an admin to allow your email (Admin > Who can join).`,
            );
          }
          setError(friendlyError(error));
        }}
      >
        {error && <Banner tone="danger">{error}</Banner>}
        <NameFields value={name} onChange={setName} autoComplete />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Email" required hint={domains.length ? `Use your ${domainList} email` : undefined}>
            {(id) => <Input id={id} type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
          </Field>
          <Field label="Password" required hint="At least 8 characters">
            {(id) => <Input id={id} type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
          </Field>
        </div>

        {multi && (
          <fieldset className="space-y-2">
            <legend className="text-[13px] font-medium">Which team(s)?</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {teams.map((t) => {
                const on = picked.includes(t.id);
                return (
                  <button
                    type="button"
                    key={t.id}
                    aria-pressed={on}
                    onClick={() => setPicked(on ? picked.filter((x) => x !== t.id) : [...picked, t.id])}
                    className={cn('flex items-center gap-3 rounded-md border p-2.5 text-left transition-colors', on ? 'border-accent bg-accent-soft' : 'border-border hover:bg-bg-subtle')}
                  >
                    <TeamLogo teamId={t.id} size={34} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium">{t.name}</span>
                      {t.number && <span className="block text-[12px] text-muted">#{t.number}</span>}
                    </span>
                    {on && <Check className="size-4 text-accent" />}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

        <div className="space-y-1.5">
          <p className="text-[13px] font-medium">I am a…</p>
          <Segmented<ReqType>
            value={type}
            onChange={setType}
            className="max-sm:flex-wrap"
            options={[
              { value: 'member', label: 'Team member' },
              { value: 'captain', label: 'Captain' },
              { value: 'mentor', label: 'Mentor / coach' },
            ]}
          />
          {type !== 'member' && <p className="text-[12px] text-muted">Captain and mentor requests are approved by a mentor or admin.</p>}
        </div>

        <Field label="Note for the approver" optional hint='e.g. "New build mentor, Sam’s mom"'>
          {(id) => <Textarea id={id} rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
        <VisibilityNote>Your name and note are shown to the captains and mentors who approve requests.</VisibilityNote>

        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
          Request to join
        </Button>
      </Form>
      <div className="mt-5 border-t border-border pt-4 text-center text-[13px]">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-accent hover:underline">
          Sign in
        </Link>
      </div>
    </AuthLayout>
  );
}
