import { useRef, useState, type ReactNode } from 'react';
import { UploadCloud, Link2, File as FileIcon, Trash2, Download, Image as ImageIcon, Box } from 'lucide-react';
import { cn } from './cn';
import { Form, Button, IconButton, Input } from './primitives';
import { formatBytes } from './charts';

/** File kinds and their rules (spec §11.2). */
export const FILE_RULES = {
  photo: { maxPx: 1600, quality: 0.75, maxBytes: 400 * 1024, accept: 'image/*' },
  avatar: { maxPx: 128, quality: 0.8, maxBytes: 20 * 1024, accept: 'image/*' },
  model: { maxBytes: 25 * 1024 * 1024, accept: '.stl,.obj,.3mf,.step,.stp,.dxf,.svg,.pdf' },
  doc: { maxBytes: 10 * 1024 * 1024, accept: '.pdf' },
} as const;
export type FileKind = keyof typeof FILE_RULES;

const GZIP_EXT = /\.(stl|obj|step|stp|dxf|svg)$/i;

export interface ProcessedFile {
  blob: Blob;
  /** Name to store (e.g. part.stl.gz / photo.webp) */
  name: string;
  originalName: string;
  contentType: string;
  size: number;
  compressed: boolean;
}

/** Resize + re-encode to WebP. Re-encoding through a canvas drops EXIF (location!) metadata. */
export async function compressImage(file: Blob, maxPx: number, quality: number, maxBytes: number): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  let scale = Math.min(1, maxPx / Math.max(bmp.width, bmp.height));
  let q = quality;
  for (let attempt = 0; attempt < 8; attempt++) {
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/webp', q));
    if (!blob) throw new Error('This browser cannot compress images.');
    if (blob.size <= maxBytes) return blob;
    if (q > 0.5) q -= 0.1;
    else scale *= 0.8;
  }
  throw new Error('Image is too large even after compression.');
}

export async function gzipBlob(file: Blob): Promise<Blob> {
  const stream = file.stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).blob();
}

export async function gunzipBlob(file: Blob): Promise<Blob> {
  const stream = file.stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).blob();
}

export async function processFile(file: File, kind: FileKind, maxBytesOverride?: number): Promise<ProcessedFile> {
  const rules = FILE_RULES[kind];
  if (kind === 'photo' || kind === 'avatar') {
    if (!file.type.startsWith('image/')) throw new Error(`${file.name} is not an image.`);
    const r = FILE_RULES[kind];
    const blob = await compressImage(file, r.maxPx, r.quality, maxBytesOverride ?? r.maxBytes);
    const base = file.name.replace(/\.[^.]+$/, '');
    return { blob, name: `${base}.webp`, originalName: file.name, contentType: 'image/webp', size: blob.size, compressed: true };
  }
  if (kind === 'model' && GZIP_EXT.test(file.name)) {
    const blob = await gzipBlob(file);
    if (blob.size > (maxBytesOverride ?? rules.maxBytes)) throw new Error(`${file.name} is over ${formatBytes(maxBytesOverride ?? rules.maxBytes)} even compressed.`);
    return { blob, name: `${file.name}.gz`, originalName: file.name, contentType: 'application/gzip', size: blob.size, compressed: true };
  }
  if (file.size > (maxBytesOverride ?? rules.maxBytes)) throw new Error(`${file.name} is over ${formatBytes(maxBytesOverride ?? rules.maxBytes)}.`);
  return { blob: file, name: file.name, originalName: file.name, contentType: file.type || 'application/octet-stream', size: file.size, compressed: false };
}

/**
 * Upload area with client-side compression, size caps and a "Paste a link instead" option (spec §11.2).
 * Every upload area must offer the link alternative and show where large files should go instead.
 */
