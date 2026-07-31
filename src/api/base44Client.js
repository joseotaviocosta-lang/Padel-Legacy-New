// Fachada de compatibilidade local. Não há SDK, conta, servidor ou API Base44.
import { localBase44 } from '@/local/localBase44Client';
export const LOCAL_DEV_MODE = true;
export const base44 = localBase44;
