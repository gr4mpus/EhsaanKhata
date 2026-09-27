"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

/** Admin-only "danger zone": deleting needs the group's name typed in, as it can't be undone. */
export function DeleteGroup({ groupId, groupName }: { groupId: string; groupName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = typed.trim().toLowerCase() === groupName.trim().toLowerCase();

  async function remove(e: React.FormEvent) {
    e.preventDefault();
    if (!matches || busy) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("delete_group", { gid: groupId });
    if (error) {
      setBusy(false);
      return setError(error.message);
    }
    router.replace("/");
  }

  if (!open) {
    return (
      <section className="card flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Delete group</h2>
          <p className="text-xs text-muted">Removes the group and all its Ehsaan Points for everyone.</p>
        </div>
        <button className="btn-ghost shrink-0 bg-bad-soft text-sm text-[#111]" onClick={() => setOpen(true)}>
          Delete…
        </button>
      </section>
    );
  }

  return (
    <form onSubmit={remove} className="card space-y-3 bg-bad-soft text-[#111]">
      <h2 className="text-lg font-bold">Delete &ldquo;{groupName}&rdquo;?</h2>
      <p className="text-sm">
        This permanently deletes the group for <b>all members</b>: every Ehsaan entry, balance and pending join request.
        It can&apos;t be undone.
      </p>
      <label className="block space-y-1 text-sm font-medium">
        <span>
          Type <b>{groupName}</b> to confirm
        </span>
        <input className="input text-[#111]" autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} />
      </label>
      {error && <p className="note bg-surface">{error}</p>}
      <div className="flex gap-2">
        <button className="btn flex-1 bg-[#111] text-white" disabled={!matches || busy}>
          {busy ? "Deleting…" : "Delete forever"}
        </button>
        <button
          type="button"
          className="btn-ghost flex-1"
          onClick={() => {
            setOpen(false);
            setTyped("");
            setError(null);
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
