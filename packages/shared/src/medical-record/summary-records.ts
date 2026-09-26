import type { VetSummary } from '@lapka/contracts'

/**
 * How many entries of a vet summary the symptom check would read: current
 * courses, diseases with a shot or a plan, treatments, visits of the year,
 * dated weights. The server includes the medical record when this is above
 * zero, and the app says «Учтём медкарту» by the same rule (MR-10).
 */
export function summaryRecords(summary: Pick<VetSummary, 'weights' | 'medications' | 'vaccinations' | 'parasites' | 'visits'>): number {
  return (
    summary.medications.length +
    summary.vaccinations.filter((row) => row.last_done || row.next).length +
    summary.parasites.filter((row) => row.last_done || row.next).length +
    summary.visits.length +
    summary.weights.filter((weight) => weight.measured_on).length
  )
}
