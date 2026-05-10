const getIconIndex = <T extends number>(
  x: T,
  width: number,
  itemsLength: number,
) => {
  "worklet";
  if (width <= 0) return -1;
  return (x / width) * itemsLength - 0.5;
};

export { getIconIndex };