export function FileDrop({
  kind,
  onFiles,
  onLink,
  maxFiles = 1,
  maxBytes,
  disabledReason,
  linkPlaceholder = 'https://drive.google.com/…',
  driveHint,
  label,
  busy,
}: {
  kind: FileKind;
  onFiles: (files: ProcessedFile[]) => void | Promise<void>;
  onLink?: (url: string) => void | Promise<void>;
  maxFiles?: number;
  maxBytes?: number;
  disabledReason?: ReactNode;
  linkPlaceholder?: string;
  driveHint?: ReactNode;
  label?: ReactNode;
  busy?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'file' | 'link'>('file');
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [url, setUrl] = useState('');
  const rules = FILE_RULES[kind];
  const cap = maxBytes ?? rules.maxBytes;

  async function handle(list: FileList | null) {
    if (!list?.length) return;
    setError(null);
    const files = [...list].slice(0, maxFiles);
    if (list.length > maxFiles) setError(`Only ${maxFiles} file${maxFiles === 1 ? '' : 's'} allowed here.`);
    setWorking(true);
    try {
      const out: ProcessedFile[] = [];
      for (const f of files) out.push(await processFile(f, kind, maxBytes));
      await onFiles(out);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
      if (input.current) input.current.value = '';
    }
  }

  if (disabledReason) {
    return <div className="rounded-md border border-dashed border-border bg-bg-subtle px-4 py-5 text-center text-[13px] text-muted">{disabledReason}</div>;
  }

  return (
    <div className="space-y-2">
      {mode === 'file' ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            handle(e.dataTransfer.files);
          }}
          className={cn(
            'flex flex-col items-center justify-center gap-1.5 rounded-md border border-dashed px-4 py-5 text-center transition-colors',
            over ? 'border-accent bg-accent-soft' : 'border-border-strong bg-bg-subtle/50',
          )}
        >
          {kind === 'photo' || kind === 'avatar' ? <ImageIcon className="size-5" /> : kind === 'model' ? <Box className="size-5" /> : <UploadCloud className="size-5" />}
          <p className="text-[13px]">
            {label ?? 'Drop files here or'}{' '}
            <button type="button" className="font-medium text-accent hover:underline" onClick={() => input.current?.click()} disabled={working || busy}>
              browse
            </button>
          </p>
          <p className="text-[11.5px] text-faint">
            {kind === 'photo' ? `Compressed to WebP (≤ ${formatBytes(cap)}), location data removed` : kind === 'avatar' ? 'Resized to 128 px' : `Up to ${formatBytes(cap)} each`}
            {maxFiles > 1 && ` · max ${maxFiles}`}
          </p>
          <input ref={input} type="file" hidden multiple={maxFiles > 1} accept={rules.accept} onChange={(e) => handle(e.target.files)} />
          {(working || busy) && <p className="text-[12px] text-muted">{working ? 'Compressing…' : 'Uploading…'}</p>}
        </div>
      ) : (
        <Form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!/^https?:\/\//i.test(url)) return setError('Links must start with https://');
            setError(null);
            await onLink?.(url);
            setUrl('');
          }}
        >
          <Input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={linkPlaceholder} aria-label="Link URL" required />
          <Button type="submit" variant="primary">
            Add link
          </Button>
        </Form>
      )}
      {error && <p className="text-[12.5px] text-danger">{error}</p>}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
        {onLink && (
          <button type="button" className="inline-flex items-center gap-1 font-medium text-accent hover:underline" onClick={() => setMode(mode === 'file' ? 'link' : 'file')}>
            {mode === 'file' ? (
              <>
                <Link2 className="size-3.5" /> Paste a link instead
              </>
            ) : (
              <>
                <UploadCloud className="size-3.5" /> Upload a file instead
              </>
            )}
          </button>
        )}
        {driveHint && <span>{driveHint}</span>}
      </div>
    </div>
  );
}

export function FileCard({
  name,
  size,
  compressed,
  onOpen,
  onDownload,
  onDelete,
  thumb,
}: {
  name: string;
  size?: number | null;
  compressed?: boolean;
  onOpen?: () => void;
  onDownload?: () => void;
  onDelete?: () => void;
  thumb?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-surface px-3 py-2">
      <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-md bg-bg-subtle text-muted">{thumb ?? <FileIcon className="size-4" />}</span>
      <button type="button" onClick={onOpen ?? onDownload} className="min-w-0 flex-1 text-left">
        <p className="truncate text-[13px] font-medium">{name}</p>
        <p className="text-[11.5px] text-faint">
          {size != null && formatBytes(size)}
          {compressed && ' · compressed'}
        </p>
      </button>
      {onDownload && (
        <IconButton label="Download" size="sm" onClick={onDownload}>
          <Download className="size-4" />
        </IconButton>
      )}
      {onDelete && (
        <IconButton label="Delete file" size="sm" onClick={onDelete}>
          <Trash2 className="size-4" />
        </IconButton>
      )}
    </div>
  );
}

export function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function downloadText(text: string, name: string, type = 'text/plain') {
  downloadBlob(new Blob([text], { type }), name);
}

/** RFC 4180 CSV. */
export function toCsv(rows: (string | number | boolean | null | undefined)[][]): string {
  return rows
    .map((r) =>
      r
        .map((v) => {
          const s = v == null ? '' : String(v);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(','),
    )
    .join('\n');
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      row.push(cur);
      cur = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
    } else cur += c;
  }
  if (cur || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim()));
}
