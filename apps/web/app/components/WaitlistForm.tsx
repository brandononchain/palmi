'use client';

import { useState, useTransition } from 'react';
import { joinWaitlist } from '../actions';
import { trackLandingEvent } from './FunnelTracking';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function WaitlistForm({ source }: { source: 'hero' | 'cta' }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState(
    "Thanks. You're on the list — we'll be in touch when there's a spot for you."
  );
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const [started, setStarted] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!EMAIL_RE.test(trimmed)) {
      setError('That email looks off.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set('email', trimmed);
      fd.set('source', source);
      fd.set('company', '');
      const res = await joinWaitlist(fd);
      if (res.ok) {
        void trackLandingEvent('waitlist_submitted', source);
        setSuccessMessage(
          res.message ??
            "Thanks. You're on the list — we'll be in touch when there's a spot for you."
        );
        setDone(true);
      } else {
        setError(res.error ?? 'Something went wrong.');
      }
    });
  };

  if (done) {
    return (
      <div className="form-success show" role="status" aria-live="polite">
        {successMessage}
      </div>
    );
  }

  return (
    <>
      <form className="waitlist-form" onSubmit={submit} noValidate>
        <div className="waitlist-honeypot" aria-hidden="true">
          <label htmlFor={`company-${source}`}>Company</label>
          <input
            id={`company-${source}`}
            type="text"
            name="company"
            tabIndex={-1}
            autoComplete="off"
          />
        </div>

        <div className="form-row">
          <input
            type="email"
            name="email"
            className="input"
            placeholder="you@email.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) {
                setError(null);
              }
            }}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={error ? `waitlist-error-${source}` : undefined}
            aria-label="Email address"
            autoComplete="email"
            disabled={pending}
            onFocus={() => {
              if (started) return;
              setStarted(true);
              void trackLandingEvent('waitlist_form_started', source);
            }}
            required
          />
          <button type="submit" className="btn" disabled={pending}>
            {pending ? 'Sending' : 'Request access'}
          </button>
        </div>
      </form>
      {error && (
        <div className="form-error" role="alert" id={`waitlist-error-${source}`}>
          {error}
        </div>
      )}
    </>
  );
}
