import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { SEO, buildBreadcrumbList, buildFAQPage } from "@/components/SEO";
import { RichText } from "@/components/RichText";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, BookOpen } from "lucide-react";

interface Blog {
  id: number;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  imageUrl: string;
  authorName: string;
  tags: string[];
  createdAt: string;
}

export function BlogDetail() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug ?? "";

  const { data: blog, isLoading, isError } = useQuery<Blog>({
    queryKey: ["blog", slug],
    queryFn: () => apiGet<Blog>(`/api/blogs/${slug}`),
    enabled: !!slug,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-40">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !blog) {
    return (
      <div className="container mx-auto px-4 py-20 text-center max-w-lg">
        <BookOpen className="h-16 w-16 mx-auto mb-6 text-muted-foreground opacity-30" />
        <h1 className="font-serif text-3xl mb-3">Article not found</h1>
        <p className="text-muted-foreground mb-8">This article doesn't exist or has been removed.</p>
        <Link href="/blogs">
          <Button variant="outline" className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to blog
          </Button>
        </Link>
      </div>
    );
  }

  const blogJsonLd: Record<string, unknown>[] = [
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: blog.title,
      description: blog.excerpt,
      image: blog.imageUrl ? [blog.imageUrl] : undefined,
      datePublished: blog.createdAt,
      dateModified: blog.createdAt,
      author: { "@type": "Person", name: blog.authorName || "Royvento" },
      publisher: {
        "@type": "Organization",
        name: "Royvento",
        logo: { "@type": "ImageObject", url: "https://royvento.com/images/logo.png" },
      },
      mainEntityOfPage: { "@type": "WebPage", "@id": `https://royvento.com/blogs/${blog.slug}` },
    },
    buildBreadcrumbList([
      { name: "Home", url: "/" },
      { name: "Blog", url: "/blogs" },
      { name: blog.title, url: `/blogs/${blog.slug}` },
    ]),
    buildFAQPage([
      {
        question: `What is "${blog.title}" about?`,
        answer:
          blog.excerpt ||
          `Read the full guide on Royvento for nightlife tips, venue picks and booking advice.`,
      },
      {
        question: "How do I book a pub or event on Royvento?",
        answer:
          "Browse pubs and events on Royvento, pick a date and tier (women / men / couple), and confirm your booking instantly. You'll get a QR ticket for entry.",
      },
      {
        question: "Are Royvento partner venues verified?",
        answer:
          "Yes — every partner venue is reviewed and approved by the Royvento team before going live, so you book with confidence.",
      },
    ]),
  ];

  return (
    <div className="container mx-auto px-4 md:px-6 py-12 max-w-3xl">
      <SEO
        title={`${blog.title} | Royvento Blog`}
        description={blog.excerpt}
        canonical={`/blogs/${blog.slug}`}
        ogImage={blog.imageUrl}
        ogType="article"
        jsonLd={blogJsonLd}
      />
      <Link href="/blogs" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8">
        <ArrowLeft className="h-4 w-4" /> Back to blog
      </Link>

      {blog.imageUrl && (
        <div className="rounded-2xl overflow-hidden aspect-[16/7] mb-10">
          <img src={blog.imageUrl} alt={blog.title} className="w-full h-full object-cover" />
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        {blog.tags.map((tag) => (
          <Badge key={tag} variant="secondary">{tag}</Badge>
        ))}
      </div>

      <h1 className="font-serif text-4xl md:text-5xl leading-tight mb-4">{blog.title}</h1>
      <p className="text-muted-foreground text-lg leading-relaxed mb-6 border-l-2 border-primary pl-4">
        {blog.excerpt}
      </p>

      <div className="flex items-center gap-3 mb-10 pb-8 border-b border-border">
        <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold text-sm">
          {blog.authorName.charAt(0)}
        </div>
        <div>
          <p className="text-sm font-medium">{blog.authorName}</p>
          <p className="text-xs text-muted-foreground">
            {new Date(blog.createdAt).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
      </div>

      <RichText
        className="prose prose-invert max-w-none prose-headings:font-serif prose-headings:tracking-tight prose-p:text-muted-foreground prose-p:leading-relaxed prose-h2:text-2xl prose-h2:mt-8 prose-h2:mb-3"
        html={blog.content}
      />

      <div className="mt-12 pt-8 border-t border-border text-center">
        <p className="text-muted-foreground mb-4">Ready to explore India's best pubs?</p>
        <Link href="/pubs">
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
            Browse pubs on Royvento
          </Button>
        </Link>
      </div>
    </div>
  );
}
