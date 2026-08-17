import { HydrationScript } from '@solidjs/web';
import type { ParentProps } from 'solid-js';

export default function Document(props: ParentProps) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta
          name="description"
          content="A proof of concept for Serial's Solid 2 signal graph."
        />
        <title>Serial Solid 2 PoC</title>
        <HydrationScript />
      </head>
      <body>{props.children}</body>
    </html>
  );
}
