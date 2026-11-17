# Credits

## Dish photographs

The four featured dishes are real photographs from Wikimedia Commons. Each was
cut out to transparency (the plate's ellipse straightened to a top-down circle;
the drink keyed off its black background), resized to 1024 px WebP, and given a
generated height map, by `tools/prepare-assets.mjs`. The cut-outs and height maps
are adaptations and carry the same licence as their source.

| Book file | Source | Author | Licence |
|---|---|---|---|
| `frontend/public/menu/truffle-tagliatelle.webp`, `-depth.webp` | [Tagliatelle al tartufo.jpg](https://commons.wikimedia.org/wiki/File:Tagliatelle_al_tartufo.jpg) | GastRomagna | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `frontend/public/menu/eggs-benedict.webp`, `-depth.webp` | [Eggs Benedict - the M&S Café.jpg](https://commons.wikimedia.org/wiki/File:Eggs_Benedict_-_the_M%26S_Caf%C3%A9.jpg) | Andy Li | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `frontend/public/menu/fish-and-chips.webp`, `-depth.webp` | [Fish and chips plate with peas.jpg](https://commons.wikimedia.org/wiki/File:Fish_and_chips_plate_with_peas.jpg) | Grendelkhan | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) (the adapted cut-out and height map are shared under CC BY-SA 4.0 too) |
| `frontend/public/menu/ruby-citrus-fizz.webp`, `-depth.webp` | [Red cocktail in stylish glass with ice and orange slice on top.jpg](https://commons.wikimedia.org/wiki/File:Red_cocktail_in_stylish_glass_with_ice_and_orange_slice_on_top.jpg) | Shixart1985 | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) |

`frontend/public/og.jpg` and `frontend/public/promo/menu-story-poster.webp` are
composites of these cut-outs (same licences), made by `tools/make-promo.mjs`.

To rebuild: download the originals into `tools/sources/` with the file names in
`tools/prepare-assets.mjs`, then `cd tools && npm install && npm run assets`.

## Code

- Page-turning mechanics adapted from the **Biryani Legends Template** by
  Kedhareswer Naidu, MIT licence
  ([live demo](https://kedhar-components.pages.dev/#biryani-legends-template)).
  See `LICENSE` for the notice. None of its content, engravings or embedded
  images are used here.
- [three.js](https://threejs.org) (MIT), [GSAP](https://gsap.com) (standard
  no-charge licence), React (MIT).

## Type

Cormorant Garamond, Crimson Pro and Allura, from Google Fonts (SIL Open Font
Licence).
