import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'КотДок — AI симптомчекер для кошек',
  description: 'Узнайте насколько серьёзны симптомы вашей кошки за 15 секунд. Опишите что происходит — получите чёткий ответ с уровнем срочности.',
  alternates: {
    canonical: 'https://kotdok.ru',
  },
  openGraph: {
    url: 'https://kotdok.ru',
  },
}

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-6 py-4 flex items-center justify-between max-w-5xl mx-auto w-full">
        <span className="text-xl font-bold">🐱 КотДок</span>
        <div className="flex gap-3">
          <Link href="/login" className="text-sm text-gray-600 hover:text-gray-900 px-4 py-2">Войти</Link>
          <Link href="/register" className="text-sm bg-orange-500 text-white px-4 py-2 rounded-full hover:bg-orange-600 transition-colors">Начать бесплатно</Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="max-w-2xl">
          <div className="text-6xl mb-6">🐱</div>
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4 leading-tight">
            Симптомы кошки —<br />ждать или срочно к врачу?
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            AI-симптомчекер только для кошек. Опишите что происходит — получите чёткий ответ с уровнем срочности за 15 секунд.
          </p>
          <Link href="/register" className="inline-block bg-orange-500 text-white text-lg px-8 py-4 rounded-full hover:bg-orange-600 transition-colors font-medium">
            Проверить симптомы бесплатно
          </Link>
          <p className="text-sm text-gray-400 mt-3">3 проверки бесплатно. Карта не нужна.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-20 max-w-3xl w-full text-left">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <div className="text-3xl mb-3">🔴</div>
            <div className="font-semibold text-gray-900 mb-1">Экстренно</div>
            <div className="text-sm text-gray-600">Едем в клинику прямо сейчас</div>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <div className="text-3xl mb-3">🟠</div>
            <div className="font-semibold text-gray-900 mb-1">Срочно</div>
            <div className="text-sm text-gray-600">К врачу в течение 24 часов</div>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <div className="text-3xl mb-3">🟡</div>
            <div className="font-semibold text-gray-900 mb-1">Наблюдаем</div>
            <div className="text-sm text-gray-600">Следим 48 часов дома</div>
          </div>
        </div>
      </main>

      <footer className="text-center text-sm text-gray-400 py-8">
        КотДок — информационный инструмент. Не заменяет консультацию ветеринара.
      </footer>
    </div>
  )
}
