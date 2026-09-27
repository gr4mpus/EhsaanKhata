"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

/** Returns the current session; redirects to /login (preserving the path) when signed out. */
export function useSession({ required = true } = {}) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
      if (required && !data.session) {
        router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, [required, router]);

  return { session, userId: session?.user.id ?? null, loading };
}
