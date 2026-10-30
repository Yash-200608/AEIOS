# frontend/web — AEIOS Sentinel dashboard (v0)

React 18 + TypeScript + Vite site, deployed on Vercel (project `aeios`). Sign-in is required: Supabase Auth
(email/password; Google when enabled) and row-level security that lets only emails in `allowed_users` read data.

Sections: overview, dispersion diagnostics, 3D atmosphere, forecast, air quality, NASA satellite layers,
smoke-origin tracer, scenario lab, AEIOS gateway/model panel, station network.

Data sources, each labelled in the UI: Open-Meteo weather (model), CAMS air quality (model), NASA GIBS/FIRMS
(satellite), AEIOS gateway data from Supabase (measured / AEIOS model), scenarios (simulation).

```
npm install
npm run dev          # http://localhost:5173 ; add ?preview (dev only) to skip sign-in for layout checks
npm run build        # type-check + production bundle in dist/
```

`?preview` and `?mockalerts` exist only in the dev server and are removed from production builds.
Supabase URL and publishable key are in `src/lib/supabase.ts` (public by design); override with
`VITE_SUPABASE_URL` / `VITE_SUPABASE_KEY`. `tools/retheme.py` is the one-off colour remap used for the
Jet Black / Royal Amethyst / Electric Cyan theme.

Deploy: see `deployment/web/README.md`.
