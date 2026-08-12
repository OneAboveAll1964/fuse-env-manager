export type PasswordStrength = {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  suggestions: string[];
};

const LABELS = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'];

export function passwordStrength(password: string): PasswordStrength {
  const suggestions: string[] = [];
  let score = 0;

  if (password.length >= 12) score += 1;
  else suggestions.push('Use at least 12 characters');
  if (password.length >= 18) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  else suggestions.push('Mix upper and lower case');
  if (/\d/.test(password)) score += 0.5;
  else suggestions.push('Add a digit');
  if (/[^A-Za-z0-9]/.test(password)) score += 0.5;
  else suggestions.push('Add a symbol');
  if (/^(.)\1+$/.test(password) || /^(?:1234|abcd|qwerty|password)/i.test(password)) score = 0;

  const clamped = Math.max(0, Math.min(4, Math.round(score))) as 0 | 1 | 2 | 3 | 4;
  return { score: clamped, label: LABELS[clamped], suggestions };
}
