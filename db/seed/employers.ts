/**
 * Demo employers, jobs and tasks.
 *
 * Sectors reflect where Kenyan SMEs actually hire: BPO and customer support,
 * e-commerce, logistics, agri-processing, fintech, hospitality, and the
 * growing data-annotation industry. Salaries are realistic bands, not
 * aspirational ones.
 */

export interface DemoEmployer {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  industry: string;
  sizeBracket: '1-10' | '11-50' | '51-200' | '201-500' | '500+';
  county: string;
  town: string;
  description: string;
  website?: string;
  verificationTier: 'UNVERIFIED' | 'BASIC_VERIFIED' | 'BUSINESS_VERIFIED';
}

export const DEMO_EMPLOYERS: DemoEmployer[] = [
  {
    companyName: 'Sokoni Online',
    contactName: 'Diana Kilonzo',
    email: 'demo-employer@example.com',
    phone: '+254733000001',
    industry: 'E-commerce',
    sizeBracket: '51-200',
    county: 'Nairobi',
    town: 'Industrial Area',
    description:
      'An online marketplace for household goods, serving customers across Kenya with next-day delivery in major towns.',
    website: 'https://example.com/sokoni',
    verificationTier: 'BUSINESS_VERIFIED',
  },
  {
    companyName: 'Pwani Hospitality Group',
    contactName: 'Salim Bakari',
    email: 'salim.bakari@demo.kazios.co.ke',
    phone: '+254733000002',
    industry: 'Hospitality',
    sizeBracket: '201-500',
    county: 'Mombasa',
    town: 'Nyali',
    description: 'Four coastal hotels and two restaurants, employing over 300 people across the coast.',
    verificationTier: 'BUSINESS_VERIFIED',
  },
  {
    companyName: 'Twiga Logistics',
    contactName: 'Michael Ndung’u',
    email: 'michael.ndungu@demo.kazios.co.ke',
    phone: '+254733000003',
    industry: 'Logistics',
    sizeBracket: '51-200',
    county: 'Nairobi',
    town: 'Embakasi',
    description: 'Last-mile delivery and warehousing for retailers and distributors in Nairobi and Mombasa.',
    verificationTier: 'BUSINESS_VERIFIED',
  },
  {
    companyName: 'Mavuno Agri Services',
    contactName: 'Caroline Jepkosgei',
    email: 'caroline.jepkosgei@demo.kazios.co.ke',
    phone: '+254733000004',
    industry: 'Agriculture',
    sizeBracket: '11-50',
    county: 'Uasin Gishu',
    town: 'Eldoret',
    description: 'Supplies seed, fertiliser and advisory services to smallholder farmers across the North Rift.',
    verificationTier: 'BASIC_VERIFIED',
  },
  {
    companyName: 'PesaLink Solutions',
    contactName: 'Anthony Mburu',
    email: 'anthony.mburu@demo.kazios.co.ke',
    phone: '+254733000005',
    industry: 'Fintech',
    sizeBracket: '11-50',
    county: 'Nairobi',
    town: 'Kilimani',
    description: 'Payment reconciliation software for Kenyan SMEs, integrating M-Pesa and bank feeds.',
    website: 'https://example.com/pesalink',
    verificationTier: 'BUSINESS_VERIFIED',
  },
  {
    companyName: 'Ziwa Data Works',
    contactName: 'Faith Atieno',
    email: 'faith.atieno@demo.kazios.co.ke',
    phone: '+254733000006',
    industry: 'Data services',
    sizeBracket: '51-200',
    county: 'Kisumu',
    town: 'Kisumu Central',
    description:
      'Data annotation and quality control for machine-learning teams, with a focus on East African languages.',
    verificationTier: 'BUSINESS_VERIFIED',
  },
  {
    companyName: 'Bidii Microfinance',
    contactName: 'Paul Kiptoo',
    email: 'paul.kiptoo@demo.kazios.co.ke',
    phone: '+254733000007',
    industry: 'Financial services',
    sizeBracket: '51-200',
    county: 'Nakuru',
    town: 'Nakuru Town',
    description: 'Group lending and business loans for traders and small enterprises in the Rift Valley.',
    verificationTier: 'BASIC_VERIFIED',
  },
  {
    companyName: 'Chapa Digital',
    contactName: 'Wendy Njoroge',
    email: 'wendy.njoroge@demo.kazios.co.ke',
    phone: '+254733000008',
    industry: 'Marketing agency',
    sizeBracket: '1-10',
    county: 'Nairobi',
    town: 'Westlands',
    description: 'A small agency running social media and content for restaurants, salons and clinics.',
    verificationTier: 'BASIC_VERIFIED',
  },
  {
    companyName: 'Kilimo Fresh Exports',
    contactName: 'George Wambua',
    email: 'george.wambua@demo.kazios.co.ke',
    phone: '+254733000009',
    industry: 'Agri-export',
    sizeBracket: '201-500',
    county: 'Machakos',
    town: 'Athi River',
    description: 'Packs and exports fresh produce to European markets, working with 2,000 outgrower farmers.',
    verificationTier: 'BUSINESS_VERIFIED',
  },
  {
    companyName: 'Rafiki Health Clinics',
    contactName: 'Dr Alice Wangui',
    email: 'alice.wangui@demo.kazios.co.ke',
    phone: '+254733000010',
    industry: 'Healthcare',
    sizeBracket: '11-50',
    county: 'Kiambu',
    town: 'Thika',
    description: 'A chain of six outpatient clinics serving families in Kiambu county.',
    verificationTier: 'UNVERIFIED',
  },
];

