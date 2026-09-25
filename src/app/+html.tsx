import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * Root HTML for the static web export. The Content-Security-Policy is added
 * after export by scripts/postexport-pages.mjs, which hashes the exact inline
 * scripts in each page.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="referrer" content="no-referrer" />
        <meta name="robots" content="noindex" />
        <meta name="color-scheme" content="light dark" />
        <meta name="description" content="Private, offline-first bill and subscription tracker." />
        <title>Budget Bill</title>
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
