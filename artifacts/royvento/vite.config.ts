import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const rawPort = process.env.PORT;
// PORT is only required for dev/preview server, not for production builds
const port = rawPort ? Number(rawPort) : 3000;

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// BASE_PATH defaults to "/" for Railway / production deployments
const basePath = process.env.BASE_PATH ?? "/";

const hmrKeepAlive = (): import("vite").Plugin => ({
  name: "hmr-ws-keepalive",
  configureServer(server) {
    const PING_INTERVAL_MS = 20_000;
    const interval = setInterval(() => {
      (server.ws as any).wss?.clients?.forEach((client: any) => {
        if (client.readyState === 1) client.ping();
      });
    }, PING_INTERVAL_MS);
    server.httpServer?.on("close", () => clearInterval(interval));
  },
});

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    hmrKeepAlive(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    // Quiet the size warning now that heavy libs live in their own chunks.
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // Split rarely-changing third-party libraries into stable, separately
        // cacheable chunks. On repeat visits / new deploys the browser only
        // re-downloads the small app chunk, not React/charts/icons.
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return undefined;
          // Match on the package name at the start of the post-node_modules
          // path so we don't accidentally sweep unrelated "react-*" packages
          // (e.g. react-day-picker) into the React core chunk.
          const pkg = id.split("node_modules/").pop() ?? "";
          if (/^(react|react-dom|scheduler|react-is)\//.test(pkg)) return "react-vendor";
          if (pkg.startsWith("@tanstack/")) return "query-vendor";
          if (/^(recharts|d3-|victory-vendor|internmap)/.test(pkg)) return "charts-vendor";
          if (pkg.startsWith("lucide-react/")) return "icons-vendor";
          if (pkg.startsWith("wouter")) return "router-vendor";
          if (/^framer-motion(\/|$)/.test(pkg)) return "animation-vendor";
          if (pkg.startsWith("@radix-ui/")) return "radix-vendor";
          return undefined;
        },
      },
    },
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    // HMR via wss:443 only when running behind the Replit/Railway proxy.
    // Locally, fall back to default same-origin ws so the browser can connect.
    hmr:
      process.env.REPL_ID !== undefined ||
      process.env.RAILWAY_PUBLIC_DOMAIN !== undefined
        ? { clientPort: 443, protocol: "wss", timeout: 120_000 }
        : { timeout: 120_000 },
    // Proxy API calls to the local api-server so they don't fall through to
    // the SPA fallback (which would return index.html for /api/* and the
    // client would happily parse the HTML body, then crash on `.map`).
    // Override the upstream with VITE_API_PROXY when running on a different port.
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY ?? "http://localhost:5000",
        changeOrigin: true,
        ws: true,
      },
    },
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
