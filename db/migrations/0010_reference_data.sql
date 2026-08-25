-- ===========================================================================
-- 0010_reference_data
-- System reference data: the skill taxonomy and the human-authored simulation
-- templates. This is *not* demo data — production needs it. Demo users, jobs
-- and tasks are created separately by scripts/seed.ts.
-- ===========================================================================

INSERT INTO skills (slug, name, category, aliases, demand_score, description) VALUES
-- Customer Support
('customer-support','Customer Support','Customer Support','{"customer service","client support","helpdesk"}',88,'Resolving customer problems across chat, email and phone.'),
('complaint-handling','Complaint Handling','Customer Support','{"escalation handling","de-escalation"}',72,'Calming and resolving dissatisfied customers.'),
('ticket-triage','Ticket Triage','Customer Support','{"ticket classification","queue management"}',66,'Categorising and prioritising inbound support requests.'),
('live-chat-support','Live Chat Support','Customer Support','{"chat support"}',70,'Handling concurrent real-time customer conversations.'),
('call-centre','Call Centre Operations','Customer Support','{"call center","BPO","telephone support"}',80,'Working to call-centre scripts, quality and handling-time standards.'),
-- Virtual Assistance & Admin
('virtual-assistance','Virtual Assistance','Virtual Assistance','{"VA","executive assistant","personal assistant"}',85,'Remote administrative support for a client or executive.'),
('email-management','Email Management','Virtual Assistance','{"inbox management","inbox zero"}',74,'Triaging, organising and drafting responses in a busy inbox.'),
('calendar-management','Calendar & Scheduling','Virtual Assistance','{"scheduling","diary management"}',71,'Coordinating meetings, travel and priorities across time zones.'),
('data-entry','Data Entry','Virtual Assistance','{"typing","capture","encoding"}',82,'Accurate, fast entry of structured information.'),
('document-preparation','Document Preparation','Virtual Assistance','{"report formatting","minutes"}',60,'Producing clean, formatted documents, reports and minutes.'),
('travel-coordination','Travel Coordination','Virtual Assistance','{"travel booking"}',45,'Arranging itineraries, bookings and logistics.'),
-- Sales & Business Development
('sales','Sales','Sales','{"selling","business development","BD"}',86,'Moving prospects to a closed, paid decision.'),
('lead-generation','Lead Generation','Sales','{"prospecting","lead gen"}',79,'Identifying and qualifying potential customers.'),
('cold-outreach','Cold Outreach','Sales','{"cold email","cold calling"}',68,'Initiating contact with prospects who have not raised a hand.'),
('objection-handling','Objection Handling','Sales','{"negotiation"}',64,'Responding to price, timing and trust objections.'),
('crm-management','CRM Management','Sales','{"salesforce","hubspot","pipedrive"}',58,'Keeping pipeline data accurate and actionable.'),
('telesales','Telesales','Sales','{"phone sales"}',70,'Selling over the phone at volume.'),
-- Marketing & Social Media
('social-media-management','Social Media Management','Marketing','{"social media","SMM","community management"}',87,'Planning and running a brand presence across social platforms.'),
('content-writing','Content Writing','Marketing','{"copywriting","blog writing","article writing"}',81,'Writing clear, persuasive copy for a defined audience.'),
('caption-writing','Caption & Short Copy','Marketing','{"captions","microcopy"}',63,'Writing short-form copy that earns attention and action.'),
('content-calendar','Content Planning','Marketing','{"content calendar","editorial calendar"}',62,'Structuring what gets published, when and why.'),
('digital-marketing','Digital Marketing','Marketing','{"online marketing","performance marketing"}',77,'Running paid and organic acquisition channels.'),
('seo','SEO','Marketing','{"search engine optimisation","search engine optimization"}',69,'Improving organic search visibility.'),
('email-marketing','Email Marketing','Marketing','{"newsletter","mailchimp"}',59,'Designing and sending campaigns that convert.'),
('social-analytics','Social Media Analytics','Marketing','{"engagement analysis"}',55,'Reading engagement data and adjusting strategy.'),
('video-editing','Video Editing','Marketing','{"capcut","premiere","reels editing"}',74,'Cutting short-form and long-form video for publication.'),
-- Design
('graphic-design','Graphic Design','Design','{"design","visual design"}',78,'Producing visual work against a brief.'),
('canva','Canva','Design','{}',72,'Producing branded assets quickly in Canva.'),
('adobe-photoshop','Adobe Photoshop','Design','{"photoshop"}',61,'Raster image editing and composition.'),
('adobe-illustrator','Adobe Illustrator','Design','{"illustrator"}',52,'Vector illustration and logo work.'),
('figma','Figma','Design','{}',66,'Interface and product design in Figma.'),
('brand-identity','Brand Identity','Design','{"branding"}',54,'Building consistent visual identity systems.'),
('ui-ux-design','UI/UX Design','Design','{"product design","user experience"}',64,'Designing usable digital product interfaces.'),
-- Data
('data-entry-cleaning','Data Cleaning','Data','{"data cleansing","data scrubbing"}',80,'Finding and fixing errors in messy datasets.'),
('excel','Microsoft Excel','Data','{"ms excel","spreadsheets","excel spreadsheets"}',90,'Working with formulas, pivots and structured spreadsheets.'),
('google-sheets','Google Sheets','Data','{"sheets"}',84,'Collaborative spreadsheet modelling and reporting.'),
('data-analysis','Data Analysis','Data','{"analytics","data analytics"}',76,'Turning raw data into decisions.'),
('sql','SQL','Data','{"postgres","mysql","queries"}',67,'Querying relational databases.'),
('data-visualisation','Data Visualisation','Data','{"dashboards","power bi","tableau"}',58,'Presenting data so a decision-maker can act on it.'),
('research','Research','Data','{"desk research","market research","web research"}',73,'Structured gathering and synthesis of information.'),
('transcription','Transcription','Data','{"audio transcription","typing audio"}',75,'Converting audio into accurate written text.'),
-- AI & Data Work
('data-annotation','Data Annotation','AI & Data Work','{"labelling","labeling","tagging"}',83,'Labelling data to a specification for machine learning.'),
('content-moderation','Content Moderation','AI & Data Work','{"moderation","trust and safety"}',71,'Applying policy consistently to user-generated content.'),
('quality-assurance','Quality Assurance','AI & Data Work','{"QA","quality control","QC"}',69,'Checking output against a defined standard.'),
('prompt-writing','Prompt Writing','AI & Data Work','{"prompt engineering"}',57,'Instructing AI systems to produce reliable output.'),
('ai-output-review','AI Output Review','AI & Data Work','{"model evaluation","RLHF"}',60,'Judging and correcting machine-generated work.'),
-- Bookkeeping & Finance
('bookkeeping','Bookkeeping','Finance','{"book keeping","accounts"}',79,'Recording and classifying financial transactions.'),
('accounts-reconciliation','Reconciliation','Finance','{"bank reconciliation"}',65,'Matching records against statements and resolving differences.'),
('invoicing','Invoicing & Receivables','Finance','{"billing","debt collection"}',62,'Issuing invoices and chasing payment.'),
('quickbooks','QuickBooks','Finance','{"quick books"}',56,'Bookkeeping in QuickBooks.'),
('payroll','Payroll','Finance','{}',48,'Computing and processing staff payments and statutory deductions.'),
('financial-reporting','Financial Reporting','Finance','{"management accounts"}',50,'Producing periodic financial statements.'),
-- Software & Web
('web-development','Web Development','Software','{"frontend","front-end","web dev"}',75,'Building and shipping web interfaces.'),
('html-css','HTML & CSS','Software','{"html","css"}',66,'Structuring and styling web pages.'),
('javascript','JavaScript','Software','{"js","typescript"}',70,'Programming for the web.'),
('wordpress','WordPress','Software','{"wp"}',64,'Building and maintaining WordPress sites.'),
('shopify','Shopify','Software','{"ecommerce store"}',53,'Building and running online stores.'),
('mobile-development','Mobile Development','Software','{"android","flutter","react native"}',55,'Building mobile applications.'),
('it-support','IT Support','Software','{"tech support","helpdesk IT"}',68,'Diagnosing and fixing user technology problems.'),
-- Operations & Logistics
('project-coordination','Project Coordination','Operations','{"project management","PM"}',72,'Keeping deliverables, people and deadlines aligned.'),
('inventory-management','Inventory Management','Operations','{"stock control"}',61,'Tracking and controlling stock.'),
('procurement','Procurement','Operations','{"purchasing","sourcing"}',52,'Sourcing goods and services at good terms.'),
('logistics-coordination','Logistics Coordination','Operations','{"dispatch","fleet"}',58,'Coordinating movement of goods and people.'),
('operations-admin','Operations Administration','Operations','{"office admin","administration"}',70,'Running day-to-day business processes.'),
-- Communication & Language
('written-communication','Written Communication','Communication','{"business writing"}',85,'Writing clearly and appropriately for a professional audience.'),
('verbal-communication','Verbal Communication','Communication','{"spoken communication","presentation"}',80,'Explaining and persuading in speech.'),
('english-proficiency','English Proficiency','Communication','{"english"}',89,'Professional working proficiency in English.'),
('swahili-proficiency','Kiswahili Proficiency','Communication','{"swahili","kiswahili"}',76,'Professional working proficiency in Kiswahili.'),
('teamwork','Teamwork','Communication','{"collaboration"}',74,'Working effectively inside a team.'),
('time-management','Time Management','Communication','{"prioritisation","reliability"}',77,'Delivering on commitments on time.'),
('problem-solving','Problem Solving','Communication','{"critical thinking","analytical thinking"}',82,'Working out a sensible answer under uncertainty.'),
('attention-to-detail','Attention to Detail','Communication','{"accuracy","thoroughness"}',86,'Producing work without avoidable errors.'),
-- Teaching & Trades (large informal-sector segments in Kenya)
('tutoring','Tutoring','Education','{"teaching","coaching"}',63,'Teaching a subject one-to-one or in small groups.'),
('training-delivery','Training Delivery','Education','{"facilitation"}',49,'Designing and delivering training sessions.'),
('photography','Photography','Creative','{"photo"}',57,'Producing usable photographic work.'),
('event-support','Event Support','Creative','{"events","ushering"}',46,'Supporting the running of events.')
ON CONFLICT (slug) DO NOTHING;

