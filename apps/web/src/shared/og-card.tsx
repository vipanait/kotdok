import { ImageResponse } from 'next/og'
import { siteName } from '@/shared/seo'

export const ogSize = { width: 1200, height: 630 }

/**
 * The site's social preview, as one template: the home page fills it with
 * the product pitch, each article with its own title.
 */
export function renderOgCard({ title, description, tags }: { title: string; description: string; tags: string[] }) {
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
            {title}
          </div>
          <div style={{ fontSize: 32, lineHeight: 1.3, maxWidth: 840, color: '#4b5563' }}>
            {description}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 18, fontSize: 26, color: '#9a3412', fontWeight: 700 }}>
          {tags.flatMap((tag, i) => (i === 0 ? [<span key={tag}>{tag}</span>] : [<span key={`dot-${i}`}>•</span>, <span key={tag}>{tag}</span>]))}
        </div>
      </div>
    ),
    ogSize
  )
}

