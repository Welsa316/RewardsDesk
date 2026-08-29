# Google Stitch prompt — MSY Best Parking home page

Paste everything below the line into Stitch. Set the target to **mobile web**
first, then ask it for the desktop variant.

---

Design a mobile-first home page for **MSY Best Parking**, a self-service
parking and loyalty sign-up site for a single airport hotel in New Orleans.
It is a website, not an app — there is nothing to download.

## Who opens this and where

Almost every visitor is standing outside in a parking lot in Louisiana, on
their phone, on patchy hotel wifi, often in heat or rain, frequently in a
hurry to catch a shuttle to the airport. Many are over 50. They arrive one of
three ways: scanning a QR code on a parking sign, texting PARK to a toll-free
number and tapping the link they get back, or typing the domain in directly.

Assume one hand, sunlight on the screen, and no patience. Large tap targets,
high contrast, no small grey text.

## What the page must do

Exactly two things, and the first matters more:

1. **Pay for Parking** — the primary action. Leads to a short form: licence
   plate, state, phone, how many days, then card payment.
2. **Rewards Enrollment** — secondary. Leads to a form to join the hotel's
   loyalty programme, which the front desk completes at check-in.

Present these as two large, obviously tappable cards. Stacked full-width on
mobile, side by side on desktop. Parking should read as the primary of the two
through size, colour or position — not by hiding the other one.

Below the cards, a help block with a **tappable phone number** and a
**tappable email address**.

There is also a slot above the two cards where a promotional image banner
sometimes appears — a seasonal parking offer, roughly 3:1 landscape. Design
for it present and absent; the page must not look broken or unbalanced when
there is no promo, which is most of the time.

## Brand and visual direction

Use exactly these colours:

- Deep navy `#0F1B2D` — headers, primary surfaces, body text
- Brand maroon `#680018` — the single accent, used for the primary action
- Warm off-white `#FBF8F3` — page background
- Sand `#E8DDD0` — borders and dividers
- Warm slate `#4A5568` — secondary text

Type: **Inter** for UI and body, **IBM Plex Serif** for headings only.

The feel should be calm, warm and slightly upscale — a well-run hotel, not a
parking garage and not a tech startup. Generous spacing. One accent colour
only.

## Hard constraints — these will get the design rejected

- **No hotel chain logo, wordmark, or brand name anywhere.** The parking
  product is deliberately unbranded; guests must not see a chain identity.
  Use the supplied MSY Best Parking logo as the wordmark — a horizontal
  lockup, winged "P" mark to the left of two lines of type, in the maroon
  above. Do not invent a different logo.
- The footer must carry this line verbatim, in small text:
  *"Each BWH Hotels branded hotel is independently owned and operated."*
- Footer also needs small links: Text service, Terms of Service, Privacy Policy.
- No stock photography of people. No photos of cars or garages.
- No gradient blobs, ambient glows, or multi-colour gradients.
- No emoji used as icons.
- Do not add a navigation bar, hamburger menu, hero carousel, testimonials,
  pricing table, FAQ, or "About us" section. This page has two jobs.
- No login or account controls — staff sign in at a separate address that
  guests never see.

## Copy to use

- Wordmark: `MSY Best Parking`
- Supporting line: `Pay for parking or join the rewards program — no app to download.`
- Card 1 title: `Pay for Parking`
- Card 1 body: `Enter your plate, choose how long you're staying, and pay by card. You'll get a link to check your time or add more.`
- Card 2 title: `Rewards Enrollment`
- Card 2 body: `Sign up for the hotel's loyalty program. Fill in your details here and the front desk finishes it at check-in.`
- Help heading: `Need help?`
- Phone: `(504) 360-2990`
- Email: `bwpairport189@gmail.com`

## Deliverables

1. Mobile portrait, 375px wide — with a promo banner and without.
2. Desktop, 1280px wide — the two cards side by side. Desktop should not be
   the phone layout stretched: use the width for a genuine two-column
   composition rather than a centred narrow column.
3. Show the hover and pressed states for both cards.