-- ===========================================================================
-- Simulation templates.
--
-- Each template is a human-authored brief plus an explicit weighted rubric.
-- The AI generates a concrete instance from the scenario scaffold and scores
-- responses against the rubric — it never invents its own success criteria.
-- Rubric weights sum to 1.0 per template.
-- ===========================================================================

INSERT INTO simulation_templates
  (slug, title, category, description, scenario_template, rubric, response_format, difficulty, time_limit_minutes)
VALUES
('va-inbox-triage','Inbox Triage','Virtual Assistance',
 'Organise a cluttered inbox for a busy manager and explain your prioritisation.',
 '{"persona":"Executive assistant to a Nairobi SME operations manager","context":"14 unread emails arrived overnight","variables":["industry","urgency_mix","client_names"],"instructions":"Generate 8-12 realistic emails mixing urgent client issues, internal noise, invoices, newsletters and one genuine emergency."}'::jsonb,
 '[{"key":"prioritisation","label":"Prioritisation","description":"Urgent and important items are correctly identified above noise.","weight":0.35,"max_score":100},
   {"key":"reasoning","label":"Reasoning","description":"The explanation for the ordering is sound and business-aware.","weight":0.25,"max_score":100},
   {"key":"completeness","label":"Completeness","description":"Every email is handled or explicitly deferred; nothing is silently dropped.","weight":0.20,"max_score":100},
   {"key":"communication","label":"Written Communication","description":"Clear, professional, well-organised writing.","weight":0.20,"max_score":100}]'::jsonb,
 'TEXT','INTERMEDIATE',30),

