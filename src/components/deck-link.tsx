import { useEffect, useState } from "react";
import { previewPathPrefix } from "@/lib/preview-path-prefix";

function href(file: string): string {
  if (typeof window === "undefined") return `/${file}`;
  const prefix = previewPathPrefix(window.location.hostname, window.location.pathname) ?? "";
  return `${prefix}/${file}`;
}

export function DeckLink() {
  const [pptx, setPptx] = useState("/kade-oprichter.pptx");
  const [pdf, setPdf] = useState("/kade-oprichter.pdf");
  const [zip, setZip] = useState("/kade.zip");

  useEffect(() => {
    setPptx(href("kade-oprichter.pptx"));
    setPdf(href("kade-oprichter.pdf"));
    setZip(href("kade.zip"));
  }, []);

  return (
    <div className="flex flex-wrap gap-2">
      <a href={pptx} download="KADE-voor-de-oprichter.pptx" className="inline-flex min-h-11 items-center rounded-sm bg-brass px-4 text-sm font-medium text-brass-ink">
        PowerPoint
      </a>
      <a href={pdf} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-sm border border-line px-4 text-sm">
        Slides
      </a>
      <a href={zip} download="kade.zip" className="inline-flex min-h-11 items-center rounded-sm bg-brass px-4 text-sm font-medium text-brass-ink">
        kade.zip
      </a>
    </div>
  );
}
