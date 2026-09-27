"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Avatar } from "@/components/Avatar";
import type { JoinRequest, Member } from "@/lib/types";

/** Members list plus admin-only tools: join requests, invite link and admin roles. */
export function MembersPanel({
  groupId,
  members,
  userId,
  onChanged,
  onError,
}: {
  groupId: string;
  members: Member[];
  userId: string | null;
  onChanged: () => void;
  onError: (msg: string) => void;
}) {
  const isAdmin = members.some((m) => m.user_id === userId && m.role === "admin");
  const adminCount = members.filter((m) => m.role === "admin").length;
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    const { data, error } = await supabase
      .from("join_requests")
      .select("user_id, created_at, profiles!join_requests_user_id_fkey(id, display_name, avatar)")
      .eq("group_id", groupId)
      .eq("status", "pending")
      .order("created_at");
    if (error) onError(error.message);
    else setRequests(data as unknown as JoinRequest[]);
  }, [groupId, onError]);

  useEffect(() => {
    if (!isAdmin) return;
    supabase.rpc("get_invite_code", { gid: groupId }).then(({ data }) => setInviteCode(data));
    // Fetch results arrive asynchronously; nothing is set synchronously here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadRequests();
    const channel = supabase
      .channel(`join-requests-${groupId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "join_requests", filter: `group_id=eq.${groupId}` }, loadRequests)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin, groupId, loadRequests]);

  async function act(key: string, call: PromiseLike<{ error: { message: string } | null }>) {
    setBusy(key);
    const { error } = await call;
    setBusy(null);
    if (error) onError(error.message);
    loadRequests();
    onChanged();
  }

  const decide = (requester: string, approve: boolean) =>
    act(`req-${requester}`, supabase.rpc("decide_join_request", { gid: groupId, requester, approve }));

  const setRole = (member: string, role: "admin" | "member") =>
    act(`role-${member}`, supabase.rpc("set_member_role", { gid: groupId, member, new_role: role }));

  function copyInvite() {
    navigator.clipboard.writeText(`${window.location.origin}/join/${inviteCode}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      {isAdmin && requests.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Asking to join</h2>
          {requests.map((r) => (
            <div key={r.user_id} className="card flex items-center gap-3 bg-accent-soft">
              <Avatar name={r.profiles.display_name} avatar={r.profiles.avatar} size={36} />
              <span className="flex-1 truncate font-bold">{r.profiles.display_name}</span>
              <button className="btn px-3 py-1.5 text-sm" disabled={busy !== null} onClick={() => decide(r.user_id, true)}>
                Approve
              </button>
              <button className="btn-ghost px-3 py-1.5 text-sm" disabled={busy !== null} onClick={() => decide(r.user_id, false)}>
                Decline
              </button>
            </div>
          ))}
        </section>
      )}

      <section className="card space-y-4">
        <h2 className="text-lg font-semibold">Members</h2>
        <ul className="space-y-2 text-sm">
          {members.map((m) => {
            const admin = m.role === "admin";
            const lastAdmin = admin && adminCount <= 1;
            return (
              <li key={m.user_id} className="flex items-center gap-2">
                <Avatar name={m.profiles.display_name} avatar={m.profiles.avatar} />
                <span className="flex-1 truncate">
                  {m.profiles.display_name}
                  {m.user_id === userId && <span className="text-muted"> (you)</span>}
                </span>
                {admin && <span className="chip bg-accent">Admin</span>}
                {isAdmin && !lastAdmin && (
                  <button
                    className="text-xs font-bold underline"
                    disabled={busy !== null}
                    onClick={() => setRole(m.user_id, admin ? "member" : "admin")}
                  >
                    {admin ? "Remove admin" : "Make admin"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        {isAdmin ? (
          <div className="space-y-2 border-t-2 border-ink pt-4">
            <p className="text-sm">
              Invite code:{" "}
              <code className="rounded border-2 border-ink bg-accent px-2 py-0.5 font-bold tracking-widest">
                {inviteCode ?? "…"}
              </code>
            </p>
            <button className="btn-ghost w-full text-sm" disabled={!inviteCode} onClick={copyInvite}>
              {copied ? "Copied ✓" : "Copy invite link"}
            </button>
            <p className="text-xs text-muted">Anyone who opens the link asks to join. An admin has to approve them.</p>
          </div>
        ) : (
          <p className="border-t-2 border-ink pt-4 text-xs text-muted">
            Only admins can share the invite link. Ask an admin if you want to bring someone in.
          </p>
        )}
      </section>
    </>
  );
}