('va-client-response','Client Email Response','Virtual Assistance',
 'Draft a professional reply to a client who is chasing a delayed deliverable.',
 '{"persona":"Virtual assistant for a small consultancy","context":"A client emails, frustrated, about a report that is three days late","variables":["client_tone","delay_reason","relationship_length"]}'::jsonb,
 '[{"key":"tone","label":"Tone","description":"Professional, warm and accountable without grovelling or blaming.","weight":0.30,"max_score":100},
   {"key":"accountability","label":"Accountability","description":"Takes clear ownership and commits to a specific, realistic date.","weight":0.30,"max_score":100},
   {"key":"clarity","label":"Clarity","description":"Short, unambiguous, easy to act on.","weight":0.25,"max_score":100},
   {"key":"grammar","label":"Grammar & Mechanics","description":"Free of spelling and grammatical errors.","weight":0.15,"max_score":100}]'::jsonb,
 'TEXT','BEGINNER',20),

('va-schedule-build','Weekly Schedule Build','Virtual Assistance',
 'Build a realistic weekly schedule from a list of competing commitments.',
 '{"persona":"Assistant to a manager with conflicting meetings","context":"11 commitments, some fixed, some movable, two in direct conflict","variables":["timezone_spread","fixed_count"]}'::jsonb,
 '[{"key":"conflict_resolution","label":"Conflict Resolution","description":"Genuine conflicts are spotted and resolved sensibly.","weight":0.35,"max_score":100},
   {"key":"structure","label":"Structure","description":"The schedule is readable and realistically paced with buffers.","weight":0.30,"max_score":100},
   {"key":"communication","label":"Communication","description":"Trade-offs and assumptions are explained.","weight":0.35,"max_score":100}]'::jsonb,
 'STRUCTURED','INTERMEDIATE',25),

