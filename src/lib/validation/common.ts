/**
 * Shared validation primitives.
 *
 * Normalisation happens here, at the edge, so the rest of the application only
 * ever sees canonical values: emails lowercased, phone numbers in E.164,
 * strings trimmed and length-bounded.
 */
import { z } from 'zod';

/** Every free-text field is bounded; unbounded text is a storage DoS. */
export const shortText = (max = 200) => z.string().trim().min(1).max(max);
export const optionalShortText = (max = 200) =>
  z.string().trim().max(max).optional().or(z.literal('')).transform((v) => (v ? v : undefined));
export const longText = (max = 10_000) => z.string().trim().min(1).max(max);
export const optionalLongText = (max = 10_000) =>
  z.string().trim().max(max).optional().or(z.literal('')).transform((v) => (v ? v : undefined));

export const uuid = z.string().uuid('Must be a valid identifier.');

export const email = z
  .string()
  .trim()
  .min(3)
  .max(254)
  .email('Enter a valid email address.')
  .transform((v) => v.toLowerCase());

/**
 * Kenyan mobile numbers, normalised to E.164.
 *
 * Accepts the forms people actually type: 0712345678, 712345678,
 * 254712345678, +254 712 345 678. Safaricom/Airtel/Telkom prefixes all begin
 * 7 or 1 after the country code.
 */
export const kenyanPhone = z
  .string()
  .trim()
  .transform((raw) => raw.replace(/[\s()-]/g, ''))
  .refine((v) => /^(\+?254|0)?[71]\d{8}$/.test(v), {
    message: 'Enter a valid Kenyan phone number, e.g. 0712 345 678.',
  })
  .transform((v) => {
    const digits = v.replace(/^\+/, '');
    if (digits.startsWith('254')) return `+${digits}`;
    if (digits.startsWith('0')) return `+254${digits.slice(1)}`;
    return `+254${digits}`;
  });

export const optionalKenyanPhone = kenyanPhone.optional().or(z.literal('')).transform((v) => (v ? v : undefined));

/** Currency amounts are integers in minor units. Never floats. */
export const moneyMinor = z
  .number()
  .int('Amount must be a whole number of cents.')
  .nonnegative('Amount cannot be negative.')
  .max(1_000_000_000_00, 'Amount is unrealistically large.');

export const positiveMoneyMinor = moneyMinor.refine((v) => v > 0, 'Amount must be greater than zero.');

export const currencyCode = z.string().length(3).toUpperCase().default('KES');

/** Query-string numbers arrive as strings; coerce then bound. */
export const pagination = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type Pagination = z.infer<typeof pagination>;

export const offsetFor = (p: Pagination) => (p.page - 1) * p.pageSize;

export const sortDirection = z.enum(['asc', 'desc']).default('desc');

/** Comma-separated query lists: ?skills=excel,sql */
export const csvList = (max = 20) =>
  z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => {
      if (v === undefined) return [] as string[];
      const parts = Array.isArray(v) ? v : v.split(',');
      return parts.map((s) => s.trim()).filter(Boolean).slice(0, max);
    });

export const isoDate = z.coerce.date();

export const futureDate = isoDate.refine((d) => d.getTime() > Date.now(), 'Date must be in the future.');

/**
 * A URL a user supplied. Restricted to http(s) so `javascript:` and `data:`
 * can never reach an href, and length-bounded.
 */
export const safeUrl = z
  .string()
  .trim()
  .max(2000)
  .url('Enter a valid URL starting with https://')
  .refine((v) => {
    try {
      const proto = new URL(v).protocol;
      return proto === 'https:' || proto === 'http:';
    } catch {
      return false;
    }
  }, 'Only http and https links are allowed.');

export const optionalSafeUrl = safeUrl.optional().or(z.literal('')).transform((v) => (v ? v : undefined));

export const skillLevel = z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT']);
export const evidenceLevel = z.enum(['SELF_REPORTED', 'AI_INFERRED', 'SIMULATION_VERIFIED', 'EMPLOYER_VERIFIED']);
export const workArrangement = z.enum(['REMOTE', 'HYBRID', 'ONSITE', 'ANY']);
export const employmentType = z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'ATTACHMENT', 'CASUAL', 'GIG']);
export const educationLevel = z.enum(['NONE', 'PRIMARY', 'SECONDARY', 'CERTIFICATE', 'DIPLOMA', 'BACHELORS', 'MASTERS', 'DOCTORATE']);
export const employmentStatus = z.enum([
  'UNEMPLOYED', 'UNDEREMPLOYED', 'EMPLOYED_FULL_TIME', 'EMPLOYED_PART_TIME',
  'SELF_EMPLOYED', 'STUDENT', 'CASUAL_WORKER',
]);
export const ageBracket = z.enum(['18-24', '25-34', '35-44', '45-54', '55+']);
export const incomePeriod = z.enum(['HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'PER_TASK']);
export const internetAccess = z.enum(['NONE', 'OCCASIONAL', 'MOBILE_DATA', 'BROADBAND']);
export const locale = z.enum(['en', 'sw']);

/** ISO 639-1 codes the platform currently supports for worker languages. */
export const languageCode = z.enum(['en', 'sw', 'so', 'ki', 'luo', 'kam', 'guz', 'mer', 'fr', 'ar']);

export const rating = z.number().int().min(1).max(5);
export const score100 = z.number().int().min(0).max(100);
