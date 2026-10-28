# Automation portfolio & Portfolio Studio

A responsive public portfolio and private, single-owner content dashboard. No invented projects or credentials are included. The starting page has clearly labeled placeholders and empty project/certification states.

## Stack

Node.js 24, Express, plain browser JavaScript and CSS, SQLite, and local uploads. There is no frontend build step or separately billed database/auth service. SQLite holds drafts, published content, account credentials and persistent sessions. This is designed for **one application instance with a persistent disk**, not ephemeral/serverless hosts or multiple replicas.

## Preview locally

```sh
npm ci
npm start
```

Open port 3000 in your local browser; the portfolio is at `/`, the dashboard at `/admin`. In a remote development environment use its supported port forwarding if available; a local address is not a publicly hosted website. The public site works before a password is set. The dashboard will explain private password setup.

In a separate **private interactive terminal**, from this directory:

```sh
npm run admin:password
```

Enter and confirm a unique password (14–72 bytes); typing is hidden. Sign in as **jesskkie**. There is no default password or public registration. Never send the password through chat, put it in a command argument, or commit it. Password reset uses the same private terminal command, keeps MFA enabled, and revokes existing sessions.

Optional authenticator-app MFA:

```sh
npm run admin:mfa
```

Privately add the displayed key to an authenticator (e.g. 1Password, Google Authenticator or Aegis), then verify a code. The key is displayed only during this private interactive enrollment. Protect host terminal access: it is the recovery method. To recover lost MFA access, run `npm run admin:mfa -- --disable` privately, then enroll again. Sessions are revoked on enrollment/reset. Keep server time synchronized.

## Editing workflow

1. Edit Profile & contact. Skills are one per line. Blank contact fields are omitted from the site. Résumé is optional.
2. Add projects or certifications; enter actual details and use the arrows to reorder them. Check **Include on public site** for items you want visible.
3. Upload PNG/JPEG/WebP images or PDF documents (8 MB limit). Copy the path into an image, document, or résumé field. External links must use HTTPS. Use your own images rather than tracking external image hosts.
4. **Save draft** persists edits privately. **Preview draft** opens a signed-in preview of the saved draft. If the browser blocks the tab, open `/preview` on the dashboard host.
5. **Publish changes** asks for confirmation, saves the draft, and updates the public content snapshot. Removing/unchecking an item takes effect publicly only after publishing. Preview shows all draft entries, including entries not yet enabled for the public site.
6. Delete unused media from the library. Files still referenced by either draft or published content cannot be deleted. Draft/unused uploads require authentication; published referenced files are available to visitors. Removing public references and publishing makes them private again, though already downloaded copies cannot be recalled.

Text is rendered as text rather than HTML. Documents are served as downloads; SVG, HTML, executables and other file types are rejected. Image fields should contain image files, and résumé/document fields should contain PDFs. Filenames are metadata; storage uses random IDs. File URLs cannot be guessed to bypass publication checks.

## Verification

```sh
npm test
npm audit --omit=dev
```

Integration tests start an isolated real server with a temporary database, randomly generated credentials, and temporary uploads. They cover unauthorized reads/writes/preview, CSRF, invalid credentials, MFA, conflicting edits, upload type checks, draft privacy, item publication, public asset access, persistent content/sessions across restart, logout and rate limiting. No testing credentials are written to the development database.

Browser checks:

```sh
npx playwright install chromium
npm run test:browser
# Or use a supported system Chromium already installed:
# CHROMIUM_PATH=/usr/bin/chromium npm run test:browser
```

These start an isolated server and exercise the editor, publication, upload, modal details, keyboard focus, certification editing/reordering/removal, WCAG accessibility checks, and mobile/tablet/desktop overflow. Optional screenshots are generated under `test-results/`.

## Hosting and launch — requires your accounts and approval

Nothing in this repository purchases services, creates paid resources, or publishes a site. Do these steps only when you are ready. Recommended straightforward hosting: a small Linux VPS with Docker and a persistent disk. Plan approximately **US$6–15/month** for a small VPS, **US$10–30/year** for a normal domain (premium names cost more), and possibly **US$1–5/month** for backups. These are estimates; check the provider’s current quote before buying. Caddy HTTPS and the included database/authentication have no separate service charge. A managed container host with a persistent volume also works; use its HTTPS/domain routing instead of Caddy and one replica only.

