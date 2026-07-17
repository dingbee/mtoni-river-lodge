import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Marketing Intelligence AI (Sprint 8E)
 *
 * Deterministic, explainable analyses across SEO, content, campaigns,
 * reputation, and brand. The AI NEVER publishes content, edits SEO
 * metadata, or launches campaigns. Every recommendation is written to
 * ai_marketing_recommendations (or the sibling insight tables) in a
 * "pending" state and requires a human to accept / dismiss / convert.
 */

const MODEL = "deterministic:mtoni-marketing-v1";

function daysAgo(n: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
function clamp(v: number, min = 0, max = 1) { return Math.max(min, Math.min(max, v)); }
function today() { return new Date().toISOString().slice(0, 10); }
function weekStart(d = new Date()) {
  const day = d.getUTCDay(); // 0=Sun
  const diff = (day === 0 ? -6 : 1 - day); // Monday
  const w = new Date(d); w.setUTCDate(d.getUTCDate() + diff);
  return w.toISOString().slice(0, 10);
}
async function logActivity(supabase: any, userId: string, tool: string, question: string, response: string, domains: string[]) {
  await supabase.from("ai_activity_logs").insert({
    user_id: userId,
    question,
    domains_accessed: domains,
    tool_called: tool,
    response,
    model: MODEL,
    status: "completed",
    duration_ms: 0,
  });
}

// ---------------------------------------------------------------------------
// Overview — dashboard widgets
// ---------------------------------------------------------------------------

export const getMarketingIntelligenceOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [
      { data: seo },
      { data: pages },
      { data: articles },
      { data: campaigns },
      { data: reviews },
      { data: brand },
      { data: pendingRecs },
    ] = await Promise.all([
      context.supabase.from("seo_overrides").select("route_path, title, description, og_image, schema_type, index_status"),
      context.supabase.from("cms_pages").select("id, slug, route_path, title, description, status"),
      context.supabase.from("journal_articles").select("id, status, published_at, seo_title, seo_description, cover_image_url"),
      context.supabase.from("campaigns").select("id, status, start_date, end_date, name"),
      context.supabase.from("reviews").select("rating, status, review_date, review_text").eq("status", "approved").gte("review_date", daysAgo(365)),
      context.supabase.from("brand_tokens").select("id, category"),
      context.supabase.from("ai_marketing_recommendations").select("id, kind, status").eq("status", "pending"),
    ]);

    const publishedArticles = (articles ?? []).filter((a: any) => a.status === "published");
    const lastPublish = publishedArticles
      .map((a: any) => a.published_at)
      .filter(Boolean)
      .sort()
      .at(-1) as string | undefined;
    const daysSinceLast = lastPublish
      ? Math.round((Date.now() - +new Date(lastPublish)) / 86400000)
      : null;

    const totalReviews = reviews?.length ?? 0;
    const avgRating = totalReviews
      ? (reviews ?? []).reduce((s: number, r: any) => s + Number(r.rating ?? 0), 0) / totalReviews
      : 0;

    const seoRows = (seo ?? []) as any[];
    const missingMeta = seoRows.filter((r) => !r.title || !r.description).length;
    const indexedRoutes = seoRows.filter((r) => r.index_status !== false).length;
    const seoHealth = seoRows.length
      ? clamp(1 - missingMeta / seoRows.length)
      : 0;

    const activeCampaigns = (campaigns ?? []).filter((c: any) => c.status === "running" || c.status === "scheduled").length;

    return {
      seoHealth,
      seoRoutes: seoRows.length,
      seoMissingMeta: missingMeta,
      indexedRoutes,
      cmsPages: pages?.length ?? 0,
      journalPublished: publishedArticles.length,
      journalDaysSinceLast: daysSinceLast,
      publishCadenceHealth: daysSinceLast == null
        ? 0
        : clamp(1 - daysSinceLast / 45), // ~monthly cadence target
      activeCampaigns,
      totalCampaigns: campaigns?.length ?? 0,
      reviewsCount: totalReviews,
      avgRating,
      brandTokens: brand?.length ?? 0,
      pendingRecommendations: pendingRecs?.length ?? 0,
      pendingByKind: {
        seo: (pendingRecs ?? []).filter((r: any) => r.kind === "seo").length,
        content: (pendingRecs ?? []).filter((r: any) => r.kind === "content").length,
        campaign: (pendingRecs ?? []).filter((r: any) => r.kind === "campaign").length,
      },
    };
  });

// ---------------------------------------------------------------------------
// SEO Intelligence
// ---------------------------------------------------------------------------

