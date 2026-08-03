import type { ReactNode } from 'react';
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
  /** Optional module rendered inside the card (e.g. Appearance in Account). */
  embed?: ReactNode;
};

/** Sectioned More hub: each category is a card with link rows. */
export function MoreHub({ sections }: { sections: MoreSection[] }) {
  return (
    <div className="more-hub">
      {sections.map((sec) => (
        <section key={sec.title} className="card more-hub-section">
          <h2 className="more-hub-title">{sec.title}</h2>
          {sec.embed ? <div className="more-hub-embed">{sec.embed}</div> : null}
          <div className="more-hub-list">
            {sec.items.map((item) => (
              <Link key={item.to} to={item.to} className="more-hub-item">
                <div className="more-hub-item-copy">
                  <div className="more-hub-item-title">{item.title}</div>
                  <div className="more-hub-item-desc muted">{item.description}</div>
                </div>
                <ChevronRight size={18} className="more-hub-chevron" aria-hidden />
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
