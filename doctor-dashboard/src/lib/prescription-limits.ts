/** Prescription field limits: the form's maxLength and the server's check. */
export const RX_LIMITS = {
  medicine: 120,
  dose: 80,
  frequency: 80,
  duration: 80,
  itemNotes: 300,
  notes: 1000,
} as const;
