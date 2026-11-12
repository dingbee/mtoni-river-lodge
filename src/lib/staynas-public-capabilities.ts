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
    details: ["Capture reservations from direct and staff-assisted booking journeys, with the selected property and accommodation context attached to each record.", "Review availability and reservation details before confirming, amending or cancelling a booking.", "Keep guest identity, dates, room allocation and booking status together instead of scattering them across disconnected records.", "Carry a confirmed reservation forward into arrival preparation, front-desk work and the financial workflow.", "Give teams a clearer view of upcoming arrivals, in-house stays and departures so the next action is visible."],
    status: "implemented",
    statusLabel: "Implemented capability",
  },
  {
    id: "property",
    name: "Property, rooms & inventory",
    pillar: "Property operations",
    summary: "Configure properties, room categories, room inventory and guest-facing accommodation information.",
    details: ["Set up each property with its own room types, occupancy limits, accommodation descriptions and inventory.", "Organise individual rooms under the correct room category and property rather than treating inventory as one shared pool.", "Track room readiness and operational status as a stay moves from reservation to arrival, occupancy and departure.", "Support room assignment and changes with the reservation and guest context available to the operating team.", "Present accommodation information in a guest-facing catalogue so the room being sold is connected to the inventory being managed."],
    status: "implemented",
    statusLabel: "Implemented capability",
  },
  {
    id: "front-desk",
    name: "Front desk & digital check-in",
    pillar: "Guest experience",
    summary: "Connect pre-arrival information with reception review and arrival handling.",
    details: ["Collect pre-arrival guest information through a digital check-in journey, reducing repeated form filling at reception.", "Give front-desk teams a working view of expected arrivals, reservation details and guest records.", "Issue and verify arrival passes where the configured guest journey supports them.", "Coordinate arrival handling with room allocation and readiness so reception can see operational dependencies.", "Keep check-in and check-out activity connected to the reservation record and the wider stay lifecycle."],
    status: "implemented",
    statusLabel: "Implemented capability",
  },
  {
    id: "housekeeping",
    name: "Housekeeping & inspections",
    pillar: "Property operations",
    summary: "Coordinate room cleaning, task execution, inspections and operational exceptions.",
    details: ["Create and assign housekeeping work against specific rooms, with clear task ownership.", "Move work through operational states so teams can distinguish rooms awaiting service, being cleaned and ready for inspection.", "Use inspection checklists to support consistent room-quality checks before a room is released for arrival.", "Surface maintenance needs, failed checks and readiness exceptions instead of allowing them to disappear in informal handovers.", "Connect housekeeping progress to room status, helping reception make better-informed allocation and arrival decisions."],
    status: "implemented",
    statusLabel: "Implemented capability",
  },
  {
    id: "guest",
    name: "Guest profiles & intelligence",
    pillar: "Guest experience",
    summary: "Maintain guest context, stay history and service signals that support more considered hospitality.",
    details: ["Maintain a guest profile connected to reservations and stay history, giving teams one place to understand the relationship.", "Retrieve relevant guest and contact details during reservation handling, arrival and service interactions.", "Preserve useful preference and service context where it has been collected and is appropriate to the guest relationship.", "Help staff recognise returning guests and understand previous stay context without relying on personal notebooks or memory.", "Give authorised teams a more consistent guest view across the property workflow, subject to role and property access."],
    status: "implemented",
    statusLabel: "Implemented capability",
  },
  {
    id: "finance",
    name: "Finance & revenue visibility",
    pillar: "Financial control",
    summary: "Bring reservation financials and property performance indicators into management workflows.",
    details: ["Review financial information in the context of the reservation and guest stay rather than as an isolated amount.", "Track payment records and outstanding balances to support front-desk and finance follow-up.", "Keep payment activity distinct from folio charges and adjustments, preserving a clearer transaction trail.", "Support invoice and reconciliation workflows with reservation-linked financial context.", "Monitor commercial indicators such as average daily rate and revenue per available room to inform management review."],
    status: "implemented",
    statusLabel: "Implemented capability",
  },
  {
    id: "ai-concierge",
    name: "AI concierge & property knowledge",
    pillar: "Intelligence",
    summary: "Give guests access to assistance grounded in the information published by their property.",
    details: ["Give guests a conversational way to ask about property facilities, services, policies and practical stay information.", "Ground answers in the property knowledge published for that property, rather than presenting a generic hotel chatbot.", "Organise property information into structured knowledge that can be maintained as services, hours and guest guidance change.", "Help guests discover relevant facilities and services during the stay, reducing repetitive questions to reception.", "Keep AI configuration and governance within the platform administration boundary, with guest-facing assistance separated from founder-level controls."],
    status: "implemented",
    statusLabel: "Implemented capability",
  },
  {
    id: "automation",
    name: "Workflow automation",
    pillar: "Intelligence",
    summary: "Coordinate operational workflows and notifications around platform events.",
    details: ["Coordinate recurring and event-triggered operational work around defined events and workflow ownership.", "Route notifications to the appropriate operational role when a task, exception or approval needs attention.", "Make approval points explicit for actions that should not execute without an authorised decision.", "Give teams a clearer view of workflow progress and exceptions requiring intervention.", "Automation behaviour depends on the configured workflow, connected services and permissions for each deployment."],
    status: "configuration-dependent",
    statusLabel: "Configuration dependent",
  },
  {
    id: "multi-property",
    name: "Multi-property management",
    pillar: "Administration",
    summary: "Organise properties under a wider hospitality organisation while preserving property-level context.",
    details: ["Represent a hospitality organisation and its properties within a structured tenant and property model.", "Keep property identity, local settings and operational context distinct when teams work across more than one location.", "Scope staff access and day-to-day activity to the appropriate organisation and property boundaries.", "Support central oversight while preserving the operational independence and configuration of each property.", "Group-level reporting and cross-property workflows depend on the modules and permissions enabled for the organisation."],
    status: "configuration-dependent",
    statusLabel: "Deployment and configuration dependent",
  },
  {
    id: "payments",
    name: "Payment provider connectivity",
    pillar: "Financial control",
    summary: "Support a property-aware payment approach with provider configuration and payment lifecycle controls.",
    details: ["Represent payment activity as part of the guest and reservation financial lifecycle.", "Support property-aware provider configuration rather than assuming one payment account or currency for every property.", "Separate payment initiation, provider response and subsequent financial posting so each step can be reconciled.", "Retain transaction references and outcomes needed for operational follow-up and duplicate-control mechanisms.", "Live payment methods, settlement behaviour and reconciliation depend on the payment provider, credentials and deployment-specific verification."],
    status: "integration-dependent",
    statusLabel: "Provider integration dependent",
  },
  {
    id: "distribution",
    name: "Booking distribution connectivity",
    pillar: "Commercial",
    summary: "Connect direct booking and external demand channels through a controlled distribution layer.",
    details: ["Present a direct booking journey that connects guest enquiries and reservation capture to the selected property.", "Keep room and rate context aligned with the property inventory and pricing configuration used by the booking flow.", "Provide an architectural path for connecting external demand and distribution channels through defined adapters.", "Treat channel mapping, availability synchronisation, rate updates and booking delivery as explicit connector responsibilities.", "External OTA and channel-manager connectivity must be implemented, configured and verified per provider before it is marketed as live."],
    status: "integration-dependent",
    statusLabel: "Connector dependent",
  },
  {
    id: "ecosystem",
    name: "Hospitality ecosystem integrations",
    pillar: "Connected ecosystem",
    summary: "Connect StayNas with specialist systems while keeping each product's responsibilities clear.",
    details: ["Connect specialist hospitality systems through defined API and event contracts instead of tightly coupling every product to the core platform.", "Make ownership of key records explicit so integrations do not create competing sources of truth.", "Support durable transaction references, delivery outcomes and reconciliation paths for connected workflows.", "Allow integrations to be enabled for the relevant tenant and property with credentials and permissions managed deliberately.", "Specific connectors, including F&B/POS workflows, require their own implementation, commercial configuration and end-to-end verification before being represented as available."],
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
