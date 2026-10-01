// Operator-only: creates accounts (if needed) and issues personal sign-in links, for use while
// email delivery is not configured. Only someone with shell access to the server can run it;
// nothing about it is reachable from the web.
//
//   node scripts/issue-login.mjs [--days 7] [--uses 3] "علی" "سارا:sara@example.com" ...
//
// Each argument is a display name, optionally followed by ":email". Without an email a private
// placeholder address (…@login.tavalod.invalid) is generated; pass it back as "name:email" later
// to issue a fresh link for the same account. Output: one line per person, tab-separated:
//   name  email  link
// A link opens a confirmation page; it works up to --uses times (browser + installed app) until
// --days, and each use opens a 30-day session. Only the SHA-256 of the token is stored.
import { createHash, randomBytes } from "node:crypto";
import postgres from "postgres";

const args = process.argv.slice(2);
let days = 7;
let uses = 3;
const people = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--days") days = Number(args[++i]);
  else if (args[i] === "--uses") uses = Number(args[++i]);
  else people.push(args[i]);
}
if (!people.length || !(days > 0 && days <= 30) || !(uses >= 1 && uses <= 10)) {
  console.error('usage: node scripts/issue-login.mjs [--days 1-30] [--uses 1-10] "name[:email]" ...');
  process.exit(2);
}
const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  for (const entry of people) {
    const sep = entry.lastIndexOf(":");
    const hasEmail = sep > 0 && entry.slice(sep + 1).includes("@");
    const name = (hasEmail ? entry.slice(0, sep) : entry).trim().slice(0, 60);
    const email = (hasEmail ? entry.slice(sep + 1) : `u-${randomBytes(6).toString("hex")}@login.tavalod.invalid`)
      .trim()
      .toLowerCase();
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      console.error(`skipped invalid entry: ${entry}`);
      process.exitCode = 1;
      continue;
    }
    await sql`insert into users (email, name) values (${email}, ${name}) on conflict (email) do nothing`;
    const token = randomBytes(32).toString("base64url");
    const hash = createHash("sha256").update(token).digest("hex");
    await sql`
      insert into login_tokens (email, token_hash, next_path, expires_at, max_uses)
      values (${email}, ${hash}, '/me?welcome=1', now() + make_interval(days => ${days}), ${uses})`;
    console.log(`${name}\t${email}\t${appUrl}/auth/verify?token=${token}`);
  }
} finally {
  await sql.end({ timeout: 5 });
}
