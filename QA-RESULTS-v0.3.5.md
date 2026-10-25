# v0.3.5 QA summary

## Completed

- TSX syntax parsed for `ReportFilters.tsx` and `LocationMap.tsx` with TypeScript `transpileModule`: PASS.
- CSS parsed with PostCSS: PASS.
- Browser layout simulation using updated CSS and high-z-index map pane, at 1536x900, 1280x800 and 390x844: PASS.
- Filter dialog appears above simulated Leaflet pane at all three viewports: PASS.
- Desktop map card leaves approximately 17px below the map note (normal panel padding): PASS.
- Map content height at 1536x900: 247px; at 1280x800: 215px; at mobile 390x844: 285px.
- No document-level horizontal overflow at all three viewports: PASS.
- No document-level vertical scrolling at 1536x900 and 1280x800 in the layout simulation: PASS.
- Mobile content scrolls vertically as needed; filter dialog fills viewport: PASS.

## Not completed here

- Full `npm run build` against npm dependencies: registry access timed out in the packaging environment.
- End-to-end app testing against the actual user's local server and source API: not run.
- Interactive React modal keyboard test: behavior implemented and requires a local app smoke test.