export interface DemoJob {
  company: string;
  title: string;
  category: string;
  description: string;
  responsibilities: string;
  county: string;
  town?: string;
  workArrangement: 'REMOTE' | 'HYBRID' | 'ONSITE' | 'ANY';
  employmentType: string;
  salaryMinKes: number;
  salaryMaxKes: number;
  salaryPeriod?: 'MONTHLY' | 'DAILY' | 'HOURLY';
  minEducation?: string;
  minYearsExperience: number;
  requiredSkills: string[];
  preferredSkills?: string[];
  openings?: number;
}

export const DEMO_JOBS: DemoJob[] = [
  { company: 'Sokoni Online', title: 'Customer Support Agent', category: 'Customer Support', description: 'Handle inbound customer enquiries by chat, email and phone. Resolve delivery issues, process returns and escalate technical problems to the right team. Full training is provided on our systems and policies.', responsibilities: 'Respond to customer enquiries within service level\nProcess returns and refunds within policy\nKeep accurate records of every contact\nEscalate issues you cannot resolve, with full context', county: 'Nairobi', town: 'Industrial Area', workArrangement: 'HYBRID', employmentType: 'FULL_TIME', salaryMinKes: 32_000, salaryMaxKes: 45_000, minEducation: 'SECONDARY', minYearsExperience: 1, requiredSkills: ['customer-support', 'written-communication', 'english-proficiency'], preferredSkills: ['complaint-handling', 'swahili-proficiency'], openings: 4 },
  { company: 'Sokoni Online', title: 'Warehouse Stores Assistant', category: 'Operations', description: 'Receive, record and dispatch stock at our Industrial Area warehouse. Accuracy matters more than speed here.', responsibilities: 'Receive and verify incoming deliveries\nMaintain accurate stock records\nPrepare orders for dispatch\nSupport monthly stock counts', county: 'Nairobi', town: 'Industrial Area', workArrangement: 'ONSITE', employmentType: 'FULL_TIME', salaryMinKes: 25_000, salaryMaxKes: 32_000, minYearsExperience: 1, requiredSkills: ['inventory-management', 'attention-to-detail'], openings: 2 },
  { company: 'Sokoni Online', title: 'Data Analyst', category: 'Data', description: 'Turn our order, delivery and returns data into reports the operations team can act on.', responsibilities: 'Build and maintain weekly operational reports\nInvestigate anomalies in delivery and returns data\nPresent findings to non-technical managers', county: 'Nairobi', workArrangement: 'HYBRID', employmentType: 'FULL_TIME', salaryMinKes: 80_000, salaryMaxKes: 120_000, minEducation: 'BACHELORS', minYearsExperience: 3, requiredSkills: ['data-analysis', 'sql', 'excel'], preferredSkills: ['data-visualisation'] },
  { company: 'Pwani Hospitality Group', title: 'Front Office Agent', category: 'Hospitality', description: 'Welcome guests, manage check-in and check-out, and handle guest requests at our Nyali property.', responsibilities: 'Manage guest arrivals and departures\nHandle guest requests and complaints\nMaintain accurate booking records', county: 'Mombasa', town: 'Nyali', workArrangement: 'ONSITE', employmentType: 'FULL_TIME', salaryMinKes: 30_000, salaryMaxKes: 42_000, minYearsExperience: 1, requiredSkills: ['customer-support', 'english-proficiency', 'verbal-communication'], preferredSkills: ['complaint-handling'], openings: 3 },
  { company: 'Pwani Hospitality Group', title: 'Social Media Coordinator', category: 'Marketing', description: 'Run the social channels for our four hotels — content planning, publishing and community management.', responsibilities: 'Plan and publish a monthly content calendar\nRespond to comments and direct messages daily\nReport on reach and engagement monthly', county: 'Mombasa', workArrangement: 'HYBRID', employmentType: 'FULL_TIME', salaryMinKes: 45_000, salaryMaxKes: 65_000, minYearsExperience: 2, requiredSkills: ['social-media-management', 'caption-writing', 'content-calendar'], preferredSkills: ['canva', 'social-analytics'] },
  { company: 'Pwani Hospitality Group', title: 'Accounts Assistant', category: 'Finance', description: 'Support the finance team with daily bookkeeping, supplier payments and reconciliation.', responsibilities: 'Post daily transactions\nReconcile supplier statements\nPrepare payment schedules', county: 'Mombasa', workArrangement: 'ONSITE', employmentType: 'FULL_TIME', salaryMinKes: 40_000, salaryMaxKes: 55_000, minEducation: 'DIPLOMA', minYearsExperience: 2, requiredSkills: ['bookkeeping', 'accounts-reconciliation', 'excel'] },
  { company: 'Twiga Logistics', title: 'Dispatch Coordinator', category: 'Operations', description: 'Coordinate daily deliveries across Nairobi — assigning riders, tracking progress and resolving failures.', responsibilities: 'Plan and assign daily delivery routes\nTrack deliveries and resolve failures\nReport daily performance', county: 'Nairobi', town: 'Embakasi', workArrangement: 'ONSITE', employmentType: 'FULL_TIME', salaryMinKes: 38_000, salaryMaxKes: 52_000, minYearsExperience: 2, requiredSkills: ['logistics-coordination', 'project-coordination', 'problem-solving'], openings: 2 },
  { company: 'Twiga Logistics', title: 'Customer Care Representative', category: 'Customer Support', description: 'Handle customer and merchant enquiries about deliveries, mostly by phone and WhatsApp.', responsibilities: 'Answer delivery enquiries promptly\nCoordinate with dispatch to resolve issues\nLog every contact accurately', county: 'Nairobi', workArrangement: 'ONSITE', employmentType: 'FULL_TIME', salaryMinKes: 28_000, salaryMaxKes: 38_000, minYearsExperience: 0, requiredSkills: ['customer-support', 'verbal-communication', 'swahili-proficiency'], openings: 5 },
  { company: 'Twiga Logistics', title: 'Warehouse Supervisor', category: 'Operations', description: 'Supervise a warehouse team of twelve, covering receiving, picking and dispatch.', responsibilities: 'Supervise daily warehouse operations\nMaintain stock accuracy\nManage staff rotas and safety compliance', county: 'Mombasa', workArrangement: 'ONSITE', employmentType: 'FULL_TIME', salaryMinKes: 50_000, salaryMaxKes: 70_000, minYearsExperience: 4, requiredSkills: ['inventory-management', 'operations-admin', 'teamwork'] },
  { company: 'Mavuno Agri Services', title: 'Field Sales Representative', category: 'Sales', description: 'Sell agricultural inputs to smallholder farmers across the North Rift. Includes significant travel.', responsibilities: 'Visit farmers and agro-dealers in your territory\nMeet monthly sales targets\nCollect and report field feedback', county: 'Uasin Gishu', town: 'Eldoret', workArrangement: 'ONSITE', employmentType: 'FULL_TIME', salaryMinKes: 35_000, salaryMaxKes: 60_000, minYearsExperience: 2, requiredSkills: ['sales', 'verbal-communication', 'swahili-proficiency'], preferredSkills: ['lead-generation'], openings: 3 },
  { company: 'Mavuno Agri Services', title: 'Stores Clerk', category: 'Operations', description: 'Manage input stock at our Eldoret depot.', responsibilities: 'Record stock movements\nConduct weekly counts\nFlag discrepancies immediately', county: 'Uasin Gishu', workArrangement: 'ONSITE', employmentType: 'FULL_TIME', salaryMinKes: 24_000, salaryMaxKes: 30_000, minYearsExperience: 1, requiredSkills: ['inventory-management', 'data-entry', 'attention-to-detail'] },
  { company: 'PesaLink Solutions', title: 'Customer Success Associate', category: 'Customer Support', description: 'Onboard new SME customers onto our reconciliation platform and support them through their first three months.', responsibilities: 'Run onboarding sessions with new customers\nResolve support tickets within service level\nFeed recurring problems back to product', county: 'Nairobi', town: 'Kilimani', workArrangement: 'HYBRID', employmentType: 'FULL_TIME', salaryMinKes: 55_000, salaryMaxKes: 75_000, minEducation: 'DIPLOMA', minYearsExperience: 2, requiredSkills: ['customer-support', 'written-communication', 'problem-solving'], preferredSkills: ['bookkeeping'] },
  { company: 'PesaLink Solutions', title: 'Junior Frontend Developer', category: 'Software', description: 'Build and maintain screens in our web application. You will be paired with a senior developer for your first three months.', responsibilities: 'Implement UI features from designs\nFix bugs reported by customers\nWrite tests for the code you ship', county: 'Nairobi', workArrangement: 'HYBRID', employmentType: 'FULL_TIME', salaryMinKes: 90_000, salaryMaxKes: 140_000, minYearsExperience: 1, requiredSkills: ['javascript', 'html-css', 'web-development'] },
  { company: 'PesaLink Solutions', title: 'Bookkeeping Support Specialist', category: 'Finance', description: 'Help SME customers get their books straight when they join the platform.', responsibilities: 'Review customer chart of accounts\nResolve reconciliation queries\nProduce clean opening balances', county: 'Nairobi', workArrangement: 'REMOTE', employmentType: 'CONTRACT', salaryMinKes: 60_000, salaryMaxKes: 85_000, minYearsExperience: 3, requiredSkills: ['bookkeeping', 'accounts-reconciliation', 'quickbooks'] },
  { company: 'Ziwa Data Works', title: 'Data Annotation Specialist', category: 'AI & Data Work', description: 'Label text and image data to written specifications for machine-learning customers. Kiswahili, Dholuo or Somali is a strong advantage.', responsibilities: 'Annotate data to the project specification\nFlag ambiguous cases rather than guessing\nMeet daily throughput and accuracy targets', county: 'Kisumu', workArrangement: 'REMOTE', employmentType: 'CONTRACT', salaryMinKes: 28_000, salaryMaxKes: 45_000, minYearsExperience: 0, requiredSkills: ['data-annotation', 'attention-to-detail'], preferredSkills: ['swahili-proficiency', 'quality-assurance'], openings: 12 },
  { company: 'Ziwa Data Works', title: 'Quality Control Reviewer', category: 'AI & Data Work', description: 'Review annotated batches against the guidelines and give feedback to annotators.', responsibilities: 'Sample and review annotated batches\nCorrect errors against the written guideline\nGive actionable feedback to annotators', county: 'Kisumu', workArrangement: 'REMOTE', employmentType: 'CONTRACT', salaryMinKes: 40_000, salaryMaxKes: 60_000, minYearsExperience: 1, requiredSkills: ['quality-assurance', 'data-annotation', 'written-communication'], openings: 3 },
  { company: 'Ziwa Data Works', title: 'Audio Transcriptionist (Kiswahili)', category: 'Data', description: 'Transcribe Kiswahili audio to written text at high accuracy.', responsibilities: 'Transcribe audio accurately\nApply the project style guide consistently\nMeet turnaround times', county: 'Kisumu', workArrangement: 'REMOTE', employmentType: 'GIG', salaryMinKes: 25_000, salaryMaxKes: 40_000, minYearsExperience: 0, requiredSkills: ['transcription', 'swahili-proficiency', 'attention-to-detail'], openings: 8 },
  { company: 'Bidii Microfinance', title: 'Loan Officer', category: 'Financial services', description: 'Manage a portfolio of group and individual borrowers in Nakuru, from appraisal through to collection.', responsibilities: 'Appraise loan applications\nMonitor repayment and follow up arrears\nGrow your portfolio within risk limits', county: 'Nakuru', workArrangement: 'ONSITE', employmentType: 'FULL_TIME', salaryMinKes: 35_000, salaryMaxKes: 55_000, minEducation: 'DIPLOMA', minYearsExperience: 1, requiredSkills: ['sales', 'verbal-communication', 'attention-to-detail'], openings: 4 },
  { company: 'Bidii Microfinance', title: 'Branch Administrator', category: 'Operations', description: 'Run the administrative side of our Nakuru branch.', responsibilities: 'Maintain branch records and filing\nSupport loan documentation\nCoordinate supplies and facilities', county: 'Nakuru', workArrangement: 'ONSITE', employmentType: 'FULL_TIME', salaryMinKes: 30_000, salaryMaxKes: 40_000, minYearsExperience: 2, requiredSkills: ['operations-admin', 'document-preparation', 'excel'] },
  { company: 'Chapa Digital', title: 'Content Writer', category: 'Marketing', description: 'Write blog posts, product copy and social content for our clients in food, beauty and healthcare.', responsibilities: 'Write to a brief and a deadline\nResearch topics properly before writing\nRevise based on client feedback', county: 'Nairobi', workArrangement: 'REMOTE', employmentType: 'CONTRACT', salaryMinKes: 45_000, salaryMaxKes: 70_000, minYearsExperience: 2, requiredSkills: ['content-writing', 'research', 'written-communication'], preferredSkills: ['seo'] },
  { company: 'Chapa Digital', title: 'Junior Graphic Designer', category: 'Design', description: 'Produce social and print assets for agency clients.', responsibilities: 'Design social posts to brand guidelines\nProduce print-ready artwork\nManage your own deadlines across clients', county: 'Nairobi', workArrangement: 'HYBRID', employmentType: 'FULL_TIME', salaryMinKes: 40_000, salaryMaxKes: 60_000, minYearsExperience: 1, requiredSkills: ['graphic-design', 'canva'], preferredSkills: ['adobe-photoshop', 'brand-identity'] },
  { company: 'Chapa Digital', title: 'Account Manager', category: 'Sales', description: 'Own client relationships and grow accounts across our agency portfolio.', responsibilities: 'Be the main point of contact for your clients\nBrief the delivery team accurately\nGrow accounts through additional services', county: 'Nairobi', workArrangement: 'HYBRID', employmentType: 'FULL_TIME', salaryMinKes: 60_000, salaryMaxKes: 90_000, minYearsExperience: 3, requiredSkills: ['sales', 'project-coordination', 'written-communication'] },
  { company: 'Kilimo Fresh Exports', title: 'Quality Control Officer', category: 'Operations', description: 'Inspect produce at our Athi River packhouse against export standards.', responsibilities: 'Inspect incoming produce against standards\nDocument rejections with clear reasons\nReport quality trends to management', county: 'Machakos', town: 'Athi River', workArrangement: 'ONSITE', employmentType: 'FULL_TIME', salaryMinKes: 35_000, salaryMaxKes: 48_000, minYearsExperience: 2, requiredSkills: ['quality-assurance', 'attention-to-detail', 'document-preparation'], openings: 2 },
  { company: 'Kilimo Fresh Exports', title: 'Outgrower Field Officer', category: 'Agriculture', description: 'Support our 2,000 outgrower farmers with agronomy advice and compliance.', responsibilities: 'Visit farmers on a scheduled rotation\nAdvise on agronomy and compliance\nRecord farm data accurately', county: 'Machakos', workArrangement: 'ONSITE', employmentType: 'FULL_TIME', salaryMinKes: 38_000, salaryMaxKes: 52_000, minEducation: 'DIPLOMA', minYearsExperience: 2, requiredSkills: ['verbal-communication', 'data-entry', 'swahili-proficiency'], openings: 3 },
  { company: 'Kilimo Fresh Exports', title: 'Export Documentation Clerk', category: 'Operations', description: 'Prepare and check export documentation for European shipments.', responsibilities: 'Prepare export documents accurately\nLiaise with clearing agents\nMaintain the documentation archive', county: 'Machakos', workArrangement: 'ONSITE', employmentType: 'FULL_TIME', salaryMinKes: 32_000, salaryMaxKes: 45_000, minYearsExperience: 1, requiredSkills: ['document-preparation', 'attention-to-detail', 'excel'] },
  { company: 'Rafiki Health Clinics', title: 'Front Desk Receptionist', category: 'Healthcare', description: 'Register patients, manage appointments and handle enquiries at our Thika clinic.', responsibilities: 'Register patients and manage the queue\nSchedule and confirm appointments\nHandle enquiries with discretion', county: 'Kiambu', town: 'Thika', workArrangement: 'ONSITE', employmentType: 'FULL_TIME', salaryMinKes: 25_000, salaryMaxKes: 33_000, minYearsExperience: 0, requiredSkills: ['customer-support', 'data-entry', 'swahili-proficiency'], openings: 2 },
  { company: 'Rafiki Health Clinics', title: 'Medical Billing Assistant', category: 'Finance', description: 'Prepare and follow up insurance claims for our six clinics.', responsibilities: 'Prepare accurate insurance claims\nFollow up outstanding claims\nReconcile payments received', county: 'Kiambu', workArrangement: 'ONSITE', employmentType: 'FULL_TIME', salaryMinKes: 35_000, salaryMaxKes: 48_000, minYearsExperience: 2, requiredSkills: ['invoicing', 'accounts-reconciliation', 'attention-to-detail'] },
  { company: 'Sokoni Online', title: 'Virtual Assistant to the Operations Director', category: 'Virtual Assistance', description: 'Support our Operations Director with inbox, scheduling and document preparation. Fully remote.', responsibilities: 'Triage and manage a busy inbox\nCoordinate a complex diary\nPrepare documents and meeting notes', county: 'Nairobi', workArrangement: 'REMOTE', employmentType: 'FULL_TIME', salaryMinKes: 50_000, salaryMaxKes: 70_000, minYearsExperience: 2, requiredSkills: ['virtual-assistance', 'email-management', 'calendar-management'], preferredSkills: ['document-preparation', 'time-management'] },
  { company: 'PesaLink Solutions', title: 'Sales Development Representative', category: 'Sales', description: 'Generate and qualify leads among Kenyan SMEs for our reconciliation product.', responsibilities: 'Research and build target lists\nRun outreach across email and phone\nQualify and hand over to account executives', county: 'Nairobi', workArrangement: 'HYBRID', employmentType: 'FULL_TIME', salaryMinKes: 45_000, salaryMaxKes: 75_000, minYearsExperience: 1, requiredSkills: ['lead-generation', 'cold-outreach', 'written-communication'], preferredSkills: ['crm-management'], openings: 2 },
  { company: 'Bidii Microfinance', title: 'Customer Data Clerk', category: 'Data', description: 'Digitise and maintain borrower records across our branch network.', responsibilities: 'Enter borrower records accurately\nClean and de-duplicate existing records\nFlag data quality issues', county: 'Nakuru', workArrangement: 'ONSITE', employmentType: 'CONTRACT', salaryMinKes: 24_000, salaryMaxKes: 32_000, minYearsExperience: 0, requiredSkills: ['data-entry', 'data-entry-cleaning', 'attention-to-detail'], openings: 3 },
];

