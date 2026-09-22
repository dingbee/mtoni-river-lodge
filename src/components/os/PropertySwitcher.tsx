import { Building2, Check, ChevronsUpDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { usePropertyContext } from "@/modules/property/PropertyContext";

export function PropertySwitcher() {
  const { organisation, properties, property, setProperty } = usePropertyContext();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-9 max-w-[260px] justify-start gap-2 px-2.5 text-left"
          aria-label={`Current property: ${property.name}`}
        >
          <Building2 className="h-4 w-4 shrink-0 text-[color:var(--os-green)]" aria-hidden />
          <span className="min-w-0 flex-1 truncate">
            <span className="block truncate text-xs font-medium">{property.name}</span>
            <span className="block truncate text-[0.58rem] uppercase tracking-[0.16em] text-muted-foreground">
              {organisation.name}
            </span>
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>Property</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {properties.map((candidate) => (
          <DropdownMenuItem
            key={candidate.id}
            onSelect={() => setProperty(candidate.id)}
            className="gap-2"
          >
            <Building2 className="h-4 w-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{candidate.name}</span>
              <span className="block text-[0.65rem] text-muted-foreground">
                {candidate.code} · {candidate.timezone}
              </span>
            </span>
            {candidate.id === property.id && <Check className="h-4 w-4" aria-hidden />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
