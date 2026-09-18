// Minimal, deliberately narrow ambient declarations for the two platform globals the audit hash
// chain needs (crypto.subtle.digest, TextEncoder). core-domain's tsconfig intentionally omits the
// "DOM" lib — pulling that in would also grant window/document/fetch/localStorage, exactly the
// surface a framework-free core package should not casually gain typed access to. Both globals
// are real platform APIs available in every environment this code runs in: browsers (a secure
// context — GitHub Pages is HTTPS, and localhost counts as secure too) and Node 19+ under Vitest.
declare const crypto: {
  subtle: {
    digest(algorithm: 'SHA-256', data: Uint8Array): Promise<ArrayBuffer>
  }
}

declare class TextEncoder {
  encode(input: string): Uint8Array
}
