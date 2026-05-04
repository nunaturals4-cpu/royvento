import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiDelete } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Heart, Trash2, Loader2, MapPin } from "lucide-react";

interface WishlistEvent {
  id: number;
  title: string;
  category: string;
  city: string;
  country: string;
  price: number | null;
  imageUrl: string;
  wishlistId: number;
}

export function Wishlist() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: items = [], isLoading } = useQuery<WishlistEvent[]>({
    queryKey: ["wishlist"],
    queryFn: () => apiGet<WishlistEvent[]>("/api/wishlist"),
  });

  const remove = useMutation({
    mutationFn: (eventId: number) => apiDelete(`/api/wishlist/${eventId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wishlist"] });
      toast({ title: "Removed from wishlist" });
    },
    onError: () => toast({ title: "Failed to remove from wishlist", variant: "destructive" }),
  });

  return (
    <div className="container mx-auto px-4 md:px-6 py-14">
      <div className="flex items-center gap-3 mb-2">
        <Heart className="h-7 w-7 text-primary fill-primary" />
        <h1 className="font-serif text-4xl tracking-tight">My Wishlist</h1>
      </div>
      <p className="text-muted-foreground mt-2 mb-10">Pubs and events you've saved for later.</p>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-20">
          <Heart className="h-16 w-16 mx-auto mb-6 text-muted-foreground opacity-20" />
          <h2 className="font-serif text-2xl mb-2">Nothing saved yet</h2>
          <p className="text-muted-foreground mb-8">
            Tap the heart icon on any pub or event to save it here.
          </p>
          <Link href="/pubs">
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
              Browse pubs
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <div key={item.id} className="group glass-card-strong rounded-2xl overflow-hidden border border-border hover:border-primary/30 transition-all flex flex-col">
              <Link href={`/events/${item.id}`} className="block">
                <div className="relative aspect-[4/3] overflow-hidden">
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.title}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full bg-muted flex items-center justify-center">
                      <Heart className="h-8 w-8 text-muted-foreground opacity-20" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-background/60 to-transparent" />
                </div>
              </Link>
              <div className="p-4 flex flex-col flex-1">
                <Badge variant="secondary" className="mb-2 w-fit text-xs">{item.category}</Badge>
                <Link href={`/events/${item.id}`}>
                  <h3 className="font-semibold leading-snug hover:text-primary transition-colors cursor-pointer line-clamp-2">
                    {item.title}
                  </h3>
                </Link>
                {item.city && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1.5">
                    <MapPin className="h-3 w-3" /> {item.city}
                  </p>
                )}
                {item.price != null && (
                  <p className="text-sm font-semibold text-primary mt-1">
                    ₹{Number(item.price).toLocaleString("en-IN")}
                  </p>
                )}
                <div className="mt-auto pt-3 flex gap-2">
                  <Link href={`/events/${item.id}`} className="flex-1">
                    <Button variant="outline" size="sm" className="w-full text-xs">View listing</Button>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:bg-destructive/10 shrink-0"
                    onClick={() => remove.mutate(item.id)}
                    disabled={remove.isPending}
                    aria-label="Remove from wishlist"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
