/**
 * "herself" / "himself" from the child's recorded sex; "themselves" when it
 * isn't recorded (R2-08: a girl was called "themselves").
 */
export function reflexive(sex: string | null | undefined): string {
  if (sex === 'female') return 'herself';
  if (sex === 'male') return 'himself';
  return 'themselves';
}