1. **You:** choose a domain and hosting provider, create accounts with MFA, and approve their quoted costs. You can buy a domain from a registrar such as Porkbun or Cloudflare Registrar. `jesse.com` was an example, not a domain assumed to be available or owned by you.
2. **You:** provision an Ubuntu/Debian VPS, install Docker Engine and Compose from Docker’s official instructions, use SSH keys, keep it patched, and permit inbound 80/443 and restricted SSH. Do not expose app port 3000 publicly.
3. **You:** in DNS add `A` records for the apex (`@`) and `dashboard` pointing to the VPS IPv4 address. Add `AAAA` only if IPv6 is configured. Optional `www` needs its own DNS and Caddy entry; it is not configured here. Allow DNS propagation. Use DNS-only mode initially if your DNS provider offers an HTTP proxy.
4. Copy or clone this repository onto the VPS. In its directory, copy `.env.example` to `.env`; set your actual domains. Generate a random session key privately with `openssl rand -hex 48`, put it in `SESSION_SECRET` in `.env`, and run `chmod 600 .env`. Do not commit or share it. Docker Compose reads `.env`; local `npm start` does not load that file automatically. Development mode generates a session secret on startup unless SESSION_SECRET is injected, so development logins expire on restart; content persists.
5. **Launch only after your approval:** run `docker compose up -d --build`. Caddy obtains/renews HTTPS certificates once both domains resolve and ports 80/443 are reachable. Check `docker compose ps` and `docker compose logs --tail=80`. The app deliberately refuses production startup without both origins and a session secret.
6. **You, privately:** run `docker compose exec app npm run admin:password`, and optionally `docker compose exec app npm run admin:mfa`. Visit `https://dashboard.YOUR-DOMAIN/admin`, sign in, replace placeholders, preview, and publish content when ready. The dashboard domain root also redirects to `/admin`. Main-domain administrative API requests are refused; cookies are host-only so dashboard sessions are not shared with the public domain.
7. Before announcing the site, check both domains over HTTPS on your phone and computer. From a private/incognito window check that `/api/admin/content`, `/preview` and unpublished media require login; confirm a test draft remains hidden, publish it, and confirm it appears publicly. Log out and confirm editing fails. Check all contact, résumé, credential and project links. Remove test content afterward.

The DNS setup, domain purchase, hosting account, secure password entry and launch approval require your action. I can help adapt the configuration once you choose the actual domain and host. No publication or fresh-host deployment has been performed in this workspace.

## Persistence, updates and backups

`data/` (or `DATA_DIR`) contains `portfolio.sqlite`, `sessions.sqlite` and `uploads/`. Docker maps it to the named `portfolio_data` volume, which survives rebuilds, restarts and `docker compose down`. **Never run `docker compose down -v` unless deliberately deleting all data.** Never put this directory on a public static host or commit it. Credential hashes and MFA setup secrets are in the private database; use encrypted backups and provider disk encryption.

For updates, back up first, fetch/review code, and run `docker compose up -d --build`. Keep the same volume and session secret. The app is single-instance; do not horizontally scale SQLite with this configuration. Back up content and uploads together using a stopped-app volume snapshot or SQLite’s supported online-backup API plus a consistent upload copy. Restore into a separate environment and verify it periodically. Restrict access to backups; do not serve them over HTTP. Retain the session key securely or rotate it and require a fresh login. Restore tests and automated backup scheduling are your hosting operator’s responsibility.

## Security notes

Passwords use bcrypt cost 12. Sessions use random IDs in HttpOnly, SameSite=Strict cookies, Secure in production, expire after four hours of inactivity, and persist in SQLite. Password rotation and MFA changes revoke them. State-changing requests require a session CSRF token and exact admin Origin; all editing/media management additionally requires server-side authentication. Login has an IP-based limit of eight attempts per 15 minutes. The app runs behind exactly one trusted proxy (the included Caddy); do not expose its internal port, or deploy behind a different proxy chain without adjusting trust. The rate limiter is per-process and resets on restart; use a host/WAF limit as additional defense for an exposed deployment.

Keep Node and dependencies patched, use host/provider MFA, and allow only trusted operators shell access. Use trusted uploads and keep sharing rights in mind. This is a custom single-owner authentication system with optional TOTP, not a claim of a third-party security audit. Email password recovery, public registration and multi-user administration are intentionally absent. Emergency recovery requires private shell access.
