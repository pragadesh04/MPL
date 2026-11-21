/** Thrown by Phase 0 rule stubs until the owning lane implements them (PLAN §13.2). */
export class NotImplementedError extends Error {
  constructor(what: string, owner: 'Lane A' | 'Lane B' | 'Lane C') {
    super(`${what} is not implemented yet (owned by ${owner})`);
    this.name = 'NotImplementedError';
  }
}
