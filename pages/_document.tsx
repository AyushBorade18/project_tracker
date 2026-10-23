import { Html, Head, Main, NextScript } from "next/document";

// Applies the theme before first paint so there is no light/dark flash. Light is the default.
const themeScript = `
try {
  var p = localStorage.getItem('projecttrack-theme-pref');
  if (p !== 'light' && p !== 'dark' && p !== 'system') p = 'light';
  var t = p === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : p;
  document.documentElement.setAttribute('data-theme', t);
} catch (e) { document.documentElement.setAttribute('data-theme', 'light'); }
`;

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" type="image/png" sizes="64x64" href="/icons/favicon-64.png" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <meta name="theme-color" content="#101B38" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="ProjectTrack" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
