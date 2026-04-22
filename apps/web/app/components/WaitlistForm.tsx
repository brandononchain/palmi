'use client';

import { useState, useTransition } from 'react';
import { joinWaitlist } from '../actions';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function WaitlistForm({ source }: { source: 'hero' | 'cta' }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

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
      const res = await joinWaitlist(fd);
      if (res.ok) setDone(true);
      else setError(res.error ?? 'Something went wrong.');
    });
  };

  if (done) {
    return (
      <div className="form-success show" role="status">
        Thanks. You&rsquo;re on the list &mdash; we&rsquo;ll reach out when your campus opens.
      </div>
    );
  }

  return (
    <>
      <form className="form-row" onSubmit={submit} noValidate>
        <input
          type="email"
          name="email"
          className="input"
          placeholder="you@school.edu"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={error ? 'true' : 'false'}
          aria-label="Email address"
          autoComplete="email"
          disabled={pending}
          required
        />
        <button type="submit" className="btn" disabled={pending}>
          {pending ? 'Sending' : 'Request access'}
        </button>
      </form>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
    </>
  );
}
