import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { alphaTab } from '@coderline/alphatab-vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { importer, Settings } from '@coderline/alphatab';
import { measureCount, validateDocument, type CatalogEntry } from './src/model.ts';

async function catalog(): Promise<CatalogEntry[]> {
  const files = (await readdir('public/scores'))
    .filter((f) => /\.(webfret\.json|gp[345]?|gpx)$/i.test(f))
    .sort();
  return Promise.all(
    files.map(async (file) => {
      const buffer = await readFile('public/scores/' + file);
      if (buffer.length > 20 * 1024 * 1024) throw new Error(`曲库文件过大: ${file}`);
      const id = createHash('sha256').update(file).digest('hex').slice(0, 16);
      if (file.toLowerCase().endsWith('.webfret.json')) {
        const doc = validateDocument(JSON.parse(buffer.toString('utf8')));
        return {
          id,
          file,
          title: doc.title,
          artist: doc.artist,
          instrument: doc.score.instrument,
          measureCount: measureCount(doc),
          kind: doc.score.kind,
          ...(doc.score.kind === 'source' ? { instruments: [...new Set(doc.score.versions.map((v) => v.instrument))] } : {}),
        };
      }
      if (buffer.length > 10 * 1024 * 1024) throw new Error(`GP 文件不能超过 10 MB: ${file}`);
      const score = importer.ScoreLoader.loadScoreFromBytes(buffer, new Settings());
      if (
        !score.masterBars.length ||
        score.masterBars.length > 5000 ||
        !score.tracks.length ||
        score.tracks.length > 64
      )
        throw new Error(`GP 曲目超出支持范围: ${file}`);
      const staff = score.tracks
        .find((t) => t.staves.some((s) => s.tuning.length > 0))
        ?.staves.find((s) => s.tuning.length > 0);
      return {
        id,
        file,
        title: score.title || file,
        artist: score.artist,
        instrument:
          staff?.tuning.length === 4
            ? staff.tuning[3] < staff.tuning[2]
              ? 'ukulele-low'
              : 'ukulele-high'
            : 'guitar',
        measureCount: score.masterBars.length,
        kind: 'guitar-pro',
      } as CatalogEntry;
    }),
  );
}
function scoreCatalog(): Plugin {
  return {
    name: 'webfret-score-catalog',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.split('?')[0].endsWith('/scores/catalog.json')) return next();
        try {
          const entries = await catalog();
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify(entries));
        } catch {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: '曲库文件校验失败，请查看终端' }));
        }
      });
    },
    async generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'scores/catalog.json',
        source: JSON.stringify(await catalog()),
      });
    },
  };
}

export default defineConfig({
  base: '/WebFret/',
  worker: { format: 'es' },
  plugins: [
    react(),
    alphaTab(),
    scoreCatalog(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/*.svg', 'icons/*.png'],
      manifest: {
        name: 'WebFret · 你的随身练琴本',
        short_name: 'WebFret',
        description: '吉他与尤克里里 · 读谱、制谱、分块练习',
        lang: 'zh-CN',
        theme_color: '#22584c',
        background_color: '#f7f7f2',
        display: 'standalone',
        start_url: '/WebFret/',
        scope: '/WebFret/',
        id: '/WebFret/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        globPatterns: ['**/*.{js,mjs,css,html,png,ico,svg,woff,woff2,sf2}'],
        globIgnores: ['scores/**'],
        navigateFallback: '/WebFret/index.html',
        navigateFallbackAllowlist: [/^\/WebFret\/(?:$|index\.html$)/],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /\/WebFret\/scores\/catalog\.json$/,
            handler: 'NetworkFirst',
            options: { cacheName: 'webfret-catalog-v1', networkTimeoutSeconds: 4 },
          },
        ],
      },
    }),
  ],
  build: { chunkSizeWarningLimit: 1600 },
});
