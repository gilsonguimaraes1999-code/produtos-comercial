export interface SupabaseBrowserEnv {
  url: string;
  anonKey: string;
}

export function hasSupabaseBrowserEnv(): boolean {
  return Boolean(
    import.meta.env.VITE_SUPABASE_URL?.trim() &&
      import.meta.env.VITE_SUPABASE_ANON_KEY?.trim(),
  );
}

export function getSupabaseBrowserEnv(): SupabaseBrowserEnv {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) {
    throw new Error("SUPABASE_NOT_CONFIGURED");
  }

  return { url, anonKey };
}
