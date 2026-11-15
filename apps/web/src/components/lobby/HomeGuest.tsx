import Link from 'next/link';
import { Frame } from '@/components/ui';
import { Brand } from './Brand';
import { Practice } from './Practice';

export function HomeGuest() {
  return (
    <main className="room flex items-center justify-center px-4 py-6">
      <div className="room-in grid w-full max-w-4xl items-center gap-6 sm:grid-cols-[1fr_1.25fr]">
        <div className="text-center sm:text-left">
          <Brand size="lg" />
          <p className="font-display mt-5 text-sm leading-loose tracking-[0.25em] text-[#8fa1ad]">
            クラブで囲む、
            <br className="hidden sm:block" />
            本格リーチ麻雀。
          </p>
          <div className="mt-5 flex justify-center gap-2 sm:justify-start">
            <Link href="/login" className="btn btn-gold">ログイン</Link>
            <Link href="/signup" className="btn btn-line">新規登録</Link>
          </div>
        </div>
        <Frame title="CPUと対局">
          <p className="mb-3 text-sm text-[#8fa1ad]">登録なしですぐ打てます。ポイントは動きません。</p>
          <Practice />
        </Frame>
      </div>
    </main>
  );
}