/**
 * Methodology: static rule set applied to seo_overrides + cms_pages.
 * - Missing title or description → high-impact rewrite recommendation.
 * - Title < 20 or > 65 chars → length recommendation.
 * - Description < 60 or > 165 chars → length recommendation.
 * - Missing og_image → social preview recommendation.
 * - Missing schema_type → structured data recommendation.
 * - Duplicate titles across routes → uniqueness recommendation.
 * All outputs are stored as pending and require human approval.
 */
export const generateSeoRecommendations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { persist?: boolean } | undefined) => ({ persist: input?.persist ?? true }))
  .handler(async ({ data, context }) => {
    const [{ data: seo }, { data: pages }] = await Promise.all([
      context.supabase.from("seo_overrides").select("*"),
      context.supabase.from("cms_pages").select("id, route_path, slug, title, description, status"),
    ]);

    const seoByRoute = new Map<string, any>();
    for (const row of (seo ?? []) as any[]) seoByRoute.set(row.route_path, row);

    const titleCounts = new Map<string, number>();
    for (const row of (seo ?? []) as any[]) {
      if (row.title) titleCounts.set(row.title, (titleCounts.get(row.title) ?? 0) + 1);
    }

    const recs: Array<any> = [];

    function push(rec: any) { recs.push(rec); }

    // Pages missing SEO override entirely
    for (const p of (pages ?? []) as any[]) {
      if (p.status !== "published" || !p.route_path) continue;
      const s = seoByRoute.get(p.route_path);
      const effTitle = s?.title ?? p.title ?? "";
      const effDesc = s?.description ?? p.description ?? "";

      if (!effTitle || !effDesc) {
        push({
          kind: "seo", action: "add_metadata",
          target_route: p.route_path,
          target_label: p.title ?? p.route_path,
          title: `Add SEO metadata for ${p.route_path}`,
          reasoning: `Page ${p.route_path} is published but has ${!effTitle ? "no title" : "no description"} in seo_overrides.`,
          expected_impact: "High — pages without a title or description underperform in search snippets.",
          impact_score: 8,
          confidence: 0.9,
          evidence: [{ source: "cms_pages", route: p.route_path, title: p.title }, { source: "seo_overrides", present: !!s }],
          suggested_payload: { title: p.title, description: p.description ?? "" },
        });
        continue;
      }
      if (effTitle.length < 20) {
        push({
          kind: "seo", action: "expand_title",
          target_route: p.route_path, target_label: p.title,
          title: `Expand SEO title for ${p.route_path}`,
          reasoning: `Title "${effTitle}" is only ${effTitle.length} chars. Titles below ~30 chars usually leave keyword real estate unused.`,
          expected_impact: "Medium — a fuller, keyword-rich title improves CTR from search.",
          impact_score: 5,
          confidence: 0.75,
          evidence: [{ source: "seo_overrides.title", value: effTitle }],
          suggested_payload: {},
        });
      } else if (effTitle.length > 65) {
        push({
          kind: "seo", action: "shorten_title",
          target_route: p.route_path, target_label: p.title,
          title: `Shorten SEO title for ${p.route_path}`,
          reasoning: `Title is ${effTitle.length} chars — Google typically truncates around 60 characters.`,
          expected_impact: "Medium — full titles are shown in search results.",
          impact_score: 4, confidence: 0.8,
          evidence: [{ source: "seo_overrides.title", length: effTitle.length }],
          suggested_payload: {},
        });
      }
      if (effDesc.length < 60) {
        push({
          kind: "seo", action: "expand_description",
          target_route: p.route_path, target_label: p.title,
          title: `Expand meta description for ${p.route_path}`,
          reasoning: `Description is ${effDesc.length} chars. Aim for 120–160 to capture snippet space.`,
          expected_impact: "Medium — fuller descriptions increase click-through from SERPs.",
          impact_score: 4, confidence: 0.75,
          evidence: [{ source: "seo_overrides.description", length: effDesc.length }],
          suggested_payload: {},
        });
      }
      if (s && !s.og_image) {
        push({
          kind: "seo", action: "add_og_image",
          target_route: p.route_path, target_label: p.title,
          title: `Add social share image for ${p.route_path}`,
          reasoning: `No og_image set. Social shares fall back to a generic preview.`,
          expected_impact: "Medium — richer previews improve social CTR.",
          impact_score: 3, confidence: 0.7,
          evidence: [{ source: "seo_overrides.og_image", present: false }],
          suggested_payload: {},
        });
      }
      if (s && !s.schema_type) {
        push({
          kind: "seo", action: "add_schema",
          target_route: p.route_path, target_label: p.title,
          title: `Add structured data for ${p.route_path}`,
          reasoning: `No schema_type recorded. FAQ / LodgingBusiness / Article schema helps rich results.`,
          expected_impact: "Medium — schema unlocks rich result eligibility.",
          impact_score: 5, confidence: 0.7,
          evidence: [{ source: "seo_overrides.schema_type", present: false }],
          suggested_payload: {},
        });
      }

      if (titleCounts.get(effTitle)! > 1) {
        push({
          kind: "seo", action: "unique_title",
          target_route: p.route_path, target_label: p.title,
          title: `Duplicate SEO title on ${p.route_path}`,
          reasoning: `Title "${effTitle}" appears on ${titleCounts.get(effTitle)} routes. Duplicate titles dilute ranking signals.`,
          expected_impact: "High — unique titles help each page target its own query set.",
          impact_score: 7, confidence: 0.85,
          evidence: [{ source: "seo_overrides.title.duplicates", count: titleCounts.get(effTitle) }],
          suggested_payload: {},
        });
      }
    }

    if (data.persist && recs.length) {
      await context.supabase.from("ai_marketing_recommendations").insert(
        recs.map((r) => ({
          ...r,
          suggested_payload: r.suggested_payload as never,
          evidence: r.evidence as never,
          model: MODEL,
          generated_by: context.userId,
        })),
      );
      await logActivity(context.supabase, context.userId, "marketing.seo.analyze",
        `SEO analysis run`, `Generated ${recs.length} SEO recommendation(s).`, ["marketing"]);
    }
    return { recommendations: recs };
  });

