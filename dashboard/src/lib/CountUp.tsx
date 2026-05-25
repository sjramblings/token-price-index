import { useEffect, useState } from "react";
import { fmt } from "./format";

interface CountUpProps {
  to: number;
  suffix?: string;
}

export function CountUp({ to, suffix = "" }: CountUpProps): JSX.Element {
  const [value, setValue] = useState(0);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const duration = 1400;
    const tick = (now: number): void => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(to * eased));
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to]);

  return (
    <span className="num-display">
      {fmt.format(value)}
      {suffix}
    </span>
  );
}
