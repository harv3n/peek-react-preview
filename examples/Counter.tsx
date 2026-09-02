import { useState } from "react";
import "./counter.css";

export interface CounterProps {
  initialValue?: number;
}

export function Counter({ initialValue = 0 }: CounterProps) {
  const [count, setCount] = useState(initialValue);

  return (
    <div className="preview-counter">
      <strong>Count: {count}</strong>
      <button type="button" onClick={() => setCount((value) => value + 1)}>
        Increment
      </button>
    </div>
  );
}

export const Preview = () => <Counter initialValue={3} />;
