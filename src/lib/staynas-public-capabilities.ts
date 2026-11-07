export type PublicCapabilityStatus = "implemented" | "configuration-dependent" | "integration-dependent" | "planned";

export type PublicCapability = {
  id: string;
  name: string;
  pillar: string;
  summary: string;
  details: string[];
  status: PublicCapabilityStatus;
  statusLabel: string;
};

export const STAYNAS_PUBLIC_CAPABILITIES: PublicCapability[] = [
  {
    id: "reservations",
    name: "Reservations & booking lifecycle",
    pillar: "Commercial",
    summary: "Manage availability, reservations and controlled booking status transitions in one operating workflow.",
    details: ["Availability and direct booking journeys", "Reservation workspace and booking lifecycle controls", "Booking records connected to property operations"],
    status: "implemented",
    statusLabel: "Implemented capability",
  },
  {
    id: "property",
    name: "Property, rooms & inventory",
    pillar: "Property operations",
    summary: "Configure properties, room categories, room inventory and guest-facing accommodation information.",
    details: ["Property-aware room configuration", "Room status and allocation workflows", "Guest-facing room catalogue"],
    status: "implemented",
    statusLabel: "Implemented capability",
  },
  {
    id: "front-desk",
    name: "Front desk & digital check-in",
    pillar: "Guest experience",
    summary: "Connect pre-arrival information with reception review and arrival handling.",
    details: ["Online check-in journey", "Arrival pass issuance and verification flow", "Front-desk reservation workspace"],
    status: "implemented",
    statusLabel: "Implemented capability",
  },
  {
    id: "housekeeping",
    name: "Housekeeping & inspections",
    pillar: "Property operations",
    summary: "Coordinate room cleaning, task execution, inspections and operational exceptions.",
    details: ["Task assignment and progress", "Inspection queues and checklists", "Exceptions, notifications and room-readiness signals"],
    status: "implemented",
    statusLabel: "Implemented capability",
  },
  {
    id: "guest",
    name: "Guest profiles & intelligence",
    pillar: "Guest experience",
    summary: "Maintain guest context, stay history and service signals that support more considered hospitality.",
    details: ["Guest CRM and profile records", "Returning-guest and VIP context", "Guest intelligence and operational visibility"],
    status: "implemented",
    statusLabel: "Implemented capability",
  },
  {
    id: "finance",
    name: "Finance & revenue visibility",
    pillar: "Financial control",
    summary: "Bring reservation financials and property performance indicators into management workflows.",
    details: ["Reservation financial summaries", "Payment and outstanding-balance visibility", "Revenue indicators including ADR and RevPAR"],
    status: "implemented",
    statusLabel: "Implemented capability",
  },
  {
    id: "ai-concierge",
    name: "AI concierge & property knowledge",
    pillar: "Intelligence",
    summary: "Give guests access to assistance grounded in the information published by their property.",
    details: ["Property-aware concierge conversations", "Structured property knowledge catalogue", "Guest recommendations and service discovery"],
    status: "implemented",
    statusLabel: "Implemented capability",
  },
  {
    id: "automation",
    name: "Workflow automation",
    pillar: "Intelligence",
    summary: "Coordinate operational workflows and notifications around platform events.",
    details: ["Workflow and event-driven automation foundations", "Operational notifications", "Approval and monitoring surfaces"],
    status: "configuration-dependent",
    statusLabel: "Configuration dependent",
  },
  {
    id: "multi-property",
    name: "Multi-property management",
    pillar: "Administration",
    summary: "Organise properties under a wider hospitality organisation while preserving property-level context.",
    details: ["Organisation and property model", "Property-scoped access and configuration", "Consolidated management direction"],
    status: "configuration-dependent",
    statusLabel: "Deployment and configuration dependent",
  },
  {
    id: "payments",
    name: "Payment provider connectivity",
    pillar: "Financial control",
    summary: "Support a property-aware payment approach with provider configuration and payment lifecycle controls.",
    details: ["Payment workflows and payment records", "Provider integration endpoints", "Provider activation and reconciliation depend on deployment configuration"],
    status: "integration-dependent",
    statusLabel: "Provider integration dependent",
  },
  {
    id: "distribution",
    name: "Booking distribution connectivity",
    pillar: "Commercial",
    summary: "Connect direct booking and external demand channels through a controlled distribution layer.",
    details: ["Direct booking foundation", "Public Booking Network direction", "External channel synchronisation requires connector-specific implementation and verification"],
    status: "integration-dependent",
    statusLabel: "Connector dependent",
  },
  {
    id: "ecosystem",
    name: "Hospitality ecosystem integrations",
    pillar: "Connected ecosystem",
    summary: "Connect StayNas with specialist systems while keeping each product's responsibilities clear.",
    details: ["API and integration architecture", "Potential F&B connection with LexiBite", "Availability depends on the specific integration being implemented and enabled"],
    status: "planned",
    statusLabel: "Ecosystem roadmap",
  },
];

export const STAYNAS_PILLARS = [
  { name: "Commercial", description: "Reservations, availability and distribution." },
  { name: "Guest experience", description: "Guest profiles, digital check-in and concierge." },
  { name: "Property operations", description: "Front desk, rooms, housekeeping and tasks." },
  { name: "Financial control", description: "Reservation financials, payments and revenue visibility." },
  { name: "Intelligence", description: "Property knowledge, AI assistance and workflow automation." },
  { name: "Administration", description: "Organisation, properties, roles and governance." },
] as const;
