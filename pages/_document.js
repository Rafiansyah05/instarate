import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="id">
      <Head>
        <meta charSet="utf-8" />
        <meta name="description" content="Rate akun Instagram lo pake AI! Roasting lucu + saran. Gratis, no login. by @rafiansya__" />
        <meta name="theme-color" content="#0a0a0f" />
        <meta property="og:title" content="InstaRate — Rate Akun Instagram Lo!" />
        <meta property="og:description" content="AI bakal nge-judge akun IG lo. Siap diroasting? " />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;1,9..40,400&display=swap" rel="stylesheet" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
