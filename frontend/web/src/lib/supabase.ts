import { createClient } from '@supabase/supabase-js';

// Both values are public by design: access is enforced by row level security (only signed-in, allow-listed users can read).
const url = ((import.meta as any).env?.VITE_SUPABASE_URL as string | undefined) || 'https://xqsuuhgakodtlpcyletx.supabase.co';
const key = ((import.meta as any).env?.VITE_SUPABASE_KEY as string | undefined) || 'sb_publishable_ashrGrVPZUN_9uhUpqnoog_eR5ruBKI';

export const supabase = createClient(url, key);
