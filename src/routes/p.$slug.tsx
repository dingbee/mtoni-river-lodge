import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { renderBlock } from "@/domains/content/pages/renderBlock";
import { getPublicCmsPage } from "@/domains/content/pages/pages-public.functions";
import { buildBreadcrumbJsonLd } from "@/lib/seo-schema";

export const Route = createFileRoute("/p/$slug")({
  loader: async ({ params }) => {
    const data = await getPublicCmsPage({ data: { slug: params.slug } });
    if (!data) throw notFound();
    const seo = (data.seo ?? {}) as {
      title?: string | null;
      description?: string | null;
      og_title?: string | null;
      og_description?: string | null;
      og_image?: string | null;
      canonical_url?: string | null;
      robots?: string | null;
      schema_type?: string | null;
      twitter_card?: string | null;
    };
    return {
      title: seo.title ?? data.page.title,
      description: seo.description ?? data.page.description ?? "",
      ogTitle: seo.og_title ?? seo.title ?? data.page.title,
      ogDescription: seo.og_description ?? seo.description ?? data.page.description ?? "",
      ogImage: seo.og_image ?? "",
      canonical: seo.canonical_url ?? `https://mtoniriverlodge.com/p/${params.slug}`,
      robots: seo.robots ?? "index,follow",
      schemaType: seo.schema_type ?? null,
      twitterCard: seo.twitter_card ?? "summary_large_image",
    };
  },
  head: ({ loaderData, params }) => {
    if (!loaderData) return { meta: [{ title: "Page — Mtoni River Lodge" }, { name: "robots", content: "noindex" }] };
    const meta: Array<Record<string, string>> = [
      { title: `${loaderData.title} — Mtoni River Lodge` },
      { name: "description", content: loaderData.description },
      { name: "robots", content: loaderData.robots },
      { property: "og:title", content: loaderData.ogTitle },
      { property: "og:description", content: loaderData.ogDescription },
      { property: "og:url", content: loaderData.canonical },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: loaderData.twitterCard },
    ];
    if (loaderData.ogImage) meta.push({ property: "og:image", content: loaderData.ogImage });
    return {
      meta,
      links: [{ rel: "canonical", href: loaderData.canonical }],
      scripts: [
        buildBreadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: loaderData.title, path: `/p/${params.slug}` },
        ]),
      ],
    };
  },
  errorComponent: ({ reset }) => (
    <div className="min-h-screen bg-ivory p-12 text-center text-charcoal">
      <h1 className="font-display text-2xl">This page couldn't load.</h1>
      <button className="mt-4 underline" onClick={() => reset()}>Try again</button>
    </div>
  ),
  notFoundComponent: () => (
    <div className="min-h-screen bg-ivory p-12 text-center text-charcoal">
      <h1 className="font-display text-2xl">Page not found.</h1>
      <Link to="/" className="mt-4 inline-block underline">Return home</Link>
    </div>
  ),
  component: PublicCmsPage,
});

function PublicCmsPage() {
  const { slug } = Route.useParams();
  const { data } = useQuery({
    queryKey: ["cms.public", slug],
    queryFn: () => getPublicCmsPage({ data: { slug } }),
  });
  if (!data) return null;
  return (
    <div className="bg-ivory text-charcoal">
      <SiteHeader />
      <main>
        {data.blocks.map((b) => (
          <div key={b.id}>{renderBlock({ id: b.id, kind: b.kind as never, data: b.data })}</div>
        ))}
      </main>
      <SiteFooter />
    </div>
  );
}