"use client";

import { useTransition } from "react";
import { deleteApplication } from "@/lib/actions/actions";

export default function DeleteApplicationButton({ applicationId }: { applicationId: number }) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!confirm("Delete this application? This can't be undone.")) return;
    startTransition(() => {
      deleteApplication(applicationId);
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="shrink-0 rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
    >
      {isPending ? "Deleting..." : "Delete"}
    </button>
  );
}
