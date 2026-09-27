"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/useSession";
import { clearPendingInvite, parseInviteCode, savePendingInvite } from "@/lib/invite";

type JoinState = { group_id: string; group_name: string; status: "member" | "pending" | "approved" | "rejected" };

export default function JoinPage() {
  const params = useParams<{ code: string }>();
  const code = parseInviteCode(params.code);
  const router = useRouter();
  const [state, setState] = useState<JoinState | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Saved before useSession can bounce a signed-out visitor to /login, so the invite survives sign-up.
  useEffect(() => savePendingInvite(code), [code]);

  const { userId } = useSession();

  // Sends the request the first time; afterwards it just reports the current status.
  const check = useCallback(async () => {
    const { data, error } = await supabase.rpc("join_group", { code });
    clearPendingInvite();
    if (error) return setError(error.message);
    const row = (data as JoinState[])[0];
    if (row.status === "member" || row.status === "approved") router.replace(`/groups/${row.group_id}`);
    else setState(row);
  }, [code, router]);

  useEffect(() => {
    if (!userId) return;
    // check() only sets state once the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    check();
    // Live update when an admin decides, with a slow poll as a fallback.
    const channel = supabase
      .channel(`my-join-${code}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "join_requests", filter: `user_id=eq.${userId}` }, check)
      .subscribe();
    const poll = setInterval(check, 20000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, [userId, code, check]);

  async function askAgain() {
    if (!state) return;
    const { error } = await supabase.rpc("retry_join_request", { gid: state.group_id });
    if (error) setError(error.message);
    else check();
  }

  if (error) {
    return (
      <div className="card mt-10 space-y-3 text-center">
        <p className="font-bold">Couldn&apos;t join this group</p>
        <p className="note bg-bad-soft">{error}</p>
        <Link href="/" className="btn inline-block">
          Go to my groups
        </Link>
      </div>
    );
  }

  if (!state) return <p className="card mt-10 text-center font-bold">Checking invite {code}…</p>;

  if (state.status === "rejected") {
    return (
      <div className="card mt-6 space-y-4 text-center">
        <p className="text-2xl font-bold">Request declined</p>
        <p className="text-muted">
          An admin of <b className="text-foreground">{state.group_name}</b> didn&apos;t approve your request. If you think
          that was a mistake, let them know and ask again.
        </p>
        <div className="flex gap-2">
          <button className="btn flex-1" onClick={askAgain}>
            Ask again
          </button>
          <Link href="/" className="btn-ghost flex-1">
            My groups
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-5">
      <div className="card space-y-5 text-center">
        <Image
          src="/waiting-dog.jpg"
          alt="A dog meditating calmly on a mat"
          width={436}
          height={520}
          priority
          className="waiting-breathe mx-auto h-auto w-full max-w-[18rem] rounded-md border-2 border-ink shadow-[4px_4px_0_var(--ink)]"
        />
        <div className="space-y-2">
          <p className="chip mx-auto bg-accent">Waiting for approval</p>
          <h1 className="text-2xl font-bold">
            Request sent to join <span className="brand">{state.group_name}</span>
          </h1>
          <p className="text-muted">
            An admin of this group needs to approve you. You&apos;ll be added as soon as they do. Stay calm, like this
            fellow. 🧘
          </p>
        </div>
        <p className="flex items-center justify-center gap-2 text-sm font-bold">
          <span className="waiting-dot" aria-hidden />
          This page updates by itself once you&apos;re approved
        </p>
      </div>

      <div className="card space-y-2 text-sm">
        <p className="font-bold">While you wait</p>
        <ul className="list-disc space-y-1 pl-5 text-muted">
          <li>You can close this page. The group shows up under &ldquo;Waiting to join&rdquo; on your home screen.</li>
          <li>Once you&apos;re approved, you can log favours and vote on other people&apos;s Ehsaan Points.</li>
          <li>Taking a while? Ask the person who invited you to remind an admin.</li>
        </ul>
        <Link href="/" className="btn-ghost mt-2 block text-center">
          Go to my groups
        </Link>
      </div>
    </div>
  );
}
