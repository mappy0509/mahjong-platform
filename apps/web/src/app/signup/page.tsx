import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/lobby/AuthForm';
import { getSession } from '@/server/session';

export const metadata = { title: '新規登録 — 雀卓' };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await getSession()) redirect('/');
  return <AuthForm mode="signup" next={typeof next === 'string' ? next : undefined} />;
}
