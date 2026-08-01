import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

export type MoreLink = {
  to: string;
  title: string;
  description: string;
};

export type MoreSection = {
  title: string;
  items: MoreLink[];
};

/** Sectioned More hub: category headers + large link cards. */
export function MoreHub({ sections }: { sections: MoreSection[] }) {
  return (
    <div className="stack" style={{ gap: 20 }}>
      {sections.map((sec) => (
        <section key={sec.title} className="stack" style={{ gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            {sec.title}
          </h2>
          <div className="stack" style={{ gap: 8 }}>
            {sec.items.map((item) => (
              <Link key={item.to} to={item.to} className="more-card">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 650, fontSize: 15 }}>{item.title}</div>
                  <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                    {item.description}
                  </div>
                </div>
                <ChevronRight size={18} style={{ color: 'var(--muted)', flexShrink: 0 }} />
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
