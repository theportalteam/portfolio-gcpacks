import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://qwoyzeruicwqrvkfutsv.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_FoL4Km3omTgqgRdQTjvBzw_mwOLtgRz";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
