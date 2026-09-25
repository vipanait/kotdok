import AuthRoute from '@/features/auth/AuthRoute'

export default function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return <AuthRoute mode="register" searchParams={searchParams} />
}
