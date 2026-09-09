import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

// The Vortex dashboard is a client-side app (Supabase auth, browser-only
// state), so it mounts after hydration only.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - plain JSX module without type declarations
const VortexApp = lazy(() => import("../vortex/VortexApp.jsx"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Vortex — Control Panel" },
      {
        name: "description",
        content:
          "Vortex control panel: manage Meta business tools, ad accounts, payments and team permissions from one dashboard.",
      },
      { property: "og:title", content: "Vortex — Control Panel" },
      {
        property: "og:description",
        content:
          "Vortex control panel: manage Meta business tools, ad accounts, payments and team permissions from one dashboard.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "icon", href: "/logo_vortex.png", type: "image/png" }],
  }),
  component: Index,
});

function Index() {
  return (
    <ClientOnly
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#0a0c10]">
          <img src="/logo_vortex.png" alt="Vortex" className="h-16 w-16 animate-pulse" />
        </div>
      }
    >
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center bg-[#0a0c10]">
            <img src="/logo_vortex.png" alt="Vortex" className="h-16 w-16 animate-pulse" />
          </div>
        }
      >
        <VortexApp />
      </Suspense>
    </ClientOnly>
  );
}
