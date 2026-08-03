import type { DomainError, DomainSuccess, Result } from '../../domain/errors/types';

/** Fail fast on a failed service Result with a seed step id. */
export function assertOk<T>(step: string, result: Result<T>): DomainSuccess<T> {
  if (!result.ok) {
    const err = result as DomainError;
    throw new Error(
      `[worldSeed:${step}] ${err.code}: ${err.message}${err.businessImpact ? ` (${err.businessImpact})` : ''}`,
    );
  }
  return result;
}
