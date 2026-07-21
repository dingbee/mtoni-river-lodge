import { Home, Bed, Compass, Newspaper, Image as ImageIcon, FolderOpen } from "lucide-react";
import { defineModule } from "../registry";

const baseRoles = ["owner","manager","marketing","editor"] as const;
const mk = (id: string, name: string, route: string, icon: any, order: number) =>
  defineModule({ id, name, description: name, icon, route, parentId: "content", order, requiredRoles: [...baseRoles], status: "active" });

export const contentHomepageModule    = mk("content.homepage",    "Homepage",      "/admin/content/homepage",    Home,      10);
export const contentRoomsModule       = mk("content.rooms",       "Rooms",         "/admin/content/rooms",       Bed,       20);
export const contentExperiencesModule = mk("content.experiences", "Experiences",   "/admin/content/experiences", Compass,   30);
export const contentJournalModule     = mk("content.journal",     "Journal",       "/admin/content/journal",     Newspaper, 40);
export const contentGalleryModule     = mk("content.gallery",     "Gallery",       "/admin/content/gallery",     ImageIcon, 50);
export const contentMediaModule       = mk("content.media",       "Media Library", "/admin/content/media",       FolderOpen,60);