('cs-difficult-customer','Difficult Customer','Customer Support',
 'Respond to an angry customer whose order failed, without over-promising.',
 '{"persona":"Support agent for a Kenyan e-commerce company","context":"Customer paid via M-Pesa, order never arrived, second time this month","variables":["anger_level","order_value","policy_constraints"]}'::jsonb,
 '[{"key":"empathy","label":"Empathy","description":"Acknowledges the customer''s frustration genuinely and early.","weight":0.25,"max_score":100},
   {"key":"resolution","label":"Resolution","description":"Offers a concrete next step within stated policy limits.","weight":0.30,"max_score":100},
   {"key":"accuracy","label":"Policy Accuracy","description":"Promises nothing the stated policy does not allow.","weight":0.25,"max_score":100},
   {"key":"communication","label":"Communication","description":"Clear, calm, professional language.","weight":0.20,"max_score":100}]'::jsonb,
 'TEXT','INTERMEDIATE',20),

('cs-ticket-classification','Ticket Classification','Customer Support',
 'Classify a batch of support tickets by category, priority and routing.',
 '{"persona":"Support triage agent","context":"15 inbound tickets of mixed type","variables":["category_set","priority_rules"],"instructions":"Include at least two ambiguous tickets that legitimately span categories."}'::jsonb,
 '[{"key":"accuracy","label":"Classification Accuracy","description":"Tickets land in the right category and priority.","weight":0.45,"max_score":100},
   {"key":"consistency","label":"Consistency","description":"Similar tickets are treated the same way throughout.","weight":0.30,"max_score":100},
   {"key":"edge_cases","label":"Edge Case Handling","description":"Ambiguous tickets are flagged with reasoning rather than guessed at.","weight":0.25,"max_score":100}]'::jsonb,
 'STRUCTURED','BEGINNER',20),

