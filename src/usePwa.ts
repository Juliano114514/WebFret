import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

export function usePwa() {
  const [online, setOnline] = useState(navigator.onLine);
  const [error, setError] = useState(false);
  const [ready, setReady] = useState(false);
  const {
    offlineReady: [installed],
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError() {
      setError(true);
    },
  });
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  useEffect(() => {
    let active = true;
    // A registration alone is not evidence that the font and SoundFont are cached.
    const inspect = async () => {
      if (!('caches' in window) || !('serviceWorker' in navigator)) return;
      const files = ['index.html', 'font/Bravura.woff2', 'soundfont/sonivox.sf2'];
      const results = await Promise.all(
        files.map((file) => caches.match(import.meta.env.BASE_URL + file, { ignoreSearch: true })),
      );
      if (active)
        setReady(
          results.every(Boolean) && Boolean(navigator.serviceWorker.controller || installed),
        );
    };
    void inspect();
    navigator.serviceWorker?.addEventListener('controllerchange', inspect);
    return () => {
      active = false;
      navigator.serviceWorker?.removeEventListener('controllerchange', inspect);
    };
  }, [installed]);
  return { online, ready, needRefresh, error, update: () => updateServiceWorker(true) };
}
