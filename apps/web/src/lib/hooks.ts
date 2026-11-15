"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiFail, errorText } from './api';

/** GET して保持する。interval を渡すと画面が見えている間だけ再取得する。401 はログイン画面へ。 */
export function useLoad<T>(path: string | null, opts: { interval?: number } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const seq = useRef(0);

  const reload = useCallback(async () => {
    if (!path) return;
    const my = ++seq.current;
    try {
      const d = await api<T>(path);
      if (my !== seq.current) return;
      setData(d);
      setError(null);
    } catch (e) {
      if (my !== seq.current) return;
      if (e instanceof ApiFail && e.status === 401) {
        location.href = `/login?next=${encodeURIComponent(location.pathname)}`;
        return;
      }
      setError(errorText(e));
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    setData(null);
    setLoading(!!path);
    void reload();
    if (!path || !opts.interval) return;
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void reload();
    }, opts.interval);
    const onVis = () => document.visibilityState === 'visible' && void reload();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
      seq.current++;
    };
  }, [path, opts.interval, reload]);

  return { data, error, loading, reload };
}

/** 書き込み操作。実行中は busy（ボタンを無効にして多重送信を防ぐ）、失敗は error に入る。 */
export function useAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const lock = useRef(false);

  const run = useCallback(async (key: string, fn: () => Promise<unknown>, doneText?: string): Promise<boolean> => {
    if (lock.current) return false;
    lock.current = true;
    setBusy(key);
    setError(null);
    setDone(null);
    try {
      await fn();
      if (doneText) setDone(doneText);
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      lock.current = false;
      setBusy(null);
    }
  }, []);

  const clear = useCallback(() => { setError(null); setDone(null); }, []);
  return { busy, error, done, run, clear };
}
