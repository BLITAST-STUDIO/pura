import { useEffect, useState } from 'react';
import {
  createSensoryFeedback, readSensoryPreferences, writeSensoryPreferences,
  type SensoryFeedback, type SensoryPreferences,
} from './feedback';

/** One feedback engine per mounted screen, with the stored sound/haptic choice. */
export function useSensoryFeedback() {
  const [feedback] = useState<SensoryFeedback>(() => createSensoryFeedback());
  const [preferences, setPreferences] = useState<SensoryPreferences>(() => readSensoryPreferences());
  useEffect(() => { feedback.setPreferences(preferences); }, [feedback, preferences]);
  useEffect(() => () => feedback.dispose(), [feedback]);
  const change = (next: Partial<SensoryPreferences>) => {
    const merged = { ...preferences, ...next };
    writeSensoryPreferences(merged);
    feedback.setPreferences(merged);
    // Called from the toggle's own click: a gesture that may start audio now.
    if (merged.sound && !preferences.sound) feedback.unlock();
    setPreferences(merged);
  };
  return { feedback, preferences, change };
}
