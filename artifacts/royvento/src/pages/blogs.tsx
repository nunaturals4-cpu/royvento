import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Search, BookOpen } from "lucide-react";

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

  return (
    <div className="container mx-auto px-4 md:px-6 py-14">
      <div className="text-center mb-12">
        <p className="text-xs uppercase tracking-[0.2em] text-primary mb-2">Royvento Blog</p>
        <h1 className="font-serif text-5xl tracking-tight mb-4">Nightlife Stories & Guides</h1>
        <p className="text-muted-foreground text-lg max-w-xl mx-auto">
          Discover the best pubs, craft beers, and nightlife experiences across India — curated by the Royvento editorial team.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-8 max-w-2xl mx-auto">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search articles…"
            className="pl-9"
          />
        </div>
      </div>

      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-10 justify-center">
          <Badge
            variant={activeTag === null ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => setActiveTag(null)}
          >
            All
          </Badge>
          {allTags.map((tag) => (
            <Badge
              key={tag}
              variant={activeTag === tag ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setActiveTag(tag === activeTag ? null : tag)}
            >
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p>No articles found.</p>
        </div>
      ) : (
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((blog, idx) => (
            <Link key={blog.id} href={`/blogs/${blog.slug}`}>
              <article className="group glass-card-strong rounded-2xl overflow-hidden border border-border hover:border-primary/30 transition-all duration-300 hover:-translate-y-1 cursor-pointer h-full flex flex-col">
                {blog.imageUrl && (
                  <div className="relative overflow-hidden aspect-[16/9]">
                    <img
                      src={blog.imageUrl}
                      alt={blog.title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      loading={idx < 6 ? "eager" : "lazy"}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-background/60 to-transparent" />
                  </div>
                )}
                <div className="p-6 flex flex-col flex-1">
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {blog.tags.slice(0, 3).map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-[10px] px-2 py-0.5">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                  <h2 className="font-serif text-xl leading-tight mb-2 group-hover:text-primary transition-colors">
                    {blog.title}
                  </h2>
                  <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3 flex-1">
                    {blog.excerpt}
                  </p>
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                    <span className="text-xs text-muted-foreground">{blog.authorName}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(blog.createdAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                </div>
              </article>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
