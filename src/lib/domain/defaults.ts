import type { Block, Category, Contact, RoutingRule } from "./schemas";

// PRD §5.1 categories with §6.3 closure windows. Subcategory priorities are a proposal awaiting
// owner approval (TODO.md); they are not an official hostel classification.
export const DEFAULT_CATEGORIES: Category[] = [
  {
    id: "mess",
    label: "Mess",
    description: "Food quality, hygiene, menu, timing",
    defaultPriority: "normal",
    closureWindowHours: 48,
    subcategories: [
      { id: "food-quality", label: "Food quality" },
      { id: "hygiene", label: "Hygiene", priority: "high" },
      { id: "menu", label: "Menu", priority: "low" },
      { id: "timing", label: "Timing", priority: "low" },
    ],
    active: true,
    order: 0,
  },
  {
    id: "canteen",
    label: "Canteen",
    description: "Food, pricing, cleanliness, service",
    defaultPriority: "normal",
    closureWindowHours: 48,
    subcategories: [
      { id: "food", label: "Food" },
      { id: "pricing", label: "Pricing", priority: "low" },
      { id: "cleanliness", label: "Cleanliness" },
      { id: "service", label: "Service", priority: "low" },
    ],
    active: true,
    order: 1,
  },
  {
    id: "infrastructure",
    label: "Infrastructure",
    description: "Room repairs, bathrooms, plumbing, electricity, furniture, Wi-Fi",
    defaultPriority: "normal",
    closureWindowHours: 72,
    subcategories: [
      { id: "room-repairs", label: "Room repairs" },
      { id: "bathrooms", label: "Bathrooms" },
      { id: "plumbing", label: "Plumbing or leak", priority: "high" },
      { id: "electricity", label: "Electrical fault" },
      {
        id: "electrical-hazard",
        label: "Electrical hazard (sparks, exposed wires)",
        priority: "critical",
      },
      { id: "furniture", label: "Furniture", priority: "low" },
      { id: "wifi", label: "Wi-Fi" },
    ],
    active: true,
    order: 2,
  },
  {
    id: "garden-cleanliness",
    label: "Garden & cleanliness",
    description: "Waste, pests, lawn, common-area cleanliness",
    defaultPriority: "normal",
    closureWindowHours: 48,
    subcategories: [
      { id: "waste", label: "Waste" },
      { id: "pests", label: "Pests", priority: "high" },
      { id: "lawn", label: "Lawn", priority: "low" },
      { id: "common-areas", label: "Common-area cleanliness" },
    ],
    active: true,
    order: 3,
  },
  {
    id: "water-utilities",
    label: "Water & utilities",
    description: "Drinking water, hot water, drainage, power",
    defaultPriority: "high",
    closureWindowHours: 24,
    subcategories: [
      { id: "no-drinking-water", label: "No drinking water", priority: "critical" },
      { id: "drinking-water", label: "Drinking water quality" },
      { id: "hot-water", label: "Hot water", priority: "normal" },
      { id: "drainage", label: "Drainage" },
      { id: "power-outage", label: "Power outage" },
    ],
    active: true,
    order: 4,
  },
  {
    id: "other",
    label: "Other",
    description: "Anything that doesn't fit another category",
    defaultPriority: "normal",
    closureWindowHours: 72,
    subcategories: [],
    active: true,
    order: 5,
  },
];

const FLOORS = [
  { id: "g", label: "Ground floor" },
  { id: "1", label: "First floor" },
  { id: "2", label: "Second floor" },
  { id: "3", label: "Third floor" },
];

// Development placeholders. The real hostel layout, contacts and numbers need owner approval.
export const DEV_BLOCKS: Block[] = ["A", "B", "C", "D"].map((b, i) => ({
  id: b.toLowerCase(),
  label: `Block ${b}`,
  floors: FLOORS,
  active: true,
  order: i,
}));

export const DEV_CONTACTS: Contact[] = [
  {
    id: "mess-committee",
    name: "Mess committee (dev placeholder)",
    role: "Mess and canteen",
    phone: "",
    email: "",
    emergency: false,
    active: true,
  },
  {
    id: "maintenance",
    name: "Hostel maintenance (dev placeholder)",
    role: "Repairs, plumbing, electrical, water",
    phone: "",
    email: "",
    emergency: false,
    active: true,
  },
  {
    id: "housekeeping",
    name: "Housekeeping (dev placeholder)",
    role: "Cleanliness, waste, garden",
    phone: "",
    email: "",
    emergency: false,
    active: true,
  },
  {
    id: "security",
    name: "Campus security (dev placeholder)",
    role: "Emergencies",
    phone: "0000000000",
    email: "",
    emergency: true,
    active: true,
  },
  {
    id: "health-centre",
    name: "Health centre (dev placeholder)",
    role: "Medical emergencies",
    phone: "0000000000",
    email: "",
    emergency: true,
    active: true,
  },
];

export const DEV_ROUTING: RoutingRule[] = [
  { id: "mess", categoryId: "mess", blockId: null, contactId: "mess-committee", enabled: true },
  {
    id: "canteen",
    categoryId: "canteen",
    blockId: null,
    contactId: "mess-committee",
    enabled: true,
  },
  {
    id: "infrastructure",
    categoryId: "infrastructure",
    blockId: null,
    contactId: "maintenance",
    enabled: true,
  },
  {
    id: "water",
    categoryId: "water-utilities",
    blockId: null,
    contactId: "maintenance",
    enabled: true,
  },
  {
    id: "cleanliness",
    categoryId: "garden-cleanliness",
    blockId: null,
    contactId: "housekeeping",
    enabled: true,
  },
  // "other" has no rule on purpose: it lands in the admin fallback queue.
];
