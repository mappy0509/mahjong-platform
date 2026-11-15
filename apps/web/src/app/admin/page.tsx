import { redirect } from 'next/navigation';
import { AdminConsole } from '@/components/lobby/AdminConsole';
import { getSession } from '@/server/session';

export const metadata = { title: '運営 — 雀卓' };

export default async function AdminPage() {
  if (!(await getSession())) redirect('/login?next=%2Fadmin');
  // 権限の判定は API（platform_admins）が行う。権限が無ければ画面側は 403 の表示になる
  return <AdminConsole />;
}
