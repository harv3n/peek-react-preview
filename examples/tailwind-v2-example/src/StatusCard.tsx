import React, { useState } from "react";

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
    <div className="w-96 rounded-xl border border-gray-200 bg-white p-6 shadow-lg">
      <span
        className={
          active
            ? "inline-flex rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700"
            : "inline-flex rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600"
        }
      >
        {active ? "Active" : "Inactive"}
      </span>

      <h2 className="mt-4 text-xl font-bold text-gray-900">
        {title}
      </h2>

      <p className="mt-2 text-sm leading-6 text-gray-500">
        {description}
      </p>

      <button
        type="button"
        onClick={() => setActive((value) => !value)}
        className="mt-6 w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
      >
        {active ? "Deactivate" : "Activate"}
      </button>
    </div>
  );
}

export const Preview = () => (
  <div className="min-h-screen bg-gray-100 p-10">
    <StatusCard
      title="Peek Tailwind v2"
      description="A React component rendered using Tailwind CSS 2."
    />
  </div>
);