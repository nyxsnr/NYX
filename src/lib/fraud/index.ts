/**
 * Fraud and trust heuristics.
 *
 * Everything here produces an ADVISORY flag for a human reviewer. Nothing in
 * this module bans, suspends or rejects anyone. That is a deliberate product
 * constraint: the people this platform serves cannot afford to be locked out
 * of their income by a false positive, and an automated ban on a livelihood
 * platform is a harm in its own right.
 *
 * Rules are deterministic and explainable; the model-based check in AIService
 * is a second opinion layered on top, not a replacement.
 */

export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface FraudSignal {
  rule: string;
  severity: Severity;
  reason: string;
  evidence?: string;
}

export interface FraudAssessment {
  riskScore: number;
  signals: FraudSignal[];
  /** What a human should do. Never "ban". */
  recommendation: 'NO_ACTION' | 'MONITOR' | 'REVIEW' | 'URGENT_REVIEW';
  summary: string;
}

const SEVERITY_WEIGHT: Record<Severity, number> = { LOW: 8, MEDIUM: 20, HIGH: 35, CRITICAL: 55 };

function assess(signals: FraudSignal[], subject: string): FraudAssessment {
  const riskScore = Math.min(100, signals.reduce((acc, s) => acc + SEVERITY_WEIGHT[s.severity], 0));

  // A single CRITICAL signal escalates on its own. Advance-fee demands and
  // credential requests are the patterns that actually cost people money, and
  // they must not have to accumulate alongside lesser signals to be seen.
  const hasCritical = signals.some((s) => s.severity === 'CRITICAL');

  return {
    riskScore,
    signals,
    recommendation:
      hasCritical || riskScore >= 70
        ? 'URGENT_REVIEW'
        : riskScore >= 40
          ? 'REVIEW'
          : riskScore >= 15
            ? 'MONITOR'
            : 'NO_ACTION',
    summary: signals.length
      ? `${signals.length} signal(s) raised on this ${subject}. Flagged for human review; no automatic action has been taken.`
      : `No fraud signals on this ${subject}.`,
  };
}

// ---------------------------------------------------------------------------
// Job and task posting checks — protecting workers from scams
// ---------------------------------------------------------------------------

/** Patterns that characterise employment scams targeting job seekers. */
const POSTING_RULES: Array<{ rule: string; pattern: RegExp; severity: Severity; reason: string }> = [
  {
    rule: 'advance_fee',
    pattern: /\b(registration|application|processing|training|placement)\s+fee\b|\bpay\s+(a\s+)?(ksh?|kes)?\s?\d/i,
    severity: 'CRITICAL',
    reason: 'Asks the worker to pay to access work. This is the defining pattern of employment scams and is never legitimate.',
  },
  {
    rule: 'credential_request',
    pattern: /\b(m-?pesa\s*pin|your\s+password|bank\s+(pin|password)|send\s+(your\s+)?(id|passport|kra\s*pin)\s+(to|via))\b/i,
    severity: 'CRITICAL',
    reason: 'Requests credentials or identity documents outside the platform verification flow.',
  },
  {
    rule: 'offplatform_push',
    pattern: /\b(whatsapp\s+(me|us)|telegram|dm\s+me|text\s+me\s+on|call\s+me\s+on)\s*\+?\d|contact\s+us\s+on\s+\+?254/i,
    severity: 'HIGH',
    reason: 'Pushes contact off-platform before any agreement, which removes payment protection and traceability.',
  },
  {
    rule: 'unrealistic_earnings',
    pattern: /\b(earn|make)\s+(up\s+to\s+)?(ksh?|kes)?\s?\d{2,3},?\d{3}\s+(per\s+)?(day|daily|week)\b|\b(quick|easy|fast)\s+money\b/i,
    severity: 'HIGH',
    reason: 'Advertises implausible earnings.',
  },
  {
    rule: 'no_experience_high_pay',
    pattern: /no\s+experience\s+(needed|required)[\s\S]{0,120}(ksh?|kes)\s?\d{2,3},?\d{3}/i,
    severity: 'MEDIUM',
    reason: 'Pairs "no experience needed" with unusually high pay, a common lure.',
  },
  {
    rule: 'link_shortener',
    pattern: /\b(bit\.ly|tinyurl\.com|t\.co|is\.gd|shorturl|cutt\.ly|rb\.gy)\b/i,
    severity: 'MEDIUM',
    reason: 'Contains a shortened link that hides its destination.',
  },
  {
    rule: 'suspicious_tld',
    pattern: /https?:\/\/[^\s]+\.(xyz|top|click|work|tk|ml|ga|cf)\b/i,
    severity: 'MEDIUM',
    reason: 'Links to a domain on a top-level domain heavily used for phishing.',
  },
  {
    rule: 'urgency_pressure',
    pattern: /\b(apply\s+now\s+before|limited\s+slots|first\s+come\s+first\s+served|today\s+only|urgent(ly)?\s+needed)\b/i,
    severity: 'LOW',
    reason: 'Uses artificial urgency to discourage scrutiny.',
  },
  {
    rule: 'all_caps_shouting',
    pattern: /\b[A-Z]{6,}\b(\s+\b[A-Z]{4,}\b){3,}/,
    severity: 'LOW',
    reason: 'Sustained block capitals, typical of low-quality bulk postings.',
  },
];

