import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Download, LogOut, Trash2, Users } from 'lucide-react';
import { Form, Avatar, Button, Card, CardHeader, NameFields, PageHeader, Select, TYPE_LABEL, Textarea, VisibilityNote, downloadText, joinName, splitName, toast, useConfirm, validateRequired } from '@teamhub/ui';
import { friendlyError, isMultiTeam, runtime, useMe, usePeople, useSupabase, Upload, uploadFile } from '@teamhub/sdk';
import { TeamLogo } from '../auth/AuthLayout';
import { LEVEL_NOTE, ProfileFieldInput, askedFields, fieldValue, saveProfileFields, useMyPrivate, useProfileFields } from './profileFields';

export default function MyProfile() {
  const sb = useSupabase();
  const me = useMe();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const priv = useMyPrivate();
  const allFields = useProfileFields();
  // Fields you're asked for, plus any you've already answered (mentors aren't asked for shirt sizes, for example).
  const fields = useMemo(() => allFields.filter((f) => askedFields([f], me).length || fieldValue(f, me.profile.details, priv.data)), [allFields, me, priv.data]);
  const people = usePeople();
  const [name, setName] = useState(() => splitName(me.profile.display_name));
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [joinTeam, setJoinTeam] = useState('');
  const [joinType, setJoinType] = useState('member');
  const [joinNote, setJoinNote] = useState('');
  const [leaving, setLeaving] = useState<string | null>(null);

  useEffect(() => {
    setValues(Object.fromEntries(fields.map((f) => [f.id, fieldValue(f, me.profile.details, priv.data)])));
  }, [fields, priv.data, me.profile.details]);

  const refresh = () => qc.invalidateQueries({ queryKey: ['core'] });
  const otherTeams = runtime().config.teams.filter((t) => !me.memberships.some((m) => m.team_id === t.id));

  return (
    <div>
      <PageHeader title="My profile" subtitle="How you appear across TeamHub" />
      <div className="mx-auto grid grid-cols-1 max-w-4xl gap-4 px-4 py-5 sm:px-6 md:grid-cols-2">
        <Card className="md:col-span-2">
          <CardHeader title="Name & photo" />
          <div className="flex flex-wrap items-start gap-5 px-4 pb-4">
            <Avatar name={joinName(name) || me.profile.display_name} src={people.data?.get(me.id)?.avatarUrl} size={72} />
            <div className="min-w-60 flex-1 space-y-3">
              <NameFields value={name} onChange={setName} autoComplete />
              <Upload
                kind="avatar"
                label="Drop a photo or"
                onFiles={async ([f]) => {
                  try {
                    const path = `${me.id}/${crypto.randomUUID()}.webp`;
                    await uploadFile('avatars', path, f);
                    const old = me.profile.avatar_path;
                    const { error } = await sb.from('profiles').update({ avatar_path: path }).eq('id', me.id);
                    if (error) throw error;
                    if (old) await sb.storage.from('avatars').remove([old]);
                    toast.success('Photo updated');
                    refresh();
                  } catch (e) {
                    toast.error(friendlyError(e));
                  }
                }}
              />
              {me.profile.avatar_path && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    await sb.storage.from('avatars').remove([me.profile.avatar_path!]);
                    await sb.from('profiles').update({ avatar_path: null }).eq('id', me.id);
                    refresh();
                  }}
                >
                  Remove photo
                </Button>
              )}
              <VisibilityNote>Your name and photo are visible to everyone in {runtime().config.program.name}.</VisibilityNote>
            </div>
          </div>
        </Card>

        {fields.length > 0 && (
          <Card className="md:col-span-2">
            <CardHeader title="Profile details" />
            <div className="grid grid-cols-1 gap-3 px-4 pb-4 sm:grid-cols-2">
              {fields.map((f) => (
                <div key={f.id} role="group" aria-label={f.label} className="space-y-1.5">
                  <p className="text-[13px] font-medium">{f.label}</p>
                  <ProfileFieldInput field={f} value={values[f.id] ?? ''} onChange={(v) => setValues({ ...values, [f.id]: v })} />
                  <VisibilityNote locked={f.private}>{LEVEL_NOTE[f.level]}</VisibilityNote>
                </div>
              ))}
            </div>
          </Card>
        )}
        <div className="flex justify-end md:col-span-2">
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                if (!name.first.trim() || !name.last.trim()) return void toast.error('Enter your first and last name');
                if (joinName(name) !== me.profile.display_name) {
                  const { error } = await sb.from('profiles').update({ display_name: joinName(name).slice(0, 80) }).eq('id', me.id);
                  if (error) throw error;
                }
                await saveProfileFields(sb, me.id, fields, values, { details: me.profile.details ?? {}, hidden: priv.data ?? { leaders: {}, mentors: {} } });
                toast.success('Profile saved');
                refresh();
              } catch (e) {
                toast.error(friendlyError(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Save profile
          </Button>
        </div>

        {isMultiTeam() && (
          <Card className="md:col-span-2">
            <CardHeader icon={<Users className="size-4" />} title="Your teams" />
            <div className="grid grid-cols-1 gap-4 px-4 pb-4 md:grid-cols-2">
            <div className="space-y-2">
            <ul className="divide-y divide-border rounded-md border border-border text-[13.5px]">
              {me.memberships.map((m) => {
                const t = runtime().config.teams.find((x) => x.id === m.team_id);
                if (!t) return null;
                const pending = m.status === 'pending';
                // Leaving your last team would leave you with no team; asking to delete your account is the way out.
                const last = m.status === 'active' && !me.memberships.some((x) => x.team_id !== m.team_id && x.status === 'active');
                return (
                  <li key={m.team_id} className="flex items-center gap-2.5 px-3 py-2.5">
                    <TeamLogo teamId={t.id} size={24} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{t.name}</span>
                      <span className="block text-[12px] text-muted">{m.status === 'active' ? TYPE_LABEL[m.type] : pending ? 'Request waiting for approval' : 'Inactive'}</span>
                    </span>
                    {!last && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-danger"
                        icon={pending ? undefined : <LogOut className="size-3.5" />}
                        loading={leaving === m.team_id}
                        disabled={leaving !== null}
                        onClick={async () => {
                          const ok = await confirm(
                            pending
                              ? { title: `Take back your request to join ${t.name}?`, confirmLabel: 'Take back' }
                              : { title: `Leave ${t.name}?`, body: 'You lose access to things only for that team, and any positions you hold on it. Anything you made stays. To come back, ask to join again.', confirmLabel: 'Leave team', danger: true },
                          );
                          if (!ok) return;
                          setLeaving(m.team_id);
                          const { error } = await sb.rpc('people_leave_team', { p_team: m.team_id });
                          setLeaving(null);
                          if (error) return toast.error(friendlyError(error));
                          toast.success(pending ? 'Request taken back' : `You left ${t.name}`);
                          refresh();
                        }}
                      >
                        {pending ? 'Take back' : 'Leave'}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
            {me.memberships.filter((m) => m.status === 'active').length === 1 && <p className="text-[12px] text-faint">You can leave a team when you're on at least one other team.</p>}
            </div>
            {otherTeams.length > 0 && (
              <Form
                className="space-y-2.5"
                aria-label="Join another team"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!validateRequired(e.currentTarget)) return;
                  const { error } = await sb.from('memberships').insert({ user_id: me.id, team_id: joinTeam, type: joinType, requested_type: joinType, status: 'pending', note: joinNote || null });
                  if (error) return toast.error(friendlyError(error));
                  toast.success('Request sent');
                  refresh();
                }}
              >
                <p className="text-[13px] font-medium">Join another team</p>
                <p className="text-[12.5px] text-muted">Someone on that team approves your request, just like when you signed up. To switch teams, join the new one first, then leave the old one once you're approved.</p>
                <Select required value={joinTeam} onChange={(e) => setJoinTeam(e.target.value)} aria-label="Team">
                  <option value="">Choose a team…</option>
                  {otherTeams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
                <Select value={joinType} onChange={(e) => setJoinType(e.target.value)} aria-label="As">
                  <option value="member">Member</option>
                  <option value="captain">Captain</option>
                  <option value="mentor">Mentor</option>
                </Select>
                <Textarea rows={2} placeholder="Note for the approver (optional)" value={joinNote} onChange={(e) => setJoinNote(e.target.value)} maxLength={300} />
                <Button type="submit" size="sm" disabled={!joinTeam}>
                  Request to join
                </Button>
              </Form>
            )}
            </div>
          </Card>
        )}

        <Card className="md:col-span-2">
          <CardHeader title="Your data" />
          <div className="space-y-3 px-4 pb-4 text-[13px] text-muted">
            <p>Download a copy of your profile and the things you’ve written, or ask for your account to be deleted.</p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                icon={<Download className="size-4" />}
                onClick={async () => {
                  const [profile, memberships, holders, comments, notifications] = await Promise.all([
                    sb.from('profiles').select('*').eq('id', me.id).single(),
                    sb.from('memberships').select('*').eq('user_id', me.id),
                    sb.from('position_holders').select('*').eq('user_id', me.id),
                    sb.from('comments').select('*').eq('author', me.id),
                    sb.from('notifications').select('*'),
                  ]);
                  downloadText(
                    JSON.stringify(
                      { exported_at: new Date().toISOString(), profile: profile.data, private: priv.data, memberships: memberships.data, positions: holders.data, comments: comments.data, notifications: notifications.data },
                      null,
                      2,
                    ),
                    'my-teamhub-data.json',
                    'application/json',
                  );
                }}
              >
                Download my data
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-danger"
                icon={<Trash2 className="size-4" />}
                onClick={async () => {
                  if (!(await confirm({ title: 'Ask to delete your account?', body: 'Mentors and admins are notified. When they delete it, your name becomes “Former member” on things you contributed.', confirmLabel: 'Send request', danger: true }))) return;
                  const { error } = await sb.rpc('people_request_deletion');
                  if (error) return toast.error(friendlyError(error));
                  toast.success('Request sent to your mentors');
                }}
              >
                Request account deletion
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
