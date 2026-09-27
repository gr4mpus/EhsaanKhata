"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/useSession";
import { avatarSets, avatarUrl } from "@/lib/avatars";
import { Avatar } from "@/components/Avatar";

export default function ProfilePage() {
  const router = useRouter();
  const { session, userId } = useSession();
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from("profiles")
      .select("display_name, avatar")
      .eq("id", userId)
      .single()
      .then(({ data, error }) => {
        if (error) setMessage({ ok: false, text: error.message });
        else {
          setName(data.display_name);
          setAvatar(data.avatar);
        }
        setLoaded(true);
      });
  }, [userId]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.from("profiles").update({ display_name: name.trim(), avatar }).eq("id", userId);
    if (error) {
      setBusy(false);
      setMessage({ ok: false, text: error.message });
      return;
    }
    setMessage({ ok: true, text: "Profile saved! Taking you home…" });
    setTimeout(() => router.push("/"), 800);
  }

  if (!session || !loaded) return null;

  return (
    <form onSubmit={save} className="space-y-6">
      <header className="space-y-1">
        <Link href="/" className="text-sm text-muted">
          ← Groups
        </Link>
        <h1 className="text-3xl font-bold">Your profile</h1>
      </header>

      <section className="card flex items-center gap-4">
        <Avatar name={name || "?"} avatar={avatar} size={72} />
        <div className="min-w-0 flex-1 space-y-1">
          <label htmlFor="name" className="text-sm text-muted">
            Display name
          </label>
          <input id="name" className="input" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} required />
          <p className="truncate text-xs text-muted">{session.user.email}</p>
        </div>
      </section>

      <section className="card space-y-5">
        <h2 className="text-lg font-semibold">Pick your avatar</h2>
        {avatarSets.map((set) => (
          <div key={set.style} className="space-y-2">
            <p className="text-sm font-medium text-muted">{set.label}</p>
            <div className="grid grid-cols-4 gap-3 sm:grid-cols-8">
              {set.seeds.map((seed) => {
                const id = `${set.style}:${seed}`;
                const selected = avatar === id;
                return (
                  <button
                    key={id}
                    type="button"
                    title={seed}
                    aria-label={`${set.label} avatar ${seed}`}
                    aria-pressed={selected}
                    onClick={() => setAvatar(id)}
                    className={`aspect-square rounded-full border-2 transition-transform ${
                      selected ? "-translate-y-0.5 border-ink bg-accent shadow-[3px_3px_0_var(--ink)]" : "border-transparent hover:border-ink"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={avatarUrl(id)} alt="" loading="lazy" className="h-full w-full rounded-full" />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {avatar && (
          <button type="button" className="text-sm text-muted underline" onClick={() => setAvatar(null)}>
            Use my initial instead
          </button>
        )}
      </section>

      <div className="sticky bottom-4 space-y-2">
        {message && (
          <p className={`note ${message.ok ? "bg-ok-soft" : "bg-bad-soft"}`}>
            {message.text}
          </p>
        )}
        <button className="btn w-full" disabled={busy}>
          {busy ? "Saving…" : "Save profile"}
        </button>
      </div>

      <p className="text-center text-xs text-muted">
        Avatars by{" "}
        <a className="underline" href="https://www.dicebear.com" target="_blank" rel="noreferrer">
          DiceBear
        </a>
        : Fun Emoji by Davis Uche, Big Smile by Ashley Seo and Croodles by vijay verma (all CC BY 4.0), and Bottts by Pablo Stanley.
      </p>
    </form>
  );
}
