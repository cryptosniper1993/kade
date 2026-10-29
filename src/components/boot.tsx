export function BootScreen({ label = "De kade wordt geladen" }: { label?: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-ink px-6 text-ivory">
      <div className="w-full max-w-md">
        <p className="font-display text-6xl text-ivory">KADE</p>
        <div className="mt-4 h-px w-24 bg-brass" />
        <p className="mt-4 text-sm text-mist">{label}</p>
      </div>
    </main>
  );
}
