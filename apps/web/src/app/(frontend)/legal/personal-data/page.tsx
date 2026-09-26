import type { Metadata } from 'next'
import Link from 'next/link'
import { PD_CONSENT_VERSION } from '@lapka/contracts'
import LegalDocument, { LegalSection, editionOf } from '@/components/site/LegalDocument'
import { supportEmail } from '@/shared/seo'

export const metadata: Metadata = {
  title: 'Согласие на обработку персональных данных',
  description: 'Согласие на обработку персональных данных пользователей сервиса Лапка.',
  alternates: { canonical: '/legal/personal-data' },
}

/**
 * The consent the registration box and the consent screens link to — a
 * separate document, as 152-FZ art. 9 requires since 1 September 2025. Its
 * edition is PD_CONSENT_VERSION: the text and what clients send cannot drift.
 */
export default function PersonalDataConsentPage() {
  return (
    <LegalDocument title="Согласие на обработку персональных данных" edition={editionOf(PD_CONSENT_VERSION)}>
      <LegalSection title="Кто и кому даёт согласие">
        <p>
          Регистрируясь в сервисе «Лапка» (сайт lapka.my и мобильное приложение, далее —
          «Сервис»), я свободно, своей волей и в своём интересе даю Администрации Сервиса
          согласие на обработку моих персональных данных на условиях, изложенных ниже.
        </p>
      </LegalSection>

      <LegalSection title="Какие данные">
        <ul>
          <li>адрес электронной почты;</li>
          <li>
            сведения из профиля Яндекс ID, Google или Apple, если я вхожу через них: имя, логин,
            адрес электронной почты;
          </li>
          <li>
            технические данные: IP-адрес, сведения о браузере или устройстве, файлы cookies;
          </li>
          <li>
            сведения, которые я сам ввожу в Сервис: данные о моих питомцах, описания
            симптомов, фотографии, записи медицинской карты питомца, отзывы.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Цели">
        <p>
          Регистрация и вход в Сервис; проведение проверок симптомов и ведение медицинской
          карты питомца; ответы на мои обращения; обеспечение безопасности Сервиса.
        </p>
      </LegalSection>

      <LegalSection title="Действия с данными">
        <p>
          Сбор, запись, систематизация, накопление, хранение, уточнение (обновление,
          изменение), извлечение, использование, передача (предоставление, доступ),
          обезличивание, блокирование, удаление, уничтожение — с использованием средств
          автоматизации и без них.
        </p>
      </LegalSection>

      <LegalSection title="Кому поручается обработка">
        <p>
          Supabase — хранение данных и вход в Сервис; Vercel — работа сайта и сервера;
          OpenAI — анализ описаний симптомов, сведений о питомце и фотографий; Expo — доставка
          обновлений мобильного приложения. Я понимаю, что
          эти лица обрабатывают данные на серверах за пределами Российской Федерации, и даю
          согласие на трансграничную передачу моих персональных данных.
        </p>
      </LegalSection>

      <LegalSection title="Срок и отзыв согласия">
        <p>
          Согласие действует до удаления аккаунта или до его отзыва. Отозвать согласие можно
          письмом на{' '}
          <a href={`mailto:${supportEmail}`} className="legal-mail">{supportEmail}</a> или
          удалив аккаунт в приложении или на <Link href="/account-deletion">сайте</Link>. После
          отзыва согласия пользоваться Сервисом нельзя.
        </p>
        <p>
          Порядок обработки описан в{' '}
          <Link href="/legal/privacy">Политике обработки персональных данных</Link>.
        </p>
      </LegalSection>
    </LegalDocument>
  )
}
