import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { normalizeEmailDomain } from '@teamhub/config-schema/util';
import { Form, Banner, Button, Card, IconButton, Input, PendingAddHint, RemovableTag, Spinner, submitOnBlur, toast, useConfirm } from '@teamhub/ui';
import { friendlyError, useSettingsRow, useSupabase } from '@teamhub/sdk';

interface AllowedEmail {
  email: string;
  note: string | null;
}

/** Admin > Who can join: the optional email-domain rule for sign-ups, plus specific addresses allowed anyway. */
export function WhoCanJoin() {
  const sb = useSupabase();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const settings = useSettingsRow();
  const emails = useQuery({
    queryKey: ['core', 'allowed-emails'],
    queryFn: async () => {
      const { data, error } = await sb.from('teamhub_allowed_emails').select('email, note').order('email');
      if (error) throw error;
      return data as AllowedEmail[];
    },
  });
  const [domain, setDomain] = useState('');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const domains = settings.data?.allowed_email_domains ?? [];

  const saveDomains = async (next: string[]) => {
    const { error } = await sb.from('teamhub_settings').update({ allowed_email_domains: next }).eq('id', 1);
    if (error) return toast.error(friendlyError(error));
    qc.invalidateQueries({ queryKey: ['core', 'settings'] });
  };
  const refreshEmails = () => qc.invalidateQueries({ queryKey: ['core', 'allowed-emails'] });

  if (settings.isLoading) return <Spinner />;
  return (
    <div className="max-w-2xl space-y-4 text-[13.5px]">
      <Card className="space-y-3 p-4">
        <div>
          <p className="font-semibold">Email domains</p>
          <p className="text-[12.5px] text-muted">Only people with an email at these domains can create an account</p>
        </div>
        {domains.length === 0 ? (
          <Banner tone="info">Anyone with your join link can sign up right now. A captain or mentor still approves every request.</Banner>
        ) : (
          <div className="flex flex-wrap gap-2">
            {domains.map((d) => (
              <RemovableTag key={d} label={`@${d}`} removeLabel={`Remove ${d}`} onRemove={async () => {
                  const last = domains.length === 1;
                  if (!(await confirm({ title: `Remove @${d}?`, body: last ? 'This was the only domain, so anyone with the join link can sign up again (a captain or mentor still approves every request).' : `People with @${d} addresses can no longer sign up.`, confirmLabel: 'Remove', danger: true }))) return;
                  await saveDomains(domains.filter((x) => x !== d));
                }} />
            ))}
          </div>
        )}
        <Form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const d = normalizeEmailDomain(domain);
            if (!d) return toast.error('Type the part after the @, like yourschool.org');
            if (!domains.includes(d)) await saveDomains([...domains, d]);
            setDomain('');
          }}
        >
          <Input value={domain} onChange={(e) => setDomain(e.target.value)} onBlur={submitOnBlur} placeholder="yourschool.org" aria-label="Email domain" />
          <Button type="submit" icon={<Plus className="size-4" />}>
            Add domain
          </Button>
        </Form>
        <PendingAddHint text={domain} />
        <p className="text-[12.5px] text-muted">
          Subdomains count too: allowing school.org also allows students.school.org. This only affects new sign-ups. People who already have an account keep it.
        </p>
      </Card>

      <Card className="space-y-3 p-4">
        <div>
          <p className="font-semibold">Also allow these addresses</p>
          <p className="text-[12.5px] text-muted">For mentors or parents without an email at your domains. Only admins can see this list.</p>
        </div>
        {domains.length === 0 && <p className="text-[12.5px] text-muted">Only used when you've added a domain above.</p>}
        {emails.data?.length ? (
          <ul className="divide-y divide-border rounded-md border border-border">
            {emails.data.map((a) => (
              <li key={a.email} className="flex items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1 truncate">
                  {a.email}
                  {a.note && <span className="text-muted"> · {a.note}</span>}
                </span>
                <IconButton
                  label={`Remove ${a.email}`}
                  size="sm"
                  onClick={async () => {
                    if (!(await confirm({ title: `Remove ${a.email}?`, body: 'They can no longer sign up unless their email domain is allowed.', confirmLabel: 'Remove', danger: true }))) return;
                    const { error } = await sb.from('teamhub_allowed_emails').delete().eq('email', a.email);
                    if (error) return toast.error(friendlyError(error));
                    refreshEmails();
                  }}
                >
                  <Trash2 className="size-4" />
                </IconButton>
              </li>
            ))}
          </ul>
        ) : null}
        <Form
          className="flex flex-wrap gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const addr = email.trim().toLowerCase();
            if (!/^[^@\s]+@[a-z0-9.-]+\.[a-z0-9-]+$/.test(addr)) return toast.error('That doesn’t look like an email address');
            const { error } = await sb.from('teamhub_allowed_emails').upsert({ email: addr, note: note.trim() || null });
            if (error) return toast.error(friendlyError(error));
            setEmail('');
            setNote('');
            refreshEmails();
          }}
        >
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="coach@gmail.com" aria-label="Email address" className="min-w-52 flex-1" />
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional), e.g. Mentor" aria-label="Note" maxLength={120} className="w-48" />
          <Button type="submit" icon={<Plus className="size-4" />}>
            Allow
          </Button>
        </Form>
        <PendingAddHint text={email} />
      </Card>
    </div>
  );
}
