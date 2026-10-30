import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Boxes } from 'lucide-react';
import { Button, Dialog, Input, Select, toast } from '@teamhub/ui';
import { canWith, friendlyError, useMe, useSupabase, type IntegrationClient } from '@teamhub/sdk';

function PartsUsed({ issue }: { issue: { id: string; team_id: string | null } }) {
  const sb = useSupabase();
  const me = useMe();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [item, setItem] = useState('');
  const [qty, setQty] = useState(1);
  const used = useQuery({
    queryKey: ['repairs', 'parts', issue.id],
    queryFn: async () => (await sb.from('ix_repinv_parts').select('qty, inv_items(name)').eq('issue_id', issue.id)).data as { qty: number; inv_items: { name: string } | null }[] | null,
  });
  const parts = useQuery({ queryKey: ['inventory', 'pick'], enabled: open, queryFn: async () => (await sb.from('inv_items').select('id, name, qty').order('name')).data ?? [] });
  const can = canWith(me, 'inventory.edit_qty', issue.team_id);
  return (
    <>
      {(used.data?.length ?? 0) > 0 && (
        <span className="text-[12.5px] text-muted">Parts used: {used.data!.map((u) => `${u.qty}× ${u.inv_items?.name ?? '?'}`).join(', ')}</span>
      )}
      {can && (
        <Button size="sm" icon={<Boxes className="size-4" />} onClick={() => setOpen(true)}>
          Parts used…
        </Button>
      )}
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Record a part used"
        description="It is taken out of inventory."
        size="sm"
        footer={
          <Button
            variant="primary"
            disabled={!item}
            onClick={async () => {
              const { error } = await sb.rpc('ix_repinv_use', { p_issue: issue.id, p_item: item, p_qty: qty });
              if (error) return toast.error(friendlyError(error));
              qc.invalidateQueries({ queryKey: ['repairs'] });
              qc.invalidateQueries({ queryKey: ['inventory'] });
              setOpen(false);
            }}
          >
            Save
          </Button>
        }
      >
        <div className="space-y-3">
          <Select value={item} onChange={(e) => setItem(e.target.value)} disabled={parts.isLoading} aria-label="Part">
            <option value="">{parts.isLoading ? 'Loading parts…' : 'Choose a part…'}</option>
            {(parts.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.qty} in stock)
              </option>
            ))}
          </Select>
          <Input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} aria-label="Quantity" />
        </div>
      </Dialog>
    </>
  );
}

const client: IntegrationClient = { id: 'repairs+inventory', slots: { 'repairs.issue.actions': PartsUsed } };
export default client;
