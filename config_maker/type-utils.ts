type MapTuple<T extends readonly any[], U> = {
  [K in keyof T]: U
}
export function mapTuple<T extends readonly any[], U>(
  tuple: T,
  fn: (value: T[number]) => U
) : MapTuple<T,U> {
  return tuple.map(fn) as any;
}

export function assertType<T>(
  value: unknown,
  check: (v: unknown) => v is T,
  message: string = "Type assertion failed"
): asserts value is T {
  if (!check(value)) {
    throw new TypeError(message)
  }
}
export const isString  = (v: unknown): v is string  => typeof v === "string"
export const isNumber  = (v: unknown): v is number  => typeof v === "number"
export const isBigInt  = (v: unknown): v is bigint  => typeof v === "bigint"
export const isBoolean = (v: unknown): v is boolean => typeof v === "boolean"
export const isSymbol  = (v: unknown): v is symbol  => typeof v === "symbol"
export const isObject  = (v: unknown): v is object  => typeof v === "object"