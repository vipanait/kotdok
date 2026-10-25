import ru from '@/shared/i18n/dictionaries/ru'

/**
 * What every article says about itself, near the top and again at the end:
 * information for an owner deciding how fast to act, not a vet's advice. The
 * second sentence is the app's own disclaimer, word for word.
 */
export const ARTICLE_NOTICE = 'Это информационная проверка симптомов, а не ветеринарная консультация.'

export default function Disclaimer({ compact = false }: { compact?: boolean }) {
  return (
    <p className={compact ? 'footnote article-disclaimer' : 'banner article-disclaimer'}>
      {ARTICLE_NOTICE} {ru.check.disclaimerFallback}
    </p>
  )
}
