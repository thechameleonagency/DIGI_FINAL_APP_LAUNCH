import { Link, useLocation } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { resolveBreadcrumbs, resolveParentPath, type Crumb } from './routeMeta';

export function BreadcrumbBar({
  portal,
  variant = 'bar',
}: {
  portal: 'admin' | 'pharmacy' | 'stockist';
  /** `inline` sits inside the topbar (MSS-style). */
  variant?: 'bar' | 'inline';
}) {
  const { pathname, search } = useLocation();
  const crumbs = resolveBreadcrumbs(pathname, portal, search);
  const parent = resolveParentPath(pathname, portal, search);
  const current = crumbs[crumbs.length - 1];

  // Standalone bar: hide on portal home (single "Home" crumb)
  if (variant === 'bar' && crumbs.length === 1 && crumbs[0].label === 'Home') return null;

  return (
    <nav className={variant === 'inline' ? 'breadcrumb-inline' : 'breadcrumb-bar'} aria-label="Breadcrumb">
      <ol className="breadcrumb-list breadcrumb-list-full">
        {crumbs.map((c, i) => (
          <CrumbItem key={`${c.label}-${i}`} crumb={c} isLast={i === crumbs.length - 1} />
        ))}
      </ol>
      {variant === 'bar' ? (
        <div className="breadcrumb-compact">
          {parent ? (
            <Link to={parent} className="breadcrumb-back">
              <ChevronLeft size={16} aria-hidden />
              <span>Back</span>
            </Link>
          ) : null}
          <span className="breadcrumb-current" aria-current="page">
            {current?.label}
          </span>
        </div>
      ) : null}
    </nav>
  );
}

function CrumbItem({ crumb, isLast }: { crumb: Crumb; isLast: boolean }) {
  return (
    <li className="breadcrumb-item">
      {!isLast && crumb.to ? (
        <Link to={crumb.to} className="breadcrumb-link">
          {crumb.label}
        </Link>
      ) : (
        <span className="breadcrumb-current" aria-current={isLast ? 'page' : undefined}>
          {crumb.label}
        </span>
      )}
      {!isLast ? <span className="breadcrumb-sep" aria-hidden>/</span> : null}
    </li>
  );
}
