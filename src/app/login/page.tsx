"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { peekPendingInvite, savePendingInvite } from "@/lib/invite";

type Mode = "signin" | "signup" | "onhold" | "forgot" | "reset";

const titles: Record<Mode, string> = {
  signin: "Sign in",
  signup: "Create account",
  onhold: "Account on hold",
  forgot: "Forgot password",
  reset: "Set a new password",
};

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [invite, setInvite] = useState<string | null>(null);
  useEffect(() => {
    // A verification link carries the invite, since it may open in a different browser or app.
    const invitedTo = new URLSearchParams(window.location.search).get("invite");
    if (invitedTo) savePendingInvite(invitedTo);
    // Read after mount: localStorage isn't available during server rendering.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInvite(peekPendingInvite());
  }, []);

  // Landing here from the confirmation email link (see emailRedirectTo below).
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const query = new URLSearchParams(window.location.search);
    const verified = query.get("verified") === "1";
    const linkError = hash.get("error_description");

    // Back from Google: supabase-js reads the session out of the URL; then continue as a normal sign-in.
    if (query.get("oauth") === "1") {
      const next = query.get("next");
      window.history.replaceState(null, "", next ? `/login?next=${encodeURIComponent(next)}` : "/login");
      if (linkError) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setError(`Google sign-in didn't finish: ${linkError.replace(/\+/g, " ")}`);
        return;
      }
      supabase.auth.getSession().then(({ data }) => {
        if (!data.session) return;
        // Same destinations as finish(): a pending invite first, then ?next=, then home.
        const invite = peekPendingInvite();
        router.replace(invite ? `/join/${invite}` : next?.startsWith("/") ? next : "/");
      });
      return;
    }

    if (!verified && !linkError) return;
    window.history.replaceState(null, "", "/login");
    // A valid link verifies the email and creates a session; sign out so the user explicitly signs in.
    supabase.auth.signOut().then(() => {
      if (linkError) {
        setMode("onhold");
        setError(`${linkError.replace(/\+/g, " ")}. Enter your email to get a new verification link.`);
      } else setInfo("Your email is verified. Please sign in to continue.");
    });
  }, [router]);

  const onHoldMessage = (to: string) =>
    `Your account is on hold until you verify your email. Click the link we sent to ${to}, then sign in. ` +
    "The link is valid for 24 hours; if it expires, we'll email you a new one automatically.";

  const emailRedirectTo = () => {
    const pending = peekPendingInvite();
    return `${window.location.origin}/login?verified=1${pending ? `&invite=${encodeURIComponent(pending)}` : ""}`;
  };

  function go(next: Mode, message: string | null = null) {
    setMode(next);
    setError(null);
    setInfo(message);
    setCode("");
    if (next === "reset") setPassword("");
  }

  async function signInWithGoogle() {
    setBusy(true);
    setError(null);
    const next = new URLSearchParams(window.location.search).get("next");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/login?oauth=1${next ? `&next=${encodeURIComponent(next)}` : ""}`,
      },
    });
    // On success the browser is already leaving for Google.
    if (error) {
      setBusy(false);
      setError(error.message);
    }
  }

  function finish() {
    // A pending invite wins: it may have been saved in another tab before email verification.
    const invite = peekPendingInvite();
    if (invite) return router.replace(`/join/${invite}`);
    const next = new URLSearchParams(window.location.search).get("next");
    router.replace(next?.startsWith("/") ? next : "/");
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      if (mode === "signin") {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error?.code === "email_not_confirmed") {
          return go("onhold", onHoldMessage(email));
        }
        if (error) throw error;
        if (data.session) finish();
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: name.trim() }, emailRedirectTo: emailRedirectTo() },
        });
        if (error) throw error;
        // Supabase returns a session straight away only when "Confirm email" is off.
        if (data.session) return finish();
        go("onhold", onHoldMessage(email));
      } else if (mode === "onhold") {
        const { error } = await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: emailRedirectTo() } });
        if (error) throw error;
        setInfo(`A new verification link was sent to ${email}. It replaces any earlier link.`);
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email);
        if (error) throw error;
        go("reset", `If an account exists for ${email}, we sent it a reset code.`);
      } else if (mode === "reset") {
        // Verifying the recovery code signs the user in, which lets them set the new password.
        const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: "recovery" });
        if (error) throw error;
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) throw updateError;
        finish();
      }
    });
  };

  const resendResetCode = () =>
    run(async () => {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
      setInfo(`A new code was sent to ${email}.`);
    });

  const codeInput = (
    <input
      className="input text-center text-lg tracking-[0.4em]"
      inputMode="numeric"
      autoComplete="one-time-code"
      placeholder="Code from email"
      pattern="[0-9]{6,10}"
      maxLength={10}
      value={code}
      onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
      required
    />
  );

  return (
    <div className="mt-10 space-y-6">
      <div className="text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" className="mx-auto mb-5 h-16 w-16 rounded-lg border-2 border-ink shadow-[4px_4px_0_var(--ink)]" />
        <h1 className="text-4xl font-bold"><span className="brand">Ehsaan</span> Khata</h1>
        <p className="mt-2 text-muted">Keep count of the favours your friends do.</p>
      </div>
      {invite && (
        <p className="note bg-accent text-center">
          You&apos;ve been invited to a group. Sign in, or create an account, to send your request to join. You&apos;ll
          get access once a group admin approves it.
        </p>
      )}
      {!supabaseConfigured && (
        <p className="card text-sm">
          Supabase isn&apos;t configured. Copy <code>.env.local.example</code> to <code>.env.local</code> and fill in
          your project URL and anon key.
        </p>
      )}

      <form onSubmit={submit} className="card space-y-3">
        <h2 className="text-lg font-semibold">{titles[mode]}</h2>
        {info && <p className="note bg-accent">{info}</p>}

        {(mode === "signin" || mode === "signup") && (
          <>
            <button
              type="button"
              className="btn-ghost flex w-full items-center justify-center gap-3"
              disabled={busy || !supabaseConfigured}
              onClick={signInWithGoogle}
            >
              <svg aria-hidden viewBox="0 0 48 48" className="h-5 w-5">
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
                <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
              </svg>
              Continue with Google
            </button>
            <div className="flex items-center gap-3 text-xs font-bold tracking-widest text-muted uppercase">
              <span className="h-0.5 flex-1 bg-ink" />
              or with email
              <span className="h-0.5 flex-1 bg-ink" />
            </div>
          </>
        )}

        {mode === "signup" && (
          <input className="input" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} required />
        )}

        {(mode === "signin" || mode === "signup" || mode === "forgot" || mode === "onhold") && (
          <input
            className="input"
            type="email"
            autoComplete="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        )}

        {mode === "reset" && codeInput}

        {(mode === "signin" || mode === "signup" || mode === "reset") && (
          <input
            className="input"
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            placeholder={mode === "reset" ? "New password" : "Password"}
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        )}

        <button className="btn w-full" disabled={busy || !supabaseConfigured}>
          {busy
            ? "Please wait…"
            : { signin: "Sign in", signup: "Create account", onhold: "Resend verification email", forgot: "Send reset code", reset: "Update password" }[mode]}
        </button>

        {error && <p className="note bg-bad-soft">{error}</p>}

        {mode === "signin" && (
          <button type="button" className="block text-sm font-bold underline underline-offset-4" onClick={() => go("forgot")}>
            Forgot password?
          </button>
        )}
        {mode === "reset" && (
          <button type="button" className="text-sm font-bold underline underline-offset-4" disabled={busy} onClick={resendResetCode}>
            Didn&apos;t get it? Resend code
          </button>
        )}
      </form>

      <p className="text-center text-sm text-muted">
        {mode === "signup" ? "Already have an account?" : mode === "signin" ? "New here?" : ""}{" "}
        <button className="font-bold underline decoration-accent decoration-4 underline-offset-4" onClick={() => go(mode === "signin" ? "signup" : "signin")}>
          {mode === "signin" ? "Create an account" : "Back to sign in"}
        </button>
      </p>
    </div>
  );
}
