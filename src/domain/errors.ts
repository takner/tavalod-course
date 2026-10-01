/**
 * Domain validation error. `code` is stable and machine-readable; `message` is the
 * Persian text shown to the user.
 */
export class DomainError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}
