try {
  await import("dotenv/config");
} catch {
  // dotenv is optional in production CI/Cloudflare Pages
}

export default function () {
  const url = (process.env.SUPABASE_URL || "").trim();
  const anonKey = (process.env.SUPABASE_ANON_KEY || "").trim();

  return {
    url,
    anonKey,
    configured: Boolean(url && anonKey),
  };
}
