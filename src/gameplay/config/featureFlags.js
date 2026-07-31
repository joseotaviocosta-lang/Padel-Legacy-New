// Compatibility API retained for older imports. Foundation 0.3.0.1 uses
// the CareerRepository flow unconditionally; the legacy runtime was removed.
export const USE_NEW_CAREER_SYSTEM = true;

export function isNewCareerSystemEnabled() {
  return true;
}
