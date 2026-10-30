import { useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';
import { BareButton, Form, Banner, Button, Field, Input } from '@teamhub/ui';
import { friendlyError, runtime, useSession, useSupabase } from '@teamhub/sdk';
import { AuthLayout } from './AuthLayout';

export function Login() {
  const sb = useSupabase();
  const { session, loading } = useSession();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [resent, setResent] = useState(false);
  const emailEnabled = runtime().config.features.email;
  // Only a path on this site: "//other.site" and "/\other.site" would leave it.
  const next = params.get('next');
  const safeNext = next && /^\/(?![/\\])/.test(next) ? next : '/';

  if (!loading && session) return <Navigate to={safeNext} replace />;

  return (
    <AuthLayout title="Sign in" subtitle="Welcome back">
      <Form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          setUnconfirmed(false);
          setResent(false);
          const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
          setBusy(false);
          if (error && /not confirmed/i.test(error.message)) setUnconfirmed(true);
          else if (error) setError(/invalid/i.test(error.message) ? 'Wrong email or password.' : friendlyError(error));
        }}
      >
        {error && <Banner tone="danger">{error}</Banner>}
        {unconfirmed && (
          <Banner
            tone="warning"
            title="Confirm your email first"
            action={
              !resent && (
                <Button
                  size="sm"
                  onClick={async () => {
                    const { error } = await sb.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: `${location.origin}${import.meta.env.BASE_URL}` } });
                    if (error) setError(friendlyError(error));
                    else setResent(true);
                  }}
                >
                  Send it again
                </Button>
              )
            }
          >
            {resent ? 'We sent a new link. Check your email (and your spam folder).' : 'Open the link we emailed you when you joined, then sign in.'}
          </Banner>
        )}
        <Field label="Email" required>{(id) => <Input id={id} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
        <Field label="Password" required>
          {(id) => <Input id={id} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <Button type="submit" variant="primary" className="w-full" size="lg" loading={busy}>
          Sign in
        </Button>
        {emailEnabled ? (
          resetSent ? (
            <p className="text-center text-[12.5px] text-muted">Check your email for a reset link.</p>
          ) : (
            <BareButton
              type="button"
              className="block w-full text-center text-[12.5px] text-accent hover:underline"
              onClick={async () => {
                if (!email) return setError('Enter your email first.');
                const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}${import.meta.env.BASE_URL}reset-password` });
                if (error) setError(friendlyError(error));
                else setResetSent(true);
              }}
            >
              Forgot your password?
            </BareButton>
          )
        ) : (
          <p className="text-center text-[12.5px] text-muted">Forgot your password? Ask a mentor or admin for a reset link.</p>
        )}
      </Form>
      <div className="mt-5 border-t border-border pt-4 text-center text-[13px]">
        New to the team?{' '}
        <Link to="/join" className="font-medium text-accent hover:underline">
          Create an account
        </Link>
      </div>
    </AuthLayout>
  );
}
