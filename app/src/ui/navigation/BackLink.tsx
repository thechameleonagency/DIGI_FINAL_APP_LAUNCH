import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

/** Canonical back control for deep detail pages — always links to an explicit parent. */
export function BackLink({
  to,
  label = 'Back',
  className = '',
}: {
  to: string;
  label?: string;
  className?: string;
}) {
  return (
    <Link to={to} className={`back-link ${className}`.trim()}>
      <ChevronLeft size={16} aria-hidden />
      <span>{label}</span>
    </Link>
  );
}
