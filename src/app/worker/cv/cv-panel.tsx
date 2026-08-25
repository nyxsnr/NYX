'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api-client';
import { AiDisclosure, Alert, Card, EvidenceBadge, Field } from '@/components/ui';

interface CvSkill {
  name: string;
  skillSlug: string | null;
  level: string | null;
  confidence: number;
  sourceQuote: string | null;
}

interface CvAnalysis {
  summary: string;
  totalYearsExperience: number | null;
  education: Array<{ institution: string; qualification: string; startYear: number | null; endYear: number | null }>;
  experience: Array<{ employer: string; role: string; startDate: string | null; endDate: string | null; isCurrent: boolean; sourceQuote: string | null }>;
  skills: CvSkill[];
  certifications: string[];
  observations: string[];
  extractionConfidence: number;
}

interface AnalyseResult {
  parseState: string;
  analysis: CvAnalysis | null;
  skillsApplied?: number;
  message?: string;
  disclosure?: string;
}

export function CvPanel({
  documents,
}: {
  documents: Array<{ id: string; parseState: string; parsed: unknown; createdAt: string; fileName: string | null; parseError: string | null }>;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<'paste' | 'upload'>('paste');
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyseResult | null>(null);

  const latest = documents[0];
  const existing = (latest?.parsed && typeof latest.parsed === 'object' && 'skills' in latest.parsed
    ? (latest.parsed as CvAnalysis)
    : null);
  const shown = result?.analysis ?? existing;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);

    try {
      if (mode === 'paste') {
        setResult(await api.post<AnalyseResult>('/api/worker/cv/text', { text }));
      } else {
        if (!file) {
          setError('Choose a file first.');
          setBusy(false);
          return;
        }
        const formData = new FormData();
        formData.set('file', file);
        setResult(await api.upload<AnalyseResult>('/api/worker/cv', formData));
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not analyse your CV. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="mb-4 flex gap-2">
          {(
            [
              ['paste', 'Paste text'],
              ['upload', 'Upload a file'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
              className={`tap rounded-lg border px-4 py-2 text-sm font-semibold ${
                mode === value ? 'border-jade-600 bg-jade-50 text-jade-800 dark:bg-jade-950 dark:text-jade-100' : ''
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-4">
          {mode === 'paste' ? (
            <Field
              label="Paste your CV"
              htmlFor="cv-text"
              hint="Copy it from WhatsApp, a document, or anywhere else. Plain text is fine — formatting does not matter."
            >
              <textarea
                id="cv-text"
                className="textarea"
                rows={12}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={'Grace Wanjiru\nNairobi | 0712 345 678 | grace@example.com\n\nEXPERIENCE\nCustomer Service Agent at Jumia Kenya, 2022 - present\n- Handled 60+ customer enquiries daily by chat and phone\n\nEDUCATION\nDiploma in Business Administration, KIM, 2019 - 2021\n\nSKILLS\nCustomer support, Excel, Kiswahili, data entry'}
              />
            </Field>
          ) : (
            <Field
              label="Upload your CV"
              htmlFor="cv-file"
              hint="PDF, Word or plain text, up to 5 MB. Automatic extraction currently reads .txt files; other formats are stored for employers to download."
            >
              <input
                id="cv-file"
                type="file"
                accept=".pdf,.doc,.docx,.txt"
                className="input py-2"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </Field>
          )}

          {error ? <Alert tone="danger">{error}</Alert> : null}

          <button type="submit" className="btn btn-primary" disabled={busy || (mode === 'paste' && text.trim().length < 80)}>
            {busy ? 'Reading your CV…' : 'Analyse my CV'}
          </button>
        </form>
      </Card>

      {result?.message ? <Alert tone="warning">{result.message}</Alert> : null}

      {shown ? (
        <>
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">What we read</h2>
              <span className="text-sm text-muted">
                Confidence {Math.round(shown.extractionConfidence * 100)}%
              </span>
            </div>
            <p className="mt-2 text-sm text-secondary">{shown.summary}</p>

            {shown.observations.length > 0 ? (
              <div className="mt-4">
                <h3 className="text-sm font-semibold">Worth fixing</h3>
                <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-secondary">
                  {shown.observations.map((observation) => (
                    <li key={observation}>{observation}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>

          {shown.skills.length > 0 ? (
            <Card>
              <h2 className="text-lg font-semibold">Skills we found</h2>
              <p className="mt-1 text-sm text-secondary">
                These have been added to your profile as AI-assessed. Each one shows the line it came
                from, so you can check we read you correctly.
              </p>
              <ul className="mt-4 space-y-3">
                {shown.skills.map((skill) => (
                  <li key={skill.name} className="border-l-2 border-jade-300 pl-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{skill.name}</span>
                      {skill.level ? <span className="text-xs text-muted">{skill.level.toLowerCase()}</span> : null}
                      <EvidenceBadge level="AI_INFERRED" />
                    </div>
                    {skill.sourceQuote ? (
                      <p className="mt-1 text-sm italic text-muted">&ldquo;{skill.sourceQuote}&rdquo;</p>
                    ) : (
                      <p className="mt-1 text-sm text-muted">Inferred from your overall background.</p>
                    )}
                  </li>
                ))}
              </ul>
              <AiDisclosure />
              <Link href="/worker/simulations" className="btn btn-primary mt-4">
                Prove these with a work simulation
              </Link>
            </Card>
          ) : null}

          {shown.experience.length > 0 ? (
            <Card>
              <h2 className="text-lg font-semibold">Experience we found</h2>
              <ul className="mt-3 space-y-3">
                {shown.experience.map((role, index) => (
                  <li key={`${role.employer}-${index}`}>
                    <p className="font-medium">{role.role}</p>
                    <p className="text-sm text-secondary">
                      {role.employer}
                      {role.startDate ? ` · ${role.startDate}${role.isCurrent ? ' – present' : role.endDate ? ` – ${role.endDate}` : ''}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
