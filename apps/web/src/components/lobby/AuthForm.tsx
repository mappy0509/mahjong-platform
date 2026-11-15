"use client";
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { Button, Field, Notice } from '@/components/ui';
import { Brand } from './Brand';

/** 遷移先は同一サイト内のパスだけ許す（外部URLへ飛ばされないように）。 */
function safeNext(next: string | undefined): string {
  return next && /^\/(?!\/)[\w\-./?=&%]*$/.test(next) ? next : '/';
}

export function AuthForm({ mode, next }: { mode: 'login' | 'signup'; next?: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const act = useAction();
  const signup = mode === 'signup';
  const dest = safeNext(next);
  const q = dest !== '/' ? `?next=${encodeURIComponent(dest)}` : '';

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void act.run('submit', async () => {
      await api(signup ? '/auth/signup' : '/auth/login', {
        body: signup ? { email, password, displayName: name } : { email, password },
      });
      location.href = dest;
      await new Promise((r) => setTimeout(r, 4000));
    });
  };

  return (
    <main className="room flex items-center justify-center px-4 py-6">
      <div className="room-in grid w-full max-w-3xl items-center gap-6 sm:grid-cols-[1fr_1.1fr]">
        <div className="text-center sm:text-left">
          <Brand size="lg" />
          <p className="font-display mt-5 hidden text-sm leading-loose tracking-[0.25em] text-[#8fa1ad] sm:block">
            招かれた者だけが
            <br />
            卓を囲む。
          </p>
        </div>
        <form onSubmit={submit} className="frame space-y-3 p-5" noValidate>
          <h1 className="font-display text-lg font-extrabold tracking-[0.3em] text-gold2">{signup ? '新規登録' : 'ログイン'}</h1>
          {signup ? (
            <Field label="表示名" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} autoComplete="nickname" required hint="卓で表示される名前（24文字まで）" />
          ) : null}
          <Field label="メールアドレス" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoCapitalize="none" required />
          <Field
            label="パスワード"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={signup ? 'new-password' : 'current-password'}
            minLength={signup ? 8 : undefined}
            required
            hint={signup ? '8文字以上' : undefined}
          />
          {act.error ? <Notice onClose={act.clear}>{act.error}</Notice> : null}
          <Button type="submit" tone="gold" busy={act.busy === 'submit'} className="w-full">
            {signup ? '登録して入る' : '入る'}
          </Button>
          <p className="pt-1 text-center text-sm text-[#8fa1ad]">
            {signup ? (
              <>すでに登録済みの方は <Link href={`/login${q}`} className="text-gold2 underline underline-offset-4">ログイン</Link></>
            ) : (
              <>はじめての方は <Link href={`/signup${q}`} className="text-gold2 underline underline-offset-4">新規登録</Link></>
            )}
          </p>
        </form>
      </div>
    </main>
  );
}
