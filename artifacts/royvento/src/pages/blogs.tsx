import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { SEO } from "@/components/SEO";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Search, BookOpen, ArrowRight } from "lucide-react";

interface Blog {
  id: number;
  title: string;
  slug: string;
  excerpt: string;
  imageUrl: string;
  authorName: string;
  tags: string[];
  createdAt: string;
}

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

// Featured hero: a compact, magazine-style banner — cover image with a bottom
// gradient and the headline / meta laid over it. Controlled height so it never
// balloons regardless of the source image's shape.
function FeaturedBlogCard({ blog }: { blog: Blog }) {
  return (
    <Link href={`/blogs/${blog.slug}`}>
      <article className="group relative cursor-pointer overflow-hidden rounded-2xl border border-border/60 hover:border-primary/30 transition-colors duration-300 h-[240px] sm:h-[280px] md:h-[300px]">
        {blog.imageUrl ? (
          <img
            src={blog.imageUrl}
            alt={blog.title}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-zinc-900 to-black" />
        )}
        {/* Readability scrims — heavier at the bottom-left where the text sits. */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/5" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/10 to-transparent" />

        <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6 md:p-8">
          <div className="max-w-2xl space-y-2.5">
            {blog.tags.length > 0 && (
              <Badge className="bg-primary/90 text-primary-foreground border-0 text-[10px] uppercase tracking-wide">
                {blog.tags[0]}
              </Badge>
            )}
            <h2 className="font-serif text-xl sm:text-2xl md:text-3xl tracking-tight leading-tight text-white line-clamp-2">
              {blog.title}
            </h2>
            {blog.excerpt && (
              <p className="hidden sm:block text-sm text-white/60 leading-relaxed line-clamp-2 max-w-xl">
                {blog.excerpt}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/50 pt-0.5">
              <span className="font-medium text-primary/80">{blog.authorName}</span>
              <span>·</span>
              <span>{fmtDate(blog.createdAt)}</span>
              <span className="flex items-center gap-1 font-medium text-primary ml-auto sm:ml-1 group-hover:gap-2 transition-all">
                Read article <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </div>
          </div>
        </div>
      </article>
    </Link>
  );
}

// Standard list card: compact vertical layout used in the grid.
function BlogCard({ blog }: { blog: Blog }) {
  return (
    <Link href={`/blogs/${blog.slug}`}>
      <article className="group cursor-pointer overflow-hidden rounded-2xl border border-border/60 bg-card/30 hover:border-primary/30 transition-all duration-300 h-full flex flex-col">
        {blog.imageUrl && (
          <div className="relative overflow-hidden shrink-0 aspect-[16/9]">
            <img
              src={blog.imageUrl}
              alt={blog.title}
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
            {blog.tags.length > 0 && (
              <div className="absolute top-3 left-3">
                <Badge className="bg-primary/90 text-primary-foreground border-0 text-[10px] uppercase tracking-wide">
                  {blog.tags[0]}
                </Badge>
              </div>
            )}
          </div>
        )}
        <div className="flex flex-col gap-2 p-4 flex-1">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="font-medium text-primary/80">{blog.authorName}</span>
            <span>·</span>
            <span>{fmtDate(blog.createdAt)}</span>
          </div>
          <h2 className="font-serif text-base tracking-tight leading-tight group-hover:text-primary transition-colors line-clamp-2">
            {blog.title}
          </h2>
          {blog.excerpt && (
            <p className="text-[13px] text-muted-foreground leading-relaxed line-clamp-2">
              {blog.excerpt}
            </p>
          )}
          <div className="flex items-center gap-1 text-xs font-medium text-primary mt-auto pt-1 group-hover:gap-2 transition-all">
            Read article <ArrowRight className="h-3.5 w-3.5" />
          </div>
        </div>
      </article>
    </Link>
  );
}

export function Blogs() {
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const { data: blogs = [], isLoading } = useQuery<Blog[]>({
    queryKey: ["blogs"],
    queryFn: () => apiGet<Blog[]>("/api/blogs"),
  });

  const allTags = Array.from(new Set(blogs.flatMap((b) => b.tags)));

  const filtered = blogs.filter((b) => {
    const matchSearch =
      !search ||
      b.title.toLowerCase().includes(search.toLowerCase()) ||
      b.excerpt.toLowerCase().includes(search.toLowerCase());
    const matchTag = !activeTag || b.tags.includes(activeTag);
    return matchSearch && matchTag;
  });

  const [featuredBlog, ...restBlogs] = filtered;

  return (
    <div>
      <SEO
        title="Royvento Blog — Nightlife Stories & City Guides"
        description="City guides, pub crawls, occasion planning and behind-the-scenes stories from India's nightlife — fresh stories from the Royvento editorial team."
        canonical="/blogs"
      />

      {/* ── Premium full-width hero ── */}
      <section className="relative overflow-hidden bg-black h-[300px] sm:h-[330px] md:h-[360px]">
        {/* Atmospheric bar/nightlife image */}
        <img
          src="https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=1600&q=85"
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-center"
          style={{ transform: "scale(1.05)", transformOrigin: "center 40%" }}
          fetchPriority="high"
          decoding="async"
        />
        {/* Light dark base — keeps the image clearly visible */}
        <div className="absolute inset-0 bg-black/25" />
        {/* Depth gradients — stronger at the bottom where the text sits */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/15 to-transparent" />
        {/* Subtle brand-color accent — bottom-left glow */}
        <div className="absolute bottom-0 left-0 w-[480px] h-[240px] bg-primary/18 blur-[90px] pointer-events-none" />
        {/* Tight top vignette */}
        <div className="absolute top-0 inset-x-0 h-24 bg-gradient-to-b from-black/40 to-transparent" />
        {/* Premium horizontal rule accent */}
        <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-primary/50 via-primary/20 to-transparent" />

        {/* Content — anchored bottom-left */}
        <div className="absolute inset-0 flex flex-col justify-end">
          <div className="container mx-auto px-4 md:px-6 pb-8 sm:pb-10 md:pb-14 lg:pb-16">
            <div className="max-w-2xl">
              {/* Eyebrow with decorative line */}
              <div className="flex items-center gap-3 mb-3 md:mb-4">
                <span className="h-px w-6 md:w-10 bg-primary/70 shrink-0" />
                <p className="text-[10px] md:text-xs uppercase tracking-[0.26em] text-primary font-semibold flex items-center gap-1.5">
                  <BookOpen className="h-3 w-3 md:h-3.5 md:w-3.5" /> Royvento Blog
                </p>
              </div>
              {/* Title */}
              <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl lg:text-6xl tracking-tight text-white leading-[1.06]">
                Nightlife
                <br />
                <span className="italic text-gradient-red">Stories &amp; Guides</span>
              </h1>
              {/* Subtitle */}
              <p className="mt-3 md:mt-4 text-white/55 leading-relaxed max-w-xs sm:max-w-sm md:max-w-md text-sm md:text-base">
                Discover the best pubs, craft beers, and nightlife experiences across India — curated by our editorial team.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Page content ── */}
      <div className="container mx-auto px-4 md:px-6 py-10">

      {/* Search + tag filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6 max-w-2xl">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search articles…"
            className="pl-9 rounded-full"
          />
        </div>
      </div>

      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-10">
          <button
            onClick={() => setActiveTag(null)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              activeTag === null
                ? "bg-primary border-primary text-primary-foreground"
                : "bg-card/40 border-border text-muted-foreground hover:border-primary/40"
            }`}
          >
            All
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setActiveTag(tag === activeTag ? null : tag)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                activeTag === tag
                  ? "bg-primary border-primary text-primary-foreground"
                  : "bg-card/40 border-border text-muted-foreground hover:border-primary/40"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground glass-card rounded-3xl p-16">
          <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="font-serif text-2xl mb-2">No articles found</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Featured article — compact magazine-style hero banner */}
          {featuredBlog && (
            <FeaturedBlogCard blog={featuredBlog} />
          )}

          {/* Grid of remaining articles */}
          {restBlogs.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {restBlogs.map((blog) => (
                <BlogCard key={blog.id} blog={blog} />
              ))}
            </div>
          )}
        </div>
      )}

      </div>{/* end container */}
    </div>
  );
}
