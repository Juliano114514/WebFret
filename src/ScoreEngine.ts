import * as alphaTab from '@coderline/alphatab';
import { compileAlphaTex } from './alphaTex';
import { base64ToBytes } from './files';
import { type PracticeSettings, type WebFretDocument } from './model';

export interface EngineTrack {
  index: number;
  name: string;
}
export interface EngineLyric {
  key: string;
  text: string;
  x: number;
  y: number;
  width: number;
}
export interface EngineState {
  ready: boolean;
  rendering: boolean;
  playing: boolean;
  bar: number;
  beat: number;
  currentTime: number;
  totalTime: number;
  tracks: EngineTrack[];
  lyrics: EngineLyric[];
  error: string | null;
}
export class ScoreEngine {
  private api: alphaTab.AlphaTabApi;
  private fullScore: alphaTab.model.Score | null = null;
  private mode = false;
  private settings: PracticeSettings | null = null;
  private isInitialLoad = false;
  private state: EngineState = {
    ready: false,
    rendering: false,
    playing: false,
    bar: 1,
    beat: 1,
    currentTime: 0,
    totalTime: 0,
    tracks: [],
    lyrics: [],
    error: null,
  };
  constructor(
    container: HTMLElement,
    private onState: (state: EngineState) => void,
    private onBeat?: (bar: number, beat: number) => void,
  ) {
    this.api = new alphaTab.AlphaTabApi(container, {
      core: { fontDirectory: import.meta.env.BASE_URL + 'font/', engine: 'svg' },
      display: {
        scale: 1,
        layoutMode: alphaTab.LayoutMode.Page,
        notationStaffPaddingBottom: 112,
        lastNotationStaffPaddingBottom: 112,
      },
      notation: {
        elements: new Map([
          [alphaTab.NotationElement.ScoreTitle, false],
          [alphaTab.NotationElement.ScoreArtist, false],
          [alphaTab.NotationElement.GuitarTuning, false],
          [alphaTab.NotationElement.EffectLyrics, false],
        ]),
      },
      player: {
        enablePlayer: true,
        soundFont: import.meta.env.BASE_URL + 'soundfont/sonivox.sf2',
        enableCursor: true,
        enableUserInteraction: false,
        scrollElement: '.score-scroll',
        scrollOffsetY: -30,
      },
    });
    this.api.masterVolume = 0.25;
    this.api.error.on((error) =>
      this.emit({ error: error.message || '乐谱加载失败', rendering: false }),
    );
    this.api.scoreLoaded.on((score) => {
      if (this.isInitialLoad) {
        this.fullScore = score;
        this.isInitialLoad = false;
      }
      this.emit({
        tracks: score.tracks.map((t) => ({
          index: t.index,
          name: t.name || `音轨 ${t.index + 1}`,
        })),
      });
    });
    this.api.renderStarted.on(() => this.emit({ rendering: true }));
    this.api.postRenderFinished.on(() => {
      this.updateLyrics();
      this.emit({ rendering: false });
    });
    this.api.playerReady.on(() => {
      this.applyRange();
      this.emit({ ready: true, error: null });
    });
    this.api.midiLoaded.on(() => {
      this.applyRange();
      this.applyMix();
      this.emit({ ready: this.api.isReadyForPlayback });
    });
    this.api.playerStateChanged.on((event) =>
      this.emit({ playing: event.state === alphaTab.synth.PlayerState.Playing }),
    );
    this.api.playerPositionChanged.on((event) =>
      this.emit({ currentTime: event.currentTime, totalTime: event.endTime }),
    );
    this.api.playedBeatChanged.on((beat) =>
      this.emit({ bar: beat.voice.bar.index + 1, beat: beat.index + 1 }),
    );
    this.api.beatMouseDown.on((beat) => {
      const bar = beat.voice.bar.index + 1;
      this.onBeat?.(bar - 1, beat.index);
      if (
        (!this.mode || (this.settings && bar >= this.settings.start && bar <= this.settings.end)) &&
        this.api.tickCache
      )
        this.api.tickPosition = this.api.tickCache.getBeatStart(beat);
    });
  }
  private emit(patch: Partial<EngineState>): void {
    this.state = { ...this.state, ...patch };
    this.onState(this.state);
  }
  private updateLyrics(): void {
    const lyrics: EngineLyric[] = [];
    const lookup = this.api.boundsLookup;
    const score = this.api.score;
    const track = score?.tracks[this.settings?.selectedTrack ?? 0];
    const scale = this.api.settings.display.scale;
    if (lookup && track)
      for (const staff of track.staves)
        for (const bar of staff.bars)
          for (const voice of bar.voices)
            for (const beat of voice.beats) {
              if (!beat.lyrics?.some(Boolean)) continue;
              const bounds = lookup.findBeat(beat);
              if (!bounds) continue;
              beat.lyrics.forEach((text, line) => {
                if (text)
                  lyrics.push({
                    key: `${staff.index}-${bar.index}-${voice.index}-${beat.index}-${line}`,
                    text,
                    x: bounds.onNotesX,
                    y:
                      bounds.barBounds.visualBounds.y +
                      bounds.barBounds.visualBounds.h +
                      (28 + line * 18) * scale,
                    width: Math.max(25, bounds.realBounds.w - 3),
                  });
              });
            }
    this.emit({ lyrics });
  }
  load(doc: WebFretDocument): void {
    this.api.stop();
    this.fullScore = null;
    this.mode = false;
    this.isInitialLoad = true;
    this.settings = structuredClone(doc.practice);
    this.api.settings.display.startBar = 1;
    this.api.settings.display.barCount = -1;
    this.api.updateSettings();
    this.emit({ ready: false, rendering: true, error: null, bar: 1, currentTime: 0, lyrics: [] });
    try {
      if (doc.score.kind === 'editable')
        this.api.tex(compileAlphaTex(doc), [doc.practice.selectedTrack]);
      else if (doc.score.kind === 'guitar-pro') this.api.load(base64ToBytes(doc.score.base64), [doc.practice.selectedTrack]);
      else throw new Error('原谱需要先补全并生成练习副本');
    } catch (error) {
      this.emit({
        rendering: false,
        error: error instanceof Error ? error.message : '无法加载曲谱',
      });
    }
  }
  configure(settings: PracticeSettings, segmentMode: boolean): void {
    const previousTrack = this.settings?.selectedTrack;
    this.settings = structuredClone(settings);
    this.api.playbackSpeed = settings.speed;
    this.api.isLooping = segmentMode && settings.looping;
    this.api.masterVolume = settings.masterVolume;
    this.api.metronomeVolume = settings.metronome ? 0.6 : 0;
    this.api.countInVolume = settings.countIn ? 0.6 : 0;
    if (!this.fullScore) return;
    if (segmentMode !== this.mode) {
      this.api.stop();
      this.mode = segmentMode;
      this.emit({ ready: false });
      let score = this.fullScore;
      if (segmentMode) {
        // This JSON is only a same-version, in-memory clone, never a storage format.
        const clone = alphaTab.model.JsonConverter.jsonToScore(
          alphaTab.model.JsonConverter.scoreToJson(score),
          this.api.settings,
        );
        clone.masterBars.forEach((bar) => {
          bar.isRepeatStart = false;
          bar.repeatCount = 0;
          bar.alternateEndings = 0;
          bar.directions = null;
        });
        score = alphaTab.model.JsonConverter.jsonToScore(
          alphaTab.model.JsonConverter.scoreToJson(clone),
          this.api.settings,
        );
      }
      this.updateLayout();
      this.api.renderScore(score, [settings.selectedTrack]);
    } else if (previousTrack !== settings.selectedTrack && this.api.score)
      this.api.renderTracks([this.api.score.tracks[settings.selectedTrack]]);
    this.updateLayout();
    this.applyRange();
    this.applyMix();
  }
  private updateLayout(): void {
    if (!this.settings) return;
    const start = this.mode ? this.settings.start : 1;
    const count = this.mode ? this.settings.end - start + 1 : -1;
    if (
      this.api.settings.display.startBar !== start ||
      this.api.settings.display.barCount !== count
    ) {
      this.api.settings.display.startBar = start;
      this.api.settings.display.barCount = count;
      this.api.updateSettings();
      this.api.render();
    }
  }
  private applyRange(): void {
    if (!this.settings || !this.api.score || !this.api.tickCache) return;
    if (!this.mode) {
      this.api.playbackRange = null;
      return;
    }
    const bars = this.api.score.masterBars;
    const first = bars[this.settings.start - 1];
    const last = bars[this.settings.end - 1];
    if (!first || !last) return;
    const range = {
      startTick: this.api.tickCache.getMasterBar(first).start,
      // Keep note-ons at the next bar boundary outside the fragment.
      endTick: this.api.tickCache.getMasterBar(last).end - 1,
    };
    const previous = this.api.playbackRange;
    if (previous?.startTick !== range.startTick || previous?.endTick !== range.endTick) {
      this.api.pause();
      this.api.playbackRange = range;
      this.api.tickPosition = range.startTick;
      this.emit({ bar: this.settings.start, currentTime: this.api.timePosition });
    }
  }
  private applyMix(): void {
    if (!this.settings || !this.api.score) return;
    this.api.score.tracks.forEach((track) => {
      const mix = this.settings!.trackMix[String(track.index)] ?? {
        volume: 1,
        muted: false,
        solo: false,
      };
      this.api.changeTrackMute([track], mix.muted);
      this.api.changeTrackSolo([track], mix.solo);
      this.api.changeTrackVolume([track], mix.volume);
    });
  }
  toggle(): void {
    if (this.api.isReadyForPlayback) this.api.playPause();
  }
  stop(): void {
    this.api.stop();
    if (this.mode && this.api.playbackRange)
      this.api.tickPosition = this.api.playbackRange.startTick;
  }
  seek(bar: number): void {
    const target = this.api.score?.masterBars[bar - 1];
    if (target && this.api.tickCache)
      this.api.tickPosition = this.api.tickCache.getMasterBarStart(target);
  }
  zoom(scale: number): void {
    this.api.settings.display.scale = scale;
    this.api.updateSettings();
    this.api.render();
  }
  exportGp(): Uint8Array {
    if (!this.fullScore) throw new Error('曲谱尚未加载');
    return new alphaTab.exporter.Gp7Exporter().export(this.fullScore, this.api.settings);
  }
  destroy(): void {
    this.api.destroy();
  }
}
