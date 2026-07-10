import { createClient } from '@supabase/supabase-js'

// کلاینت سمت سرور با service role — فقط داخل API routeها استفاده شود
export const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