/** Requirements that are unlawful under Kenya's Employment Act 2007. */
const DISCRIMINATION_RULES: Array<{ rule: string; pattern: RegExp; reason: string }> = [
  { rule: 'discrimination_gender', pattern: /\b(males?\s+only|females?\s+only|ladies\s+only|gentlemen\s+only|preferably\s+(male|female))\b/i, reason: 'States a gender requirement.' },
  { rule: 'discrimination_age', pattern: /\b(aged?\s+(below|under|between)\s+\d{2}|must\s+be\s+under\s+\d{2}|young\s+(candidates?|applicants?)\s+only)\b/i, reason: 'States an age requirement.' },
  { rule: 'discrimination_marital', pattern: /\b(single\s+(only|preferred)|married\s+(only|preferred)|no\s+children)\b/i, reason: 'States a marital or family-status requirement.' },
  { rule: 'discrimination_ethnicity', pattern: /\b(from\s+(the\s+)?(kikuyu|luo|luhya|kalenjin|kamba|kisii|meru|somali|maasai)\s+community|tribe\s*:)/i, reason: 'States an ethnic requirement.' },
];

export function screenPosting(input: {
  title: string;
  description: string;
  companyVerificationTier: 'UNVERIFIED' | 'BASIC_VERIFIED' | 'BUSINESS_VERIFIED';
  employerPostingCountLast24h: number;
  employerAccountAgeDays: number;
  hasSalaryRange: boolean;
}): FraudAssessment {
  const text = `${input.title}\n${input.description}`;
  const signals: FraudSignal[] = [];

  for (const rule of POSTING_RULES) {
    const match = rule.pattern.exec(text);
    if (match) {
      signals.push({ rule: rule.rule, severity: rule.severity, reason: rule.reason, evidence: match[0].slice(0, 200) });
    }
  }

  for (const rule of DISCRIMINATION_RULES) {
    const match = rule.pattern.exec(text);
    if (match) {
      signals.push({
        rule: rule.rule,
        severity: 'HIGH',
        reason: `${rule.reason} Discriminatory requirements are unlawful under the Employment Act 2007.`,
        evidence: match[0].slice(0, 200),
      });
    }
  }

  if (input.companyVerificationTier === 'UNVERIFIED' && input.employerAccountAgeDays < 2) {
    signals.push({
      rule: 'new_unverified_employer',
      severity: 'MEDIUM',
      reason: 'Posted by an unverified employer account less than two days old.',
    });
  }

  if (input.employerPostingCountLast24h > 15) {
    signals.push({
      rule: 'bulk_posting',
      severity: 'MEDIUM',
      reason: `This employer has posted ${input.employerPostingCountLast24h} times in 24 hours.`,
    });
  }

  if (input.description.trim().length < 120) {
    signals.push({
      rule: 'thin_description',
      severity: 'LOW',
      reason: 'Description is too short for an applicant to judge whether the role is real.',
    });
  }

  return assess(signals, 'posting');
}