// ---------------------------------------------------------------------------
// Content Intelligence
// ---------------------------------------------------------------------------

/**
 * Methodology:
 * - Publishing cadence gap (> 30 days) → new-topic recommendation.
 * - Articles > 180 days old → refresh recommendation.
 * - Articles missing seo_title/description → SEO-alignment recommendation.
 * - High-demand seasonal windows (based on forward bookings) →
 *   seasonal landing recommendation.
 */
export const generateContentRecommendations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { persist?: boolean } | undefined) => ({ persist: input?.persist ?? true }))
  .handler(async ({ data, context }) => {
    const [{ data: articles }, { data: forward }] = await Promise.all([
      context.supabase.from("journal_articles").select("id, title, slug, status, published_at, seo_title, seo_description, cover_image_url"),
      context.supabase.from("bookings").select("check_in, total, status").gte("check_in", today()).lte("check_in", daysAgo(-90)).in("status", ["confirmed","pending","checked_in"]),
    ]);
    const published = (articles ?? []).filter((a: any) => a.status === "published");
    const sorted = [...published].sort((a: any, b: any) => (b.published_at ?? "").localeCompare(a.published_at ?? ""));
    const last = sorted[0] as any | undefined;
    const daysSince = last?.published_at ? Math.round((Date.now() - +new Date(last.published_at)) / 86400000) : 9999;

    const recs: any[] = [];

    if (daysSince > 30) {
      recs.push({
        kind: "content", action: "new_article",
        target_label: "Journal",
        title: `Publish a new journal article (last was ${daysSince}d ago)`,
        reasoning: `The last published article was ${daysSince} days ago. Consistent cadence signals freshness to search engines and gives guests a reason to revisit.`,
        expected_impact: "Medium — regular journal cadence supports organic visibility and email content.",
        impact_score: 6, confidence: 0.75,
        evidence: [{ source: "journal_articles.last_publish", days_since: daysSince }],
        suggested_payload: {
          suggested_topics: [
            "A weekend guide to Arusha from Mtoni",
            "Coffee, forest, and slow living — a day on the estate",
            "Kilimanjaro logistics: what climbers actually need from a lodge",
          ],
          suggested_keywords: ["Arusha lodge", "Kilimanjaro base lodge", "boutique Tanzania lodge"],
          outline: ["Hook & sense of place", "Highlights & experiences", "Practical planning", "Booking CTA"],
        },
      });
    }

    for (const a of published as any[]) {
      const age = a.published_at ? Math.round((Date.now() - +new Date(a.published_at)) / 86400000) : 0;
      if (age > 180) {
        recs.push({
          kind: "content", action: "refresh_article",
          target_id: a.id, target_label: a.title,
          title: `Refresh "${a.title}" (${age}d old)`,
          reasoning: `Article is ${age} days old. A refresh with updated details and new internal links preserves rankings and improves relevance.`,
          expected_impact: "Medium — updating older content is one of the highest-ROI SEO actions.",
          impact_score: 5, confidence: 0.7,
          evidence: [{ source: "journal_articles", id: a.id, age_days: age }],
          suggested_payload: { checklist: ["Refresh dates", "Add 2 internal links", "Update cover image", "Improve FAQ"] },
        });
      }
      if (!a.seo_title || !a.seo_description) {
        recs.push({
          kind: "content", action: "seo_align_article",
          target_id: a.id, target_label: a.title,
          title: `Add SEO title/description for "${a.title}"`,
          reasoning: `Article missing ${!a.seo_title ? "seo_title" : "seo_description"}. Article-level SEO fields drive the search snippet.`,
          expected_impact: "Medium — article-level SEO fields materially affect CTR.",
          impact_score: 4, confidence: 0.85,
          evidence: [{ source: "journal_articles", id: a.id, seo_title: !!a.seo_title, seo_description: !!a.seo_description }],
          suggested_payload: {},
        });
      }
    }

    const forwardCount = (forward ?? []).length;
    if (forwardCount >= 5) {
      recs.push({
        kind: "content", action: "seasonal_landing",
        target_label: "Homepage / Experiences",
        title: `Consider a seasonal landing page (${forwardCount} forward bookings)`,
        reasoning: `${forwardCount} confirmed/pending bookings in the next 90 days — a themed seasonal landing (e.g. green-season, Kilimanjaro season) can convert incoming search demand.`,
        expected_impact: "Medium — seasonal pages capture query intent at the right moment.",
        impact_score: 5, confidence: 0.6,
        evidence: [{ source: "bookings.forward_90d", count: forwardCount }],
        suggested_payload: {},
      });
    }

    if (data.persist && recs.length) {
      await context.supabase.from("ai_marketing_recommendations").insert(
        recs.map((r) => ({ ...r, suggested_payload: r.suggested_payload as never, evidence: r.evidence as never, model: MODEL, generated_by: context.userId })),
      );
      await logActivity(context.supabase, context.userId, "marketing.content.analyze",
        `Content analysis run`, `Generated ${recs.length} content recommendation(s).`, ["marketing"]);
    }
    return { recommendations: recs };
  });

