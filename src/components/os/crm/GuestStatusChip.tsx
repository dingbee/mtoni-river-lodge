import { StatusChip, type StatusTone } from "@/components/os/StatusChip";

const map: Record<string, { tone: StatusTone; label: string }> = {
  new: { tone: "info", label: "New" },
  returning: { tone: "success", label: "Returning" },
  vip: { tone: "warning", label: "VIP" },
};

export function GuestStatusChip({ status }: { status: string | null | undefined }) {
  const s = map[status ?? "new"] ?? map.new;
  return <StatusChip tone={s.tone}>{s.label}</StatusChip>;
}