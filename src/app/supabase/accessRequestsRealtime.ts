import type { SupabaseClient } from '@supabase/supabase-js';

export function subscribeToAccessRequests(
  client: SupabaseClient,
  onChange: () => void,
  debounceMs = 120,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const notify = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(onChange, debounceMs);
  };
  const channel = client.channel('access-requests-management')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'access_requests' }, notify)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'access_request_cities' }, notify)
    .subscribe();

  return () => {
    if (timer) clearTimeout(timer);
    void client.removeChannel(channel);
  };
}
