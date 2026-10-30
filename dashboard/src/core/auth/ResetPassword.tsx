import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Form, Banner, Button, Field, Input } from '@teamhub/ui';
import { friendlyError, runtime, useSession, useSupabase } from '@teamhub/sdk';
import { AuthLayout } from './AuthLayout';

/** Landing page for reset links (admin-generated, or emailed when email is on; spec §7.5): set a new password. */
export function ResetPassword() {
  const sb = useSupabase();
  const nav = useNavigate();
  const { session, loading } = useSession();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 2500);
    return () => clearTimeout(t);
  }, []);
  const hashError = new URLSearchParams(location.hash.slice(1)).get('error_description');
  // With email on (setup wizard > Email), links also come from "Forgot your password?" on the sign-in page.
  const newLink = runtime().config.features.email ? 'Request a new one with "Forgot your password?" on the sign-in page, or ask a mentor or admin' : 'Ask a mentor or admin for a new one';

  return (
    <AuthLayout title="Set a new password">
      {hashError ? (
        <Banner tone="danger" title="This reset link didn't work">
          {hashError}. Reset links expire quickly. {newLink}.
        </Banner>
      ) : !session && !loading && waited ? (
        <Banner tone="warning" title="Open your reset link first">
          This page works from a password reset link. {newLink} if yours expired.
        </Banner>
      ) : (
        <Form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (pw.length < 8) return setError('Use at least 8 characters.');
            if (pw !== pw2) return setError("Passwords don't match.");
            setBusy(true);
            const { error } = await sb.auth.updateUser({ password: pw });
            setBusy(false);
            if (error) setError(friendlyError(error));
            else nav('/', { replace: true });
          }}
        >
          {error && <Banner tone="danger">{error}</Banner>}
          <Field label="New password" required hint="At least 8 characters">
            {(id) => <Input id={id} type="password" autoComplete="new-password" required value={pw} onChange={(e) => setPw(e.target.value)} />}
          </Field>
          <Field label="Repeat password" required>{(id) => <Input id={id} type="password" autoComplete="new-password" required value={pw2} onChange={(e) => setPw2(e.target.value)} />}</Field>
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy} disabled={!session}>
            Save password
          </Button>
        </Form>
      )}
    </AuthLayout>
  );
}
