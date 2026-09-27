/** Offer a tap for sound when it is on, the board was touched, and the audio is still blocked. */
export function soundNudgeNeeded(audio: string, touched: boolean, soundOn: boolean) {
  return soundOn && touched && (audio === 'suspended' || audio === 'interrupted');
}
