export type ErrorCategory =
  | 'Validation'
  | 'Permission'
  | 'StateConflict'
  | 'NotFound'
  | 'BusinessRule'
  | 'Duplicate'
  | 'Concurrency'
  | 'Integrity'
  | 'Connectivity'
  | 'System';

export interface DomainError {
  ok: false;
  category: ErrorCategory;
  code: string;
  message: string;
  businessImpact: string;
  fields?: Record<string, string>;
  existingId?: string;
  retrySafe: boolean;
  partial?: { succeeded: string[]; failed: string[] };
}

export interface DomainSuccess<T> {
  ok: true;
  data: T;
}

export type Result<T> = DomainSuccess<T> | DomainError;

export function ok<T>(data: T): DomainSuccess<T> {
  return { ok: true, data };
}

export function fail(
  category: ErrorCategory,
  code: string,
  message: string,
  businessImpact: string,
  extra?: Partial<DomainError>,
): DomainError {
  return {
    ok: false,
    category,
    code,
    message,
    businessImpact,
    retrySafe: extra?.retrySafe ?? false,
    ...extra,
  };
}
