# UX / Interface polish notes

A running list of interface issues to address in focused polish passes. Add items here as
they come up so they're never lost — we tackle them in batches, not piecemeal.

## Workflow (agreed 2026-06-17)
- **Capture** issues here as noticed, so feature work isn't interrupted.
- **Fix immediately** only the cheap, clearly-right tweaks when already editing that screen.
- **Polish pass** after each cluster of features lands — layout reads best once a screen's
  content is complete (the plant detail/form order will shift as care notes, categories, and
  a journal get added, so hold field-ordering changes for then).

## Open
- [ ] **Plant detail + add/edit form:** move **Location data** (wild origin) up near the
      name/genus/species, not far down the field list. — Stephen, 2026-06-17
- [ ] **Browse / navigate view (bigger feature, not just polish):** a way to pick *just a
      genus* to show, or see a genus list AND a category list and click a group to jump to
      those plants. Today the list is genus-grouped with a category filter strip; this asks
      for a real navigable index (tap Drosera → see all Drosera; tap Carnivorous → see that
      group). Consider for a later phase. — Stephen, 2026-06-18
- [ ] **Category overflow:** the filter strip (list view) and the chip selector (add/edit
      form) both wrap onto multiple lines once there are many categories — gets messy. Handle
      gracefully (scrollable strip, "show more", or collapse). — Stephen, 2026-06-18
- [ ] **Category selection UX in the form:** the wrap-around chip selector looks messy;
      consider a dropdown / multi-select control instead. Decide once we know how many
      categories a typical user has. — Stephen, 2026-06-18

## Done
- (none yet)