export interface DemoTask {
  company: string;
  title: string;
  category: string;
  description: string;
  expectedOutput: string;
  qualityRequirements?: string;
  budgetKes: number;
  workersNeeded?: number;
  estimatedHours: number;
  requiresLaptop?: boolean;
  requiredSkills: string[];
  daysUntilDeadline?: number;
}

export const DEMO_TASKS: DemoTask[] = [
  { company: 'Sokoni Online', title: 'Clean 2,000 rows of customer data', category: 'Data', description: 'Our customer export has duplicates, inconsistent phone formats and several impossible dates. We need it cleaned to a written specification, with every change logged.', expectedOutput: 'A cleaned spreadsheet plus a change log listing every correction made and every record flagged as ambiguous.', qualityRequirements: 'No record deleted without being logged. Ambiguous records flagged, not guessed at.', budgetKes: 18_000, estimatedHours: 14, requiresLaptop: true, requiredSkills: ['data-entry-cleaning', 'excel', 'attention-to-detail'], daysUntilDeadline: 10 },
  { company: 'Sokoni Online', title: 'Categorise 500 product listings', category: 'Data', description: 'Assign each of 500 product listings to our category taxonomy, and flag anything that does not fit.', expectedOutput: 'A spreadsheet with a category assigned to every listing, and a separate tab of items needing a new category.', budgetKes: 9_000, workersNeeded: 2, estimatedHours: 8, requiresLaptop: true, requiredSkills: ['data-annotation', 'attention-to-detail'], daysUntilDeadline: 7 },
  { company: 'Sokoni Online', title: 'Write 40 product descriptions', category: 'Marketing', description: 'Write clear, honest product descriptions for 40 kitchen and home items. No exaggerated claims.', expectedOutput: '40 descriptions of 60-90 words each, supplied in a spreadsheet against the product codes.', budgetKes: 16_000, estimatedHours: 12, requiredSkills: ['content-writing', 'written-communication'], daysUntilDeadline: 14 },
  { company: 'Chapa Digital', title: 'Create 30 social media posts for a restaurant client', category: 'Marketing', description: 'Design 30 posts and write matching captions for a Nairobi restaurant. Brand guidelines and photos will be supplied.', expectedOutput: '30 post-ready images with captions, organised by publish date in a shared folder.', qualityRequirements: 'On-brand colours and fonts throughout. Captions proofread. No stock photos of food we do not serve.', budgetKes: 25_000, estimatedHours: 20, requiresLaptop: true, requiredSkills: ['graphic-design', 'caption-writing', 'canva'], daysUntilDeadline: 12 },
  { company: 'Chapa Digital', title: 'Build a 4-week content calendar for a beauty salon', category: 'Marketing', description: 'Plan four weeks of content across Instagram and TikTok for a Westlands salon aiming to fill weekday slots.', expectedOutput: 'A dated content plan with themes, formats, platforms and posting times, plus the reasoning for the approach.', budgetKes: 12_000, estimatedHours: 8, requiredSkills: ['content-calendar', 'social-media-management'], daysUntilDeadline: 8 },
  { company: 'Chapa Digital', title: 'Write 10 blog articles on personal finance', category: 'Marketing', description: 'Ten 800-word articles on saving, budgeting and small business finance for a Kenyan audience.', expectedOutput: 'Ten articles as separate documents, each with a suggested title and meta description.', qualityRequirements: 'Original writing only. Any figures cited must include a source.', budgetKes: 35_000, estimatedHours: 25, requiredSkills: ['content-writing', 'research', 'seo'], daysUntilDeadline: 21 },
  { company: 'Ziwa Data Works', title: 'Transcribe 50 Kiswahili audio files', category: 'Data', description: 'Fifty audio files, two to four minutes each, to be transcribed to our style guide.', expectedOutput: 'Fifty transcript files named to match the audio, following the supplied style guide.', qualityRequirements: '98% word accuracy. Inaudible sections marked, never guessed.', budgetKes: 22_000, workersNeeded: 3, estimatedHours: 18, requiresLaptop: true, requiredSkills: ['transcription', 'swahili-proficiency', 'attention-to-detail'], daysUntilDeadline: 9 },
  { company: 'Ziwa Data Works', title: 'Annotate 1,000 short text records', category: 'AI & Data Work', description: 'Apply our five-category sentiment specification to 1,000 short customer messages.', expectedOutput: 'A labelled dataset plus a list of records escalated as genuinely ambiguous.', qualityRequirements: 'Consistency matters more than speed. Escalate rather than guess.', budgetKes: 15_000, workersNeeded: 4, estimatedHours: 12, requiresLaptop: true, requiredSkills: ['data-annotation', 'attention-to-detail'], daysUntilDeadline: 6 },
  { company: 'Ziwa Data Works', title: 'Quality-check an annotated batch', category: 'AI & Data Work', description: 'Review 500 already-labelled records against the guideline and correct any errors.', expectedOutput: 'A corrected dataset, an error-rate report, and written feedback for the original annotators.', budgetKes: 11_000, estimatedHours: 8, requiresLaptop: true, requiredSkills: ['quality-assurance', 'data-annotation'], daysUntilDeadline: 5 },
  { company: 'PesaLink Solutions', title: 'Research 100 potential SME customers', category: 'Sales', description: 'Build a qualified list of 100 Kenyan SMEs in retail and distribution that match our target profile.', expectedOutput: 'A spreadsheet of 100 companies with contact name, role, email, phone, sector, size and the source for each.', qualityRequirements: 'Every entry must have a verifiable source. No invented contact details.', budgetKes: 20_000, workersNeeded: 2, estimatedHours: 16, requiresLaptop: true, requiredSkills: ['research', 'lead-generation', 'data-entry'], daysUntilDeadline: 11 },
  { company: 'PesaLink Solutions', title: 'Build a simple landing page for a new feature', category: 'Software', description: 'A single responsive landing page for our new reconciliation feature. Copy and design direction supplied.', expectedOutput: 'A deployed page with a shareable URL, working on mobile and on slow connections.', qualityRequirements: 'Loads in under 3 seconds on a 3G connection. Works on Android Chrome.', budgetKes: 30_000, estimatedHours: 16, requiresLaptop: true, requiredSkills: ['web-development', 'html-css'], daysUntilDeadline: 14 },
  { company: 'PesaLink Solutions', title: 'Reconcile three months of M-Pesa statements', category: 'Finance', description: 'Reconcile three months of M-Pesa till statements against our internal ledger and explain every difference.', expectedOutput: 'A reconciliation workbook with every difference identified, explained and categorised.', budgetKes: 24_000, estimatedHours: 15, requiresLaptop: true, requiredSkills: ['accounts-reconciliation', 'bookkeeping', 'excel'], daysUntilDeadline: 10 },
  { company: 'Twiga Logistics', title: 'Digitise 800 delivery notes', category: 'Data', description: 'Enter 800 scanned delivery notes into our template, capturing eight fields per note.', expectedOutput: 'A completed spreadsheet, plus a list of notes that were illegible or incomplete.', budgetKes: 14_000, workersNeeded: 3, estimatedHours: 12, requiresLaptop: true, requiredSkills: ['data-entry', 'attention-to-detail'], daysUntilDeadline: 8 },
  { company: 'Twiga Logistics', title: 'Analyse three months of delivery failure data', category: 'Data', description: 'Work out why deliveries fail and which routes and time slots are worst affected.', expectedOutput: 'A one-page report with findings and three concrete recommendations, plus the working spreadsheet.', budgetKes: 26_000, estimatedHours: 14, requiresLaptop: true, requiredSkills: ['data-analysis', 'excel'], daysUntilDeadline: 12 },
  { company: 'Pwani Hospitality Group', title: 'Produce 8 short-form videos for Instagram Reels', category: 'Marketing', description: 'Edit eight vertical videos from supplied hotel footage, each under 45 seconds.', expectedOutput: 'Eight exported vertical videos with captions burned in, ready to publish.', budgetKes: 28_000, estimatedHours: 18, requiresLaptop: true, requiredSkills: ['video-editing', 'social-media-management'], daysUntilDeadline: 15 },
  { company: 'Pwani Hospitality Group', title: 'Respond to 200 guest reviews', category: 'Customer Support', description: 'Draft individual replies to 200 guest reviews across booking platforms, following our tone guide.', expectedOutput: 'A spreadsheet with a drafted reply against each review, ready for approval.', qualityRequirements: 'No template replies. Each must address what the guest actually said.', budgetKes: 18_000, workersNeeded: 2, estimatedHours: 14, requiredSkills: ['customer-support', 'written-communication', 'complaint-handling'], daysUntilDeadline: 10 },
  { company: 'Mavuno Agri Services', title: 'Call 300 farmers to verify contact details', category: 'Customer Support', description: 'Phone 300 farmers on our list, confirm their details, and record the outcome of each call.', expectedOutput: 'An updated contact list with the outcome of every call recorded.', budgetKes: 16_000, workersNeeded: 2, estimatedHours: 20, requiredSkills: ['verbal-communication', 'swahili-proficiency', 'data-entry'], daysUntilDeadline: 9 },
  { company: 'Kilimo Fresh Exports', title: 'Categorise 12 months of supplier invoices', category: 'Finance', description: 'Classify a year of supplier invoices into our chart of accounts and flag anything unclear.', expectedOutput: 'A classified invoice schedule with a queries tab for anything you could not place confidently.', budgetKes: 20_000, estimatedHours: 14, requiresLaptop: true, requiredSkills: ['bookkeeping', 'excel', 'attention-to-detail'], daysUntilDeadline: 13 },
  { company: 'Rafiki Health Clinics', title: 'Design patient information leaflets', category: 'Design', description: 'Design four A5 patient leaflets on common conditions. Copy supplied, in English and Kiswahili.', expectedOutput: 'Four print-ready A5 PDFs plus editable source files.', budgetKes: 15_000, estimatedHours: 10, requiresLaptop: true, requiredSkills: ['graphic-design', 'canva'], daysUntilDeadline: 12 },
  { company: 'Bidii Microfinance', title: 'Clean and de-duplicate the borrower database', category: 'Data', description: 'Our borrower database has an estimated 400 duplicate records across five branches.', expectedOutput: 'A de-duplicated dataset, a merge log, and a list of near-matches you were unsure about.', qualityRequirements: 'Never merge two records without logging the evidence for the match.', budgetKes: 21_000, workersNeeded: 2, estimatedHours: 16, requiresLaptop: true, requiredSkills: ['data-entry-cleaning', 'excel', 'attention-to-detail'], daysUntilDeadline: 11 },
];
