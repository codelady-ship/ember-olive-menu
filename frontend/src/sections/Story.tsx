import * as React from "react"

/**
 * The menu story film: a vertical 9:16 clip at public/promo/menu-story.mp4,
 * with public/promo/menu-story-poster.webp shown until it plays, or instead of
 * it when the clip is not there yet.
 */
export default function Story() {
  const base = import.meta.env.BASE_URL
  const [hasVideo, setHasVideo] = React.useState(true)
  return (
    <section id="story" className="band" aria-labelledby="story-h">
      <div className="wrap story">
        <div>
          <p className="kicker">The menu, in motion</p>
          <h2 id="story-h" className="h2">
            From the <em>page</em> to the plate
          </h2>
          <p className="lead">
            The leather menu opens on the walnut table, the pages turn, and each dish lifts out of the paper: the tagliatelle still steaming, the Ruby Citrus Fizz catching the lamp.
          </p>
          <a className="btn" href="#reserve">
            Book a table
          </a>
        </div>
        <figure className="story-frame" style={{ margin: 0 }}>
          {hasVideo ? (
            <video controls playsInline muted loop preload="none" poster={base + "promo/menu-story-poster.webp"} aria-label="Film: the Ember & Olive menu opening and its dishes rising from the page">
              <source src={base + "promo/menu-story.mp4"} type="video/mp4" onError={() => setHasVideo(false)} />
            </video>
          ) : (
            <img src={base + "promo/menu-story-poster.webp"} alt="The Ember & Olive menu on a walnut table, a plate of truffle tagliatelle rising from its page" loading="lazy" width={720} height={1280} />
          )}
        </figure>
      </div>
    </section>
  )
}
