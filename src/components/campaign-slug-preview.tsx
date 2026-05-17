"use client";

import { useEffect, useState } from "react";

import { slugifyCampaignName } from "@/lib/slugs";

type CampaignSlugPreviewProps = {
  inputName: string;
};

export function CampaignSlugPreview({ inputName }: CampaignSlugPreviewProps) {
  const [slug, setSlug] = useState("");

  useEffect(() => {
    const input = document.querySelector<HTMLInputElement>(
      `input[name="${inputName}"]`,
    );

    if (!input) {
      return;
    }

    function updateSlug() {
      setSlug(slugifyCampaignName(input?.value ?? ""));
    }

    updateSlug();
    input.addEventListener("input", updateSlug);

    return () => {
      input.removeEventListener("input", updateSlug);
    };
  }, [inputName]);

  return (
    <p className="text-xs text-zinc-500" aria-live="polite">
      Slug preview:{" "}
      <span className="font-mono text-zinc-700">{slug || "campaign-slug"}</span>
    </p>
  );
}