('sales-objection','Sales Objection Handling','Sales',
 'Respond to a prospect who says your product is too expensive.',
 '{"persona":"Sales representative for a Kenyan SaaS product","context":"Prospect is interested but says the price is beyond their budget","variables":["product_type","price_point","competitor_mentioned"]}'::jsonb,
 '[{"key":"discovery","label":"Discovery","description":"Probes the real objection instead of immediately discounting.","weight":0.30,"max_score":100},
   {"key":"value_framing","label":"Value Framing","description":"Reframes price against concrete value or cost of inaction.","weight":0.30,"max_score":100},
   {"key":"honesty","label":"Honesty","description":"Makes no false claims about the product or competitors.","weight":0.20,"max_score":100},
   {"key":"next_step","label":"Next Step","description":"Closes on a specific, low-friction next action.","weight":0.20,"max_score":100}]'::jsonb,
 'TEXT','INTERMEDIATE',20),

('sales-outreach','Cold Outreach Message','Sales',
 'Write a first-contact message to a named prospect.',
 '{"persona":"Business development representative","context":"Cold outreach to an SME owner who has never heard of you","variables":["industry","channel","prospect_role"]}'::jsonb,
 '[{"key":"relevance","label":"Relevance","description":"Message is specific to this prospect, not a generic blast.","weight":0.35,"max_score":100},
   {"key":"brevity","label":"Brevity","description":"Respects the reader''s time; earns the reply in few words.","weight":0.25,"max_score":100},
   {"key":"credibility","label":"Credibility","description":"Claims are plausible and unexaggerated.","weight":0.20,"max_score":100},
   {"key":"call_to_action","label":"Call to Action","description":"One clear, easy ask.","weight":0.20,"max_score":100}]'::jsonb,
 'TEXT','BEGINNER',15),

('sales-lead-qualification','Lead Qualification','Sales',
 'Qualify a list of inbound leads and justify which to pursue first.',
 '{"persona":"Sales development representative","context":"12 inbound leads of varying fit and budget signal","variables":["qualification_framework","lead_mix"]}'::jsonb,
 '[{"key":"judgement","label":"Judgement","description":"High-fit leads are correctly prioritised.","weight":0.40,"max_score":100},
   {"key":"framework","label":"Framework Use","description":"Applies a consistent qualification logic.","weight":0.30,"max_score":100},
   {"key":"reasoning","label":"Reasoning","description":"Explains disqualifications rather than discarding silently.","weight":0.30,"max_score":100}]'::jsonb,
 'STRUCTURED','INTERMEDIATE',25),

('smm-campaign-plan','Social Campaign Plan','Marketing',
 'Plan a two-week social campaign for a small business.',
 '{"persona":"Social media manager","context":"A Nairobi restaurant wants more weekday lunch customers","variables":["business_type","budget","platforms"]}'::jsonb,
 '[{"key":"strategy","label":"Strategy","description":"Plan is tied to the stated business objective, not vanity metrics.","weight":0.30,"max_score":100},
   {"key":"execution_detail","label":"Execution Detail","description":"Specific enough to actually run: cadence, formats, platforms.","weight":0.30,"max_score":100},
   {"key":"audience_fit","label":"Audience Fit","description":"Content suits the real local audience and platform norms.","weight":0.25,"max_score":100},
   {"key":"measurement","label":"Measurement","description":"Defines how success will be judged.","weight":0.15,"max_score":100}]'::jsonb,
 'STRUCTURED','INTERMEDIATE',35),

('smm-captions','Caption Writing','Marketing',
 'Write social captions for a set of posts in a defined brand voice.',
 '{"persona":"Content creator","context":"Five posts for one brand across two platforms","variables":["brand_voice","product","platform_mix"]}'::jsonb,
 '[{"key":"voice","label":"Brand Voice","description":"Captions consistently match the specified voice.","weight":0.30,"max_score":100},
   {"key":"hook","label":"Hook","description":"Opening lines earn attention.","weight":0.30,"max_score":100},
   {"key":"platform_fit","label":"Platform Fit","description":"Length, tone and format suit each platform.","weight":0.20,"max_score":100},
   {"key":"correctness","label":"Correctness","description":"Spelling, grammar and factual accuracy.","weight":0.20,"max_score":100}]'::jsonb,
 'TEXT','BEGINNER',20),

