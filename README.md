# IAAJ website — what's here and what's left

This is a plain HTML/CSS/JS site. No build tools, no Node.js needed. Open any `.html` file in a browser and it just works.

## Pages
- `index.html` — Home
- `about.html` — About
- `program.html` — Coaching Program
- `transformations.html` — Transformations
- `contact.html` — Contact / enquiry form

## Things marked as placeholders (swap in when ready)
- Instagram post images on `index.html` (currently a grey placeholder grid)

## Real content now in place
- Founder photo (`images/founder.jpg`) on `about.html`
- 7 real client transformation images (`images/transformation-1.jpg` ... `transformation-7.jpg`) on `transformations.html`, with 3 featured on `index.html`. These are pre-branded before/after graphics with faces blurred and no names. To add more, drop a new `transformation-N.jpg` into `images/` and add one `<img>` line to the `.transformation-gallery` in `transformations.html`.

## Things you still need to connect
1. **Enquiry form** (`contact.html`): sign up free at formspree.io, create a form, and replace `YOUR_FORM_ID` in the form's `action` attribute with your real Formspree form ID. Until then the form shows a friendly warning instead of failing silently.
2. **Analytics**: once you have a Google Analytics ID and a Meta Pixel ID, add their script snippets in the `<head>` of each HTML page (there's a comment marking where).

## WhatsApp number
The WhatsApp button links to `+91 9403912211`. If this number ever changes, search and replace `919403912211` across all `.html` files.

## Logo
`images/logo-icon-on_light.png` (dark icon, used in the white header) and `images/logo-icon-on_dark.png` (white icon, used on black backgrounds/footer) were extracted from the real logo file (`Downloads/new logob.pdf`). The favicon was generated from the same source. If the logo changes, these three files need to be regenerated from the new artwork.

## Program details source
Program content (BLESS 90, the BLESS Method, pricing, credibility) is confirmed against `Downloads/BLESS_90_Brochure.pdf`, the real client brochure. Pricing itself is intentionally not published on the site (see IAAJ_Website_Brief.md) — the FAQ and a dedicated section redirect pricing questions to WhatsApp instead.
