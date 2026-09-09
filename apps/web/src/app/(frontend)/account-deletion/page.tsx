import type { Metadata } from 'next'
import Link from 'next/link'
import { DELETION_COMPLETION_DAYS } from '@lapka/contracts'
import LapkaLogo from '@/components/LapkaLogo'
import { getAuthUser } from '@/server/auth/get-auth-user'
import { supportEmail } from '@/shared/seo'
import DeleteAccountForm from './DeleteAccountForm'

export const metadata: Metadata = {
  title: 'Удаление аккаунта',
  description:
    'Как удалить аккаунт «Лапка» и данные, которые с ним связаны: что удаляется, что сохраняется и в какой срок. Запрос можно отправить с этой страницы, не устанавливая приложение.',
  alternates: { canonical: '/account-deletion' },
}

/**
 * The public page Google Play requires (stage 9/02).
 *
 * It has to be reachable and readable by somebody who has already deleted the
 * app, or never installed it — so everything that matters is on the page
 * itself, above any sign-in: what goes, what stays, how long it takes, and how
 * to reach a human. Only the button needs an account.
 *
 * Reading this page is not permission to delete anything. Ownership is proved
 * by signing in, and signing in is also what makes the authentication fresh
 * enough for the server to allow it.
 */
export default async function AccountDeletionPage() {
  const user = await getAuthUser()

  return (
    <div className="min-h-screen bg-[#F7F6F4] text-black">
      <div className="relative mx-auto max-w-[760px] px-6 py-8 sm:px-10 sm:py-10">
        <header className="flex items-start justify-between">
          <Link href="/" aria-label="Лапка" className="block">
            <LapkaLogo />
          </Link>
          <Link
            href="/"
            className="text-sm font-bold text-black/[.44] transition-colors hover:text-black/70"
          >
            На главную
          </Link>
        </header>

        <main className="mt-12 lg:mt-[60px]">
          <h1 className="text-3xl font-extrabold sm:text-4xl">Удаление аккаунта</h1>
          <p className="mt-3 text-black/[.6]">Это действие нельзя отменить.</p>

          <section className="mt-10">
            <h2 className="text-xl font-bold">Что будет удалено</h2>
            <p className="mt-2 text-black/[.7]">
              Профиль, питомцы, все проверки симптомов и их результаты, запросы на
              дополнительные проверки и отзывы.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-bold">Что останется</h2>
            <p className="mt-2 text-black/[.7]">
              Записи о платежах. Мы обязаны хранить их независимо от аккаунта, но после
              удаления они больше не будут связаны с вами: в них не остаётся ни адреса
              почты, ни имени, ни данных о питомцах.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-bold">Сроки</h2>
            <p className="mt-2 text-black/[.7]">
              Удаление занимает до {DELETION_COMPLETION_DAYS} дней с момента запроса, обычно
              намного меньше. Пока оно идёт, вход в аккаунт закрыт и новые проверки не
              выполняются.
            </p>
          </section>

          <section className="mt-10 rounded-2xl border border-black/[.08] bg-white p-6">
            <h2 className="text-xl font-bold">Отправить запрос</h2>
            {user ? (
              <DeleteAccountForm />
            ) : (
              <>
                <p className="mt-2 text-black/[.7]">
                  Чтобы мы убедились, что аккаунт ваш, войдите. Устанавливать приложение не
                  нужно — всё делается на этой странице.
                </p>
                <Link
                  href="/login?next=/account-deletion"
                  className="mt-4 inline-flex items-center justify-center rounded-full bg-[#0F5D50] px-6 py-3 font-bold text-white transition-opacity hover:opacity-90"
                >
                  Войти и продолжить
                </Link>
              </>
            )}
          </section>

          <p className="mt-10 text-sm text-black/[.5]">
            Что-то пошло не так или квитанция потерялась — напишите на{' '}
            <a className="underline" href={`mailto:${supportEmail}`}>
              {supportEmail}
            </a>
            .
          </p>
        </main>
      </div>
    </div>
  )
}
