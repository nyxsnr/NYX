/**
 * Keyword index over the skill taxonomy.
 *
 * Generated from db/migrations/0010_reference_data.sql — the database remains
 * the source of truth. This module exists so that keyword matching (CV
 * extraction, capability inference, job-description drafting) can run
 * synchronously without a database round-trip per call.
 *
 * Regenerate with: npm run gen:skills
 */

export interface SkillKeywordEntry {
  slug: string;
  name: string;
  category: string;
  /** Name plus every alias, lowercased, used for substring matching. */
  keywords: string[];
}

export const SKILL_KEYWORDS: readonly SkillKeywordEntry[] = [
  { slug: 'ai-output-review', name: 'AI Output Review', category: 'AI & Data Work', keywords: ['ai output review', 'model evaluation', 'rlhf'] },
  { slug: 'content-moderation', name: 'Content Moderation', category: 'AI & Data Work', keywords: ['content moderation', 'moderation', 'trust and safety'] },
  { slug: 'data-annotation', name: 'Data Annotation', category: 'AI & Data Work', keywords: ['data annotation', 'labelling', 'labeling', 'tagging'] },
  { slug: 'prompt-writing', name: 'Prompt Writing', category: 'AI & Data Work', keywords: ['prompt writing', 'prompt engineering'] },
  { slug: 'quality-assurance', name: 'Quality Assurance', category: 'AI & Data Work', keywords: ['quality assurance', 'qa', 'quality control', 'qc'] },
  { slug: 'attention-to-detail', name: 'Attention to Detail', category: 'Communication', keywords: ['attention to detail', 'accuracy', 'thoroughness'] },
  { slug: 'english-proficiency', name: 'English Proficiency', category: 'Communication', keywords: ['english proficiency', 'english'] },
  { slug: 'problem-solving', name: 'Problem Solving', category: 'Communication', keywords: ['problem solving', 'critical thinking', 'analytical thinking'] },
  { slug: 'swahili-proficiency', name: 'Kiswahili Proficiency', category: 'Communication', keywords: ['kiswahili proficiency', 'swahili', 'kiswahili'] },
  { slug: 'teamwork', name: 'Teamwork', category: 'Communication', keywords: ['teamwork', 'collaboration'] },
  { slug: 'time-management', name: 'Time Management', category: 'Communication', keywords: ['time management', 'prioritisation', 'reliability'] },
  { slug: 'verbal-communication', name: 'Verbal Communication', category: 'Communication', keywords: ['verbal communication', 'spoken communication', 'presentation'] },
  { slug: 'written-communication', name: 'Written Communication', category: 'Communication', keywords: ['written communication', 'business writing'] },
  { slug: 'event-support', name: 'Event Support', category: 'Creative', keywords: ['event support', 'events', 'ushering'] },
  { slug: 'photography', name: 'Photography', category: 'Creative', keywords: ['photography', 'photo'] },
  { slug: 'call-centre', name: 'Call Centre Operations', category: 'Customer Support', keywords: ['call centre operations', 'call center', 'bpo', 'telephone support'] },
  { slug: 'complaint-handling', name: 'Complaint Handling', category: 'Customer Support', keywords: ['complaint handling', 'escalation handling', 'de-escalation'] },
  { slug: 'customer-support', name: 'Customer Support', category: 'Customer Support', keywords: ['customer support', 'customer service', 'client support', 'helpdesk'] },
  { slug: 'live-chat-support', name: 'Live Chat Support', category: 'Customer Support', keywords: ['live chat support', 'chat support'] },
  { slug: 'ticket-triage', name: 'Ticket Triage', category: 'Customer Support', keywords: ['ticket triage', 'ticket classification', 'queue management'] },
  { slug: 'data-analysis', name: 'Data Analysis', category: 'Data', keywords: ['data analysis', 'analytics', 'data analytics'] },
  { slug: 'data-entry-cleaning', name: 'Data Cleaning', category: 'Data', keywords: ['data cleaning', 'data cleansing', 'data scrubbing'] },
  { slug: 'data-visualisation', name: 'Data Visualisation', category: 'Data', keywords: ['data visualisation', 'dashboards', 'power bi', 'tableau'] },
  { slug: 'excel', name: 'Microsoft Excel', category: 'Data', keywords: ['microsoft excel', 'ms excel', 'spreadsheets', 'excel spreadsheets'] },
  { slug: 'google-sheets', name: 'Google Sheets', category: 'Data', keywords: ['google sheets', 'sheets'] },
  { slug: 'research', name: 'Research', category: 'Data', keywords: ['research', 'desk research', 'market research', 'web research'] },
  { slug: 'sql', name: 'SQL', category: 'Data', keywords: ['sql', 'postgres', 'mysql', 'queries'] },
  { slug: 'transcription', name: 'Transcription', category: 'Data', keywords: ['transcription', 'audio transcription', 'typing audio'] },
  { slug: 'adobe-illustrator', name: 'Adobe Illustrator', category: 'Design', keywords: ['adobe illustrator', 'illustrator'] },
  { slug: 'adobe-photoshop', name: 'Adobe Photoshop', category: 'Design', keywords: ['adobe photoshop', 'photoshop'] },
  { slug: 'brand-identity', name: 'Brand Identity', category: 'Design', keywords: ['brand identity', 'branding'] },
  { slug: 'canva', name: 'Canva', category: 'Design', keywords: ['canva'] },
  { slug: 'figma', name: 'Figma', category: 'Design', keywords: ['figma'] },
  { slug: 'graphic-design', name: 'Graphic Design', category: 'Design', keywords: ['graphic design', 'design', 'visual design'] },
  { slug: 'ui-ux-design', name: 'UI/UX Design', category: 'Design', keywords: ['ui/ux design', 'product design', 'user experience'] },
  { slug: 'training-delivery', name: 'Training Delivery', category: 'Education', keywords: ['training delivery', 'facilitation'] },
  { slug: 'tutoring', name: 'Tutoring', category: 'Education', keywords: ['tutoring', 'teaching', 'coaching'] },
  { slug: 'accounts-reconciliation', name: 'Reconciliation', category: 'Finance', keywords: ['reconciliation', 'bank reconciliation'] },
  { slug: 'bookkeeping', name: 'Bookkeeping', category: 'Finance', keywords: ['bookkeeping', 'book keeping', 'accounts'] },
  { slug: 'financial-reporting', name: 'Financial Reporting', category: 'Finance', keywords: ['financial reporting', 'management accounts'] },
  { slug: 'invoicing', name: 'Invoicing & Receivables', category: 'Finance', keywords: ['invoicing & receivables', 'billing', 'debt collection'] },
  { slug: 'payroll', name: 'Payroll', category: 'Finance', keywords: ['payroll'] },
  { slug: 'quickbooks', name: 'QuickBooks', category: 'Finance', keywords: ['quickbooks', 'quick books'] },
  { slug: 'caption-writing', name: 'Caption & Short Copy', category: 'Marketing', keywords: ['caption & short copy', 'captions', 'microcopy'] },
  { slug: 'content-calendar', name: 'Content Planning', category: 'Marketing', keywords: ['content planning', 'content calendar', 'editorial calendar'] },
  { slug: 'content-writing', name: 'Content Writing', category: 'Marketing', keywords: ['content writing', 'copywriting', 'blog writing', 'article writing'] },
  { slug: 'digital-marketing', name: 'Digital Marketing', category: 'Marketing', keywords: ['digital marketing', 'online marketing', 'performance marketing'] },
  { slug: 'email-marketing', name: 'Email Marketing', category: 'Marketing', keywords: ['email marketing', 'newsletter', 'mailchimp'] },
  { slug: 'seo', name: 'SEO', category: 'Marketing', keywords: ['seo', 'search engine optimisation', 'search engine optimization'] },
  { slug: 'social-analytics', name: 'Social Media Analytics', category: 'Marketing', keywords: ['social media analytics', 'engagement analysis'] },
  { slug: 'social-media-management', name: 'Social Media Management', category: 'Marketing', keywords: ['social media management', 'social media', 'smm', 'community management'] },
  { slug: 'video-editing', name: 'Video Editing', category: 'Marketing', keywords: ['video editing', 'capcut', 'premiere', 'reels editing'] },
  { slug: 'inventory-management', name: 'Inventory Management', category: 'Operations', keywords: ['inventory management', 'stock control'] },
  { slug: 'logistics-coordination', name: 'Logistics Coordination', category: 'Operations', keywords: ['logistics coordination', 'dispatch', 'fleet'] },
  { slug: 'operations-admin', name: 'Operations Administration', category: 'Operations', keywords: ['operations administration', 'office admin', 'administration'] },
  { slug: 'procurement', name: 'Procurement', category: 'Operations', keywords: ['procurement', 'purchasing', 'sourcing'] },
  { slug: 'project-coordination', name: 'Project Coordination', category: 'Operations', keywords: ['project coordination', 'project management', 'pm'] },
  { slug: 'cold-outreach', name: 'Cold Outreach', category: 'Sales', keywords: ['cold outreach', 'cold email', 'cold calling'] },
  { slug: 'crm-management', name: 'CRM Management', category: 'Sales', keywords: ['crm management', 'salesforce', 'hubspot', 'pipedrive'] },
  { slug: 'lead-generation', name: 'Lead Generation', category: 'Sales', keywords: ['lead generation', 'prospecting', 'lead gen'] },
  { slug: 'objection-handling', name: 'Objection Handling', category: 'Sales', keywords: ['objection handling', 'negotiation'] },
  { slug: 'sales', name: 'Sales', category: 'Sales', keywords: ['sales', 'selling', 'business development', 'bd'] },
  { slug: 'telesales', name: 'Telesales', category: 'Sales', keywords: ['telesales', 'phone sales'] },
  { slug: 'html-css', name: 'HTML & CSS', category: 'Software', keywords: ['html & css', 'html', 'css'] },
  { slug: 'it-support', name: 'IT Support', category: 'Software', keywords: ['it support', 'tech support', 'helpdesk it'] },
  { slug: 'javascript', name: 'JavaScript', category: 'Software', keywords: ['javascript', 'js', 'typescript'] },
  { slug: 'mobile-development', name: 'Mobile Development', category: 'Software', keywords: ['mobile development', 'android', 'flutter', 'react native'] },
  { slug: 'shopify', name: 'Shopify', category: 'Software', keywords: ['shopify', 'ecommerce store'] },
  { slug: 'web-development', name: 'Web Development', category: 'Software', keywords: ['web development', 'frontend', 'front-end', 'web dev'] },
  { slug: 'wordpress', name: 'WordPress', category: 'Software', keywords: ['wordpress', 'wp'] },
  { slug: 'calendar-management', name: 'Calendar & Scheduling', category: 'Virtual Assistance', keywords: ['calendar & scheduling', 'scheduling', 'diary management'] },
  { slug: 'data-entry', name: 'Data Entry', category: 'Virtual Assistance', keywords: ['data entry', 'typing', 'capture', 'encoding'] },
  { slug: 'document-preparation', name: 'Document Preparation', category: 'Virtual Assistance', keywords: ['document preparation', 'report formatting', 'minutes'] },
  { slug: 'email-management', name: 'Email Management', category: 'Virtual Assistance', keywords: ['email management', 'inbox management', 'inbox zero'] },
  { slug: 'travel-coordination', name: 'Travel Coordination', category: 'Virtual Assistance', keywords: ['travel coordination', 'travel booking'] },
  { slug: 'virtual-assistance', name: 'Virtual Assistance', category: 'Virtual Assistance', keywords: ['virtual assistance', 'va', 'executive assistant', 'personal assistant'] },
] as const;

/** Fast slug -> entry lookup. */
export const SKILL_BY_SLUG: ReadonlyMap<string, SkillKeywordEntry> = new Map(
  SKILL_KEYWORDS.map((s) => [s.slug, s]),
);

/** All distinct categories in taxonomy order. */
export const SKILL_CATEGORIES: readonly string[] = [
  ...new Set(SKILL_KEYWORDS.map((s) => s.category)),
];

/** Resolve free text to a taxonomy slug, or null when nothing matches. */
export function resolveSkillSlug(text: string): string | null {
  const needle = text.trim().toLowerCase();
  if (!needle) return null;
  const exact = SKILL_KEYWORDS.find((s) => s.keywords.includes(needle));
  if (exact) return exact.slug;
  const partial = SKILL_KEYWORDS.find((s) =>
    s.keywords.some((k) => k.length >= 4 && (needle.includes(k) || k.includes(needle))),
  );
  return partial?.slug ?? null;
}