// ---------------------------------------------------------------------------
// Account checks — duplicate and automated registrations
// ---------------------------------------------------------------------------

export function screenAccount(input: {
  emailNormalized: string;
  phoneNormalized: string | null;
  signupIp: string | null;
  /** Other accounts sharing this IP, created recently. */
  accountsFromSameIpLast24h: number;
  /** Accounts whose email differs only by dots/plus-addressing. */
  similarEmailAccounts: number;
  /** Same phone number attached to another live account. */
  duplicatePhoneAccounts: number;
  userAgent: string | null;
  profileCompletedWithinSeconds: number | null;
}): FraudAssessment {
  const signals: FraudSignal[] = [];

  if (input.duplicatePhoneAccounts > 0) {
    signals.push({
      rule: 'duplicate_phone',
      severity: 'HIGH',
      reason: `This phone number is already attached to ${input.duplicatePhoneAccounts} other account(s).`,
    });
  }

  if (input.similarEmailAccounts > 0) {
    signals.push({
      rule: 'email_aliasing',
      severity: 'MEDIUM',
      reason: `${input.similarEmailAccounts} account(s) exist with an address that normalises to the same inbox.`,
    });
  }

  if (input.accountsFromSameIpLast24h >= 5) {
    signals.push({
      rule: 'ip_burst',
      severity: 'MEDIUM',
      // Deliberately mild: shared IPs are the norm at cyber cafés and on
      // mobile carrier NAT in Kenya, so this is weak evidence on its own.
      reason: `${input.accountsFromSameIpLast24h} accounts created from this IP in 24 hours. Note that shared connections are common and this is weak evidence alone.`,
    });
  }

  if (!input.userAgent || /^(curl|python|wget|go-http|axios|node-fetch)/i.test(input.userAgent)) {
    signals.push({
      rule: 'automated_client',
      severity: 'MEDIUM',
      reason: 'Registration did not come from a normal browser.',
      evidence: input.userAgent ?? '(no user agent)',
    });
  }

  if (input.profileCompletedWithinSeconds !== null && input.profileCompletedWithinSeconds < 8) {
    signals.push({
      rule: 'implausible_speed',
      severity: 'MEDIUM',
      reason: 'Full profile completed faster than a person could type it.',
    });
  }

  const domain = input.emailNormalized.split('@')[1] ?? '';
  const DISPOSABLE = ['mailinator.com', 'guerrillamail.com', 'tempmail.com', '10minutemail.com', 'yopmail.com', 'trashmail.com'];
  if (DISPOSABLE.includes(domain)) {
    signals.push({ rule: 'disposable_email', severity: 'MEDIUM', reason: 'Registered with a disposable email domain.' });
  }

  return assess(signals, 'account');
}

// ---------------------------------------------------------------------------
// Message checks — off-platform payment and phishing
// ---------------------------------------------------------------------------

const MESSAGE_RULES: Array<{ rule: string; pattern: RegExp; severity: Severity; reason: string }> = [
  {
    rule: 'offplatform_payment',
    pattern: /\b(pay\s+(me\s+)?(directly|outside|off\s*[- ]?platform)|send\s+(the\s+)?money\s+to\s+(my\s+)?(m-?pesa|till|paybill)|my\s+(m-?pesa|paybill|till)\s+(number\s+)?is)\b/i,
    severity: 'HIGH',
    reason: 'Attempts to move payment off-platform, which removes escrow protection for both sides.',
  },
  {
    rule: 'credential_phishing',
    pattern: /\b(send\s+(me\s+)?your\s+(password|pin|otp|code)|verify\s+your\s+account\s+at\s+http)/i,
    severity: 'CRITICAL',
    reason: 'Requests credentials or a one-time code.',
  },
  {
    rule: 'contact_before_agreement',
    pattern: /\b(\+254\s?\d{3}\s?\d{3}\s?\d{3}|07\d{2}\s?\d{3}\s?\d{3})\b/,
    severity: 'LOW',
    reason: 'Shares a phone number in chat.',
  },
  {
    rule: 'suspicious_link',
    pattern: /\b(bit\.ly|tinyurl\.com|t\.co|cutt\.ly)\b|https?:\/\/[^\s]+\.(xyz|top|tk|ml)\b/i,
    severity: 'MEDIUM',
    reason: 'Contains a shortened or low-reputation link.',
  },
];

