import React, { Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import './design/tokens.css';
import App from './App';
import AuthGate from './components/AuthGate';

// Local development only (`npm run dev`, then open /?preview): render the dashboard without signing in to check layout.
// Vite replaces import.meta.env.DEV with false in production builds, so this branch is removed from the deployed site.
// Database reads still go through row level security and come back empty.
const preview = import.meta.env.DEV && new URLSearchParams(window.location.search).has('preview');

// Local development only (`npm run dev`, then open /?designlab): the Design System Lab. Same DEV guard as above, so the
// lazy import and everything it pulls in is dropped from production builds. It never reads Supabase or dashboard state.
const designLab = import.meta.env.DEV && new URLSearchParams(window.location.search).has('designlab');
const DesignLab = import.meta.env.DEV ? React.lazy(() => import('./design/DesignLab')) : null;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {designLab && DesignLab
      ? <Suspense fallback={null}><DesignLab /></Suspense>
      : preview
      ? <App userEmail="preview" />
      : <AuthGate>{({ email, signOut }) => <App userEmail={email} onSignOut={signOut} />}</AuthGate>}
  </React.StrictMode>,
);
