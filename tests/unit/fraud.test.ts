import { describe, expect, it } from 'vitest';
import {
  normalizeEmailForDuplicateCheck,
  redactContactDetails,
  screenAccount,
  screenMessage,
  screenPosting,
  screenSubmission,
} from '@/lib/fraud';

const legitimatePosting = {
  title: 'Customer Support Agent',
  description:
    'We are a Nairobi-based e-commerce company looking for a customer support agent to handle ' +
    'inbound enquiries by chat and email. You will resolve delivery issues, process returns and ' +
    'escalate technical problems. Training is provided. Reporting to the Support Team Lead.',
  companyVerificationTier: 'BUSINESS_VERIFIED' as const,
  employerPostingCountLast24h: 1,
  employerAccountAgeDays: 200,
  hasSalaryRange: true,
};

describe('posting screening', () => {
  it('passes a legitimate posting', () => {
    const result = screenPosting(legitimatePosting);
    expect(result.recommendation).toBe('NO_ACTION');
    expect(result.riskScore).toBe(0);
  });

  it('catches advance-fee scams as critical', () => {
    const result = screenPosting({
      ...legitimatePosting,
      description: `${legitimatePosting.description} A registration fee of KES 500 is required to apply.`,
    });
    expect(result.signals.some((s) => s.rule === 'advance_fee' && s.severity === 'CRITICAL')).toBe(true);
    expect(result.recommendation).toBe('URGENT_REVIEW');
  });

  it('catches requests for credentials', () => {
    const result = screenPosting({
      ...legitimatePosting,
      description: `${legitimatePosting.description} Send your ID to our agent via WhatsApp to proceed.`,
    });
    expect(result.signals.some((s) => s.rule === 'credential_request')).toBe(true);
  });

  it('flags unlawful discriminatory requirements and cites the law', () => {
    const result = screenPosting({
      ...legitimatePosting,
      description: `${legitimatePosting.description} Females only, aged below 30.`,
    });
    const rules = result.signals.map((s) => s.rule);
    expect(rules).toContain('discrimination_gender');
    expect(rules).toContain('discrimination_age');
    expect(result.signals.find((s) => s.rule === 'discrimination_gender')?.reason).toContain('Employment Act');
  });

  it('never recommends an automatic ban', () => {
    const result = screenPosting({
      ...legitimatePosting,
      description: 'Pay KES 2000 registration fee. Send your M-Pesa PIN. Earn 50,000 per day!',
    });
    expect(['NO_ACTION', 'MONITOR', 'REVIEW', 'URGENT_REVIEW']).toContain(result.recommendation);
    expect(JSON.stringify(result).toLowerCase()).not.toContain('ban');
  });

  it('quotes the evidence for each signal', () => {
    const result = screenPosting({
      ...legitimatePosting,
      description: `${legitimatePosting.description} A registration fee applies.`,
    });
    expect(result.signals[0]?.evidence).toBeTruthy();
  });
});

describe('account screening', () => {
  const clean = {
    emailNormalized: 'grace.wanjiru@gmail.com',
    phoneNormalized: '+254712345678',
    signupIp: '41.90.1.1',
    accountsFromSameIpLast24h: 1,
    similarEmailAccounts: 0,
    duplicatePhoneAccounts: 0,
    userAgent: 'Mozilla/5.0 (Linux; Android 11)',
    profileCompletedWithinSeconds: 240,
  };

  it('passes a normal signup', () => {
    expect(screenAccount(clean).recommendation).toBe('NO_ACTION');
  });

  it('flags a duplicate phone number', () => {
    const result = screenAccount({ ...clean, duplicatePhoneAccounts: 2 });
    expect(result.signals.some((s) => s.rule === 'duplicate_phone')).toBe(true);
  });

  it('treats shared IPs as weak evidence, acknowledging cyber cafes', () => {
    const result = screenAccount({ ...clean, accountsFromSameIpLast24h: 8 });
    const signal = result.signals.find((s) => s.rule === 'ip_burst');
    expect(signal?.severity).toBe('MEDIUM');
    expect(signal?.reason).toContain('weak evidence');
  });

  it('flags automated clients', () => {
    expect(screenAccount({ ...clean, userAgent: 'curl/8.0' }).signals.some((s) => s.rule === 'automated_client')).toBe(true);
  });
});

describe('message screening', () => {
  it('flags attempts to move payment off-platform', () => {
    const result = screenMessage({
      body: 'Just pay me directly, my M-Pesa number is 0712345678.',
      hasAgreedWork: true,
      senderAccountAgeDays: 30,
    });
    expect(result.signals.some((s) => s.rule === 'offplatform_payment')).toBe(true);
  });

  it('allows contact sharing once work is agreed', () => {
    const before = screenMessage({ body: 'Call me on 0712345678', hasAgreedWork: false, senderAccountAgeDays: 30 });
    const after = screenMessage({ body: 'Call me on 0712345678', hasAgreedWork: true, senderAccountAgeDays: 30 });
    expect(before.signals.some((s) => s.rule === 'contact_before_agreement')).toBe(true);
    expect(after.signals.some((s) => s.rule === 'contact_before_agreement')).toBe(false);
  });

  it('treats credential phishing as critical', () => {
    const result = screenMessage({
      body: 'Send me your password to verify your account',
      hasAgreedWork: false,
      senderAccountAgeDays: 100,
    });
    expect(result.signals.some((s) => s.severity === 'CRITICAL')).toBe(true);
  });
});

describe('submission screening', () => {
  it('flags near-duplicate submissions', () => {
    const result = screenSubmission({
      content: 'x'.repeat(500),
      taskExpectedOutput: 'A report',
      maxSimilarityToPeers: 0.97,
      timeSpentMinutes: 60,
      estimatedMinutes: 60,
    });
    expect(result.signals.some((s) => s.rule === 'near_duplicate_submission')).toBe(true);
  });

  it('flags an empty submission', () => {
    const result = screenSubmission({
      content: 'done',
      taskExpectedOutput: 'A report',
      maxSimilarityToPeers: 0,
      timeSpentMinutes: 30,
      estimatedMinutes: 60,
    });
    expect(result.signals.some((s) => s.rule === 'empty_submission')).toBe(true);
  });
});

describe('helpers', () => {
  it('collapses gmail aliases to one inbox', () => {
    expect(normalizeEmailForDuplicateCheck('Gr.ace+jobs@Gmail.com')).toBe('grace@gmail.com');
  });

  it('leaves other domains structurally intact', () => {
    expect(normalizeEmailForDuplicateCheck('a.b+x@company.co.ke')).toBe('a.b@company.co.ke');
  });

  it('redacts phone numbers and emails', () => {
    const { redacted, wasRedacted } = redactContactDetails('Reach me on 0712345678 or me@example.com');
    expect(wasRedacted).toBe(true);
    expect(redacted).not.toContain('0712345678');
    expect(redacted).not.toContain('me@example.com');
  });
});