// ---------------------------------------------------------------------------
// Campaign Intelligence
// ---------------------------------------------------------------------------

/**
 * Methodology: combine forward occupancy with recent campaign history.
 * - Forward occupancy < 45% → recommend acquisition campaign / promotion.
 * - Forward occupancy > 80% → recommend upsell/experience campaign, not
 *   discount.
 * - No active campaign in > 30 days → recommend awareness campaign.
 * - Cancellations spiking → recommend retention campaign to soft demand.
 * Every recommendation includes estimated reach, expected impact, and
 * required approval — no launches happen automatically.
 */
export const generateCampaignRecommendations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { persist?: boolean } | undefined) => ({ persist: input?.persist ?? true }))
  .handler(async ({ data, context }) => {
    const from = today();
    const to90 = daysAgo(-90);
    const [{ data: rooms }, { data: forward }, { data: campaigns }, { data: cancelled }, { data: reviews }] = await Promise.all([
      context.supabase.from("rooms").select("total_units").eq("status", "active"),
      context.supabase.from("bookings").select("nights, status, check_in").gte("check_in", from).lte("check_in", to90).in("status", ["confirmed","pending","checked_in"]),
      context.supabase.from("campaigns").select("id, name, status, start_date, end_date"),
      context.supabase.from("bookings").select("id, created_at").eq("status","cancelled").gte("created_at", daysAgo(14)),
      context.supabase.from("reviews").select("rating").eq("status","approved").gte("review_date", daysAgo(90)),
    ]);

    const totalUnits = (rooms ?? []).reduce((s: number, r: any) => s + Number(r.total_units ?? 0), 0);
    const capacity = totalUnits * 90;
    const nights = (forward ?? []).reduce((s: number, b: any) => s + Number(b.nights ?? 0), 0);
    const occ = capacity > 0 ? nights / capacity : 0;

    const activeCampaigns = (campaigns ?? []).filter((c: any) => c.status === "running" || c.status === "scheduled").length;
    const lastActive = (campaigns ?? [])
      .filter((c: any) => c.end_date)
      .map((c: any) => c.end_date)
      .sort()
      .at(-1) as string | undefined;
    const daysSinceCampaign = lastActive ? Math.round((Date.now() - +new Date(lastActive)) / 86400000) : 9999;
    const cancellations = cancelled?.length ?? 0;
    const avgRating = reviews?.length ? (reviews as any[]).reduce((s, r) => s + Number(r.rating ?? 0), 0) / reviews.length : 0;

    const recs: any[] = [];

    if (occ < 0.45 && activeCampaigns === 0) {
      recs.push({
        kind: "campaign", action: "acquisition_promotion",
        target_label: "Acquisition",
        title: `Launch a demand-generation campaign (forward occupancy ${Math.round(occ*100)}%)`,
        reasoning: `Forward 90-day occupancy is ${Math.round(occ*100)}% and no campaign is active. A targeted promotion (e.g. 4th-night-free or shoulder-season package) can lift bookings.`,
        expected_impact: `Medium — historic acquisition campaigns typically shift 3–8 nights within 30 days.`,
        impact_score: 7, confidence: 0.65,
        evidence: [
          { source: "bookings.forward_90d.occupancy", value: Number(occ.toFixed(2)) },
          { source: "campaigns.active", count: activeCampaigns },
        ],
        suggested_payload: {
          audience: "Past guests + regional travellers (Kenya, Uganda, EU repeat markets)",
          channel: "Email + Instagram + Google Ads",
          utm: { utm_source: "email", utm_medium: "promo", utm_campaign: "shoulder-season" },
          suggested_offer: "10% off 3+ night stays midweek",
          estimated_reach: 4500,
        },
      });
    } else if (occ > 0.8) {
      recs.push({
        kind: "campaign", action: "upsell_experience",
        target_label: "Experience upsell",
        title: `Promote experience packages (forward occupancy ${Math.round(occ*100)}%)`,
        reasoning: `Forward occupancy is strong (${Math.round(occ*100)}%). Focus revenue growth on ADR through experiences (dinner, transfer, forest walks) rather than discounts.`,
        expected_impact: "Medium — upselling experiences typically lifts ADR 5–12%.",
        impact_score: 6, confidence: 0.7,
        evidence: [{ source: "bookings.forward_90d.occupancy", value: Number(occ.toFixed(2)) }],
        suggested_payload: {
          audience: "Confirmed upcoming guests",
          channel: "Pre-arrival email",
          utm: { utm_source: "email", utm_medium: "pre-arrival", utm_campaign: "experiences" },
        },
      });
    }

    if (daysSinceCampaign > 60) {
      recs.push({
        kind: "campaign", action: "awareness",
        target_label: "Brand awareness",
        title: `Run a brand-awareness campaign (${daysSinceCampaign}d since last)`,
        reasoning: `No campaign has ended in ${daysSinceCampaign} days. A story-led awareness push keeps Mtoni present in target audiences.`,
        expected_impact: "Medium — awareness lifts branded search and direct traffic.",
        impact_score: 4, confidence: 0.55,
        evidence: [{ source: "campaigns.last_end_date", days_since: daysSinceCampaign }],
        suggested_payload: { channel: "Instagram Reels + Journal cross-post" },
      });
    }

    if (cancellations >= 3) {
      recs.push({
        kind: "campaign", action: "retention",
        target_label: "Retention",
        title: `Cancellation retention campaign (${cancellations} in 14d)`,
        reasoning: `${cancellations} cancellations in the last 14 days. A retention email offering flexible re-book terms can recover soft demand.`,
        expected_impact: "Medium — recover a share of cancelled bookings.",
        impact_score: 5, confidence: 0.55,
        evidence: [{ source: "bookings.cancellations_14d", count: cancellations }],
        suggested_payload: {
          audience: "Recently cancelled guests",
          channel: "Email",
          utm: { utm_source: "email", utm_medium: "retention", utm_campaign: "flex-rebook" },
        },
      });
    }

    if (avgRating >= 4.6 && (reviews?.length ?? 0) >= 5) {
      recs.push({
        kind: "campaign", action: "review_showcase",
        target_label: "Social proof",
        title: `Showcase reviews (avg ${avgRating.toFixed(2)}★ across ${reviews!.length} reviews)`,
        reasoning: `90-day review average is ${avgRating.toFixed(2)}★. A review-led campaign converts trust into bookings.`,
        expected_impact: "Medium — social proof is a top conversion lever for direct bookings.",
        impact_score: 5, confidence: 0.7,
        evidence: [{ source: "reviews.90d.avg_rating", value: Number(avgRating.toFixed(2)), count: reviews!.length }],
        suggested_payload: { channel: "Instagram + homepage hero + email" },
      });
    }

    if (data.persist && recs.length) {
      await context.supabase.from("ai_marketing_recommendations").insert(
        recs.map((r) => ({ ...r, suggested_payload: r.suggested_payload as never, evidence: r.evidence as never, model: MODEL, generated_by: context.userId })),
      );
      await logActivity(context.supabase, context.userId, "marketing.campaign.analyze",
        `Campaign analysis run`, `Generated ${recs.length} campaign recommendation(s).`, ["marketing"]);
    }
    return { recommendations: recs };
  });

