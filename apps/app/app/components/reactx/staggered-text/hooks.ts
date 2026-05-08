// NOT IN USE
// will be removed in the future, as the auto play feature is not needed for now.

import { useRef, useEffect } from "react";

const useAutoPlay = <T extends number>(
  textCount: T,
  onIndexChange?: <I extends number>(_index: I) => void,
) => {
  const indexRef = useRef<number>(0);

  useEffect(() => {
    if (textCount <= 1) return;

    const id = setInterval(() => {
      indexRef.current = (indexRef.current + 1) % textCount;
      onIndexChange?.(indexRef.current);
    }, 3000);

    return () => clearInterval(id);
  }, [textCount, onIndexChange]);
};

export { useAutoPlay };
