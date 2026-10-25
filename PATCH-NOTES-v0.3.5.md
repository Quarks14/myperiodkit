# My Period Kit Insights Portal | UI fix v0.3.5

**Applies on:** v0.3.4 Engagement & Reach reporting interface.
**Scope:** Frontend only. No changes to Django, database, credentials, role permissions, metrics calculations, or source API URL.

## Fixes

1. **Filter dialog overlays the map correctly.** The shared report filter dialog is mounted via React portal under `document.body`, above Leaflet panes, rather than inside the clipped reporting page. A map-local stacking context provides a second safeguard.
2. **Keyboard-friendly modal.** Escape closes the dialog; Tab/Shift+Tab stay inside; focus returns to Edit filters after closing; background body scrolling is locked while open.
3. **Map fills its panel.** The Engagement & Reach geographic map grows within the left panel instead of leaving a large unused gap beneath the map. A ResizeObserver recalculates Leaflet dimensions after panel size changes.
4. **Desktop and mobile layouts.** Compact laptop-height displays give more room to the map while preserving the fixed-height desktop workspace. Mobile uses a fixed-height map and full-screen filter form.

## Installation on macOS (PyCharm terminal)

Stop React dev server if necessary. From your project root:

```bash
cd ~/Documents/Project/periodkit-insights-starter
mkdir -p backups
cp -R frontend/src "backups/frontend-src-pre-v0.3.5-$(date +%Y%m%d-%H%M%S)"
unzip -o ~/Downloads/periodkit-insights-ui-v0.3.5-map-modal-fix.zip -d .
cd frontend
npm run build
npm run dev
```

If Vite is already running, refresh the browser with Cmd+Shift+R. No Django migrations or restart are required for this patch.

## Manual checks

- Navigate to Engagement & Reach > Map & locations; the map should fill the left panel and show a short location-privacy note below.
- Open **Edit filters**; verify map tiles and markers stay behind the filter dialog.
- Select one or more filters and Apply. Confirm the same filters still update your dashboard and exports.
- Close the dialog using Escape and the close button; check keyboard focus returns to Edit filters.
- Check on laptop and mobile widths. Scrolling inside the filter list is intentional; the normal desktop reporting page should not require scrolling at approximately 1280 x 800 and larger.

## Verification note

Static layout checks used the real updated stylesheet with a simulated high-z-index map layer. No live source API or participant records were used. React dependency installation timed out in the packaging environment, so the final TypeScript build must be verified locally on the MacBook.
