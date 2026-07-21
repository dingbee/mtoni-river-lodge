import { Bot, Sparkles } from "lucide-react";
import { defineModule } from "../registry";

export const automationModule = defineModule({
  id: "automation", name: "Automation", description: "Rules and triggers",
  icon: Bot, route: "/admin/automation",
  order: 100,
  requiredRoles: ["owner","manager"], status: "active",
});

export const aiAssistantModule = defineModule({
  id: "ai.assistant", name: "AI Assistant", description: "In-app AI operations assistant",
  icon: Sparkles, route: "/admin/ai",
  order: 110,
  requiredRoles: ["owner"], featureFlag: "ai_assistant", status: "hidden",
});
