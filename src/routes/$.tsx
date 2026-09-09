import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

// Vortex handles its own internal navigation with history.pushState
// (/login, /signup, /admin, ...). This catch-all route renders the Vortex
// app for every such path so the router never shows a 404 for them.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - plain JSX module without type declarations
const VortexApp = lazy(() => import("../vortex/VortexApp.jsx"));

export const Route = createFileRoute("/$")({
  component: VortexCatchAll,
});

function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0c10]">
      <img src="/logo_vortex.png" alt="Vortex" className="h-16 w-16 animate-pulse" />
    </div>
  );
}

function VortexCatchAll() {
  return (
    <ClientOnly fallback={<Loading />}>
      <Suspense fallback={<Loading />}>
        <VortexApp />
      </Suspense>
    </ClientOnly>
  );
}