('smm-engagement-analysis','Engagement Analysis','Marketing',
 'Read a month of engagement data and recommend what to change.',
 '{"persona":"Social media analyst","context":"Four weeks of post-level performance data","variables":["metric_set","anomaly"]}'::jsonb,
 '[{"key":"interpretation","label":"Interpretation","description":"Reads the data correctly, including the anomaly.","weight":0.40,"max_score":100},
   {"key":"recommendations","label":"Recommendations","description":"Actions follow from the evidence presented.","weight":0.35,"max_score":100},
   {"key":"communication","label":"Communication","description":"Explained so a non-analyst owner can act.","weight":0.25,"max_score":100}]'::jsonb,
 'STRUCTURED','ADVANCED',30),

('design-brief-response','Design Brief Response','Design',
 'Respond to a client design brief with a concrete concept and rationale.',
 '{"persona":"Freelance graphic designer","context":"A client needs a poster for a community event","variables":["event_type","constraints","brand_colours"]}'::jsonb,
 '[{"key":"brief_adherence","label":"Brief Adherence","description":"Every stated constraint is respected.","weight":0.35,"max_score":100},
   {"key":"concept","label":"Concept Quality","description":"The idea is appropriate and not generic.","weight":0.30,"max_score":100},
   {"key":"rationale","label":"Rationale","description":"Design choices are justified against the audience.","weight":0.20,"max_score":100},
   {"key":"professionalism","label":"Professionalism","description":"Handles ambiguity by asking rather than assuming.","weight":0.15,"max_score":100}]'::jsonb,
 'TEXT','INTERMEDIATE',30),

('data-spreadsheet-clean','Spreadsheet Cleaning','Data',
 'Clean a messy customer dataset and document every change.',
 '{"persona":"Data assistant","context":"A 25-row customer export with duplicates, inconsistent phone formats, bad dates and blank fields","variables":["error_types","row_count"],"instructions":"Include at least one ambiguous record where the correct fix is genuinely unclear."}'::jsonb,
 '[{"key":"error_detection","label":"Error Detection","description":"Finds the seeded errors, including the subtle ones.","weight":0.35,"max_score":100},
   {"key":"correctness","label":"Correctness","description":"Fixes are right and introduce no new errors.","weight":0.30,"max_score":100},
   {"key":"documentation","label":"Documentation","description":"Changes are logged so the work is auditable.","weight":0.20,"max_score":100},
   {"key":"judgement","label":"Judgement","description":"Ambiguous records are flagged, not silently guessed.","weight":0.15,"max_score":100}]'::jsonb,
 'STRUCTURED','INTERMEDIATE',30),

('data-classification','Data Classification','Data',
 'Apply a classification specification consistently across a batch of records.',
 '{"persona":"Data annotator","context":"30 short records to classify against a 5-category spec","variables":["category_spec","ambiguity_rate"]}'::jsonb,
 '[{"key":"accuracy","label":"Accuracy","description":"Records match the specification.","weight":0.45,"max_score":100},
   {"key":"consistency","label":"Consistency","description":"The same rule is applied throughout.","weight":0.35,"max_score":100},
   {"key":"edge_cases","label":"Edge Cases","description":"Genuinely ambiguous records are escalated with reasoning.","weight":0.20,"max_score":100}]'::jsonb,
 'STRUCTURED','BEGINNER',25),

