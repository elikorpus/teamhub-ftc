import { useState } from 'react';
import { Route, Routes, useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ChevronLeft, ChevronRight, Download, ExternalLink, Images, Link2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { BareButton, Form,
  Button,
  Dialog,
  EmptyState,
  Field,
  IconButton,
  Input,
  Spinner,
  cn,
  formatDate,
  toDateInput,
  toast,
  useConfirm,
  type ProcessedFile,
  validateRequired,
  safeHref,
} from '@teamhub/ui';
import {
  canWith,
  friendlyError,
  ModuleHeader,
  ModulePurpose,
  PersonName,
  ScopeVisibility,
  storagePath,
  TeamBadge,
  TeamScopePicker,
  Upload,
  uploadFile,
  useCan,
  useCreateShortcut,
  useMe,
  useModuleSettings,
  useNewParam,
  useSignedUrls,
  useSupabase,
  useTeamScope,
} from '@teamhub/sdk';
import { useAlbums, useItems, videoThumb, type Album, type Item } from './data';

export default function MediaRoutes() {
  return (
    <Routes>
      <Route index element={<AlbumList />} />
      <Route path="album/:id" element={<AlbumPage />} />
    </Routes>
  );
}

function AlbumList() {
  const albums = useAlbums();
  const items = useItems();
  const scope = useTeamScope();
  const nav = useNavigate();
  const canUpload = useCan('media.upload');
  const [creating, setCreating] = useNewParam();
  useCreateShortcut(() => setCreating(true), canUpload);
  const list = (albums.data ?? []).filter((a) => !scope || !a.team_id || a.team_id === scope);
  const cover = (a: Album) => (items.data ?? []).find((i) => i.album_id === a.id && i.kind === 'photo')?.path ?? null;
  const urls = useSignedUrls('media', list.map(cover));
  return (
    <div>
      <ModuleHeader moduleId="media" actions={canUpload && <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>New album</Button>} />
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
        {albums.isLoading ? (
          <Spinner />
        ) : !list.length ? (
          <EmptyState icon={<Images />} title="No albums yet" body={<ModulePurpose moduleId="media" compact className="mt-2 text-left" />} />
        ) : (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {list.map((a) => {
              const c = cover(a);
              const n = (items.data ?? []).filter((i) => i.album_id === a.id).length;
              return (
                <li key={a.id}>
                  <button className="group block w-full text-left" onClick={() => nav(`album/${a.id}`)}>
                    <div className="aspect-[4/3] overflow-hidden rounded-lg border border-border bg-bg-subtle">
                      {c && urls.data?.get(c) ? (
                        <img src={urls.data.get(c)} alt="" loading="lazy" className="size-full object-cover transition group-hover:scale-[1.02]" />
                      ) : (
                        <div className="grid size-full place-items-center text-faint">{a.external_url ? <ExternalLink className="size-6" /> : <Images className="size-6" />}</div>
                      )}
                    </div>
                    <p className="mt-1.5 truncate text-[13.5px] font-medium">{a.title}</p>
                    <p className="flex items-center gap-2 text-[12px] text-muted">
                      {formatDate(a.date)} · {n} item{n === 1 ? '' : 's'}
                      <TeamBadge teamId={a.team_id} />
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {creating && <AlbumEditor album={null} onClose={(id) => (setCreating(false), id && nav(`album/${id}`))} />}
    </div>
  );
}

function AlbumPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const sb = useSupabase();
  const me = useMe();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const albums = useAlbums();
  const items = useItems(id);
  const { maxPhotosPerAlbum } = useModuleSettings<{ maxPhotosPerAlbum: number }>('media');
  const album = albums.data?.find((a) => a.id === id);
  const list = items.data ?? [];
  const photos = list.filter((i) => i.kind === 'photo');
  const urls = useSignedUrls('media', photos.map((p) => p.path));
  const [open, setOpen] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState('');
  if (albums.isLoading) return <Spinner className="m-8" />;
  if (!album) return <EmptyState icon={<Images />} title="Album not found" action={<Button onClick={() => nav('/media')}>Back to albums</Button>} />;
  const canUpload = canWith(me, 'media.upload', album.team_id);
  const canDeleteAny = canWith(me, 'media.delete_any', album.team_id) || album.created_by === me.id;
  const left = maxPhotosPerAlbum - photos.length;
  const refresh = () => qc.invalidateQueries({ queryKey: ['media'] });
  const upload = async (files: ProcessedFile[]) => {
    setBusy(true);
    let ok = 0;
    try {
      for (const f of files.slice(0, Math.max(0, left))) {
        const path = await uploadFile('media', storagePath(album.team_id, album.id, f.name), f);
        const { error } = await sb.from('med_items').insert({ album_id: album.id, kind: 'photo', path, uploaded_by: me.id });
        if (error) {
          await sb.storage.from('media').remove([path]);
          throw error;
        }
        ok++;
      }
      toast.success(`Added ${ok} photo${ok === 1 ? '' : 's'}`);
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
      refresh();
    }
  };
  const addLink = async (url: string) => {
    if (!/^https?:\/\//i.test(url)) return toast.error('Paste a full link starting with https://');
    const { error } = await sb.from('med_items').insert({ album_id: album.id, kind: 'link', url, uploaded_by: me.id });
    if (error) return toast.error(friendlyError(error));
    setLink('');
    refresh();
  };
  const remove = async (i: Item) => {
    if (!(await confirm({ title: i.kind === 'photo' ? 'Delete this photo?' : 'Remove this link?', danger: true, confirmLabel: 'Delete' }))) return;
    const { error } = await sb.from('med_items').delete().eq('id', i.id);
    if (error) return toast.error(friendlyError(error));
    setOpen(null);
    refresh();
  };
  const current = open != null ? photos[open] : null;
  return (
    <div>
      <ModuleHeader
        moduleId="media"
        title={
          <span className="flex items-center gap-1">
            <IconButton label="All albums" onClick={() => nav('/media')}>
              <ArrowLeft className="size-4" />
            </IconButton>
            {album.title}
          </span>
        }
        subtitle={formatDate(album.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        actions={
          canDeleteAny && (
            <>
              <Button icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
                Edit
              </Button>
              <Button
                variant="ghost"
                className="text-danger"
                icon={<Trash2 className="size-4" />}
                onClick={async () => {
                  if (!(await confirm({ title: `Delete “${album.title}”?`, body: `All ${list.length} photos and links in it are deleted.`, danger: true, typeToConfirm: album.title, confirmLabel: 'Delete album' }))) return;
                  const { error } = await sb.from('med_albums').delete().eq('id', album.id);
                  if (error) return toast.error(friendlyError(error));
                  refresh();
                  nav('/media');
                }}
              >
                Delete
              </Button>
            </>
          )
        }
      />
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-5 sm:px-6">
        {album.external_url && (
          <a href={safeHref(album.external_url)} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border border-border bg-surface p-3 text-[13.5px] font-medium hover:border-accent">
            <ExternalLink className="size-4 text-accent" /> Full album (Google Photos / Drive)
          </a>
        )}
        {canUpload && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            {left > 0 ? (
              <Upload kind="photo" maxFiles={Math.min(20, left)} onFiles={upload} busy={busy} label={`Add photos (${left} left in this album: compressed to ≤ 400 KB)`} />
            ) : (
              <p className="rounded-lg border border-dashed border-border p-4 text-[13px] text-muted">This album is full ({maxPhotosPerAlbum} photos). Start a new album, or link a Google Photos/Drive album above.</p>
            )}
            <Form
              className="space-y-2 rounded-lg border border-border p-3"
              onSubmit={(e) => {
                e.preventDefault();
                addLink(link.trim());
              }}
            >
              <p className="flex items-center gap-1.5 text-[13px] font-medium">
                <Link2 className="size-4" /> Add a video link
              </p>
              <Input type="url" placeholder="https://youtu.be/…" value={link} onChange={(e) => setLink(e.target.value)} />
              <Button size="sm" type="submit" disabled={!link.trim()}>
                Add link
              </Button>
            </Form>
          </div>
        )}
        {items.isLoading ? (
          <Spinner />
        ) : !list.length ? (
          <p className="text-[13px] text-faint">Nothing in this album yet.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {list.map((i) => {
              if (i.kind === 'link') {
                const thumb = videoThumb(i.url!);
                return (
                  <li key={i.id} className="group relative">
                    <a href={safeHref(i.url!)} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-md border border-border bg-bg-subtle">
                      {thumb ? <img src={thumb} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-cover" /> : <span className="grid size-full place-items-center p-2 text-center text-[12px] text-muted"><ExternalLink className="mb-1 size-5" />{new URL(i.url!).hostname}</span>}
                    </a>
                    {(i.uploaded_by === me.id || canDeleteAny) && (
                      <BareButton aria-label="Remove link" onClick={() => remove(i)} className="absolute right-1 top-1 hidden rounded bg-black/60 p-1 text-white group-hover:block">
                        <X className="size-3.5" />
                      </BareButton>
                    )}
                  </li>
                );
              }
              const idx = photos.indexOf(i);
              return (
                <li key={i.id}>
                  <button onClick={() => setOpen(idx)} className="block aspect-square w-full overflow-hidden rounded-md border border-border bg-bg-subtle" aria-label={i.caption ?? `Photo ${idx + 1}`}>
                    {urls.data?.get(i.path!) && <img src={urls.data.get(i.path!)} alt={i.caption ?? ''} loading="lazy" className="size-full object-cover" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <ScopeVisibility teamId={album.team_id} />
      </div>
      {current && (
        <Lightbox
          item={current}
          url={urls.data?.get(current.path!) ?? null}
          canDelete={current.uploaded_by === me.id || canDeleteAny}
          canEdit={current.uploaded_by === me.id}
          onPrev={open! > 0 ? () => setOpen(open! - 1) : undefined}
          onNext={open! < photos.length - 1 ? () => setOpen(open! + 1) : undefined}
          onDelete={() => remove(current)}
          onClose={() => setOpen(null)}
        />
      )}
      {editing && <AlbumEditor album={album} onClose={() => setEditing(false)} />}
    </div>
  );
}

function Lightbox({ item, url, canDelete, canEdit, onPrev, onNext, onDelete, onClose }: { item: Item; url: string | null; canDelete: boolean; canEdit: boolean; onPrev?: () => void; onNext?: () => void; onDelete: () => void; onClose: () => void }) {
  const sb = useSupabase();
  const qc = useQueryClient();
  const [caption, setCaption] = useState(item.caption ?? '');
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={item.caption || 'Photo'}
      description={<>Added by <PersonName id={item.uploaded_by} /></>}
      size="xl"
      footer={
        <>
          {canDelete && (
            <Button variant="ghost" className="mr-auto text-danger" icon={<Trash2 className="size-4" />} onClick={onDelete}>
              Delete
            </Button>
          )}
          {url && (
            <a href={safeHref(url)} download className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] hover:bg-bg-subtle">
              <Download className="size-4" /> Download
            </a>
          )}
        </>
      }
    >
      <div
        className="relative"
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') onPrev?.();
          if (e.key === 'ArrowRight') onNext?.();
        }}
      >
        {url ? <img src={url} alt={item.caption ?? ''} className="mx-auto max-h-[65vh] rounded-md object-contain" /> : <Spinner />}
        {onPrev && (
          <IconButton label="Previous photo" className="absolute left-1 top-1/2 -translate-y-1/2 bg-surface/80" onClick={onPrev}>
            <ChevronLeft className="size-5" />
          </IconButton>
        )}
        {onNext && (
          <IconButton label="Next photo" className="absolute right-1 top-1/2 -translate-y-1/2 bg-surface/80" onClick={onNext}>
            <ChevronRight className="size-5" />
          </IconButton>
        )}
      </div>
      {canEdit && (
        <Form
          className={cn('mt-3 flex gap-2')}
          onSubmit={async (e) => {
            e.preventDefault();
            const { error } = await sb.from('med_items').update({ caption: caption.trim() || null }).eq('id', item.id);
            if (error) return toast.error(friendlyError(error));
            qc.invalidateQueries({ queryKey: ['media'] });
            toast.success('Caption saved');
          }}
        >
          <Input maxLength={300} placeholder="Add a caption" value={caption} onChange={(e) => setCaption(e.target.value)} />
          <Button type="submit">Save</Button>
        </Form>
      )}
    </Dialog>
  );
}

function AlbumEditor({ album, onClose }: { album: Album | null; onClose: (id?: string) => void }) {
  const sb = useSupabase();
  const me = useMe();
  const qc = useQueryClient();
  const scope = useTeamScope();
  const [v, setV] = useState({ title: album?.title ?? '', date: album?.date ?? toDateInput(new Date()), external_url: album?.external_url ?? '', team_id: album ? album.team_id : scope });
  const save = async () => {
    if (!validateRequired()) return;
    if (!v.title.trim()) return toast.error('Name the album');
    if (v.external_url && !/^https?:\/\//i.test(v.external_url)) return toast.error('Album link must start with https://');
    const body = { title: v.title.trim(), date: v.date, external_url: v.external_url.trim() || null, team_id: v.team_id };
    const res = album ? await sb.from('med_albums').update(body).eq('id', album.id).select('id').single() : await sb.from('med_albums').insert({ ...body, created_by: me.id }).select('id').single();
    if (res.error) return toast.error(friendlyError(res.error));
    qc.invalidateQueries({ queryKey: ['media'] });
    onClose(album ? undefined : res.data.id);
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={album ? 'Edit album' : 'New album'} size="md" footer={<Button variant="primary" onClick={save}>{album ? 'Save' : 'Create album'}</Button>}>
      <div className="space-y-4">
        <Field label="Album" required>{(id) => <Input id={id} autoFocus maxLength={120} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="League meet 2" />}</Field>
        <Field label="Date" required>{(id) => <Input id={id} type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} />}</Field>
        <Field label="Link to the full album" optional hint="Google Photos or Drive: great for lots of photos or videos">
          {(id) => <Input id={id} type="url" value={v.external_url} onChange={(e) => setV({ ...v, external_url: e.target.value })} placeholder="https://photos.app.goo.gl/…" />}
        </Field>
        <TeamScopePicker value={v.team_id} onChange={(t) => setV({ ...v, team_id: t })} perm="media.upload" />
        <ScopeVisibility teamId={v.team_id} />
      </div>
    </Dialog>
  );
}
