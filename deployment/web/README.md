# Deploying the web dashboard

The site is a Vercel project named `aeios` (static Vite build, no server).

```
cd frontend/web
npm install
npm run build                     # type-check and bundle into dist/
npx vercel login                  # once, in your browser
npx vercel link --yes --project aeios
npx vercel deploy --prod --yes
```

After the first deploy:

1. Supabase -> Authentication -> URL Configuration: set Site URL (and Redirect URLs) to the production address.
2. Optional Google sign-in: create a Google OAuth client (redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`),
   enable the Google provider in Supabase with its client id and secret.
3. Vercel Deployment Protection is on by default and adds its own login in front of the site; turn it off in the
   project settings if the Supabase login should be the only gate.

`frontend/web/.vercel/` (project link) and `dist/` are gitignored.
