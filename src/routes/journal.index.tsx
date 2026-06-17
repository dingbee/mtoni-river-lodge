import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { Reveal } from "@/components/site/Reveal";
import { BreadcrumbsBar } from "@/components/site/Breadcrumbs";
import river from "@/assets/nduruma-river-flow.jpg";
import { getJournalPosts } from "@/lib/journal";

const posts = getJournalPosts();

export const Route = createFileRoute("/journal/")({
  head: () => ({
    meta: [
      { title: "Journal — Mtoni River Lodge" },
      {
        name: "description",
        content:
          "Stories from the riverbank — slow essays on land, season, and the small ceremonies of life at Mtoni.",
      },
      { property: "og:title", content: "Journal — Mtoni River Lodge" },
      {
        property: "og:description",
        content:
          "Stories from the riverbank — slow essays on land, season, and the small ceremonies of life at Mtoni.",
      },
      { property: "og:image", content: river },
    ],
  }),
  component: JournalPage,
});

function JournalPage() {
  return (
    <div className="bg-ivory text-charcoal">
      <SiteHeader />
      <BreadcrumbsBar />
      <section className="px-6 pb-20 pt-10 lg:px-12 lg:pt-16">
        <div className="mx-auto max-w-[700px]">
          <Reveal>
            <p className="eyebrow">Journal</p>
          </Reveal>
          <Reveal delay={120}>
            <h1 className="mt-6 font-display text-[2.5rem] leading-[1.05] sm:text-5xl lg:text-[4.25rem]">
              Stories from the riverbank.
            </h1>
          </Reveal>
          <Reveal delay={240}>
            <p className="mt-6 max-w-[560px] text-base leading-relaxed text-charcoal/70 lg:text-lg">
              Slow essays on land, season, and the small ceremonies of life at Mtoni.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="px-6 pb-32 lg:px-12 lg:pb-48">
        <div className="mx-auto max-w-[1300px]">
          <Reveal>
            <Link
              to={posts[0].href}
              className="group grid gap-10 border-t border-border pt-12 lg:grid-cols-12"
            >
              <div className="lg:col-span-7">
                <div className="aspect-[16/10] overflow-hidden">
                  <img
                    src={posts[0].img}
                    alt={posts[0].title}
                    className="h-full w-full object-cover transition-transform duration-[1600ms] group-hover:scale-105"
                    loading="lazy"
                  />
                </div>
              </div>
              <div className="self-end lg:col-span-5">
                <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                  {posts[0].date} · {posts[0].read}
                </p>
                <h2 className="mt-4 font-display text-4xl leading-tight lg:text-5xl">
                  {posts[0].title}
                </h2>
                <p className="mt-6 leading-relaxed text-charcoal/70">{posts[0].excerpt}</p>
                <span className="mt-8 inline-block border-b border-charcoal/40 pb-1 text-[0.72rem] uppercase tracking-[0.28em] transition-colors group-hover:border-charcoal">
                  Read Article →
                </span>
              </div>
            </Link>
          </Reveal>

          <div className="mt-32 grid gap-x-10 gap-y-20 md:grid-cols-2">
            {posts.slice(1).map((post, index) => (
              <Reveal
                key={post.title}
                delay={(index % 2) * 120}
                className={index % 2 ? "md:mt-20" : ""}
              >
                <Link to={post.href} className="group block">
                  <div className="aspect-[4/5] overflow-hidden">
                    <img
                      src={post.img}
                      alt={post.title}
                      className="h-full w-full object-cover transition-transform duration-[1500ms] group-hover:scale-105"
                      loading="lazy"
                    />
                  </div>
                  <p className="mt-6 text-xs uppercase tracking-[0.22em] text-muted-foreground">
                    {post.date} · {post.read}
                  </p>
                  <h3 className="mt-3 font-display text-2xl leading-snug">{post.title}</h3>
                  <p className="mt-3 max-w-md text-charcoal/70">{post.excerpt}</p>
                  <span className="mt-6 inline-block border-b border-charcoal/40 pb-1 text-[0.72rem] uppercase tracking-[0.28em] transition-colors group-hover:border-charcoal">
                    Read Article →
                  </span>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
