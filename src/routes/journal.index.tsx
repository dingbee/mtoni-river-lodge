import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { Reveal } from "@/components/site/Reveal";
import river from "@/assets/hero-river.jpg";
import coffee from "@/assets/coffee.jpg";
import guide from "@/assets/guide.jpg";
import villa from "@/assets/villa-exterior.jpg";
import spa from "@/assets/spa.jpg";

const posts = [
  {
    date: "March 2026",
    read: "6 min",
    title: "What the River Has Taught Us About Time",
    excerpt: "On the slow art of arriving, and why we removed every clock from the lodge.",
    img: river,
    href: "/journal/what-the-river-has-taught-us-about-time" as const,
  },
  {
    date: "February 2026",
    read: "5 min",
    title: "Life Along the Nduruma River",
    excerpt:
      "Farming traditions, irrigation streams, and the green heart of Mtoni — where ox-ploughed fields and river-fed gardens shape daily life.",
    img: coffee,
    href: "/journal/a-morning-with-the-beekeepers-of-gomba" as const,
  },
  {
    date: "January 2026",
    read: "6 min",
    title: "Building With the Community",
    excerpt:
      "Employment, infrastructure, and shared growth — how Mtoni contributes to the people and ecosystems that surround it.",
    img: guide,
    href: "/journal/reading-the-sky-over-mount-meru" as const,
  },
  {
    date: "December 2025",
    read: "6 min",
    title: "Maasai Boma Architecture at Mtoni",
    excerpt:
      "Earth, thatch, and circular spatial logic — how the rooms are grounded in a building tradition shaped by climate, culture, and land.",
    img: villa,
    href: "/journal/the-architecture-of-disappearing" as const,
  },
  {
    date: "November 2025",
    read: "3 min",
    title: "Wild ginger, baobab, rosehip",
    excerpt: "A short note on the East African botanicals at the heart of our spa.",
    img: spa,
    href: "/journal/wild-ginger-baobab-rosehip" as const,
  },
];

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
      <section className="px-6 pb-20 pt-[110px] lg:px-12 lg:pt-[180px]">
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
              to="/journal/what-the-river-has-taught-us-about-time"
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
