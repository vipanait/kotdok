import { ImageResponse } from 'next/og'
import { defaultSeo, siteName } from '@/shared/seo'

export const alt = 'Лапка — AI симптомчекер для кошек'
export const size = {
  width: 1200,
  height: 630,
}

export const contentType = 'image/png'

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: 'linear-gradient(135deg, #fff7ed 0%, #ffffff 48%, #ffedd5 100%)',
          color: '#111827',
          padding: 72,
          fontFamily: 'Arial, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div
            style={{
              width: 84,
              height: 84,
              borderRadius: 28,
              background: '#fc7a00',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 48,
              fontWeight: 800,
            }}
          >
            Л
          </div>
          <div style={{ fontSize: 44, fontWeight: 800, color: '#eb8124' }}>{siteName}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <div style={{ fontSize: 72, fontWeight: 900, lineHeight: 1.02, maxWidth: 940 }}>
            AI симптомчекер для кошек
          </div>
          <div style={{ fontSize: 32, lineHeight: 1.3, maxWidth: 840, color: '#4b5563' }}>
            {defaultSeo.description}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 18, fontSize: 26, color: '#9a3412', fontWeight: 700 }}>
          <span>Оценка срочности</span>
          <span>•</span>
          <span>Рекомендации за 1 минуту</span>
          <span>•</span>
          <span>Не заменяет ветеринара</span>
        </div>
      </div>
    ),
    size
  )
}

