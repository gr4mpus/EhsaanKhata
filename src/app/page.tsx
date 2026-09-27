"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/useSession";
import type { Group, MyJoinRequest, Profile } from "@/lib/types";
import { Avatar } from "@/components/Avatar";
import { parseInviteCode } from "@/lib/invite";

type GroupRow = Group & { pending: number; requests: number };

export default function HomePage() {
  const router = useRouter();
  const { session, userId } = useSession();
  const [groups, setGroups] = useState<GroupRow[] | null>(null);
  const [newName, setNewName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<Profile | null>(null);
  const [myRequests, setMyRequests] = useState<MyJoinRequest[]>([]);

  const load = useCallback(async () => {
    supabase.from("profiles").select("id, display_name, avatar").eq("id", userId).single().then(({ data }) => setMe(data));
    supabase.rpc("my_join_requests").then(({ data }) => setMyRequests((data as MyJoinRequest[]) ?? []));
    const [{ data, error }, requests] = await Promise.all([
      supabase
        .from("groups")
        .select("id, name, approval_threshold, created_by, ehsaan_entries(id, status, receiver_id)")
        .order("created_at", { ascending: false }),
      // RLS only returns other people's requests for groups I'm an admin of.
      supabase.from("join_requests").select("group_id").eq("status", "pending").neq("user_id", userId),
    ]);
    if (error) return setError(error.message);
    setGroups(
      (data ?? []).map(({ ehsaan_entries, ...g }) => ({
        ...g,
        requests: (requests.data ?? []).filter((r) => r.group_id === g.id).length,
        // Entries waiting for *my* approval (only the person helped approves).
        pending: (ehsaan_entries as { status: string; receiver_id: string }[]).filter(
          (e) => e.status === "pending" && e.receiver_id === userId,
        ).length,
      })),
    );
  }, [userId]);

  useEffect(() => {
    // load() only sets state after the fetch resolves, not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (userId) load();
  }, [userId, load]);

  async function createGroup(e: React.FormEvent) {
    e.preventDefault();
    const { data, error } = await supabase.rpc("create_group", { group_name: newName });
    if (error) return setError(error.message);
    router.push(`/groups/${data}`);
  }

  async function joinGroup(e: React.FormEvent) {
    e.preventDefault();
    // The join page sends the request and shows its status.
    router.push(`/join/${code}`);
  }

  if (!session) return null;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold tracking-widest text-muted uppercase">Ehsaan Khata</p>
          <h1 className="text-3xl font-bold">Your groups</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/profile" title="Edit profile" className="rounded-full transition hover:scale-105">
            <Avatar name={me?.display_name ?? "?"} avatar={me?.avatar} size={40} />
          </Link>
          <button className="btn-ghost px-3 py-2 text-sm" onClick={() => supabase.auth.signOut().then(() => router.replace("/login"))}>
            Sign out
          </button>
        </div>
      </header>

      {error && <p className="note bg-bad-soft">{error}</p>}

      <ul className="space-y-3">
        {groups?.map((g) => (
          <li key={g.id}>
            <Link href={`/groups/${g.id}`} className="card flex items-center justify-between gap-3">
              <span className="flex items-center gap-3">
                <span className="avatar h-10 w-10 text-sm">{g.name.slice(0, 2).toUpperCase()}</span>
                <span className="font-semibold">{g.name}</span>
              </span>
              <span className="flex gap-1.5">
                {g.requests > 0 && <span className="chip bg-pink">{g.requests} to admit</span>}
                {g.pending > 0 && <span className="chip bg-accent">{g.pending} to approve</span>}
              </span>
            </Link>
          </li>
        ))}
        {groups?.length === 0 && <p className="card text-muted">No groups yet. Create one or join with an invite code.</p>}
      </ul>

      {myRequests.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Waiting to join</h2>
          {myRequests.map((r) => (
            <Link key={r.group_id} href={`/join/${r.invite_code}`} className="card flex items-center justify-between gap-3">
              <span className="font-semibold">{r.group_name}</span>
              <span className={`chip ${r.status === "pending" ? "bg-accent-soft" : "bg-bad-soft"}`}>
                {r.status === "pending" ? "Awaiting admin" : "Declined"}
              </span>
            </Link>
          ))}
        </section>
      )}

      <form onSubmit={createGroup} className="card space-y-2">
        <h2 className="text-lg font-semibold">Create a group</h2>
        <div className="flex gap-2">
          <input className="input" placeholder="Group name" value={newName} onChange={(e) => setNewName(e.target.value)} required />
          <button className="btn">Create</button>
        </div>
      </form>

      <form onSubmit={joinGroup} className="card space-y-2">
        <h2 className="text-lg font-semibold">Join a group</h2>
        <div className="flex gap-2">
          <input
            className="input"
            placeholder="Invite code or link"
            aria-label="Invite code or invite link"
            value={code}
            // Pasting a full invite link keeps only the code at the end of it.
            onChange={(e) => setCode(parseInviteCode(e.target.value))}
            required
          />
          <button className="btn-ghost">Join</button>
        </div>
      </form>
    </div>
  );
}
