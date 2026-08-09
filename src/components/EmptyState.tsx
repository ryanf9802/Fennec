import { Gamepad2 } from 'lucide-react';
import { Link } from 'react-router-dom';

export function EmptyState() {
  return (
    <div className="surface rounded-3xl px-6 py-14 text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-cyan-400/10 text-fennec-cyan">
        <Gamepad2 className="size-7" />
      </div>
      <h2 className="mt-5 text-xl font-extrabold">Ready for kickoff</h2>
      <p className="text-muted mx-auto mt-2 max-w-md">
        Start Rocket League after enabling its Stats API. Fennec will
        automatically build your game timeline and sessions.
      </p>
      <Link className="button-primary mt-6" to="/setup">
        Open setup guide
      </Link>
    </div>
  );
}
