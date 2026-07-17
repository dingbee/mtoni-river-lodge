import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LoadingState } from "@/components/os/LoadingState";
import { ensureCmsPageBySlug } from "@/domains/content/pages/pages.functions";

/** Ensures a well-known CMS page exists for the given slug, then redirects to its editor. */
export function SlugPageRedirector(props: {
  slug: string;
  title: string;
  route_path?: string;
  description?: string;
}) {
  const ensureFn = useServerFn(ensureCmsPageBySlug);
  const navigate = useNavigate();
  const mut = useMutation({
    mutationFn: () => ensureFn({ data: props }),
    onSuccess: (row) => {
      if (row?.id) navigate({ to: "/admin/content/pages/$id", params: { id: row.id }, replace: true });
    },
  });
  useEffect(() => { mut.mutate(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [props.slug]);
  return <LoadingState />;
}