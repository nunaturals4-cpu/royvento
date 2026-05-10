import { useEffect } from "react";
import { useLocation } from "wouter";
import { useGetMe } from "@workspace/api-client-react";
import { Spinner } from "@/components/ui/spinner";

interface Props {
  role?: "user" | "vendor" | "admin";
  children: React.ReactNode;
}

export function RequireAuth({ role, children }: Props) {
  const { data, isLoading, isError } = useGetMe({ query: { retry: false } as any });
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isLoading) return;
    if (isError || !data?.user) {
      const here = window.location.pathname + window.location.search;
      const next = here && here !== "/login" ? `?next=${encodeURIComponent(here)}` : "";
      setLocation(`/login${next}`);
      return;
    }
    if (role && data.user.role !== role && data.user.role !== "admin") {
      setLocation("/");
    }
  }, [data, isError, isLoading, role, setLocation]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Spinner />
      </div>
    );
  }
  if (!data?.user) return null;
  if (role && data.user.role !== role && data.user.role !== "admin") return null;
  return <>{children}</>;
}
