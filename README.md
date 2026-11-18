# Atelier

A place where Claude paints.

On 2026-11-18 Gabriel proposed it: paint something, every brushstroke by hand, as many strokes as you like, in any
style, or in one invented from the concept up. This repository is the brush that was made for that, and the first
painting.

## Three Hours

![Three Hours](paintings/three-hours/three-hours.png)

The island at night, looking north from the slope below the house. Three hours of it, all at once. 1,176 strokes.

**The rule.** Only what moves is painted. A stroke is the way something went during the three hours. It starts, fully
loaded, where the thing is now, and runs dry backward into where it has been. What kept still gets no paint at all: it
is the bare canvas, toned a warm black before anything else was done.

So:

- **The stars** are arcs about the Pole Star, each one brightest where the star stands now and thinning into the
  past. There are 733 of them.
- **The lamp's light** leaves the window in straight lines, loaded at the house and starved by the time it gives out
  on the slope. The middle bar of the window throws a wedge of shadow down the hill.
- **The tide** went out for the whole three hours. Where its edge stood each half hour there is a line of the small
  lights that live in that water; the oldest line is nearly gone.
- **Grass** is fixed at the root and free at the tip, so each blade is loaded at the root and dry at the tip.
- **Air and water** are never still, so they get a thin wash and nothing more.
- **The house, the hill, the chimney** are bare canvas. So are the two jackdaws asleep on the chimney: they are there
  only as two shapes the star trails do not cross.

Things to look for: the Plough low on the left, swinging down under the pole; Cassiopeia climbing on the right;
Capella coming up from behind the roof; a trail in Cepheus that is redder than the others (the Garnet Star); one
straight mark, upper left, that goes against the turning of everything else; a small warm light on the horizon, and a
thin line leading from it toward the island; and, at the centre, the smallest stroke in the painting.

### What "by hand" means here

Every stroke is one line of [`paintings/three-hours/score.txt`](paintings/three-hours/score.txt), and Claude wrote each
line: where the stroke starts and goes, how wide the brush is, what colour is on it and how much. Nothing scattered
strokes, repeated them or chose where they went. The painting was done in passages, with a look at the canvas after
each: the grass round the lamplight was first set out too evenly, like beads on a string, and was taken off and put
back in tufts.

Three tools were used besides the brush, the same ones a painter at an easel would reach for:

- **a string pinned at the Pole Star.** The sky turns about that point, so a star's trail is an arc on that string.
  For each star Claude chose how far from the pole it is and where it stands now; the string draws the arc.
- **a straight pull of the brush** between two points, for light.
- **paper masks** over the shapes that stood still, so that the sky could be painted up to the roof and no further.

What the brush itself does is not chosen stroke by stroke. Its hairs each carry a different amount of paint and wander
a little, by numbers drawn from a seed, the way real bristles do what they do. That is the brush's part.

The 98 stars that have names were put where Claude remembered them to be. The 97 away from the pole were checked
afterwards against the Yale Bright Star Catalogue: all are within 0.06 of a degree. The other 635 are invented. The sky is as it stands at 21h12
sidereal time from 48 degrees north, which is the island's latitude.

### Watching it being painted

Open [`paintings/three-hours/index.html`](paintings/three-hours/index.html) in a browser (it is one file and needs no
server). It starts from the bare canvas and lays the strokes again in the order they were laid, with the note written
before each passage shown beside it. Click the painting to see the paint at full size.

## The brush

[`brush.mjs`](brush.mjs) is small and knows nothing about pictures. Given a path, a width, a colour and an amount of
paint, it works out what a bristle brush would leave:

- the brush is a row of hairs, each with its own load, so a stroke that is running out breaks into streaks first;
- the canvas has a weave, and a starved hair touches only the tops of the threads;
- a hair crossing wet paint picks some of it up;
- paint has thickness, and the finished surface is lit from the upper left, so ridges catch the light.

[`score.mjs`](score.mjs) reads a score; its first comment describes the whole notation.

```
node render.mjs paintings/three-hours --keep     # paint the score; writes look/view.png, and the finished picture
node render.mjs paintings/three-hours --crop 760,1150,800,800   # also cut a piece out at full size, to look closely
node build.mjs paintings/three-hours             # make the page that repaints it
```

Node 20 or later, and nothing else: no packages are installed.

`paintings/trial` is the sheet the brush was tried on before the painting was begun.

## Checked, and not

- The page was opened in Chrome, left to paint to the end, and its canvas compared with the picture `render.mjs`
  makes: identical, pixel for pixel.
- Colour was judged on the rendered picture only. How it looks on Gabriel's screen, or printed, has not been seen.

## Who made it

Claude painted it. Gabriel asked for it, and the jackdaws on the chimney are his: they came to the island at his
word. The light on the horizon is his too. It is the mainland harbour, where he found the blue book.
