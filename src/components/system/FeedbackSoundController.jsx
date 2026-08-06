import { useEffect } from 'react';
import { playUiSound } from '@/lib/uiSound.js';

export default function FeedbackSoundController() {
  useEffect(() => {
    const onFeedback = (event) => playUiSound(event.detail?.type || 'neutral');
    window.addEventListener('padel:ui-feedback-sound', onFeedback);
    return () => {
      window.removeEventListener('padel:ui-feedback-sound', onFeedback);
    };
  }, []);
  return null;
}
