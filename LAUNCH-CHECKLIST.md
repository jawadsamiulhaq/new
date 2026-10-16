# Launch checklist — BurChips × Bake Dukan online ordering

Everything to do before the website takes real orders. Tick each box as you go.

## 1. Accounts to open (start now — some take days)

- [ ] **Domain name** — e.g. `burchips.pk` (PKNIC resellers, ~Rs 2–3k/year) or `.com`.
- [ ] **Microsoft Azure account** — for hosting. Your developer follows `infra/README.md`.
- [ ] **SMS company** (e.g. Veevo Tech, EOcean) — sends the 6-digit sign-in code to customers.
      Register a sender name ("BurChips") if they offer it. *Online ordering can't sign customers in until this is connected.*
- [ ] **WhatsApp Business (Meta)** on a dedicated SIM — for new-order alerts to your phone.
      Ask your developer to submit the `new_order_alert` message template for approval.
- [ ] **Cloudflare Turnstile** (free) — stops bots from wasting your SMS credit.
- [ ] **PayFast** merchant application — for card / JazzCash / EasyPaisa payments (Phase 4).
      They usually need the live website and its policy pages, so apply once the site is up.

## 2. Check your shop details in the admin panel (`/admin`)

- [ ] **Settings & hours → Opening hours** — replace the placeholder 12 PM – 2 AM with your real hours.
- [ ] **Delivery areas** — add your real areas, delivery fees and minimum orders
      (development samples are not copied to the live site).
- [ ] **Settings** — phone, WhatsApp number, address, delivery/pick-up time estimates, free-delivery amount (optional).
- [ ] **Menu** — check every price and description; add photos (a phone photo on a plain background works well;
      a professional shoot later makes a big difference).
- [ ] **Options & sauces** — check drink flavours and sauces match what you actually stock.
- [ ] **Popular picks** — star the items you want on the home page.
- [ ] **Promo code** — e.g. `FIRST10`: 10% off, first order only, to move customers from delivery apps to your own site.
- [ ] **Staff** — create an account for each counter person (role: Staff). Change your own temporary password.

## 3. Read and approve the policies

The site has draft **Privacy, Terms, Refunds & Cancellations** and **Delivery** pages (links in the footer),
written to match how the site works. Read them, and change anything that doesn't match how you run the shop
(for example the 1-hour complaint window or rider waiting time). Have a lawyer look at them if you can.

## 4. Counter setup

- [ ] A tablet or PC at the counter, plugged in, with **Microsoft Edge or Chrome**.
- [ ] Open `yourdomain/admin`, sign in, tap **Start shift** — the bell rings until each new order is accepted.
- [ ] Turn the device volume up and switch off its sleep timer if possible.
- [ ] Practise: accept → start preparing → out for delivery / ready → delivered; and rejecting with a reason.
- [ ] Use the **pause switch** (top right) when the kitchen is overloaded.

## 5. Soft launch (one week)

- [ ] Place 5 test orders yourself from your phone (delivery and pick-up). Check the bell rings and the WhatsApp alert arrives every time.
- [ ] Share the link with family and regular customers first; fix anything confusing.
- [ ] Then add the link to Instagram, Facebook, Google Business Profile and your printed menu / flyers (a QR code works well).

## 6. After launch

- [ ] Look at **Reports** weekly — top items, busy days, cash vs online.
- [ ] Keep the menu accurate: switch items **sold out** instead of rejecting orders.
- [ ] When PayFast is approved, ask your developer to start **Phase 4** (online payments).
