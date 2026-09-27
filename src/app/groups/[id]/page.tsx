"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/useSession";
import { computeDebts, computeStanding, type Standing } from "@/lib/balances";
import type { Entry, Group, Member } from "@/lib/types";
import { Avatar } from "@/components/Avatar";
import { Celebration, type CelebrationEvent } from "@/components/Celebration";
import { StandingPopup } from "@/components/StandingPopup";
import { MemberPicker } from "@/components/MemberPicker";
import { MembersPanel } from "@/components/MembersPanel";

export default function GroupPage() {
  const { id } = useParams<{ id: string }>();
  const { userId } = useSession();
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<CelebrationEvent | null>(null);
  // Last seen status per entry, to notice when one flips to approved (null until the first load).
  const seenStatuses = useRef<Map<string, Entry["status"]> | null>(null);
  const celebrate = (title: string, subtitle?: string) => setCelebration({ id: Date.now(), title, subtitle });

  const load = useCallback(async () => {
    const [g, m, e] = await Promise.all([
      supabase.from("groups").select("id, name, approval_threshold, created_by").eq("id", id).single(),
      supabase.from("group_members").select("user_id, role, profiles(id, display_name, avatar)").eq("group_id", id),
      supabase.from("ehsaan_entries").select("*").eq("group_id", id).order("created_at", { ascending: false }),
    ]);
    const err = g.error ?? m.error ?? e.error;
    if (err) return setError(err.message);
    setGroup(g.data);
    setMembers(m.data as unknown as Member[]);
    const rows = e.data as Entry[];
    const previous = seenStatuses.current;
    const justApproved = previous ? rows.find((r) => r.status === "approved" && previous.get(r.id) === "pending") : undefined;
    seenStatuses.current = new Map(rows.map((r) => [r.id, r.status]));
    if (justApproved) {
      const people = m.data as unknown as Member[];
      const doer = people.find((p) => p.user_id === justApproved.doer_id)?.profiles.display_name ?? "Someone";
      celebrate(`+${justApproved.points} EP approved!`, `${doer}'s Ehsaan is now official 🎉`);
    }
    setEntries(rows);
  }, [id]);

  useEffect(() => {
    if (!userId) return;
    // load() only sets state after the fetch resolves, not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // Any change to this group's entries (including approvals) or members triggers a refetch; RLS limits what we receive.
    const channel = supabase
      .channel(`group-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ehsaan_entries", filter: `group_id=eq.${id}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "group_members", filter: `group_id=eq.${id}` }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, id, load]);

  const names = useMemo(() => new Map(members.map((m) => [m.user_id, m.profiles.display_name])), [members]);
  const name = (uid: string) => (uid === userId ? "You" : (names.get(uid) ?? "Former member"));
  const avatars = useMemo(() => new Map(members.map((m) => [m.user_id, m.profiles.avatar])), [members]);
  const face = (uid: string, size?: number) => <Avatar name={names.get(uid) ?? "?"} avatar={avatars.get(uid)} size={size} />;
  const debts = useMemo(() => computeDebts(entries), [entries]);
  // Worked out once, from the first load only, so the sticker shows when the group is opened and not on every update.
  const [standing, setStanding] = useState<Standing | null | undefined>(undefined);
  useEffect(() => {
    if (standing !== undefined || !userId || seenStatuses.current === null) return;
    setStanding(computeStanding(entries, userId));
  }, [standing, entries, userId]);

  // Only the person who received the favour approves it.
  const needsMyVote = entries.filter((e) => e.status === "pending" && e.receiver_id === userId);

  async function vote(entryId: string, approve: boolean) {
    const { error } = await supabase.from("votes").upsert({ entry_id: entryId, voter_id: userId, approve });
    if (error) setError(error.message);
    else load();
  }

  async function withdraw(entryId: string) {
    const { error } = await supabase.from("ehsaan_entries").delete().eq("id", entryId);
    if (error) setError(error.message);
    else load();
  }

  if (!group) return <p className="mt-10 text-center text-muted">{error ?? "Loading…"}</p>;

  return (
    <div className="space-y-6">
      <Celebration event={celebration} />
      {standing && <StandingPopup standing={standing} />}
      <header className="space-y-1">
        <Link href="/" className="text-sm text-muted">
          ← Groups
        </Link>
        <h1 className="text-3xl font-bold">{group.name}</h1>
        <p className="text-sm text-muted">
          {members.length} members · each Ehsaan is approved by the person who was helped
        </p>
      </header>

      {error && <p className="note bg-bad-soft">{error}</p>}

      <section className="card space-y-2">
        <h2 className="text-lg font-semibold">Balances</h2>
        {debts.length === 0 && <p className="text-sm text-muted">All square. No approved Ehsaan Points yet.</p>}
        <ul className="space-y-2">
          {debts.map((d) => (
            <li key={`${d.debtor}-${d.creditor}`} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                {face(d.debtor)}
                <b>{name(d.debtor)}</b> {d.debtor === userId ? "owe" : "owes"} <b>{name(d.creditor)}</b>
              </span>
              <span className="brand text-lg font-bold">{d.points} EP</span>
            </li>
          ))}
        </ul>
      </section>

      {needsMyVote.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Waiting for your approval</h2>
          {needsMyVote.map((e) => (
            <div key={e.id} className="card space-y-3 bg-accent-soft">
              <EntryText entry={e} name={name} face={face} />
              <div className="flex gap-2">
                <button className="btn flex-1" onClick={() => vote(e.id, true)}>
                  Approve
                </button>
                <button className="btn-ghost flex-1" onClick={() => vote(e.id, false)}>
                  Reject
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      <AddEhsaan groupId={id} members={members} userId={userId} onAdded={(points, receiver) => {
          celebrate(`+${points} Ehsaan Points`, `Sent to ${receiver} for approval. Thanks for helping!`);
          load();
        }}
        onError={setError}
      />

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">History</h2>
        {entries.length === 0 && <p className="text-sm text-muted">Nothing logged yet.</p>}
        {entries.map((e) => {
          const who = e.receiver_id === userId ? "you" : name(e.receiver_id);
          return (
            <div key={e.id} className="card space-y-2">
              <div className="flex items-start justify-between gap-3">
                <EntryText entry={e} name={name} face={face} />
                <StatusBadge status={e.status} />
              </div>
              <div className="flex items-center justify-between text-xs text-muted">
                <span>
                  {e.status === "pending" ? `Waiting for ${who} to approve` : `${e.status === "approved" ? "Approved" : "Rejected"} by ${who}`}
                </span>
                {e.status === "pending" && e.doer_id === userId && (
                  <button className="underline" onClick={() => withdraw(e.id)}>
                    Withdraw
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </section>

      <MembersPanel groupId={id} members={members} userId={userId} onChanged={load} onError={setError} />
    </div>
  );
}

function EntryText({
  entry,
  name,
  face,
}: {
  entry: Entry;
  name: (uid: string) => string;
  face: (uid: string, size?: number) => React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="relative mt-0.5 flex shrink-0">
        {face(entry.doer_id, 36)}
        <span className="absolute -right-2 -bottom-1">{face(entry.receiver_id, 20)}</span>
      </span>
      <div>
      <p>
        <b>{name(entry.doer_id)}</b> helped <b>{name(entry.receiver_id)}</b>{" "}
        <span className="brand font-bold">+{entry.points} EP</span>
      </p>
      <p className="text-sm text-muted">{entry.description}</p>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Entry["status"] }) {
  const styles = {
    pending: "bg-accent-soft",
    approved: "bg-ok-soft text-ok",
    rejected: "bg-bad-soft text-bad",
  };
  return <span className={`chip capitalize ${styles[status]}`}>{status}</span>;
}

function AddEhsaan({
  groupId,
  members,
  userId,
  onAdded,
  onError,
}: {
  groupId: string;
  members: Member[];
  userId: string | null;
  onAdded: (points: number, receiverNames: string) => void;
  onError: (msg: string) => void;
}) {
  const others = members.filter((m) => m.user_id !== userId);
  const [receivers, setReceivers] = useState<string[]>([]);
  const [points, setPoints] = useState(1);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [missingReceiver, setMissingReceiver] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (receivers.length === 0) return setMissingReceiver(true);
    setBusy(true);
    // One entry per person helped, so each of them approves their own.
    const { error } = await supabase.from("ehsaan_entries").insert(
      receivers.map((receiver_id) => ({
        group_id: groupId,
        doer_id: userId,
        receiver_id,
        points,
        description: description.trim(),
      })),
    );
    setBusy(false);
    if (error) return onError(error.message);
    setDescription("");
    setPoints(1);
    setReceivers([]);
    const helped = others.filter((m) => receivers.includes(m.user_id));
    onAdded(
      points,
      helped.length === others.length && helped.length > 1
        ? `everyone (${helped.length} people, ${points} EP each)`
        : helped.map((m) => m.profiles.display_name).join(", "),
    );
  }

  if (others.length === 0) {
    return <p className="card text-sm text-muted">Invite someone to start logging Ehsaan Points.</p>;
  }

  return (
    <form onSubmit={submit} className="card space-y-2">
      <h2 className="text-lg font-semibold">Log a favour you did</h2>
      <MemberPicker
        members={others}
        value={receivers}
        onChange={(ids) => {
          setReceivers(ids);
          if (ids.length > 0) setMissingReceiver(false);
        }}
        placeholder="Who did you help?"
        invalid={missingReceiver}
      />
      {missingReceiver && <p className="text-sm font-bold">Pick who you helped.</p>}
      {receivers.length > 1 && (
        <p className="text-xs text-muted">Each person gets their own entry for these points and approves it themselves.</p>
      )}
      <input
        className="input"
        placeholder="What did you do? e.g. Airport pickup at 3am"
        maxLength={280}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        required
      />
      <div className="flex gap-2">
        <input
          className="input w-24"
          type="number"
          min={1}
          max={100}
          value={points}
          onChange={(e) => setPoints(Number(e.target.value))}
          required
        />
        <button className="btn flex-1" disabled={busy}>
          Submit for approval
        </button>
      </div>
    </form>
  );
}
