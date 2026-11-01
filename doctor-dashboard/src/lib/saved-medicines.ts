import type { RxItemDraft } from './prescription-limits';

/** A doctor's saved medicine as the prescription form uses it (doctor_saved_medicines, 0055). */
export type SavedMedicine = RxItemDraft & { id: string };

export const SAVED_MEDICINE_COLUMNS = 'id, medicine, brand, strength, dose, frequency, duration, route, timing, notes';

export type SavedMedicineRow = { id: string } & { [K in keyof RxItemDraft]: string | null };

export function toSavedMedicine(r: SavedMedicineRow): SavedMedicine {
  return {
    id: r.id,
    medicine: r.medicine ?? '',
    brand: r.brand ?? '',
    strength: r.strength ?? '',
    dose: r.dose ?? '',
    frequency: r.frequency ?? '',
    duration: r.duration ?? '',
    route: r.route ?? '',
    timing: r.timing ?? '',
    notes: r.notes ?? '',
  };
}
