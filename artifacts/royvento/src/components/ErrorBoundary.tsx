import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  /** When this value changes (e.g. the route), a tripped boundary resets so a
   *  broken page never permanently breaks navigation. */
  resetKey?: string;
}

interface State {
  hasError: boolean;
}

const RELOAD_GUARD_KEY = "royvento_chunk_reloaded";

function isChunkLoadError(err: unknown): boolean {
  const e = err as { name?: string; message?: string } | null;
  const msg = e?.message ?? "";
  const name = e?.name ?? "";
  return (
    name === "ChunkLoadError" ||
    /Loading chunk [\w-]+ failed/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg)
  );
}

/**
 * App-wide error boundary. Two jobs:
 *   - A stale-chunk error after a deploy triggers a single reload (matches the
 *     "page goes blank, reload fixes it" symptom) instead of a dead screen.
 *   - Any other render error shows a friendly fallback with a Reload button
 *     rather than a blank white page.
 * Resets automatically on navigation via the `resetKey` prop.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    if (
      typeof window !== "undefined" &&
      isChunkLoadError(error) &&
      !sessionStorage.getItem(RELOAD_GUARD_KEY)
    ) {
      sessionStorage.setItem(RELOAD_GUARD_KEY, "1");
      window.location.reload();
    }
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
          <h2 className="font-serif text-2xl">Something went wrong</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            We hit an unexpected error loading this page. Reloading usually fixes it.
          </p>
          <Button
            onClick={() => {
              if (typeof window !== "undefined") {
                sessionStorage.removeItem(RELOAD_GUARD_KEY);
                window.location.reload();
              }
            }}
          >
            Reload page
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
