import { Link } from 'react-router-dom';
import { EmptyState, PageHeader } from './primitives';

export function NotFoundPage({
  homeTo,
  homeLabel = 'Go home',
}: {
  homeTo: string;
  homeLabel?: string;
}) {
  return (
    <div className="stack">
      <PageHeader title="Page not found" />
      <EmptyState
        title="This page doesn’t exist"
        description="The link may be outdated or mistyped."
        action={
          <Link className="btn btn-primary" to={homeTo}>
            {homeLabel}
          </Link>
        }
      />
    </div>
  );
}
