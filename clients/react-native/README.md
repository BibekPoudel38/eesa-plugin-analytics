# Eesa Analytics — React Native client

The Chups apps are React Native, not a website in a shell, so the web tracker
cannot be reused: it is built on `document`, `localStorage` and `matchMedia`,
none of which exist here.

What does carry over is the wire format. `/api/collect` is plain JSON over
HTTP and accepts a client with no `Origin` and no `Referer` — verified against
production. So there is **no SDK to install and no new endpoint to stand up**;
this one file is the whole integration.

## Install

Copy `eesa-analytics.js` into the app. It has **no dependencies**. If
`@react-native-async-storage/async-storage` is already present it is used to
persist the visitor id across launches; if not, the client degrades to
in-memory (every launch becomes a new visitor) rather than forcing a native
dependency into the build.

## Use

```js
import analytics from "./eesa-analytics";

// once, at startup
analytics.init({ siteKey: "eak_live_…" });

// on every navigation change
analytics.screen(route.name);

// on the taps worth measuring
analytics.click("add_to_cart", { screen: "/MenuScreen", text: "Add to cart" });

// anything else
analytics.track("meal_pass_viewed", { plan: "monthly" });

// after YOUR login, with YOUR user id
analytics.identify(user.id);
```

With React Navigation, one listener covers every screen:

```js
<NavigationContainer
  onStateChange={() => {
    const route = navigationRef.getCurrentRoute();
    if (route) analytics.screen(route.name);
  }}
>
```

## The one thing that will bite

`siteKey` **must** start with `eak_`. The ingest rejects any other key by
returning `{"ok":true,"accepted":0}` with HTTP **202** — deliberately
indistinguishable from success, which returns **200**. A wrong key therefore
collects nothing while looking perfectly healthy. If the dashboard shows no app
traffic after release, check the key before anything else.

## What it does on its own

- **Batches** events and flushes on a 4s debounce, or immediately at 50 events.
- **Flushes when the app backgrounds** (`AppState`), because a suspended app may
  never get another chance to run.
- **Retries** a failed send by putting the batch back at the front of the queue,
  capped at 500 events so a long offline stretch cannot grow without bound.
- **Never throws.** Every entry point swallows its own errors: analytics must
  not be able to crash the app it measures.

## How app traffic appears

Events arrive with `display_mode = "app"`, which is what separates them from a
phone browser — nothing else in the payload does. `browser` is left blank
because there is no browser, and that is the honest value.

```sql
select display_mode, count(distinct session_id) as sessions
from events
where site_id = '…' and ts > now() - interval '7 days'
group by 1;
```

| display_mode | meaning |
|---|---|
| `browser` | a normal mobile or desktop browser tab |
| `standalone` | chups.com installed to the home screen (PWA) |
| `app` | this client, inside the native app |
| `''` | captured before display mode was recorded |
