import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Utility to generate a sketchy path for Rough.js (reusable IDs)
export const getSketchySeed = () => Math.floor(Math.random() * 1000000);
