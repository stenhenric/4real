import mongoose from 'mongoose';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function trustNestedOperators<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => trustNestedOperators(entry)) as T;
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const nextValue = Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, trustNestedOperators(entry)]),
  );

  return Object.keys(nextValue).some((key) => key.startsWith('$'))
    ? mongoose.trusted(nextValue) as T
    : nextValue as T;
}

export function trustFilter<T extends object>(filter: T): T {
  return mongoose.trusted(trustNestedOperators(filter)) as T;
}
