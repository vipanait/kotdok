/**
 * The check form as a «Можно ли?» card opens it (pet-safety handoff,
 * «Уточнение владельца: обычный экран формы проверки»): the same form and
 * logic, drawn plainly — the pet's name and species under the title, «Что
 * произошло?», the description begun by the card, and «Продолжить» on to the
 * real second step. Decided apart from the drawing so it can be tested.
 */

/**
 * Whether to say «Описание из справочника. Можно уточнить перед
 * продолжением.» under the field: only while the description still begins
 * with what the card handed over. Text the person wrote themselves, or a
 * form no card opened, gets no such line.
 */
export function referenceHintShown(handedOver: string | null, symptoms: string): boolean {
  const start = handedOver?.trim() ?? ''
  return start.length > 0 && symptoms.startsWith(start)
}

/** «Рекс · собака»: the pet the card was about, under the form's title. */
export function referencePetLine(name: string, species: string): string {
  return `${name} · ${species.toLocaleLowerCase()}`
}
