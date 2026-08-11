import { Gamepad2 } from 'lucide-react';

export function EmptyState() {
  return (
    <section
      aria-labelledby="empty-timeline-heading"
      className="surface rounded-3xl px-6 py-14 text-center"
    >
      <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-cyan-400/10 text-fennec-cyan">
        <Gamepad2 className="size-7" />
      </div>
      <h2 id="empty-timeline-heading" className="mt-5 text-xl font-extrabold">
        Ready for kickoff
      </h2>
      <p className="text-muted mx-auto mt-2 max-w-md">
        Start Rocket League and play a match. Fennec will automatically build
        your game timeline and sessions.
      </p>
    </section>
  );
}
