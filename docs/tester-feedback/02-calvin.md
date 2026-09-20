# Tester feedback: Calvin (4th year CSE)

## Review

> UI is good and the graph interpretation is little more complex.

## What this tells us

The score graph shows too much at once: 14 topics, every link, a colour wash, shapes, ring thickness and
badges, with no plain explanation of what a topic is.

## What we did

Three commits, all after a walkthrough of the graph screen.

1. **Topic descriptions** (`7127900`). All 14 topics already carried a description. The detail panel now
   shows it under an "About this topic" label, and each list row shows it on a second line. The text is
   unchanged: it is still a syllabus keyword list, not a plain-language sentence.
2. **Simpler default presentation** (`4fd8534`).
   - The screen now opens on the **List**. The Map is still one click away.
   - The List is grouped into the five units as collapsed clusters. A unit opens by itself when it holds the
     recommended topic, the selected topic or a filtered unit.
   - On the Map, links are almost invisible until a topic is selected or hovered. Then only that topic's own
     links are shown.
   - The red, amber and green wash behind the map now appears only once all 14 topics are checked.
3. **Reachability** (`159da19`). Small topics on the Map were only a few pixels wide when the map is zoomed
   out. Every topic now has a 24 pixel click and hover area, and the legend is closed by default so it does
   not cover topics on the right.

## What we did not do

- The Map is not clustered. Collapsing groups on a force-drawn canvas is a much larger change, so the Map
  keeps its per-unit filter.
- Topic descriptions were not rewritten into plain sentences, because the question generator reads them as
  context.

## Status

Partly open. A tester still reported that some Map topics could not be hovered or clicked after the
reachability change. A scripted browser check at one window size (1400 by 800) reached all 14 topics, so the
cause may depend on window size. It is being investigated. The List always lets you select every topic.
