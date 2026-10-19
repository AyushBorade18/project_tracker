import dynamic from "next/dynamic";

// The app is fully client-side (auth + realtime), so it is never rendered on the server.
const AppRoot = dynamic(() => import("../components/AppRoot"), { ssr: false });

export default function Home() {
  return <AppRoot />;
}
