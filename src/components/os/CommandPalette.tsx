import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { runSearch, searchProviders, type SearchResult } from "@/lib/search/registry";

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    runSearch(query).then((r) => {
      if (!cancelled) setResults(r);
    });
    return () => {
      cancelled = true;
    };
  }, [query]);

  const grouped = searchProviders.map((p) => ({
    provider: p,
    items: results.filter((r) => r.providerId === p.id),
  }));

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search bookings, guests, reviews…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>
          {query.length < 2 ? "Type at least 2 characters to search." : "No results."}
        </CommandEmpty>
        {grouped.map(({ provider, items }) =>
          items.length ? (
            <CommandGroup key={provider.id} heading={provider.label}>
              {items.map((r) => {
                const Icon = r.icon;
                return (
                  <CommandItem
                    key={r.id}
                    value={`${r.title} ${r.subtitle ?? ""}`}
                    onSelect={() => {
                      onOpenChange(false);
                      navigate({ to: r.href });
                    }}
                  >
                    {Icon && <Icon className="mr-2 h-4 w-4" aria-hidden />}
                    <div className="flex flex-col">
                      <span>{r.title}</span>
                      {r.subtitle && <span className="text-xs text-muted-foreground">{r.subtitle}</span>}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ) : null,
        )}
      </CommandList>
    </CommandDialog>
  );
}