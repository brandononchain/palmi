'use client';

import { useState, useTransition } from 'react';

import { submitInstitutionalInquiry } from '../actions';
import { trackLandingEvent } from './FunnelTracking';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const PROGRAM_TYPES = [
  { value: 'university', label: 'University' },
  { value: 'accelerator', label: 'Accelerator' },
  { value: 'cohort', label: 'Cohort' },
  { value: 'community', label: 'Community' },
  { value: 'other', label: 'Other' },
] as const;

export function InstitutionalInquiryForm() {
  const [website, setWebsite] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [workEmail, setWorkEmail] = useState('');
  const [programType, setProgramType] = useState<(typeof PROGRAM_TYPES)[number]['value']>('cohort');
  const [cohortSize, setCohortSize] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedOrg = organizationName.trim();
    const trimmedEmail = workEmail.trim().toLowerCase();
    if (trimmedOrg.length < 2) {
      setError('Add the organization or program name.');
      return;
    }
    if (!EMAIL_RE.test(trimmedEmail)) {
      setError('Use a valid work email.');
      return;
    }

    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set('website', website.trim());
      fd.set('organizationName', trimmedOrg);
      fd.set('workEmail', trimmedEmail);
      fd.set('programType', programType);
      fd.set('cohortSize', cohortSize.trim());
      fd.set('note', note.trim());
      fd.set('source', 'pricing-programs');
      fd.set('company', '');

      const res = await submitInstitutionalInquiry(fd);
      if (res.ok) {
        void trackLandingEvent('institutional_lead_submitted', 'pricing-programs', {
          programType,
          cohortSize: cohortSize.trim() || null,
        });
        setSuccessMessage(
          res.message ?? 'Thanks. We’ll reach out about a program setup that fits your group.'
        );
        setDone(true);
      } else {
        setError(res.error ?? 'Something went wrong.');
      }
    });
  };

  if (done) {
    return (
      <div className="institutional-success form-success show" role="status">
        {successMessage}
      </div>
    );
  }

  return (
    <>
      <form className="institutional-form" onSubmit={submit} noValidate>
        <div className="waitlist-honeypot" aria-hidden="true">
          <label htmlFor="company-programs">Company</label>
          <input
            id="company-programs"
            type="text"
            name="company"
            tabIndex={-1}
            autoComplete="off"
          />
        </div>

        <div className="institutional-grid">
          <label className="institutional-field">
            <span>Website</span>
            <input
              type="url"
              className="input institutional-input"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://example.org"
              disabled={pending}
              autoComplete="url"
            />
          </label>

          <label className="institutional-field">
            <span>Organization or program</span>
            <input
              className="input institutional-input"
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              placeholder="northwestern founders lab"
              disabled={pending}
              required
            />
          </label>

          <label className="institutional-field">
            <span>Work email</span>
            <input
              type="email"
              className="input institutional-input"
              value={workEmail}
              onChange={(e) => setWorkEmail(e.target.value)}
              placeholder="you@program.org"
              disabled={pending}
              required
            />
          </label>

          <label className="institutional-field">
            <span>Program type</span>
            <select
              className="input institutional-input institutional-select"
              value={programType}
              onChange={(e) => setProgramType(e.target.value as typeof programType)}
              disabled={pending}
            >
              {PROGRAM_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </label>

          <label className="institutional-field institutional-field-full">
            <span>Approximate size</span>
            <input
              className="input institutional-input"
              value={cohortSize}
              onChange={(e) => setCohortSize(e.target.value)}
              placeholder="40 founders / 200 students / 12 fellows"
              disabled={pending}
            />
          </label>
        </div>

        <label className="institutional-field institutional-field-full">
          <span>What kind of experience do you want to run?</span>
          <textarea
            className="institutional-textarea"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Tell us how your program works, who needs to connect, and what you want Palmi to hold together."
            disabled={pending}
            rows={5}
          />
        </label>

        <div className="institutional-actions">
          <p className="institutional-footnote">
            This goes to the Palmi team directly, not the public waitlist.
          </p>
          <button type="submit" className="btn" disabled={pending}>
            {pending ? 'Sending' : 'Request a program setup'}
          </button>
        </div>
      </form>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
    </>
  );
}
