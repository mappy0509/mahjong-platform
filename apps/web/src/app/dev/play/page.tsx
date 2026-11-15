'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { tableServerHttp } from '@/components/table/TableScreen';

/** 開発用: CPU練習卓を作ってそのまま入る。?n=3&length=east */
export default function Page() {
  const router = useRouter();
  const [err, setErr] = useState('');
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    fetch(`${tableServerHttp()}/practice`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ players: Number(q.get('n') ?? 4), length: q.get('length') ?? 'east' }),
    }).then((r) => r.json()).then((j) => router.replace(`/table/${j.id}${q.get('ts') ? `?ts=${q.get('ts')}` : ''}`)).catch((e) => setErr(String(e)));
  }, [router]);
  return <main className="p-8 text-slate-300">{err || '卓を作成しています…'}</main>;
}
