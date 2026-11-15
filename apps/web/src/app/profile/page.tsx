import { redirect } from 'next/navigation';
import { ProfileView } from '@/components/lobby/ProfileView';
import { getSession } from '@/server/session';

export const metadata = { title: 'プロフィール — 雀卓' };

export default async function ProfilePage() {
  if (!(await getSession())) redirect('/login?next=%2Fprofile');
  return <ProfileView />;
}