// ---------------------------------------------------------------------------
// Reputation Intelligence
// ---------------------------------------------------------------------------

/**
 * Methodology: aggregate approved reviews from the last 180 days.
 * - Average rating, distribution, per-source split.
 * - Theme extraction via keyword scan (compliment / complaint dictionaries)
 *   for a deterministic, explainable summary.
 * - Response drafts for unanswered low-rating reviews. Never posted.
 */
const COMPLIMENT_WORDS = ["beautiful","peaceful","kind","staff","food","clean","comfortable","quiet","stunning","view","welcoming","service","friendly"];
const COMPLAINT_WORDS = ["slow","noisy","dirty","cold","hot","broken","wifi","internet","expensive","rude","wait","confusing","tired","dated"];

function themesFromReviews(reviews: any[]) {
  const compliments = new Map<string, number>();
  const complaints = new Map<string, number>();
  for (const r of reviews) {
    const text = String(r.review_text ?? "").toLowerCase();
    for (const w of COMPLIMENT_WORDS) if (text.includes(w)) compliments.set(w, (compliments.get(w) ?? 0) + 1);
    for (const w of COMPLAINT_WORDS) if (text.includes(w)) complaints.set(w, (complaints.get(w) ?? 0) + 1);
  }
  const sorted = (m: Map<string, number>) =>
    Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([term, count]) => ({ term, count }));
  return { compliments: sorted(compliments), complaints: sorted(complaints) };
}

