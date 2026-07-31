export const USE_NEW_CAREER_SYSTEM = typeof import.meta !== 'undefined' && import.meta.env
  ? import.meta.env.VITE_USE_NEW_CAREER_SYSTEM === 'true' || import.meta.env.USE_NEW_CAREER_SYSTEM === 'true'
  : false;

export function isNewCareerSystemEnabled() {
  if (typeof window !== 'undefined') {
    const runtimeFlag = window.USE_NEW_CAREER_SYSTEM;
    if (runtimeFlag === true || runtimeFlag === 'true') {
      return true;
    }
  }
  return USE_NEW_CAREER_SYSTEM;
}
