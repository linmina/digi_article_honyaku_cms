import { NextRequest, NextResponse } from 'next/server';
import { verifyUser } from '@/lib/auth';
import { getSession } from '@/lib/session';

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();
    if (!username || !password) {
      return NextResponse.json({ error: 'ユーザー名とパスワードを入力してください' }, { status: 400 });
    }
    const user = await verifyUser(username, password);
    if (!user) {
      return NextResponse.json({ error: 'ユーザー名またはパスワードが正しくありません' }, { status: 401 });
    }
    const session = await getSession();
    session.userId = user.id;
    session.username = user.username;
    session.role = user.role;
    session.isLoggedIn = true;
    await session.save();
    return NextResponse.json({ user: { id: user.id, username: user.username, role: user.role, display_name: user.display_name } });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
