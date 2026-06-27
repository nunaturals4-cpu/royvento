import { cn } from "@/lib/utils";

/**
 * Square (1:1) image frame used for deal / offer / discount images.
 *
 * The image fills the frame edge-to-edge with `object-cover` and stays centered,
 * so it always displays properly and full — whether the source is a square
 * (1:1) photo or a wide "cover" photo — with no letterbox bars. Overlays
 * (badges, gradients, hover actions) render on top via `children`.
 */
export function SquareImage({
  src,
  alt = "",
  className,
  imgClassName,
  children,
}: {
  src: string;
  alt?: string;
  /** Classes for the 1:1 wrapper (e.g. rounded corners, max-width). */
  className?: string;
  /** Extra classes for the image, e.g. hover transforms. */
  imgClassName?: string;
  /** Overlays rendered above the image (badges, gradients, etc.). */
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("relative aspect-square overflow-hidden bg-zinc-900", className)}>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className={cn("h-full w-full object-cover object-center", imgClassName)}
      />
      {children}
    </div>
  );
}
