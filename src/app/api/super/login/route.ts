import { NextRequest, NextResponse } from 'next/server'
import { SUPER_COOKIE } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST(req: NextRequest) {
  const { secret } = await req.json()
  if (!process.env.SUPER_SECRET || secret !== process.env.SUPER_SECRET)
    return NextResponse.json({ error: 'رمز نادرست است' }, { status: 401 })
  const res = NextResponse.json({ success: true })
  res.cookies.set(SUPER_COOKIE, secret, {
    httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 60 * 60 * 24 * 7,
  })
  return res
}