export const generateReputationInsight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { persist?: boolean } | undefined) => ({ persist: input?.persist ?? true }))
  .handler(async ({ data, context }) => {
    const from = daysAgo(180);
    const { data: reviews } = await context.supabase
      .from("reviews")
      .select("rating, review_date, review_text, source, guest_name, status")
      .eq("status","approved")
      .gte("review_date", from);
    const rows = (reviews ?? []) as any[];

    const count = rows.length;
    const avg = count ? rows.reduce((s, r) => s + Number(r.rating ?? 0), 0) / count : 0;
    const bySource = new Map<string, { count: number; sum: number }>();
    for (const r of rows) {
      const s = String(r.source);
      const cur = bySource.get(s) ?? { count: 0, sum: 0 };
      cur.count++; cur.sum += Number(r.rating ?? 0);
      bySource.set(s, cur);
    }
    const perSource = Array.from(bySource.entries()).map(([source, v]) => ({
      source, count: v.count, avg: v.count ? Number((v.sum / v.count).toFixed(2)) : 0,
    }));

    const themes = themesFromReviews(rows);

    const lowRatings = rows.filter((r) => Number(r.rating) <= 3);
    const drafts = lowRatings.slice(0, 5).map((r) => ({
      guest: r.guest_name,
      source: r.source,
      rating: r.rating,
      draft: `Thank you, ${r.guest_name}, for taking the time to share your feedback. We're sorry your stay didn't fully meet expectations — we'd love the opportunity to make this right. Please reach out directly and we'll follow up personally. — The Mtoni team`,
    }));

    const summary = `Across ${count} approved reviews in the last 180 days, the average rating is ${avg.toFixed(2)}★. Top compliments: ${themes.compliments.map((t) => t.term).join(", ") || "—"}. Recurring concerns: ${themes.complaints.map((t) => t.term).join(", ") || "—"}.`;

    const recommendations: Array<{ title: string; reason: string }> = [];
    if (themes.complaints.length) {
      recommendations.push({
        title: `Operational review: ${themes.complaints.slice(0, 2).map((t) => t.term).join(" & ")}`,
        reason: `Mentioned in ${themes.complaints.slice(0, 2).reduce((s, t) => s + t.count, 0)} reviews.`,
      });
    }
    if (themes.compliments.length) {
      recommendations.push({
        title: `Amplify strengths in marketing: ${themes.compliments.slice(0, 3).map((t) => t.term).join(", ")}`,
        reason: `Guests consistently praise these — foreground them on homepage / journal.`,
      });
    }
    if (lowRatings.length) {
      recommendations.push({
        title: `Draft responses to ${lowRatings.length} low-rating review(s)`,
        reason: `Public, unresolved low-rating reviews depress conversion.`,
      });
    }

    const evidence = [
      { source: "reviews.180d.count", value: count },
      { source: "reviews.180d.avg", value: Number(avg.toFixed(2)) },
      { source: "reviews.per_source", value: perSource },
    ];
    const confidence = clamp(0.4 + Math.min(count, 60) / 100);

    let id: string | null = null;
    if (data.persist) {
      const { data: row } = await context.supabase.from("ai_reputation_insights").insert({
        scope: "overall",
        period_from: from,
        period_to: today(),
        sentiment_score: avg,
        compliments: themes.compliments as never,
        complaints: themes.complaints as never,
        themes: perSource as never,
        summary,
        recommendations: recommendations as never,
        response_drafts: drafts as never,
        evidence: evidence as never,
        confidence,
        model: MODEL,
        generated_by: context.userId,
      }).select("id").maybeSingle();
      id = row?.id ?? null;
      await logActivity(context.supabase, context.userId, "marketing.reputation.analyze",
        `Reputation analysis run`, summary, ["marketing"]);
    }
    return { id, count, avg, perSource, themes, drafts, summary, recommendations, evidence, confidence };
  });

// ---------------------------------------------------------------------------
// Brand Intelligence
// ---------------------------------------------------------------------------

