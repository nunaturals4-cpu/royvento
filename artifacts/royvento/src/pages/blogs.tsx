import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
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

function BlogCard({ blog, featured }: { blog: Blog; featured?: boolean }) {
  return (
    <Link href={`/blogs/${blog.slug}`}>
      <article
        className={`group cursor-pointer overflow-hidden rounded-2xl border border-border/60 bg-card/30 hover:border-primary/30 transition-all duration-300 h-full flex flex-col ${
          featured ? "md:flex-row" : ""
        }`}
      >
        {blog.imageUrl && (
          <div
            className={`relative overflow-hidden shrink-0 ${
              featured ? "md:w-[55%] aspect-[16/9] md:aspect-auto" : "aspect-[16/9]"
            }`}
          >
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
        <div className={`flex flex-col gap-3 p-5 ${featured ? "md:p-8 justify-center" : ""} flex-1`}>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="font-medium text-primary/80">{blog.authorName}</span>
            <span>·</span>
            <span>{new Date(blog.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
          </div>
          <h2
            className={`font-serif tracking-tight leading-tight group-hover:text-primary transition-colors line-clamp-2 ${
              featured ? "text-2xl md:text-3xl" : "text-xl"
            }`}
          >
            {blog.title}
          </h2>
          {blog.excerpt && (
            <p className={`text-muted-foreground leading-relaxed ${featured ? "line-clamp-3 text-base" : "line-clamp-2 text-sm"}`}>
              {blog.excerpt}
            </p>
          )}
          <div className="flex items-center gap-1 text-sm font-medium text-primary mt-auto pt-2 group-hover:gap-2 transition-all">
            Read article <ArrowRight className="h-4 w-4" />
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
    <div className="container mx-auto px-4 md:px-6 py-14">
      {/* Page header */}
      <header className="max-w-2xl mb-12">
        <p className="text-xs uppercase tracking-[0.22em] text-primary mb-3 flex items-center gap-2">
          <BookOpen className="h-3.5 w-3.5" /> Royvento Blog
        </p>
        <h1 className="font-serif text-5xl md:text-7xl tracking-tight leading-none mb-4">
          Nightlife<br />
          <span className="italic text-gradient-red">Stories & Guides</span>
        </h1>
        <p className="text-muted-foreground text-base max-w-xl leading-relaxed">
          Discover the best pubs, craft beers, and nightlife experiences across India — curated by the Royvento editorial team.
        </p>
      </header>

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
          {/* Featured article — full width, larger */}
          {featuredBlog && (
            <BlogCard blog={featuredBlog} featured />
          )}

          {/* Grid of remaining articles */}
          {restBlogs.length > 0 && (
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {restBlogs.map((blog) => (
                <BlogCard key={blog.id} blog={blog} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
