import Link from 'next/link';

/** ロゴ（文字組み）。牌を1枚あしらう。 */
export function Brand({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const lg = size === 'lg';
  return (
    <Link href="/" className="inline-flex items-center gap-3">
      <span
        aria-hidden
        className={`relative inline-flex items-center justify-center bg-[#f4efe3] shadow-[0_3px_0_#b9a781,0_5px_0_#2e7d62,0_10px_18px_rgba(0,0,0,.5)] ${lg ? 'h-16 w-12 rounded-md' : 'h-9 w-7 rounded'}`}
      >
        <span className={`font-display font-extrabold leading-none text-[#c8243a] ${lg ? 'text-4xl' : 'text-xl'}`}>中</span>
      </span>
      <span className="leading-none">
        <span className={`font-display gold-text block font-extrabold tracking-[0.3em] ${lg ? 'text-5xl' : 'text-2xl'}`}>雀卓</span>
        <span className={`mt-1 block tracking-[0.5em] text-[#8fa1ad] ${lg ? 'text-xs' : 'text-[9px]'}`}>CLUB MAHJONG</span>
      </span>
    </Link>
  );
}
