import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle } from "lucide-react";

function getQueryParam(search: string, key: string): string | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return params.get(key);
}

export function PaymentResult() {
  const search = typeof window !== "undefined" ? window.location.search : "";
  const status = getQueryParam(search, "status");
  const type = getQueryParam(search, "type");
  const code = getQueryParam(search, "code");

  const isSuccess = status === "success";
  const isBooking = type === "booking";

  return (
    <div className="container mx-auto px-4 md:px-6 py-24 flex items-center justify-center min-h-[60vh]">
      <div className="max-w-md w-full rounded-3xl glass-card-strong p-10 text-center space-y-6">
        {isSuccess ? (
          <>
            <div className="flex justify-center">
              <CheckCircle className="h-16 w-16 text-green-400" />
            </div>
            <h1 className="font-serif text-3xl tracking-tight">Payment successful!</h1>
            <p className="text-white/70">
              {isBooking
                ? "Your booking has been confirmed. You will receive a confirmation email shortly."
                : "Your subscription is now active. Welcome to Royvento Premium!"}
            </p>
            <div className="pt-2 flex flex-col gap-3">
              {isBooking ? (
                <>
                  <Link href="/dashboard/bookings">
                    <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground border-0">
                      View my bookings
                    </Button>
                  </Link>
                  <Link href="/explore">
                    <Button variant="outline" className="w-full">
                      Explore more events
                    </Button>
                  </Link>
                </>
              ) : (
                <Link href="/subscription">
                  <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground border-0">
                    Go to subscription
                  </Button>
                </Link>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="flex justify-center">
              <XCircle className="h-16 w-16 text-destructive" />
            </div>
            <h1 className="font-serif text-3xl tracking-tight">Payment failed</h1>
            <p className="text-white/70">
              {code
                ? `The payment could not be completed (${code}). No amount has been charged.`
                : "The payment could not be completed. No amount has been charged."}
            </p>
            <p className="text-sm text-muted-foreground">
              If your account was debited, it will be automatically refunded within 5-7 business days.
            </p>
            <div className="pt-2 flex flex-col gap-3">
              <Link href="/explore">
                <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground border-0">
                  Try again
                </Button>
              </Link>
              <Link href="/dashboard/bookings">
                <Button variant="outline" className="w-full">
                  View my bookings
                </Button>
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
