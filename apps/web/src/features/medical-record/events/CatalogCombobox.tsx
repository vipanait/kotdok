'use client'

import { useEffect, useId, useRef, useState } from 'react'
import type { HealthProduct, PetSpecies, ProductKind } from '@lapka/contracts'
import { useTranslations } from '@/components/LocaleProvider'
import { browserApi } from '@/features/api/browser-api'
import { catalogOptions, productDetail, type CatalogOption } from './catalog-view'

/** Answers by search: the products, or that the search failed. */
type Answers = Record<string, HealthProduct[] | 'failed'>

/** How long typing pauses before a search is sent. */
const SEARCH_DELAY_MS = 200

/**
 * «Найти препарат» (web v1 «catalog», «dog-vaccine», «catalog-error»): a
 * combobox inside the form, not a sheet. On focus it lists the popular
 * products of this pet's species; typing searches by name, manufacturer and
 * alias. Two ways out are always offered — the owner's own name and «Без
 * препарата» — so a catalogue that fails or has nothing still lets the
 * record be made.
 *
 * Keyboard: ↓/↑ move through the list (opening it), Enter picks, Escape
 * closes. The input owns focus throughout; the active option is announced
 * through `aria-activedescendant`. A search the screen no longer needs — an
 * older query, another pet (the form is keyed by pet) — is aborted, and an
 * answer that arrives anyway is dropped.
 */
export default function CatalogCombobox({
  species,
  productKind,
  label,
  onPick,
  onManual,
  onNoProduct,
  disabled = false,
  inputRef,
}: {
  species: PetSpecies
  productKind: ProductKind
  label: string
  onPick: (product: HealthProduct) => void
  /** «Нет в списке — ввести название», with what was typed. */
  onManual: (typed: string) => void
  onNoProduct: () => void
  disabled?: boolean
  inputRef?: React.RefObject<HTMLInputElement | null>
}) {
  const dict = useTranslations()
  const words = dict.medicalRecord.catalog
  const id = useId()
  const listId = `${id}-list`
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [answers, setAnswers] = useState<Answers>({})
  const ownInput = useRef<HTMLInputElement>(null)
  const input = inputRef ?? ownInput

  const wanted = query.trim()
  const searchKey = `${species}:${productKind}:${wanted}`
  const answer = answers[searchKey]
  const known = Array.isArray(answer)

  useEffect(() => {
    // An answer already here is shown as it is; a failed one is asked again.
    if (!open || known) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      browserApi()
        .getCatalog(species, productKind, wanted, { signal: controller.signal })
        .then((products) => {
          if (!controller.signal.aborted) setAnswers((current) => ({ ...current, [searchKey]: products }))
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return
          console.warn('[medical-record] catalogue search failed', error)
          setAnswers((current) => ({ ...current, [searchKey]: 'failed' }))
        })
    }, wanted === '' ? 0 : SEARCH_DELAY_MS)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [open, known, searchKey, wanted, species, productKind])

  const status: 'loading' | 'failed' | 'ready' = answer === undefined ? 'loading' : answer === 'failed' ? 'failed' : 'ready'
  const products = Array.isArray(answer) ? answer : []
  const options = catalogOptions(products, wanted)
  const activeOption = active >= 0 && active < options.length ? options[active] : null

  function close() {
    setOpen(false)
    setActive(-1)
  }

  function choose(option: CatalogOption) {
    if (option.type === 'product') onPick(option.product)
    else if (option.type === 'manual') onManual(wanted)
    else onNoProduct()
    setQuery('')
    close()
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) {
        setOpen(true)
        setActive(e.key === 'ArrowDown' ? 0 : options.length - 1)
        return
      }
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActive((current) => (current + step + options.length) % options.length)
    } else if (e.key === 'Enter') {
      // Never submits the form from here: Enter picks, or does nothing.
      e.preventDefault()
      if (open && activeOption) choose(activeOption)
      else setOpen(true)
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault()
        e.stopPropagation()
        close()
      }
    } else if (e.key === 'Tab') {
      close()
    }
  }

  const popularTitle = words.popular[species]
  const announce =
    status === 'loading'
      ? words.loading
      : status === 'failed'
        ? words.failed
        : wanted !== '' && products.length === 0
          ? words.nothing.replace('{query}', wanted)
          : wanted !== ''
            ? words.found.replace('{n}', String(products.length))
            : ''

  return (
    <div className="catalog-combobox">
      <label className="field-label" htmlFor={`${id}-input`}>{label}</label>
      <input
        ref={input}
        id={`${id}-input`}
        className="input"
        type="text"
        role="combobox"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && activeOption ? `${id}-option-${active}` : undefined}
        placeholder={words.placeholder}
        value={query}
        disabled={disabled}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={(e) => {
          // A click inside the list keeps it: options take the mouse without taking focus.
          if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node | null)) close()
        }}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          setActive(-1)
        }}
        onKeyDown={onKeyDown}
      />
      <span className="sr-only" role="status" aria-live="polite">
        {open ? announce : ''}
      </span>
      <div className={open ? 'catalog-popup' : 'catalog-popup hidden'}>
        {status === 'failed' && <p className="banner error catalog-error">{words.failed}</p>}
        {status === 'loading' && <p className="catalog-note">{words.loading}</p>}
        {status === 'ready' && wanted === '' && products.length > 0 && <p className="catalog-note">{popularTitle}</p>}
        {status === 'ready' && wanted !== '' && products.length === 0 && (
          <p className="catalog-note">{words.nothing.replace('{query}', wanted)}</p>
        )}
        <ul id={listId} role="listbox" aria-label={label} className="catalog-list">
          {options.map((option, index) => (
            <li
              key={option.key}
              id={`${id}-option-${index}`}
              role="option"
              aria-selected={index === active}
              className={`catalog-option${option.type === 'product' ? '' : ' catalog-action'}${index === active ? ' active' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseMove={() => setActive(index)}
              onClick={() => choose(option)}
            >
              {option.type === 'product' ? (
                <>
                  <strong>{option.product.name}</strong>
                  <span>{productDetail(dict, option.product)}</span>
                </>
              ) : option.type === 'manual' ? (
                words.manual
              ) : (
                words.noProduct
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
