import { importer, Settings } from '@coderline/alphatab';
import { checkGpContainer } from './gpContainer';

self.onmessage = async (event: MessageEvent<{ cmd: string; bytes: ArrayBuffer }>) => {
  if (event.data.cmd !== 'webfret.parse-gp') return;
  try {
    await checkGpContainer(new Uint8Array(event.data.bytes));
    const score = importer.ScoreLoader.loadScoreFromBytes(
      new Uint8Array(event.data.bytes),
      new Settings(),
    );
    if (
      !score.masterBars.length ||
      score.masterBars.length > 5000 ||
      !score.tracks.length ||
      score.tracks.length > 64
    )
      throw new Error('曲目小节或音轨数量超出支持范围');
    const staff = score.tracks
      .find((t) => t.staves.some((s) => s.tuning.length > 0))
      ?.staves.find((s) => s.tuning.length > 0);
    self.postMessage({
      type: 'webfret-gp-result',
      title: score.title,
      artist: score.artist,
      tempo: score.tempo,
      measureCount: score.masterBars.length,
      trackCount: score.tracks.length,
      instrument:
        staff?.tuning.length === 4
          ? staff.tuning[3] < staff.tuning[2]
            ? 'ukulele-low'
            : 'ukulele-high'
          : 'guitar',
    });
  } catch (error) {
    self.postMessage({
      type: 'webfret-gp-result',
      error: error instanceof Error ? error.message : 'GP 曲目无法解析',
    });
  }
};
