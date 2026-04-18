const merge = <T extends Record<string, unknown>>(
  partial: Partial<T> | undefined,
  defaults: T,
): T => {
  return { ...defaults, ...partial } as T;
};

export { merge };
