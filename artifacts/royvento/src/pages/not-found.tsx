import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { SEO } from "@/components/SEO";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
      {/* Keep this page out of the index — it must never rank or be cited. */}
      <SEO title="Page not found | Royvento" noindex />
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <h1 className="text-2xl font-bold text-gray-900">404 Page Not Found</h1>
          </div>

          <p className="mt-4 text-sm text-gray-600">
            The page you're looking for doesn't exist or may have moved.{" "}
            <Link href="/" className="text-primary underline">Go back home</Link> or
            explore <Link href="/pubs" className="text-primary underline">pubs</Link>,{" "}
            <Link href="/events" className="text-primary underline">events</Link> and{" "}
            <Link href="/blogs" className="text-primary underline">guides</Link>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
