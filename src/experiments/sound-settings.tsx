import type { SensoryFeedback, SensoryPreferences } from './sensory/feedback';
import './sound-settings.css';

export type SoundProps = { sensory: SensoryPreferences; change: (next: Partial<SensoryPreferences>) => void; feedback: SensoryFeedback };
const percent = (volume: number) => Math.round(volume * 100);

/**
 * The volume sliders (2026-09-27, RYO: with the on/off switches in the menu,
 * add volume bars). Sound effects and music separately; the effects slider
 * plays a soft touch as it moves so the level can be heard.
 */
export function VolumeSliders({ sensory, change, feedback, className = '' }: SoundProps & { className?: string }) {
  return <>
    <label className={`volume-row ${className}`}><span>効果音の音量</span>
      <input type="range" min={0} max={100} step={1} value={percent(sensory.soundVolume)} disabled={!sensory.sound}
        aria-valuetext={`${percent(sensory.soundVolume)}%`}
        onChange={e => { change({ soundVolume: Number(e.target.value) / 100 }); feedback.previewSound(); }}/>
      <output>{percent(sensory.soundVolume)}</output></label>
    <label className={`volume-row ${className}`}><span>音楽の音量</span>
      <input type="range" min={0} max={100} step={1} value={percent(sensory.musicVolume)} disabled={!sensory.sound || !sensory.music}
        aria-valuetext={`${percent(sensory.musicVolume)}%`}
        onChange={e => change({ musicVolume: Number(e.target.value) / 100 })}/>
      <output>{percent(sensory.musicVolume)}</output></label>
  </>;
}

/**
 * 音 and 音楽 with their sliders, for the settings of each play screen. On
 * phones the same block sits at the top of the menu, under the ways to play
 * (and the copy in the settings is hidden), so it is one tap away.
 */
export function SoundSettings(props: SoundProps) {
  const { sensory, change } = props;
  return <div className="sound-settings">
    <label><span>音</span><input type="checkbox" checked={sensory.sound} onChange={e => change({ sound: e.target.checked })}/></label>
    <label><span>音楽</span><input type="checkbox" checked={sensory.music} disabled={!sensory.sound} onChange={e => change({ music: e.target.checked })}/></label>
    <VolumeSliders {...props}/>
  </div>;
}