/**
 * Methodology: compare drafted content against brand tokens.
 * - Tone: penalise banned/off-brand words (loud sales language) and
 *   reward on-brand vocabulary (from brand_tokens category="voice").
 * - Readability: Flesch-like approximation (words per sentence + syllable
 *   heuristic) mapped to 0–1.
 * - Consistency: check terminology matches the brand glossary if present.
 */
const OFF_BRAND_TERMS = ["cheap","deal","hurry","act now","best price","limited time","!!"];
function readabilityScore(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const sentences = Math.max(1, text.split(/[.!?]+/).filter(Boolean).length);
  const wps = words.length / sentences;
  // Prefer 12–20 words per sentence
  const wpsScore = clamp(1 - Math.abs(wps - 16) / 20);
  const longWords = words.filter((w) => w.length > 11).length / Math.max(1, words.length);
  const lengthScore = clamp(1 - longWords * 3);
  return clamp((wpsScore + lengthScore) / 2);
}

export const reviewBrandCompliance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { subject_type: string; subject_id?: string; subject_label?: string; content_sample: string; persist?: boolean }) => {
    if (!input?.content_sample || input.content_sample.length < 20) throw new Error("content_sample required (>=20 chars)");
    if (!input?.subject_type) throw new Error("subject_type required");
    return { ...input, persist: input.persist ?? true };
  })
  .handler(async ({ data, context }) => {
    const { data: brand } = await context.supabase.from("brand_tokens").select("key, category, label, value");
    const voiceTokens = (brand ?? []).filter((b: any) => b.category === "voice");
    const glossary = (brand ?? []).filter((b: any) => b.category === "glossary");

    const text = data.content_sample;
    const lower = text.toLowerCase();

    // Tone
    const offbrandHits = OFF_BRAND_TERMS.filter((t) => lower.includes(t));
    let toneScore = 1 - offbrandHits.length * 0.15;
    const voiceHits: string[] = [];
    for (const v of voiceTokens as any[]) {
      const term = String((v.value as any)?.term ?? v.label ?? "").toLowerCase();
      if (term && lower.includes(term)) { toneScore += 0.05; voiceHits.push(term); }
    }
    toneScore = clamp(toneScore);

    // Readability
    const readability = readabilityScore(text);

    // Consistency (glossary hits vs conflicting terms)
    const issues: Array<{ type: string; detail: string }> = [];
    for (const g of glossary as any[]) {
      const preferred = String((g.value as any)?.preferred ?? g.label ?? "").toLowerCase();
      const avoid: string[] = ((g.value as any)?.avoid ?? []) as string[];
      for (const a of avoid) if (a && lower.includes(String(a).toLowerCase())) {
        issues.push({ type: "glossary", detail: `Use "${preferred}" instead of "${a}".` });
      }
    }
    for (const t of offbrandHits) issues.push({ type: "tone", detail: `Off-brand phrase: "${t}".` });

    const consistency = clamp(1 - issues.length * 0.1);
    const brand_score = clamp((toneScore * 0.4 + readability * 0.3 + consistency * 0.3));

    const suggestions: string[] = [];
    if (toneScore < 0.7) suggestions.push("Soften sales language — favour place-led, sensory phrasing.");
    if (readability < 0.6) suggestions.push("Shorten sentences; aim for 12–20 words per sentence and fewer very long words.");
    if (consistency < 0.8) suggestions.push("Align to brand glossary terminology.");
    if (!suggestions.length) suggestions.push("Reads on-brand — safe to review and publish.");

    const evidence = [
      { source: "brand_tokens.voice", matched: voiceHits },
      { source: "off_brand_terms", matched: offbrandHits },
      { source: "text.words", value: text.split(/\s+/).filter(Boolean).length },
    ];

    let id: string | null = null;
    if (data.persist) {
      const { data: row } = await context.supabase.from("ai_brand_reviews").insert({
        subject_type: data.subject_type,
        subject_id: data.subject_id ?? null,
        subject_label: data.subject_label ?? null,
        content_sample: text.slice(0, 4000),
        brand_score,
        tone_score: toneScore,
        readability_score: readability,
        consistency_score: consistency,
        issues: issues as never,
        suggestions: suggestions as never,
        evidence: evidence as never,
        model: MODEL,
        generated_by: context.userId,
      }).select("id").maybeSingle();
      id = row?.id ?? null;
      await logActivity(context.supabase, context.userId, "marketing.brand.review",
        `Brand review: ${data.subject_type}`, `Score ${(brand_score*100).toFixed(0)} · ${issues.length} issue(s)`, ["marketing"]);
    }
    return { id, brand_score, tone_score: toneScore, readability_score: readability, consistency_score: consistency, issues, suggestions, evidence };
  });

// ---------------------------------------------------------------------------
// Weekly Marketing Priorities
// ---------------------------------------------------------------------------

/**
 * Methodology: pull top pending recommendations across kinds, ranked by
 * impact_score × confidence; append the latest reputation summary if any.
 */
