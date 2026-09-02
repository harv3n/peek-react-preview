import { useState } from "react";
import "./globals.css";

type StatusCardProps = {
  title: string;
  description: string;
};

export function StatusCard({
  title,
  description,
}: StatusCardProps) {
  const [active, setActive] = useState(false);

  return (
    <div className="w-96 rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
      <div className="flex items-start justify-between gap-4">
        <div>
          <span
            className={
              active
                ? "inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700"
                : "inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600"
            }
          >
            {active ? "Active" : "Inactive"}
          </span>

          <h2 className="mt-4 text-xl font-bold text-slate-900">
            {title}
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-500">
            {description}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setActive((value) => !value)}
        className="mt-6 w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
      >
        {active ? "Deactivate" : "Activate"}
      </button>
    </div>
  );
}

export const Preview = () => (
  <div className="min-h-screen bg-slate-100 p-10">
    <StatusCard
      title="Peek Preview"
      description="This component is rendered independently using React and Tailwind CSS."
    />
  </div>
);