('data-error-detection','Error Detection','Data',
 'Find the errors in a prepared report before it goes to a client.',
 '{"persona":"Quality reviewer","context":"A short business report containing arithmetic, factual and formatting errors","variables":["error_count","report_type"]}'::jsonb,
 '[{"key":"detection_rate","label":"Detection Rate","description":"Proportion of seeded errors found.","weight":0.50,"max_score":100},
   {"key":"false_positives","label":"Precision","description":"Does not flag correct content as wrong.","weight":0.25,"max_score":100},
   {"key":"reporting","label":"Reporting","description":"Errors are described so someone else can fix them.","weight":0.25,"max_score":100}]'::jsonb,
 'STRUCTURED','ADVANCED',25),

('book-transaction-classification','Transaction Classification','Finance',
 'Classify a month of business transactions into the correct accounts.',
 '{"persona":"Bookkeeper for a small business","context":"20 transactions from an M-Pesa and bank statement","variables":["business_type","chart_of_accounts"]}'::jsonb,
 '[{"key":"accuracy","label":"Accuracy","description":"Transactions are posted to the right accounts.","weight":0.45,"max_score":100},
   {"key":"consistency","label":"Consistency","description":"Similar transactions are treated identically.","weight":0.25,"max_score":100},
   {"key":"queries","label":"Queries Raised","description":"Unclear items are queried rather than misposted.","weight":0.30,"max_score":100}]'::jsonb,
 'STRUCTURED','INTERMEDIATE',30),

('book-reconciliation','Account Reconciliation','Finance',
 'Reconcile a bank statement against the ledger and explain the differences.',
 '{"persona":"Accounts assistant","context":"A statement and ledger that differ by a specific amount","variables":["difference_causes"],"instructions":"Seed timing differences, one duplicate and one transposition error."}'::jsonb,
 '[{"key":"reconciliation","label":"Reconciliation","description":"The difference is fully explained and accounted for.","weight":0.45,"max_score":100},
   {"key":"method","label":"Method","description":"A systematic approach is used, not trial and error.","weight":0.30,"max_score":100},
   {"key":"communication","label":"Communication","description":"Findings are explained clearly to a non-accountant.","weight":0.25,"max_score":100}]'::jsonb,
 'STRUCTURED','ADVANCED',35),

('ai-annotation-quality','Annotation Quality Control','AI & Data Work',
 'Review another annotator''s labelled batch and correct it against the guidelines.',
 '{"persona":"QC reviewer on an AI data project","context":"25 labelled records, some incorrectly labelled","variables":["guideline_version","error_rate"]}'::jsonb,
 '[{"key":"detection","label":"Error Detection","description":"Incorrect labels are found.","weight":0.40,"max_score":100},
   {"key":"guideline_fidelity","label":"Guideline Fidelity","description":"Corrections follow the written guideline, not personal preference.","weight":0.35,"max_score":100},
   {"key":"feedback","label":"Feedback Quality","description":"Feedback would help the original annotator improve.","weight":0.25,"max_score":100}]'::jsonb,
 'STRUCTURED','INTERMEDIATE',30),

('research-prospect-list','Prospect Research','Data',
 'Research and compile a qualified list of potential customers.',
 '{"persona":"Research assistant","context":"Build a list of 10 qualified prospects for a stated offer","variables":["industry","geography","qualification_criteria"]}'::jsonb,
 '[{"key":"relevance","label":"Relevance","description":"Prospects genuinely fit the stated criteria.","weight":0.35,"max_score":100},
   {"key":"completeness","label":"Data Completeness","description":"Required fields are present for each entry.","weight":0.25,"max_score":100},
   {"key":"verifiability","label":"Verifiability","description":"Sources are cited and nothing is fabricated.","weight":0.25,"max_score":100},
   {"key":"structure","label":"Structure","description":"Output is usable as-is by a sales team.","weight":0.15,"max_score":100}]'::jsonb,
 'STRUCTURED','INTERMEDIATE',35),