export const generateWeeklyPriorities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { persist?: boolean } | undefined) => ({ persist: input?.persist ?? true }))
  .handler(async ({ data, context }) => {
    const [{ data: pending }, { data: reputation }] = await Promise.all([
      context.supabase.from("ai_marketing_recommendations")
        .select("id, kind, action, title, reasoning, expected_impact, impact_score, confidence, evidence")
        .eq("status", "pending"),
      context.supabase.from("ai_reputation_insights")
        .select("summary, recommendations, sentiment_score, confidence").order("created_at", { ascending: false }).limit(1),
    ]);

    const ranked = ((pending ?? []) as any[])
      .map((r) => ({ ...r, score: Number(r.impact_score ?? 0) * Number(r.confidence ?? 0) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((r) => ({
        id: r.id,
        kind: r.kind,
        title: r.title,
        reason: r.reasoning,
        expected_impact: r.expected_impact,
        confidence: r.confidence,
        score: r.score,
        evidence: r.evidence,
      }));

    const rep = (reputation as any[])?.[0];
    if (rep?.recommendations?.length) {
      for (const rec of rep.recommendations.slice(0, 2)) {
        ranked.push({
          id: null as any,
          kind: "reputation",
          title: rec.title,
          reason: rec.reason,
          expected_impact: "Medium — reputation shapes conversion and trust.",
          confidence: rep.confidence ?? 0.6,
          score: 4,
          evidence: [{ source: "ai_reputation_insights", sentiment: rep.sentiment_score }],
        });
      }
    }

    const summary = ranked.length
      ? `Top ${ranked.length} marketing priorities for the week, ranked by expected impact × confidence.`
      : `No open marketing recommendations — run the SEO, content, and campaign scans to refresh the queue.`;

    const evidence = [
      { source: "ai_marketing_recommendations.pending", count: pending?.length ?? 0 },
      { source: "ai_reputation_insights.latest", present: !!rep },
    ];

    let id: string | null = null;
    if (data.persist) {
      const { data: row } = await context.supabase.from("ai_marketing_priorities").insert({
        week_start: weekStart(),
        priorities: ranked as never,
        summary,
        confidence: 0.7,
        evidence: evidence as never,
        model: MODEL,
        generated_by: context.userId,
      }).select("id").maybeSingle();
      id = row?.id ?? null;
      await logActivity(context.supabase, context.userId, "marketing.priorities.generate",
        "Weekly priorities generated", summary, ["marketing"]);
    }
    return { id, priorities: ranked, summary, evidence };
  });

// ---------------------------------------------------------------------------
// Listing + Actioning
// ---------------------------------------------------------------------------

export const listMarketingRecommendations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { kind?: "seo" | "content" | "campaign"; status?: string } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("ai_marketing_recommendations").select("*").order("created_at", { ascending: false }).limit(200);
    if (data.kind) q = q.eq("kind", data.kind);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows } = await q;
    return rows ?? [];
  });

export const actionMarketingRecommendation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; action: "accept" | "dismiss" | "convert" }) => {
    if (!input?.id) throw new Error("id required");
    if (!["accept","dismiss","convert"].includes(input.action)) throw new Error("bad action");
    return input;
  })
  .handler(async ({ data, context }) => {
    const status = data.action === "accept" ? "accepted" : data.action === "dismiss" ? "dismissed" : "converted";
    let taskId: string | null = null;
    if (data.action === "convert") {
      const { data: rec } = await context.supabase.from("ai_marketing_recommendations").select("*").eq("id", data.id).maybeSingle();
      if (rec) {
        const { data: task } = await context.supabase.from("ops_tasks").insert({
          task_type: `marketing_${(rec as any).kind}`,
          title: (rec as any).title,
          description: (rec as any).reasoning,
          priority: 2,
        }).select("id").maybeSingle();
        taskId = task?.id ?? null;
      }
    }
    await context.supabase.from("ai_marketing_recommendations").update({
      status,
      actioned_by: context.userId,
      actioned_at: new Date().toISOString(),
      action_task_id: taskId ?? undefined,
    }).eq("id", data.id);
    await logActivity(context.supabase, context.userId, "marketing.recommendation.action",
      `Recommendation ${data.id} ${data.action}`, `Marked ${status}`, ["marketing"]);
    return { ok: true, status, taskId };
  });

export const listReputationInsights = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("ai_reputation_insights").select("*").order("created_at", { ascending: false }).limit(20);
    return data ?? [];
  });

export const listBrandReviews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("ai_brand_reviews").select("*").order("created_at", { ascending: false }).limit(50);
    return data ?? [];
  });

export const listMarketingPriorities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("ai_marketing_priorities").select("*").order("created_at", { ascending: false }).limit(12);
    return data ?? [];
  });