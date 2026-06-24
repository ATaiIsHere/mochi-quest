import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('zh-TW', { month: 'short', day: 'numeric' }).format(new Date(iso));
}

export function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.ceil((d.getTime() - now.getTime()) / 86400000);
  if (diff === 0) return '今天';
  if (diff === 1) return '明天';
  if (diff === -1) return '昨天';
  if (diff > 0) return `${diff} 天後`;
  return `${-diff} 天前`;
}
