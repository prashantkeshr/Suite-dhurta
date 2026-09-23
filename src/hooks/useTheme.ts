import { useEffect, useState } from 'react';
import { useStore } from '@/storage/store';

/** Applies theme, accent and motion preferences to <html>. */
export function useApplyAppearance() {
  const { theme, accent, reducedMotion } = useStore((s) => s.settings);
  useEffect(() => {
    const root = document.documentElement;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      root.dataset.theme = dark ? 'dark' : 'light';
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0d0f13' : '#f6f7f9');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
  useEffect(() => {
    document.documentElement.dataset.accent = accent;
  }, [accent]);
  useEffect(() => {
    const root = document.documentElement;
    if (reducedMotion === 'system') delete root.dataset.motion;
    else root.dataset.motion = reducedMotion === 'on' ? 'off' : 'on';
  }, [reducedMotion]);
}

export function useResolvedTheme(): 'light' | 'dark' {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'));
  useEffect(() => {
    const obs = new MutationObserver(() => setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);
  return theme;
}
