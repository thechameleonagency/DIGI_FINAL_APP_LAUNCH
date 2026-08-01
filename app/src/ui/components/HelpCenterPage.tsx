import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  faqsFor,
  guidesFor,
  HELP_CONTACT,
  requestWalkthroughReplay,
  type HelpAudience,
} from '../../content/help';
import { Button, PageHeader } from './primitives';

export function HelpCenterPage({ audience, supportPath }: { audience: HelpAudience; supportPath: string }) {
  const faqs = faqsFor(audience);
  const guides = guidesFor(audience);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [openGuide, setOpenGuide] = useState<number | null>(null);

  return (
    <div className="stack">
      <PageHeader
        title="Help Center"
        subtitle="Platform guidance only — not business or medical advice"
        actions={
          <Button type="button" variant="secondary" size="sm" onClick={() => requestWalkthroughReplay()}>
            Replay walkthrough
          </Button>
        }
      />

      <div className="card card-pad stack">
        <strong>Contact</strong>
        <div>{HELP_CONTACT.name}</div>
        <div className="muted">{HELP_CONTACT.email}</div>
        <div className="muted">{HELP_CONTACT.hours}</div>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          {HELP_CONTACT.note}
        </p>
        <div className="row gap">
          <Link className="btn btn-primary btn-sm" to={supportPath}>
            Support tickets
          </Link>
        </div>
      </div>

      <div className="card card-pad stack">
        <strong>How do I…</strong>
        {guides.map((g, i) => (
          <div key={g.title}>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ width: '100%', justifyContent: 'space-between', textAlign: 'left' }}
              onClick={() => setOpenGuide(openGuide === i ? null : i)}
            >
              <span>{g.title}</span>
              <span className="muted">{openGuide === i ? '−' : '+'}</span>
            </button>
            {openGuide === i ? (
              <ol style={{ margin: '0 0 0.75rem', paddingLeft: '1.25rem', fontSize: 14 }}>
                {g.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            ) : null}
          </div>
        ))}
      </div>

      <div className="card card-pad stack">
        <strong>FAQ</strong>
        {faqs.map((f, i) => (
          <div key={f.q}>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ width: '100%', justifyContent: 'space-between', textAlign: 'left' }}
              onClick={() => setOpenFaq(openFaq === i ? null : i)}
            >
              <span>{f.q}</span>
              <span className="muted">{openFaq === i ? '−' : '+'}</span>
            </button>
            {openFaq === i ? <p style={{ margin: '0 0 0.75rem', fontSize: 14 }}>{f.a}</p> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
