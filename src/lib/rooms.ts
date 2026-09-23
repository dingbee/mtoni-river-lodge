export type Room = {
  slug: string;
  no?: string;
  name: string;
  shortName?: string;
  heroLine?: string;
  shortDesc?: string;
  description?: string[];
  details?: { label: string; value: string }[];
  ctaLine?: string;
  img?: string;
  gallery?: string[];
  size?: string;
  view?: string;
};

export const ROOMS: Room[] = [];
export const ROOM_PATHS: Record<string, string> = {};
export type RoomSlug = string;
export function getRoomPath(slug: string) { return "/rooms/" + slug; }
