import { useQuery } from "@tanstack/react-query";
import { getPublicCmsPage } from "@/domains/content/pages/pages-public.functions";

/**
 * Fetches a published CMS page by well-known slug. Returns `null` when the
 * page doesn't exist, is a draft, has no blocks, or the database is
 * unreachable — callers keep their hand-authored fallback UI in that case.
 */
export function usePublicCms(slug: string) {
  return useQuery({
    queryKey: ["cms.public", slug],
    queryFn: () => getPublicCmsPage({ data: { slug } }),
    staleTime: 60_000,
  });
}