export function screenMessage(input: {
  body: string;
  /** Contact details are normal once work is agreed; suspicious before. */
  hasAgreedWork: boolean;
  senderAccountAgeDays: number;
}): FraudAssessment {
  const signals: FraudSignal[] = [];

  for (const rule of MESSAGE_RULES) {
    const match = rule.pattern.exec(input.body);
    if (!match) continue;
    // Sharing a number after work is agreed is legitimate coordination.
    if (rule.rule === 'contact_before_agreement' && input.hasAgreedWork) continue;
    signals.push({ rule: rule.rule, severity: rule.severity, reason: rule.reason, evidence: match[0].slice(0, 120) });
  }

  if (input.senderAccountAgeDays < 1 && signals.length > 0) {
    signals.push({
      rule: 'new_account_risky_message',
      severity: 'MEDIUM',
      reason: 'Sent by an account less than a day old.',
    });
  }

  return assess(signals, 'message');
}

/** Redact phone numbers and emails from a message body before work is agreed. */
export function redactContactDetails(body: string): { redacted: string; wasRedacted: boolean } {
  const redacted = body
    .replace(/\b(\+254\s?\d{3}\s?\d{3}\s?\d{3}|07\d{2}\s?\d{3}\s?\d{3})\b/g, '[contact hidden]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]{2,}/g, '[contact hidden]');
  return { redacted, wasRedacted: redacted !== body };
}

// ---------------------------------------------------------------------------
// Submission checks — plagiarism-adjacent and empty-work detection
// ---------------------------------------------------------------------------

export function screenSubmission(input: {
  content: string;
  taskExpectedOutput: string;
  /** Similarity to other submissions on the same task, 0-1. */
  maxSimilarityToPeers: number;
  timeSpentMinutes: number | null;
  estimatedMinutes: number | null;
}): FraudAssessment {
  const signals: FraudSignal[] = [];

  if (input.content.trim().length < 40) {
    signals.push({ rule: 'empty_submission', severity: 'HIGH', reason: 'Submission contains almost no content.' });
  }

  if (input.maxSimilarityToPeers > 0.9) {
    signals.push({
      rule: 'near_duplicate_submission',
      severity: 'HIGH',
      reason: `Submission is ${Math.round(input.maxSimilarityToPeers * 100)}% similar to another worker's submission on the same task.`,
    });
  }

  if (
    input.timeSpentMinutes !== null &&
    input.estimatedMinutes !== null &&
    input.timeSpentMinutes < input.estimatedMinutes * 0.1
  ) {
    signals.push({
      rule: 'implausible_completion_time',
      severity: 'MEDIUM',
      reason: `Completed in ${input.timeSpentMinutes} minute(s) against an estimate of ${input.estimatedMinutes}.`,
    });
  }

  return assess(signals, 'submission');
}

/** Normalise an email so plus-addressing and Gmail dots collapse to one inbox. */
export function normalizeEmailForDuplicateCheck(email: string): string {
  const [localRaw, domain] = email.toLowerCase().trim().split('@');
  if (!localRaw || !domain) return email.toLowerCase().trim();
  let local = localRaw.split('+')[0] ?? localRaw;
  if (domain === 'gmail.com' || domain === 'googlemail.com') local = local.replace(/\./g, '');
  return `${local}@${domain}`;
}
