import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { Reveal } from "@/components/site/Reveal";
import { buildBreadcrumbJsonLd } from "@/lib/seo-schema";
import { getPublicJournalArticle, getPublicRelatedArticles } from "@/domains/content/journal/journal-public.functions";
import { computeReadMinutes, extractToc, injectHeadingIds } from "@/lib/journal-utils";

const articleOpts = (slug: string) =>
  queryOptions({
    queryKey: ["journal.public", slug],
    queryFn: () => getPublicJournalArticle({ data: { slug } }),
  });

const relatedOpts = (articleId: string) =>
  queryOptions({
    queryKey: ["journal.public.related", articleId],
    queryFn: () => getPublicRelatedArticles({ data: { articleId, limit: 3 } }),
  });

export const Route = createFileRoute("/journal/$slug")({
  loader: async ({ params, context }) => {
    const data = await context.queryClient.ensureQueryData(articleOpts(params.slug));
    if (!data) throw notFound();
    context.queryClient.prefetchQuery(relatedOpts(data.article.id));
    return { title: data.article.seo_title ?? data.article.title, description: data.article.seo_description ?? data.article.excerpt ?? "", ogImage: data.article.seo_og_image ?? data.article.cover_image_url ?? "" };
  },
  head: ({ loaderData, params }) => {
    if (!loaderData) return { meta: [{ title: "Journal — Mtoni River Lodge" }] };
    const canonical = `https://mtoniriverlodge.com/journal/${params.slug}`;
    return {
      meta: [
        { title: `${loaderData.title} — Mtoni River Lodge` },
        { name: "description", content: loaderData.description },
        { property: "og:title", content: loaderData.title },
        { property: "og:description", content: loaderData.description },
        ...(loaderData.ogImage ? [{ property: "og:image", content: loaderData.ogImage }] : []),
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: canonical }],
      scripts: [
        buildBreadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Journal", path: "/journal" },
          { name: loaderData.title, path: `/journal/${params.slug}` },
        ]),
      ],
    };
  },
  errorComponent: ({ reset }) => (
    <div className="min-h-screen bg-ivory p-12 text-center text-charcoal">
      <h1 className="font-display text-2xl">This story couldn't load.</h1>
      <button className="mt-4 underline" onClick={() => reset()}>Try again</button>
    </div>
  ),
  notFoundComponent: () => (
    <div className="min-h-screen bg-ivory p-12 text-center text-charcoal">
      <h1 className="font-display text-2xl">Story not found.</h1>
      <Link to="/journal" className="mt-4 inline-block underline">Back to journal</Link>
    </div>
  ),
  component: PublicJournalArticle,
});

function PublicJournalArticle() {
  const { slug } = Route.useParams();
  const { data } = useSuspenseQuery(articleOpts(slug));
  if (!data) return null;
  const { article, author, category, tags } = data;
  const contentHtml = injectHeadingIds(article.content_html ?? "");
  const toc = extractToc(article.content_html ?? "");
  const readMinutes = article.read_minutes && article.read_minutes > 0
    ? article.read_minutes
    : computeReadMinutes(article.content_html ?? "");
  const publishedLabel = article.published_at
    ? new Date(article.published_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
    : "";

  return (
    <div className="bg-ivory text-charcoal">
      <SiteHeader />
      <article>
        <div className="px-6 pt-32 lg:px-12 lg:pt-40">
          <div className="mx-auto max-w-3xl">
            <Breadcrumbs variant="dark" />
          </div>
        </div>
        <header className="px-6 pt-6 pb-12 lg:px-12">
          <div className="mx-auto max-w-3xl">
            <Reveal>
              <p className="eyebrow">{category?.name ?? "Journal"}</p>
            </Reveal>
            <Reveal delay={100}>
              <h1 className="mt-6 font-display text-[2.5rem] leading-[1.05] sm:text-5xl lg:text-[3.75rem]">
                {article.title}
              </h1>
            </Reveal>
            {article.excerpt ? (
              <Reveal delay={200}>
                <p className="mt-6 text-lg leading-relaxed text-charcoal/75">{article.excerpt}</p>
              </Reveal>
            ) : null}
            <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-charcoal/60">
              {author ? <span>{author.name}</span> : null}
              {publishedLabel ? <span>· {publishedLabel}</span> : null}
              <span>· {readMinutes} min read</span>
            </div>
          </div>
        </header>

        {article.cover_image_url ? (
          <div className="px-6 lg:px-12">
            <div className="mx-auto max-w-5xl">
              <img src={article.cover_image_url} alt={article.title} className="aspect-[16/9] w-full object-cover" loading="lazy" />
            </div>
          </div>
        ) : null}

        <div className="px-6 py-16 lg:px-12 lg:py-24">
          <div className="mx-auto grid max-w-5xl gap-12 lg:grid-cols-[220px_minmax(0,1fr)]">
            {toc.length > 1 ? (
              <aside className="hidden self-start lg:sticky lg:top-32 lg:block">
                <p className="eyebrow">On this page</p>
                <ul className="mt-4 space-y-2 text-sm">
                  {toc.map((t) => (
                    <li key={t.id} className={t.level === 3 ? "pl-3 text-charcoal/60" : "text-charcoal/80"}>
                      <a href={`#${t.id}`} className="hover:underline">{t.text}</a>
                    </li>
                  ))}
                </ul>
              </aside>
            ) : <div className="hidden lg:block" />}
            <div
              className="prose prose-neutral max-w-none prose-headings:font-display"
              dangerouslySetInnerHTML={{ __html: contentHtml }}
            />
          </div>
        </div>

        {tags.length ? (
          <div className="px-6 pb-12 lg:px-12">
            <div className="mx-auto max-w-3xl">
              <p className="eyebrow mb-3">Tags</p>
              <div className="flex flex-wrap gap-2">
                {tags.map((t) => (
                  <span key={t.slug} className="rounded-full border border-charcoal/20 px-3 py-1 text-xs uppercase tracking-wider text-charcoal/70">
                    {t.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        <RelatedSection articleId={article.id} />
      </article>
      <SiteFooter />
    </div>
  );
}

function RelatedSection({ articleId }: { articleId: string }) {
  const { data } = useSuspenseQuery(relatedOpts(articleId));
  if (!data || data.length === 0) return null;
  return (
    <section className="border-t border-charcoal/10 px-6 py-20 lg:px-12">
      <div className="mx-auto max-w-5xl">
        <p className="eyebrow">Keep reading</p>
        <div className="mt-8 grid gap-8 md:grid-cols-3">
          {data.map((p) => (
            <Link key={p.id} to="/journal/$slug" params={{ slug: p.slug }} className="group block">
              {p.cover_image_url ? (
                <div className="aspect-[4/3] overflow-hidden">
                  <img src={p.cover_image_url} alt={p.title} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy" />
                </div>
              ) : null}
              <h3 className="mt-4 font-display text-xl">{p.title}</h3>
              {p.excerpt ? <p className="mt-2 text-sm text-charcoal/70 line-clamp-3">{p.excerpt}</p> : null}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}