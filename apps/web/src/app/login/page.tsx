import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/lobby/AuthForm';
import { getSession } from '@/server/session';

export const metadata = { title: 'ログイン — 雀卓' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await getSession()) redirect('/');
  return <AuthForm mode="login" next={typeof next === 'string' ? next : undefined} />;
}
