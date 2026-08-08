export function LocalNetworkAccessHelp() {
  return (
    <div className="surface-strong rounded-xl p-4 text-sm">
      <strong>Allow local network access</strong>
      <p className="text-muted mt-1">
        Chrome or Edge will ask whether Fennec can find and connect to devices
        on your local network. Choose Allow so Fennec can read Rocket League's
        loopback Stats API.
      </p>
      <p className="text-muted mt-2">
        If you previously blocked it, open the site controls beside the address,
        set Local network access to Allow, then reload Fennec.
      </p>
    </div>
  );
}
