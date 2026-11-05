import { useState } from "react";
import { format, parseISO } from "date-fns";
import { CalendarDays } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type DatePickerFieldProps = {
  value: string;
  onChange: (value: string) => void;
  minDate?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
};

function toLocalDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  return parseISO(value);
}

function toDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function DatePickerField({
  value,
  onChange,
  minDate,
  placeholder = "Select date",
  className,
  disabled = false,
  id,
}: DatePickerFieldProps) {
  const [open, setOpen] = useState(false);
  const selected = toLocalDate(value);
  const earliest = minDate ? toLocalDate(minDate) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={selected ? `Selected date ${format(selected, "PPP")}` : placeholder}
          aria-haspopup="dialog"
          aria-expanded={open}
          className={cn(
            "h-10 w-full justify-start gap-2 border-input bg-background px-3 text-left font-normal",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <CalendarDays className="h-4 w-4 shrink-0" aria-hidden />
          <span>{selected ? format(selected, "PPP") : placeholder}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="center" side="bottom" sideOffset={8} className="w-[min(22rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] overflow-hidden p-0">
        <Calendar
          className="w-full [--cell-size:clamp(2rem,9vw,2.5rem)]"
          mode="single"
          selected={selected}
          onSelect={(date) => {
            if (!date) return;
            onChange(toDateValue(date));
            setOpen(false);
          }}
          disabled={earliest ? { before: earliest } : undefined}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
