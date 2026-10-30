import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Send, Trash2 } from 'lucide-react';
import { BareButton, IconButton, RelativeTime, Spinner, Textarea, VisibilityNote, toast, useConfirm } from '@teamhub/ui';
import { useMe } from './session';
import { friendlyError, useSupabase } from './hooks';
import { Person } from './components';
import { TeamChatLink } from './toollinks';

interface CommentRow {
  id: number;
  ref: string;
  author: string | null;
  body: string;
  created_at: string;
}
export function CommentThread({ refStr, visibility }: { refStr: string; visibility?: string }) {
  const sb = useSupabase();
  const me = useMe();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const key = ['core', 'comments', refStr];
  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await sb.from('comments').select('*').eq('ref', refStr).order('created_at');
      if (error) throw error;
      return data as CommentRow[];
    },
  });
  const post = async () => {
    if (!body.trim()) return;
    setBusy(true);
    const { error } = await sb.from('comments').insert({ ref: refStr, body: body.trim(), author: me.id });
    setBusy(false);
    if (error) return toast.error(friendlyError(error));
    setBody('');
    qc.invalidateQueries({ queryKey: key });
  };
  return (
    <section aria-label="Comments on this item" className="space-y-3">
      <div className="flex items-center justify-between gap-2 max-sm:flex-wrap max-sm:gap-y-1">
        <h3 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-faint">
          <MessageSquare className="size-3.5" /> Comments on this item
        </h3>
        <TeamChatLink prefix="General discussion:" />
      </div>
      {q.isLoading ? (
        <Spinner />
      ) : (
        <ul className="space-y-3">
          {(q.data ?? []).map((c) => (
            <li key={c.id} className="group flex gap-2.5">
              <div className="min-w-0 flex-1 rounded-md bg-bg-subtle px-3 py-2">
                <div className="flex items-center gap-2 text-[12px]">
                  <Person id={c.author} size="sm" />
                  <RelativeTime date={c.created_at} className="text-faint" />
                  {(c.author === me.id || me.isAdmin) && (
                    <BareButton
                      className="ml-auto text-muted hover:text-fg pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:focus:opacity-100"
                      aria-label="Delete comment"
                      onClick={async () => {
                        if (!(await confirm({ title: 'Delete this comment?', danger: true, confirmLabel: 'Delete' }))) return;
                        const { error } = await sb.from('comments').delete().eq('id', c.id);
                        if (error) toast.error(friendlyError(error));
                        qc.invalidateQueries({ queryKey: key });
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </BareButton>
                  )}
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words text-[13.5px]">{c.body}</p>
              </div>
            </li>
          ))}
          {!q.data?.length && <li className="text-[12.5px] text-faint">No comments yet.</li>}
        </ul>
      )}
      <div className="space-y-1.5">
        <div className="flex items-end gap-2">
          <Textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a comment about this item…" aria-label="Comment" maxLength={4000}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) post();
            }}
          />
          <IconButton label="Post comment" variant="primary" onClick={post} loading={busy} disabled={!body.trim()}>
            <Send className="size-4" />
          </IconButton>
        </div>
        <VisibilityNote>{visibility ?? 'Visible to everyone who can see this item'}</VisibilityNote>
      </div>
    </section>
  );
}