('written-communication-brief','Professional Writing','Communication',
 'Turn a rambling set of notes into a clear one-page brief.',
 '{"persona":"Team member reporting upward","context":"Disorganised meeting notes that must become a decision-ready summary","variables":["topic","audience_seniority"]}'::jsonb,
 '[{"key":"clarity","label":"Clarity","description":"A busy reader gets the point immediately.","weight":0.35,"max_score":100},
   {"key":"structure","label":"Structure","description":"Logical organisation with the decision surfaced first.","weight":0.30,"max_score":100},
   {"key":"fidelity","label":"Fidelity","description":"Nothing important is lost or invented.","weight":0.20,"max_score":100},
   {"key":"mechanics","label":"Mechanics","description":"Grammar, spelling and formatting.","weight":0.15,"max_score":100}]'::jsonb,
 'TEXT','BEGINNER',25)
ON CONFLICT (slug) DO NOTHING;

-- Link templates to the skills they produce evidence for.
INSERT INTO simulation_template_skills (template_id, skill_id, weight)
SELECT t.id, s.id, m.weight
FROM (VALUES
  ('va-inbox-triage','email-management',1.0),   ('va-inbox-triage','virtual-assistance',0.8),
  ('va-inbox-triage','time-management',0.6),    ('va-inbox-triage','attention-to-detail',0.5),
  ('va-client-response','written-communication',1.0), ('va-client-response','customer-support',0.7),
  ('va-client-response','virtual-assistance',0.6),
  ('va-schedule-build','calendar-management',1.0), ('va-schedule-build','time-management',0.8),
  ('va-schedule-build','virtual-assistance',0.7),
  ('cs-difficult-customer','customer-support',1.0), ('cs-difficult-customer','complaint-handling',0.9),
  ('cs-difficult-customer','written-communication',0.6),
  ('cs-ticket-classification','ticket-triage',1.0), ('cs-ticket-classification','customer-support',0.7),
  ('cs-ticket-classification','attention-to-detail',0.6),
  ('sales-objection','objection-handling',1.0),  ('sales-objection','sales',0.9),
  ('sales-outreach','cold-outreach',1.0),        ('sales-outreach','content-writing',0.6),
  ('sales-outreach','sales',0.7),
  ('sales-lead-qualification','lead-generation',1.0), ('sales-lead-qualification','sales',0.7),
  ('smm-campaign-plan','social-media-management',1.0), ('smm-campaign-plan','content-calendar',0.8),
  ('smm-campaign-plan','digital-marketing',0.6),
  ('smm-captions','caption-writing',1.0),        ('smm-captions','content-writing',0.8),
  ('smm-captions','social-media-management',0.6),
  ('smm-engagement-analysis','social-analytics',1.0), ('smm-engagement-analysis','data-analysis',0.6),
  ('design-brief-response','graphic-design',1.0), ('design-brief-response','brand-identity',0.6),
  ('data-spreadsheet-clean','data-entry-cleaning',1.0), ('data-spreadsheet-clean','excel',0.8),
  ('data-spreadsheet-clean','attention-to-detail',0.8),
  ('data-classification','data-annotation',1.0), ('data-classification','attention-to-detail',0.7),
  ('data-error-detection','quality-assurance',1.0), ('data-error-detection','attention-to-detail',0.9),
  ('book-transaction-classification','bookkeeping',1.0), ('book-transaction-classification','excel',0.5),
  ('book-reconciliation','accounts-reconciliation',1.0), ('book-reconciliation','bookkeeping',0.8),
  ('ai-annotation-quality','quality-assurance',1.0), ('ai-annotation-quality','data-annotation',0.9),
  ('ai-annotation-quality','content-moderation',0.5),
  ('research-prospect-list','research',1.0),     ('research-prospect-list','lead-generation',0.7),
  ('research-prospect-list','data-entry',0.5),
  ('written-communication-brief','written-communication',1.0),
  ('written-communication-brief','problem-solving',0.6)
) AS m(template_slug, skill_slug, weight)
JOIN simulation_templates t ON t.slug = m.template_slug
JOIN skills s ON s.slug = m.skill_slug
ON CONFLICT DO NOTHING;
