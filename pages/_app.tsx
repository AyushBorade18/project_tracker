import React, { useEffect } from "react";
import type { AppProps } from "next/app";
import Head from "next/head";
import "@fontsource/barlow-condensed/500.css";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "../styles/globals.css";

export default function App({ Component, pageProps }: AppProps) {
  useEffect(() => {
    // Offline shell + installability. Production only, so local development is never served from a cache.
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => { /* app works fine without it */ });
    }
  }, []);
  return (
    <>
      <Head>
        <title>ProjectTrack: team project tracker</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
        <meta name="description" content="Track subject deliverables, submissions and approvals for your college project team." />
      </Head>
      <Component {...pageProps} />
    </>
  );
}
