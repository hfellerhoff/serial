---
title: "Saving and Organizing Bookmarks"
description: "Save readable pages with the Serial browser extension and organize them alongside your feeds."
icon: "bookmark"
publish_date: "2026-08-02"
public: true
---

Serial Bookmarks keep articles and other pages in the same views and tags as
your Feed items. Use the browser extension when you want to save the page you
are currently reading.

## Connect the extension

Open the Serial extension and choose your Serial instance. The hosted service
is available by default; you can also enter the HTTPS origin of a self-hosted
instance. Review the approval page and select **Connect extension**.

The browser asks for access to that one Serial origin. It does not give the
extension permanent access to every page you visit.

## Save a page

Open the page, select the Serial extension, and save it as a Bookmark. Serial
prefers the readable content extracted from the live page because it best
reflects what you can see. If that capture is unavailable, Serial can use a
bounded server-side extraction instead.

Saving the same canonical page again refreshes its capture instead of creating
a duplicate. A new save or re-save starts reading progress from the beginning.

The popup may also offer Feeds declared by the page. If the page declares none,
Serial can search for a matching public Feed after the Bookmark has already
been saved. Adding a Feed waits for its first bounded ingestion attempt before
the popup reports that it was added.

## Organize it

Toggle views and tags in the popup to assign the saved Bookmark. Each toggle is
written immediately, so one slow assignment does not hold up another. Creating
a new view or tag and assigning the Bookmark are two separate actions; if the
assignment fails, the new view or tag still exists and can be selected again.

Bookmarks and Feed items appear together. When both represent the same
canonical URL, the Bookmark is the saved copy Serial shows, including when the
matching Feed item was loaded in a different page or view.

## Privacy

The extension sends your chosen Serial server the active page URL, extracted
metadata, sanitized readable content when available, and declared Feed links.
It does not send page cookies, credentials, request headers, the raw DOM, or the
original page source.

Serial loads remote artwork and article images lazily and without an HTTP
referrer. The image host can still observe your IP address and request time
because the browser connects to it directly. A privacy-preserving image proxy
is planned for a future release.
