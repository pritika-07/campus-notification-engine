import { v4 as uuidv4 } from 'uuid';

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export function generateStepId(name: string, attempt = 0): string {
  const base = slugify(name).slice(0, 40) || 'step';
  const suffix = attempt === 0 ? '' : `-${uuidv4().slice(0, 8)}`;
  return `${base}${suffix}`;
}
